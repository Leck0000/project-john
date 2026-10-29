# Project:John — Comprehensive Simulator Architecture

## 1. Overview

Project:John is a **browser-based IT/help desk simulator** that runs a complete support shift in one connected workspace. Technicians claim tickets, investigate simulated Windows machines, communicate with users via AI voice, verify fixes, and earn verifiable certificates. The system scores technical accuracy, process, and communication.

This document is the **single authoritative reference** for the simulator's architecture, data models, API contracts, scoring engine, team mode, and deployment. All design decisions are derived from research across 9 prior art platforms (HackTheBox, TryHackMe, Microsoft Windows Simulators, CyberRange platforms, Instruqt, Strigo, Azure Lab Services, RangeForce, Immersive Labs) and three background subagent design runs.

**Target audience**: system architects, lead developers, DB designers, DevOps, and content authors.

---

## 2. High-Level Design

| Layer | Responsibility | Key Tech |
|-------|----------------|----------|
| **Frontend** | React 18 + TypeScript + Vite UI; xterm.js terminal; rustguac + guacd for remote desktop streaming; modular window manager (CSS Grid + z-index) | React, Redux Toolkit / Zustand, xterm.js, rustguac |
| **Session Manager** | JWT auth (short-lived JWE, 5‑min), per‑session state isolation, quota enforcement, WebSocket namespace routing | Node.js, Keycloak/Auth0 OIDC, JWT |
| **Command Bus** | Parse → Auth → Lock → Apply → Emit → Release flow for ~62 commands across 6 subsystems | Node.js/TS, Immer (persistent data structures) |
| **Simulation Engine** | Deterministic FSM state machines for 6 Windows subsystems + server‑room topology; in‑memory + MessagePack snapshots + JSONL WAL | Node.js/TS, Immer, MessagePack |
| **Ticketing & Scoring** | Ticket lifecycle FSM (New→Assigned→InProgress→Resolved→Closed); rubric‑based scoring; evidence collection; Ed25519 certificate issuance | Python FastAPI, Zod schemas, Ed25519 |
| **Team Mode** | org → cohort → assignment → technician RBAC; assignment API; WS progress aggregation; lab content pipeline; instructor review workflow; bulk import/export; analytics | Node.js/TS, PostgreSQL + Redis, Git-backed lab content |
| **Persistence** | In‑memory immutable trees (hourly), 30 s MessagePack snapshots, append‑only JSONL WAL, separate LDIF/GraphML dumps for AD/topology | PostgreSQL, Redis, MessagePack, JSONL |
| **Observability** | Structured logs (pino), OpenTelemetry traces per command, metrics (Prometheus‑style) | pino, OpenTelemetry |

---

## 3. Core Data Models

All models are defined as **TypeScript/Zod schemas** and stored with UUID primary keys. Relationships are expressed via foreign‑key references.

### 3.1 Ticket

```ts
export const Ticket = z.object({
  id: z.string().uuid(),
  queue: z.enum(["AD", "networking", "security", "helpdesk"]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  category: z.string().optional(),
  state: z.enum(["open", "in_progress", "on_hold", "resolved", "closed"]),
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
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});
```

**State transitions**: open → in_progress → resolved → closed (reopen allowed).

### 3.2 SimulatedMachine

```ts
export const NetworkInterface = z.object({
  name: z.string(),
  ip: z.string().ip(),
  mac: z.string().optional(),
});

export const FilesystemDrive = z.object({
  letter: z.string(),
  fsType: z.string(),
  sizeBytes: z.number(),
  freeBytes: z.number(),
});

export const Service = z.object({
  name: z.string(),
  displayName: z.string(),
  status: z.enum(["running", "stopped", "paused", "error"]),
  startMode: z.enum(["auto", "manual", "disabled"]),
});

export const RegistryKey = z.object({
  path: z.string(),
  value: z.string(),
  type: z.enum(["String", "DWORD", "QWORD", "Binary"]),
});

export const SimulatedMachine = z.object({
  id: z.string().uuid(),
  hostname: z.string(),
  osVersion: z.string(),
  registry: z.array(RegistryKey).default([]),
  services: z.array(Service).default([]),
  eventLog: z.array(z.string()).default([]),
  network: NetworkInterface.optional(),
  adDomain: z.object({ joined: z.boolean(), computerObject: z.string().uuid().optional() }).default({ joined: false }),
  filesystem: z.array(FilesystemDrive).default([]),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});
```

