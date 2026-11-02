# IT/Helpdesk Simulator Research: Comparative Analysis

## Platforms Researched
1. **HackTheBox** - Offensive/defensive cyber training platform
2. **TryHackMe** - Browser-based cybersecurity training with AttackBox VMs
3. **Microsoft Windows Simulator** - Browser-based Windows UI recreations (Win11React, plarika/Windows-11-Simulator)
4. **CyberRange platforms** - CyberRangeCZ, AIT Cyber Range, cyberrange.world
5. **Instruqt** - Hands-on technical labs platform (VMs, containers, cloud)
6. **Strigo** - Virtual classroom + hands-on labs for instructor-led training
7. **Azure Lab Services** - Managed SaaS for classroom VM labs (retiring 2027)
8. **RangeForce** - Cyber readiness platform with team exercises + cyber range
9. **Immersive Labs** - Unified cyber resilience platform (labs, ranges, crisis sims)

---

## 1. ARCHITECTURE PATTERNS

### HackTheBox
- **Model**: Microservices on Kubernetes (GKE)
- **Tech Stack**: Apache Kafka (event streaming), Kubernetes (orchestration), Jenkins (CI/CD), Amazon Redshift (analytics), Google Cloud (IaaS)
- **Simulation**: Real vulnerable VMs (Linux, Windows, FreeBSD) spun up per user
- **Content Types**: Machines (full VMs), Challenges (bite-sized apps), Sherlocks (defensive DFIR), Pro Labs (enclosed corporate networks)
- **Access**: OpenVPN or web-based AttackBox (browser VM with tools preinstalled)

### TryHackMe
- **Model**: Browser-first, cloud-managed VMs
- **AttackBox**: Web-based Kali Linux VM (Metasploit, Nmap, BloodHound, Mimikatz, Ghidra, Burp Suite, Wireshark, Hashcat)
- **Simulators**: 4 distinct products — SOC Simulator (live SIEM: Splunk, Sentinel, Elastic), Threat Hunting Simulator, Tabletop Exercises (AI-generated), Live Breach Simulator (beta)
- **Multiplayer**: King of the Hill (attack/defend), network challenges, capstone challenges
- **Architecture**: Real enterprise tooling in sandboxed cloud environments per session

### Microsoft Windows Simulators (Browser-based)
| Project | Stack | Architecture |
|---------|-------|--------------|
| **Win11React** (blueedgetechno) | React 18, Redux 4, SCSS, Vite, FontAwesome, i18next, Tauri | Component-based, Redux state per subsystem (desktop, apps, taskbar), virtual filesystem, localStorage persistence |
| **plarika/Windows-11-Simulator** | Vanilla JS (V10 modular contracts) | Layered V10 architecture: Platform → Boot/Recovery → Desktop/Taskbar → Window Manager → Explorer → Apps → Processes/Services → Security → Network/Devices → Intelligence |
| **Vanshfr69/Win10-WebSimulator** | Vanilla HTML/CSS/JS (no framework) | Single-file boot, custom SVG icons, Fluent Design acrylic blur, simulated CMD with working commands |

**Common patterns**: All client-side React/Vanilla JS, virtual filesystem in localStorage/IndexedDB, window manager with z-index/snap layouts, simulated terminal (limited command set), no real OS kernel

### CyberRange Platforms

#### CyberRangeCZ (Open Source)
- **Architecture**: Container-based microservices on Kubernetes + OpenStack/AWS
- **Services**: Sandbox Service (lifecycle), Training Service (linear training), Supporting Services (Answers Storage, OpenSearch logging, MITRE Technique, User/Group, OIDC)
- **Deployment**: Helm charts (devops-helm), Terraform/OpenTofu for cloud infra (devops-tf-deployment)
- **Backend**: Django REST (sandbox), Spring Boot (training), Angular frontend
- **Sandbox Definition**: Git repositories (infrastructure-as-code), loaded by microservices

#### AIT Cyber Range (OriGin + FlowGin)
- **Three Modules**: Infrastructure Provisioning (Terraform on OpenStack), Software Provisioning (Ansible), Exercise Platform (OriGin + FlowGin)
- **FlowGin**: Business-process engine for inject/input workflows, central scenario orchestration, adaptive to participant decisions
- **OriGin**: Single entry point (materials, guidance, tasks, browser access), supports theory modules, third-party tool embedding
- **Compute**: Self-hosted OpenStack cluster (Ubuntu nodes), burst to cloud provider

