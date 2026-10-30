/**
 * End-to-end over the local transport: real store + wsMiddleware + WSClient +
 * LocalSocket, with a fake SimEngine behind `local://sim`.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { wsMiddleware } from '../shared/middleware/wsMiddleware';
import { WSClient } from '../shared/ws/client';
import wsReducer from '../shared/ws/slice';
import { wsConnect, wsDisconnect, wsSend, createSendCommand, ClientEventType } from '../shared/ws/events';
import authReducer from '../features/auth/slice';
import ticketsReducer, { setQueue } from '../features/tickets/slice';
import desktopReducer from '../features/desktop/slice';
import scoresReducer from '../features/scoring/slice';
import { DEMO_TICKETS } from '../app/demo';
import { getEngine, setEngine } from './index';
import type { CommandResult, SimEngine, SubsystemUpdate } from './types';

const HR02 = '3e1a0c2b-7d4f-4a6e-9b8c-5d2f1e0a7b03';
const hr02Ticket = DEMO_TICKETS.find((t) => t.relatedMachineId === HR02);
if (!hr02Ticket) throw new Error('no DEMO_TICKETS entry for ws-hr-02');
const ticketId = hr02Ticket.id;

const START_SERVICES = [{ name: 'Spooler', status: 'stopped' }];
const UPDATED_SERVICES = [{ name: 'Spooler', status: 'running' }];

function createFakeEngine() {
  const calls = { start: 0, handleCommand: 0 };
  const engine: SimEngine = {
    start(): SubsystemUpdate[] {
      calls.start += 1;
      return [{ subsystem: 'services', value: START_SERVICES }];
    },
    handleCommand(): CommandResult {
      calls.handleCommand += 1;
      return {
        output: 'OK',
        exitCode: 0,
        updates: [{ subsystem: 'services', value: UPDATED_SERVICES }],
        ticket: { ticketId, state: 'resolved' },
        scoring: { ticketId, score: 80, feedback: 'read log first' },
      };
    },
  };
  return { engine, calls };
}

function setup() {
  const fake = createFakeEngine();
  setEngine(fake.engine);
  const store = configureStore({
    reducer: {
      ws: wsReducer,
      auth: authReducer,
      tickets: ticketsReducer,
      desktop: desktopReducer,
      scores: scoresReducer,
    },
    middleware: (gdm) => gdm({ serializableCheck: false }).concat(wsMiddleware),
  });
  store.dispatch(setQueue(DEMO_TICKETS));
  store.dispatch(wsConnect({ url: 'local://sim' }));
  return { store, ...fake };
}

describe('local sim session', () => {
  afterEach(() => {
    WSClient.resetInstance();
    setEngine(null);
  });

  it('connects and seeds panels', async () => {
    const { store } = setup();
    await vi.waitFor(() => {
      expect(store.getState().ws.connected).toBe(true);
      expect(store.getState().desktop.subsystems.services).toEqual(START_SERVICES);
    });
  });

  it('command round trip', async () => {
    const { store } = setup();
    await vi.waitFor(() => expect(store.getState().ws.connected).toBe(true));

    store.dispatch(wsSend({ type: ClientEventType.SEND_COMMAND, payload: createSendCommand(HR02, 'sc start spooler') }));

    await vi.waitFor(() => {
      const state = store.getState();
      expect(state.desktop.terminalOutput[HR02]?.join('')).toContain('OK');
      expect(state.desktop.subsystems.services).toEqual(UPDATED_SERVICES);
      expect(state.tickets.queue.find((t) => t.id === ticketId)?.state).toBe('resolved');
      expect(state.scores.technical).toBe(80);
      expect(state.scores.feedback).toBe('read log first');
    });
  });

  it('reconnect keeps engine state', async () => {
    const { store, engine, calls } = setup();
    await vi.waitFor(() => expect(store.getState().ws.connected).toBe(true));
    store.dispatch(wsSend({ type: ClientEventType.SEND_COMMAND, payload: createSendCommand(HR02, 'sc start spooler') }));
    await vi.waitFor(() => expect(calls.handleCommand).toBe(1));

    store.dispatch(wsDisconnect());
    store.dispatch(wsConnect({ url: 'local://sim' }));
    await vi.waitFor(() => {
      expect(store.getState().ws.connected).toBe(true);
      expect(calls.start).toBe(2);
    });

    expect(getEngine()).toBe(engine);
    expect(calls.handleCommand).toBe(1);
  });
});