### 3.3 UserSession

```ts
export type UserRef = { id: string; name: string };

export const UserSession = z.object({
  id: z.string().uuid(),
  technician: UserRef,
  requester: UserRef,
  startTime: z.date().default(() => new Date()),
  endTime: z.date().optional(),
  currentLabId: z.string().uuid().optional(),
  ticketsResolved: z.array(z.string().uuid()).default([]),
  notes: z.array(z.string()).default([]),
});
```

### 3.4 Lab (Guided Steps)

```ts
export const StepValidation = z.object({
  check: z.string(),
  pass: z.boolean(),
  hint: z.string().optional(),
});

export const LabStep = z.object({
  id: z.string().uuid(),
  order: z.number(),
  instruction: z.string(),
  validation: StepValidation,
});

export const Lab = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().optional(),
  steps: z.array(LabStep),
  estimatedMinutes: z.number().int(),
  tags: z.array(z.string()).default([]),
});
```

### 3.5 Certificate

```ts
export const Certificate = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  labId: z.string().uuid(),
  verificationId: z.string().uuid(),
  earnedCriteria: z.enum(["all_steps", "majority", "custom"]),
  signedPayload: z.object({
    signature: z.string(),
    issuedAt: z.date(),
    expiresAt: z.date(),
  }),
  expiryDate: z.date(),
  createdAt: z.date().default(() => new Date()),
});
```

### 3.6 Team / Organization RBAC

```ts
export const Role = z.enum(["admin", "technician", "viewer"]);

export const Assignment = z.object({
  userId: z.string().uuid(),
  role: Role,
  grantedAt: z.date().default(() => new Date()),
  expiresAt: z.date().optional(),
});

export const Team = z.object({
  id: z.string().uuid(),
  name: z.string(),
  roles: z.array(Role).default([Role.admin, Role.technician, Role.viewer]),
  assignments: z.array(Assignment),
  progress: z.record(z.string(), z.enum(["not_started", "in_progress", "completed"])),
  createdAt: z.date().default(() => new Date()),
});
```

### 3.7 State‑Transition Summary

| Entity | Current State | Allowed Transitions |
|--------|--------------|---------------------|
| **Ticket** | `open` | → `in_progress` (tech starts) |
| | `in_progress` | → `resolved` (evidence gathered) <br> → `open` (reopened) |
| | `resolved` | → `closed` (final sign‑off) |
| | `closed` | – (absorbing) |
| **SimulatedMachine** | `online` | → `offline`, → `maintenance`, → `online` |
| | `offline` | → `online` |
| | `maintenance` | → `online` (patches applied) |
| **LabStep** | `not_started` | → `in_progress` <br> → `completed` (validation passes) |
| | `in_progress` | → `completed` <br> → `not_started` (reset) |
| | `completed` | – (absorbing) |
| **UserSession** | `active` | → `completed` (endTime set) |
| | `completed` | – (absorbing) |
| **Certificate** | `issued` | → `expired` (after expiryDate) <br> → `revoked` (admin) |
| | `expired` / `revoked` | – (absorbing) |
| **Team Assignment** | `active` | → `expired` (expiresAt) <br> → `revoked` (admin) |

*All transitions are idempotent.*

---

## 4. Simulation Engine Architecture

### 4.1 Subsystem Finite‑State Machines

Each subsystem is a pure‑function FSM. All share a common `State<T>` base:

```ts
type Event = { type: string; payload?: any };
type Transition<S> = (state: S, event: Event) => S;
```

