# Manual Check: Spooler Ticket End-to-End Flow

## Prerequisites
- Dev server running: `pnpm exec vite --host 0.0.0.0 --port 5173`
- Open http://localhost:5173?demo=1 in browser

## Steps to Reproduce

### 1. Start the demo session
1. Open http://localhost:5173?demo=1
2. The ticket queue should show "Print spooler keeps stopping" (helpdesk, medium priority, in_progress)
3. Click on the ticket to select it

### 2. Open terminal
1. Click "Open terminal" button in the ticket detail header
2. A terminal window should open showing: `ws-hr-02> `

### 3. Run diagnostic command: `get-eventlog`
1. Type `get-eventlog` and press Enter
2. **Verify**: Output shows event log entries, each on its own line:
   ```
   [Error] <timestamp> | Event 7034 | The Print Spooler service terminated unexpectedly.
   [Warning] <timestamp> | Event 1014 | Name resolution for the name wpad timed out.
   ```
3. **Verify**: Ticket detail shows "Evidence: 1 item(s)" (was 0 before fix)
4. **Verify**: Ticket state transitions from `open` → `in_progress` (if it was open)

### 4. Run restart command: `restart-service spooler`
1. Type `restart-service spooler` and press Enter
2. **Verify**: Output shows: `The Print Spooler service was restarted successfully.` on its own line
3. **Verify**: No output runs together (each command output ends with `\r\n`)
4. **Verify**: Ticket detail shows "Evidence: 2 item(s)" (or more)
5. **Verify**: Score section appears on the ticket with:
   - Technical: 100/100
   - Process: 100/100
   - Communication: 100/100
   - Feedback: "Correctly checked event log before restart."

### 5. Navigate to /scoring route
1. In the browser, navigate to http://localhost:5173?demo=1#scoring (or use the scoring dashboard link if available)
2. **Verify**: ScoreDashboard shows:
   - Three bars: Technical, Process, Communication — all at 100/100
   - Evidence Log section
   - Feedback entry: "Correctly checked event log before restart."
   - Selected Ticket context (if ticket is selected)

## Expected Results Summary

| Check | Expected |
|-------|----------|
| Each output on own line | ✅ Yes (TerminalWindow.tsx ensures `\r\n` termination) |
| Evidence > 0 | ✅ Yes (commands.ts adds evidence; tickets/slice.ts merges) |
| Score section on ticket | ✅ Yes (TicketDetail.tsx shows score when hasScore) |
| /scoring shows 3 bars + feedback | ✅ Yes (ScoreDashboard.tsx reads from scores slice) |

## Commands Reference

```bash
# Start dev server
pnpm exec vite --host 0.0.0.0 --port 5173

# Run tests
pnpm test -- --run

# Run specific test files
pnpm test -- --run src/engine/commands.test.ts
pnpm test -- --run src/engine/scoring.test.ts
pnpm test -- --run src/engine/localSession.integration.test.ts
pnpm test -- --run src/engine/spooler-e2e.test.ts   # New: full flow test
```

## Files Modified for These Fixes

1. **src/features/desktop/TerminalWindow.tsx** (line 53): Ensures every output chunk ends with `\r\n`
2. **src/engine/commands.ts**: Added `evidence` field to CommandResult; all commands push evidence entries
3. **src/shared/ws/localSocket.ts** (lines 146-154): Passes evidence through to ticket_update WS event
4. **src/features/tickets/slice.ts** (line 200): `mergeTicketUpdate` appends evidence to ticket
5. **src/features/tickets/TicketDetail.tsx** (lines 115-136): Shows Score section when hasScore
6. **src/features/scoring/ScoreDashboard.tsx**: Shows Technical/Process/Communication bars + feedback

## Known Issues (if any)

- ScoreDashboard evidence log shows "No evidence entries yet" - evidence from tickets is not yet fed into scoring slice
- The three aggregate scores (technical/process/communication) currently all show the same value (the single score from engine) - per scoring/slice.ts TODO
- Navigation to /scoring is available via TopBar "Scoring" link (fixed in TopBar.tsx)