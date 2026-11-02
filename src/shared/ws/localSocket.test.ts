/**
 * LocalSocket tests: a WebSocket stand-in that speaks the server side of the
 * envelope contract to a SimEngine. Delivery is asynchronous, so tests use
 * real timers with `vi.waitFor`.
 */
import { describe, it, expect, vi } from 'vitest';
import { LocalSocket, createLocalSocketFactory } from './localSocket';
import {
  WSEnvelopeSchema,
  SessionInitPayloadSchema,
  StateDeltaPayloadSchema,
  CommandOutputPayloadSchema,
  TicketUpdatePayloadSchema,
  ScoringUpdatePayloadSchema,
  HeartbeatPayloadSchema,
  ClientEventType,
} from './envelope';
import type { CommandResult, SimEngine, SubsystemUpdate } from '../../engine/types';

const MACHINE_ID = '3e1a0c2b-7d4f-4a6e-9b8c-5d2f1e0a7b03'; // ws-hr-02
const TICKET_ID = '9c2d4e6f-1a3b-4c5d-8e7f-0a1b2c3d4e5f';
const CLIENT_SID = '1b84c7d2-9b0e-4527-bd82-ef0c2f5b6a1d';

interface Frame {
  v: 1;
  t: string;
  sid: string;
  seq: number;
  ts: number;
  payload: unknown;
}

function fakeEngine(
  start: SubsystemUpdate[] = [],
  handle: (machineId: string, command: string) => CommandResult = () => ({ output: '', exitCode: 0 }),
) {
  const engine = {
    start: vi.fn(() => start),
    handleCommand: vi.fn(handle),
  };
  return engine satisfies SimEngine;
}

function attach(socket: LocalSocket): Frame[] {
  const frames: Frame[] = [];
  socket.onmessage = (event) => {
    const parsed = WSEnvelopeSchema.parse(JSON.parse(String(event.data)));
    frames.push(parsed as Frame);
  };
  return frames;
}

let clientSeq = 0;
function clientFrame(t: string, payload: unknown): string {
  clientSeq += 1;
  return JSON.stringify({ v: 1, t, sid: CLIENT_SID, seq: clientSeq, ts: Date.now(), payload });
}

/** Open a socket and wait until session.init + start() deltas have arrived. */
async function openSocket(engine: SimEngine, startCount = 0) {
  const socket = new LocalSocket('local://sim', engine);
  const frames = attach(socket);
  await vi.waitFor(() => expect(frames.length).toBe(1 + startCount));
  frames.length = 0;
  return { socket, frames };
}

