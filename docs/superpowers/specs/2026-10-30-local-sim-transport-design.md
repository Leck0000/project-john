# Local Sim Transport (plumbing for the Print Spooler ticket) — Design

Date: 2026-10-30 · Verdict item: "Now #1 — Print Spooler ticket end to end in the browser" (`docs/council-verdict-2026-10-29.md`)

## Intent

The verdict wants the simulator engine to run in the browser, behind a local transport that speaks the existing WebSocket event contract, so the Redux/Zod/middleware stack stays useful and a real backend can replace it later with no UI change.

The work is split:
- **This design (the plumbing), built by the agent:** local transport, wiring, the engine interface, a stub engine, tests.
- **The engine itself, written by hand by the user** (verdict: "write the engine by hand — it's the part that proves understanding"): service state, command parsing (`sc query`, `sc start`, `Get-Service`, `Restart-Service`, `Get-EventLog`), event log, fix verification, scoring.

Success: with `?demo=1`, typing a command in the ticket's terminal reaches an engine function and its result shows up in the terminal, the Services/Event Viewer panels and the ticket state, all through real envelopes parsed by the real `WSClient` and `wsMiddleware`, and the score reaching the `scores` Redux slice (not yet shown in the workspace — see Follow-ups). Before the user writes any engine code, the stub engine makes this observable ("command not recognized" + the current demo snapshot).

## Goals

1. A `LocalSocket` that imitates a `WebSocket` well enough for `WSClient` to use it unchanged in behaviour (open, `session.init`, seq, heartbeats, acks, close).
2. A typed `SimEngine` interface the user implements; the plumbing translates its results into server envelopes.
3. A stub engine so the app runs end to end today.
4. Machine identity fixed so strict Zod schemas pass (UUID ids + hostnames).
5. `ticket_update` wired through the middleware so the engine can resolve a ticket.
6. Tests proving the full round trip.

## Non-goals

- Any engine logic: no command parsing, no service state machine, no event-log rules, no scoring rules. The stub only says "not recognized".
- New UI panels or UI redesign (frontend is frozen per the verdict).
- Per-machine subsystems (today `desktop.subsystems` is global; one machine per ticket is enough for ticket 1).
- Removing the `?demo=1` requirement — that is verdict item #4.
- A real backend, auth, multi-session.

## Anti-goals (failure even if it "works")

- Writing engine behaviour for the user, even "just a starting example" of `sc query`.
- Bypassing `WSClient` / envelope parsing in local mode (that was approach C, rejected).
- Rewriting `client.ts` or its tests beyond the one injection point (approach B, rejected).
- Loosening Zod schemas to accept non-UUID ids.

## Constraints

Strict TS (`strict`, `noUncheckedIndexedAccess`, no `any` in source), Zod at boundaries, CSS-variable theming, Vitest + jsdom, pnpm. Must pass `pnpm run test`, `lint`, `typecheck`, `build`.

## Approaches (picked: A)

- **A. Fake socket under `WSClient` — chosen.** `WSClient` gets one optional injection point for creating the socket; in local mode it gets a `LocalSocket` that answers frames by calling the engine. Every frame still goes through real envelope parsing, Zod and middleware; switching to a real backend = a different URL. Cost: ~100 lines imitating socket timing/seq.
- B. Transport interface refactor (`WebSocketTransport` / `LocalTransport`). Cleanest abstraction, but rewrites working, tested `client.ts` — the frontend churn the verdict says to freeze. Rejected.
- C. Middleware short-circuit (intercept `ws/send`, dispatch `ws/message` directly). Smallest, but skips envelope parsing/seq, so local mode wouldn't really exercise the contract. Rejected.

## How it works (decided)

### Engine interface — `src/engine/types.ts` (plumbing-owned)

The engine never sees sockets, envelopes or Redux. Shape (names may be refined by the builder, the split must not):

```ts
/** Whole-subsystem replacement, same semantics as today's applyStateDelta. */
interface SubsystemUpdate { subsystem: string; value: unknown }

interface CommandResult {
  output: string;              // text written to the terminal
  exitCode: number;
  updates?: SubsystemUpdate[]; // -> state.delta frames, after command_output
  ticket?: { ticketId: string; state: 'open' | 'in_progress' | 'on_hold' | 'resolved' | 'closed' }; // -> ticket_update
  scoring?: { ticketId: string; score: number; feedback?: string };                                // -> scoring_update
}

/** Scenario data handed in by the plumbing, so the engine never imports the demo seed. */
interface EngineConfig {
  machines: ReadonlyArray<{ id: string; hostname: string }>;
  tickets: ReadonlyArray<{ id: string; relatedMachineId?: string; category?: string }>;
}

/** Factory the user implements: `createEngine(config: EngineConfig): SimEngine`. */

interface SimEngine {
  /** Current full snapshot used to seed the panels. Pure read: may be called again on reconnect and must NOT reset state. */
  start(): SubsystemUpdate[];
  /** One terminal command line on one machine. Must be deterministic given its inputs + internal state. */
  handleCommand(machineId: string, command: string): CommandResult;
}
```

Engine methods are synchronous. Frames for one command are emitted in order: `command_output`, then each `state.delta`, then `ticket_update`, then `scoring_update`.

### LocalSocket — `src/shared/ws/localSocket.ts`

