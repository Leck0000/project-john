/**
 * LocalSocket — an in-browser WebSocket stand-in that speaks the server side of
 * the envelope contract (envelope.ts) and drives a SimEngine.
 *
 * Structurally satisfies the WSClient `SocketLike` interface. Everything is
 * delivered asynchronously (setTimeout 0, FIFO) like a real socket; `close()`
 * cancels every frame still pending. Frames crossing the boundary are
 * Zod-validated in both directions: invalid client frames are ignored and
 * server payloads that fail their schema are dropped.
 */

import type { ZodType } from 'zod';
import {
  WSEnvelopeSchema,
  SendCommandPayloadSchema,
  SessionInitPayloadSchema,
  StateDeltaPayloadSchema,
  CommandOutputPayloadSchema,
  TicketUpdatePayloadSchema,
  ScoringUpdatePayloadSchema,
  HeartbeatPayloadSchema,
  ServerEventType,
  ClientEventType,
} from './envelope';
import type { CommandResult, SimEngine, SubsystemUpdate } from '../../engine/types';

export class LocalSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState: number = LocalSocket.CONNECTING;
  binaryType: BinaryType = 'blob';
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;

  readonly url: string;
  private readonly engine: SimEngine;
  private readonly sessionId: string = crypto.randomUUID();
  private seq = 0;
  private readonly pending = new Set<ReturnType<typeof setTimeout>>();

  constructor(url: string, engine: SimEngine) {
    this.url = url;
    this.engine = engine;
    this.schedule(() => this.open());
  }

  send(data: string): void {
    if (this.readyState !== LocalSocket.OPEN) return;

    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      return;
    }
    const envelope = WSEnvelopeSchema.safeParse(raw);
    if (!envelope.success) return;

    switch (envelope.data.t) {
      case ClientEventType.SEND_COMMAND: {
        const payload = SendCommandPayloadSchema.safeParse(envelope.data.payload);
        if (payload.success) this.runCommand(payload.data.machineId, payload.data.command);
        return;
      }
      case ClientEventType.HEARTBEAT:
        this.emit(ServerEventType.HEARTBEAT, HeartbeatPayloadSchema, {});
        return;
      default:
        return;
    }
  }

  close(code?: number, reason?: string): void {
    if (this.readyState === LocalSocket.CLOSED) return;
    this.readyState = LocalSocket.CLOSED;
    for (const timer of this.pending) clearTimeout(timer);
    this.pending.clear();
    const event = { code: code ?? 1000, reason: reason ?? '', wasClean: true };
    setTimeout(() => this.onclose?.(event), 0);
  }

  private open(): void {
    this.readyState = LocalSocket.OPEN;
    this.onopen?.();
    // onopen may have closed the socket.
    if (this.readyState !== LocalSocket.OPEN) return;

    this.emit(ServerEventType.SESSION_INIT, SessionInitPayloadSchema, {
      sessionId: this.sessionId,
      userPrincipal: 'local-trainee',
      caps: ['local-sim'],
    });
    this.emitUpdates(this.engine.start());
  }

  private runCommand(machineId: string, command: string): void {
    let result: CommandResult;
    try {
      result = this.engine.handleCommand(machineId, command);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result = { output: `Engine error: ${message}`, exitCode: 1 };
    }

    const timestamp = new Date().toISOString();
    this.emit(ServerEventType.COMMAND_OUTPUT, CommandOutputPayloadSchema, {
      machineId,
      output: result.output,
      exitCode: result.exitCode,
      timestamp,
    });
    this.emitUpdates(result.updates ?? []);
    if (result.ticket) {
      this.emit(ServerEventType.TICKET_UPDATE, TicketUpdatePayloadSchema, {
        ticketId: result.ticket.ticketId,
        status: result.ticket.state,
        timestamp,
      });
    }
    if (result.scoring) {
      const { ticketId, score, feedback } = result.scoring;
      this.emit(ServerEventType.SCORING_UPDATE, ScoringUpdatePayloadSchema, {
        ticketId,
        score,
        ...(feedback !== undefined ? { feedback } : {}),
        timestamp,
      });
    }
  }

  private emitUpdates(updates: SubsystemUpdate[]): void {
    for (const { subsystem, value } of updates) {
      this.emit(ServerEventType.STATE_DELTA, StateDeltaPayloadSchema, {
        subsystem,
        path: '',
        op: 'set',
        value,
      });
    }
  }

  /** Validate a server payload, stamp the envelope, and deliver it asynchronously. */
  private emit<T>(t: ServerEventType, schema: ZodType<T>, payload: T): void {
    const checked = schema.safeParse(payload);
    if (!checked.success) return;
    this.seq += 1;
    const frame = { v: 1, t, sid: this.sessionId, seq: this.seq, ts: Date.now(), payload: checked.data };
    const data = JSON.stringify(frame);
    this.schedule(() => this.onmessage?.({ data }));
  }

  private schedule(fn: () => void): void {
    const timer = setTimeout(() => {
      this.pending.delete(timer);
      fn();
    }, 0);
    this.pending.add(timer);
  }
}

export function createLocalSocketFactory(engine: SimEngine): (url: string, protocols: string[]) => LocalSocket {
  return (url) => new LocalSocket(url, engine);
}