#### cyberrange.world (SaaS)
- **Model**: Fully managed browser-based labs for any discipline (cyber, EE, programming, DevOps)
- **Isolation**: Containerized workspaces per student
- **Zero infrastructure burden** for educators

### Instruqt
- **Model**: Real cloud infrastructure per learner (not simulation)
- **Stacks**: VMs, containers, Kubernetes, disposable cloud accounts (AWS, Azure, GCP), GPUs, managed AI services
- **Authoring**: YAML/Markdown (lab content), GitOps (labs as code in Git, PR reviews, CI validation)
- **Provisioning**: Hot-start (near-instant), per-session isolated cloud accounts with scoped short-lived credentials
- **Delivery**: Embeddable (landing pages, docs, LMS via LTI), single link, browser-based
- **Analytics**: Engagement data → Salesforce/HubSpot

### Strigo
- **Model**: Virtual classroom + hands-on labs (instructor-led + self-paced)
- **Environments**: Custom VM images, disposable cloud accounts, multicloud support
- **Classroom Features**: Live video conferencing, real-time analytics, instructor dashboard (progress, environment status, assist/takeover)
- **Authoring**: Infrastructure-as-code, Git version control, API/webhooks for automation
- **AI**: AI-powered training assistance, learner support
- **Embedding**: Labs embed in websites/LMS

### Azure Lab Services (Retiring June 2027)
- **Model**: SaaS — Microsoft manages infra in Microsoft-owned subscription
- **Architecture**: Lab Plan (config collection: networking, VM images, sizes) → Lab (template VM + schedule) → Lab VMs (identical, per user)
- **Networking**: Default isolated VNet per lab, load balancer for RDP/SSH (no public IP on VMs), NSG blocks other ports
- **Advanced Networking**: VNET injection to connect lab plan to customer VNet
- **Access**: Restricted (verified users) or non-restricted (registration link)
- **Integration**: Azure Compute Gallery for custom images, Canvas LMS integration

### RangeForce
- **Model**: Cloud-based cyber range + skills platform (SaaS)
- **Core**: Virtual server framework for scalability, team-based threat exercises, individual skill modules
- **Simulation**: Realistic network simulation with attack bots recreating targeted cyberattacks
- **Tools**: Integration with enterprise security tools (Splunk, Recorded Future, ecosystem partners)
- **Learning Paths**: Role-specific (NIST NICE mapped), continuous assessment, leaderboards
- **Architecture**: Updated virtual server architecture (2.0) for scalability/performance

### Immersive Labs (Immersive One)
- **Model**: Unified platform — labs, cyber drills, crisis simulations, dynamic threat ranges, workforce exercising
- **Loop**: Prove → Improve → Benchmark → Report (continuous)
- **Content**: Container 7 research powers scenarios (AI attacks, current adversary tradecraft)
- **Mapping**: MITRE ATT&CK, NIST frameworks
- **Roles**: SOC, AppSec, CloudSec, AI, OT, OffSec, workforce, leadership
- **Customization**: Generate labs around customer tech stack, controls, code, emerging threats
- **Validation**: Outcome-based (evidence of demonstrated capability, not completion)

---

## 2. SIMULATION APPROACHES

| Platform | Simulation Type | Isolation | Realism |
|----------|-----------------|-----------|---------|
| HackTheBox | Real VMs (KVM/QEMU) | Per-user VPN/AttackBox | High — real OS, real vulns |
| TryHackMe | Real cloud VMs + AttackBox | Per-session cloud VM | High — real enterprise tools |
| Windows Simulators | Pure frontend (JS) | Browser sandbox | UI only — no kernel, no real apps |
| CyberRangeCZ | Container/VM sandboxes | Kubernetes namespaces + cloud | Configurable — full network topologies |
| AIT Cyber Range | OpenStack VMs + Terraform/Ansible | OpenStack projects | High — real IT/OT infrastructure |
| Instruqt | Real cloud accounts | Per-session IAM credentials | Highest — actual cloud APIs |
| Strigo | Real VMs/cloud accounts | Per-learner isolation | High — real environments |
| Azure Lab Services | Real Azure VMs | Per-lab VNet + NSG | High — real Windows/Linux |
| RangeForce | Virtual server framework | Cloud range isolation | High — attack bots, real tools |
| Immersive Labs | Browser-based labs + ranges | Per-exercise isolation | High — live systems, real tooling |

