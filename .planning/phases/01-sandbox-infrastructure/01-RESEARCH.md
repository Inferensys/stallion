# Phase 1: Sandbox Infrastructure — Research

**Researched:** 2026-03-07
**Domain:** Docker container lifecycle management, in-container control server, HTTP credential proxy, network isolation, session JSONL persistence
**Confidence:** HIGH (most findings verified against official docs, official SDK docs, and dockerode GitHub)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**SDK Location**
- SDK `query()` runs INSIDE the Docker container, not on the host
- Container has Node.js + `@anthropic-ai/claude-code` installed
- A control server inside the container exposes HTTP API + WebSocket for SDK event relay
- Backend connects to the control server to send prompts and receive SDK events

**Container ↔ Backend Communication**
- Full control API inside container (same pattern as the old `agent-control`):
  - `POST /start` — begin CC session with prompt + options
  - `POST /message` — send follow-up message (SDK resume)
  - `GET /status` — health check
  - `GET /files` — list workspace files
  - `GET /files/read` — read file content
  - `WS /events` — stream raw SDK events back to backend
- Backend's `MissionManager` connects to the container's WS endpoint and relays `SDKEnvelope` objects to the frontend (existing pattern)

**Container Image**
- Headless only for Phase 1 — no Xvfb, VNC, or Chromium
- Node.js 22 + CC CLI + common dev tools (git, curl, jq, python3)
- Desktop environment (browser, VNC) deferred to a later phase
- Image target: ~500MB

