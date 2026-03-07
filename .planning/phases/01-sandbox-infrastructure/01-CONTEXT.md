# Phase 1: Sandbox Infrastructure - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Every CC session runs in an isolated Docker container. The SDK subprocess, all file I/O, and all tool execution happen inside the container — nothing runs on the host except the backend API server and credential proxy. Containers are created on-demand, destroyed on completion/failure/idle timeout, and workspace files are persisted before destruction.

</domain>

<decisions>
## Implementation Decisions

### SDK Location
- SDK `query()` runs INSIDE the Docker container, not on the host
- Container has Node.js + `@anthropic-ai/claude-code` installed
- A control server inside the container exposes HTTP API + WebSocket for SDK event relay
- Backend connects to the control server to send prompts and receive SDK events

### Container ↔ Backend Communication
- Full control API inside container (same pattern as the old `agent-control`):
  - `POST /start` — begin CC session with prompt + options
  - `POST /message` — send follow-up message (SDK resume)
  - `GET /status` — health check
  - `GET /files` — list workspace files
  - `GET /files/read` — read file content
  - `WS /events` — stream raw SDK events back to backend
- Backend's `MissionManager` connects to the container's WS endpoint and relays `SDKEnvelope` objects to the frontend (existing pattern)

### Container Image
- Headless only for Phase 1 — no Xvfb, VNC, or Chromium
- Node.js 22 + CC CLI + common dev tools (git, curl, jq, python3)
- Desktop environment (browser, VNC) deferred to a later phase
- Image target: ~500MB

### Credential Proxy
- HTTP proxy server on the host (part of backend or separate lightweight process)
- Container's `ANTHROPIC_BASE_URL` points to the proxy
- Proxy injects the real API key (from user's stored BYO key) on each Anthropic API request
- CC inside container never sees the raw API key
- Cost tracking is separate — via SDK `result` messages (`total_cost_usd`), not proxy inspection

### Network Isolation
- Full internet access from inside the container (CC needs npm install, web search, fetch docs)
- Exception: direct calls to `api.anthropic.com` blocked via iptables — forces all API traffic through our credential proxy
- This prevents the CVE-2026-21852 attack vector (malicious ANTHROPIC_BASE_URL override)

### Container Lifecycle
- **Creation:** On-demand when user starts a session (~12-15s for SDK cold start). No pre-warmed pool in Phase 1.
- **Destruction:** On session complete, session failure, or idle timeout (30 min no activity)
- **Cleanup:** Workspace files copied to host (`docker cp`) before container destruction. Container then removed with `force: true`.
- **Zombie prevention:** Backend tracks all running containers. On server restart, detect orphaned containers and destroy them.
- **Resource limits:** 4GB RAM, 2 CPU, 10GB disk per container

### Session Resume
- SDK session JSONL (`~/.claude/projects/<cwd>/<session-id>.jsonl`) periodically copied from container to host storage
- On backend restart: orphaned containers destroyed, but JSONL preserved
- User can resume session — new container started with `resume: sessionId`, JSONL hydrated from storage
- This enables true cross-restart resume

### Claude's Discretion
- Exact Docker networking setup (bridge vs host vs custom network)
- iptables rule specifics for blocking api.anthropic.com
- JSONL flush frequency (every N seconds vs. on each query() completion)
- Control server implementation details (port, auth token between backend and container)

</decisions>

<specifics>
## Specific Ideas

- Reuse the pattern from the old `agent-vm/agent-control` server — it had the right API shape (POST /start, WS /events, etc.)
- The old `agent-vm/Dockerfile` is a good starting point — strip out Xvfb/VNC/Chromium for the headless image
- `buildProcessEnv()` from `mission-env.ts` already handles Azure Foundry env vars — reuse inside the container

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/agent-runtime/src/mission-env.ts`: `buildProcessEnv()` constructs the env vars CC needs — reuse inside the container's executor
- `packages/backend/src/services/mission-manager.ts`: `MissionManager` already has `subscribeSDK()`, `notifySDK()`, debounced save, `walkDir()` — reuse for container-backed sessions
- `packages/backend/src/ws/handler.ts`: WebSocket relay pattern (`sdk_message`, `sdk_messages_batch`, `events_batch`) — reuse as-is

### Established Patterns
- SDK relay: `SDKEnvelope` wrapping raw messages → WebSocket → frontend `useSDKStream` interpretation
- Mission persistence: JSON snapshots to `~/.stallion/missions/<id>.json` with debounced writes
- Workspace browsing: `walkDir()` + REST endpoints for file listing and reading

### Integration Points
- `MissionManager.startMission()` currently creates `MissionEngine` directly — refactor to create Docker container instead
- `MissionEngine` moves inside the container as the executor
- Backend becomes a container orchestrator + WebSocket relay (no more direct SDK calls)

</code_context>

<deferred>
## Deferred Ideas

- Pre-warmed container pool for faster session starts — future phase
- Desktop environment (Xvfb, VNC, Chromium) in containers — future phase
- E2B/Firecracker migration for production-grade isolation — v2
- Container snapshot/pause for session hibernation — v2

</deferred>

---

*Phase: 01-sandbox-infrastructure*
*Context gathered: 2026-03-07*
