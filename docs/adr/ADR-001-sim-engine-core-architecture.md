# ADR-001: Sim Engine Core Architecture

## Status
Accepted

## Context

Project:John is a browser-based IT/help desk simulator where trainees interact with simulated Windows machines via an xterm.js terminal. The simulation engine must:

- Run entirely in-browser (no backend dependency for local/demo mode)
- Be deterministic: same commands → same results
- Support 6 Windows subsystems (Services, Event Log, Registry, Network, AD, Filesystem)
- Handle ~62 commands across subsystem categories
- Integrate with Redux store via WS middleware as single source of truth
- Meet strict TypeScript constraints (no `any`, `noUncheckedIndexedAccess`)
- Validate all boundaries with Zod schemas
- Support responsive layout (desktop ≥1280px, drawer collapses <1024px)

The current implementation uses a stub engine (`stubEngine.ts`) that delegates to `machineState.ts` (state) and `commands.ts` (pure command handlers). The `LocalSocket` class acts as an in-browser WebSocket stand-in that drives the engine and emits validated frames. The Redux `wsMiddleware` connects the socket to the store.

Key architectural questions:
1. **Tick loop vs event-driven**: The ARCHITECTURE.md describes a 1s simulation tick for topology, but the current engine is purely command-driven (no autonomous tick). Which model fits?
2. **State machine granularity**: Per-subsystem FSMs (ARCHITECTURE.md §4.1) vs single `MachineState` object with pure transition functions?
3. **Simulation vs UI state separation**: Redux holds both terminal output (UI) and subsystem snapshots (simulation). Where is the boundary?
4. **Testing strategy**: Unit test pure functions? Integration test via LocalSocket + Redux? E2E via Playwright?

## Decision

### 1. Core Architecture: Command-Driven, Not Tick-Driven

**Adopt a pure command-driven model** (current `handleCommand` pattern) as the primary execution model. The 1s "simulation tick" from ARCHITECTURE.md applies only to **server-room topology simulation** (link latency, power budget, failure injection) — a separate concern from the workstation subsystems the trainee interacts with.

- Workstation subsystems (Services, Registry, Event Log, Network, AD, Filesystem) are **passive**: they change only when a command executes
- Topology simulation (if needed) runs on a **separate optional tick loop** that emits `topology.delta` frames independently
- This keeps the engine synchronous, deterministic, and testable without timers

### 2. State Machine Pattern: Pure Transition Functions per Subsystem

**Model each subsystem as a pure transition function** `transition(state, command) → nextState`, not as a class-based FSM.

```ts
// Per-subsystem transition (in commands.ts or dedicated files)
function servicesTransition(state: ServicesState, cmd: ParsedCommand): ServicesState
function registryTransition(state: RegistryState, cmd: ParsedCommand): RegistryState
// ...
```

- **Why**: Pure functions compose, are trivial to unit test, and enforce immutability
- **State shape**: Each subsystem owns its slice of `MachineState.subsystems`
- **Command parsing**: Separate parsing (string → structured `ParsedCommand`) from transition logic
- **History**: Append to `MachineState.history` only for write commands (audit trail)

### 3. Simulation vs UI State Separation

**Strictly separate two state domains:**

| Domain | Owner | Contents | Mutation |
|--------|-------|----------|----------|
| **Simulation State** | `SimEngine` (single instance) | `MachineState` per machine: subsystems + command history | Only via `handleCommand` (pure) |
| **UI State** | Redux store (`desktopSlice`, `ticketsSlice`, etc.) | Window management, terminal output buffers, panel visibility, z-order, active window | Redux reducers (actions from WS frames) |

**Boundary rules:**
- `SimEngine` **never** imports Redux, React, or UI types
- `SimEngine.start()` returns `SubsystemUpdate[]` — a pure snapshot for initial panel hydration
- `SimEngine.handleCommand()` returns `CommandResult` — structured data, no side effects
- `LocalSocket` (adapter) translates `CommandResult` → validated WS frames → Redux via `wsMiddleware`
- Redux **never** mutates simulation state directly; it only receives deltas from the engine

This is **Ports & Adapters (Hexagonal)**: `SimEngine` is the core domain; `LocalSocket` + `wsMiddleware` are adapters; Redux slices are delivery mechanisms.

### 4. Event System: Structured Frames, Not Pub/Sub

