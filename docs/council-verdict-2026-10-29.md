# LLM Council Verdict — Is Project:John a good personal project? (2026-10-29)

**Bottom line:** Good idea, not yet a good project. The simulator itself doesn't exist — only the UI around it. Reverse priorities: engine first, frontend frozen.

Use this document as the reference for prioritising Project:John work. Anything not on the "Now" list goes to "Future" until real trainees ask for it.

## State at time of verdict
- Repo created 2026-10-28, ~58 commits, frontend only (~7.5k LOC strict TS, Redux, Zod, WS middleware, 31 test files, Playwright).
- No simulation backend: live site only works with `?demo=1` (5 tickets, 6 services, 2 events).
- Design docs (ARCHITECTURE.md, SIM_ENGINE_DESIGN.md) describe a funded-startup scope.

## Consensus findings
- The idea is sound: help desk training is underserved next to red-team platforms (HTB/THM).
- The core — deterministic machine state where e.g. stopping Spooler logs an event and breaks printing — has zero code.
- Scope is far too big for a solo dev. Deferred: OIDC/Keycloak, multi-tenancy, guacd/rustguac streaming, AI voice, anti-cheat, rubric DSL, certificates, cohorts/team mode.
- Repo root makes a bad first impression (agent JSONs, `playwright-report/`, `test-results/`, `.obsidian/`, loose Python).
- One complete, scored ticket beats 62 planned commands.

## Decisions on disputed points
- **In-browser engine, not a server.** Pure TypeScript state machines running client-side → deterministic, testable, works on GitHub Pages. Put it behind a local transport that speaks the existing WebSocket event contract, so Redux/Zod/middleware stay useful and a real backend can replace it later without UI changes.
- **Simulate, don't use real VMs.** Free, instant, browser-only, deterministic grading. (Real VMs cost per session and are hard to score.)
- **Not a business yet.** Pre-hire assessment / colleges / shareable certs are real upside, but only after tickets work and trainees validate them.

## Blind spots to keep in mind
- Know the differentiator vs TestOut LabSim, CompTIA CertMaster Labs, Practice Labs, Microsoft Learn sandboxes. Candidate: scoring *process and communication*, not just "fixed or not".
- Write the engine **by hand**, not via subagents — it's the part that proves understanding in interviews.
- Ticket content is the real bottleneck: validate scenarios against real Windows behaviour / real help desk experience.
- Check committed agent JSONs for secrets or private prompts before cleanup.
- Windows 11 lookalike UI may carry trademark/trade-dress risk; prefer neutral styling.

## Now (in order)
1. **Print Spooler ticket end to end in the browser** — `sc query`, `sc start`, `Get-Service`, `Restart-Service`, `Get-EventLog` against a real state object; fix verified by state; score checks whether the event log was read before restarting the service.
2. AD account lockout ticket.
3. Wrong DNS ticket.
4. Live site works without `?demo=1`; README opens with a GIF of one ticket being solved.
5. Clean repo root (remove agent artifacts/reports, move Python to `/prototypes` or delete).

## Validation gate (~4 weeks)
Put the 3 tickets in front of 3 real trainees or an IT instructor. Their feedback decides whether ticket 4 or any deferred feature gets built.

## Future (blocked until the gate passes)
OIDC/auth, multi-tenancy, remote desktop streaming, AI voice caller, anti-cheat, rubric DSL, certificates, team/cohort mode, extra subsystems beyond what tickets need (grow the engine from tickets, not from the design doc).
