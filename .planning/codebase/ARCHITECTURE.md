# Architecture

**Analysis Date:** 2026-03-07

## Pattern Overview

**Overall:** Event-Driven Thin Relay with Client-Side Interpretation

**Key Characteristics:**
- The backend is a pure relay: it wraps raw SDK messages in `SDKEnvelope` objects and streams them to the frontend unchanged — no interpretation on the server
- All SDK message interpretation (feed construction, status tracking, cost extraction) happens in a client-side `useMemo` hook (`use-sdk-stream.ts`)
- Mission lifecycle is push-driven via Socket.IO; REST is used only for initial hydration and write operations
- The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) is the execution engine — the backend calls `query()` with `preset: "claude_code"` and relays every emitted event verbatim

## Layers

**Shared Schemas (`@stallion/shared`):**
- Purpose: Type-safe contracts shared across all packages
- Location: `packages/shared/src/schemas/`
- Contains: Zod v4 schemas for `Mission`, `SessionEvent`, `SDKEnvelope`, `ChatMessage`
- Depends on: Zod only
- Used by: All other packages

**Agent Runtime (`@stallion/agent-runtime`):**
- Purpose: Thin wrapper around the Claude Agent SDK
- Location: `packages/agent-runtime/src/`
- Contains: `MissionEngine` (SDK relay), `MissionEnvConfig` (env config), `buildProcessEnv` (subprocess env builder)
- Depends on: `@stallion/shared`, `@anthropic-ai/claude-agent-sdk`
- Used by: `@stallion/backend`

**Backend (`@stallion/backend`):**
- Purpose: HTTP API + WebSocket server + mission persistence
- Location: `packages/backend/src/`
- Contains: Hono routes, Socket.IO handler, `MissionManager` service (in-memory + disk persistence)
- Depends on: `@stallion/agent-runtime`, `@stallion/shared`
- Used by: Frontend (HTTP + WebSocket)

**Frontend (`@stallion/frontend`):**
- Purpose: Next.js 15 UI — landing, mission dashboard, live SDK feed
- Location: `packages/frontend/src/`
- Contains: React components, Zustand store, `useSocket` hook (WS connection), `useSDKStream` hook (SDK interpretation)
- Depends on: `@stallion/shared` (types only)
- Used by: End users via browser

## Data Flow

**Mission Creation and Start:**
1. User types prompt in `packages/frontend/src/app/page.tsx`
2. Frontend calls `POST /api/missions` → backend `MissionManager.createMission()` → returns mission shell
3. Frontend calls `POST /api/missions/:id/start` with `{ prompt }` → `MissionManager.startMission()`
4. `MissionManager` creates `MissionEngine`, calls `engine.initWorkspace(id)` (creates `~/.stallion/missions/<id>/`)
5. `MissionEngine.execute()` fires in the background (non-blocking) — calls `query({ prompt, options })` on the SDK
6. SDK emits events; each is wrapped in `SDKEnvelope` and passed to `MissionManager` callbacks

**SDK Relay (Backend):**
1. `MissionEngine` receives raw SDK message → wraps in `SDKEnvelope` → calls `onSDKMessage(envelope)`
2. `MissionManager.onSDKMessage`: pushes to `data.sdkMessages[]`, calls `notifySDK(id, envelope)`, debounced save to disk
3. `notifySDK` → all registered SDK listeners → `setupWebSocket` handler → `socket.emit("sdk_message", envelope)`
4. On lifecycle events (`session_completed`, `session_error`): `notifyEvent` → `socket.emit("event")` + `socket.emit("mission_state")`

**Frontend Rendering:**
1. `useSocket(missionId)` in `packages/frontend/src/hooks/use-socket.ts` connects to Socket.IO at `NEXT_PUBLIC_BACKEND_URL`
2. `sdk_message` events → `addSDKMessage(envelope)` → Zustand store `sdkMessages[]`
3. `useSDKStream()` in `packages/frontend/src/hooks/use-sdk-stream.ts` runs `useMemo` over `sdkMessages[]`
4. `processEnvelope()` interprets each `SDKEnvelope.msg` → builds typed `SDKFeedEntry[]` (`text`, `tool_call`, `result`)
5. `SDKActivityLog` in `packages/frontend/src/components/sdk-activity-log.tsx` renders the feed

**State Management:**
- Single Zustand store at `packages/frontend/src/store/mission-store.ts`
- Stores: `mission` (Mission object), `sdkMessages` (SDKEnvelope[]), `events` (SessionEvent[]), `connected` (bool), `elapsedMs` (timer)
- All store updates flow from `useSocket` event handlers
- `useSDKStream` derives feed/cost/duration from `sdkMessages` via `useMemo` — no derived state in the store itself