**Key Distinction**: "Simulation" vs "Real Environment"
- **Simulation** (Windows simulators): Frontend-only, no backend state, educational/demo only
- **Real Environment** (HTB, THM, Instruqt, Azure Labs, RangeForce, Immersive): Actual compute, real OS, real tools, real network

---

## 3. TECH STACKS SUMMARY

| Layer | Common Choices |
|-------|----------------|
| **Frontend** | React (most), Angular (CyberRangeCZ), Vanilla JS (lightweight sims), TypeScript |
| **State Management** | Redux (Win11React), React Context, Vuex/Pinia (if Vue) |
| **Terminal Emulation** | **xterm.js** (universal standard), WebSocket/SSE for backend connection |
| **Remote Desktop** | Apache Guacamole (RDP/VNC/SSH via guacd), rustguac (Rust alternative), custom WebSocket bridges |
| **Backend API** | Node.js/Express, Python/FastAPI/Django, Go, Java/Spring Boot, Rust/axum |
| **Auth** | OIDC/OAuth2, JWT/JWE tokens (short-lived), RBAC |
| **Container Orchestration** | Kubernetes (EKS/GKE/AKS), Helm, OpenStack |
| **IaC** | Terraform/OpenTofu, Ansible, Helm |
| **Databases** | PostgreSQL (primary), Redis (cache/sessions), OpenSearch/Elasticsearch (logging/analytics) |
| **Event Streaming** | Apache Kafka (HTB), custom event buses |
| **Cloud** | Multi-cloud (AWS, Azure, GCP), or single-cloud managed services |

---

## 4. DATA MODELS (Key Entities)

### User/Identity
```typescript
User {
  id, email, roles[], teams[], skills[], certifications[],
  progress: { labId: { status, score, attempts, completedAt } }
}
```

### Lab/Exercise Definition
```typescript
LabDefinition {
  id, title, description, difficulty, category[],
  author, version, gitRepo?, 
  topology: { nodes[], networks[], credentials[] },
  tasks: [{ id, description, validationScript, hints[] }],
  scoring: { maxPoints, passingThreshold, partialCredit[] },
  timeLimit?, prerequisites[]
}
```

### Sandbox/Environment Instance
```typescript
SandboxInstance {
  id, labDefinitionId, userId/teamId,
  status: provisioning|running|paused|completed|error,
  resources: { vms[], containers[], networks[], cloudAccounts[] },
  connectionInfo: { ssh?, rdp?, vnc?, web?, terminal? },
  createdAt, expiresAt, costEstimate?
}
```

### Ticket/Task Queue (for Project:John)
```typescript
Ticket {
  id, title, description, priority, category,
  status: open|assigned|in_progress|resolved|closed,
  assigneeId?, teamId?,
  createdBy, createdAt, updatedAt, slaDeadline?,
  resolution?: { steps[], evidence[], timeSpent, score },
  simulationContext: { labId?, environmentState? }
}
```

### Scoring/Assessment
```typescript
AssessmentResult {
  userId, labId, attemptId,
  score, maxScore, passed,
  taskResults: [{ taskId, passed, points, evidence, timeSpent }],
  mitreTechniques[], nistControls[],
  completedAt, duration
}
```

### Team Exercise
```typescript
TeamExercise {
  id, name, scenarioId,
  teams: [{ id, members[], roleAssignments[] }],
  injects: [{ id, timestamp, content, targetTeam?, requiresResponse }],
  state: briefing|active|debrief|completed,
  leaderboard: [{ teamId, score, mttr, communicationScore }]
}
```

---

## 5. API DESIGNS (Patterns Observed)

### REST + WebSocket Hybrid
```
REST: CRUD for definitions, users, teams, scheduling
GET    /api/labs/:id
POST   /api/labs/:id/start     → returns SandboxInstance + connection token
DELETE /api/sandboxes/:id

WebSocket: Real-time interaction
WS /api/sandboxes/:id/terminal   → xterm.js stream
WS /api/sandboxes/:id/rdp        → Guacamole protocol frames
WS /api/exercises/:id/events     → inject delivery, scoreboard updates
```

