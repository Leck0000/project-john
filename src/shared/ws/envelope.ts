/**
 * WebSocket Envelope Types
 * 
 * Based on ARCHITECTURE.md section 4.5 WebSocket Event Schema (real-time sync)
 * All messages JSON with mandatory envelope.
 */

import { z } from 'zod';

/**
 * Base envelope schema - matches server protocol v1
 */
export const WSEnvelopeSchema = z.object({
  v: z.literal(1),
  t: z.string(),
  sid: z.string().uuid(),
  seq: z.number().int().nonnegative(),
  ts: z.number().int().nonnegative(),
  payload: z.unknown(),
});

export type WSEnvelope<T = unknown> = z.infer<typeof WSEnvelopeSchema> & { payload: T };

/**
 * Server-to-Client event payload schemas
 */

// cmd.result: { cmdId, exitCode, stdout, stderr }
export const CmdResultPayloadSchema = z.object({
  cmdId: z.string().uuid(),
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
});
export type CmdResultPayload = z.infer<typeof CmdResultPayloadSchema>;

// state.delta: { subsystem, path, op:"set"|"delete", value? }
export const StateDeltaPayloadSchema = z.object({
  subsystem: z.string(),
  path: z.string(),
  op: z.enum(['set', 'delete']),
  value: z.unknown().optional(),
});
export type StateDeltaPayload = z.infer<typeof StateDeltaPayloadSchema>;

// topology.delta: { nodeId, attr, value }
export const TopologyDeltaPayloadSchema = z.object({
  nodeId: z.string().uuid(),
  attr: z.string(),
  value: z.unknown(),
});
export type TopologyDeltaPayload = z.infer<typeof TopologyDeltaPayloadSchema>;

