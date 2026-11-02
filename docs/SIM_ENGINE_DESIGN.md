# Project:John Simulation Engine Architecture

## Overview
A deterministic, browser‑based Windows 11 simulator used for technician training. The engine runs entirely in‑process (Node/TS) and exposes a WebSocket API for the front‑end. All subsystems are pure‑state machines; commands mutate state transactionally; snapshots provide durability; session isolation guarantees multi‑tenant safety.

---

## 1. Windows Subsystem State Machines
Each subsystem is a **finite‑state machine (FSM)** with a well‑defined event set. All FSMs share a common `State<T>` base:
```ts
type Event = { type: string; payload?: any };
type Transition<S> = (state: S, event: Event) => S;
```
| Subsystem | Core States | Key Events | Persistence |
|-----------|-------------|------------|-------------|
| **Services** | `Stopped`, `Running`, `Paused`, `StartPending`, `StopPending` | `Start`, `Stop`, `Pause`, `Continue`, `ConfigChange` | Snapshot (service list + status) |
| **Registry** | `Clean`, `Dirty` (per‑key) | `SetValue`, `DeleteKey`, `CreateKey`, `RenameKey` | Full hive dump every 30 s |
| **Event Log** | `Idle`, `Writing`, `Full` | `LogEvent`, `ClearLog`, `Archive` | Circular buffer (max 10 k entries) + periodic flush |
| **Network Stack** | `Up`, `Down`, `Degraded` (per‑adapter) | `EnableAdapter`, `DisableAdapter`, `IpConfigChange`, `DnsChange`, `FirewallRuleAdd/Del` | Adapter config + ARP cache snapshot |
| **Active Directory** | `DomainController`, `MemberServer`, `Workstation` | `CreateUser`, `DeleteUser`, `ModifyAttr`, `GroupAdd`, `Replicate` | LDIF export every 60 s |
| **Filesystem** | `Mounted`, `Unmounted`, `Corrupt` (per‑volume) | `CreateFile`, `DeleteFile`, `Write`, `SetAcl`, `Mount`, `Unmount` | In‑memory VFS tree + journal; checkpoint every 45 s |

All transitions are **pure functions** → easy to unit‑test and replay.

---

## 2. Command Execution Layer (≈ 62 commands)
Commands are dispatched via a **Command Bus**:
```ts
interface Command {
  name: string;               // e.g. "ipconfig"
  args: string[];             // parsed argv
  sessionId: string;          // tenant isolation
  timestamp: number;
}
```
Execution flow:
1. **Parse & Validate** – static schema per command (zod).
2. **Authorization** – RBAC check against simulated AD principal.
3. **Acquire Locks** – fine‑grained per‑subsystem mutex (e.g. `services.lock`, `registry.lock`).
4. **Apply** – call subsystem transition functions, collect **mutations**.
5. **Emit Events** – WebSocket `state-delta` events for each mutated object.
6. **Release Locks** – in reverse order.
7. **Return Result** – structured JSON (`{ exitCode, stdout, stderr }`).

### Representative Command Set (grouped)
| Category | Commands |
|----------|----------|
| **Network** | `ipconfig`, `nslookup`, `netsh`, `ping`, `tracert`, `route`, `arp`, `Get-NetAdapter`, `Set-DnsClientServerAddress` |
| **Services** | `Get-Service`, `Start-Service`, `Stop-Service`, `Restart-Service`, `Set-Service`, `sc.exe` wrappers |
| **Event Log** | `Get-WinEvent`, `Clear-EventLog`, `wevtutil` |
| **Registry** | `reg.exe` (query/add/delete/copy), `Get-ItemProperty`, `Set-ItemProperty` |
| **AD** | `Get-ADUser`, `New-ADUser`, `Remove-ADUser`, `Set-ADUser`, `Get-ADGroup`, `Add-ADGroupMember`, `dcdiag`, `repadmin` |
| **Filesystem** | `dir`, `copy`, `move`, `del`, `icacls`, `takeown`, `New-Item`, `Remove-Item` |
| **System** | `systeminfo`, `tasklist`, `taskkill`, `shutdown`, `bcdedit`, `diskpart` |
| **PowerShell** | Generic `Invoke-Expression` sandbox (restricted cmdlet whitelist) |

Each command implementation lives in `src/commands/<category>/<cmd>.ts` and is **pure** (no side‑effects outside the state machines).

---

