import { describe, it, expect } from 'vitest';
import { handleCommand } from './commands';
import { createInitialState } from './machineState';

describe('Spooler ticket end-to-end flow', () => {
  it('runs get-eventlog then restart-service spooler and verifies all checks', () => {
    const config = { machines: [], tickets: [] };
    let state = createInitialState(config);

    // Initial state
    expect(state.ticketState).toBe('in_progress');
    const spooler = state.subsystems.services.find((s) => s.name === 'Spooler');
    expect(spooler?.status).toBe('stopped');
    expect(state.history).toEqual([]);

    // Step 1: Run get-eventlog
    const result1 = handleCommand(state, 'get-eventlog');
    
    // Verify get-eventlog output
    expect(result1.result.exitCode).toBe(0);
    expect(result1.result.output).toContain('Event 7034');
    expect(result1.result.output).toContain('terminated unexpectedly');
    expect(result1.result.output).toContain('Event 1014');
    expect(result1.result.output).toContain('wpad timed out');
    
    // Verify each output is on its own line (split by \r\n)
    const getEventLogLines = result1.result.output.split('\r\n').filter((l) => l.length > 0);
    expect(getEventLogLines.length).toBeGreaterThanOrEqual(2); // At least 2 event log entries
    
    // Verify evidence
    expect(result1.result.evidence).toBeDefined();
    expect(result1.result.evidence!.length).toBeGreaterThan(0);
    expect(result1.result.evidence![0]).toContain('Read event log');
    expect(result1.result.evidence![0]).toContain('Event 7034');
    
    // Verify ticket state transition (open -> in_progress, but already in_progress in demo)
    expect(result1.next.ticketState).toBe('in_progress');
    expect(result1.next.history).toContain('get-eventlog');
    
    state = result1.next;

    // Step 2: Run restart-service spooler
    const result2 = handleCommand(state, 'restart-service spooler');
    
    // Verify restart output
    expect(result2.result.exitCode).toBe(0);
    expect(result2.result.output).toContain('restarted successfully');
    
    // Verify each output is on its own line
    const restartLines = result2.result.output.split('\r\n').filter((l) => l.length > 0);
    expect(restartLines.length).toBe(1); // Single line output
    
    // Verify evidence
    expect(result2.result.evidence).toBeDefined();
    expect(result2.result.evidence!.length).toBeGreaterThan(0);
    expect(result2.result.evidence![0]).toContain('Restarted Print Spooler');
    
    // Verify scoring
    expect(result2.result.scoring).toBeDefined();
    expect(result2.result.scoring!.score).toBe(100);
    expect(result2.result.scoring!.feedback).toBe('Correctly checked event log before restart.');
    expect(result2.result.scoring!.ticketId).toBe('5b0f6c1e-2d4a-4c8e-9f11-0a1b2c3d4e03');
    
    // Verify ticket state transition (in_progress -> resolved)
    expect(result2.result.ticket).toBeDefined();
    expect(result2.result.ticket!.state).toBe('resolved');
    expect(result2.next.ticketState).toBe('resolved');
    expect(result2.next.history).toContain('restart-service spooler');
    
    // Verify service status changed
    const finalSpooler = result2.next.subsystems.services.find((s) => s.name === 'Spooler');
    expect(finalSpooler?.status).toBe('running');

    // Step 3: Overall verification
    // Total evidence > 0
    const totalEvidence = (result1.result.evidence?.length || 0) + (result2.result.evidence?.length || 0);
    expect(totalEvidence).toBeGreaterThan(0);

    // Score section would appear on ticket (hasScore = true when technical/process/communication > 0)
    // This is verified by the scoring object being present with score 100
    expect(result2.result.scoring!.score).toBe(100);
  });
});