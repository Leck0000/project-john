import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { DEMO_MACHINES, DEMO_TICKETS, defaultMachineId, machineLabel } from './demo';
import { TicketPayloadSchema } from '../shared/ws/envelope';

describe('demo machines', () => {
  it('gives every demo ticket a UUID machine id that is a known demo machine', () => {
    const ids = DEMO_MACHINES.map((m) => m.id);
    for (const t of DEMO_TICKETS) {
      expect(z.string().uuid().safeParse(t.relatedMachineId).success).toBe(true);
      expect(ids).toContain(t.relatedMachineId);
    }
  });

  it('every demo ticket parses with the strict ticket schema', () => {
    for (const t of DEMO_TICKETS) {
      expect(TicketPayloadSchema.safeParse(t).success).toBe(true);
    }
  });

  it('machineLabel shows the hostname for known ids and the id otherwise', () => {
    expect(machineLabel('3e1a0c2b-7d4f-4a6e-9b8c-5d2f1e0a7b03')).toBe('ws-hr-02');
    expect(machineLabel('unknown')).toBe('unknown');
  });

  it('defaultMachineId is the Spooler ticket machine in demo mode, lab-ws01 otherwise', () => {
    expect(defaultMachineId('?demo=1')).toBe('3e1a0c2b-7d4f-4a6e-9b8c-5d2f1e0a7b03');
    if (import.meta.env.VITE_DEMO !== '1') {
      expect(defaultMachineId('')).toBe('lab-ws01');
    }
  });
});
