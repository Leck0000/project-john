# Local Sim Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In `?demo=1`, terminal commands travel through the real `WSClient`/envelope/middleware path to an in-browser `SimEngine` (a stub for now), and the engine's results come back as `command_output`, `state.delta`, `ticket_update` and `scoring_update` frames.

**Architecture:** A `LocalSocket` imitates a `WebSocket` and is injected into `WSClient` via a new optional `createSocket` config option when the URL scheme is `local:`. The socket translates client frames into calls on a page-lifetime `SimEngine` and turns the results into server envelopes. The engine logic itself is out of scope: the user writes it by hand. This plan ships only the interface, a stub engine and the wiring.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), React 18, Redux Toolkit, Zod, Vitest + jsdom, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-30-local-sim-transport-design.md`

## Global Constraints

- No `any` in source. `as any` is allowed only in test utilities.
- `strict: true`, `noUncheckedIndexedAccess: true`. Zod-validate every frame that crosses the transport boundary.
- Do not loosen any Zod schema. Machine and ticket ids stay UUIDs.
- No engine behaviour (no parsing of `sc`/`Get-Service` etc.). The stub only answers "not recognized".
- `client.ts` changes are limited to the socket injection point (approach A). Do not refactor the WSClient lifecycle.
- No new UI panels. Display changes are limited to showing hostnames instead of ids.
- Gates: `pnpm run test`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run build` all pass at the end of every task.

## Review Focus

1. **Reconnect / StrictMode double connect.** A second `LocalSocket` must reuse the same engine (state is not reset) and re-send the snapshot. Tested in Task 5.
2. **The engine throws.** The terminal shows the error with `exitCode: 1` and the session stays open. Tested in Task 3.
3. **`send_command` with a non-UUID machineId** (e.g. `lab-ws01` outside demo). The frame is dropped silently, nothing crashes and no frames are emitted. Tested in Task 3.
4. **`ticket_update` with an unknown status string.** The middleware rejects it and the ticket state is unchanged. Tested in Task 5.
5. **Frames after `close()`.** `LocalSocket` ignores `send` and fires no further callbacks. Tested in Task 3.

## File Structure

| File | Responsibility |
|---|---|
| `src/engine/types.ts` (create) | Engine contract: `SubsystemUpdate`, `CommandResult`, `EngineConfig`, `SimEngine`, `CreateEngine` |
| `src/engine/stubEngine.ts` (create) | `createStubEngine(config)`: returns the demo snapshot, answers "not recognized" |
| `src/engine/index.ts` (create) | Page-lifetime engine registry: `getEngine()`, `setEngine()`. The one line the user edits to swap engines |
| `src/engine/README.md` (create) | Contract handoff for the user (no engine code) |
| `src/app/demo.ts` (modify) | `DEMO_MACHINES`, UUID `relatedMachineId`s, `machineLabel()`, `defaultMachineId()` |
| `src/shared/ws/localSocket.ts` (create) | `LocalSocket` + `createLocalSocketFactory(engine)` |
| `src/shared/ws/client.ts` (modify) | `SocketLike` type + optional `createSocket` config |
| `src/shared/middleware/wsMiddleware.ts` (modify) | `local:` URL → local factory; `ticket_update` → `mergeTicketUpdate` |
| `src/features/layout/Workspace.tsx` (modify) | Demo branch connects to `local://sim` instead of seeding subsystems |
| `src/features/tickets/TicketDetail.tsx`, `src/features/desktop/WindowsAppsLauncher.tsx`, `src/features/desktop/TerminalWindow.tsx` (modify) | Hostname display, demo default machine |

---

### Task 1: Engine contract, stub engine, registry, README

**Files:**
- Create: `src/engine/types.ts`, `src/engine/stubEngine.ts`, `src/engine/index.ts`, `src/engine/README.md`
- Test: `src/engine/stubEngine.test.ts`