| Subsystem | Core States | Key Events | Persistence |
|-----------|-------------|------------|-------------|
| **Services** | Stopped, Running, Paused, StartPending, StopPending | Start, Stop, Pause, Continue, ConfigChange | Snapshot (service list + status) every 30 s |
| **Registry** | Clean, Dirty (per‑key) | SetValue, DeleteKey, CreateKey, RenameKey | Full hive dump every 30 s |
| **Event Log** | Idle, Writing, Full | LogEvent, ClearLog, Archive | Circular buffer (max 10 k entries) + periodic flush |
| **Network Stack** | Up, Down, Degraded (per‑adapter) | EnableAdapter, DisableAdapter, IpConfigChange, DnsChange, FirewallRuleAdd/Del | Adapter config + ARP cache snapshot |
| **Active Directory** | DomainController, MemberServer, Workstation | CreateUser, DeleteUser, ModifyAttr, GroupAdd, Replicate | LDIF export every 60 s |
| **Filesystem** | Mounted, Unmounted, Corrupt (per‑volume) | CreateFile, DeleteFile, Write, SetAcl, Mount, Unmount | In‑memory VFS tree + journal; checkpoint every 45 s |

*All transitions are pure functions → easy to unit‑test and replay.*

### 4.2 Command Execution Layer (~62 commands)

Commands flow through a **Command Bus** with 7 stages:

1. **Parse & Validate** – static Zod schema per command
2. **Authorization** – RBAC check against simulated AD principal
3. **Acquire Locks** – fine‑grained per‑subsystem mutex (services.lock, registry.lock, …)
4. **Apply** – call subsystem transition functions, collect **mutations**
5. **Emit Events** – WebSocket `state-delta` events for each mutated object
6. **Release Locks** – in reverse order
7. **Return Result** – structured JSON `{ exitCode, stdout, stderr }`

Commands are grouped by category:

| Category | Commands |
|----------|----------|
| **Network** | ipconfig, nslookup, netsh, ping, tracert, route, arp, Get-NetAdapter, Set-DnsClientServerAddress |
| **Services** | Get-Service, Start-Service, Stop-Service, Restart-Service, Set-Service, sc.exe wrappers |
| **Event Log** | Get-WinEvent, Clear-EventLog, wevtutil |
| **Registry** | reg.exe (query/add/delete/copy), Get-ItemProperty, Set-ItemProperty |
| **AD** | Get-ADUser, New-ADUser, Remove-ADUser, Set-ADUser, Get-ADGroup, Add-ADGroupMember, dcdiag, repadmin |
| **Filesystem** | dir, copy, move, del, icacls, takeown, New-Item, Remove-Item |
| **System** | systeminfo, tasklist, taskkill, shutdown, bcdedit, diskpart |
| **PowerShell** | Generic `Invoke-Expression` sandbox (restricted cmdlet whitelist) |

Each command implementation lives in `src/commands/<category>/<cmd>.ts` and is **pure** (no side‑effects outside the state machines).

### 4.3 Server‑Room Topology Simulation

A **graph‑based model** (`NetworkTopology`) representing physical/logical devices:

| Node Types | Edges |
|------------|-------|
| Switch, Router, Firewall, Server, Workstation, PDU, UPS | Ethernet (L2), VLAN trunk, ACL, BGP/OSPF peering, Power |

State per node: Operational / Degraded / Failed / Maintenance. Metrics: CPU, memory, temperature, link‑utilization (simulated).

**Simulation tick (1 s)** updates:
- Link latency / loss based on load
- Power budget (UPS runtime)
- Failure injection (MTBF/MTTR config)

Commands affecting topology: `netsh interface`, `Enable-NetAdapter`, firewall rule add/del, `Restart-Computer` (simulated reboot of node).

### 4.4 Ticket Lifecycle State Machine

```
New → Assigned → InProgress → (OnHold ↔ InProgress) → Resolved → Closed
      ↘︎ Reopened ↗︎
```

Events: CreateTicket, Assign, StartWork, Pause, Resume, Resolve, Close, Reopen. Each transition emits a `ticket.updated` WebSocket event with full ticket snapshot. SLAs are modeled as timed transitions (e.g., auto‑escalate after 4 h in Assigned).

### 4.5 WebSocket Event Schema (real‑time sync)

All messages JSON with mandatory envelope:

```ts
interface WSEnvelope<T> {
  v: 1;                     // protocol version
  t: string;                // event type
  sid: string;              // session id
  seq: number;              // monotonically increasing per session
  ts: number;               // server epoch ms
  payload: T;
}
```

