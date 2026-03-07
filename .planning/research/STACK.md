# Stack Research

**Domain:** Cloud-based AI coding agent platform (Claude Code wrapper)
**Researched:** 2026-03-07
**Confidence:** HIGH (official Anthropic docs + E2B/Fly.io official sources + multiple cross-verified sources)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@anthropic-ai/claude-agent-sdk` | 0.2.x | Claude Code session orchestration | Official SDK — wraps CC CLI subprocess, handles session resumption, async generator output stream. Already in use. |
| Docker (container runtime) | 27.x | Per-session execution isolation | Industry standard. Every platform (Manus, Devin, Replit) uses container or microVM isolation. Already partially integrated via `dockerode`. |
| E2B | Latest (`e2b` npm) | Managed Firecracker microVM sandboxes | Purpose-built for AI agent execution. Firecracker isolation, 150ms boot, TypeScript SDK, session pause/resume. Official Anthropic hosting guide lists it first. |
| Hono 4.x | 4.12.x | API backend | Already in use, ultrafast, Web Standards-based. Excellent WebSocket support via helper. Keep. |
| Next.js 15 | 15.x | Frontend | Already in use, App Router, SSR. Keep. |
| Supabase | 2.x | Auth + PostgreSQL + file storage | Already integrated. Handles user accounts, JWT verification, session persistence. Keep. |
| Socket.IO | 4.8.x | Real-time event streaming | Already in use. Bi-directional, reconnection-safe, room-based (per session). Keep. |
| Redis | 7.x | Session hot cache + pub/sub fanout | Standard for real-time AI agent platforms. Sub-100ms state access across WebSocket workers. |

### Execution Environment Options (Critical Decision)

This is the highest-stakes technology choice. All major AI coding platforms (Manus, Devin, Replit Agent, ChatGPT Codex) use **container or microVM isolation** for sandboxed agent execution. The options for Stallion, ranked by fit:

#### Option A: E2B (RECOMMENDED for production)

| Attribute | Detail |
|-----------|--------|
| Isolation | Firecracker microVM (dedicated kernel per session) |
| Boot time | ~150ms |
| Session length | 24h max (Pro plan) |
| TypeScript SDK | `npm install e2b` — simple `Sandbox.create()` API |
| Pricing | ~$0.0828/hr per 1 vCPU + 2GB RAM |
| CC compatibility | Run CC CLI inside the VM via `sandbox.commands.run()` |
| Persistence | Pause/resume (snapshot) across sessions |
| Confidence | HIGH — listed in official Anthropic hosting guide, used by Manus |

**Why:** Firecracker gives stronger isolation than Docker containers (dedicated kernel). TypeScript SDK is the simplest of all options. Purpose-built for AI agents. Anthropic explicitly recommends it. Manus (a leading AI agent platform) runs on E2B.

**Limitation:** No GPU. 24h session max. Managed infra (no self-host on Hobby/Pro).

#### Option B: Fly.io Sprites (RECOMMENDED for developer-facing sessions)

| Attribute | Detail |
|-----------|--------|
| Isolation | Firecracker microVM |
| Boot time | 1–12s (NVMe-backed persistent VM) |
| Persistence | Full — filesystem survives indefinitely (idles, doesn't destroy) |
| Pricing | $0.07/CPU-hr + $0.04375/GB-hr memory, zero idle billing |
| CC compatibility | CC pre-installed by default on Sprites |
| Claude Skills | Sprites natively support Claude Code Skills (`.claude/` directory structure) |
| Confidence | HIGH — Fly.io official announcement Jan 2026 |

**Why:** If sessions need to persist beyond 24h, or if state (installed packages, `node_modules`, `.git`) should survive across user return visits, Sprites are architecturally better than E2B. Claude Code is already pre-installed. Automatic idle billing stop.

**Limitation:** Designed for individual developer use cases — multi-tenancy at scale (thousands of concurrent sessions) is less proven than E2B. Not a managed SDK — you use the Sprites CLI/API.

#### Option C: Self-hosted Docker via dockerode (RECOMMENDED for MVP / lowest cost)

| Attribute | Detail |
|-----------|--------|
| Isolation | Docker containers (shared kernel, namespace isolation) |
| Boot time | ~500ms–2s |
| Persistence | Volume mounts per session |
| Pricing | Host infrastructure cost only |
| CC compatibility | Full — run CC CLI inside container |
| Confidence | HIGH — already used in codebase (`dockerode` 4.0.9 already installed) |

**Why:** `dockerode` is already in the codebase. Zero new dependencies or accounts. Full control. Works on any VPS, Fly.io Machines, or Railway. Docker isolation is sufficient for most threat models at launch.

**Limitation:** Docker containers share the host kernel — weaker isolation than Firecracker. Requires managing a Docker host. Kernel exploits can break sandbox boundaries (low probability, real risk at scale).

#### Option D: Fly Machines (general infra)

| Attribute | Detail |
|-----------|--------|
| Isolation | Micro-VMs |
| Boot time | <1s |
| Pricing | ~$0.02/hr (cheapest at scale) |
| CC compatibility | Deploy CC CLI in custom Docker image |
| Confidence | MEDIUM — official Anthropic hosting guide lists it |

**Why:** Cheapest option at scale. Multi-region. Best if backend is already on Fly and you want unified infra. Less purpose-built for AI agents than E2B.

**Not recommended:** Vercel Sandbox (45min max sessions — too short for coding tasks), Cloudflare Sandbox (experimental, container-based not microVM, edge network inappropriate for long-running processes).

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `e2b` | Latest | E2B TypeScript SDK | If choosing E2B execution environment |
| `dockerode` | 4.0.9 | Docker container lifecycle management | Already installed — use for MVP/self-hosted path |
| `ioredis` | 5.x | Redis client for Node.js | Session state caching, pub/sub for multi-worker WebSocket |
| `@supabase/supabase-js` | 2.x | Auth + DB + file storage | Already installed. User accounts, session metadata |
| `@supabase/ssr` | 0.9.x | Supabase SSR integration for Next.js | Already installed. Cookie-based auth in Next.js middleware |
| `jose` | 6.x | JWT verification | Already installed. Verify Supabase JWTs in Hono middleware |
| `zod` | 4.x | Schema validation | Already installed. Required by Agent SDK. |
| `nanoid` | 5.x | Session/event ID generation | Already installed. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `tsx` | TypeScript execution for backend | Already in use. No compile step needed. |
| `vitest` | Test runner | Already configured across all packages |
| Docker CLI / Docker Desktop | Container runtime for local dev | Required for self-hosted execution path |
| E2B CLI | Template management for E2B | `npm install -g @e2b/cli` — build custom sandbox images |

---

## Installation

```bash
# If using E2B execution environment
npm install e2b

