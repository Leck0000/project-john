import { describe, expect, it } from 'vitest';
import { createInitialState } from './machineState';

describe('createInitialState', () => {
  const config = { machines: [], tickets: [] };

  it('starts the Spooler stopped', () => {
      const state = createInitialState(config);

      expect(state.subsystems.services.find((service) => service.name === 'Spooler')?.status).toBe('stopped');
    });

    it('includes event 7034 in the log', () => {
      const state = createInitialState(config);

      expect(state.subsystems['event-log'].some((entry) => entry.eventId === '7034')).toBe(true);
    });

  it('returns equal results when called twice', () => {
    expect(createInitialState(config)).toEqual(createInitialState(config));
  });
});