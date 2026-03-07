---
phase: 01-sandbox-infrastructure
plan: "03"
subsystem: sandbox-security
tags:
  - credential-proxy
  - cost-monitor
  - network-isolation
  - http-proxy
  - iptables
  - tdd
  - typescript
dependency_graph:
  requires:
    - packages/backend/src/sandbox/container-manager.ts (Plan 02 — sets ANTHROPIC_API_KEY=session-<id> placeholder)
    - packages/backend/src/sandbox/cost-monitor.ts (Plan 02 stub — replaced by this plan)
  provides:
    - packages/backend/src/sandbox/credential-proxy.ts (HTTP reverse proxy injecting per-session API keys)
    - packages/backend/src/sandbox/cost-monitor.ts (full CostMonitor replacing Plan 02 stub)
    - packages/backend/src/sandbox/network-isolation.ts (iptables blocking direct api.anthropic.com access)
  affects:
    - packages/backend/src/services/mission-manager.ts (already wired to CostMonitor in Plan 02 — now uses full impl)
    - packages/agent-control/Dockerfile (NET_ADMIN cap used by applyNetworkIsolation)
tech_stack:
  added:
    - "http-proxy: ^1.18.1 (HTTP reverse proxy library)"
    - "@types/http-proxy: ^1.17.17 (TypeScript types for http-proxy)"
  patterns:
    - "CredentialProxy uses http-proxy proxyReq event to inject real API key before forwarding"
    - "Session placeholder key: ANTHROPIC_API_KEY=session-<id> extracted in proxy auth header"
    - "Azure Foundry mode: api-key header instead of x-api-key (detected via CLAUDE_CODE_USE_FOUNDRY)"
    - "CostMonitor uses SET semantics for processSDKMessage (total_cost_usd is cumulative in SDK)"
    - "Network isolation: resolve IPs at apply-time, add iptables OUTPUT REJECT rules per IP"
    - "TDD pattern: RED (failing tests) -> GREEN (implementation) -> type-check verification"
key_files:
  created:
    - packages/backend/src/sandbox/credential-proxy.ts
    - packages/backend/src/sandbox/network-isolation.ts
    - packages/backend/src/sandbox/__tests__/credential-proxy.test.ts
    - packages/backend/src/sandbox/__tests__/cost-monitor.test.ts
  modified:
    - packages/backend/src/sandbox/cost-monitor.ts (replaced Plan 02 stub with full implementation)
    - packages/backend/src/sandbox/index.ts (added CredentialProxy, applyNetworkIsolation exports)
    - packages/backend/package.json (added http-proxy + @types/http-proxy)
decisions:
  - "http-proxy (v1.18.1) used instead of node-http-proxy — the npm package named node-http-proxy is an unrelated old CLI tool (v0.2.4); the research-recommended library is http-proxy"
  - "CredentialProxy accepts optional constructor params (targetUrl, isAzureFoundry) for testability — production uses env var detection, tests pass mock upstream URL"
  - "CostMonitor checkBudget uses >= budget (not > budget) as exceeded threshold — plan spec says exceeded when cost >= budget; corrects Plan 02 stub which used >"
  - "Network isolation gracefully handles DNS resolution failure — warns and skips, does not throw — allows startup in offline/CI environments"
metrics:
  duration_minutes: 7
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 3
  completed_date: "2026-03-07"
---

# Phase 01 Plan 03: Credential Proxy, CostMonitor, Network Isolation Summary

**One-liner:** HTTP reverse proxy injecting per-session API keys via "session-<id>" placeholder pattern, full CostMonitor with SET semantics for SDK result messages, and iptables-based network isolation blocking direct api.anthropic.com access.

## What Was Built

### Task 1: Credential Proxy (TDD)

**`packages/backend/src/sandbox/credential-proxy.ts`** (`CredentialProxy` class)

HTTP reverse proxy built on `http-proxy`. Core security mechanism: containers never receive raw API keys.

- `start(port)`: Starts server (port 0 = OS-assigned free port)
- `stop()`: Closes proxy and server
- `registerSession(sessionId, apiKey)`: Maps session ID to real API key
- `unregisterSession(sessionId)`: Removes mapping (subsequent requests get 403)
- `getPort()`: Returns actual listening port