**Credential Proxy**
- HTTP proxy server on the host (part of backend or separate lightweight process)
- Container's `ANTHROPIC_BASE_URL` points to the proxy
- Proxy injects the real API key (from user's stored BYO key) on each Anthropic API request
- CC inside container never sees the raw API key
- Cost tracking is separate — via SDK `result` messages (`total_cost_usd`), not proxy inspection

**Network Isolation**
- Full internet access from inside the container (CC needs npm install, web search, fetch docs)
- Exception: direct calls to `api.anthropic.com` blocked via iptables — forces all API traffic through our credential proxy
- This prevents the CVE-2026-21852 attack vector (malicious ANTHROPIC_BASE_URL override)

**Container Lifecycle**
- Creation: On-demand when user starts a session (~12-15s for SDK cold start). No pre-warmed pool in Phase 1.
- Destruction: On session complete, session failure, or idle timeout (30 min no activity)
- Cleanup: Workspace files copied to host (`docker cp`) before container destruction. Container then removed with `force: true`.
- Zombie prevention: Backend tracks all running containers. On server restart, detect orphaned containers and destroy them.
- Resource limits: 4GB RAM, 2 CPU, 10GB disk per container

**Session Resume**
- SDK session JSONL (`~/.claude/projects/<cwd>/<session-id>.jsonl`) periodically copied from container to host storage
- On backend restart: orphaned containers destroyed, but JSONL preserved
- User can resume session — new container started with `resume: sessionId`, JSONL hydrated from storage
- This enables true cross-restart resume

### Claude's Discretion
- Exact Docker networking setup (bridge vs host vs custom network)
- iptables rule specifics for blocking api.anthropic.com
- JSONL flush frequency (every N seconds vs. on each query() completion)
- Control server implementation details (port, auth token between backend and container)

### Deferred Ideas (OUT OF SCOPE)
- Pre-warmed container pool for faster session starts — future phase
- Desktop environment (Xvfb, VNC, Chromium) in containers — future phase
- E2B/Firecracker migration for production-grade isolation — v2
- Container snapshot/pause for session hibernation — v2
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SAND-01 | Each CC session runs in an isolated Docker container with its own filesystem | dockerode container create/start patterns; HostConfig resource isolation |
| SAND-02 | CC has full tool access inside the container: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Task | Control server inside container runs `query()` with `permissionMode: "bypassPermissions"` + full tool preset |
| SAND-03 | Container has resource limits: 4GB RAM, 2 CPU, 10GB disk | `HostConfig.Memory`, `HostConfig.NanoCpus`, `HostConfig.StorageOpt` in createContainer |
| SAND-04 | Per-session wall-clock timeout (configurable, default 30 minutes) | Backend-side idle timer + `container.stop()` + `container.remove({force:true})` |
| SAND-05 | Per-session API cost budget cap (configurable, default $5) | Inspect `result` message `total_cost_usd` in SDK relay; abort signal to container control server |
| SAND-06 | Credential proxy — CC session never sees raw API keys; proxy injects auth headers | `node-http-proxy` with `proxyReq.setHeader('x-api-key', ...)` + container env `ANTHROPIC_BASE_URL=http://host:PORT` |
| SAND-07 | Container cleanup on session end (no zombie containers) | Backend label tracking + orphan sweep on startup; `container.remove({force:true})` on lifecycle end |
</phase_requirements>

---

## Summary

Phase 1 establishes the sandbox infrastructure: every CC session runs inside a Docker container with an in-container control server that exposes the SDK via HTTP+WebSocket to the backend. The backend becomes a container orchestrator instead of running `query()` directly. Three new subsystems need building: (1) the Docker container lifecycle manager in the backend, (2) the in-container control server that runs `query()` and streams events, and (3) the credential proxy on the host that intercepts Anthropic API calls and injects the user's real API key.

The key architectural insight is that the existing `MissionEngine` moves inside the container — the backend's `MissionManager.startMission()` refactors to create a Docker container instead of instantiating `MissionEngine` directly. The `MissionEngine` code becomes the `agent-control` server's executor. The backend then subscribes to the container's `WS /events` endpoint and relays `SDKEnvelope` objects through the existing Socket.IO path to the frontend — the frontend's interpretation logic (`useSDKStream`, `SDKActivityLog`) requires zero changes.

Session JSONL persistence is the critical resiliency mechanism: the SDK writes conversation state to `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` inside the container. The backend must copy this file to host storage after each `query()` completion, and restore it to the same encoded path in a new container when resuming. The official SDK docs explicitly document this "cross-host resume" pattern and it is the only officially supported way to persist sessions across ephemeral containers.

**Primary recommendation:** Build the control server first (it is the hardest part with the most unknowns), then the container lifecycle manager, then the credential proxy. The proxy is the simplest of the three and can be stubbed initially.

---

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `dockerode` | 4.0.9 | Container lifecycle (create/start/stop/remove/getArchive) | Already in `@stallion/backend/package.json`; full TypeScript types via `@types/dockerode` |
| `@types/dockerode` | 4.0.1 | TypeScript type definitions for dockerode | Already in devDependencies |
| `ws` | 8.18.3 | WebSocket client (backend connects to container's WS endpoint) | Already in `@stallion/backend/package.json` |
| `@anthropic-ai/claude-agent-sdk` | 0.2.63 | SDK `query()` — runs inside the container's control server | Already installed in `@stallion/agent-runtime` |

### New dependencies needed

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node-http-proxy` | ^1.18.1 | Lightweight HTTP reverse proxy for credential injection | The credential proxy that intercepts Anthropic API calls from inside the container |
| `@types/node-http-proxy` | ^1.17.15 | TypeScript types for node-http-proxy | Dev dependency alongside node-http-proxy |

**Note on proxy library choice:** `http-proxy-middleware` is an alternative but adds Express/Connect dependency. For a standalone lightweight process, `node-http-proxy` is more appropriate — it's the underlying library `http-proxy-middleware` wraps. A custom `http.createServer` + `http-proxy` is ~20 lines and avoids any framework.

**Alternative approach (no extra dependency):** The credential proxy can also be implemented using only Node.js built-in `http` + `https` modules (tunnel the request manually, inject headers). This is ~50 lines and has zero dependencies. Recommended if the proxy needs to stay minimal.

### Installation
```bash
# In packages/backend
npm install -w @stallion/backend node-http-proxy
npm install -w @stallion/backend --save-dev @types/node-http-proxy
```

---

## Architecture Patterns

### Recommended Project Structure

The primary changes are to `packages/backend/src/` (new sandbox/ directory) and a new `packages/agent-control/` package that builds the in-container server:

```
packages/
├── agent-control/          # NEW: In-container control server (built into Docker image)
│   ├── src/
│   │   ├── index.ts        # HTTP server entry point (POST /start, GET /status, etc.)
│   │   ├── executor.ts     # Wraps MissionEngine.execute() — the SDK query() runner
│   │   ├── event-relay.ts  # WebSocket server that streams SDKEnvelope to backend
│   │   └── file-api.ts     # GET /files, GET /files/read — workspace browsing
│   ├── Dockerfile          # Node.js 22 + claude-code CLI + dev tools
│   └── package.json        # @anthropic-ai/claude-agent-sdk + ws
│
├── backend/src/
│   ├── sandbox/            # NEW: Container lifecycle management
│   │   ├── container-manager.ts   # createContainer, startContainer, stopContainer, removeContainer
│   │   ├── container-client.ts    # HTTP+WS client that talks to the in-container control server
│   │   ├── credential-proxy.ts    # HTTP proxy that injects API key
│   │   └── session-store.ts       # Host-side JSONL storage (copy from/to container)
│   └── services/
│       └── mission-manager.ts     # Refactor startMission() to use container-manager
```

### Pattern 1: Container Lifecycle Manager

**What:** The backend creates containers on-demand, assigns a random auth token, starts the control server inside, and tracks the container ID in the `MissionData` map. On session end, the manager stops and removes the container.

**When to use:** Called from `MissionManager.startMission()` instead of `new MissionEngine()`.

```typescript
// Source: dockerode official README + @types/dockerode 4.0.1
import Docker from "dockerode";
import { nanoid } from "nanoid";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

async function createSessionContainer(sessionId: string, proxyPort: number): Promise<{ container: Docker.Container; authToken: string; hostPort: number }> {
  const authToken = nanoid(32);
  const hostPort = await findFreePort(); // 10000-20000 range

  const container = await docker.createContainer({
    Image: "stallion-agent-control:latest",
    name: `stallion-session-${sessionId}`,
    Labels: {
      "stallion.session": sessionId,
      "stallion.managed": "true",
    },
    Env: [
      `CONTROL_AUTH_TOKEN=${authToken}`,
      `WORKSPACE_DIR=/workspace/${sessionId}`,
      // Credential proxy — CC never sees the real API key
      `ANTHROPIC_BASE_URL=http://host.docker.internal:${proxyPort}`,
      // Block the real API key — force proxy use
      `ANTHROPIC_API_KEY=proxy-key-placeholder`,
      // Azure Foundry NOT passed — proxy handles credentials
    ],
    HostConfig: {
      Memory: 4 * 1024 * 1024 * 1024,    // 4GB
      MemorySwap: 4 * 1024 * 1024 * 1024, // no swap
      NanoCpus: 2_000_000_000,             // 2 CPUs
      StorageOpt: { size: "10G" },         // 10GB disk (overlay2/btrfs only)
      PortBindings: {
        "3001/tcp": [{ HostPort: String(hostPort) }],
      },
      NetworkMode: "bridge", // standard bridge — host.docker.internal works
      CapDrop: ["ALL"],       // drop all capabilities
      SecurityOpt: ["no-new-privileges:true"],
    },
    ExposedPorts: { "3001/tcp": {} },
  });

  await container.start();
  return { container, authToken, hostPort };
}

async function destroySessionContainer(container: Docker.Container): Promise<void> {
  await container.remove({ force: true }).catch(() => {}); // force removes even if running
}
```

### Pattern 2: Orphan Container Detection on Startup

**What:** On backend startup, list all containers with the `stallion.managed=true` label. Any container found that is still running (not tracked by the current backend instance) is an orphan — stop and remove it.

**When to use:** In `MissionManager.create()` before loading missions from disk.

```typescript
// Source: dockerode listContainers with label filter
async function sweepOrphanContainers(): Promise<void> {
  const containers = await docker.listContainers({
    all: true,
    filters: JSON.stringify({ label: ["stallion.managed=true"] }),
  });

  const removals = containers.map(async (info) => {
    const container = docker.getContainer(info.Id);
    await container.remove({ force: true }).catch((err) => {
      console.warn(`Failed to remove orphan ${info.Id}:`, err.message);
    });
  });

  await Promise.all(removals);
  console.log(`Swept ${containers.length} orphan containers`);
}
```

### Pattern 3: In-Container Control Server

**What:** A minimal Node.js HTTP+WS server that runs inside the container. It receives `POST /start` with `{ prompt, options }`, calls `query()`, and streams each `SDKEnvelope` over the WebSocket to the connected backend client.

**When to use:** This is the `agent-control` package's `index.ts` — started as the container's CMD.

```typescript
// Source: Official Claude Agent SDK TypeScript docs (platform.claude.com/docs/en/agent-sdk/typescript)
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { nanoid } from "nanoid";

const AUTH_TOKEN = process.env.CONTROL_AUTH_TOKEN!;
const WORKSPACE = process.env.WORKSPACE_DIR ?? "/workspace";
let activeAbortController: AbortController | null = null;

// HTTP server for control API
const server = createServer(async (req, res) => {
  // Validate auth token
  if (req.headers["x-control-token"] !== AUTH_TOKEN) {
    res.writeHead(401); res.end("Unauthorized"); return;
  }

  if (req.method === "POST" && req.url === "/start") {
    const body = await readBody(req);
    const { prompt, sessionId, resumeSessionId } = JSON.parse(body);

    activeAbortController = new AbortController();

    // Non-blocking: session runs async, events stream via WS
    runSession(prompt, sessionId, resumeSessionId, activeAbortController).catch(console.error);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && req.url === "/abort") {
    activeAbortController?.abort();
    res.writeHead(200); res.end("{}"); return;
  }

  if (req.method === "GET" && req.url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ready" }));
    return;
  }

  res.writeHead(404); res.end();
});

// WebSocket server for event streaming
const wss = new WebSocketServer({ server });

async function runSession(
  prompt: string,
  sessionId: string,
  resumeSessionId: string | undefined,
  abort: AbortController
): Promise<void> {
  const options: Options = {
    systemPrompt: { type: "preset", preset: "claude_code" },
    tools: { type: "preset", preset: "claude_code" },
    cwd: WORKSPACE,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    abortController: abort,
    ...(resumeSessionId ? { resume: resumeSessionId } : {}),
  };

  for await (const msg of query({ prompt, options })) {
    const envelope = { id: nanoid(), sessionId, timestamp: Date.now(), msg };
    // Broadcast to all connected WS clients
    for (const client of wss.clients) {
      if (client.readyState === 1) { // OPEN
        client.send(JSON.stringify(envelope));
      }
    }
  }

  // Signal completion
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type: "session_completed", sessionId }));
    }
  }
}

