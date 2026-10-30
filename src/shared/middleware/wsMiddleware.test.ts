/**
 * wsMiddleware integration test: a ws/send command must reach the socket
 * exactly once. WSClient.send() reports success as ws/sent (a notification),
 * never as ws/send (the command), so the middleware cannot re-enter itself.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { configureStore, type UnknownAction } from '@reduxjs/toolkit';
import { wsMiddleware } from './wsMiddleware';
import { WSClient } from '../ws/client';
import { wsConnect, wsSend, createSendCommand, ClientEventType, WSActionType } from '../ws/events';
import { FakeSocket } from '../../test/fakeWebSocket';
import communicationReducer from '../../features/communication/slice';
import ticketsReducer, { setQueue } from '../../features/tickets/slice';
import { DEMO_TICKETS } from '../../app/demo';

describe('wsMiddleware send path', () => {
  afterEach(() => {
    WSClient.resetInstance();
    vi.unstubAllGlobals();
  });

  it('writes one frame per ws/send and dispatches ws/sent, not ws/send', () => {
    vi.stubGlobal('WebSocket', FakeSocket);
    const seen: string[] = [];
    const recorder = () => (next: (a: unknown) => unknown) => (action: unknown) => {
      seen.push((action as UnknownAction).type);
      return next(action);
    };
    const store = configureStore({
      reducer: { auth: (state: { accessToken?: string } = {}) => state },
      middleware: (gdm) => gdm({ serializableCheck: false }).concat(recorder, wsMiddleware),
    });

    store.dispatch(wsConnect({ url: 'ws://test/ws' }));
    const socket = FakeSocket.last;
    expect(socket).not.toBeNull();

    store.dispatch(
      wsSend({ type: ClientEventType.SEND_COMMAND, payload: createSendCommand('m1', 'ipconfig') })
    );

    expect(socket?.send).toHaveBeenCalledTimes(1);
    expect(seen.filter((t) => t === WSActionType.SEND)).toHaveLength(1);
    expect(seen).toContain(WSActionType.SENT);
  });

  it('forwards every client event type, not just send_command', () => {
    vi.stubGlobal('WebSocket', FakeSocket);
    const store = configureStore({
      reducer: { auth: (state: { accessToken?: string } = {}) => state },
      middleware: (gdm) => gdm({ serializableCheck: false }).concat(wsMiddleware),
    });
    store.dispatch(wsConnect({ url: 'ws://test/ws' }));
    const ticketId = '1b84c7d2-9b0e-4527-bd82-ef0c2f5b6a1d';
    store.dispatch(wsSend({ type: ClientEventType.ADD_TICKET_MESSAGE, payload: { ticketId, message: 'hi' } }));
    store.dispatch(wsSend({ type: ClientEventType.CLAIM_TICKET, payload: { ticketId } }));
    expect(FakeSocket.last?.frames().map((f) => f.t)).toEqual(['add_ticket_message', 'claim_ticket']);
  });

  it('routes a requester_message frame into the ticket thread and acks it', () => {
    vi.stubGlobal('WebSocket', FakeSocket);
    const store = configureStore({
      reducer: { auth: (state: { accessToken?: string } = {}) => state, communication: communicationReducer },
      middleware: (gdm) => gdm({ serializableCheck: false }).concat(wsMiddleware),
    });
    store.dispatch(wsConnect({ url: 'ws://test/ws' }));
    const socket = FakeSocket.last;
    const ticketId = '1b84c7d2-9b0e-4527-bd82-ef0c2f5b6a1d';
    socket?.receive('requester_message', { ticketId, from: 'requester', message: 'Still down', timestamp: '2026-10-29T10:00:00Z' }, 5);
    expect(store.getState().communication.threads[ticketId]?.messages[0]).toMatchObject({ from: 'requester', text: 'Still down' });
    expect(socket?.frames()).toContainEqual(expect.objectContaining({ t: 'client.ack', payload: { seq: 5 } }));
  });

  describe('ticket_update', () => {
    const ticketId = DEMO_TICKETS[0]!.id;
    const setup = () => {
      vi.stubGlobal('WebSocket', FakeSocket);
      const store = configureStore({
        reducer: { auth: (state: { accessToken?: string } = {}) => state, tickets: ticketsReducer },
        middleware: (gdm) => gdm({ serializableCheck: false }).concat(wsMiddleware),
      });
      store.dispatch(setQueue(DEMO_TICKETS));
      store.dispatch(wsConnect({ url: 'ws://test/ws' }));
      return { store, socket: FakeSocket.last };
    };
    const stateOf = (store: ReturnType<typeof setup>['store']) =>
      store.getState().tickets.queue.find((t) => t.id === ticketId)?.state;

    it('merges a valid status into the queued ticket', () => {
      const { store, socket } = setup();
      socket?.receive('ticket_update', { ticketId, status: 'resolved', timestamp: '2026-10-30T10:00:00Z' }, 2);
      expect(stateOf(store)).toBe('resolved');
    });

    it('ignores a status that is not a ticket state', () => {
      const { store, socket } = setup();
      const before = stateOf(store);
      socket?.receive('ticket_update', { ticketId, status: 'banana', timestamp: '2026-10-30T10:00:00Z' }, 2);
      expect(stateOf(store)).toBe(before);
    });
  });
});
