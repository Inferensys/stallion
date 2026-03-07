# Project Research Summary

**Project:** Stallion — Cloud-Native Claude Code Platform
**Domain:** Cloud AI coding agent platform (browser-based Claude Code as a service)
**Researched:** 2026-03-07
**Confidence:** HIGH (all four research areas backed by official docs and verified live products)

## Executive Summary

Stallion is a cloud-native platform that delivers Claude Code (the most developer-trusted terminal AI agent) through a browser, with zero local setup, persistent user configuration, and an MCP marketplace. The market has bifurcated: IDE-embedded agents (Cursor, Windsurf) own the local-setup audience, while cloud-native agents (Devin, Bolt, Replit) own the browser-first audience. Stallion's window is to own a third position: cloud-native but Claude-specific, with the terminal-style transparency and structured workflow that developers trust. No competitor currently offers a browser-accessible MCP marketplace or user-level skill accumulation that persists across sessions.

The recommended approach is a three-variant execution strategy: start with Docker via the already-installed `dockerode` for an MVP (fastest path to working demo, zero new accounts), migrate to E2B (Firecracker microVMs) for production-grade isolation and managed scale, and optionally evaluate Fly Sprites if persistent developer environments become a differentiator. The existing monorepo (Hono + Next.js + Socket.IO + Supabase + Agent SDK) has the right architecture already in place — the core gaps are sandbox isolation (SDK currently running on the host, a critical security flaw), user authentication, and session persistence. The relay pattern (SDK async generator → SDKEnvelope → WebSocket → Zustand store) is already proven correct and must be preserved.

The most significant risks are not technical complexity but security and economics: standard Docker containers are an unacceptable isolation boundary for multi-tenant CC execution (real CVEs exist), the Claude Agent SDK spawns long-lived subprocesses that will leak memory and accumulate as zombies without explicit process-group management, and a single session without a cost ceiling can be existentially expensive. Every phase of development must treat these three concerns — isolation strength, subprocess lifecycle, and budget caps — as load-bearing, not afterthoughts. Sandbox isolation is the critical-path dependency: every downstream feature (real-time streaming, file browsing, MCP marketplace) depends on the execution environment being safe, reliable, and cost-bounded first.

## Key Findings

### Recommended Stack

The existing monorepo has the right core technology. The primary gap is the execution environment: the Claude Agent SDK must run inside an isolated sandbox (container or microVM), not on the API server host. For MVP, `dockerode` (already installed) provides Docker-based isolation that is acceptable for single-tenant or low-scale deployment. For production, E2B (Firecracker microVMs) provides industry-standard multi-tenant isolation — the same platform that Manus, the leading AI agent platform, uses. Redis is the only net-new dependency needed for production (session state hot cache + Socket.IO multi-worker pubsub fan-out).

**Core technologies:**
- `@anthropic-ai/claude-agent-sdk` 0.2.x: CC session orchestration — already in codebase, required (Zod 4 dependency must not be downgraded)
- Docker via `dockerode` 4.0.9: MVP sandbox — already installed, zero new accounts, hours to integrate
- E2B (Firecracker): Production sandbox — purpose-built for AI agents, ~150ms warm boot, 24h sessions, official Anthropic recommendation
- Hono 4.x: API backend — already in codebase, keep
- Next.js 15: Frontend — already in codebase, keep
- Supabase (auth + PostgreSQL): User accounts, session metadata, skills, MCPs — already integrated, extend schema
- Socket.IO 4.8.x: Real-time event streaming — already in codebase, keep
- Redis 7.x: Session hot cache + Socket.IO multi-worker pubsub — new for production, skip for MVP
- `ioredis` 5.x: Redis client — new dependency when Redis is introduced

**Critical version constraint:** Zod v4 is required by the Agent SDK. Downgrading to v3 breaks the SDK. This is non-negotiable.

### Expected Features

The competitive landscape confirms a clear feature tier structure. Sandboxed execution is not a feature — it is the product. Every feature above it in the stack depends on it working correctly.

**Must have (table stakes, v1 launch):**
- Sandboxed CC session in the cloud — zero local setup, runs in browser
- Real-time terminal-style activity feed — glass-box transparency, already partially built
- Multi-turn chat during session — users steer CC without starting over
- File browser + download — users must be able to retrieve their code
- Session persistence + history — users return to completed sessions
- User authentication — required for all personalization features
- Interrupt / stop session — safety valve, required for trust
- GSD workflow skill injection — structured autonomy differentiator, low complexity

