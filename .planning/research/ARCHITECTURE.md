# Architecture Research

**Domain:** Cloud AI coding agent platform (Claude Code as a service)
**Researched:** 2026-03-07
**Confidence:** HIGH (Claude Agent SDK docs verified; sandbox patterns verified via official sources)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser (Next.js 15)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ Session Feed  │  │  Chat Input  │  │   File Browser / Output  │   │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘   │
│         │                 │                        │                 │
│  ┌──────▼─────────────────▼────────────────────────▼─────────────┐  │
│  │                   Zustand Store + useSDKStream                  │  │
│  └──────────────────────────────┬──────────────────────────────── ┘  │
└─────────────────────────────────│───────────────────────────────────-┘
                                  │ WebSocket (Socket.IO) + REST
┌─────────────────────────────────▼────────────────────────────────────┐
│                      API Server (Hono + Node.js)                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  │  Session Routes  │  │   User Routes    │  │  MCP Marketplace │    │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘    │
│           │                     │                      │              │
│  ┌────────▼─────────────────────▼──────────────────────▼──────────┐  │
│  │             SessionManager (lifecycle + pub/sub + relay)         │  │
│  └────────────────────────────────┬─────────────────────────────── ┘  │
│                                   │                                   │
│  ┌────────────────────────────────▼──────────────────────────────┐   │
│  │                    UserConfigService                            │   │
│  │   (skills, agents, installed MCPs → inject into session)        │   │
│  └────────────────────────────────┬──────────────────────────────┘   │
└───────────────────────────────────│──────────────────────────────────┘
                                    │ Sandbox API (HTTP/SDK)