| Type | Payload | Direction |
|------|---------|-----------|
| `cmd.result` | `{ cmdId, exitCode, stdout, stderr }` | S→C |
| `state.delta` | `{ subsystem, path, op:"set"|"delete", value? }` | S→C |
| `topology.delta` | `{ nodeId, attr, value }` | S→C |
| `ticket.updated` | `Ticket` | S→C |
| `session.init` | `{ sessionId, userPrincipal, caps[] }` | S→C |
| `client.ack` | `{ seq }` | C→S |
| `heartbeat` | `{}` | both |

Clients **must** acknowledge each `seq`; server retransmits on gap detection.

### 4.6 Persistence Strategy

| Layer | Mechanism | Frequency | Recovery |
|-------|-----------|-----------|----------|
| **In‑memory** | Immutable state trees (persistent maps via Immer) | — | Hot‑standby |
| **Periodic Snapshot** | Serialize full engine state to **MessagePack** (~2 MB) | Every 30 s + on graceful shutdown | Load latest snapshot → replay command log |
| **Command Log (WAL)** | Append‑only file (JSONL) of every `Command` + resulting `state.delta` batch | Immediate (fsync per batch) | Replay from snapshot + log tail |
| **Topology / AD Export** | Separate LDIF / GraphML dumps | Every 60 s | Independent restore |

Snapshots are **copy‑on‑write**; background worker writes to temp file then atomically renames.

### 4.7 Isolation Between Concurrent Sessions

- **Session Context Object** – holds references to *cloned* subsystem roots (structural sharing via persistent maps).
- **Namespace Prefix** – all keys in registry, eventlog, FS prefixed with `sid:`; AD objects carry `sessionId` attribute.
- **Resource Quotas** – per‑session limits (max services, max tickets, max simulated nodes). Enforced at command‑validation stage.
- **WebSocket Namespace** – each connection authenticates via short‑lived JWT containing `sid`; server routes all events through a **SessionHub** that filters by `sid`.
- **Process‑level Sandbox (optional)** – heavy commands (e.g., `dcdiag`) can be offloaded to a short‑lived worker process with its own memory limit.

---

## 5. API Contracts

### 5.1 Base URL

```
http://localhost:8080/api/v1
```

### 5.2 Authentication

| Endpoint | Body | Response |
|----------|------|----------|
| `POST /auth/login` | `{ email: string, password: string }` | `{ accessToken, refreshToken, expiresIn, user: { id, role, name } }` |
| `POST /auth/refresh` | `{ refreshToken: string }` | `{ accessToken, expiresIn }` |
| `POST /auth/revoke` | `{ refreshToken: string }` | `{ success: boolean }` |

Role claims:
- `technician`: view/ticket assignment, machine ops, limited lab edit
- `instructor`: create labs, assign tickets, view scoring, issue certificates
- `admin`: full CRUD across all resources, user management, system settings

All authenticated routes require `Authorization: Bearer ***` header.

### 5.3 Rate Limits

| Endpoint Class | Limit | Window |
|----------------|-------|--------|
| `/auth/*` | 5 attempts / 5 min | per IP |
| Public reads (`/tickets`, `/labs`, `/machines`) | 60 req/min | per user |
| Write mutations (`/tickets/assign`, `/certificates/issue`) | 10 req/min | per user |
| WebSocket subscriptions | 2 concurrent per user | indefinite |

Exceeded → `429 Too Many Requests` with `Retry-After` header.

### 5.4 Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad Request – validation, idempotency conflict |
| 401 | Unauthorized – missing/invalid token |
| 403 | Forbidden – role insufficient |
| 404 | Not Found – resource missing |
| 409 | Conflict – duplicate, idempotency key reused with different payload |
| 415 | Unsupported Media Type – expected `application/json` |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

Unified `ErrorResponse` Zod schema:

```ts
export const ErrorResponse = z.object({
  code: z.number().int(),
  message: z.string(),
  path: z.string().optional(),
  timestamp: z.string().datetime(),
  requestId: z.string().uuid(),
});
```

### 5.5 REST Endpoints (summary)