## Key Abstractions

**SDKEnvelope:**
- Purpose: Wraps a raw Claude Agent SDK event for persistence and relay
- Examples: `packages/shared/src/schemas/events.ts`
- Pattern: `{ id, sessionId, timestamp, msg: unknown }` — `msg` is typed loosely in shared, typed strictly in the frontend hook

**MissionEngine:**
- Purpose: Single-method relay — sets up SDK options and forwards every SDK event unchanged
- Examples: `packages/agent-runtime/src/mission-engine.ts`
- Pattern: Constructor receives `MissionEnvConfig`; `execute()` accepts callbacks `onSDKMessage` and `onLifecycle`; `abort()` cancels via `AbortController`

**MissionManager:**
- Purpose: Singleton service (factory `create()` pattern); owns the in-memory mission map, persistence, and pub/sub
- Examples: `packages/backend/src/services/mission-manager.ts`
- Pattern: `Map<string, MissionData>` in memory; `subscribe()` / `subscribeSDK()` return unsubscribe functions; debounced `saveMission()` writes `MissionSnapshot` JSON to `~/.stallion/missions/`

**useSDKStream:**
- Purpose: Client-side interpretation of all SDK messages into a renderable feed
- Examples: `packages/frontend/src/hooks/use-sdk-stream.ts`
- Pattern: `useMemo` over `sdkMessages[]`; maintains `ProcessState` with `feed[]` and `toolCallMap`; mutates feed entries in-place when `tool_progress` / `tool_use_summary` arrive

## Entry Points

**Backend Server:**
- Location: `packages/backend/src/index.ts`
- Triggers: `tsx src/index.ts` (dev) or `node` (prod)
- Responsibilities: Loads `.env` from monorepo root, creates `MissionManager`, mounts Hono routes at `/api/missions`, starts `@hono/node-server` on port 4000, attaches Socket.IO to the same server

**Frontend App:**
- Location: `packages/frontend/src/app/layout.tsx` (root), `packages/frontend/src/app/page.tsx` (main page)
- Triggers: Next.js 15 page router; `middleware.ts` handles auth redirect
- Responsibilities: Renders landing (prompt input) or dashboard depending on `missionId` state; auto-resumes last active mission from `localStorage`

**Auth Flow:**
- Location: `packages/frontend/src/middleware.ts`
- Triggers: Every non-static request
- Responsibilities: Supabase JWT validation via `@supabase/ssr`; redirects unauthenticated users to `/login`; bypassed when `NEXT_PUBLIC_DEV_AUTH_BYPASS=true`

## Error Handling

**Strategy:** Errors are contained at layer boundaries; the SDK `try/catch` in `MissionEngine.execute()` emits a `session_error` lifecycle event and rethrows; `MissionManager` catches the rethrow and marks the mission `failed`.

**Patterns:**
- `MissionEngine.execute()`: `try/catch` around the SDK `for await` loop → emits `session_error` lifecycle event → rethrows
- `MissionManager.startMission()`: `.catch()` on the non-blocking `engine.execute()` call → sets `status = "failed"`, saves immediately
- On server restart: any mission with `status === "running"` is reset to `"failed"` in `loadMissions()`
- Frontend: `useSocket` logs WebSocket errors to console; REST calls in `use-socket.ts` use `.catch(() => {})` (silent fallback)

## Cross-Cutting Concerns

**Logging:** `console.log` / `console.error` only — no structured logging library. Key log points: server start, `MissionManager` init, client connect/disconnect, mission start/fail/save errors.

**Validation:** Zod schemas in `@stallion/shared` are the canonical types; backend routes use inline `z.object()` for request body validation (e.g., `start` route); no validation on WebSocket payloads.

**Authentication:** Dual-mode. Production: Supabase JWT verified by `jose` (`jwtVerify` against remote JWKS) in both HTTP middleware (`packages/backend/src/middleware/auth.ts`) and WebSocket handshake (`packages/backend/src/ws/handler.ts`). Development: `DEV_AUTH_BYPASS=true` skips all JWT checks and uses `dev-user-001`.

**Persistence:** `MissionManager` writes `MissionSnapshot` JSON files to `~/.stallion/missions/<id>.json`. Saves are debounced (1s) during execution; forced immediately on status changes (`completed`, `failed`). Agent workspace files live at `~/.stallion/missions/<id>/` (or `$STALLION_WORKSPACE_ROOT/<id>/`).

**Reconnect / Replay:** On WebSocket join, backend sends `sdk_messages_batch` (all persisted envelopes) and `events_batch`. Frontend also fires parallel REST fetches in `use-socket.ts`. `addSDKMessages` deduplicates by envelope `id`.

---

*Architecture analysis: 2026-03-07*