## 3. Server‑Room Topology Simulation
A **graph‑based model** (`NetworkTopology`) representing physical / logical devices:
```
Node Types: Switch, Router, Firewall, Server, Workstation, PDU, UPS
Edges:   Ethernet (L2), VLAN trunk, ACL, BGP/OSPF peering, Power
```
State per node:
- `Operational`, `Degraded`, `Failed`, `Maintenance`
- Metrics: CPU, memory, temperature, link‑utilization (simulated)

**Simulation tick (1 s)** updates:
- Link latency / loss based on load
- Power budget (UPS runtime)
- Failure injection (MTBF/MTTR config)

Commands affecting topology: `netsh interface`, `Enable-NetAdapter`, firewall rule add/del, `Restart-Computer` (simulated reboot of node).

---

## 4. Ticket Lifecycle State Machine
```
New → Assigned → InProgress → (OnHold ↔ InProgress) → Resolved → Closed
                ↘︎ Reopened ↗︎
```
Events: `CreateTicket`, `Assign`, `StartWork`, `Pause`, `Resume`, `Resolve`, `Close`, `Reopen`.
Each transition emits a `ticket.updated` WebSocket event with full ticket snapshot.
SLAs are modeled as **timed transitions** (e.g., auto‑escalate after 4 h in `Assigned`).

---

## 5. WebSocket Event Schema (real‑time sync)
All messages are JSON with a mandatory envelope:
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
### Core Event Types
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

---

## 6. Persistence Strategy
| Layer | Mechanism | Frequency | Recovery |
|-------|-----------|-----------|----------|
| **In‑memory** | Immutable state trees (persistent data structures via Immer) | — | Hot‑standby |
| **Periodic Snapshot** | Serialize full engine state to **MessagePack** (≈ 2 MB) | Every **30 s** + on graceful shutdown | Load latest snapshot → replay command log |
| **Command Log (WAL)** | Append‑only file (JSONL) of every `Command` + resulting `state.delta` batch | Immediate (fsync per batch) | Replay from snapshot + log tail |
| **Topology / AD Export** | Separate LDIF / GraphML dumps | Every **60 s** | Independent restore for those domains |

Snapshots are **copy‑on‑write**; background worker writes to a temp file then atomically renames.

---

## 7. Isolation Between Concurrent Sessions
* **Session Context Object** – holds references to *cloned* subsystem roots (structural sharing via persistent maps).  
* **Namespace Prefix** – all keys in registry, eventlog, FS prefixed with `sid:`; AD objects carry `sessionId` attribute.  
* **Resource Quotas** – per‑session limits (max services, max tickets, max simulated nodes). Enforced at command‑validation stage.  
* **WebSocket Namespace** – each connection authenticates via short‑lived JWT containing `sid`; server routes all events through a **SessionHub** that filters by `sid`.  
* **Process‑level Sandbox (optional)** – heavy commands (e.g., `dcdiag`) can be offloaded to a short‑lived worker process with its own memory limit.

---

## 8. Module Layout (TypeScript)
```
src/
 ├─ core/
 │    ├─ fsm.ts                # generic FSM utilities
 │    ├─ commandBus.ts
 │    ├─ sessionManager.ts
 │    └─ persistence.ts
 ├─ subsystems/
 │    ├─ services/
 │    ├─ registry/
 │    ├─ eventlog/
 │    ├─ network/
 │    ├─ ad/
 │    └─ filesystem/
 ├─ commands/
 │    ├─ network/
 │    ├─ services/
 │    └─ ...
 ├─ topology/
 │    ├─ graph.ts
 │    └─ simulator.ts
 ├─ ticketing/
 │    └─ fsm.ts
 ├─ ws/
 │    ├─ envelope.ts
 │    └─ hub.ts
 └─ index.ts                 # bootstrap, config, HTTP+WS server
```

---

## 9. Operational Concerns
| Concern | Approach |
|---------|----------|
| **Determinism** | All RNG seeded per session; time sourced from simulated clock (`session.now`). |
| **Testing** | Property‑based tests on each FSM (fast‑check); integration tests replay recorded command logs. |
| **Observability** | Structured logs (pino) + OpenTelemetry traces per command. |
| **Scalability** | Horizontal scaling via sticky‑session WebSocket load balancer; state is sharded by `sid`. |
| **Security** | No real OS calls; all commands execute inside the simulated state. |

---

## 10. Future Extensions
- **Scenario Engine** – declarative YAML to inject faults, schedule tickets, spin up lab topologies.
- **Replay UI** – time‑travel debugger stepping through command log.
- **Multi‑Region AD** – simulate trusts, replication latency.
- **Plugin API** – third‑party subsystems (e.g., simulated SCCM, Intune).

---

*Document version 1.0 – generated for the Project:John simulation engine design review.*