server.listen(3001, () => console.log("Control server ready on :3001"));
```

### Pattern 4: Backend Container Client (WS Relay)

**What:** The backend connects to the container's `WS /events` endpoint after container start. Each `SDKEnvelope` received from the container is passed to the existing `onSDKMessage` callback, which fans out to frontend Socket.IO clients — no frontend changes needed.

**When to use:** In the refactored `MissionManager.startMission()` after container creation.

```typescript
// Source: ws npm package documentation
import WebSocket from "ws";

function connectToContainer(
  hostPort: number,
  authToken: string,
  sessionId: string,
  onSDKMessage: (envelope: SDKEnvelope) => void,
  onLifecycle: (event: SessionEvent) => void,
): () => void {
  const ws = new WebSocket(`ws://localhost:${hostPort}/events`, {
    headers: { "x-control-token": authToken },
  });

  ws.on("message", (raw) => {
    const data = JSON.parse(raw.toString());
    if (data.type === "session_completed") {
      onLifecycle({ id: nanoid(), sessionId, type: "session_completed", summary: "Session completed", timestamp: Date.now() });
    } else {
      onSDKMessage(data as SDKEnvelope);
    }
  });

  ws.on("error", (err) => {
    console.error(`Container WS error for ${sessionId}:`, err.message);
    onLifecycle({ id: nanoid(), sessionId, type: "session_error", summary: err.message, timestamp: Date.now() });
  });

  // Return disconnect function
  return () => ws.close();
}
```

### Pattern 5: Credential Proxy

**What:** A minimal HTTP reverse proxy on the host that intercepts requests from containers to `ANTHROPIC_BASE_URL`, removes the placeholder key, and injects the real API key (fetched from the session's stored credentials). The container sets `ANTHROPIC_BASE_URL=http://host.docker.internal:<PROXY_PORT>`.

