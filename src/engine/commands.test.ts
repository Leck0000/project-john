import { describe, it, expect } from 'vitest';
import { handleCommand } from './commands';
import { createInitialState } from './machineState';

describe('handleCommand (read)', () => {
  const state = createInitialState({ machines: [], tickets: [] });

  it('sc query spooler reports STOPPED', () => {
    const { result } = handleCommand(state, 'sc query spooler');
    expect(result.output).toContain('SERVICE_NAME: Spooler');
    expect(result.output).toContain('STATUS      : STOPPED');
    expect(result.exitCode).toBe(0);
  });

  it('Get-Service lists the seeded services', () => {
    const { result } = handleCommand(state, 'get-service');
    expect(result.output).toContain('Spooler');
    expect(result.output).toContain('Dhcp');
  });

  it('Get-EventLog shows event 7034', () => {
    const { result } = handleCommand(state, 'get-eventlog');
    expect(result.output).toContain('Event 7034');
    expect(result.output).toContain('terminated unexpectedly');
  });

  it('unknown command is rejected, state unchanged', () => {
    const { result, next } = handleCommand(state, 'foobar');
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('not recognized');
    expect(next).toBe(state);
  });

  it('read commands do not mutate state when ticketState is not open', () => {
    const stateWithInProgress = createInitialState({ machines: [], tickets: [] });
    const { next } = handleCommand(stateWithInProgress, 'sc query spooler');
    expect(next).toBe(stateWithInProgress);
  });

  it('first diagnostic command transitions ticketState open -> in_progress', () => {
    const stateOpen = { ...createInitialState({ machines: [], tickets: [] }), ticketState: 'open' as const };
    const { result, next } = handleCommand(stateOpen, 'sc query spooler');
    expect(result.ticket).toEqual({ ticketId: '5b0f6c1e-2d4a-4c8e-9f11-0a1b2c3d4e03', state: 'in_progress', assigneeId: 'local-trainee' });
    expect(next.ticketState).toBe('in_progress');
  });

  it('sc start spooler starts the service and records history', () => {
    const { result, next } = handleCommand(state, 'sc start spooler');
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('started successfully');
    expect(next.subsystems.services.find((s) => s.name === 'Spooler')!.status).toBe('running');
    expect(next.history).toContain('sc start spooler');
  });

  it('restart-service spooler starts it without reading the log first', () => {
    const { result, next } = handleCommand(state, 'restart-service spooler');
    expect(result.exitCode).toBe(0);
    expect(next.subsystems.services.find((s) => s.name === 'Spooler')!.status).toBe('running');
    expect(next.history).toContain('restart-service spooler');
  });

  it('sc start spooler is idempotent when already running', () => {
    const started = handleCommand(state, 'sc start spooler').next;
    const { result, next } = handleCommand(started, 'sc start spooler');
    expect(result.output).toContain('already running');
    expect(next).toBe(started);
  });

  it('history accumulates across commands', () => {
    const after = handleCommand(state, 'get-eventlog').next;
    const after2 = handleCommand(after, 'sc start spooler').next;
    expect(after2.history).toEqual(['get-eventlog', 'sc start spooler']);
  });
});