| Resource | Endpoints |
|----------|-----------|
| **Auth** | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/revoke` |
| **Users** | `GET /users/me`, `GET /users/:id`, `PATCH /users/:id`, `POST /users` |
| **Tickets** | `GET /tickets`, `GET /tickets/:id`, `POST /tickets`, `PATCH /tickets/:id`, `POST /tickets/:id/complete`, `POST /tickets/:id/idempotency` |
| **Machines** | `GET /machines`, `GET /machines/:id`, `POST /machines`, `PATCH /machines/:id`, `POST /machines/:id/start`, `POST /machines/:id/stop` |
| **Labs** | `GET /labs`, `GET /labs/:id`, `POST /labs`, `PATCH /labs/:id`, `DELETE /labs/:id` |
| **Certificates** | `GET /certificates`, `GET /certificates/:id`, `POST /certificates/issue`, `POST /certificates/validate` |
| **Teams** | `GET /teams`, `GET /teams/:id`, `POST /teams`, `PATCH /teams/:id`, `DELETE /teams/:id` |

### 5.6 WebSocket Event Types

| Event | Direction | Payload (Zod) |
|-------|-----------|---------------|
| `machine_state_delta` | S→C | `{ machineId: string, state: 'idle'|'running'|'error'|'complete', cpu: number, mem: number, timestamp: string }` |
| `command_output` | S→C | `{ machineId: string, output: string, exitCode: number, timestamp: string }` |
| `ticket_update` | S→C | `{ ticketId: string, status: string, assigneeId?: string, timestamp: string }` |
| `requester_message` | S→C | `{ ticketId: string, from: 'requester'|'system', message: string, timestamp: string }` |
| `scoring_update` | S→C | `{ ticketId: string, score: number, feedback?: string, timestamp: string }` |
| `lab_progress` | S→C | `{ labId: string, progress: number (0-100), activeMachines: number, timestamp: string }` |

| Event | Direction | Payload |
|-------|-----------|---------|
| `authenticate` | C→S | JWT |
| `request_machine_state` | C→S | `{ machineId: string }` |
| `send_command` | C→S | `{ machineId: string, command: string }` |
| `add_ticket_message` | C→S | `{ ticketId: string, message: string }` |
| `claim_ticket` | C→S | `{ ticketId: string }` |

### 5.7 Request/Response Schemas (Zod)

- `CreateTicket`, `TicketResponse`, `ScoreEntry`, `MachineStateDelta`, `IssueCertificate`, idempotency‑key strategy (UUID v4 header, deduplication, `304`/`200` with `X-Idempotency-Responded: true`).

### 5.8 Validation Middleware (Express example)

```ts
import { validate } from 'express-zod-middleare';
import { CreateTicket } from './schemas';

