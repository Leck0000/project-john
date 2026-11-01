# TEST_STRATEGY.md — Project John (SysDesk)

## Test Pyramid

| Layer | Tool | What to Test | Pattern |
|-------|------|--------------|---------|
| **Pure transitions** | Vitest | Each `*Transition` function: input state + command → output state | Table-driven: `[cmd, before, after]` |
| **Command parsing** | Vitest | String → `ParsedCommand` (valid/invalid) | Property-based for edge cases |
| **Engine contract** | Vitest | `SimEngine` impl satisfies `start()`/`handleCommand()` signatures | Fake engine in integration tests |
| **LocalSocket framing** | Vitest | Zod validation, envelope stamping, frame order, error handling | Mock `onmessage`, capture emitted frames |
| **Redux integration** | Vitest + jsdom | `wsMiddleware` dispatches correct actions for each frame type | Real store + fake engine + LocalSocket |
| **E2E flows** | Playwright | Full trainee workflow: connect → command → panel updates → ticket resolve | `local://sim` URL, no backend |

---

## Core Principle: Test the Engine Contract

**Never test implementation details**. The `SimEngine` interface (`start()`, `handleCommand()`) is the contract. Swap `createStubEngine` for real engine in tests without changing test code.

### Pure Transition Table-Driven Tests

```ts
// tests/engine/transitions.test.ts
import { describe, it, expect } from 'vitest'
import { servicesTransition } from '../engine/commands/services'
import { registryTransition } from '../engine/commands/registry'

// Define test cases: [commandName, inputState, expectedOutputState]
const servicesTests = [
  ['START_SERVICE', { isRunning: false, error: null }, { isRunning: true, error: null }],
  ['STOP_SERVICE', { isRunning: true, error: null }, { isRunning: false, error: null }],
  ['RESTART_SERVICE', { isRunning: true, error: 'timeout' }, { isRunning: true, error: null }],
]

const registryTests = [
  ['QUERY_VALUE', { keys: ['HKEY_CURRENT_USER\\Software'], error: null }, { keys: ['HKEY_CURRENT_USER\\Software'], error: null, valueData: found }],
  ['CREATE_KEY', { keys: [], error: null }, { keys: ['NewKey'], error: null }),
]

// Run all transition tests
servicesTests.forEach(([cmd, before, after]) => {
  it(`servicesTransition("${cmd}" produces correct state`, () => {
    const result = servicesTransition(before, { type: cmd, payload: {} })
    expect(result).toEqual(after)
  })
})
```

---

## Deterministic Testing for Tick-Based Simulation

**No hard sleeps ever**. The engine is command-driven (pure functions), so tests advance by invoking `handleCommand()`, not by waiting.

### Controlled Tick Advancement (optional, for topology simulation)

If/when a `BackgroundSimulator` is added (§4.7 of ADR-001), tests control tick advancement via a fake timer:

```ts
// Test control
vi.useFakeTimers()
await act(async () => {
  vi.advanceTimersByTime(1000) // Advance 1s topology tick
})
// Assert topology state changed as expected
vi.useRealTimers()
```

**Default**: Tests never need timers. All state changes are command-triggered.

---

## Test Data Factories for Simulation Scenarios

Every test creates its own data via API-style factories, not shared state.

```ts
// tests/factories.ts
export const createTicket = (overrides = {}) => ({
  id: `tick-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type: 'hardware' /* or 'software', 'network', 'security' */,
  severity: 'medium',
  symptoms: ['symptom1'],
  status: 'open' /* 'in-progress', 'resolved', 'closed' */,
  ...overrides,
})

export const createMachineState = (overrides = {}) => ({
  subsystems: {
    services: { isRunning: false, error: null },
    registry: { keys: [], error: null },
    // ...other subsystems
  },
  history: [],
  ...overrides,
})
```

---

## CI Pipeline Config (GitHub Actions)

```yaml
# .github/workflows/test.yml
name: Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1/4, 2/4, 3/4, 4/4]
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm test:unit  # Vitest unit + integration
      - run: npx playwright test --shard=${{ matrix.shard }}  # E2E only on main
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: test-results-${{ matrix.shard }}
          path: [project-john]/test-results/
```

### Test Isolation Rules
- **Per-test data**: Every test creates what it needs via factories; no shared seed user/state
- **Parallel safety**: No test depends on another test's leftovers; unique ticket IDs per test
- **Worker-scoped auth**: If backend auth is ever added, use worker- `.auth/worker-${index}.json` pattern

---

## Flake Elimination Strategy for Time-Dependent Tests

### Symptom → Root Cause → Fix Table

| Symptom | Likely Root Cause | The Fix (not workaround) |
|---------|-------------------|--------------------------|
| Passes locally, fails in CI | CI is slower, race exposed | Replace time-based waits with condition-based; audit for `waitForTimeout` |
| Fails only in parallel runs | Shared state across tests | Per-test data via factories; unique IDs |
| Fails ~1 in 20 with element-not-found | Render race, unstable selector | Web-first assertion on final state; role/test-id selector |
| Fails after "unrelated" merge | Hidden coupling to seed data | Make test own its data; delete shared seed dependency |
| Timeout on navigation | Third-party script blocking load | Block third-party routes; wait on app-ready signal, not `load` |

### Flake Triage Process
1. Run test 10x locally (`--repeat-each=10`) before review
2. If flaky, root-cause within 24 hours → file ticket
3. Every flake gets a root-cause ticket; deleting without diagnosis deletes bug report
4. As flakes are fixed, tighten retries downward → end state: retries=0

### Pass-on-Retry Detection
- If a test passes with retries, it's flaky → doesn't merge
- Retry-on-failure exists to *measure* flakiness, not treat it
- End goal: 0 retries, merge-blocking suite at ≥99.5% pass rate

### Success Metrics
- Merge-blocking suite pass rate ≥ 99.5% with retries set to at most 1, trending to 0
- Flake rate (pass-on-retry) below 0.5% of test executions, every flake root-caused within a week
- Full suite completes in under 10 minutes via sharding
- 100% of CI failures debuggable from attached artifacts alone
- New tests pass 10 consecutive repeat runs before merge, 100% of the time