**Request flow:**
1. Container SDK sends request with `x-api-key: session-<sessionId>` (standard) or `api-key: session-<sessionId>` (Azure)
2. Proxy validates header starts with `"session-"`
3. Extracts session ID from placeholder, looks up real key in `Map<sessionId, apiKey>`
4. If found: forwards request to target with real key injected via `proxyReq.setHeader()`
5. If not found: returns 403 immediately (before proxy dispatch)

**Azure Foundry mode:** Detected via `CLAUDE_CODE_USE_FOUNDRY === "1"` (or `isAzureFoundry` option for tests). Uses `api-key` header and Azure endpoint. Standard mode uses `x-api-key` and `api.anthropic.com`.

**9 tests** using real HTTP upstream servers (mock echo servers on random ports). No mocking of the proxy itself — full end-to-end behavior tested.

### Task 2: Full CostMonitor, Network Isolation, Barrel Update (TDD)

**`packages/backend/src/sandbox/cost-monitor.ts`** (replaces Plan 02 stub)

Full CostMonitor implementation:
- `recordCost(sessionId, costUsd)`: Additive accumulation (for manual tracking)
- `getCost(sessionId)`: Returns 0 for unknown sessions
- `checkBudget(sessionId, budgetUsd)`: Returns `{ exceeded: boolean, total: number, budget: number }`. Exceeded when `total >= budget`.
- `processSDKMessage(sessionId, msg)`: **SET semantics** — on `type: "result"` messages, sets session cost to `total_cost_usd` (not additive). The SDK's `total_cost_usd` is already cumulative across the session, so SET prevents double-counting if called multiple times.
- `reset(sessionId)`: Deletes session entry

**Budget enforcement is post-hoc:** SDK only emits `total_cost_usd` in `result` messages at `query()` completion. Cannot abort mid-turn based on cost. MissionManager (Plan 02) calls `checkBudget()` after relaying each SDK result event and emits a `session_error` with `data.kind=budget_warning` when exceeded.

**10 tests** covering accumulation, budget threshold (>= not >), SET semantics, double-counting prevention, multi-session independence.

**`packages/backend/src/sandbox/network-isolation.ts`** (`applyNetworkIsolation`)

Applies iptables OUTPUT REJECT rules inside a container:
1. Resolves `api.anthropic.com` and `claude.ai` via `dns.resolve4()`
2. Deduplicates IPs (`new Set`)
3. Runs `iptables -A OUTPUT -d <ip> -j REJECT --reject-with tcp-reset` via `container.exec()`
4. Graceful DNS failure: warns and skips (does not throw) — allows operation in offline/CI environments

**Limitation (Phase 1):** IP blocking by resolved DNS is imperfect for CDN-hosted domains. IPs can change. Acceptable for MVP/dev; for production use a Docker `internal` network.

**`packages/backend/src/sandbox/index.ts`** (updated barrel)

Now exports all sandbox modules:
- Plan 02: `ContainerManager`, `ContainerClient`, `SessionStore`, `startSessionTimers`, `CostMonitor`, `BudgetResult`
- Plan 03: `CredentialProxy`, `CredentialProxyOptions`, `applyNetworkIsolation`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Installed correct `http-proxy` package (not `node-http-proxy`)**
- **Found during:** Task 1 setup (package install)
- **Issue:** Plan spec said `npm install node-http-proxy` but the npm package `node-http-proxy` is an unrelated old CLI tool (v0.2.4). The research-recommended library is `http-proxy` (the one the plan's code sample uses as `import httpProxy from "http-proxy"`).
- **Fix:** Uninstalled `node-http-proxy`, installed `http-proxy@^1.18.1` and `@types/http-proxy@^1.17.17`
- **Files modified:** `packages/backend/package.json`

**2. [Rule 2 - Correctness] CostMonitor constructor options pattern for testability**
- **Found during:** Task 1 test design
- **Issue:** Plan spec's `CredentialProxy` constructor used `process.env` directly for target URL, making tests require env var setup. Tests need to point proxy at a local mock upstream.
- **Fix:** Added `CredentialProxyOptions` interface with optional `targetUrl` and `isAzureFoundry` overrides. Production code still reads from env vars when options are not provided.
- **Files modified:** `packages/backend/src/sandbox/credential-proxy.ts`

## Self-Check

Checking that all files claimed to be created actually exist...

All 4 created files and 3 modified files confirmed.
All 2 task commits found (45eae6f, 3f2f32e).

## Self-Check: PASSED