**When to use:** Started once when the backend starts. Maintains a session → real API key map.

```typescript
// Source: node-http-proxy proxyReq event; Anthropic API authentication docs
import http from "node:http";
import httpProxy from "http-proxy";

const proxy = httpProxy.createProxyServer({
  target: "https://api.anthropic.com",
  changeOrigin: true,
  secure: true,
});

// Per-session API key registry: sessionId → realApiKey
const sessionKeys = new Map<string, string>();

proxy.on("proxyReq", (proxyReq, req) => {
  // Extract session ID from custom header (injected by agent-control server)
  const sessionId = req.headers["x-stallion-session"] as string;
  const realKey = sessionId ? sessionKeys.get(sessionId) : undefined;

  if (!realKey) {
    // No key found — reject
    proxyReq.destroy(new Error("No API key for session"));
    return;
  }

  // Inject the real Anthropic API key — container never sent one
  proxyReq.setHeader("x-api-key", realKey);
  proxyReq.removeHeader("anthropic-base-url"); // Clean up
});

const proxyServer = http.createServer((req, res) => {
  proxy.web(req, res, {});
});

proxy.on("error", (err, _req, res) => {
  (res as http.ServerResponse).writeHead(502);
  (res as http.ServerResponse).end(JSON.stringify({ error: err.message }));
});

export function startCredentialProxy(port: number): { server: http.Server; registerSession: (id: string, key: string) => void; unregisterSession: (id: string) => void } {
  proxyServer.listen(port, () => console.log(`Credential proxy on :${port}`));
  return {
    server: proxyServer,
    registerSession: (id, key) => sessionKeys.set(id, key),
    unregisterSession: (id) => sessionKeys.delete(id),
  };
}
```

**CRITICAL — Azure Foundry compatibility:** The above uses `x-api-key` (standard Anthropic). For Azure Foundry (`CLAUDE_CODE_USE_FOUNDRY=true`), the SDK uses Azure-specific headers (`api-key` + Azure endpoint). The proxy must detect which mode is in use and inject the correct headers. Investigate Azure AI Foundry header format before implementing.

### Pattern 6: JSONL Copy (Cross-Container Session Resume)

**What:** After each `query()` completes inside the container, the control server notifies the backend. The backend then uses `dockerode.container.getArchive()` to copy the JSONL file from the container to host storage. On resume, the backend uses `container.putArchive()` to restore it.

**JSONL path format (official SDK docs):**
```
~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
```
Where `<encoded-cwd>` = absolute path with every non-alphanumeric character replaced by `-`.
Example: `/workspace/session-abc123` → `-workspace-session-abc123`

```typescript
// Source: Claude Agent SDK sessions docs (platform.claude.com/docs/en/agent-sdk/sessions)
//         dockerode getArchive API
import path from "node:path";
import fs from "node:fs/promises";

function encodePathForClaude(absolutePath: string): string {
  // SDK encodes cwd: every non-alphanumeric char → "-"
  return absolutePath.replace(/[^a-zA-Z0-9]/g, "-");
}

async function copyJsonlFromContainer(
  container: Docker.Container,
  workspaceDir: string,   // e.g. /workspace/session-abc
  sessionId: string,      // SDK session ID from result message
  hostStorageDir: string, // e.g. ~/.stallion/sessions/<missionId>/
): Promise<void> {
  const encodedCwd = encodePathForClaude(workspaceDir);
  const containerPath = `/root/.claude/projects/${encodedCwd}/${sessionId}.jsonl`;

  // getArchive returns a tar stream
  const tarStream = await container.getArchive({ path: containerPath });
  const localTarPath = path.join(hostStorageDir, `${sessionId}.tar`);

  await pipeStreamToFile(tarStream, localTarPath);
  // Extract the JSONL from the tar (single file archive)
  // Store at: hostStorageDir/<sessionId>.jsonl
}

async function restoreJsonlToContainer(
  container: Docker.Container,
  workspaceDir: string,
  sessionId: string,
  hostStorageDir: string,
): Promise<void> {
  const encodedCwd = encodePathForClaude(workspaceDir);
  const containerDir = `/root/.claude/projects/${encodedCwd}`;

  // putArchive expects a tar stream; containerDir must exist first
  await container.exec({
    Cmd: ["mkdir", "-p", containerDir],
    AttachStdout: false,
    AttachStderr: false,
  });

  const tarBuffer = await buildTarFromJsonl(sessionId, hostStorageDir);
  await container.putArchive(tarBuffer, { path: containerDir });
}
```

**Alternative — simpler approach:** Use `container.exec()` to run `cat` on the JSONL file and capture stdout, then write to host disk. Same for restore with a `cp` or `tee` command. Avoids tar complexity but requires parsing JSONL line boundaries carefully.

### Pattern 7: Idle Timeout + Wall-Clock Timeout

**What:** The backend starts two timers when a session container is created: a wall-clock timeout (30 min default) and an activity timer that resets on each SDK message received. If either fires, the session is force-terminated.