**Interfaces:**
- Consumes: `DEMO_SUBSYSTEMS` from `src/app/demo.ts` (existing).
- Produces:
  ```ts
  // src/engine/types.ts
  export interface SubsystemUpdate { subsystem: string; value: unknown }
  export type TicketState = 'open' | 'in_progress' | 'on_hold' | 'resolved' | 'closed';
  export interface CommandResult {
    output: string;
    exitCode: number;
    updates?: SubsystemUpdate[];
    ticket?: { ticketId: string; state: TicketState };
    scoring?: { ticketId: string; score: number; feedback?: string }; // score: integer 0–100
  }
  export interface EngineConfig {
    machines: ReadonlyArray<{ id: string; hostname: string }>;
    tickets: ReadonlyArray<{ id: string; relatedMachineId?: string; category?: string }>;
  }
  export interface SimEngine {
    start(): SubsystemUpdate[];                                    // pure snapshot read, never resets
    handleCommand(machineId: string, command: string): CommandResult;
  }
  export type CreateEngine = (config: EngineConfig) => SimEngine;

  // src/engine/stubEngine.ts
  export const createStubEngine: CreateEngine;
  // src/engine/index.ts
  export function getEngine(): SimEngine;          // lazily creates once per page from the demo config (Task 2 supplies the config)
  export function setEngine(engine: SimEngine | null): void; // tests / swapping; null = recreate lazily on next getEngine()
  ```
- Until Task 2 adds `DEMO_MACHINES`, `getEngine()` builds its config from `DEMO_TICKETS` and `machines: []`. Task 2 switches it to `DEMO_MACHINES`.

- [ ] **Step 1: Write failing tests** in `src/engine/stubEngine.test.ts`:
  - `start()` returns one update per `DEMO_SUBSYSTEMS` key, with `value` deep-equal to `DEMO_SUBSYSTEMS[key]`.
  - Calling `start()` twice returns equal results.
  - `handleCommand('any-id', 'sc query spooler')` → `{ output: "'sc query spooler' is not recognized as an internal or external command, operable program or batch file.", exitCode: 1 }`, with no `updates`/`ticket`/`scoring` keys.
  - `getEngine()` returns the same instance on repeated calls. After `setEngine(null)`, it returns a new instance. After `setEngine(fake)`, it returns `fake`.
- [ ] **Step 2:** `pnpm vitest run src/engine` → FAIL (modules missing).
- [ ] **Step 3:** Implement the three `.ts` files with the signatures above. Use a module-level `let current: SimEngine | null` for the registry. Give each exported type a short doc comment that restates the contract (frame order, determinism, `start()` is a pure read).
- [ ] **Step 4:** Write `src/engine/README.md` covering:
  - the contract above;
  - the frame order the plumbing emits (`command_output` → each `state.delta` → `ticket_update` → `scoring_update`);
  - "engine methods are synchronous and deterministic; one engine lives for the whole page";
  - "to use your engine, change the factory in `src/engine/index.ts`";
  - the ticket-1 behaviours the user will implement, as a checklist: `sc query`, `sc start`, `Get-Service`, `Restart-Service`, `Get-EventLog`; fix verified by state; score checks the event log was read before the restart.
  - No example engine code.
- [ ] **Step 5:** `pnpm vitest run src/engine` → PASS. Then run all four gates.
- [ ] **Step 6:** Commit: `feat(engine): SimEngine contract, stub engine and registry`

---

### Task 2: Demo machines with UUIDs and hostname display

**Files:**
- Modify: `src/app/demo.ts`, `src/engine/index.ts`, `src/features/tickets/TicketDetail.tsx:41,66,94`, `src/features/desktop/WindowsAppsLauncher.tsx:11-16`, `src/features/desktop/TerminalWindow.tsx:34,38`
- Test: `src/app/demo.test.ts` (create). Update any existing test that asserts on string machine ids.

**Interfaces:**
- Produces (in `src/app/demo.ts`):
  ```ts
  export interface DemoMachine { id: string; hostname: string }
  export const DEMO_MACHINES: readonly DemoMachine[];
  export function machineLabel(machineId: string): string;   // hostname if known, else machineId
  export function defaultMachineId(): string;                // demo: Spooler ticket's machine id; else 'lab-ws01'
  ```
