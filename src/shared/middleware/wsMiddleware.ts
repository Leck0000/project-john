import type { Middleware } from '@reduxjs/toolkit';
import { z } from 'zod';
import { WSClient } from '../ws/client';
import { createLocalSocketFactory } from '../ws/localSocket';
import { getEngine } from '../../engine';
import {
  isWSAction,
  isWSMessageAction,
  wsSendFailed,
  WSActionType,
  type WSConnectPayload,
  type WSSendPayload,
} from '../ws/events';
import {
  ServerEventType,
  ScoringUpdatePayloadSchema,
  CommandOutputPayloadSchema,
  StateDeltaPayloadSchema,
  RequesterMessagePayloadSchema,
  TicketUpdatePayloadSchema,
} from '../ws/envelope';
import { appendTerminalOutput, applyStateDelta } from '../../features/desktop/slice';
import { receiveRequesterMessage } from '../../features/communication/slice';
import { mergeTicketUpdate } from '../../features/tickets/slice';

/** ticket_update payload whose status is one of the five ticket states. */
const TicketUpdateSchema = TicketUpdatePayloadSchema.extend({
  status: z.enum(['open', 'in_progress', 'on_hold', 'resolved', 'closed']),
});

/** URLs with this prefix run over the in-browser sim engine instead of a WebSocket. */
const LOCAL_URL_PREFIX = 'local:';

// WebSocket middleware: intercepts Redux WS actions and manages the
// single WebSocket connection via WSClient. All WebSocket messages go
// through this middleware (single source of truth).
// Based on ARCHITECTURE.md section 4.5 WebSocket Event Schema.

/** Client created on the first ws/connect; null until then. */
let client: WSClient | null = null;

export const wsMiddleware: Middleware = (store) => (next) => (action) => {
  const result = next(action);

  if (isWSAction(action) && action.type === WSActionType.CONNECT) {
    const { url, accessToken, protocols } = action.payload as WSConnectPayload;
    client = WSClient.getInstance(
      url.startsWith(LOCAL_URL_PREFIX)
        ? { url, accessToken, protocols, createSocket: createLocalSocketFactory(getEngine()) }
        : { url, accessToken, protocols }
    );
    client.setStore(store.dispatch, store.getState);
    client.connect().catch(() => {
      // Connection failure — already dispatched by WSClient (ws/error)
    });
  }

  if (isWSAction(action) && action.type === WSActionType.DISCONNECT) {
    client?.disconnect();
  }

  if (isWSAction(action) && action.type === WSActionType.SEND) {
    const { type, payload } = action.payload as WSSendPayload;
    if (client) {
      try {
        client.send(type, payload);
      } catch (err) {
        // On a closed socket send() throws and has already dispatched
        // ws/send_failed itself; report anything else.
        if (client.isConnected()) {
          store.dispatch(
            wsSendFailed({ type, payload, error: err instanceof Error ? err.message : String(err) })
          );
        }
      }
    }
  }

  // Handle incoming ws/message — redistribute to appropriate listeners
  if (isWSMessageAction(action)) {
    const { envelope } = action.payload;
    if (envelope.t === ServerEventType.COMMAND_OUTPUT) {
      const parsed = CommandOutputPayloadSchema.safeParse(envelope.payload);
      if (parsed.success) {
        const { machineId, output } = parsed.data;
        store.dispatch(appendTerminalOutput({ machineId, output }));
      }
    }
    if (envelope.t === ServerEventType.STATE_DELTA) {
      const parsed = StateDeltaPayloadSchema.safeParse(envelope.payload);
      if (parsed.success) {
        const { subsystem, op, value } = parsed.data;
        store.dispatch(applyStateDelta({ subsystem, op, value }));
      }
    }
    if (envelope.t === ServerEventType.TICKET_UPDATE) {
      const parsed = TicketUpdateSchema.safeParse(envelope.payload);
      if (parsed.success) {
        store.dispatch(mergeTicketUpdate(parsed.data));
      }
    }
    if (envelope.t === ServerEventType.SCORING_UPDATE) {
      const scoringUpdate = ScoringUpdatePayloadSchema.safeParse(envelope.payload);
      if (scoringUpdate.success) {
        store.dispatch({
          type: 'scores/mergeScoringUpdate',
          payload: scoringUpdate.data,
        });
      }
    }
    if (envelope.t === ServerEventType.REQUESTER_MESSAGE) {
      const parsed = RequesterMessagePayloadSchema.safeParse(envelope.payload);
      if (parsed.success) {
        store.dispatch(receiveRequesterMessage(parsed.data));
      }
    }
  }

  return result;
};