┌───────────────────────────────────▼──────────────────────────────────┐
│                        Sandbox Layer                                   │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  Sandbox Instance (E2B / Daytona / Fly Machine / Docker)      │    │
│  │  ┌────────────────────────────────────────────────────────┐  │    │
│  │  │  Claude Agent SDK (query() → async generator)           │  │    │
│  │  │  + MCP servers (stdio processes inside sandbox)         │  │    │
│  │  │  + Workspace filesystem (~/.stallion/sessions/<id>/)    │  │    │
│  │  └────────────────────────────────────────────────────────┘  │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼──────────────────────────────────┐
│                        Persistence Layer                               │
│  ┌─────────────────────┐  ┌──────────────────────────────────────┐   │
│  │  DB (Supabase/PG)   │  │  Object Storage (S3 / local disk)    │   │
│  │  - users            │  │  - session SDK message logs          │   │
│  │  - sessions         │  │  - workspace file snapshots          │   │
│  │  - user_skills      │  │  - SDK session JSONL files           │   │
│  │  - user_mcps        │  │    (~/.claude/projects/<cwd>/*.jsonl)│   │
│  │  - mcp_registry     │  └──────────────────────────────────────┘   │
│  └─────────────────────┘                                             │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Frontend (Next.js) | Render live SDK feed, chat input, file browser; handle WebSocket | Next.js 15 + Zustand + Socket.IO client |
| API Server (Hono) | Session CRUD, user management, MCP marketplace, JWT auth | Hono + Node.js, existing codebase |
| SessionManager | Own session lifecycle (create/start/abort/resume), SDK relay, pub/sub fan-out | Existing MissionManager pattern, extended |
| UserConfigService | Load user skills + MCPs, assemble `query()` options before session start | New service, reads from DB |
| Sandbox Layer | Isolated execution environment: filesystem, Node.js, CLI tools, MCP processes | E2B / Daytona / Fly Machines |
| Claude Agent SDK | Execute CC with `query()`, emit typed SDK events, manage session JSONL on disk | `@anthropic-ai/claude-agent-sdk` |
| Persistence (DB) | Users, sessions, skills, MCPs — relational records | Supabase (PostgreSQL) |
| Persistence (Files) | SDK session JSONL, workspace files, artifacts — blob storage | Disk (dev), S3-compatible (prod) |

## Recommended Project Structure

The existing monorepo structure is sound. Extensions needed:

```
packages/
├── shared/src/schemas/
│   ├── mission.ts              # rename → session.ts (CC sessions)
│   ├── user.ts                 # NEW: User, UserSkill, UserMCP schemas
│   └── events.ts               # extend SDKEnvelope (existing)
│
├── agent-runtime/src/
│   ├── session-engine.ts       # rename MissionEngine → SessionEngine
│   ├── session-env.ts          # rename MissionEnvConfig → SessionEnvConfig
│   ├── user-config-builder.ts  # NEW: assemble query() options from user data
│   └── skill-injector.ts       # NEW: build CLAUDE.md + system prompt additions
│
├── backend/src/
│   ├── services/
│   │   ├── session-manager.ts  # rename MissionManager → SessionManager
│   │   ├── user-service.ts     # NEW: user CRUD, auth integration
│   │   ├── skill-service.ts    # NEW: skill CRUD, file persistence
│   │   └── mcp-service.ts      # NEW: MCP registry, per-user installs
│   ├── routes/
│   │   ├── sessions.ts         # rename missions.ts
│   │   ├── users.ts            # NEW
│   │   ├── skills.ts           # NEW
│   │   └── mcps.ts             # NEW
│   └── sandbox/
│       ├── sandbox-provider.ts # NEW: abstract interface
│       ├── e2b-provider.ts     # NEW: E2B implementation
│       └── local-provider.ts   # NEW: local Docker (dev/testing)
│
└── frontend/src/
    ├── components/
    │   ├── sdk-activity-log.tsx    # existing, keep
    │   ├── file-browser.tsx        # NEW: browse/download workspace files
    │   ├── mcp-marketplace.tsx     # NEW: browse/install MCPs
    │   └── user-settings.tsx       # NEW: skills, agents, credentials
    └── store/
        ├── session-store.ts    # rename mission-store.ts
        └── user-store.ts       # NEW: user prefs, installed MCPs
```

### Structure Rationale

- **sandbox/**: Isolate sandbox provider behind interface so dev uses local Docker and prod uses E2B/Daytona — swap without touching SessionEngine
- **user-config-builder.ts**: Single function that takes `userId` and returns the complete `query()` options object — testable in isolation, critical path
- **skill-injector.ts**: Builds the CLAUDE.md content injected per-session, separate from MCP config assembly
- **mcp-service.ts**: Registry + per-user installs are distinct concerns from the runtime MCP config assembly done in `user-config-builder`

## Architectural Patterns

### Pattern 1: Hybrid Session (Ephemeral Sandbox + Persistent State)

**What:** Each CC session runs in a fresh sandbox container (ephemeral filesystem), but conversation state (SDK session JSONL), workspace file snapshots, and SDK message logs persist externally in object storage. On reconnect or resume, state is hydrated back into a new container.

**When to use:** Always — this is the correct pattern for Stallion. Pure ephemeral loses work; pure long-running is expensive and hard to scale.

**Trade-offs:**
- Pro: Pay-per-use sandbox costs; no zombie containers
- Pro: Survive container failures without losing user work
- Pro: Session resume across deploys / host changes
- Con: Resume latency (~2-5s to hydrate state into new container)
- Con: File state must be explicitly snapshotted (SDK session JSONL persists conversation, NOT filesystem)

**Example — SDK session resume across containers:**
```typescript
// On sandbox restart: restore SDK session JSONL to correct path
// ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
await sandbox.files.write(
  `~/.claude/projects/${encodedCwd}/${sessionId}.jsonl`,
  await objectStorage.get(`sessions/${sessionId}/claude-session.jsonl`)
);

// Then resume the session
for await (const msg of query({
  prompt: userMessage,
  options: {
    resume: sessionId,
    mcpServers: await userConfigBuilder.buildMCPConfig(userId),
    allowedTools: [...defaultTools, ...await userConfigBuilder.buildMCPToolAllowlist(userId)]
  }
})) {
  // relay to WebSocket
}
```

### Pattern 2: User Config Injection at Session Start

**What:** Before calling `query()`, a `UserConfigBuilder` loads the user's installed skills and MCPs from the DB and assembles the complete `query()` options object. Skills become CLAUDE.md content; MCPs become `mcpServers` entries with stored credentials.

**When to use:** Every session start — this is how user-level personalization propagates into the sandboxed CC process.

**Trade-offs:**
- Pro: CC sees the correct configuration from turn 1, no runtime discovery needed
- Pro: Each session is independently configured — changes don't affect running sessions
- Con: Config assembled at start; mid-session MCP installs require restart (acceptable)
- Con: Credentials must be stored server-side and injected at runtime (security: encrypt at rest)

**Example:**
```typescript
async function buildQueryOptions(userId: string): Promise<SDKOptions> {
  const [skills, mcps] = await Promise.all([
    skillService.getUserSkills(userId),
    mcpService.getUserInstalledMCPs(userId)
  ]);

  const claudeMd = skillInjector.buildClaudeMd(skills);
  const mcpServers = mcpConfigBuilder.buildMCPServers(mcps); // includes credentials

  return {
    systemPrompt: { type: "preset", preset: "claude_code" },
    appendSystemPrompt: claudeMd,   // injects GSD workflow + user skills
    mcpServers,
    allowedTools: [
      ...DEFAULT_TOOLS,
      ...mcpConfigBuilder.buildAllowlist(mcps)
    ],
    permissionMode: "acceptEdits"
  };
}
```

### Pattern 3: SDK Message Relay via WebSocket

**What:** The SDK `query()` async generator emits typed messages in real-time. These are wrapped in `SDKEnvelope` objects, persisted to the session log, and fanned out to all connected WebSocket clients. The frontend interprets them client-side into a renderable feed.

**When to use:** Always — this is the existing pattern, proven correct. Keep it.

**Trade-offs:**
- Pro: Zero interpretation on the hot path (backend is a pure relay)
- Pro: Frontend interpretation is replayable — same messages = same UI state
- Pro: Easy replay on reconnect (send all persisted envelopes on join)
- Con: Frontend must understand all SDK message types
- Con: Message volume can be high for long sessions (mitigate: pagination/virtual scrolling)

**Example — the relay loop (existing pattern, keep):**
```typescript
// In SessionEngine.execute():
for await (const msg of query({ prompt, options })) {
  const envelope: SDKEnvelope = { id: nanoid(), sessionId, timestamp: Date.now(), msg };
  await persistence.appendEnvelope(sessionId, envelope);  // write to JSONL log
  callbacks.onSDKMessage(envelope);                        // fan-out to WS clients
}
```

### Pattern 4: Sandbox Abstraction Interface

**What:** Define a `SandboxProvider` interface that both local Docker (dev) and cloud providers (E2B, Daytona, Fly Machines) implement. The `SessionEngine` calls `provider.create()`, `provider.execute()`, `provider.destroy()` without knowing which sandbox is active.

**When to use:** From the start — avoids coupling execution logic to E2B-specific APIs.

**Trade-offs:**
- Pro: Swap E2B for Daytona with a config change, no SessionEngine changes
- Pro: Local Docker provider makes dev/CI fast without cloud costs
- Con: Abstraction has a learning curve; must identify minimal interface correctly
- Con: Provider-specific features (snapshots, warm pools) require escape hatches

**Example interface:**
```typescript
interface SandboxProvider {
  create(config: SandboxConfig): Promise<SandboxHandle>;
  execute(handle: SandboxHandle, command: string): Promise<void>;
  writeFile(handle: SandboxHandle, path: string, content: string): Promise<void>;
  readFile(handle: SandboxHandle, path: string): Promise<string>;
  listFiles(handle: SandboxHandle, path: string): Promise<FileEntry[]>;
  destroy(handle: SandboxHandle): Promise<void>;
  // Escape hatch for provider-specific features:
  raw(): unknown;
}
```

## Data Flow

### Session Start Flow

```
User submits prompt (browser)
    ↓ POST /api/sessions
API creates session record in DB (status: "created")
    ↓
UserConfigBuilder.buildQueryOptions(userId)
    → DB: fetch user skills + installed MCPs + credentials
    → assemble mcpServers + CLAUDE.md + allowedTools
    ↓
SandboxProvider.create(config)
    → provision sandbox (E2B: ~150ms from warm pool; cold: ~2-5s)
    → inject SDK session JSONL if resuming (from object storage)
    → write CLAUDE.md to sandbox workspace
    ↓
SessionEngine.execute(prompt, queryOptions) [non-blocking]
    → sandbox runs: query() → async generator of SDK messages
    → each message: SDKEnvelope → persistence log + WS fan-out
    ↓
Frontend receives sdk_message events via Socket.IO
    → addSDKMessage() → Zustand store
    → useSDKStream() useMemo → SDKFeedEntry[] → render feed
```

### Session Resume Flow (across container restarts)

```
User returns to session (browser)
    ↓ GET /api/sessions/:id → load session record from DB
Frontend connects WebSocket (join_session)
    ↓
Backend sends sdk_messages_batch (all persisted envelopes from JSONL log)
Frontend rebuilds full feed from replay
    ↓ [if session still running]
SDK messages continue streaming in real-time
    ↓ [if session completed/failed AND user sends new message]
POST /api/sessions/:id/message
    → SandboxProvider.create() (new container)
    → hydrate SDK session JSONL from object storage to sandbox
    → query({ prompt: newMessage, options: { resume: sdkSessionId, ...userConfig } })
    → relay continues as normal
```

### MCP Marketplace Install Flow

```
User browses MCP Marketplace (browser)
    ↓ GET /api/mcps — paginated registry list
User clicks "Install" on a tool
    ↓ POST /api/mcps/:id/install
    → prompt user for required credentials (GitHub token, etc.)
    → store encrypted credentials in DB (user_mcp_installs table)
    → record install (user_id, mcp_id, credentials_ref)
    ↓
On next session start:
    → UserConfigBuilder picks up new MCP install
    → injects into mcpServers + allowedTools
    → CC session has the tool available from turn 1
```

### User Config Injection (per-session)

```
UserConfigBuilder.buildQueryOptions(userId)
    ↓
skills[] (from DB)
    → skillInjector.buildClaudeMd(skills)
    → result: CLAUDE.md string (GSD workflow + user's installed skills)
    ↓
installedMCPs[] (from DB + credentials store)
    → for each MCP: { type, command/url, env: { decryptedCreds } }
    → result: mcpServers object for query() options
    ↓
allowedTools: [
  ...DEFAULT_CC_TOOLS,                 // Read, Write, Edit, Bash, Glob, Grep, ...
  ...mcpAllowlist                      // mcp__github__*, mcp__browser__*, ...
]
    ↓
query({ prompt, options: { mcpServers, appendSystemPrompt: claudeMd, allowedTools } })
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-100 users | Monolith fine: single backend, local disk for sessions/files, Docker-based sandboxes |
| 100-1k users | E2B/Daytona for sandboxes (don't run containers on the API server), DB for sessions, S3 for file storage |
| 1k-10k users | Horizontally scale the API server (it's stateless); Redis pub/sub replaces in-memory SessionManager listeners for multi-instance WS fan-out |
| 10k+ users | Dedicated sandbox orchestrator service; session JSONL moves entirely to object storage; read replicas for DB |

### Scaling Priorities

1. **First bottleneck: sandbox resource exhaustion.** Each CC session needs ~1GiB RAM + 1 CPU + 5GiB disk. At 50 concurrent sessions, that's 50GiB RAM. The API server must NOT run sandboxes — offload to E2B/Daytona from day one for prod.

2. **Second bottleneck: WebSocket fan-out across API instances.** The current `SessionManager` uses in-memory subscribers. With multiple API server instances, a Socket.IO client on instance A won't receive events from a session running on instance B. Fix: Redis pub/sub adapter for Socket.IO (drop-in, ~1 hour of work).

3. **Third bottleneck: SDK cold start latency (~12s for a fresh `cli.js` subprocess).** Mitigation: use sandbox providers with warm pools (E2B and Daytona both maintain warm sandbox pools with pre-installed `@anthropic-ai/claude-code`).

## Anti-Patterns

### Anti-Pattern 1: Running SDK Subprocess on API Server Host

**What people do:** Call `query()` directly from the Hono API server process to avoid sandbox complexity.

**Why it's wrong:** CC has Bash tool access. Malicious or accidental CC execution (`rm -rf`, credential reads, network scans) runs with the API server's OS permissions. One user's CC session can affect other sessions and the host.

**Do this instead:** Always run `query()` inside an isolated sandbox (container/microVM). The `SandboxProvider` abstraction makes this easy — start with a local Docker provider in dev, swap to E2B for prod without changing SessionEngine code.

### Anti-Pattern 2: Storing SDK Session JSONL Only on Sandbox Filesystem

**What people do:** Let the SDK write session state to `~/.claude/projects/.../*.jsonl` inside the sandbox, then destroy the sandbox when done.

**Why it's wrong:** Session history is permanently lost when the sandbox is destroyed. User cannot resume. Server restarts wipe all context.

**Do this instead:** After each `query()` completes (or on periodic flush), copy the JSONL file from the sandbox to external object storage. On resume, hydrate it back into the new sandbox before calling `query({ resume: sessionId })`. The SDK's session resume docs explicitly describe this "cross-host" pattern.

### Anti-Pattern 3: Blocking Session Start on MCP Server Cold Start

**What people do:** Await all MCP servers connecting before the first SDK message relay begins.

**Why it's wrong:** Some MCP servers (browser control, large npm packages) take 5-30 seconds to start. The user sees a spinner and no activity.

**Do this instead:** Start the SDK `query()` call immediately. The SDK emits a `system/init` message that lists each MCP server's connection status. Check this message in the relay and emit a session status event to the frontend ("browser MCP connecting..."). MCP tool calls that arrive before the server is ready will fail gracefully and CC will retry.

### Anti-Pattern 4: Injecting User Credentials as Plaintext into System Prompt

**What people do:** Add "Your GitHub token is ghp_xxx" to the CLAUDE.md or system prompt to make it available to CC.

**Why it's wrong:** Credentials appear in SDK message logs, session JSONL files, and potentially in CC's outputs. Any prompt injection attack can exfiltrate them.

**Do this instead:** Pass credentials via MCP server `env` fields in `mcpServers` config. The MCP server process receives the token as an environment variable, not as conversation content. CC calls the MCP tool without ever seeing the raw token.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| E2B | REST API via `@e2b/code-interpreter` SDK; sandbox created per session | Warm pool reduces cold start from ~5s to ~150ms; 24h max session on Pro |
| Daytona | REST API via Daytona SDK; control plane + compute plane | Sub-90ms creation; OCI snapshot-based; volumes for persistence |
| Fly Machines | Fly Machines API; `fly machines create` per session | Good for long-running; ~1-2s cold start from snapshot |
| Supabase | Supabase JS client (auth + DB); JWT verified server-side | Already in codebase (auth middleware exists) |
| Azure AI Foundry | Via `CLAUDE_CODE_USE_FOUNDRY` env vars injected into sandbox | Already configured; pass as sandbox env vars, not hardcoded |
| MCP marketplace servers | npm packages (stdio) or HTTP endpoints; configured per-session via `mcpServers` | Credentials stored encrypted in DB, injected at runtime |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Frontend ↔ Backend | Socket.IO (streaming) + REST (writes/hydration) | Existing pattern — keep |
| Backend ↔ SessionEngine | Direct function call + callbacks (onSDKMessage, onLifecycle) | Existing pattern — keep |
| SessionEngine ↔ Sandbox | SandboxProvider interface (create/execute/files/destroy) | New abstraction to build |
| SessionEngine ↔ SDK | `query()` async generator inside sandbox process | SDK runs inside sandbox, not on API server |
| Backend ↔ DB | Supabase client (existing) | Extend for sessions, skills, MCPs |
| Backend ↔ Object Storage | S3-compatible client | New: session JSONL + workspace file snapshots |
| UserConfigBuilder ↔ DB | Read-only at session start | Load once per session, assemble options |

## Build Order Implications

Based on component dependencies, the natural build order is:

1. **Sandbox abstraction + local provider** — blocks everything else; can't test SessionEngine in cloud without this
2. **SessionEngine refactor** — rename MissionEngine, add sandbox provider integration; existing relay pattern is sound
3. **User schema + DB migrations** — users, sessions, skills, user_mcps tables
4. **UserConfigService** — skill injection + MCP config assembly; depends on DB schema
5. **API routes** — sessions, users, skills, MCPs; depends on all services
6. **Frontend extensions** — file browser, user settings, MCP marketplace; depends on API routes
7. **Cloud sandbox provider** — swap local Docker for E2B/Daytona; requires sandbox interface from step 1

The existing SDK relay pattern (MissionEngine → SessionManager → WebSocket) is already the correct architecture. The primary new infrastructure is:
- Sandbox isolation (currently running SDK on host — must move into sandbox)
- User config injection (currently hardcoded env vars — must become per-user DB-driven)
- Session JSONL persistence (currently only persists SDKEnvelopes — SDK session file must also be preserved for true resume)

## Sources

- Claude Agent SDK Hosting Guide: https://platform.claude.com/docs/en/agent-sdk/hosting (HIGH confidence — official)
- Claude Agent SDK Sessions Guide: https://platform.claude.com/docs/en/agent-sdk/sessions (HIGH confidence — official)
- Claude Agent SDK MCP Integration: https://platform.claude.com/docs/en/agent-sdk/mcp (HIGH confidence — official)
- E2B Documentation: https://e2b.dev/docs (MEDIUM confidence — via search summary)
- Daytona Architecture: https://www.daytona.io/docs/en/architecture/ (MEDIUM confidence — via search summary)
- Northflank: Daytona vs E2B 2026: https://northflank.com/blog/daytona-vs-e2b-ai-code-execution-sandboxes
- Best sandboxes for coding agents 2026: https://northflank.com/blog/best-sandboxes-for-coding-agents
- claude-agent-server reference implementation: https://github.com/dzhng/claude-agent-server (MEDIUM confidence)
- Gitpod workspace lifecycle: https://www.gitpod.io/docs/configure/workspaces/workspace-lifecycle
- Replit multi-agent architecture: https://www.zenml.io/llmops-database/building-a-production-ready-multi-agent-coding-assistant
- Claude Code full stack (skills, MCP, agents): https://alexop.dev/posts/understanding-claude-code-full-stack/

---
*Architecture research for: Cloud AI coding agent platform (Stallion)*
*Researched: 2026-03-07*