```typescript
// No external library needed — Node.js setTimeout
function startSessionTimers(
  missionId: string,
  container: Docker.Container,
  onTimeout: (missionId: string, reason: "idle" | "wall_clock" | "budget") => void,
  idleTimeoutMs = 30 * 60 * 1000,
  wallClockMs = 60 * 60 * 1000, // 1 hour hard max
): { resetActivity: () => void; clearAll: () => void } {
  let idleTimer = setTimeout(() => onTimeout(missionId, "idle"), idleTimeoutMs);
  const wallTimer = setTimeout(() => onTimeout(missionId, "wall_clock"), wallClockMs);

  return {
    resetActivity: () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => onTimeout(missionId, "idle"), idleTimeoutMs);
    },
    clearAll: () => {
      clearTimeout(idleTimer);
      clearTimeout(wallTimer);
    },
  };
}
```

### Pattern 8: Network Isolation — Blocking api.anthropic.com

**What:** Block direct calls to `api.anthropic.com` from inside the container using iptables rules applied after container start. The container can still reach all other internet hosts and the proxy (via `host.docker.internal`).

**Recommended approach:** Run an `iptables` exec inside the container after it starts. This requires `NET_ADMIN` capability to be granted to the container (minimal capability — much safer than `--privileged`).

```typescript
// Apply iptables block AFTER container is running
async function applyNetworkIsolation(container: Docker.Container): Promise<void> {
  // Resolve api.anthropic.com to IPs first (do this on the host, not in container)
  const anthropicIps = await resolveHostIps("api.anthropic.com");
  // Also block common alternative endpoints
  const allTargetIps = [...anthropicIps, ...await resolveHostIps("claude.ai")];

  for (const ip of allTargetIps) {
    await runExec(container, [
      "iptables", "-A", "OUTPUT",
      "-d", ip,
      "-j", "REJECT",
      "--reject-with", "tcp-reset",
    ]);
  }
}

// Helper: run a command inside a container and wait for completion
async function runExec(container: Docker.Container, cmd: string[]): Promise<void> {
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({ hijack: false, stdin: false });
  await new Promise<void>((resolve) => stream.on("end", resolve));
}
```

**HostConfig requirement for iptables inside container:**
```typescript
HostConfig: {
  // ...
  CapAdd: ["NET_ADMIN"],  // Required for iptables inside container
  CapDrop: ["ALL"],       // Still drop everything else
  SecurityOpt: ["no-new-privileges:true"],
}
```

**Caveat (LOW confidence):** `api.anthropic.com` can resolve to multiple IPs via CDN. The block must cover all of them. IP addresses can also change. A more robust approach is to use a custom DNS resolver inside the container that returns NXDOMAIN for `api.anthropic.com`. However, for Phase 1 (MVP), iptables by IP is acceptable with a note that production hardening should use a custom DNS approach.

**Alternative (recommended by security article):** Use a Docker network with `internal: true` + a custom bridge that provides no default route except to the credential proxy. This is architecturally cleaner and more robust than iptables.

### Anti-Patterns to Avoid

- **Running `query()` on the host API server** — the single most critical anti-pattern. CC has Bash tool access; one session can compromise the entire backend.
- **Calling `container.remove()` without `force: true`** — a running container cannot be removed without force; cleanup will fail silently.
- **Storing the real API key in the container's `ANTHROPIC_API_KEY` env var** — even if the proxy is in place, the key in env is accessible via workspace prompt injection (CVE-2026-21852 class attack).
- **Not tracking containers with labels** — without labels, orphan detection on restart requires listing ALL containers (expensive and risky).
- **Waiting for container readiness synchronously** — `container.start()` returns before the control server is ready to accept connections. Poll `GET /status` with backoff (up to 15 seconds) before sending `POST /start`.
- **Not copying JSONL before container destroy** — if destroy runs before copy, session history is permanently lost.
- **Using `MemorySwap: -1` (unlimited)** — a memory-leaking session will swap indefinitely, degrading the host. Set equal to `Memory` to disable swap.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Container lifecycle | Custom Docker API calls | `dockerode` | Already installed; full TypeScript types; handles stream multiplexing, modem protocol |
| HTTP proxy | Raw `http.request()` forwarding | `node-http-proxy` or built-in `http.request` with `proxyReq` pattern | HTTPS forwarding, keep-alive, streaming response bodies are non-trivial to get right |
| TAR stream for file copy | Custom archiver | `tar` npm package or `container.getArchive()` | Docker's `getArchive` returns a valid tar — just extract it |
| Port allocation | Custom port registry | `portfinder` npm package | Race conditions in naive port-picking are hard to prevent |
| Session ID encoding | Custom implementation | Follow the SDK's exact spec: `/[^a-zA-Z0-9]/g → "-"` | Mismatched encoding = wrong JSONL path = session resume fails silently |

---

## Common Pitfalls

### Pitfall 1: Control Server Not Ready When `POST /start` Is Called
**What goes wrong:** `container.start()` returns immediately, but the Node.js control server inside takes 2-5 seconds to initialize. Sending `POST /start` too soon results in `ECONNREFUSED`.
**Why it happens:** Docker `start()` only waits for the container process to begin, not for the application inside to be accepting connections.
**How to avoid:** Poll `GET /status` with exponential backoff (100ms, 200ms, 400ms...) up to 15 seconds. Only send `POST /start` after a 200 response.
**Warning signs:** `ECONNREFUSED` errors on the first request to `localhost:<hostPort>/start`.

