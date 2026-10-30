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

## Data shapes & gotchas

Apart from the stub, every line of engine code in this folder should be yours.
These notes tell you what the rest of the app expects back.

- **Subsystem keys.** The panels listen for six subsystems, with the same keys
  as `DEMO_SUBSYSTEMS` in `src/app/demo.ts`: `services`, `event-log`,
  `registry`, `network`, `ad` and `filesystem`. The demo data there is a good
  example of each shape.
- **Subsystem shapes.** Each panel checks its data with a Zod schema. For
  ticket 1 the two that matter are `servicesSchema` (an array of
  `ServiceSchema`) in `src/features/desktop/ServicesPanel.tsx` and
  `eventLogEntrySchema` (an array of `EventLogEntrySchema`) in
  `src/features/desktop/EventViewer.tsx`. Watch the details: service `status`
  and `startMode` are fixed lowercase words, and every event-log entry needs a
  UUID `id`. If a value fails its panel's schema, the panel only says
  "Unexpected <subsystem> data from server" — compare your value with the
  schema field by field.
- **Updates replace, they don't patch.** Each `updates[].value` replaces the
  *whole* subsystem value. To change one service, send the complete services
  list with that one entry changed.
- **IDs are UUIDs.** `machineId` and `ticketId` are UUIDs, not hostnames or
  `TKT-…` numbers. Your engine gets them from `config.machines` and
  `config.tickets`; `config.machines` is also how you map a UUID to its
  hostname (for example `ws-hr-02`).
- **Score is an integer from 0 to 100.** Anything else (150, 42.5) is dropped
  and reported in the browser console.

### Where mistakes show up

- **In the terminal:** `handleCommand()` throws, or returns an invalid
  command result (for example an `exitCode` that is not an integer). You get
  an `Engine error: …` line with exit code 1.
- **In the browser console only:** a `ticket` or `scoring` with a non-UUID
  `ticketId`, or a score that is not an integer from 0 to 100. That one
  message is dropped and logged with `console.error`; nothing appears in the
  UI, so keep the developer tools console open.
- **In the panel:** an `updates` entry whose `value` has the wrong shape still
  reaches the panel, which then shows "Unexpected <subsystem> data from
  server" (see *Subsystem shapes* above).
- **Nowhere — check these yourself:** a misspelled subsystem key in `updates`
  (it is stored, but no panel reads it), a `ticket.state` that is not one of
  the five ticket states (the `TicketState` type catches this when you
  compile), and a `ticket.ticketId` that is a valid UUID but matches no ticket.
  All three are ignored without any message.
- **`start()` throws:** the session still connects and commands still work,
  but the panels get no snapshot; the error is in the browser console.

### Checking your work

1. Unit-test your `createEngine(config)` directly with Vitest (see
   `stubEngine.test.ts` for how a test file is laid out). No browser needed:
   call `start()` and `handleCommand()` and check what they return.
2. Then try it in the app: run the dev server, open it with `?demo=1`, select
   the Print Spooler ticket and use its terminal.

## Your checklist — ticket 1 (Print Spooler keeps stopping)

- [ ] `sc query`
- [ ] `sc start`
- [ ] `Get-Service`
- [ ] `Restart-Service`
- [ ] `Get-EventLog`
- [ ] The fix is verified by state (the Spooler service is actually running
      in the `services` subsystem), not by which command was typed.
- [ ] The score checks that the event log was read before the restart.
