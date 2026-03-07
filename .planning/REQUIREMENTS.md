# Requirements: Stallion

**Defined:** 2026-03-07
**Core Value:** Make Claude Code's autonomous coding power accessible to anyone through a browser — no local setup, no API keys, no CLI.

## v1 Requirements

### Sandbox & Execution

- [ ] **SAND-01**: Each CC session runs in an isolated Docker container with its own filesystem
- [ ] **SAND-02**: CC has full tool access inside the container: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Task
- [ ] **SAND-03**: Container has resource limits: 4GB RAM, 2 CPU, 10GB disk
- [ ] **SAND-04**: Per-session wall-clock timeout (configurable, default 30 minutes)
- [ ] **SAND-05**: Per-session API cost budget cap (configurable, default $5)
- [ ] **SAND-06**: Credential proxy — CC session never sees raw API keys; proxy injects auth headers
- [ ] **SAND-07**: Container cleanup on session end (no zombie containers)

### Session Management

- [ ] **SESS-01**: User can create a new CC session from the browser with a text prompt
- [ ] **SESS-02**: User can send follow-up messages during a running session (multi-turn via SDK `resume`)
- [ ] **SESS-03**: Real-time terminal-style activity feed: text with green bullets, tool calls with bold name + collapsible IN/OUT
- [ ] **SESS-04**: Session persists — user can return to a completed or running session
- [ ] **SESS-05**: User can stop/abort a running session
- [ ] **SESS-06**: Session history list in sidebar (sorted by recency)
- [ ] **SESS-07**: SDK session JSONL persisted to storage for cross-restart resume

### File Management

- [ ] **FILE-01**: User can browse files CC created in the workspace
- [ ] **FILE-02**: User can view file contents in the browser
- [ ] **FILE-03**: User can download individual files or full workspace as zip

### User & Auth

- [ ] **AUTH-01**: User can create account and log in (Supabase Auth)
- [ ] **AUTH-02**: User provides their own Anthropic/Azure API key (BYO key)
- [ ] **AUTH-03**: API keys stored encrypted, never exposed to CC sessions (fed via credential proxy)
- [ ] **AUTH-04**: Session ownership — users see only their own sessions

### User Configuration

- [ ] **CONF-01**: User-level storage for skills (DB records + .md file content)
- [ ] **CONF-02**: User-level storage for agents (DB records + .md file content)
- [ ] **CONF-03**: User config automatically injected into every new CC session as CLAUDE.md / .claude/agents/
- [ ] **CONF-04**: Per-session .claude directory for session-local state (skills/agents created during session)
- [ ] **CONF-05**: GSD workflow installed as a built-in skill — CC follows structured methodology (question → research → plan → execute)

### MCP Tools

- [ ] **MCP-01**: Curated MCP directory with 5-10 verified tools (GitHub, Playwright, filesystem, web search, etc.)
- [ ] **MCP-02**: User can browse available MCPs and toggle them on/off for their sessions
- [ ] **MCP-03**: Enabled MCPs automatically configured in CC session via `options.mcpServers`
- [ ] **MCP-04**: Per-MCP credential management (user provides tokens, stored encrypted)

### Frontend

- [ ] **UI-01**: Landing page with prompt input and example cards
- [ ] **UI-02**: Dashboard with terminal-style activity feed (8 cols) + workspace file browser (4 cols)
- [ ] **UI-03**: Chat input at bottom of dashboard for follow-up messages
- [ ] **UI-04**: Sidebar with session history, new session button, user menu
- [ ] **UI-05**: Session status indicators (running/completed/failed) with elapsed time

## v2 Requirements

### Execution Environment

- **SAND-V2-01**: Migrate from Docker to E2B (Firecracker microVMs) for production-grade isolation
- **SAND-V2-02**: Session pause/resume with filesystem snapshot
- **SAND-V2-03**: Pre-warmed container pool for instant session starts

### Collaboration

- **COLLAB-01**: Share session output via public link
- **COLLAB-02**: Fork a completed session into a new one

### Platform

- **PLAT-01**: Full MCP marketplace (community submissions, review process, ratings)
- **PLAT-02**: GitHub integration — export workspace to repo, import repo as workspace
- **PLAT-03**: Custom domain for deployed projects
- **PLAT-04**: Subscription billing (alternative to BYO key)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Native mobile app | Web-first, responsive design sufficient |
| Self-hosting / on-prem | Cloud-only simplifies infra |
| Real-time collaboration | Single user per session, avoid complexity |
| Non-Claude LLM support | Claude-only via Anthropic API / Azure Foundry |
| Full in-browser code editor | CC handles editing; file viewer is sufficient |
| Deployment hosting | Separate product vertical (Vercel, Netlify handle this) |
| Scheduled/cron sessions | Adds billing and abuse complexity |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SAND-01 | Phase 1 | Pending |
| SAND-02 | Phase 1 | Pending |
| SAND-03 | Phase 1 | Pending |
| SAND-04 | Phase 1 | Pending |
| SAND-05 | Phase 1 | Pending |
| SAND-06 | Phase 1 | Pending |
| SAND-07 | Phase 1 | Pending |
| SESS-01 | Phase 2 | Pending |
| SESS-02 | Phase 2 | Pending |
| SESS-03 | Phase 2 | Pending |
| SESS-04 | Phase 2 | Pending |
| SESS-05 | Phase 2 | Pending |
| SESS-06 | Phase 2 | Pending |
| SESS-07 | Phase 2 | Pending |
| FILE-01 | Phase 2 | Pending |
| FILE-02 | Phase 2 | Pending |
| FILE-03 | Phase 2 | Pending |
| AUTH-01 | Phase 3 | Pending |
| AUTH-02 | Phase 3 | Pending |
| AUTH-03 | Phase 3 | Pending |
| AUTH-04 | Phase 3 | Pending |
| CONF-01 | Phase 4 | Pending |
| CONF-02 | Phase 4 | Pending |
| CONF-03 | Phase 4 | Pending |
| CONF-04 | Phase 4 | Pending |
| CONF-05 | Phase 4 | Pending |
| MCP-01 | Phase 5 | Pending |
| MCP-02 | Phase 5 | Pending |
| MCP-03 | Phase 5 | Pending |
| MCP-04 | Phase 5 | Pending |
| UI-01 | Phase 2 | Pending |
| UI-02 | Phase 2 | Pending |
| UI-03 | Phase 2 | Pending |
| UI-04 | Phase 2 | Pending |
| UI-05 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-07*
*Last updated: 2026-03-07 after initial definition*
