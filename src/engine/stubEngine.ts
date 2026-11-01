/**
 * Stub engine — a placeholder until the real engine is written.
 *
 * It is the ONLY engine code here that is not yours. It delegates to your
 * `machineState.ts` (the starting machine) and `commands.ts` (command
 * handling), so the whole pipeline runs end to end while you build the real
 * behaviour. Replace this file with your own engine when you are ready.
 *
 * `start()` reports every subsystem the desktop panels read, so the Services,
 * Event Log, Registry, Network, AD and File Explorer panels all have data.
 */

import { createInitialState } from './machineState';
import { handleCommand } from './commands';
import type { CreateEngine } from './types';

export const createStubEngine: CreateEngine = (config) => {
  let state = createInitialState(config);
  return {
    start: () =>
      Object.entries(state.subsystems).map(([subsystem, value]) => ({ subsystem, value })),
    handleCommand: (_machineId, command) => {
          const { result, next } = handleCommand(state, command);
          state = next;
          const response: { output: string; exitCode: number; scoring?: { ticketId: string; score: number; feedback?: string }; ticket?: { ticketId: string; state: 'open' | 'in_progress' | 'on_hold' | 'resolved' | 'closed' }; evidence?: string[] } = { output: result.output, exitCode: result.exitCode };
          if (result.scoring) response.scoring = result.scoring;
          if (result.ticket) response.ticket = result.ticket;
          if (result.evidence) response.evidence = result.evidence;
          return response;
        },
  };
};