### Pitfall 2: JSONL Path Mismatch on Resume
**What goes wrong:** Session resume fails silently — SDK starts a fresh session instead of resuming. No error is thrown; the agent just forgets everything.
**Why it happens:** The JSONL path includes the `cwd` encoded with the SDK's specific algorithm. If `cwd` is `/workspace/session-abc` on the first run but restored to a container with `cwd=/workspace` (missing the session subdirectory), the encoded paths differ.
**How to avoid:** Use the EXACT same `cwd` in the `query()` options on resume as was used in the original session. Store `cwd` alongside the session ID in host storage. The path encoding is: every non-alphanumeric character → `-`.
**Warning signs:** User sends a follow-up message, agent starts fresh with "I'll help you with that!" instead of referencing prior work.

### Pitfall 3: `host.docker.internal` Not Available on Linux
**What goes wrong:** The container cannot reach the credential proxy at `http://host.docker.internal:<port>` on Linux Docker (works on Docker Desktop for Mac/Windows but not Docker on Linux).
**Why it happens:** `host.docker.internal` is a Docker Desktop feature, not a standard Linux Docker feature.
**How to avoid:** Use the bridge network gateway IP (`172.17.0.1` by default for `docker0`). Detect at startup: `docker network inspect bridge --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}'`. Alternatively, use `--add-host=host.docker.internal:host-gateway` in HostConfig to enable it on Linux.
**Warning signs:** `ECONNREFUSED` when container tries to reach the credential proxy; works on dev Mac, fails on Linux CI/server.

### Pitfall 4: iptables Rules Requiring Resolved IPs That Change
**What goes wrong:** Rules block specific IPs, but Anthropic uses a CDN (CloudFront). IPs change. After a CDN update, the block is ineffective — containers can bypass the proxy.
**Why it happens:** iptables operates at IP level, not DNS. The IP you blocked at startup may no longer be the IP `api.anthropic.com` resolves to.
**How to avoid:** For Phase 1 (dev/MVP), this is acceptable with a note. For production: use a DNS-based block (custom resolver returns NXDOMAIN for `api.anthropic.com`) or a Docker `internal` network that forces all traffic through the proxy at the network level.
**Warning signs:** Logs show direct calls to `api.anthropic.com` bypassing the proxy in long-running sessions.

### Pitfall 5: `getArchive` Returns Empty / Path Not Found
**What goes wrong:** Copying the JSONL file returns an empty tar or errors with "No such file or directory".
**Why it happens:** (a) The `query()` call never completed so the SDK never wrote the JSONL, or (b) the encoded CWD path is wrong, or (c) the user's home directory inside the container is different (`/root` vs `/home/node`).
**How to avoid:** Verify CC runs as the correct user inside the container (the same user whose home directory `.claude/` is in). Default Node.js 22 image runs as root; `~/.claude` resolves to `/root/.claude`. If the Dockerfile switches to a non-root user, adjust the JSONL path accordingly.
**Warning signs:** `getArchive` throws `404` or `500`; `exec(['ls', '-la', '/root/.claude/projects'])` inside the container returns empty.

### Pitfall 6: Container Port Conflicts
**What goes wrong:** Two concurrent sessions try to bind to the same host port.
**Why it happens:** Naive port allocation increments from a fixed start without checking if the port is already in use.
**How to avoid:** Use `0` as the host port in `PortBindings` and let Docker assign a random free port, then inspect the container with `container.inspect()` to read the assigned port: `container.NetworkSettings.Ports["3001/tcp"][0].HostPort`.
**Warning signs:** `Bind for 0.0.0.0:10001 failed: port is already allocated` errors on container start.

### Pitfall 7: Session Cost Cap Requires Checking `result` Message Inside Container
**What goes wrong:** SAND-05 (cost cap) requires monitoring `total_cost_usd` from the SDK's `result` message. The `result` message is only emitted when `query()` completes — it cannot be used to abort mid-session.
**Why it happens:** The SDK does not emit incremental cost updates during a session, only at completion.
**How to avoid:** Use `maxTurns` as a proxy for cost limiting (more turns = more cost). Set `maxTurns` based on the budget: `maxTurns = Math.floor(budget_usd / avg_cost_per_turn)`. After completion, check actual `total_cost_usd` and record it. Alert user if approaching budget on next session start. For a hard real-time cap, use `abortController.abort()` when a timer fires.
**Warning signs:** Sessions complete way over the configured $5 budget before any enforcement fires.

---

## Code Examples

Verified patterns from official sources:

### Reading Session ID from SDK Result Message
```typescript
// Source: Claude Agent SDK sessions docs (official)
// https://platform.claude.com/docs/en/agent-sdk/sessions
let sdkSessionId: string | undefined;

for await (const msg of query({ prompt, options })) {
  if (msg.type === "result") {
    sdkSessionId = msg.session_id; // Always present on result messages
  }
  // ... relay to WebSocket
}
// Store sdkSessionId for cross-container resume
```

### Resume with Specific Session ID
```typescript
// Source: Claude Agent SDK sessions docs (official)
// Resume: pass session ID + same cwd as original session
const options: Options = {
  cwd: originalWorkspaceDir,  // MUST match original exactly
  resume: sdkSessionId,       // SDK session ID captured from prior run
  systemPrompt: { type: "preset", preset: "claude_code" },
  tools: { type: "preset", preset: "claude_code" },
  permissionMode: "bypassPermissions",
  allowDangerouslySkipPermissions: true,
};

for await (const msg of query({ prompt: followUpMessage, options })) {
  // relay messages
}
```