- Machine UUIDs (fixed values):

  | hostname | id |
  |---|---|
  | ws-finance-07 | `3e1a0c2b-7d4f-4a6e-9b8c-5d2f1e0a7b01` |
  | ws-ops-12 | `3e1a0c2b-7d4f-4a6e-9b8c-5d2f1e0a7b02` |
  | ws-hr-02 | `3e1a0c2b-7d4f-4a6e-9b8c-5d2f1e0a7b03` |
  | lt-sales-31 | `3e1a0c2b-7d4f-4a6e-9b8c-5d2f1e0a7b04` |
  | ws-finance-03 | `3e1a0c2b-7d4f-4a6e-9b8c-5d2f1e0a7b05` |

- `DEMO_TICKETS[n].relatedMachineId` becomes the matching UUID.
- `WindowsAppsLauncher` keeps exporting `DEFAULT_MACHINE_ID = 'lab-ws01'` (non-demo value). Both call sites use `defaultMachineId()` instead.

- [ ] **Step 1: Write failing tests** in `src/app/demo.test.ts`:
  - Every `DEMO_TICKETS[i].relatedMachineId` passes `z.string().uuid()` and appears in `DEMO_MACHINES`.
  - Every ticket parses with `TicketPayloadSchema` from `src/shared/ws/envelope.ts`.
  - `machineLabel('3e1a0c2b-7d4f-4a6e-9b8c-5d2f1e0a7b03') === 'ws-hr-02'`, and `machineLabel('unknown') === 'unknown'`.
  - With `?demo=1`, `defaultMachineId()` returns `...7b03`. Without it, it returns `'lab-ws01'`. Stub `window.location.search` or refactor `defaultMachineId(search = window.location.search)` to mirror `isDemoMode`.
- [ ] **Step 2:** Run the test → FAIL.
- [ ] **Step 3:** Implement the `demo.ts` changes. In `src/engine/index.ts`, build the config as `{ machines: DEMO_MACHINES, tickets: DEMO_TICKETS }`.
- [ ] **Step 4:** Display changes:
  - `TicketDetail`: the Machine row and the terminal window title use `machineLabel(machineId)`. The `machineId` passed to `openAppWindow` stays the id.
  - `TerminalWindow`: the greeting and prompt use `machineLabel(machineId)`.
  - `WindowsAppsLauncher` + `TicketDetail` fallback: `defaultMachineId()`.
  - Add or adjust one assertion in `TerminalWindow.test.tsx` that the prompt shows `ws-hr-02` for the `...7b03` machine.
- [ ] **Step 5:** Run all four gates → PASS. Fix any test that hard-coded `ws-hr-02` as an id.
- [ ] **Step 6:** Commit: `feat(demo): UUID machine ids with hostname display`

---

### Task 3: LocalSocket

**Files:**
- Create: `src/shared/ws/localSocket.ts`
- Test: `src/shared/ws/localSocket.test.ts`

**Interfaces:**
- Consumes: `SimEngine`, `CommandResult` (Task 1). From `envelope.ts`: `WSEnvelopeSchema`, `SendCommandPayloadSchema`, `ServerEventType`, `ClientEventType`.
- Produces:
  ```ts
  export class LocalSocket /* satisfies SocketLike from Task 4 — structurally, no import needed yet */ {
    static readonly CONNECTING = 0; static readonly OPEN = 1; static readonly CLOSING = 2; static readonly CLOSED = 3;
    readyState: number;            // CONNECTING until the async open, then OPEN; CLOSED after close()
    binaryType: BinaryType;
    onopen: (() => void) | null;
    onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null;
    onerror: (() => void) | null;
    onmessage: ((event: { data: string | ArrayBuffer }) => void) | null; // must match SocketLike exactly (handler params are contravariant)
    constructor(url: string, engine: SimEngine);
    send(data: string): void;
    close(code?: number, reason?: string): void;
  }
  export function createLocalSocketFactory(engine: SimEngine): (url: string, protocols: string[]) => LocalSocket;
  ```