- Implements the subset of `WebSocket` that `WSClient` uses: `readyState`, `binaryType`, `send`, `close`, `onopen`/`onclose`/`onerror`/`onmessage`, and the `OPEN`/`CLOSED` constants as used.
- All callbacks fire asynchronously (never inside `send`/constructor), like a real socket.
- On open: fires `onopen`, then sends `session.init` (fresh UUID `sessionId`, `userPrincipal: 'local-trainee'`, `caps: ['local-sim']`), then one `state.delta` per entry from `engine.start()`.
- Parses each client frame with the existing envelope schema. `send_command` (validated with `SendCommandPayloadSchema`) → `engine.handleCommand` → frames above. `heartbeat` → replies `heartbeat`. `client.ack`, `authenticate`, others → ignored.
- Server frames use the real envelope (`v:1`, `sid`, monotonically increasing `seq`, `ts`). `command_output` carries `machineId`, `output`, `exitCode`, ISO `timestamp`.
- If the engine throws, reply with `command_output` containing the error message and `exitCode: 1` (the session stays open).
- `close()` fires `onclose` with a clean 1000.

### WSClient injection

`WSClient` config gains one optional field that creates the socket (e.g. `createSocket?: (url, protocols) => WebSocket`); default is `new WebSocket(...)`. Nothing else in `client.ts` changes. A URL with the `local:` scheme (`local://sim`) selects `LocalSocket` + the configured engine; where that decision lives (middleware vs a small factory module) is the builder's call.

### Wiring

- `Workspace.tsx` demo branch: still seeds tickets with `setQueue(DEMO_TICKETS)`, but replaces the static `DEMO_SUBSYSTEMS` loop with `wsConnect({ url: 'local://sim' })`. The panels now get their data from `engine.start()` via `state.delta`.
- `wsMiddleware` handles `ticket_update` → existing `mergeTicketUpdate` in `features/tickets/slice.ts` (Zod-validated, like the other handlers).
- `ws.connected` becomes true in local mode, so `TerminalWindow` sends commands instead of printing "(offline)".

### Machine identity

- Demo machines get UUID `id`s plus a `hostname` (`ws-hr-02` etc.) in a small `DEMO_MACHINES` list in `src/app/demo.ts`; `DEMO_TICKETS.relatedMachineId` uses the UUIDs.
- Wherever a machine is shown to a human (terminal prompt/greeting, window title, ticket detail "Machine" row), show the hostname; fall back to the id if unknown.

### Stub engine — `src/engine/stubEngine.ts`

- `start()` returns the current `DEMO_SUBSYSTEMS` as updates (so the panels look exactly like today).
- `handleCommand` returns `'<cmd>' is not recognized as an internal or external command, operable program or batch file.`, exit code 1, nothing else.
- The app imports the engine from one place (e.g. `src/engine/index.ts` exporting `createEngine()`), so the user swaps in their engine by editing one line.

## Tests (decided)

- `localSocket.test.ts`: session.init then snapshot deltas on open; `send_command` produces frames in order with valid envelopes and increasing seq; heartbeat reply; ack ignored; engine throw → exitCode 1 output; callbacks are async.
- Integration test: real store + `wsConnect({url:'local://sim'})` with a fake test engine → after a command, `desktop.terminalOutput`, `desktop.subsystems`, the ticket's state and `scores` all reflect the engine result.
- `wsMiddleware` test for `ticket_update`.
- Existing tests keep passing (update any that assumed the static demo seed or string machine ids).

### Calls made by the designer (settled after builder check)

- **Engine lifetime:** one engine instance per page load, created once (module-level, not per `LocalSocket`). Reconnects (heartbeat timeouts, StrictMode double effects) create a new `LocalSocket` that reuses the same engine; `start()` is a pure snapshot read. Engine state survives reconnects so it can't disagree with Redux.
- **Ticket/machine context:** passed in via `createEngine({ machines, tickets })` built from `DEMO_MACHINES`/`DEMO_TICKETS`, so the user's engine is decoupled from `src/app/demo.ts`.
- **Default machine in demo mode:** where `DEFAULT_MACHINE_ID` ('lab-ws01') would be used and demo mode is on, use the Spooler ticket's machine UUID instead; non-demo behaviour unchanged. As a safety net, `LocalSocket` drops `send_command` frames that fail validation and the test documents it.
- **Score scale:** `scoring.score` is an integer 0–100 (matches the scores slice's own schema). The plumbing only guarantees the `scoring_update` reaches the `scores` slice; `mergeScoringUpdate` and `ticket.scoring` semantics are untouched.

## Follow-ups (not in this work)

- **Score readout in the ticket detail.** The user wants to see the score from the ticket detail. Today the only score UI is `ScoreDashboard` on `/scoring`, unreachable from the workspace without losing the local session. Build this once the user's engine produces real scores (decided: option A — plumbing only gets the score into Redux now).

## Left to the builder

File/function names beyond those above, where the `local:` decision lives, exact LocalSocket internals, test file layout, and how hostnames are looked up for display.

## Handoff to the user (after the plumbing lands)

A short `src/engine/README.md` stating the contract (the interface above, frame order, determinism, "the stub is the only code here you didn't write") and the list of ticket-1 behaviours the user will implement. No engine code.