### dockerode Container Create with Resource Limits
```typescript
// Source: dockerode README + Docker resource_constraints docs
// https://docs.docker.com/engine/containers/resource_constraints/
const container = await docker.createContainer({
  Image: "stallion-agent-control:latest",
  Labels: { "stallion.managed": "true", "stallion.session": sessionId },
  HostConfig: {
    Memory: 4 * 1024 * 1024 * 1024,     // 4 GB hard limit
    MemorySwap: 4 * 1024 * 1024 * 1024,  // = Memory (disable swap)
    NanoCpus: 2_000_000_000,              // 2.0 CPUs
    PortBindings: { "3001/tcp": [{ HostPort: "0" }] }, // Docker assigns free port
    CapAdd: ["NET_ADMIN"],                // For iptables inside container
    CapDrop: ["ALL"],
    SecurityOpt: ["no-new-privileges:true"],
    ExtraHosts: ["host.docker.internal:host-gateway"], // Linux Docker compat
  },
  ExposedPorts: { "3001/tcp": {} },
});

await container.start();

// Read the actually-assigned port
const info = await container.inspect();
const assignedPort = info.NetworkSettings.Ports["3001/tcp"]?.[0]?.HostPort;
```

### Force Remove Container
```typescript
// Source: dockerode README
// Works even if container is still running
await container.remove({ force: true });
// or equivalently:
await container.stop({ t: 5 }).catch(() => {}).finally(() => container.remove());
```

### Inject API Key via http-proxy
```typescript
// Source: node-http-proxy README + Anthropic API auth docs
import httpProxy from "http-proxy";

const proxy = httpProxy.createProxyServer({
  target: "https://api.anthropic.com",
  changeOrigin: true,
  secure: true,
});

proxy.on("proxyReq", (proxyReq, req) => {
  const sessionId = req.headers["x-stallion-session"] as string;
  const apiKey = getKeyForSession(sessionId); // from in-memory map
  if (apiKey) {
    proxyReq.setHeader("x-api-key", apiKey);
    // Remove the placeholder so it doesn't appear in logs
    proxyReq.removeHeader("anthropic-api-key");
  }
});
```

### List Sessions on Disk (SDK built-in)
```typescript
// Source: Claude Agent SDK TypeScript reference
// https://platform.claude.com/docs/en/agent-sdk/typescript#list-sessions
import { listSessions } from "@anthropic-ai/claude-agent-sdk";

// List all sessions for the workspace directory
const sessions = await listSessions({ cwd: workspaceDir });
// Returns: Array<{ id: string, path: string, updatedAt: Date, ... }>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `query()` on host process | `query()` inside isolated container | Phase 1 (now) | Eliminates host-level CC tool execution risk |
| API key in env var | Credential proxy injection | Phase 1 (now) | Eliminates CVE-2026-21852 attack surface |
| MissionEngine as direct dependency | Control server HTTP API | Phase 1 (now) | Backend becomes an orchestrator; MissionEngine moves into container |
| SDK V1 `query()` async generator | SDK V1 stable (V2 preview exists but unstable) | V2 preview added ~Sept 2025 | V2 (`createSession`/`send`) is cleaner for multi-turn but not stable; do NOT use in Phase 1 |
| In-memory mission state only | JSONL copied to host storage | Phase 1 (now) | Enables cross-restart session resume |

**Deprecated/outdated:**
- `continue: true` option: Fine for single-process multi-turn; not useful for cross-container resume (need explicit `resume: sessionId`).
- Running `@anthropic-ai/claude-agent-sdk` on the host backend directly: The CONCERNS.md already flags this as the highest-severity security issue. Phase 1 resolves it.

---

## Open Questions

1. **Azure Foundry header format for the credential proxy**
   - What we know: The credential proxy injects `x-api-key` for standard Anthropic. Azure Foundry uses different env vars (`ANTHROPIC_FOUNDRY_RESOURCE`, `ANTHROPIC_FOUNDRY_API_KEY`) and different headers.
   - What's unclear: Exactly which headers the CC SDK sends to Azure AI Foundry (likely `api-key` header + Azure-specific base URL). The proxy must handle both modes.
   - Recommendation: Inspect traffic from an existing Azure Foundry `query()` call to document the exact headers before implementing the proxy.

2. **`NET_ADMIN` capability required for iptables — security tradeoff**
   - What we know: Running `iptables` inside a container requires `CAP_NET_ADMIN`. This is a privileged capability.
   - What's unclear: Whether `NET_ADMIN` alone is sufficient, or whether it creates unacceptable blast radius expansion if the container is compromised.
   - Recommendation: Accept `NET_ADMIN` for Phase 1 (still safer than `--privileged`). Document the tradeoff. Investigate Docker `internal` network approach for Phase 2 as a replacement.

3. **Control server auth token — rotation on reconnect**
   - What we know: The backend generates a random auth token when creating the container and injects it as `CONTROL_AUTH_TOKEN`. The backend uses it for all HTTP+WS calls.
   - What's unclear: If the backend crashes and restarts mid-session, the token was in-memory only. The orphan container keeps running but the new backend instance doesn't know the token.
   - Recommendation: Store the auth token in the mission snapshot alongside the container ID and hostPort. On startup, load tokens from snapshots when checking for orphans. If the orphan's session is "running", attempt reconnect with the stored token before deciding to destroy.

4. **`host.docker.internal` on Linux production**
   - What we know: Works on Docker Desktop (Mac/Windows). On Linux, requires `--add-host=host.docker.internal:host-gateway` in `HostConfig.ExtraHosts`.
   - What's unclear: Whether the production deployment target (bare Linux, Fly.io, Railway, etc.) has Docker Engine or Docker Desktop. This determines whether the extra host is needed.
   - Recommendation: Always include `ExtraHosts: ["host.docker.internal:host-gateway"]` unconditionally — it's a no-op on Docker Desktop and enables Linux support at no cost.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | none — see Wave 0 |
| Quick run command | `npm -w @stallion/backend run test` |
| Full suite command | `npm -ws run test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SAND-01 | Container created with isolated filesystem | integration | `npm -w @stallion/backend run test -- --grep "container lifecycle"` | ❌ Wave 0 |
| SAND-02 | CC tools available inside container | smoke (manual) | Manual: start session, verify Bash tool works | manual-only (requires running Docker) |
| SAND-03 | Resource limits enforced | integration | `npm -w @stallion/backend run test -- --grep "resource limits"` | ❌ Wave 0 |
| SAND-04 | Wall-clock timeout terminates session | unit | `npm -w @stallion/backend run test -- --grep "idle timeout"` | ❌ Wave 0 |
| SAND-05 | Cost budget cap — abort when exceeded | unit | `npm -w @stallion/backend run test -- --grep "cost cap"` | ❌ Wave 0 |
| SAND-06 | Proxy injects key, container sees only placeholder | unit | `npm -w @stallion/backend run test -- --grep "credential proxy"` | ❌ Wave 0 |
| SAND-07 | No zombie containers after session end | integration | `npm -w @stallion/backend run test -- --grep "orphan cleanup"` | ❌ Wave 0 |