- Behaviour, as fixed by the spec:
  - On construction, schedule (`setTimeout(…, 0)`) the following: `readyState = OPEN`, `onopen()`, then a `session.init` frame `{ sessionId: crypto.randomUUID(), userPrincipal: 'local-trainee', caps: ['local-sim'] }`, then one `state.delta` per `engine.start()` entry: `{ subsystem, path: '', op: 'set', value }`.
  - Every server frame: `{ v: 1, t, sid: sessionId, seq: ++n, ts: Date.now(), payload }`, delivered asynchronously through `onmessage({ data: JSON.stringify(frame) })`.
  - `send(data)`: parse JSON and `WSEnvelopeSchema`, ignoring invalid input. For `send_command` that passes `SendCommandPayloadSchema`, call `engine.handleCommand`, then emit frames in this order:
    1. `command_output` `{ machineId, output, exitCode, timestamp: new Date().toISOString() }`
    2. each `state.delta`
    3. `ticket_update` `{ ticketId, status: state, timestamp }` if `ticket`
    4. `scoring_update` `{ ticketId, score, feedback?, timestamp }` if `scoring`
  - `heartbeat` → reply `heartbeat {}`. All other client types are ignored.
  - If the engine throws: `command_output` with `output: \`Engine error: ${message}\``, `exitCode: 1`.
  - `close()`: `readyState = CLOSED`, then asynchronously `onclose({ code: code ?? 1000, reason: reason ?? '', wasClean: true })`. After that, `send` is a no-op and pending scheduled frames are not delivered.

- [ ] **Step 1: Write failing tests**, using a hand-rolled fake `SimEngine` built with `vi.fn` and `await vi.waitFor(...)` for async delivery:
  - `opens asynchronously`: `readyState === CONNECTING` right after construction, and `onopen` has not been called synchronously.
  - `sends session.init then one state.delta per start() entry`: the first frame `t === 'session.init'` parses with `SessionInitPayloadSchema`, the next frames are `state.delta` in `start()` order, and seq is `1, 2, 3…`.
  - `send_command → frames in order`: the engine returns all four parts, and the emitted `t` sequence is `['command_output','state.delta','ticket_update','scoring_update']`. Each payload parses with its schema from `envelope.ts` (`CommandOutputPayloadSchema`, `StateDeltaPayloadSchema`, `TicketUpdatePayloadSchema`, `ScoringUpdatePayloadSchema`). `ticket_update.status === 'resolved'`.
  - `heartbeat is answered`. `client.ack is ignored` (no frame, engine not called).
  - `engine throw → exitCode 1, session stays open`: a later command still works.
  - `non-UUID machineId is dropped`: `send_command` with `machineId: 'lab-ws01'` → the engine is not called and no frame is emitted.
  - `close stops everything`: `onclose` gets `{ code: 1000, wasClean: true }`, and a `send` after close emits nothing.
- [ ] **Step 2:** `pnpm vitest run src/shared/ws/localSocket.test.ts` → FAIL.
- [ ] **Step 3:** Implement. Track pending timers so `close()` can cancel them.
- [ ] **Step 4:** Run the test → PASS. Then run all four gates.
- [ ] **Step 5:** Commit: `feat(ws): LocalSocket speaking the WS envelope contract to a SimEngine`

---

### Task 4: WSClient socket injection

**Files:**
- Modify: `src/shared/ws/client.ts` (config interface, `ws` field type, the single `new WebSocket(...)` call at line ~184)
- Test: `src/shared/ws/client.test.ts` (add cases)

**Interfaces:**
- Produces:
  ```ts
  export interface SocketLike {
    readonly readyState: number;
    binaryType: BinaryType;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    onopen: (() => void) | null;
    onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null;
    onerror: (() => void) | null;
    onmessage: ((event: { data: string | ArrayBuffer }) => void) | null;
  }
  // WSClientConfig gains:
  createSocket?: (url: string, protocols: string[]) => SocketLike;
  ```
- The default factory is `new WebSocket(url, protocols)`. If DOM typings block direct assignment to `SocketLike`, one commented cast in the default factory is allowed (no `any`). `createSocket` is excluded from the `Required<…>` in `ResolvedConfig`, the same way `accessToken` is.
- `LocalSocket` (Task 3) must be assignable to `SocketLike` without a cast. Add `const _check: SocketLike = new LocalSocket(...)` in the test, or use `satisfies`.