### Token-Based Connection Flow (Strigo/termi pattern)
```
1. POST /api/connection/token { sandboxId, protocol: ssh|rdp|vnc }
   → { token: JWE(exp=5min), gatewayUrl }

2. Browser: WebSocket to gatewayUrl?token=xxx&protocol=rdp
   → Gateway validates JWE, routes to guacd/handler

3. Handler streams protocol frames ↔ browser
```

### Async Provisioning (Instruqt/Azure Labs)
```
POST /api/labs/:id/provision
→ 202 Accepted { operationId }
GET  /api/operations/:operationId
→ { status: pending|running|succeeded|failed, result?: SandboxInstance }
```

### GitOps Content API (Instruqt)
```
GET  /api/content/repos/:repoId/labs
POST /api/content/labs/validate { yamlContent }
→ { valid: bool, errors[], warnings[] }
```

---

## 6. SPECIFIC TECHNIQUES FOR PROJECT:JOHN

### Browser-Based Windows Desktop (Simulated)
- **Win11React pattern**: Redux store with slices: `desktop`, `taskbar`, `windows`, `filesystem`, `apps`, `settings`
- **Window Manager**: z-index stack, snap layouts (CSS Grid), drag/resize via pointer events
- **Virtual FS**: IndexedDB for persistence, in-memory tree for operations, serialized to JSON for export
- **Terminal**: xterm.js + custom command parser (simulated CMD/PowerShell subset)
- **Apps as Components**: Each app = React component with lifecycle (mount, focus, blur, unmount)

### Real Backend Integration (if needed)
- **Terminal → Real Shell**: xterm.js frontend + WebSocket → backend PTY (node-pty, gotty, or Go/SSH lib)
- **RDP/VNC**: Apache Guacamole (guacd) or rustguac for Windows desktop streaming
- **File Transfer**: SFTP via SSH tunnel, or custom WebSocket binary protocol

### Ticket Queue + Simulation Binding
- Ticket references a `labDefinitionId` or `scenarioId`
- On assign: provision sandbox (async), return connection details
- On resolve: validate via `validationScript` in lab definition
- Evidence: screenshots, command logs, file diffs stored per ticket

### Team Mode
- Shared sandbox (single environment, multiple users via Guacamole/terminal multiplexing)
- Or parallel sandboxes with shared injects (FlowGin pattern)
- Real-time sync: WebSocket room for chat, shared whiteboard, inject broadcast

### Scoring/Certificates
- Per-task validation scripts (exit code, file content, registry key, network state)
- Evidence bundle: { ticketId, userId, timestamp, artifacts[], score }
- Certificate: signed JWT or PDF with Merkle proof of evidence hash

---

## 7. RECOMMENDED STACK FOR PROJECT:JOHN

| Layer | Recommendation | Rationale |
|-------|----------------|-----------|
| **Frontend** | React 18 + TypeScript + Vite | Mature, Win11React reference, good ecosystem |
| **State** | Redux Toolkit (or Zustand) | Proven in Win11React, devtools, persistence |
| **Terminal** | xterm.js + WebSocket | Industry standard, works with any backend |
| **Desktop Streaming** | rustguac + guacd | Lightweight, no Java/Tomcat, supports RDP/VNC/SSH |
| **Backend API** | FastAPI (Python) or Node.js/Express | Fast dev, good WebSocket support, async |
| **Auth** | OIDC (Keycloak/Auth0) + short-lived JWE tokens | Standard, secure, integrates everywhere |
| **Orchestration** | Kubernetes (kind/k3s local, EKS/GKE prod) | Matches CyberRangeCZ, Instruqt, scalable |
| **IaC** | Terraform + Ansible | AIT Cyber Range pattern, cloud-agnostic |
| **Database** | PostgreSQL + Redis | Relational + cache/sessions |
| **Event Log** | OpenSearch/Elasticsearch | CyberRangeCZ, Immersive Labs pattern |
| **Content Authoring** | YAML/Markdown + GitOps | Instruqt pattern, version controllable |
| **Validation** | Python scripts in sandbox (sidecar) | Flexible, can check any system state |

---

## 8. SOURCES

