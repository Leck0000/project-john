# Project:John API Contracts

## Base URL
```
http://localhost:8080/api/v1
```

## Authentication
- **Login**: `POST /auth/login`
  - Body: `{ email: string, password: string }`
  - Response: `{ accessToken: string, refreshToken: string, expiresIn: number, user: { id, role, name } }`

- **Refresh**: `POST /auth/refresh`
  - Body: `{ refreshToken: string }`
  - Response: `{ accessToken: string, expiresIn: number }`

- **Revoke**: `POST /auth/revoke`
  - Body: `{ refreshToken: string }`
  - Response: `{ success: boolean }`

### Role Claims
- `technician`: can view/ticket assignment, machine ops, limited lab edit.
- `instructor`: can create labs, assign tickets, view scoring, issue certificates.
- `admin`: full CRUD across all resources, user management, system settings.

All authenticated routes require `Authorization: Bearer <accessToken>` header.

## Rate Limits
| Endpoint | Limit | Window |
|---|---|---|
| `/auth/*` | 5 attempts / 5 min | per IP |
| Public read endpoints (`/tickets`, `/labs`, `/machines`) | 60 req/min | per user |
| Write mutations (`/tickets/assign`, `/certificates/issue`) | 10 req/min | per user |
| WebSocket subscriptions | 2 concurrent per user | indefinite |

Exceeded limits return `429 Too Many Requests` with `Retry-After` header.

## Error Codes
| Code | Meaning |
|---|---|
| 400 | Bad Request – validation, idempotency conflict |
| 401 | Unauthorized – missing/invalid token |
| 403 | Forbidden – role insufficient |
| 404 | Not Found – resource missing |
| 409 | Conflict – duplicate, idempotency key reused with different payload |
| 415 | Unsupported Media Type – expected `application/json` |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

### Error Response Schema (Zod)
```ts
import { z } from 'zod';

export const ErrorResponse = z.object({
  code: z.number().int(),
  message: z.string(),
  path: z.string().optional(),
  timestamp: z.string().datetime(),
  requestId: z.string().uuid(),
});

export type ErrorResponse = z.infer<typeof ErrorResponse>;
```

## REST Endpoints

### Auth
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/revoke`

### Users
- `GET /users/me` – current user profile
- `GET /users/:id` – retrieve user by ID (admin/instructor only)
- `PATCH /users/:id` – update profile (partial)
- `POST /users` – create user (admin only)

### Tickets
- `GET /tickets` – list tickets (filter: status, assignee, lab, priority)
- `GET /tickets/:id` – retrieve ticket
- `POST /tickets` – create ticket (requester or instructor)
- `PATCH /tickets/:id` – update ticket status/priority/assignee
- `POST /tickets/:id/complete` – mark ticket complete (assign scoring)
- `POST /tickets/:id/idempotency` – retry with idempotency key

### Machines
- `GET /machines` – list machines (filter: lab, status, type)
- `GET /machines/:id` – retrieve machine spec
- `POST /machines` – add machine (admin/instructor)
- `PATCH /machines/:id` – update machine state
- `POST /machines/:id/start` – start machine simulation
- `POST /machines/:id/stop` – stop machine simulation

### Labs
- `GET /labs` – list labs (active, archived)
- `GET /labs/:id` – retrieve lab with associated machines/tickets
- `POST /labs` – create lab
- `PATCH /labs/:id` – update lab config
- `DELETE /labs/:id` – archive lab (admin)

### Certificates
- `GET /certificates` – list issued certificates (filter: user, lab, status)
- `GET /certificates/:id` – retrieve certificate details
- `POST /certificates/issue` – issue certificate for completed lab/ticket path
- `POST /certificates/validate` – validate certificate hash

### Teams
- `GET /teams` – list teams
- `GET /teams/:id` – retrieve team with members
- `POST /teams` – create team
- `PATCH /teams/:id` – update team membership/role
- `DELETE /teams/:id` – disband team (admin)

## WebSocket Event Types
Connection: `ws://localhost:8080/api/v1/ws?accessToken=<jwt>`