**Use the existing WS envelope schema** as the canonical event contract. No internal pub/sub bus.

- Engine emits `CommandResult` with optional `updates[]`, `ticket`, `scoring`
- `LocalSocket` validates each frame against Zod schemas, stamps envelope (`v`, `t`, `sid`, `seq`, `ts`)
- Frames delivered asynchronously (setTimeout 0) to mimic real WS ordering
- `wsMiddleware` redistributes frames to Redux slices via typed actions

**Frame order guarantee** (from `types.ts`):
1. `command_output` (always)
2. Each `state.delta` from `updates[]` (in array order)
3. `ticket_update` (if present)
4. `scoring_update` (if present)

### 5. Testing Strategy Alignment

| Layer | Tool | What to Test | Pattern |
|-------|------|--------------|---------|
| **Pure transitions** | Vitest | Each `*Transition` function: input state + command → output state | Table-driven: `[cmd, before, after]` |
| **Command parsing** | Vitest | String → `ParsedCommand` (valid/invalid) | Property-based for edge cases |
| **Engine contract** | Vitest | `SimEngine` impl satisfies `start()`/`handleCommand()` signatures | Fake engine in integration tests |
| **LocalSocket framing** | Vitest | Zod validation, envelope stamping, frame order, error handling | Mock `onmessage`, capture emitted frames |
| **Redux integration** | Vitest + jsdom | `wsMiddleware` dispatches correct actions for each frame type | Real store + fake engine + LocalSocket |
| **E2E flows** | Playwright | Full trainee workflow: connect → command → panel updates → ticket resolve | `local://sim` URL, no backend |

**Key principle**: Test the **engine contract** (`SimEngine` interface), not implementation details. Swap `createStubEngine` for real engine in tests without changing test code.

## Consequences

### What becomes easier
- **Deterministic replay**: Same command sequence → identical state (engine is pure)
- **Unit testing**: Every transition is a pure function; no mocks needed for engine core
- **Engine swap**: Replace `createStubEngine` with a topology-aware engine without touching UI/Redux
- **Offline/demo mode**: `local://sim` works identically to real backend (same frames)
- **Time-travel debugging**: `MachineState.history` + Redux DevTools = full session replay

### What becomes harder
- **Autonomous background simulation** (e.g., services failing spontaneously, network flapping): Requires opt-in tick loop that emits `state.delta` frames without user commands. Must be designed as a separate `BackgroundSimulator` that holds a `SimEngine` reference and drives it.
- **Cross-machine commands** (e.g., `ping ws-ops-12` from `ws-finance-07`): Engine currently single-machine. Needs `MachineRegistry` to route commands and share topology state.
- **Large state snapshots**: `start()` returns all subsystems. For 6 subsystems × many machines, consider lazy/subscription-based hydration.

### Trade-offs acknowledged
| Chosen | Rejected | Reason |
|--------|----------|--------|
| Pure functions + immutable state | Class-based FSM with internal state | Testability, TypeScript strictness, no `this` binding issues |
| Command-driven only (no mandatory tick) | 1s tick for all subsystems | Workstation subsystems are event-driven by nature; tick adds complexity without value |
| Single `SimEngine` instance per page | Per-machine engine instances | ARCHITECTURE.md §4.7: session isolation via namespace prefix, not process isolation. Single engine simpler for MVP. |
| Zod at adapter boundary (LocalSocket) | Zod inside engine | Engine stays schema-agnostic; validation is an adapter concern |

## Implementation Notes

1. **Extract parsing layer** from `commands.ts` → `commandParser.ts` (string → `ParsedCommand` discriminated union)
2. **Split `commands.ts`** into per-subsystem files under `src/engine/commands/` (services.ts, registry.ts, etc.)
3. **Add `ParsedCommand` type** to `types.ts` for compile-time command handling
4. **Introduce `BackgroundSimulator`** (optional) for topology tick — emits `topology.delta` frames via same `LocalSocket` path
5. **Document `SimEngine` contract** in `types.ts` with JSDoc examples for implementers

## Related ADRs

- ADR-002: State Management Pattern (Simulation vs UI)
- ADR-003: Testing Strategy for Simulation Engine
- ADR-004: Background Topology Simulation (future)

---

*Decision made: 2026-10-31. Review when: topology simulation needed, or engine grows beyond single-machine scope.*