app.post('/tickets', validate(CreateTicket), async (req, res) => { /* ... */ });
```

### 5.9 Idempotency Key Strategy

- Client generates UUID v4 idempotency key
- Included as `Idempotency-Key` header or body field `idempotencyKey`
- Server ensures same key + payload produces identical result; re‑submission returns prior response with `304 Not Modified` or `200 OK` with `X-Idempotency-Responded: true`
- Conflict if same key used with different payload → `409 Conflict`

---

## 6. Scoring & Assessment Engine

### 6.1 Rubric DSL (JSON)

```json
{
  "ticket_type": "bug",
  "criteria": [
    { "id": "c1", "name": "uses git log", "type": "command", "rule": { "match": "git log", "operator": "contains", "value": "", "negate": false }, "max_score": 0.5 },
    { "id": "c2", "name": "has fix commit", "type": "command", "rule": { "match": "fix", "operator": "contains", "value": "", "negate": false }, "max_score": 0.5 },
    { "id": "c3", "name": "no breaking change", "type": "command", "rule": { "match": "revert", "operator": "contains", "value": "", "negate": true }, "max_score": 1.0 }
  ],
  "formula": { "type": "weighted_sum" },
  "evidence_store": { "path": "evidence.jsonl", "format": "jsonl" }
}
```

Operators: `equals`, `contains`, `regex`, `gt/lt/gte/lte`. Formula choices: `weighted_sum`, `weighted_average`, `threshold`.

### 6.2 Evidence Collector / Mapper (`evidence_mapper.py`)

Reads rubric DSL + JSONL evidence entries, evaluates each criterion’s rule against the `output` field, accumulates per‑criterion points, persists JSONL audit log.

Entry format: `{ ticket_type, command, output, timestamp }`.

### 6.3 Real‑Time Scoring Feed (`scoring_feed.py`)

FastAPI service:

- `POST /evidence` — append entry + recompute score
- `GET /score/{ticket_type}` — return latest per‑criterion + ticket score
- `GET /score/{ticket_type}/stream` — SSE stream on score changes
- Background periodic sweep (TTL‑driven, default 300 s)

Scores cached in memory; snapshots persisted to JSON files every TTL.

### 6.4 Certificate Issuance Pipeline (`certificate_pipeline.py`)

Ed25519 signing pipeline:

1. Payload construction (`ticket_type`, `ticket_id`, `score`, `criteria_met`, `rubric_hash`)
2. Deterministic canonical JSON → Ed25519 signature
3. Persistent storage under `certificates/<ticket_type>/<ticket_id>.json`
4. Verification URL: `/verify/{ticket_type}/{ticket_id}`

Private key: generated once per profile, chmod‑0400. Public key embedded in verification URL hash; verification endpoint loads public key and checks signature.

### 6.5 Anti‑Cheat (`anti_cheat.py`)

Deterministic replay of evidence to detect score tampering:

1. Sort entries by `(command_hash, timestamp)` where `command_hash = sha256(command|output)`
2. Re‑run evidence mapper
3. Compare recomputed score vs. recorded score
4. Flag mismatch as audit event

---

## 7. Team Mode Architecture & Lab Content Pipeline

### 7.1 RBAC Model: `org → cohort → assignment → technician`

| Layer | Principal | Permissions | Key Data |
|-------|-----------|-------------|----------|
| **Organization** | Admin, Manager | `org:manage`, `org:view_users`, `org:view_analytics` | Tenant config, billing, global settings |
| **Cohort** | Instructor, Lead | `cohort:manage_{id}`, `cohort:view_progress_{id}` | Enrollment, schedule, assigned labs |
| **Assignment** | Instructor | `assignment:view_{id}`, `assignment:update_{id}` | Lab → technician mapping, due dates, overrides |
| **Technician** | Trainee (self) | `assignment:view_own`, `progress:view_own` | Personal lab progress, submissions, feedback |

### 7.2 Assignment API

**Base**: `GET/POST/PATCH/DELETE /api/v1/orgs/{org_id}/cohorts/{cohort_id}/assignments`

| Endpoint | Description |
|----------|-------------|
| `GET /` | List assignments in cohort (query: status, technician_id, search) |
| `POST /` | Create: `{ title, lab_content_id, due_date, technician_ids[] }` |
| `GET /{assignment_id}` | Retrieve with technician roster + progress stats |
| `PATCH /{assignment_id}` | Update due_date, lab_content_id, reassign techs |
| `DELETE /{assignment_id}` | Soft‑delete (retains analytics) |
| `POST /{assignment_id}/reassign` | Bulk reassign to new lab version |

### 7.3 Progress Aggregation

**WebSocket** (`ws://{host}/ws/progress/{assignment_id}`):

- Event: `assignment.progress`
  ```json
  { "technician_id": "tec-001", "step": "step-37", "state": "completed|in_progress|blocked|not_started", "started_at": 1730284800000, "completed_at": 1730288400000, "validation": { "passed": true, "expressions": [...] } }
  ```
- Broadcast on every state change + heartbeat every 15s. Clients ack `seq`; server retransmits on gap.

**REST** (`GET /api/v1/orgs/{org_id}/cohorts/{cohort_id}/assignments/{assignment_id}/progress`):

- Query: `technician_id`, `step`, `state`, `since`
- Response: aggregated per‑technician, per‑step breakdown + summary (overall_completion, technicians_at_goal, technicians_behind)
- Cache: 2‑second TTL; `ETag` based on latest WS seq.

### 7.4 Lab Content Format

**Markdown with YAML frontmatter**:

```yaml
title: "Configure DNS Forwarders"
description: "Set up a DNS forwarder on the simulated Windows Server."
difficulty: intermediate
estimated_minutes: 25
tags: [dns, networking, windows]
lab_content_id: dns-forwarders-v1
```

**Step schema** (inside markdown or separate JSON):

