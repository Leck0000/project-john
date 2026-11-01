# Core Gameplay Loop: SysDesk (project-john)

## Design Pillars
- **Learning by doing**: Players troubleshoot realistic IT scenarios, not memorize facts
- **Gradual complexity**: Start with ticket triage, progressively unlock diagnostics tools
- **Methodology over memorization**: Identify → Hypothesize → Test → Resolve → Document cycle
- **Realism with gamification**: Simulated real tools (CLI, Event Viewer, Device Manager), minigames only for abstract concepts

---

## Moment-to-Moment (0–30 seconds)

### Core Verb: Ticket Triage
- **Action**: Player reads incoming ticket, categorizes by type (hardware, software, network, security), identifies symptoms
- **Feedback**: Ticket appears in terminal; category tags render; symptom list displays
- **Reward**: Progress bar fills; XP awarded for correct categorization; diagnostic tools unlock at thresholds

### Diagnostic Probe
- **Action**: Player selects appropriate tool for category (e.g., `ping` for network, `ipconfig` for IP issues, `eventvwr` for system logs, `devmgmt.msc` for hardware)
- **Feedback**: Simulated CLI responds with output matching the scenario; output is realistic but simplified
- **Reward**: XP for successful diagnosis; tool availability unlocks based on player level

### Resolution Confirmation
- **Action**: Player applies fix, verifies resolution with simulated user query
- **Feedback**: Ticket status changes to "Resolved"; user confirms; XP + reputation awarded
- **Failure State**: Wrong fix → ticket stays open → reputation loss → player must retry

---

## Session Loop (5–30 minutes)

### Goal: Complete a Full Support Shift
- **Objective**: Resolve a set of tickets (3–5 per shift, scaling with difficulty) to earn shift completion bonus
- **Tension**: Resource pressure — each resolution costs time/reputation; unresolved tickets accumulate; “escalation” tickets appear if queue exceeds threshold
- **Resolution**: All tickets resolved → shift complete → XP + reputation + skill point awarded; some tickets may carry over to next shift if not resolved in time

### Key Decisions:
- Prioritize which tickets to tackle first (triage order matters)
- Decide whether to use hints (costs reputation, learns tool for future)
- Manage queue depth before escalations trigger

---

## Long-Term Loop (hours–weeks)

### Progression: Tech Career Path
- **Career Levels**: L1 → L2 → Senior → Lead (4 tiers)
- **XP Curve**: Each level requires increasing XP (formula: `100 × level^1.5`)
- **Skill Points**: Awarded per shift completion; spend on specialization unlocks

### Specialization Tracks (unlock at Senior):
1. **SysAdmin** — Focus on system internals (Registry, Services, Event Log)
2. **NetEng** — Focus on network diagnostics (ping, traceroute, IP config, connectivity)
3. **SecAnalyst** — Focus on security (phishing detection, permission analysis, malware simulation)

### Unlock Gates:
- **Device Manager**: Unlocks at L1 after 3 shift completions
- **Event Viewer**: Unlocks at L2 after 10 shift completions
- **Network Tools**: Unlocks at L2 after 5 network-ticket resolutions
- **AI Hint System**: Unlocks at Senior after all three tracks partially completed

### Retention Hooks:
- Daily "maintenance ticket" (quick resolution, small XP)
- Weekly "major incident" (complex multi-ticket scenario, large XP/reputation)
- Career milestone notifications ("You've reached SysAdmin track!")

---

## Mechanic Specifications

### Mechanic: Ticket Resolution Flow
- **Purpose**: Core loop of receiving, diagnosing, and resolving IT support tickets
- **Player Fantasy**: Feeling like a competent IT technician solving real problems
- **Input**: Ticket object (type, severity, symptoms, simulated user query)
- **Output**: Ticket status (Open → In Progress → Resolved → Closed), XP, reputation, skill points
- **Success Condition**: Ticket resolved correctly with appropriate tool usage; user confirms resolution
- **Failure State**: Wrong fix applied → ticket remains open → reputation penalty → player must retry with different approach
- **Edge Cases**:
  - Concurrent tickets: Player can only work on one at a time; others queue
  - Escalation trigger: Queue > 5 tickets → "Urgent" tickets appear with higher stakes
  - Tool availability: Some tools locked until player reaches appropriate level
- **Tuning Levers**: Tickets per shift, XP per resolution, reputation cost, tool unlock thresholds
- **Dependencies**: Skill tree progression, tool availability, player level

### Mechanic: Virtual Device Manager
- **Purpose**: Simulate Windows Device Manager for hardware diagnostics
- **Player Fantasy**: Identifying hardware issues (missing drivers, failed devices)
- **Input**: Device category (network adapters, storage, display, sound), diagnostic action (scan, update driver, disable, enable)
- **Output**: Device status (working, warning, error, unknown), driver version, resource conflicts
- **Success Condition**: Correctly identifies device issue; applies appropriate fix
- **Failure State**: Misdiagnosis → wrong fix → system instability simulation → reputation loss
- **Edge Cases**:
  - Virtual device state persists across shifts (saved in MachineState)
  - Driver update simulation may succeed or fail based on player level
- **Tuning Levers**: Device categories unlocked per level, success rate per level, conflict rarity

### Mechanic: Phishing Detection Minigame
- **Purpose**: Teach security awareness — identifying fake emails/systems
- **Player Fantasy**: Feeling like a security-conscious analyst
- **Input**: Email simulation with sender, subject, links, attachments, urgency cues
- **Output**: Classification (Legitimate | Suspicious | Phishing) + reasoning selection
- **Success Condition**: Correctly identifies phishing attempt; explains red flags
- **Failure State**: Misses phishing → simulated compromise → reputation + XP penalty
- **Edge Cases**:
  - Legitimate emails with urgent language (test nuance)
  - Sophisticated spoofing (tests visual inspection skills)
- **Tuning Levers**: Success rate per level, penalty severity, hint availability

---

## Onboarding Flow

### First 30 Seconds: Core Verb Introduction
- Guided first ticket appears with walkthrough
- Player learns: read ticket → categorize → select tool → run diagnostic → apply fix
- First success guaranteed (tutorial scenario, no failure possible)
- XP + short reputation awarded

### First Session: 3 Tickets, Unlock Device Manager
- Three tickets of increasing difficulty (hardware, software, network)
- After completing all three → Device Manager tool unlocks
- First session ends on hook: "You've unlocked Device Manager — new hardware diagnostics available"

### First Shift Completion: Unlock Network Tools
- Complete 5+ tickets in a shift
- Network tools (ping, ipconfig, traceroute) unlock
- Shift completion screen shows progress to L2

---

## System Interaction Matrix

| Subsystem | XP Reward | Unlocks | Dependencies |
|-----------|-----------|---------|--------------|
| Ticket Resolution | +50 XP/ticket | Skill points | None (always available) |
| Device Manager | +75 XP/scan | SysAdmin track | L1 + 3 shift completions |
| Event Viewer | +75 XP/log | SecAnalyst track | L2 + 10 shift completions |
| Network Tools | +75 XP/diag | NetEng track | L2 + 5 network tickets |
| Phishing Detection | +100 XP/session | SecAnalyst track | Available at L2 |
| Specialization Choice | +200 XP | Career path lock | Senior level reached |

**Progression Flow**: Ticket Resolution → XP → Skill Points → Specialization Unlock → Track-Specific Tools → Higher-Value Tickets → Faster Leveling → Senior → Full Track Access