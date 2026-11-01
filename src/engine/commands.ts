/**
 * Command handling — turns a terminal line into an output and a new state.
 *
 * Each command is a pure function: it takes the current MachineState and a
 * command line, and returns the output text plus the NEXT state. Read
 * commands return the same state object; write commands return a new state.
 *
 * This file is the only place terminal lines are interpreted. The engine in
 * index.ts calls handleCommand() for every keystroke the trainee types.
 */

import { MachineState } from './machineState';

export interface CommandResult {
  output: string;
  exitCode: number;
  updates?: { subsystem: string; value: unknown }[];
  /** `score` is an integer from 0 to 100. */
  scoring?: { ticketId: string; score: number; feedback?: string };
  /** Ticket state transition if this command changes it. */
  ticket?: { ticketId: string; state: 'open' | 'in_progress' | 'on_hold' | 'resolved' | 'closed' };
}

interface HandleOutcome {
  result: CommandResult;
  next: MachineState;
}

/** Runs one command against the current state. */
export function handleCommand(state: MachineState, line: string): HandleOutcome {
  const cmd = line.trim().toLowerCase();

  if (cmd === '') {
    return { result: { output: '', exitCode: 0 }, next: state };
  }

  // --- Write commands: they change state and record what the trainee did. ---

  if (cmd === 'sc start spooler') {
    const svc = state.subsystems.services.find((s) => s.name.toLowerCase() === 'spooler');
    if (!svc) return { result: { output: `Service 'spooler' not found.`, exitCode: 1 }, next: state };
    if (svc.status === 'running') {
      return { result: { output: 'The service is already running.', exitCode: 0 }, next: state };
    }
    const readEventLog = state.history.includes('get-eventlog');
    const score = readEventLog ? 100 : 0;
    const nextTicketState = readEventLog && state.ticketState === 'in_progress' ? 'resolved' : state.ticketState;
    return {
      result: {
        output: 'The Print Spooler service was started successfully.',
        exitCode: 0,
        scoring: { ticketId: 'spooler-ticket', score, feedback: readEventLog ? 'Correctly checked event log before restart.' : 'Did not check event log before restart.' },
        ...(nextTicketState !== state.ticketState ? { ticket: { ticketId: 'spooler-ticket', state: nextTicketState } } : {}),
      },
      next: {
        ...state,
        subsystems: {
          ...state.subsystems,
          services: state.subsystems.services.map((s) =>
            s.name === 'Spooler' ? { ...s, status: 'running' } : s,
          ),
        },
        history: [...state.history, 'sc start spooler'],
        ticketState: nextTicketState,
      },
    };
  }

  if (cmd === 'restart-service spooler') {
      const svc = state.subsystems.services.find((s) => s.name.toLowerCase() === 'spooler');
      if (!svc) return { result: { output: `Service 'spooler' not found.`, exitCode: 1 }, next: state };
      const readEventLog = state.history.includes('get-eventlog');
      const score = readEventLog ? 100 : 0;
      const nextTicketState = readEventLog && state.ticketState === 'in_progress' ? 'resolved' : state.ticketState;
      return {
        result: {
          output: 'The Print Spooler service was restarted successfully.',
          exitCode: 0,
          scoring: { ticketId: 'spooler-ticket', score, feedback: readEventLog ? 'Correctly checked event log before restart.' : 'Did not check event log before restart.' },
          ...(nextTicketState !== state.ticketState ? { ticket: { ticketId: 'spooler-ticket', state: nextTicketState } } : {}),
        },
        next: {
          ...state,
          subsystems: {
            ...state.subsystems,
            services: state.subsystems.services.map((s) =>
              s.name === 'Spooler' ? { ...s, status: 'running' } : s,
            ),
          },
          history: [...state.history, 'restart-service spooler'],
          ticketState: nextTicketState,
        },
      };
    }

    if (cmd === 'close-ticket') {
      if (state.ticketState !== 'resolved') {
        return { result: { output: 'Ticket must be resolved before closing.', exitCode: 1 }, next: state };
      }
      return {
        result: {
          output: 'Ticket closed.',
          exitCode: 0,
          ticket: { ticketId: 'spooler-ticket', state: 'closed' },
        },
        next: { ...state, ticketState: 'closed' },
      };
    }

    // --- Read commands: they report state and leave it untouched. ---

    // First diagnostic command transitions open → in_progress
    const isDiagnostic = ['sc query spooler', 'get-service', 'get-eventlog', 'sc query'].includes(cmd);
    const nextTicketState = state.ticketState === 'open' && isDiagnostic ? 'in_progress' : state.ticketState;

    if (cmd === 'sc query spooler') {
        if (nextTicketState !== state.ticketState) {
          return { result: { output: formatServiceQuery(state, 'Spooler'), exitCode: 0, ticket: { ticketId: 'spooler-ticket', state: nextTicketState } }, next: { ...state, ticketState: nextTicketState } };
        }
        return { result: { output: formatServiceQuery(state, 'Spooler'), exitCode: 0 }, next: state };
      }
      if (cmd === 'get-service') {
        if (nextTicketState !== state.ticketState) {
          return { result: { output: formatServiceList(state), exitCode: 0, ticket: { ticketId: 'spooler-ticket', state: nextTicketState } }, next: { ...state, ticketState: nextTicketState } };
        }
        return { result: { output: formatServiceList(state), exitCode: 0 }, next: state };
      }
      if (cmd === 'get-eventlog') {
        if (nextTicketState !== state.ticketState) {
          return {
            result: { output: formatEventLog(state), exitCode: 0, ticket: { ticketId: 'spooler-ticket', state: nextTicketState } },
            next: { ...state, history: [...state.history, 'get-eventlog'], ticketState: nextTicketState },
          };
        }
        return {
          result: { output: formatEventLog(state), exitCode: 0 },
          next: { ...state, history: [...state.history, 'get-eventlog'] },
        };
      }
      if (cmd === 'sc query') {
        if (nextTicketState !== state.ticketState) {
          return { result: { output: formatServiceList(state), exitCode: 0, ticket: { ticketId: 'spooler-ticket', state: nextTicketState } }, next: { ...state, ticketState: nextTicketState } };
        }
        return { result: { output: formatServiceList(state), exitCode: 0 }, next: state };
      }

  return {
    result: {
      output: `'${line}' is not recognized as an internal or external command, operable program or batch file.`,
      exitCode: 1,
    },
    next: state,
  };
}

function formatServiceQuery(state: MachineState, name: string): string {
  const svc = state.subsystems.services.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (!svc) return `Service '${name}' not found.`;
  return [
    `SERVICE_NAME: ${svc.name}`,
    `DISPLAY_NAME: ${svc.displayName}`,
    `STATUS      : ${svc.status.toUpperCase()}`,
    `START_MODE  : ${svc.startMode.toUpperCase()}`,
  ].join('\r\n');
}

function formatServiceList(state: MachineState): string {
  return state.subsystems.services
    .map((s) => `${s.status.toUpperCase().padEnd(7)} ${s.name.padEnd(20)} ${s.displayName}`)
    .join('\r\n');
}

function formatEventLog(state: MachineState): string {
  const log = state.subsystems['event-log'];
  if (log.length === 0) return 'No events.';
  return log
    .map((e) => `[${e.level}] ${e.timeGenerated} | Event ${e.eventId ?? '-'} | ${e.message}`)
    .join('\r\n');
}