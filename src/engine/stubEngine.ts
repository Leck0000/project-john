/**
 * Stub engine — a placeholder until the real engine is written. It reports
 * the demo subsystem snapshots and answers every command as "not recognized".
 * It is synchronous, deterministic, and never changes state.
 */
import { DEMO_SUBSYSTEMS } from '../app/demo';
import type { CreateEngine } from './types';

/** Creates the stub engine. The config is accepted but unused. */
export const createStubEngine: CreateEngine = () => ({
  start: () =>
    Object.entries(DEMO_SUBSYSTEMS).map(([subsystem, value]) => ({ subsystem, value })),
  handleCommand: (_machineId, command) => ({
    output: `'${command}' is not recognized as an internal or external command, operable program or batch file.`,
    exitCode: 1,
  }),
});