**Should have (competitive, v1.x after validation):**
- Persistent user skills / CLAUDE.md injection — no competitor does user-level skill accumulation
- MCP marketplace (curated, 5-10 tools) — first-mover in cloud-native MCP; GitHub Copilot's MCP registry is IDE-only
- BYOK (Anthropic + Azure) — removes cost objection for power users and teams
- GitHub export — high demand signal, Bolt already does this
- Per-session .claude directory capture — power user retention

**Defer (v2+):**
- Skill sharing / skill store — marketplace problem, needs moderation and versioning
- Scheduled / automated sessions — separate infrastructure problem
- Parallel sessions — resource-intensive, defer until usage patterns justify it
- Real-time collaboration (multiplayer) — 3x complexity for marginal early value

**Anti-features to reject explicitly:**
- Built-in deployment / hosting — deep product vertical, distraction from core job
- Custom non-Anthropic LLM providers — CC is Claude-specific, model switching breaks the product
- VS Code extension / IDE plugin — abandons the "no local setup" differentiator, competes on Cursor's turf

### Architecture Approach

The existing relay architecture (SDK `query()` async generator → SDKEnvelope → WebSocket fan-out → Zustand store) is already the correct pattern and must be preserved. The three gaps to close are: (1) move SDK execution into an isolated sandbox via a `SandboxProvider` abstraction interface, (2) add a `UserConfigBuilder` service that assembles `query()` options from per-user skills and MCPs stored in Supabase, and (3) persist the SDK session JSONL file to external object storage after each session so containers can be destroyed and resumed on a fresh container.

**Major components:**
1. **SandboxProvider (new abstraction)** — interface over Docker (dev), E2B, or Fly Machines; swappable without touching SessionEngine
2. **SessionEngine (rename MissionEngine)** — existing relay logic, sound; add sandbox provider integration and JSONL persistence
3. **UserConfigBuilder (new service)** — loads user skills + MCPs from DB, assembles complete `query()` options at session start
4. **SessionManager (rename MissionManager)** — session lifecycle (create/start/abort/resume), pub/sub fan-out to WebSocket clients
5. **Frontend (extend existing)** — add file browser, user settings, MCP marketplace pages; existing activity log and session store are correct
6. **Persistence (extend Supabase schema)** — add users, sessions, user_skills, user_mcps tables; object storage for SDK JSONL + workspace file snapshots

### Critical Pitfalls

1. **Shared-kernel Docker containers are not acceptable for multi-tenant production** — Real CVEs (CVE-2024-1086, CVE-2025-31133) break Docker isolation; one exploit gives host access to all sessions. Prevention: use E2B/Firecracker for production; never use `--privileged`; always apply seccomp profiles. MVP Docker is acceptable if single-tenant or controlled-access.

2. **SDK subprocess orphan memory leaks will crash production** — Confirmed real incidents: 48 orphaned CC subprocesses consuming 2.3GB after 17 hours, sessions growing to 93GB+ heap. Prevention: track child PIDs, send SIGTERM to process group on session end, mount `/tmp` as `tmpfs` with size cap, schedule periodic container recycling as backstop.

3. **No session budget cap is existentially dangerous** — 340% average cost overruns documented; one runaway session can consume thousands of dollars. Prevention: hard `max_tokens` ceiling per `query()`, wall clock TTL (30 min default, 2hr max), per-session LLM API call count limit, anomaly detection at 3x rolling average.

4. **MCP marketplace is a supply chain attack surface** — Documented: malicious MCP servers injecting BCC email copies, GitHub MCP prompt injection exfiltrating private repo contents, `mcp-remote` RCE CVE. Prevention: static analysis before listing, per-MCP network egress allowlist, version pinning + explicit update approval, credential proxy pattern.

5. **Workspace prompt injection can exfiltrate API keys** — CVE-2025-59536 and CVE-2026-21852 are Claude Code-specific: malicious `.claude/settings.json` in a cloned repo executes commands before trust prompt; malicious `ANTHROPIC_BASE_URL` redirects the API key to an attacker's server. Prevention: strip `.claude/` on workspace import, use credential proxy so CC never sees the raw API key, enforce egress allowlist.