### HackTheBox
- [HTB Tech Stack - LeadIQ](https://leadiq.com/c/hack-the-box/5d021eff1e000039005155b0) — Kafka, K8s, Jenkins, Redshift, GCP
- [HTB Labs Help Center](https://help.hackthebox.com/en/articles/5185158-introduction-to-htb-labs) — Machines, Challenges, Sherlocks, Pro Labs

### TryHackMe
- [Forrester Response Blog](https://tryhackme.com/resources/blog/forrester-got-it-wrong-heres-the-evidence) — 4 simulators, AttackBox tools, multiplayer
- [Business Solutions](https://tryhackme.com/business/solutions/tabletop-exercises) — AI-generated tabletops, MITRE/NIST alignment

### Windows Simulators
- [Win11React GitHub](https://github.com/blueedgetechno/win11React) — React, Redux, Vite, SCSS, Tauri
- [Win11React DeepWiki](https://deepwiki.com/blueedgetechno/win11React/1-overview) — Architecture, virtual systems, state management
- [plarika/Windows-11-Simulator](https://github.com/plarika/Windows-11-Simulator) — V10 modular contracts, vanilla JS
- [Vanshfr69/Win10-WebSimulator](https://github.com/Vanshfr69/Win10-WebSimulator) — Vanilla JS, simulated CMD, Fluent Design

### CyberRange Platforms
- [CyberRangeCZ Conceptual Architecture](https://docs.platform.cyberrange.cz/basic-concepts/conceptual-architecture/) — Microservices, Git repos, OpenStack/AWS, Guacamole
- [CyberRangeCZ GitHub](https://github.com/cyberrangecz) — Django, Spring Boot, Angular, Helm, Terraform
- [AIT Cyber Range](https://cyberrange.at/) — OriGin + FlowGin, Terraform, Ansible, OpenStack
- [cyberrange.world](https://cyberrange.world/) — SaaS, containerized workspaces

### Instruqt
- [Instruqt vs Strigo](https://instruqt.com/strigo-alternative-hands-on-virtual-it-lab) — YAML/Markdown, GitOps, hot-start, real cloud accounts
- [Instruqt Platform](https://instruqt.com/) — Any stack, isolated credentials, embeddable, analytics

### Strigo
- [Strigo vs Instruqt](https://strigo.io/vs/instruqt/strigo-vs-instruqt) — Custom VMs, disposable clouds, live classroom, AI assistance
- [Virtual IT Labs Comparison](https://tools.resorsit.com/tools/it-operations/training-lab/) — Feature matrix, Instruqt/Strigo/Killercoda/LabEx/CloudShare

### Azure Lab Services
- [Architecture Fundamentals](https://learn.microsoft.com/en-us/azure/lab-services/classroom-labs-fundamentals) — SaaS, lab plan → lab → VMs, VNet isolation, load balancer RDP/SSH
- [Key Concepts](https://learn.microsoft.com/sr-latn-rs/azure/lab-services/classroom-labs-concepts) — Lab plan, lab, VM, advanced networking

### RangeForce
- [RangeForce Platform](https://www.rangeforce.com/platform) — Cloud range, drills, team exercises, skill modules
- [Yahoo Finance Release](https://finance.yahoo.com/news/rangeforce-debuts-cyberskills-platform-jump-155641823.html) — Virtual server architecture, NATO cyber range heritage

### Immersive Labs
- [Product Guide](https://www.immersivelabs.com/legal-documents/product-guide) — Cyber range exercises, dynamic threat ranges
- [Platform](https://www.immersivelabs.com/platform) — Prove/Improve/Benchmark/Report loop, AI readiness
- [Press Release](https://www.immersivelabs.com/resources/press/immersive-labs-unveils-enterprise-class-cyber-skills-and-resilience-platform-for-the-entire-organization) — Unified platform, workforce exercising, resilience scoring

### Terminal/Remote Desktop Tech
- [BaseMax/online-web-ssh](https://github.com/BaseMax/online-web-ssh) — xterm.js + WebSocket + paramiko bridge
- [shuv-o/termi](https://github.com/shuv-o/termi) — Next.js, Prisma, PostgreSQL, guacd, JWE tokens, multi-protocol gateway
- [sol1/rustguac](https://github.com/sol1/rustguac) — Rust/axum replacement for Guacamole, single binary
- [hullarb/ssheasy](https://deepwiki.com/hullarb/ssheasy) — WebAssembly SSH client, WebSocket proxy