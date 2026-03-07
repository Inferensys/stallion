---
phase: 01-sandbox-infrastructure
plan: "02"
subsystem: backend-sandbox
tags:
  - docker
  - dockerode
  - container-manager
  - websocket
  - session-timers
  - cost-monitor
  - tdd
  - typescript
dependency_graph:
  requires:
    - packages/agent-control (in-container control server from Plan 01)
    - packages/shared/src/schemas/sandbox.ts (SandboxConfig, ContainerInfo types from Plan 01)
  provides:
    - packages/backend/src/sandbox/ (ContainerManager, ContainerClient, SessionStore, SessionTimers, CostMonitor stub)
    - packages/backend/src/services/mission-manager.ts (refactored to use containers)
  affects:
    - packages/backend/src/routes/missions.ts (unchanged — container swap transparent)
    - packages/backend/src/ws/handler.ts (unchanged — same SDKEnvelope pipeline)
    - packages/frontend (unchanged — zero frontend changes needed)
tech_stack:
  added:
    - "dockerode: ^4.0.9 (Docker container lifecycle via Docker Engine API)"
    - "vitest: ^4.0.18 (unit test framework for backend)"
    - "vitest.config.ts (globals:true, root:src)"
  patterns:
    - "ContainerManager wraps dockerode with session lifecycle (create, destroy, sweep orphans)"
    - "HostPort:0 for Docker-assigned free port — avoids port conflict"
    - "session-specific ANTHROPIC_API_KEY=session-<id> as credential proxy routing key"
    - "ANTHROPIC_BASE_URL=http://host.docker.internal:<proxyPort> routes SDK calls through host proxy"
    - "startSessionTimers: two independent timers, resetActivity() resets only idle"
    - "ContainerClient WS reconnection (3 attempts, 1s delay)"
    - "CostMonitor stub: parses total_cost_usd from SDK result messages"
    - "Cleanup sequence: disconnect WS -> clear timers -> copy workspace -> destroy container -> reset cost"
key_files:
  created:
    - packages/backend/src/sandbox/container-manager.ts
    - packages/backend/src/sandbox/container-client.ts
    - packages/backend/src/sandbox/session-store.ts
    - packages/backend/src/sandbox/session-timers.ts
    - packages/backend/src/sandbox/cost-monitor.ts
    - packages/backend/src/sandbox/index.ts
    - packages/backend/src/sandbox/__tests__/container-manager.test.ts
    - packages/backend/src/sandbox/__tests__/session-timers.test.ts
    - packages/backend/vitest.config.ts
  modified:
    - packages/backend/src/services/mission-manager.ts (full refactor — ContainerManager replaces MissionEngine)
decisions:
  - "CostMonitor implemented as stub in Plan 02 (processSDKMessage + checkBudget + reset interface only) — Plan 03 replaces with full parsing implementation"
  - "cleanup() copies workspace via copyWorkspaceFromContainer before container destruction — workspace tar saved to ~/.stallion/sessions/<id>/"
  - "Budget warning emitted as session_error event with data.kind=budget_warning — reuses existing EventType enum without adding new variants"
  - "proxyPort defaults to CREDENTIAL_PROXY_PORT env var (default 9100) — allows Plan 02 to work before Plan 03 credential proxy exists"
  - "MissionData.engine always null — kept as field for backward compat but set to null always"
  - "Wall-clock timeout default extended to 60 min (idle stays 30 min) — matches research Pattern 7 and real usage patterns"
metrics:
  duration_minutes: 6
  tasks_completed: 2
  tasks_total: 2
  files_created: 9
  files_modified: 2
  completed_date: "2026-03-07"
---

# Phase 01 Plan 02: Backend Sandbox Module Summary

**One-liner:** Backend sandbox module with dockerode ContainerManager, HTTP+WS ContainerClient, JSONL SessionStore, dual-timer SessionTimers, and CostMonitor stub — plus MissionManager refactored to orchestrate containers instead of calling MissionEngine directly.

## What Was Built

### Task 1: Sandbox Module (TDD)

**`packages/backend/src/sandbox/container-manager.ts`** (`ContainerManager` class)

