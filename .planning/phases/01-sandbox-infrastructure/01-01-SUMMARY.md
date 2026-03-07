---
phase: 01-sandbox-infrastructure
plan: "01"
subsystem: agent-control
tags:
  - docker
  - websocket
  - http-server
  - claude-agent-sdk
  - typescript
dependency_graph:
  requires: []
  provides:
    - packages/agent-control (in-container control server)
    - packages/shared sandbox type definitions
  affects:
    - packages/backend (will talk to agent-control via HTTP+WS instead of calling query() directly)
tech_stack:
  added:
    - "@anthropic-ai/claude-agent-sdk: ^0.2.37 (agent-control dep)"
    - "ws: ^8.18.3 (WebSocket server in container)"
    - "nanoid: ^5.0.9 (envelope ID generation)"
    - "tsx: ^4.19.0 (TypeScript execution in container)"
    - "node:22-slim (Dockerfile base image)"
  patterns:
    - "HTTP server using node:http (no framework — minimal footprint in container)"
    - "WebSocket server attached to HTTP server via noServer:true + upgrade event"
    - "Auth token on both HTTP (x-control-token header) and WS upgrade"
    - "Non-blocking session start (POST /start returns 200 immediately, session runs async)"
    - "AbortController pattern for session cancellation"
key_files:
  created:
    - packages/shared/src/schemas/sandbox.ts
    - packages/agent-control/package.json
    - packages/agent-control/tsconfig.json
    - packages/agent-control/src/index.ts
    - packages/agent-control/src/executor.ts
    - packages/agent-control/src/event-relay.ts
    - packages/agent-control/src/file-api.ts
    - packages/agent-control/Dockerfile
    - packages/agent-control/.dockerignore
  modified:
    - packages/shared/src/index.ts (added sandbox export)
    - package.json (workspaces: agent-vm/agent-control -> agent-control)
decisions:
  - "Inline StartSessionRequest Zod schema in index.ts rather than importing @stallion/shared into the container — keeps image lean, avoids monorepo coupling at runtime"
  - "Use node:http (no framework) in the container control server — minimal dependencies, simpler image"
  - "WebSocket auth via x-control-token on upgrade — same token used for HTTP auth"
  - "POST /start returns 200 immediately and runs session async — prevents HTTP timeout on long-running sessions"
  - "Dockerfile uses tsx for TypeScript execution (no compile step) — faster iteration, smaller build"
metrics:
  duration_minutes: 3
  tasks_completed: 3
  tasks_total: 3
  files_created: 9
  files_modified: 2
  completed_date: "2026-03-07"
---

# Phase 01 Plan 01: Agent-Control Package and Dockerfile Summary

**One-liner:** In-container HTTP+WebSocket control server wrapping Claude Agent SDK with bypassPermissions mode, plus shared sandbox type contracts and a node:22-slim Dockerfile with git/curl/jq/python3/iptables.

## What Was Built

A new `packages/agent-control/` package — the server that runs INSIDE each Docker sandbox container. It replaces the direct `query()` call pattern from `MissionEngine` with a network-isolated server the backend can control via HTTP and WebSocket.

### Agent-Control Package

**`packages/agent-control/src/event-relay.ts`**
WebSocket server (from `ws`) attached to the HTTP server via the `noServer: true` + `upgrade` event pattern. Validates `x-control-token` header on WS upgrade. Exposes `broadcast(data)` to send JSON to all connected clients.

**`packages/agent-control/src/executor.ts`**
Wraps `query()` from `@anthropic-ai/claude-agent-sdk` with:
- `permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true`
- `cwd: WORKSPACE_DIR` (from env, default `/workspace`)
- AbortController wrapping the provided abort signal
- SDKEnvelope shape `{ id, sessionId, timestamp, msg }` for each SDK message
- Captures `session_id` and `total_cost_usd` from `result`-type messages
- Emits a final error envelope before re-throwing on failure

**`packages/agent-control/src/file-api.ts`**
Recursive workspace file listing (skips `.claude`, `node_modules`, `.git`) and file reading with path traversal protection (resolved path must start with workspaceDir).

**`packages/agent-control/src/index.ts`**
HTTP server with routes:
- `POST /start` — parse `StartSessionRequest`, start session non-blocking, return `{ ok, sessionId }` immediately
- `POST /message` — same pattern but for follow-up/resume messages
- `POST /abort` — call `AbortController.abort()`
- `GET /status` — returns `{ status: "ready"|"busy", sessionId?, uptime }`
- `GET /files` — list workspace files
- `GET /files/read?path=` — read workspace file (path traversal protected)
- Auth middleware: all requests require `x-control-token` matching `CONTROL_AUTH_TOKEN`
- Graceful shutdown on SIGTERM/SIGINT (aborts active session, closes server)

### Shared Sandbox Types

**`packages/shared/src/schemas/sandbox.ts`** adds 5 Zod schemas:
- `SandboxConfig` — backend-to-container-manager contract (sessionId, workspaceDir, ports, limits)
- `ContainerInfo` — returned after container creation (containerId, hostPort, authToken)
- `ControlServerStatus` — GET /status response shape
- `StartSessionRequest` — POST /start body
- `StartSessionResponse` — POST /start response

### Dockerfile

`packages/agent-control/Dockerfile` based on `node:22-slim`:
- Installs: git, curl, jq, python3, python3-pip, iptables, ca-certificates
- Installs Claude Code CLI globally (`npm install -g @anthropic-ai/claude-code@latest`)
- Creates `/workspace` directory
- Copies agent-control source and installs deps with tsx
- Headless only — no Xvfb, VNC, or Chromium (locked decision)
- Build: `docker build -t stallion-agent-control:latest packages/agent-control/`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Dirent type mismatch in file-api.ts**
- **Found during:** Task 2 type-check
- **Issue:** `fs.readdir(dir, { withFileTypes: true })` returned `Dirent<NonSharedBuffer>[]` but code typed it as `Dirent<string>[]` — TypeScript strict mode caught this
- **Fix:** Added `encoding: "utf-8"` to readdir options and explicit `Dirent<string>[]` type annotation
- **Files modified:** `packages/agent-control/src/file-api.ts`
- **Commit:** f54d519

## Self-Check

Checking that all files claimed to be created actually exist...

All 10 files exist. All 3 task commits found.

## Self-Check: PASSED
