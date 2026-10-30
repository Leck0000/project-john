/**
 * WebSocket client: connection lifecycle, heartbeat, seq acknowledgment, reconnection.
 *
 * Protocol (ARCHITECTURE.md §5.6):
 * - every server frame carries a `seq`; the client acks it with `client.ack { seq }`
 *   (the server retransmits on gaps);
 * - `heartbeat {}` flows both ways;
 * - the server does NOT ack client frames, so client sends are fire-and-forget and
 *   are never retransmitted (a retransmitted `send_command` would run twice).
 *
 * Singleton; integrates with Redux via wsMiddleware (single source of truth).
 */

import type { UnknownAction } from '@reduxjs/toolkit';
import type { WSEnvelope, ClientToServerPayload, ServerToClientPayload } from './envelope';
import { parseEnvelope, createEnvelope, SessionInitPayloadSchema } from './envelope';
import {
  wsConnected,
  wsDisconnected,
  wsReconnecting,
  wsReconnectFailed,
  wsSent,
  wsMessage,
  wsSendFailed,
  wsHeartbeatSent,
  wsHeartbeatReceived,
  wsHeartbeatMissed,
  wsAckSent,
  wsError,
  ServerEventType,
  ClientEventType,
} from './events';

/** The subset of the WebSocket API that WSClient uses (real sockets and LocalSocket). */
export interface SocketLike {
  readonly readyState: number;
  binaryType: BinaryType;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null;
}

/** Configuration options for WSClient */
export interface WSClientConfig {
  /** WebSocket server URL */
  url: string;
  /** Access token for authentication */
  accessToken?: string;
  /** WebSocket subprotocols */
  protocols?: string[];
  /** Heartbeat interval in milliseconds (default: 30000) */
  heartbeatInterval?: number;
  /** Max missed heartbeats before the connection is dropped (default: 3) */
  maxMissedHeartbeats?: number;
  /** Reconnection base delay in ms (default: 1000) */
  reconnectBaseDelay?: number;
  /** Max reconnection delay in ms (default: 30000) */
  reconnectMaxDelay?: number;
  /** Max reconnection attempts (default: 10) */
  maxReconnectAttempts?: number;
  /** Socket factory (default: `new WebSocket(url, protocols)`); inject LocalSocket for the in-browser sim. */
  createSocket?: (url: string, protocols: string[]) => SocketLike;
}

type ResolvedConfig = Required<Omit<WSClientConfig, 'accessToken' | 'createSocket'>> &
  Pick<WSClientConfig, 'accessToken' | 'createSocket'>;

/**
 * Default factory. DOM handler types declare a `this: WebSocket` parameter and
 * DOM event types, which TS does not treat as assignable to SocketLike's plain
 * handler fields; the runtime shape is compatible, hence the cast.
 */
const createWebSocket = (url: string, protocols: string[]): SocketLike =>
  new WebSocket(url, protocols) as unknown as SocketLike;

const DEFAULT_CONFIG: Omit<ResolvedConfig, 'url'> = {
  protocols: [],
  heartbeatInterval: 30_000,
  maxMissedHeartbeats: 3,
  reconnectBaseDelay: 1_000,
  reconnectMaxDelay: 30_000,
  maxReconnectAttempts: 10,
};

/** Close code used when heartbeats stop (1006 is reserved and throws in browsers). */
export const HEARTBEAT_TIMEOUT_CLOSE_CODE = 4000;

/** Events emitted by WSClient and their listener arguments. */
export interface WSClientEvents {
  open: [sessionId: string, capabilities: string[]];
  error: [error: Error];
  close: [code: number, reason: string, wasClean: boolean];
  message: [envelope: WSEnvelope<ServerToClientPayload>, rawData: string];
  reconnecting: [attempt: number, nextRetryMs: number];
  reconnect_failed: [];
}

type Listener<E extends keyof WSClientEvents> = (...args: WSClientEvents[E]) => void;

/** Minimal typed event emitter. */
class EventEmitter {
  private listeners: { [E in keyof WSClientEvents]?: Array<Listener<E>> } = {};

  on<E extends keyof WSClientEvents>(event: E, listener: Listener<E>): void {
    const list: Array<Listener<E>> = this.listeners[event] ?? [];
    list.push(listener);
    this.listeners[event] = list as (typeof this.listeners)[E];
  }

  off<E extends keyof WSClientEvents>(event: E, listener: Listener<E>): void {
    const list: Array<Listener<E>> | undefined = this.listeners[event];
    const idx = list?.indexOf(listener) ?? -1;
    if (list && idx >= 0) list.splice(idx, 1);
  }

