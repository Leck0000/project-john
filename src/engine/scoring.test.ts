import { describe, it, expect } from 'vitest';
import { handleCommand } from './commands';
import { createInitialState } from './machineState';

describe('scoring logic', () => {
  const config = { machines: [], tickets: [] };
  const ticketId = '5b0f6c1e-2d4a-4c8e-9f11-0a1b2c3d4e03';

  it('scores 100 when get-eventlog was read before restart-service', () => {
    let state = createInitialState(config);
    state = handleCommand(state, 'get-eventlog').next;      // read the log
    const { result } = handleCommand(state, 'restart-service spooler');
    
    expect(result.scoring).toBeDefined();
    expect(result.scoring!.score).toBe(100);
    expect(result.scoring!.ticketId).toBe(ticketId);
  });

  it('scores 0 when restart-service without reading event log', () => {
    const state = createInitialState(config);
    const { result } = handleCommand(state, 'restart-service spooler');
    
    expect(result.scoring).toBeDefined();
    expect(result.scoring!.score).toBe(0);
  });

  it('scores 100 when get-eventlog was read before sc start spooler', () => {
    let state = createInitialState(config);
    state = handleCommand(state, 'get-eventlog').next;
    const { result } = handleCommand(state, 'sc start spooler');
    
    expect(result.scoring).toBeDefined();
    expect(result.scoring!.score).toBe(100);
  });

  it('scores 0 when sc start spooler without reading event log', () => {
    const state = createInitialState(config);
    const { result } = handleCommand(state, 'sc start spooler');
    
    expect(result.scoring).toBeDefined();
    expect(result.scoring!.score).toBe(0);
  });

  it('does not score on read-only commands', () => {
    const state = createInitialState(config);
    const { result } = handleCommand(state, 'get-eventlog');
    
    expect(result.scoring).toBeUndefined();
  });

  it('does not score on sc query', () => {
    const state = createInitialState(config);
    const { result } = handleCommand(state, 'sc query spooler');
    
    expect(result.scoring).toBeUndefined();
  });
});