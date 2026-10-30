# Engine

This folder is the boundary between the terminal and the simulation. When a
learner types a command in a machine's terminal, the plumbing hands it to the
page's `SimEngine` and turns the answer into messages for the UI.

Right now the engine is a **stub** (`stubEngine.ts`): it shows the demo
subsystem data and answers every command with "is not recognized". You will
write the real engine yourself.

## The contract (`types.ts`)

```ts
interface SubsystemUpdate { subsystem: string; value: unknown }
type TicketState = 'open' | 'in_progress' | 'on_hold' | 'resolved' | 'closed';

interface CommandResult {
  output: string;
  exitCode: number;
  updates?: SubsystemUpdate[];
  ticket?: { ticketId: string; state: TicketState };
  scoring?: { ticketId: string; score: number; feedback?: string }; // score: integer 0–100
}

interface EngineConfig {
  machines: ReadonlyArray<{ id: string; hostname: string }>;
  tickets: ReadonlyArray<{ id: string; relatedMachineId?: string; category?: string }>;
}

interface SimEngine {
  start(): SubsystemUpdate[];                                    // pure snapshot read, never resets
  handleCommand(machineId: string, command: string): CommandResult;
}

type CreateEngine = (config: EngineConfig) => SimEngine;
```

- `start()` returns a snapshot of every subsystem's current state. It is a
  pure read: calling it never resets or changes anything.
- `handleCommand()` runs one command on one machine and reports the result.
  Leave out `updates`, `ticket` or `scoring` when nothing changed.

## Frame order

For each `CommandResult`, the plumbing emits frames in this order:

1. `command_output` — from `output` and `exitCode`
2. one `state.delta` per entry in `updates`, in array order
3. `ticket_update` — from `ticket`, if present
4. `scoring_update` — from `scoring`, if present

## Rules

- Engine methods are synchronous and deterministic; one engine lives for the
  whole page.
- To use your engine, change the factory in `src/engine/index.ts`.

## Your checklist — ticket 1 (Print Spooler keeps stopping)

- [ ] `sc query`
- [ ] `sc start`
- [ ] `Get-Service`
- [ ] `Restart-Service`
- [ ] `Get-EventLog`
- [ ] The fix is verified by state (the Spooler service is actually running
      in the `services` subsystem), not by which command was typed.
- [ ] The score checks that the event log was read before the restart.
