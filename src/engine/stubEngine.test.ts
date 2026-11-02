/**
 * Stub engine + engine registry tests.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createStubEngine } from './stubEngine';
import { getEngine, setEngine } from './index';
import type { SimEngine } from './types';
import { DEMO_SUBSYSTEMS, DEMO_TICKETS } from '../app/demo';

const makeStub = (): SimEngine => createStubEngine({ machines: [], tickets: DEMO_TICKETS });

describe('createStubEngine', () => {
  it('start() returns one update per subsystem with the initial value', () => {
    const updates = makeStub().start();
    const keys = Object.keys(DEMO_SUBSYSTEMS);

    expect(updates).toHaveLength(keys.length);
    expect(updates.map((u) => u.subsystem).sort()).toEqual([...keys].sort());
    for (const update of updates) {
      expect(update.value).toEqual(DEMO_SUBSYSTEMS[update.subsystem]);
    }
  });

  it('start() is a pure read: calling it twice returns equal results', () => {
    const engine = makeStub();
    expect(engine.start()).toEqual(engine.start());
  });

  it('handleCommand() runs the command and records history, with no extras', () => {
    const engine = makeStub();
    const result = engine.handleCommand('any-id', 'sc query spooler');

    expect(result.output).toContain('SERVICE_NAME: Spooler');
    expect(result.output).toContain('STATUS      : STOPPED');
    expect(result.exitCode).toBe(0);
    expect(result).not.toHaveProperty('updates');
    expect(result).not.toHaveProperty('ticket');
    expect(result).not.toHaveProperty('scoring');
  });

  it('handleCommand() persists state across calls', () => {
    const engine = makeStub();
    engine.handleCommand('any-id', 'sc start spooler');
    const after = engine.handleCommand('any-id', 'sc query spooler').output;
    expect(after).toContain('STATUS      : RUNNING');
  });
});

describe('engine registry', () => {
  afterEach(() => {
    setEngine(null);
  });

  it('getEngine() returns the same instance on repeated calls', () => {
    expect(getEngine()).toBe(getEngine());
  });

  it('setEngine(null) makes getEngine() create a new instance', () => {
    const first = getEngine();
    setEngine(null);
    const second = getEngine();

    expect(second).not.toBe(first);
    expect(getEngine()).toBe(second);
  });

  it('setEngine(fake) makes getEngine() return the fake', () => {
    const fake: SimEngine = {
      start: () => [],
      handleCommand: () => ({ output: '', exitCode: 0 }),
    };
    setEngine(fake);

    expect(getEngine()).toBe(fake);
  });
});