## Implications for Roadmap

Based on combined research, the natural phase structure follows the feature dependency graph: sandbox isolation is load-bearing for everything, user auth unlocks personalization, and MCP marketplace requires both to be solid first.

### Phase 1: Sandbox Infrastructure and Session Core

**Rationale:** Everything else depends on having a safe, reliable, isolated execution environment. The current codebase runs the SDK on the API server host — a critical security flaw that must be fixed before any public access. This is not Phase 1 because it's the most impressive feature; it's Phase 1 because it is the product.

**Delivers:** Isolated CC session execution (Docker/microVM), credential proxy (so CC never sees raw API key), workspace file scoping, egress filtering, SDK subprocess lifecycle management, warm container pool design, and the `SandboxProvider` abstraction interface.

**Features addressed:** Sandboxed execution environment (table stakes #1), zero local setup, interrupt/stop session

**Pitfalls mitigated:** Shared-kernel escape (Pitfall 1), workspace prompt injection (Pitfall 5), SDK cold start latency (Pitfall 8)

**Research flag:** STANDARD PATTERNS — E2B SDK, dockerode, and the SandboxProvider abstraction pattern are all well-documented. No additional research needed.

---

### Phase 2: Session Lifecycle and Reliability

**Rationale:** Before adding any user-facing features, the session state machine must be airtight. Zombie sessions, memory leaks, and no-resume capability are the top complaints against every competitor in this space. Fixing them now is cheaper than retrofitting around them.

**Delivers:** Robust session states (RUNNING/PAUSED/COMPLETED/CRASHED/ARCHIVED), zombie detection and cleanup (heartbeat + TTL sweep), SDK JSONL persistence to object storage for true session resume, per-session budget caps (token ceiling + wall-clock TTL + API call count limit), SDK subprocess process-group lifecycle management.

**Features addressed:** Session persistence + history (table stakes), session resume, error recovery / failure surface

**Pitfalls mitigated:** SDK orphan memory leaks (Pitfall 3), zombie sessions (Pitfall 6), no resumability after crash (Pitfall 7), runaway API costs (Pitfall 2)

**Research flag:** STANDARD PATTERNS — session state machines and cost limiting are well-understood. The SDK session JSONL persistence and process-group management patterns are documented in official Anthropic SDK docs.

---

### Phase 3: User Authentication and Session Management UI

**Rationale:** Auth is the dependency unlock for all personalization features (skills, MCP marketplace, BYOK). It also unlocks the session history and file browser that make the product feel complete rather than a demo. Auth goes here — not earlier — because there's nothing to personalize until the session infrastructure is solid.

**Delivers:** Supabase auth integration (email + OAuth), session list per user, file browser + ZIP download, session transcript replay on reconnect, interrupt/stop button, elapsed timer and granular session states in UI.

**Features addressed:** User authentication, session history, file browser + download, real-time streaming output (polish), multi-turn chat (polish)

**Stack:** Supabase `@supabase/ssr`, Supabase PostgreSQL schema extensions (users, sessions tables), Next.js middleware for JWT verification

**Pitfalls mitigated:** Session isolation in WebSocket rooms must be enforced by authenticated ownership (not just client-reported session IDs)

**Research flag:** STANDARD PATTERNS — Supabase SSR + Hono JWT middleware are well-documented. No additional research needed.

---

### Phase 4: GSD Workflow and User Skills

**Rationale:** The GSD workflow skill injection is a differentiator with very low implementation complexity (it's a CLAUDE.md injection at session start). User skills storage extends this into a persistent personalization layer that no competitor offers. These two features share infrastructure (skill storage, CLAUDE.md builder, `appendSystemPrompt` injection) and should ship together.

**Delivers:** GSD structured workflow skill pre-installed for all sessions, user skills CRUD (add/edit/delete custom skills), `UserConfigBuilder` service that assembles `query()` options from DB at session start, `SkillInjector` that builds the composite CLAUDE.md, user settings UI.

**Features addressed:** GSD workflow skill injection (v1), user skills storage + injection (v1.x)

**Architecture implemented:** UserConfigBuilder, SkillInjector, user_skills DB table, user settings frontend

**Research flag:** STANDARD PATTERNS — skill injection via `appendSystemPrompt` is documented in the Agent SDK. CLAUDE.md format is documented by Anthropic.

---

### Phase 5: MCP Marketplace (Curated)

**Rationale:** The MCP marketplace is Stallion's biggest long-term moat — no cloud-native competitor has one. But it requires both a solid execution environment (Phase 1) and user auth (Phase 3) to work correctly. It also has the highest attack surface of any feature. Start with a hand-curated set of 5-10 verified MCPs (browser automation, GitHub, web search) before opening to third-party publishers.

**Delivers:** MCP registry (curated), per-user MCP install/uninstall, encrypted credential storage per MCP (never raw keys in env), credential proxy pattern for MCP tool calls, network egress allowlist per MCP, MCP health check at install time, version pinning with explicit update approval, MCP marketplace UI.

**Features addressed:** MCP marketplace curated (v1.x)

**Pitfalls mitigated:** MCP supply chain attacks (Pitfall 4) — static analysis, version pinning, egress allowlist, credential proxy all ship in this phase

**Research flag:** NEEDS RESEARCH — MCP security patterns (static analysis tooling, egress enforcement), the credential proxy architecture for MCP tools, and the Anthropic Agent SDK `mcpServers` config format deserve a dedicated research pass before implementation. The attack surface here is novel and high-stakes.

---

### Phase 6: Developer Experience and v1.x Polish

**Rationale:** Once the core loop is validated (users successfully build things and return), add the features that convert single-session users into retained power users.

**Delivers:** BYOK (Anthropic + Azure, encrypted per user), GitHub OAuth + workspace export to GitHub repo, per-session `.claude/` directory capture with option to promote to user skills, Redis + Socket.IO adapter for multi-worker WebSocket fan-out (production scale prerequisite), E2B migration from Docker sandboxes.

**Features addressed:** BYOK (v1.x), GitHub export (v1.x), per-session .claude capture (v1.x)

**Stack:** `ioredis`, Socket.IO Redis adapter, E2B SDK (`e2b` npm package), GitHub OAuth

**Research flag:** STANDARD PATTERNS for BYOK and GitHub OAuth. E2B migration from Docker needs a small implementation research pass to validate the sandbox template configuration for CC CLI.

---

### Phase Ordering Rationale

- **Phases 1 and 2 must precede any public access.** The security and reliability gaps in the current codebase (SDK on host, no cost limits, no subprocess cleanup) are not acceptable for any user beyond the immediate dev team.
- **Phase 3 (auth) unlocks phases 4–6.** Skills, MCP marketplace, BYOK, and GitHub export all require knowing who the user is. This ordering is driven by the feature dependency graph in FEATURES.md.
- **Phase 4 before Phase 5** because `UserConfigBuilder` (built in Phase 4 for skills) is the same infrastructure that loads MCP configs in Phase 5. Build it once.
- **Phase 5 (MCP marketplace) is isolated** — it is the highest-risk feature and benefits from all earlier infrastructure being stable before it ships.
- **Phase 6 is additive** — each item is independent and can ship incrementally as demand signals emerge post-launch.

### Research Flags

Phases likely needing a `/gsd:research-phase` before implementation planning:

- **Phase 5 (MCP Marketplace):** MCP security hardening patterns (static analysis tooling, egress enforcement at process level, credential proxy architecture) are novel and the attack surface is high-stakes. The Anthropic Agent SDK `mcpServers` config format and the specific fields available for per-tool egress control need verification.

Phases with standard patterns (skip additional research):

- **Phase 1 (Sandbox):** dockerode, E2B SDK, SandboxProvider abstraction — well-documented
- **Phase 2 (Session Lifecycle):** Session state machines, SDK JSONL persistence, process-group cleanup — documented in official Anthropic SDK docs and GitHub issues
- **Phase 3 (Auth):** Supabase SSR, Hono JWT middleware, PostgreSQL schema — well-established
- **Phase 4 (Skills):** `appendSystemPrompt` injection, CLAUDE.md format — documented by Anthropic
- **Phase 6 (DX + Scale):** BYOK, GitHub OAuth, Redis Socket.IO adapter — standard patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official Anthropic docs + E2B/Fly.io official sources. Execution environment decision matrix is well-supported across multiple independent sources. |
| Features | HIGH | All major competitors (Devin, Bolt, Replit, Cursor, Copilot) researched against live products. Feature tier structure is well-validated. |
| Architecture | HIGH | Claude Agent SDK official docs are the primary source; SDK session patterns and MCP integration verified against official spec. Sandbox abstraction pattern is consensus across all AI agent platforms researched. |
| Pitfalls | HIGH | Based on real incidents (Replit DB deletion, Devin failures, Claude Code CVEs 2025-2026, Manus cost abuse, SDK GitHub issues with specific issue numbers). Not theoretical — these have already happened on comparable platforms. |

**Overall confidence: HIGH**

### Gaps to Address

- **E2B sandbox template configuration for CC CLI:** The specific E2B template build process (installing `@anthropic-ai/claude-code` + Azure Foundry env vars) needs validation against the E2B CLI during Phase 1. Not a research gap — an implementation detail to verify early.
- **SDK unstable v2 preview:** The `unstable_v2` SDK preview (`createSession()` / `session.send()`) would simplify multi-turn patterns. Monitor but do not depend on it. Reassess at the start of Phase 2.
- **Multi-tenant scale of Fly Sprites:** Fly Sprites are architecturally compelling (CC pre-installed, persistent VMs) but not yet proven at multi-tenant scale. The E2B path is lower-risk for production. Sprites remain a future strategic option if "persistent developer environment" becomes the product moat.
- **MCP egress enforcement implementation details:** The mechanism for enforcing per-MCP network egress allowlists (whether at the container network level, iptables, or MCP process sandbox) needs a dedicated research pass in Phase 5 planning.

## Sources

### Primary (HIGH confidence)
- [Anthropic Agent SDK Hosting Docs](https://platform.claude.com/docs/en/agent-sdk/hosting) — session resource requirements, sandbox providers, cold start constraints
- [Anthropic Agent SDK Sessions Guide](https://platform.claude.com/docs/en/agent-sdk/sessions) — session resume, JSONL persistence, cross-host resume pattern
- [Anthropic Agent SDK MCP Integration](https://platform.claude.com/docs/en/agent-sdk/mcp) — mcpServers config, credential injection patterns
- [E2B Documentation](https://e2b.dev/docs) — TypeScript SDK, sandbox lifecycle, pricing
- [Fly.io Sprites announcement + docs](https://sprites.dev) — Jan 2026 launch, CC pre-installed, persistent VM design
- [Supabase SSR Next.js Docs](https://supabase.com/docs/guides/auth/server-side/nextjs) — cookie-based auth for Next.js + Hono
- [Check Point Research CVE-2025-59536 / CVE-2026-21852](https://research.checkpoint.com/2026/rce-and-api-token-exfiltration-through-claude-code-project-files-cve-2025-59536/) — Claude Code-specific RCE and API key exfiltration CVEs

### Secondary (MEDIUM confidence)
- [E2B Blog: How Manus Uses E2B](https://e2b.dev/blog/how-macks-uses-e2b) — production validation for E2B at AI agent platform scale
- [GitHub Issue #34: Claude Agent SDK 12s overhead](https://github.com/anthropics/claude-agent-sdk-typescript/issues/34) — cold start constraint documentation
- [Claude Code memory leak issues](https://github.com/anthropics/claude-code/issues/11377) — SDK subprocess lifecycle failures at scale
- [Timeline of MCP Security Breaches — AuthZed](https://authzed.com/blog/timeline-mcp-breaches) — real MCP attack incidents
- [Northflank: Best sandboxes for coding agents 2026](https://northflank.com/blog/best-sandboxes-for-coding-agents) — independent comparison of E2B, Daytona, Fly

### Tertiary (reference, cross-validation)
- [AI Code Sandbox Benchmark 2026 (Superagent)](https://www.superagent.sh/blog/ai-code-sandbox-benchmark-2026) — cold start benchmarks
- [Northflank: E2B vs Modal vs Fly.io](https://northflank.com/blog/e2b-vs-modal-vs-fly-io-sprites) — independent comparison
- Competitor analysis: Devin, Bolt, Replit, Cursor, GitHub Copilot Workspace — live product research

---
*Research completed: 2026-03-07*
*Ready for roadmap: yes*