- [ ] **Step 1: Write failing tests** in `client.test.ts`:
  - `uses createSocket when provided`: the factory is called once with `(url, protocols)`, and the global `WebSocket` is not constructed.
  - `full handshake over LocalSocket`: `WSClient.getInstance({ url: 'local://sim', createSocket: createLocalSocketFactory(fakeEngine) })`. `connect()` resolves with `capabilities: ['local-sim']`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Leave the rest of `client.ts` untouched.
- [ ] **Step 4:** All four gates → PASS. The existing `client.test.ts` cases must still pass unchanged.
- [ ] **Step 5:** Commit: `feat(ws): optional createSocket injection in WSClient`

---

### Task 5: Middleware + Workspace wiring, end-to-end integration

**Files:**
- Modify: `src/shared/middleware/wsMiddleware.ts`, `src/features/layout/Workspace.tsx:30-41`
- Test: `src/shared/middleware/wsMiddleware.test.ts` (add the `ticket_update` case), `src/engine/localSession.integration.test.ts` (create)

**Interfaces:**
- Consumes: `getEngine`/`setEngine` (Task 1), `createLocalSocketFactory` (Task 3), `createSocket` (Task 4), `mergeTicketUpdate` (existing, `features/tickets/slice.ts`), `DEMO_TICKETS` (Task 2).
- Middleware changes:
  - On `ws/connect` with a URL starting `local:`, pass `createSocket: createLocalSocketFactory(getEngine())`. Any other URL is unchanged.
  - New handler: on `ticket_update`, validate with `TicketUpdatePayloadSchema` from `envelope.ts` **and** check that `status` is one of the five ticket states (`z.enum([...])`). On success, dispatch `mergeTicketUpdate`. Otherwise ignore.
- Workspace demo branch: keep `setQueue(DEMO_TICKETS)`, remove the `DEMO_SUBSYSTEMS` loop, and dispatch `wsConnect({ url: 'local://sim' })`. Leave the non-demo branch unchanged.

- [ ] **Step 1: Write failing tests**
  - `wsMiddleware.test.ts`: a `ticket_update` with `status: 'resolved'` for a queued ticket → that ticket's `state === 'resolved'`. `status: 'banana'` → state unchanged.
  - `localSession.integration.test.ts`: build the real store shape (`ws`, `auth`, `tickets`, `desktop`, `scores` reducers plus `wsMiddleware`) and run `setEngine(fake)`, `setQueue(DEMO_TICKETS)`, `wsConnect({ url: 'local://sim' })`. Then:
    - `connects and seeds panels`: `await vi.waitFor` → `state.ws.connected === true`, and `desktop.subsystems.services` equals the fake `start()` value.
    - `command round trip`: the fake returns `output: 'OK'`, an update to `services`, `ticket: { ticketId: <ws-hr-02 ticket id>, state: 'resolved' }` and `scoring: { ticketId: same, score: 80, feedback: 'read log first' }`. Dispatch `wsSend(send_command ws-hr-02 machine, 'sc start spooler')`. Assert that:
      - `desktop.terminalOutput[<id>]` contains `'OK'`;
      - `subsystems.services` is updated;
      - the ticket's `state === 'resolved'`;
      - `scores.technical === 80` and `scores.feedback === 'read log first'`.
    - `reconnect keeps engine state`: dispatch `wsDisconnect()` then `wsConnect({ url: 'local://sim' })`. `getEngine()` is the same instance, and `start()` was called twice while `handleCommand` state is not reset (the fake counts calls).
  - Use `afterEach(() => { WSClient.resetInstance(); setEngine(null); })`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement the middleware and Workspace changes.
- [ ] **Step 4:** All four gates → PASS. Also run `pnpm run test:e2e tests/e2e/window-stacking.spec.ts` (the CI e2e set) → PASS.
- [ ] **Step 5: Manual check.** Run `pnpm dev`, open `/?demo=1`, select "Print spooler keeps stopping", click Open terminal, and type `sc query spooler`. Expected:
  - the prompt shows `ws-hr-02>`;
  - the "is not recognized…" line appears;
  - the Services panel still shows Spooler stopped;
  - the TopBar shows connected.
- [ ] **Step 6:** Commit: `feat: run demo mode over the local sim transport`