// ticket.updated: Ticket (from ARCHITECTURE.md 3.1)
export const TicketPayloadSchema = z.object({
  id: z.string().uuid(),
  queue: z.enum(['AD', 'networking', 'security', 'helpdesk']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  category: z.string().optional(),
  state: z.enum(['open', 'in_progress', 'on_hold', 'resolved', 'closed']),
  evidence: z.array(z.string()).default([]),
  scoring: z.object({
    technical: z.number().int().min(0).max(20),
    process: z.number().int().min(0).max(20),
    communication: z.number().int().min(0).max(20),
  }).default({ technical: 0, process: 0, communication: 0 }),
  requesterId: z.string().uuid(),
  assignedTechnicianId: z.string().uuid().optional(),
  relatedMachineId: z.string().uuid().optional(),
  labId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TicketPayload = z.infer<typeof TicketPayloadSchema>;

// session.init: { sessionId, userPrincipal, caps[] }
export const SessionInitPayloadSchema = z.object({
  sessionId: z.string().uuid(),
  userPrincipal: z.string(),
  caps: z.array(z.string()),
});
export type SessionInitPayload = z.infer<typeof SessionInitPayloadSchema>;

// heartbeat: {}
export const HeartbeatPayloadSchema = z.object({});
export type HeartbeatPayload = z.infer<typeof HeartbeatPayloadSchema>;

/**
 * Client-to-Server event payload schemas
 */

// client.ack: { seq }
export const ClientAckPayloadSchema = z.object({
  seq: z.number().int().nonnegative(),
});
export type ClientAckPayload = z.infer<typeof ClientAckPayloadSchema>;

// authenticate: JWT
export const AuthenticatePayloadSchema = z.object({
  token: z.string(),
});
export type AuthenticatePayload = z.infer<typeof AuthenticatePayloadSchema>;

// request_machine_state: { machineId }
export const RequestMachineStatePayloadSchema = z.object({
  machineId: z.string().uuid(),
});
export type RequestMachineStatePayload = z.infer<typeof RequestMachineStatePayloadSchema>;

// send_command: { machineId, command }
export const SendCommandPayloadSchema = z.object({
  machineId: z.string().uuid(),
  command: z.string(),
});
export type SendCommandPayload = z.infer<typeof SendCommandPayloadSchema>;

// add_ticket_message: { ticketId, message }
export const AddTicketMessagePayloadSchema = z.object({
  ticketId: z.string().uuid(),
  message: z.string(),
});
export type AddTicketMessagePayload = z.infer<typeof AddTicketMessagePayloadSchema>;

// claim_ticket: { ticketId }
export const ClaimTicketPayloadSchema = z.object({
  ticketId: z.string().uuid(),
});
export type ClaimTicketPayload = z.infer<typeof ClaimTicketPayloadSchema>;

/**
 * Additional event types from ARCHITECTURE.md section 5.6
 */

// machine_state_delta
export const MachineStateDeltaPayloadSchema = z.object({
  machineId: z.string().uuid(),
  state: z.enum(['idle', 'running', 'error', 'complete']),
  cpu: z.number(),
  mem: z.number(),
  timestamp: z.string().datetime(),
});
export type MachineStateDeltaPayload = z.infer<typeof MachineStateDeltaPayloadSchema>;

// command_output
export const CommandOutputPayloadSchema = z.object({
  machineId: z.string().uuid(),
  output: z.string(),
  exitCode: z.number().int(),
  timestamp: z.string().datetime(),
});
export type CommandOutputPayload = z.infer<typeof CommandOutputPayloadSchema>;

// ticket_update
export const TicketUpdatePayloadSchema = z.object({
  ticketId: z.string().uuid(),
  status: z.string(),
  assigneeId: z.string().uuid().optional(),
  evidence: z.array(z.string()).optional(),
  timestamp: z.string().datetime(),
});
export type TicketUpdatePayload = z.infer<typeof TicketUpdatePayloadSchema>;

// requester_message
export const RequesterMessagePayloadSchema = z.object({
  ticketId: z.string().uuid(),
  from: z.enum(['requester', 'system']),
  message: z.string(),
  timestamp: z.string().datetime(),
});
export type RequesterMessagePayload = z.infer<typeof RequesterMessagePayloadSchema>;

// scoring_update
export const ScoringUpdatePayloadSchema = z.object({
  ticketId: z.string().uuid(),
  score: z.number(),
  feedback: z.string().optional(),
  timestamp: z.string().datetime(),
});
export type ScoringUpdatePayload = z.infer<typeof ScoringUpdatePayloadSchema>;

// lab_progress
export const LabProgressPayloadSchema = z.object({
  labId: z.string().uuid(),
  progress: z.number().min(0).max(100),
  activeMachines: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
});
export type LabProgressPayload = z.infer<typeof LabProgressPayloadSchema>;

/**
 * Union types for all known event types
 */
export type ServerToClientPayload =
  | CmdResultPayload
  | StateDeltaPayload
  | TopologyDeltaPayload
  | TicketPayload
  | SessionInitPayload
  | HeartbeatPayload
  | MachineStateDeltaPayload
  | CommandOutputPayload
  | TicketUpdatePayload
  | RequesterMessagePayload
  | ScoringUpdatePayload
  | LabProgressPayload;

export type ClientToServerPayload =
  | ClientAckPayload
  | HeartbeatPayload
  | AuthenticatePayload
  | RequestMachineStatePayload
  | SendCommandPayload
  | AddTicketMessagePayload
  | ClaimTicketPayload;

/**
 * Event type constants for type-safe dispatching
 */
export const ServerEventType = {
  CMD_RESULT: 'cmd.result',
  STATE_DELTA: 'state.delta',
  TOPOLOGY_DELTA: 'topology.delta',
  TICKET_UPDATED: 'ticket.updated',
  SESSION_INIT: 'session.init',
  HEARTBEAT: 'heartbeat',
  MACHINE_STATE_DELTA: 'machine_state_delta',
  COMMAND_OUTPUT: 'command_output',
  TICKET_UPDATE: 'ticket_update',
  REQUESTER_MESSAGE: 'requester_message',
  SCORING_UPDATE: 'scoring_update',
  LAB_PROGRESS: 'lab_progress',
} as const;

export const ClientEventType = {
  CLIENT_ACK: 'client.ack',
  /** heartbeat flows both ways (ARCHITECTURE.md §5.6) */
  HEARTBEAT: 'heartbeat',
  AUTHENTICATE: 'authenticate',
  REQUEST_MACHINE_STATE: 'request_machine_state',
  SEND_COMMAND: 'send_command',
  ADD_TICKET_MESSAGE: 'add_ticket_message',
  CLAIM_TICKET: 'claim_ticket',
} as const;

export type ServerEventType = (typeof ServerEventType)[keyof typeof ServerEventType];
export type ClientEventType = (typeof ClientEventType)[keyof typeof ClientEventType];

/**
 * Type guards for runtime validation
 */
export function isServerEventType(type: string): type is ServerEventType {
  return Object.values(ServerEventType).includes(type as ServerEventType);
}

export function isClientEventType(type: string): type is ClientEventType {
  return Object.values(ClientEventType).includes(type as ClientEventType);
}

/**
 * Create a typed envelope
 */
export function createEnvelope<T extends ClientToServerPayload>(
  type: ClientEventType,
  payload: T,
  sessionId: string,
  seq: number
): WSEnvelope<T> {
  return {
    v: 1,
    t: type,
    sid: sessionId,
    seq,
    ts: Date.now(),
    payload,
  };
}

/**
 * Parse and validate incoming envelope
 */
export function parseEnvelope<T>(data: unknown): WSEnvelope<T> | null {
  const result = WSEnvelopeSchema.safeParse(data);
  if (!result.success) {
    return null;
  }
  return result.data as WSEnvelope<T>;
}