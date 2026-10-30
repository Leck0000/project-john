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
  it('start() returns one update per DEMO_SUBSYSTEMS key with the demo value', () => {
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

  it('handleCommand() reports every command as not recognized, with no extras', () => {
    const result = makeStub().handleCommand('any-id', 'sc query spooler');

    expect(result).toStrictEqual({
      output:
        "'sc query spooler' is not recognized as an internal or external command, operable program or batch file.",
      exitCode: 1,
    });
    expect(result).not.toHaveProperty('updates');
    expect(result).not.toHaveProperty('ticket');
    expect(result).not.toHaveProperty('scoring');
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