```yaml
steps:
  - id: step-01
    title: "Open Server Manager"
    action: "Run command: Get-Service -Name Dns"
    validation: |
      return $last_exit_code === 0 && $stdout.Contains("Status : Running")
    max_attempts: 3
    hints:
      - "Use Get-Help Get-Service if you need syntax."
    estimated_minutes: 5
  - id: step-02
    title: "Add Forwarder"
    action: "Run command: Set-DnsServerForwarder -IPAddress 8.8.8.8"
    validation: |
      return $last_exit_code === 0 && $stdout.Contains("Forwarders updated")
    max_attempts: 2
```

**Validation expression language**:

- Variables: `$last_exit_code`, `$stdout`, `$stderr`, `$elapsed_ms`
- Operators: `===`, `!==`, `startsWith`, `contains`, `matches` (regex), `<`, `>`
- Boolean connectives: `and`, `or`, `not`
- Example: `$last_exit_code === 0 && $stdout.matches(/Forwarders updated/i)`

### 7.5 Instructor Review Workflow

1. **Lab completion** → assignment state `submitted`
2. **Instructor notification** → WS `assignment.submitted` + configurable alert
3. **Review UI** → `GET /assignments/{assignment_id}/submission`
   - Per‑step view: command output, validation result, timestamps
   - Global score: rubric‑based (same DSL as evidence_mapper)
4. **Override actions**:
   - `APPROVE` → state `graded`, marks released
   - `REQUIRE_REWORK` → state `reopened`, technician notified, step reset to `in_progress`
   - `MANUAL_UNLOCK` → advance past blocked step (audit‑logged)
5. **Finalization** → `POST /assignments/{assignment_id}/finalize` → emits `assignment.completed`, writes final score, triggers analytics

All review actions audit‑logged: `actor_id`, `timestamp`, `action`, `target`, `reason`.

### 7.6 Bulk Import / Export

| Format | Payload | Process |
|--------|---------|---------|
| **Assignments CSV** | `org_id,cohort_id,assignment_title,lab_content_id,due_date,technician_id*` | Creates/updates; `*` = primary technician; skips dupes by `(title, lab_content_id)` |
| **Lab Content Bundle** | Multipart: `markdown_file (.md)` + `metadata_json (.yaml)` | Parses frontmatter + step schema; validates each step against dry‑run sandbox; persists, returns `lab_content_id` |
| **Technicians CSV** | `org_id,cohort_id,technician_id,email,name` | Creates accounts if missing; maps to org/cohort |

**Export**:

- `?type=assignments` → ZIP of CSV + associated lab markdown
- `?type=evidence` → JSONL bundle of all evidence_mapper output for cohort
- `?type=progress` → TSV of per‑technician step completion timestamps

All exports time‑limited download URLs (SAS‑style, 24h TTL) require `org:view_analytics`.

### 7.7 Analytics Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/analytics/organization/{org_id}/cohorts/{cohort_id}/completion` | Time‑series: daily completion % per assignment (last 30 days) |
| `GET /api/v1/analytics/organization/{org_id}/cohorts/{cohort_id}/technicians/{technician_id}/progress` | Per‑technician: step‑by‑step timeline, avg time per step, retry count, failure reasons |
| `GET /api/v1/analytics/organization/{org_id}/lab-content/{lab_content_id}/performance` | Aggregated validation pass rate, avg attempt count, heatmap of blocking steps |
| `GET /api/v1/analytics/organization/{org_id}/cohorts/{cohort_id}/instructor-activity` | Review actions (`approve`, `require_rework`, `manual_unlock`) with actor/timestamps |
| `GET /api/v1/analytics/organization/{org_id}/cohorts/{cohort_id}/export-jobs/{job_id}` | Status of bulk export job (progress %, download URL when complete) |

All analytics read‑only, cached 30s, require `org:view_analytics`.

---

## 8. Deployment & Infra

