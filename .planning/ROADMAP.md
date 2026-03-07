# Roadmap: Stallion

## Overview

Stallion ships as four phases that each deliver a complete, independently verifiable capability. Phase 1 closes the critical security gap (SDK running on the host) and establishes the isolated execution foundation everything else depends on. Phase 2 builds the working product loop — users can start sessions, watch CC work in real time, chat, and download files. Phase 3 adds user accounts and persistent personalization (skills, GSD workflow, BYOK). Phase 4 ships the MCP marketplace — the long-term moat with the highest attack surface, deliberately isolated last.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Sandbox Infrastructure** - Safe, isolated CC execution environment with resource caps, credential proxy, and subprocess lifecycle management
- [ ] **Phase 2: Session UI and File Access** - Complete working product loop: start a session, watch the activity feed, chat with CC, browse and download files
- [ ] **Phase 3: Auth and User Configuration** - User accounts, BYOK API keys, persistent skills, and GSD workflow injection
- [ ] **Phase 4: MCP Marketplace** - Curated MCP directory with per-user install, encrypted credential management, and egress controls

## Phase Details

### Phase 1: Sandbox Infrastructure
**Goal**: Every CC session runs in an isolated container — the host is safe, API keys are never exposed, and no session can affect another
**Depends on**: Nothing (first phase)
**Requirements**: SAND-01, SAND-02, SAND-03, SAND-04, SAND-05, SAND-06, SAND-07
**Success Criteria** (what must be TRUE):
  1. A CC session runs entirely inside a Docker container — no SDK process runs on the API server host
  2. The container is destroyed cleanly after the session ends with no zombie processes
  3. A session that exceeds its wall-clock timeout or API cost budget is automatically stopped
  4. CC inside the container never receives a raw API key — all auth is proxied
  5. A single container cannot consume more than 4GB RAM, 2 CPU, or 10GB disk
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Agent control server package + Dockerfile + shared sandbox types
- [ ] 01-02-PLAN.md — Container lifecycle manager, backend integration, session timers, JSONL persistence
- [ ] 01-03-PLAN.md — Credential proxy, cost budget monitoring, network isolation

### Phase 2: Session UI and File Access
**Goal**: A user can start a CC session, watch it work in real time, steer it with follow-up messages, and retrieve the files it created
**Depends on**: Phase 1
**Requirements**: SESS-01, SESS-02, SESS-03, SESS-04, SESS-05, SESS-06, SESS-07, FILE-01, FILE-02, FILE-03, UI-01, UI-02, UI-03, UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. User can describe a task on the landing page, hit enter, and a CC session starts running within the sandbox
  2. The activity feed shows CC's output in real time — text with green bullets, tool calls with bold names and collapsible IN/OUT
  3. User can send a follow-up message while CC is running and CC incorporates it without restarting the session
  4. User can stop a running session at any time with an abort button
  5. User can browse files CC created, view their contents, and download the full workspace as a zip
**Plans**: TBD

Plans:
- [ ] 02-01: Session lifecycle API and WebSocket relay
- [ ] 02-02: Landing page and dashboard UI (activity feed, file browser)
- [ ] 02-03: Session persistence (JSONL to storage), history sidebar, resume

### Phase 3: Auth and User Configuration
**Goal**: Users have accounts, their API keys are stored securely, and every CC session automatically inherits their saved skills and GSD workflow
**Depends on**: Phase 2
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, CONF-01, CONF-02, CONF-03, CONF-04, CONF-05
**Success Criteria** (what must be TRUE):
  1. User can sign up, log in, and log out — sessions in the history belong only to that user
  2. User can enter their Anthropic or Azure API key in settings — it is stored encrypted and never appears in CC session environment variables
  3. GSD workflow is pre-installed in every new CC session without any user action required
  4. User can add, edit, and delete custom skills — they automatically appear in the next CC session
  5. Skills and agents created during a session are captured in the per-session .claude directory
**Plans**: TBD

Plans:
- [ ] 03-01: Supabase auth (email + OAuth), JWT middleware, session ownership
- [ ] 03-02: BYOK encrypted storage and credential proxy integration
- [ ] 03-03: UserConfigBuilder, GSD skill injection, CLAUDE.md assembly, user settings UI

### Phase 4: MCP Marketplace
**Goal**: Users can browse and install curated MCP tools — enabled MCPs are automatically available in every CC session with credentials stored securely and network egress controlled
**Depends on**: Phase 3
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04
**Success Criteria** (what must be TRUE):
  1. User can browse a curated list of 5-10 verified MCPs and see what each tool does
  2. User can toggle an MCP on or off — enabled MCPs are active in the next CC session without any manual configuration
  3. User can provide credentials for an MCP (e.g., a GitHub token) — credentials are stored encrypted and injected at session start
  4. An MCP server can only make outbound network calls to its declared allowlist — it cannot exfiltrate data to arbitrary destinations
**Plans**: TBD

Plans:
- [ ] 04-01: MCP registry (curated), per-user install/uninstall, marketplace UI
- [ ] 04-02: Encrypted MCP credential storage, session injection, egress controls

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Sandbox Infrastructure | 1/3 | In progress | - |
| 2. Session UI and File Access | 0/3 | Not started | - |
| 3. Auth and User Configuration | 0/3 | Not started | - |
| 4. MCP Marketplace | 0/2 | Not started | - |