Docker container lifecycle via dockerode. Key behaviors:
- `createSessionContainer(config, proxyPort)`: Creates container with 4GB RAM (`Memory=MemorySwap`), 2 CPU (`NanoCpus=2B`), stallion labels (`stallion.managed=true`, `stallion.session=<id>`), `CapAdd: NET_ADMIN`, `CapDrop: ALL`, `SecurityOpt: no-new-privileges`, `ExtraHosts: host.docker.internal:host-gateway` for Linux compat. Sets `ANTHROPIC_API_KEY=session-<sessionId>` (session-specific placeholder for credential proxy routing) and `ANTHROPIC_BASE_URL=http://host.docker.internal:<proxyPort>`. Uses `HostPort: "0"` for Docker-assigned free port.
- `destroySessionContainer(containerId)`: Removes with `force: true`, swallows errors (container may already be gone).
- `sweepOrphans()`: Lists containers with `stallion.managed=true` label, removes all, returns count.
- `waitForReady(hostPort, authToken)`: Exponential backoff polling GET `/status` up to 15s.
- `copyWorkspaceFromContainer(containerId, containerPath, hostPath)`: Streams archive via `container.getArchive()` to disk.

**`packages/backend/src/sandbox/container-client.ts`** (`ContainerClient` class)

HTTP client using native `fetch()` with `x-control-token` header for all requests. WebSocket client via `ws` package connecting to `ws://localhost:<hostPort>/events`. WS reconnection: up to 3 attempts at 1s intervals before calling `onError`. Returns disconnect function from `connectEvents()`.

**`packages/backend/src/sandbox/session-store.ts`** (`SessionStore` class)

Persists session data to `~/.stallion/sessions/<sessionId>/`. Stores JSONL as `<sessionId>.jsonl` and workspace archive as `workspace.tar`. Uses `fs.mkdir({ recursive: true })` for directory creation.

**`packages/backend/src/sandbox/session-timers.ts`** (`startSessionTimers` function)

Two independent timers following research Pattern 7. `resetActivity()` clears and restarts only the idle timer. `clearAll()` stops both. Default: 30 min idle, 60 min wall-clock.

**`packages/backend/src/sandbox/cost-monitor.ts`** (`CostMonitor` stub)

Minimal stub: parses `total_cost_usd` from SDK `result`-type messages, accumulates per session, emits a single `exceeded` signal per session (deduped via warned Set), resets on `reset()`.

**`packages/backend/vitest.config.ts`**

Vitest with `globals: true`, `root: "src"`.

**23 tests** across `container-manager.test.ts` (11 tests) and `session-timers.test.ts` (12 tests). Dockerode mocked as a class constructor using `vi.mock` factory.

### Task 2: MissionManager Refactor

**`packages/backend/src/services/mission-manager.ts`** (full rewrite)

`startMission()` now:
1. Creates Docker container via `ContainerManager.createSessionContainer()`
2. Waits for control server via `ContainerManager.waitForReady()`
3. Starts session timers via `startSessionTimers()`
4. Connects event WebSocket via `ContainerClient.connectEvents()`
5. Sends prompt via `ContainerClient.startSession()`

Event relay loop (`handleContainerEvent`):
- Resets idle timer on every message
- Routes `session_completed` / `session_error` / `session_started` to lifecycle handlers
- Relays all other messages as `SDKEnvelope` through existing `notifySDK()` pipeline
- Calls `costMonitor.processSDKMessage()` + `checkBudget()` after every SDK envelope
- Emits `session_error` with `data.kind=budget_warning` when budget exceeded

Cleanup sequence on session end: disconnect WS → clear timers → copy workspace → destroy container → reset cost tracker → save snapshot.

MissionData gains: `containerId`, `hostPort`, `authToken`, `sdkSessionId`, `disconnectWs`, `timers` fields. `engine` field kept (always null) for backward compatibility.

`listWorkspaceFiles()` and `readWorkspaceFile()` proxy through `ContainerClient` for running sessions, fall back to local disk for completed sessions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused `tar-stream` import from container-manager.ts**
- **Found during:** Task 2 type-check
- **Issue:** Initial implementation imported `tar-stream` but `copyWorkspaceFromContainer` streams to disk directly via `container.getArchive()` + `pipeline()` — no tar-stream needed
- **Fix:** Removed the `import tar from "tar-stream"` line
- **Files modified:** `packages/backend/src/sandbox/container-manager.ts`
- **Commit:** e80e1ef (fixed before separate commit — part of task 1)

**2. [Rule 1 - Bug] Fixed dockerode mock in container-manager.test.ts**
- **Found during:** Task 1 TDD GREEN phase (first test run)
- **Issue:** Initial mock used `vi.fn().mockImplementation(() => ({...}))` — vitest rejected this because `new Docker(...)` requires a class constructor, not a plain function
- **Fix:** Changed to `class MockDocker { ... }` with instance methods as class members in the `vi.mock` factory
- **Files modified:** `packages/backend/src/sandbox/__tests__/container-manager.test.ts`

## Self-Check

All 10 required files exist. Both task commits found (e80e1ef, 2950b6c).

## Self-Check: PASSED
