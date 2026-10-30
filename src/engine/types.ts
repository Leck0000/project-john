/**
 * SimEngine contract — the boundary between the terminal plumbing and the
 * simulation engine. The plumbing turns each CommandResult into frames in a
 * fixed order: `command_output` → each `state.delta` → `ticket_update` →
 * `scoring_update`. Engine methods are synchronous and deterministic; one
 * engine lives for the whole page.
 */

/** One subsystem's new value; the plumbing emits it as a `state.delta` frame. */
export interface SubsystemUpdate {
  subsystem: string;
  value: unknown;
}

/** Ticket lifecycle states an engine may move a ticket to. */
export type TicketState = 'open' | 'in_progress' | 'on_hold' | 'resolved' | 'closed';

/**
 * The outcome of one command. Frames are emitted in this order:
 * `output` (command_output) → each of `updates` (state.delta) →
 * `ticket` (ticket_update) → `scoring` (scoring_update). Optional parts
 * that are absent produce no frame.
 */
export interface CommandResult {
  output: string;
  exitCode: number;
  updates?: SubsystemUpdate[];
  ticket?: { ticketId: string; state: TicketState };
  /** `score` is an integer from 0 to 100. */
  scoring?: { ticketId: string; score: number; feedback?: string };
}

/** What the engine is built from: the machines and tickets of the scenario. */
export interface EngineConfig {
  machines: ReadonlyArray<{ id: string; hostname: string }>;
  tickets: ReadonlyArray<{ id: string; relatedMachineId?: string; category?: string }>;
}

/**
 * A simulation engine. Synchronous and deterministic: the same commands in
 * the same order always give the same results. One instance lives for the
 * whole page.
 */
export interface SimEngine {
  /** Snapshot of every subsystem's current state. A pure read — never resets or changes state. */
  start(): SubsystemUpdate[];
  /** Run one terminal command on a machine and report what happened. */
  handleCommand(machineId: string, command: string): CommandResult;
}

/** Builds an engine from a config. Swap the factory in `src/engine/index.ts` to use your own. */
export type CreateEngine = (config: EngineConfig) => SimEngine;