  emit<E extends keyof WSClientEvents>(event: E, ...args: WSClientEvents[E]): void {
    const list: Array<Listener<E>> | undefined = this.listeners[event];
    // copy: listeners may remove themselves while being called
    list?.slice().forEach((l) => l(...args));
  }

  removeAllListeners(): void {
    this.listeners = {};
  }
}

/** WSClient — singleton WebSocket client. */
export class WSClient extends EventEmitter {
  private static instance: WSClient | null = null;
  private ws: SocketLike | null = null;
  private config: ResolvedConfig;
  private sessionId: string | null = null;
  private seq = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private missedHeartbeats = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  private isIntentionalDisconnect = false;
  private dispatch: ((action: UnknownAction) => void) | null = null;
  private getState: (() => { auth: { accessToken?: string | null } }) | null = null;

  private constructor(config: WSClientConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Get the singleton instance; config is required on first call. */
  static getInstance(config?: WSClientConfig): WSClient {
    if (!WSClient.instance) {
      if (!config) {
        throw new Error('WSClient not initialized. Provide config on first call.');
      }
      WSClient.instance = new WSClient(config);
    } else if (config) {
      WSClient.instance.config = { ...DEFAULT_CONFIG, ...config };
    }
    return WSClient.instance;
  }

  /** Destroy and forget the singleton (tests, logout). */
  static resetInstance(): void {
    WSClient.instance?.destroy();
    WSClient.instance = null;
  }

  /** Wire Redux dispatch/getState (called by wsMiddleware). */
  setStore(
    dispatch: (action: UnknownAction) => void,
    getState: () => { auth: { accessToken?: string | null } }
  ): void {
    this.dispatch = dispatch;
    this.getState = getState;
  }

  /** Connect; resolves when the server's session.init arrives. */
  connect(): Promise<{ sessionId: string; capabilities: string[] }> {
    if (this.ws?.readyState === WebSocket.OPEN && this.sessionId) {
      return Promise.resolve({ sessionId: this.sessionId, capabilities: [] });
    }

    const settled = new Promise<{ sessionId: string; capabilities: string[] }>((resolve, reject) => {
      const onOpen: Listener<'open'> = (sessionId, capabilities) => {
        this.off('open', onOpen);
        this.off('error', onError);
        resolve({ sessionId, capabilities });
      };
      const onError: Listener<'error'> = (error) => {
        this.off('open', onOpen);
        this.off('error', onError);
        reject(error);
      };
      this.on('open', onOpen);
      this.on('error', onError);
    });

    if (this.isConnecting) return settled;

    this.isConnecting = true;
    this.isIntentionalDisconnect = false;
    const token = this.getState?.().auth.accessToken ?? this.config.accessToken ?? undefined;

    try {
      const ws = (this.config.createSocket ?? createWebSocket)(this.buildUrl(token), this.config.protocols);
      this.ws = ws;
      ws.binaryType = 'arraybuffer';
      // After disconnect() + connect(), events from the replaced socket must not touch the new one.
      // (After a plain disconnect() this.ws is null and the close is still reported.)
      const isStale = (): boolean => this.ws !== null && this.ws !== ws;

      ws.onopen = () => {
        if (isStale()) return;
        this.isConnecting = false;
        this.reconnectAttempt = 0;
        this.startHeartbeat();
        if (token) this.send(ClientEventType.AUTHENTICATE, { token });
      };

      ws.onclose = (event) => {
        if (isStale()) return;
        this.isConnecting = false;
        this.stopHeartbeat();
        // Closed before session.init: settle the pending connect() instead of leaking it.
        const wasEstablished = this.sessionId !== null;
        this.sessionId = null;
        if (!wasEstablished && !this.isIntentionalDisconnect) this.emit('error', new Error(`Connection closed (${event.code})`));
        this.emit('close', event.code, event.reason, event.wasClean);
        this.dispatch?.(wsDisconnected({ code: event.code, reason: event.reason, wasClean: event.wasClean }));

        if (this.isIntentionalDisconnect) return;
        if (this.reconnectAttempt < this.config.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          this.emit('reconnect_failed');
          this.dispatch?.(wsReconnectFailed({ maxAttempts: this.config.maxReconnectAttempts }));
        }
      };

      ws.onerror = () => {
        if (isStale()) return;
        this.isConnecting = false;
        this.emit('error', new Error('WebSocket error'));
      };

      ws.onmessage = (event) => {
        if (isStale()) return;
        this.handleMessage(event.data);
      };
    } catch (error) {
      this.isConnecting = false;
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }

    return settled;
  }

  /** Disconnect without reconnecting. */
  disconnect(code = 1000, reason = 'Client disconnect'): void {
    this.isIntentionalDisconnect = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.close(code, reason);
    }
    this.ws = null;
    this.sessionId = null;
  }