# Redis client (session caching)
npm install ioredis

# Dev dependencies
npm install -D @types/ioredis
```

**Already installed (keep):**
```bash
# These are already in the codebase — no action needed
@anthropic-ai/claude-agent-sdk
dockerode
socket.io + socket.io-client
@supabase/supabase-js + @supabase/ssr
jose
zod
nanoid
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Execution env | E2B (production) / Docker (MVP) | Fly Sprites | Sprites not yet proven for multi-tenant platform scale. Claude preinstalled is a nice DX but less controllable. |
| Execution env | E2B | Vercel Sandbox | 45-minute session max kills coding workflows. Vercel-ecosystem lock-in. |
| Execution env | E2B | Cloudflare Sandbox | Experimental status. Container isolation only (not microVM). Edge network wrong for long-running agents. |
| Execution env | E2B | Modal | Modal is Python-first, GPU-focused. No TypeScript-native SDK for sandbox ops. Over-engineered for this use case. |
| Auth | Supabase | Auth.js / Clerk | Supabase already integrated. Provides auth + PostgreSQL in one. |
| Real-time | Socket.IO | WebSocket native / Ably / Pusher | Socket.IO already integrated. Reconnection, rooms, binary support built-in. |
| Session cache | Redis | In-memory (process) | In-memory doesn't survive restarts or scale across multiple backend workers. |
| Session storage | Supabase/PostgreSQL | File system JSON | File system JSON already used in codebase (`~/.stallion/missions/`) — acceptable for MVP but must migrate to DB for multi-user. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Vercel Sandbox | 45-minute hard session limit — coding tasks routinely exceed this | E2B (24h Pro) or Fly Sprites (unlimited) |
| Cloudflare Sandbox | Experimental. Container-based (not microVM) — weaker isolation. Edge network is fundamentally wrong for long-running stateful processes. | E2B or Docker |
| Modal Labs | Python-first SDK. GPU-focused, over-engineered for TypeScript-native team. Requires Python wrapper around Node.js app. | E2B |
| gVisor alone (no higher abstraction) | DIY gVisor requires kernel team expertise. No managed offering. Operational burden too high for early product. | E2B (uses Firecracker) |
| AWS ECS / Kubernetes | Severe operational overhead for session-per-container pattern at early scale. Over-engineered for V1. | Fly Machines or E2B |
| `localStorage` for auth tokens | XSS vulnerable. Supabase SSR requires cookie-based auth for server-side access. | Supabase cookie auth via `@supabase/ssr` |
| Multiple `query()` calls per user message | Each `query()` call cold-starts CC CLI (~12s overhead). Use session resumption to maintain hot process. | Session resumption via `resume` option in `query()` |