| Layer | Recommendation | Rationale |
|-------|----------------|-----------|
| **Frontend** | React 18 + TS + Vite | Mature, Win11React reference, good ecosystem |
| **State** | Redux Toolkit (or Zustand) | Proven in Win11React, devtools, persistence |
| **Terminal** | xterm.js + WebSocket | Industry standard, works with any backend |
| **Desktop Streaming** | rustguac + guacd | Lightweight, no Java/Tomcat, supports RDP/VNC/SSH |
| **Backend API** | FastAPI (Python) or Node.js/Express | Fast dev, good WS support, async |
| **Auth** | OIDC (Keycloak/Auth0) + short‑lived JWE tokens | Standard, secure, integrates everywhere |
| **Orchestration** | K8s (kind/k3s local, EKS/GKE prod) | Matches CyberRangeCZ, Instruqt, scalable |
| **IaC** | Terraform + Ansible | AIT Cyber Range pattern, cloud‑agnostic |
| **Database** | PostgreSQL + Redis | Relational + cache/sessions |
| **Event Log** | OpenSearch/Elasticsearch | CyberRangeCZ, Immersive Labs pattern |
| **Content Authoring** | YAML/Markdown + GitOps | Instruqt pattern, version controllable |
| **Validation** | Python scripts in sandbox (sidecar) | Flexible, can check any system state |

### 8.1 Horizontal Scaling

- Sticky‑session WebSocket load balancer (e.g., K8s `Ingress` with session affinity)
- State sharded by `sid`; each node serves a subset of sessions
- Periodic MessagePack snapshots synchronized via distributed filesystem (e.g., MinIO, EFS)

### 8.2 Security

- No real OS commands; all execute inside simulated state
- JWT‑scoped WS connections; `sid:` namespace isolation
- Rate‑limited endpoints; idempotency keys for mutation safety
- Private Ed25519 key chmod‑0400; public key never exposed outside verification endpoint
- Audit logging for all state transitions and scoring events

### 8.3 Observability

- Structured logs (pino) with request IDs
- OpenTelemetry traces per command (subsystem enter/leave, lock acquire/release)
- Metrics: commands/sec, WS message rate, snapshot size, FSM transition latency
- Alerts: snapshot failure, quota breach, auth failures spike

---

## 9. Future Extensions

| Extension | Description |
|-----------|-------------|
| **Scenario Engine** | Declarative YAML to inject faults, schedule tickets, spin up lab topologies on‑the‑fly |
| **Replay UI** | Time‑travel debugger stepping through command log with state diff view |
| **Multi‑Region AD** | Simulate trusts, replication latency, cross‑domain policies |
| **Plugin API** | Third‑party subsystems (e.g., simulated SCCM, Intune, Exchange) |
| **AI Requester** | LLM‑driven user simulator with personality, escalation patterns, voice synthesis |
| **Mobile Client** | PWA companion for ticket claiming & status check on‑the‑go |

---

## 10. Files Generated by This Design Session

| File | Purpose |
|------|---------|
| `ARCHITECTURE.md` | This document — comprehensive system architecture |
| `SIM_ENGINE_DESIGN.md` | Low‑level engine FSM + command bus specs |
| `API_CONTRACTS.md` | REST + WebSocket endpoint catalog + Zod schemas |
| `SIM_ENGINE_ARCH.html` | SVG dark‑themed architecture diagram (open in browser) |
| `research-findings.md` | Comparative analysis of 9 prior‑art platforms |
| `rubric_dsl.json` | JSON rubric for bug‑type scoring (example) |
| `evidence_mapper.py` | Evidence collection + criterion evaluation |
| `scoring_feed.py` | FastAPI real‑time scoring service |
| `certificate_pipeline.py` | Ed25519 sign‑store‑verify pipeline |
| `anti_cheat.py` | Deterministic replay audit tool |

---

## 11. Quick Start: Local Development

```bash
# 1. Clone repo + install deps
git clone https://github.com/Leck0000/project-john.git
cd project-john
npm install      # frontend + TS tooling
pip install -r requirements.txt  # backend + Python deps

# 2. Generate Ed25519 keys (cert pipeline)
python certificate_pipeline.py  # creates certs/private_key.pem + public_key.pem

# 3. Start scoring feed
python scoring_feed.py  # defaults: host=127.0.0.1, port=8000, ttl=300s

# 4. Start backend API
npm run dev     # Node/TS server on http://localhost:8080/api/v1

# 5. Start frontend
npm run dev     # Vite dev server on http://localhost:5173

# 6. Open browser, create account, claim first ticket
```

---

*Document version 1.0 — generated for the Project:John simulation architecture review. All artifacts under C:\Users\Parzival\Documents\sysdesk\.*