  /**
   * Write one frame. Fire-and-forget: the protocol has no server ack for client
   * frames. Throws (after dispatching ws/send_failed) if the socket is not open.
   */
  send<T extends ClientToServerPayload>(type: ClientEventType, payload: T): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      const error = new Error('WebSocket not connected');
      this.dispatch?.(wsSendFailed({ type, payload, error: error.message }));
      throw error;
    }
    const envelope = createEnvelope(type, payload, this.sessionId ?? '', ++this.seq);
    this.ws.send(JSON.stringify(envelope));
    this.dispatch?.(wsSent({ type, payload }));
  }

  /** Acknowledge a server frame. No-op while disconnected (the server retransmits). */
  ack(seq: number): void {
    if (!this.isConnected()) return;
    this.send(ClientEventType.CLIENT_ACK, { seq });
    this.dispatch?.(wsAckSent({ seq: this.seq, acknowledgedSeq: seq }));
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Update the access token (auth refresh) and re-authenticate if connected. */
  updateAccessToken(token: string): void {
    this.config.accessToken = token;
    if (this.isConnected()) this.send(ClientEventType.AUTHENTICATE, { token });
  }

  destroy(): void {
    this.disconnect(1001, 'Client destroyed');
    this.removeAllListeners();
  }

  private buildUrl(token?: string): string {
    const url = new URL(this.config.url);
    if (token) url.searchParams.set('token', token);
    return url.toString();
  }

  private handleMessage(data: string | ArrayBuffer): void {
    const rawData = typeof data === 'string' ? data : new TextDecoder().decode(data);

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      this.dispatch?.(wsError({ message: 'Invalid JSON received', code: 'PARSE_ERROR', recoverable: true }));
      return;
    }

    const envelope = parseEnvelope<ServerToClientPayload>(parsed);
    if (!envelope) {
      this.dispatch?.(wsError({ message: 'Invalid envelope format', code: 'INVALID_ENVELOPE', recoverable: true }));
      return;
    }

    switch (envelope.t) {
      case ServerEventType.SESSION_INIT: {
        const init = SessionInitPayloadSchema.safeParse(envelope.payload);
        if (!init.success) {
          this.dispatch?.(wsError({ message: 'Invalid session.init payload', code: 'INVALID_SESSION_INIT', recoverable: false }));
          return;
        }
        this.sessionId = init.data.sessionId;
        this.emit('open', init.data.sessionId, init.data.caps);
        this.dispatch?.(wsConnected({ sessionId: init.data.sessionId, capabilities: init.data.caps }));
        break;
      }

      case ServerEventType.HEARTBEAT: {
        this.missedHeartbeats = 0;
        this.dispatch?.(wsHeartbeatReceived({ timestamp: envelope.ts }));
        break;
      }

      default: {
        this.dispatch?.(wsMessage({ envelope, rawData }));
        this.emit('message', envelope, rawData);
      }
    }

    this.ack(envelope.seq);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.missedHeartbeats = 0;
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private sendHeartbeat(): void {
    if (!this.isConnected()) return;

    this.send(ClientEventType.HEARTBEAT, {});
    this.dispatch?.(wsHeartbeatSent({ timestamp: Date.now() }));
    this.missedHeartbeats++;

    if (this.missedHeartbeats > this.config.maxMissedHeartbeats) {
      this.dispatch?.(wsHeartbeatMissed({ missedCount: this.missedHeartbeats }));
      this.stopHeartbeat();
      this.ws?.close(HEARTBEAT_TIMEOUT_CLOSE_CODE, 'Heartbeat timeout');
    }
  }

  /** Schedule reconnection with exponential backoff and jitter. */
  private scheduleReconnect(): void {
    const delay = Math.min(
      this.config.reconnectBaseDelay * Math.pow(2, this.reconnectAttempt),
      this.config.reconnectMaxDelay
    );
    const nextRetryMs = Math.floor(delay + delay * 0.1 * Math.random());

    this.reconnectAttempt++;
    this.emit('reconnecting', this.reconnectAttempt, nextRetryMs);
    this.dispatch?.(
      wsReconnecting({ attempt: this.reconnectAttempt, maxAttempts: this.config.maxReconnectAttempts, nextRetryMs })
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // failure is reported via onclose -> next scheduleReconnect / reconnect_failed
      });
    }, nextRetryMs);
  }
}

export { parseEnvelope, createEnvelope } from './envelope';
export type { WSEnvelope, ClientToServerPayload, ServerToClientPayload } from './envelope';