---

## Stack Patterns by Variant

**MVP (fastest time to working demo):**
- Use self-hosted Docker via `dockerode` (already installed)
- Each CC session = one Docker container, spawned on session create, destroyed on session end
- File system mounts for session workspace
- Supabase for auth + session metadata storage
- No Redis needed (single process, in-memory per session OK for MVP)
- Because: Zero new infrastructure accounts, works today, already partially wired

**Production (multi-user, persistence, scale):**
- Use E2B for execution sandboxes (stronger isolation, managed infra)
- Redis for session state hot cache + Socket.IO adapter for multi-worker pubsub
- Supabase PostgreSQL for durable session/user storage
- Session resumption pattern: CC `query()` called once per session open, resumed via session ID
- Because: Firecracker microVM isolation is industry standard (Manus, Devin). Managed removes infra burden.

**If developer-experience is the moat (Stallion-as-Sprites):**
- Use Fly Sprites — CC pre-installed, persistent VMs, Skills-aware
- Each user gets their own Sprite that idles (no billing) between sessions
- Because: Persistent environment = CC doesn't rebuild `node_modules` every session. Checkpoint/restore. Closer to "your own dev machine in the cloud" UX.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@anthropic-ai/claude-agent-sdk` 0.2.x | Node.js 18+, Zod 4.x | Zod 4 is required — Zod 3 breaks the SDK |
| `socket.io` 4.8.x | `socket.io-client` 4.8.x | Must match major versions |
| `@supabase/ssr` 0.9.x | `@supabase/supabase-js` 2.x | SSR package requires supabase-js v2 |
| `e2b` (latest) | Node.js 18+ | Requires `E2B_API_KEY` env var |
| Claude Agent SDK | Azure AI Foundry | Set `CLAUDE_CODE_USE_FOUNDRY=true`, `ANTHROPIC_FOUNDRY_RESOURCE`, `ANTHROPIC_FOUNDRY_API_KEY` |

---

## Critical SDK Architecture Constraint

The Claude Agent SDK spawns a `cli.js` subprocess per `query()` call:

- **Cold start**: ~12s per `query()` call when process not warm
- **Session resumption**: Pass `resume: sessionId` to subsequent `query()` calls — this reuses the warm process and avoids re-cold-start
- **Resource per session**: 1GiB RAM, 1 CPU, 5GiB disk (per Anthropic official docs)
- **Token overhead**: Each new subprocess inherits full MCP tool descriptions — can burn 10–20K tokens before doing useful work. Minimize MCP tools to only what's needed per session.
- **Implication for container sizing**: Each active CC session needs ~1GiB RAM minimum. A host running 10 concurrent sessions needs ~12GB RAM.

The V2 SDK preview (`unstable_v2`) simplifies multi-turn patterns with `createSession()` / `session.send()` but is not yet stable. Monitor but don't depend on it in V1.

---

## Execution Environment Decision Matrix

| Criterion | Docker (dockerode) | E2B | Fly Sprites |
|-----------|-------------------|-----|-------------|
| Time to integrate | Hours (already wired) | 1-2 days | 2-3 days |
| Isolation strength | Container (namespace) | Firecracker (kernel) | Firecracker (kernel) |
| Session persistence | Volume mounts | Pause/resume snapshot | Full persistent VM |
| Max session length | Unlimited | 24h (Pro) | Unlimited (idles) |
| Multi-tenant scale | Excellent | Excellent | Unproven at scale |
| Cost per session/hr | Host infra only | ~$0.08/hr | ~$0.07/hr active |
| CC pre-installed | No | No (install in template) | Yes |
| Managed infra | No | Yes | Partially |
| Recommended for | MVP Phase 1 | Production Phase 2+ | If DX is the moat |

**Recommendation:** Start with Docker via `dockerode` for Phase 1 (already installed, zero new accounts, fastest unblock). Plan migration to E2B for Phase 2 production hardening.

---

## Sources

- [Anthropic Agent SDK Hosting Docs](https://platform.claude.com/docs/en/agent-sdk/hosting) — Official hosting patterns, resource requirements, sandbox provider list. HIGH confidence.
- [E2B Documentation](https://e2b.dev/docs) — TypeScript SDK API, sandbox lifecycle, pricing. HIGH confidence.
- [E2B Blog: How Manus Uses E2B](https://e2b.dev/blog/how-manus-uses-e2b-to-provide-agents-with-virtual-computers) — Production validation of E2B for AI agent platforms. HIGH confidence.
- [Fly.io Sprites Launch Blog](https://fly.io/blog/design-and-implementation/) — Architecture details, persistent VM design. HIGH confidence.
- [Fly.io Sprites Announcement](https://sprites.dev/) — Jan 2026 launch, Claude pre-installed, pricing. HIGH confidence.
- [GitHub Issue #34: Claude Agent SDK 12s overhead](https://github.com/anthropics/claude-agent-sdk-typescript/issues/34) — Cold start constraint documented. HIGH confidence.
- [Northflank: E2B vs Modal vs Fly.io](https://northflank.com/blog/e2b-vs-modal-vs-fly-io-sprites) — Independent comparison. MEDIUM confidence.
- [Vercel Sandbox docs](https://vercel.com/sandbox) — Session limits confirmed. HIGH confidence.
- [Cloudflare Sandbox SDK](https://developers.cloudflare.com/sandbox/) — Experimental status confirmed. HIGH confidence.
- [AI Code Sandbox Benchmark 2026 (Superagent)](https://www.superagent.sh/blog/ai-code-sandbox-benchmark-2026) — Cold start benchmarks, market comparison. MEDIUM confidence (third-party benchmark).
- [Supabase SSR Next.js Docs](https://supabase.com/docs/guides/auth/server-side/nextjs) — Auth patterns. HIGH confidence.
- [Claude Agent SDK Session Management](https://platform.claude.com/docs/en/agent-sdk/sessions) — Session resumption API. HIGH confidence.

---

*Stack research for: Cloud-based Claude Code platform (Stallion)*
*Researched: 2026-03-07*