**Note:** SAND-02 is manual-only because it requires a running Docker daemon and a fully built container image. All other requirements can be tested with mocked Docker / mocked control server.

### Sampling Rate
- Per task commit: `npm -w @stallion/backend run test`
- Per wave merge: `npm -ws run test`
- Phase gate: Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/backend/src/sandbox/__tests__/container-manager.test.ts` — covers SAND-01, SAND-03, SAND-07
- [ ] `packages/backend/src/sandbox/__tests__/credential-proxy.test.ts` — covers SAND-06
- [ ] `packages/backend/src/sandbox/__tests__/session-timers.test.ts` — covers SAND-04, SAND-05
- [ ] `packages/backend/vitest.config.ts` — configure test runner (currently just `vitest run` with no config file)
- [ ] Vitest mock for `dockerode` — test container lifecycle without real Docker daemon

---

## Sources

### Primary (HIGH confidence)
- [Claude Agent SDK Sessions Docs](https://platform.claude.com/docs/en/agent-sdk/sessions) — JSONL path format, resume option, cross-host pattern, session_id extraction. Verified 2026-03-07.
- [dockerode GitHub README](https://github.com/apocas/dockerode) — createContainer, getArchive, putArchive, listContainers filters, container.remove({force}). HIGH confidence.
- [Docker Resource Constraints Docs](https://docs.docker.com/engine/containers/resource_constraints/) — HostConfig.Memory, NanoCpus, MemorySwap fields. Official. HIGH confidence.
- [Docker iptables Docs](https://docs.docker.com/engine/network/firewall-iptables/) — DOCKER-USER chain, OUTPUT chain, per-container rules. Official. HIGH confidence.
- [node-http-proxy GitHub](https://github.com/http-party/node-http-proxy) — proxyReq event for header injection. HIGH confidence.
- Existing codebase: `packages/backend/src/services/mission-manager.ts`, `packages/agent-runtime/src/mission-engine.ts`, `packages/backend/src/ws/handler.ts` — reuse patterns for relay, persistence, lifecycle.

### Secondary (MEDIUM confidence)
- [Sandboxing AI Coding Agents: Network Firewall + Restricted Shell Environment](https://mfyz.com/ai-coding-agent-sandbox-container/) — iptables inside container with whitelist approach. MEDIUM (community article, not official).
- [dockerode issue #493 (container run timeout)](https://github.com/apocas/dockerode/issues/493) — pattern for external timer-based container timeout. MEDIUM (issue discussion).
- [WebSearch: host.docker.internal on Linux](https://stackoverflow.com/) — ExtraHosts workaround. MEDIUM (multiple community sources agree).

### Tertiary (LOW confidence)
- DNS-based blocking as alternative to iptables IP rules — mentioned in several security articles but no official implementation found. LOW — flag for validation before implementing.
- Azure Foundry header format for credential proxy — inferred from existing codebase env vars but not directly verified against Foundry API docs. LOW — **must be verified before proxy implementation**.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — dockerode already installed, SDK already in use, node-http-proxy is established
- Architecture patterns: HIGH — verified against official SDK docs, dockerode docs, Docker docs
- JSONL path format: HIGH — confirmed from official SDK sessions docs
- iptables isolation: MEDIUM — approach confirmed, but exact IP resolution for CDN-backed domains is a known gap
- Azure Foundry credential proxy: LOW — headers not verified against Foundry docs

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable technology; SDK may have patch releases but architecture is stable)