| Event | Direction | Payload (Zod) |
|---|---|---|
| `machine_state_delta` | Server → Client | `{ machineId: string, state: 'idle'|'running'|'error'|'complete', cpu: number, mem: number, timestamp: string }` |
| `command_output` | Server → Client | `{ machineId: string, output: string, exitCode: number, timestamp: string }` |
| `ticket_update` | Server → Client | `{ ticketId: string, status: string, assigneeId?: string, timestamp: string }` |
| `requester_message` | Server → Client | `{ ticketId: string, from: 'requester'|'system', message: string, timestamp: string }` |
| `scoring_update` | Server → Client | `{ ticketId: string, score: number, feedback?: string, timestamp: string }` |
| `lab_progress` | Server → Client | `{ labId: string, progress: number (0-100), activeMachines: number, timestamp: string }` |

### Client → Server Events
- `authenticate` – send JWT for WS session validation
- `request_machine_state` – `{ machineId: string }` → triggers `machine_state_delta`
- `send_command` – `{ machineId: string, command: string }` → triggers `command_output`
- `add_ticket_message` – `{ ticketId: string, message: string }` → triggers `requester_message`
- `claim_ticket` – `{ ticketId: string }`

## Request/Response Schemas (TypeScript/Zod)

### CreateTicket
```ts
import { z } from 'zod';

export const CreateTicket = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  labId: z.string().uuid(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  requesterId: z.string().uuid(),
});

export type CreateTicketInput = z.infer<typeof CreateTicket>;
```

### Ticket Response
```ts
export const TicketResponse = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(['open', 'in_progress', 'on_hold', 'resolved', 'closed']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  labId: z.string().uuid(),
  assigneeId: z.string().uuid().nullable(),
  requesterId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  scores: z.array(ScoreEntry).nullable(),
});

export type TicketResponse = z.infer<typeof TicketResponse>;
```

### ScoreEntry (used in TicketResponse)
```ts
export const ScoreEntry = z.object({
  criterion: z.string(),
  points: z.number().int().min(0),
  max: z.number().int().min(0),
});

export type ScoreEntry = z.infer<typeof ScoreEntry>;
```

### MachineStateDelta (WS)
```ts
export const MachineStateDelta = z.object({
  machineId: z.string(),
  state: z.enum(['idle', 'running', 'error', 'complete']),
  cpu: z.number().min(0).max(100),
  mem: z.number().min(0).max(100),
  timestamp: z.string().datetime(),
});

export type MachineStateDelta = z.infer<typeof MachineStateDelta>;
```

### IssueCertificate
```ts
export const IssueCertificate = z.object({
  userId: z.string().uuid(),
  labId: z.string().uuid(),
  ticketId: z.string().uuid().nullable(),
  issuedBy: z.string().uuid(), // admin/instructor id
  expiryDays: z.number().int().positive().optional(),
});

export type IssueCertificateInput = z.infer<typeof IssueCertificate>;
```

### Idempotency Key (Mutation)
- Client generates a UUID v4 idempotency key.
- Included as `Idempotency-Key` header or body field `idempotencyKey`.
- Server ensures same key + payload produces identical result; re-submission returns prior response with `304 Not Modified` or `200 OK` with `X-Idempotency-Responded: true`.
- Conflict if same key used with different payload → `409 Conflict`.

## Validation Middleware (Express example)
```ts
import { validate } from 'express-zod-middleare';
import { CreateTicket } from './schemas';

app.post('/tickets', validate(CreateTicket), async (req, res) => { /* ... */ });
```

## Summary Checklist
- [ ] REST endpoints defined for all resources
- [ ] Auth (JWT + refresh) with role claims
- [ ] Rate limits per endpoint class
- [ ] Error schema + codes
- [ ] WebSocket event types bidirectional
- [ ] Zod request/response schemas
- [ ] Idempotency key strategy
- [ ] Documentation ready for codegen