/** Give scheduled callbacks a chance to run, to prove nothing arrives. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('LocalSocket', () => {
  it('opens asynchronously', async () => {
    const socket = new LocalSocket('local://sim', fakeEngine());
    const onopen = vi.fn();
    socket.onopen = onopen;
    expect(socket.readyState).toBe(LocalSocket.CONNECTING);
    expect(onopen).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(onopen).toHaveBeenCalledTimes(1));
    expect(socket.readyState).toBe(LocalSocket.OPEN);
  });

  it('sends session.init then one state.delta per start() entry', async () => {
    const engine = fakeEngine([
      { subsystem: 'printSpooler', value: { status: 'stopped' } },
      { subsystem: 'services', value: ['a', 'b'] },
    ]);
    const socket = new LocalSocket('local://sim', engine);
    const frames = attach(socket);
    await vi.waitFor(() => expect(frames.length).toBe(3));

    const [init, d1, d2] = frames;
    expect(init?.t).toBe('session.init');
    const initPayload = SessionInitPayloadSchema.parse(init?.payload);
    expect(initPayload).toMatchObject({ userPrincipal: 'local-trainee', caps: ['local-sim'] });
    expect(frames.every((f) => f.sid === initPayload.sessionId)).toBe(true);

    expect(d1?.t).toBe('state.delta');
    expect(StateDeltaPayloadSchema.parse(d1?.payload)).toEqual({
      subsystem: 'printSpooler',
      path: '',
      op: 'set',
      value: { status: 'stopped' },
    });
    expect(d2?.t).toBe('state.delta');
    expect(StateDeltaPayloadSchema.parse(d2?.payload)).toMatchObject({ subsystem: 'services', value: ['a', 'b'] });

    expect(frames.map((f) => f.seq)).toEqual([1, 2, 3]);
  });

  it('send_command → frames in order', async () => {
    const engine = fakeEngine([], () => ({
      output: 'Print Spooler started.',
      exitCode: 0,
      updates: [{ subsystem: 'printSpooler', value: { status: 'running' } }],
      ticket: { ticketId: TICKET_ID, state: 'resolved' },
      scoring: { ticketId: TICKET_ID, score: 90, feedback: 'Nice' },
    }));
    const { socket, frames } = await openSocket(engine);

    socket.send(clientFrame(ClientEventType.SEND_COMMAND, { machineId: MACHINE_ID, command: 'net start spooler' }));
    await vi.waitFor(() => expect(frames.length).toBe(4));

    expect(engine.handleCommand).toHaveBeenCalledWith(MACHINE_ID, 'net start spooler');
    expect(frames.map((f) => f.t)).toEqual(['command_output', 'state.delta', 'ticket_update', 'scoring_update']);
    expect(CommandOutputPayloadSchema.parse(frames[0]?.payload)).toMatchObject({
      machineId: MACHINE_ID,
      output: 'Print Spooler started.',
      exitCode: 0,
    });
    expect(StateDeltaPayloadSchema.parse(frames[1]?.payload)).toMatchObject({
      subsystem: 'printSpooler',
      path: '',
      op: 'set',
      value: { status: 'running' },
    });
    const ticket = TicketUpdatePayloadSchema.parse(frames[2]?.payload);
    expect(ticket.status).toBe('resolved');
    expect(ticket.ticketId).toBe(TICKET_ID);
    expect(ScoringUpdatePayloadSchema.parse(frames[3]?.payload)).toMatchObject({
      ticketId: TICKET_ID,
      score: 90,
      feedback: 'Nice',
    });
    const seqs = frames.map((f) => f.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });

  it('heartbeat is answered', async () => {
    const engine = fakeEngine();
    const { socket, frames } = await openSocket(engine);
    socket.send(clientFrame(ClientEventType.HEARTBEAT, {}));
    await vi.waitFor(() => expect(frames.length).toBe(1));
    expect(frames[0]?.t).toBe('heartbeat');
    expect(HeartbeatPayloadSchema.parse(frames[0]?.payload)).toEqual({});
  });

  it('client.ack is ignored', async () => {
    const engine = fakeEngine();
    const { socket, frames } = await openSocket(engine);
    socket.send(clientFrame(ClientEventType.CLIENT_ACK, { seq: 1 }));
    await settle();
    expect(frames).toHaveLength(0);
    expect(engine.handleCommand).not.toHaveBeenCalled();
  });

  it('engine throw → exitCode 1, session stays open', async () => {
    let calls = 0;
    const engine = fakeEngine([], () => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
      return { output: 'ok', exitCode: 0 };
    });
    const { socket, frames } = await openSocket(engine);

    socket.send(clientFrame(ClientEventType.SEND_COMMAND, { machineId: MACHINE_ID, command: 'x' }));
    await vi.waitFor(() => expect(frames.length).toBe(1));
    expect(frames[0]?.t).toBe('command_output');
    expect(CommandOutputPayloadSchema.parse(frames[0]?.payload)).toMatchObject({
      output: 'Engine error: boom',
      exitCode: 1,
    });
    expect(socket.readyState).toBe(LocalSocket.OPEN);

    socket.send(clientFrame(ClientEventType.SEND_COMMAND, { machineId: MACHINE_ID, command: 'y' }));
    await vi.waitFor(() => expect(frames.length).toBe(2));
    expect(CommandOutputPayloadSchema.parse(frames[1]?.payload)).toMatchObject({ output: 'ok', exitCode: 0 });
  });

  it('engine non-Error throw still gives a readable message', async () => {
    const engine = fakeEngine([], () => {
      throw 'plain string';
    });
    const { socket, frames } = await openSocket(engine);
    socket.send(clientFrame(ClientEventType.SEND_COMMAND, { machineId: MACHINE_ID, command: 'x' }));
    await vi.waitFor(() => expect(frames.length).toBe(1));
    expect(CommandOutputPayloadSchema.parse(frames[0]?.payload).output).toBe('Engine error: plain string');
  });

  it('invalid engine command result → Engine error command_output, not silence', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const engine = fakeEngine([], () => ({ output: 'half', exitCode: 0.5 }));
      const { socket, frames } = await openSocket(engine);
      socket.send(clientFrame(ClientEventType.SEND_COMMAND, { machineId: MACHINE_ID, command: 'x' }));
      await vi.waitFor(() => expect(frames.length).toBe(1));
      expect(frames[0]?.t).toBe('command_output');
      const payload = CommandOutputPayloadSchema.parse(frames[0]?.payload);
      expect(payload.machineId).toBe(MACHINE_ID);
      expect(payload.exitCode).toBe(1);
      expect(payload.output).toMatch(/^Engine error: invalid result: /);
      expect(payload.output).toContain('exitCode');
      expect(errorSpy).toHaveBeenCalled();
      expect(socket.readyState).toBe(LocalSocket.OPEN);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('non-UUID ticketId is reported via console.error, other frames still arrive', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const engine = fakeEngine([], () => ({
        output: 'done',
        exitCode: 0,
        ticket: { ticketId: 'TKT-1', state: 'resolved' },
      }));
      const { socket, frames } = await openSocket(engine);
      socket.send(clientFrame(ClientEventType.SEND_COMMAND, { machineId: MACHINE_ID, command: 'x' }));
      await vi.waitFor(() => expect(frames.length).toBe(1));
      await settle();
      expect(frames.map((f) => f.t)).toEqual(['command_output']);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('ticket_update'), expect.anything());
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('start() throwing → session.init still sent, no state.delta, console.error, commands still work', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const engine = {
        start: vi.fn((): SubsystemUpdate[] => {
          throw new Error('bad snapshot');
        }),
        handleCommand: vi.fn((): CommandResult => ({ output: 'ok', exitCode: 0 })),
      } satisfies SimEngine;
      const socket = new LocalSocket('local://sim', engine);
      const frames = attach(socket);
      await vi.waitFor(() => expect(frames.length).toBe(1));
      await settle();
      expect(frames.map((f) => f.t)).toEqual(['session.init']);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('engine.start() threw: bad snapshot'));
      expect(socket.readyState).toBe(LocalSocket.OPEN);

      frames.length = 0;
      socket.send(clientFrame(ClientEventType.SEND_COMMAND, { machineId: MACHINE_ID, command: 'x' }));
      await vi.waitFor(() => expect(frames.length).toBe(1));
      expect(frames[0]?.t).toBe('command_output');
      expect(CommandOutputPayloadSchema.parse(frames[0]?.payload)).toMatchObject({ output: 'ok', exitCode: 0 });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('out-of-range score (150) is dropped with console.error; other frames still arrive', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const engine = fakeEngine([], () => ({
        output: 'done',
        exitCode: 0,
        scoring: { ticketId: TICKET_ID, score: 150 },
      }));
      const { socket, frames } = await openSocket(engine);
      socket.send(clientFrame(ClientEventType.SEND_COMMAND, { machineId: MACHINE_ID, command: 'x' }));
      await vi.waitFor(() => expect(frames.length).toBe(1));
      await settle();
      expect(frames.map((f) => f.t)).toEqual(['command_output']);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('scoring_update'), expect.anything());
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('non-integer score (42.5) is dropped too', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const engine = fakeEngine([], () => ({
        output: 'done',
        exitCode: 0,
        scoring: { ticketId: TICKET_ID, score: 42.5 },
      }));
      const { socket, frames } = await openSocket(engine);
      socket.send(clientFrame(ClientEventType.SEND_COMMAND, { machineId: MACHINE_ID, command: 'x' }));
      await vi.waitFor(() => expect(frames.length).toBe(1));
      await settle();
      expect(frames.map((f) => f.t)).toEqual(['command_output']);
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('non-UUID machineId is dropped', async () => {
    const engine = fakeEngine();
    const { socket, frames } = await openSocket(engine);
    socket.send(clientFrame(ClientEventType.SEND_COMMAND, { machineId: 'lab-ws01', command: 'ipconfig' }));
    await settle();
    expect(engine.handleCommand).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);
  });

  it('invalid JSON and invalid envelopes are ignored', async () => {
    const engine = fakeEngine();
    const { socket, frames } = await openSocket(engine);
    socket.send('not json{');
    socket.send(JSON.stringify({ t: 'heartbeat', payload: {} }));
    await settle();
    expect(frames).toHaveLength(0);
    expect(socket.readyState).toBe(LocalSocket.OPEN);
  });

  it('close stops everything', async () => {
    const engine = fakeEngine();
    const { socket, frames } = await openSocket(engine);
    const onclose = vi.fn();
    socket.onclose = onclose;

    socket.close();
    expect(socket.readyState).toBe(LocalSocket.CLOSED);
    await vi.waitFor(() => expect(onclose).toHaveBeenCalledTimes(1));
    expect(onclose).toHaveBeenCalledWith(expect.objectContaining({ code: 1000, wasClean: true }));

    socket.send(clientFrame(ClientEventType.HEARTBEAT, {}));
    socket.send(clientFrame(ClientEventType.SEND_COMMAND, { machineId: MACHINE_ID, command: 'x' }));
    await settle();
    expect(frames).toHaveLength(0);
    expect(engine.handleCommand).not.toHaveBeenCalled();
  });

  it('close before open cancels the scheduled open and frames', async () => {
    const engine = fakeEngine([{ subsystem: 's', value: 1 }]);
    const socket = new LocalSocket('local://sim', engine);
    const frames = attach(socket);
    const onopen = vi.fn();
    const onclose = vi.fn();
    socket.onopen = onopen;
    socket.onclose = onclose;
    socket.close(4000, 'bye');
    await vi.waitFor(() => expect(onclose).toHaveBeenCalledTimes(1));
    expect(onclose).toHaveBeenCalledWith({ code: 4000, reason: 'bye', wasClean: true });
    await settle();
    expect(onopen).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);
  });

  it('is assignable to the WSClient SocketLike shape without a cast', () => {
    // Mirror of the SocketLike interface Task 4 adds to client.ts; `tsc` checks this.
    interface SocketLike {
      readonly readyState: number;
      binaryType: BinaryType;
      send(data: string): void;
      close(code?: number, reason?: string): void;
      onopen: (() => void) | null;
      onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null;
      onerror: (() => void) | null;
      onmessage: ((event: { data: string | ArrayBuffer }) => void) | null;
    }
    const socket: SocketLike = new LocalSocket('local://sim', fakeEngine());
    socket.close();
    expect(socket.readyState).toBe(LocalSocket.CLOSED);
  });

  it('createLocalSocketFactory builds sockets bound to the engine', async () => {
    const engine = fakeEngine();
    const factory = createLocalSocketFactory(engine);
    const socket = factory('local://sim', []);
    expect(socket).toBeInstanceOf(LocalSocket);
    const frames = attach(socket);
    await vi.waitFor(() => expect(frames.length).toBe(1));
    expect(engine.start).toHaveBeenCalledTimes(1);
  });
});
