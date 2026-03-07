# External Integrations

**Analysis Date:** 2026-03-07

## APIs & External Services

**LLM / AI Orchestration:**
- Azure AI Foundry (Claude Agent SDK) - Powers all agent execution; MissionEngine calls `query()` from SDK which spawns Claude Code subprocesses
  - SDK/Client: `@anthropic-ai/claude-agent-sdk` 0.2.63
  - Auth env vars: `ANTHROPIC_FOUNDRY_RESOURCE`, `ANTHROPIC_FOUNDRY_API_KEY`
  - Activation: `CLAUDE_CODE_USE_FOUNDRY=1`
  - Model selection: `ANTHROPIC_DEFAULT_SONNET_MODEL` (default: `claude-sonnet-4-6`), `ANTHROPIC_DEFAULT_OPUS_MODEL` (default: `claude-opus-4-6`)
  - Config: `packages/agent-runtime/src/mission-env.ts`

**Image Generation:**
- Azure OpenAI Image Generation (`gpt-image-1.5`) - Available to agent subprocesses for generating images
  - Auth env vars: `AZURE_IMAGE_GEN_ENDPOINT`, `AZURE_IMAGE_GEN_KEY`
  - Passed to subprocess env via `buildProcessEnv()` in `packages/agent-runtime/src/mission-env.ts`
  - Not called directly by backend; available in agent subprocess environment

## Data Storage

**Databases:**
- None (no SQL/NoSQL database client in use)

**File Storage:**
- Local filesystem only
  - Mission state persisted as JSON files to `~/.stallion/missions/` (one file per mission ID)
  - Agent workspaces at `os.tmpdir()/stallion-missions/<missionId>/` or `STALLION_WORKSPACE_ROOT/<missionId>/`
  - Persistence implemented in `packages/backend/src/services/mission-manager.ts` (debounced saves, `loadMissions()` on startup)

**Caching:**
- None (in-memory Map in MissionManager; no Redis or similar)

## Authentication & Identity

**Auth Provider:**
- Supabase Auth - JWT-based authentication for all mission API routes and WebSocket connections
  - Frontend client (browser): `packages/frontend/src/lib/supabase/client.ts` via `@supabase/ssr` `createBrowserClient()`
  - Frontend server: `packages/frontend/src/lib/supabase/server.ts` via `createServerClient()`
  - Backend JWT verification: `packages/backend/src/middleware/auth.ts` — verifies Bearer tokens using Supabase JWKS endpoint via `jose`
  - WebSocket auth: `packages/backend/src/ws/handler.ts` — socket middleware verifies token from `socket.handshake.auth.token`
  - Frontend middleware: `packages/frontend/src/middleware.ts` — redirects unauthenticated users to `/login`
  - Auth methods supported: Google OAuth, email/password, magic link (OTP)
  - OAuth callback route: `packages/frontend/src/app/auth/callback/route.ts`
  - Frontend env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - Backend env var: `SUPABASE_URL` (for JWKS URL construction)

**Dev Auth Bypass:**
- Set `DEV_AUTH_BYPASS=true` (backend) and `NEXT_PUBLIC_DEV_AUTH_BYPASS=true` (frontend) to skip all JWT verification
- Backend assigns fixed `userId: "dev-user-001"` in bypass mode
- Frontend `useAuth()` hook returns fake dev user in bypass mode (`packages/frontend/src/hooks/use-auth.ts`)

## Monitoring & Observability

**Error Tracking:**
- None detected

**Logs:**
- `console.log` / `console.error` to stdout (backend and agent-runtime)
- No structured logging library

## CI/CD & Deployment

**Hosting:**
- Not configured (no deployment config files detected — no `vercel.json`, `Dockerfile`, `fly.toml`, etc.)

**CI Pipeline:**
- None detected (no `.github/workflows/`, no CI config)

## Environment Configuration

**Required env vars (backend):**
- `ANTHROPIC_FOUNDRY_RESOURCE` - Azure AI Foundry resource name
- `ANTHROPIC_FOUNDRY_API_KEY` - Azure AI Foundry API key
- `SUPABASE_URL` - Supabase project URL (for JWKS JWT verification)
- `PORT` - Backend HTTP port (default: `4000`)

**Optional env vars (backend):**
- `ANTHROPIC_DEFAULT_SONNET_MODEL` - Override default model (default: `claude-sonnet-4-6`)
- `ANTHROPIC_DEFAULT_OPUS_MODEL` - Override capable model (default: `claude-opus-4-6`)
- `AZURE_IMAGE_GEN_ENDPOINT` - Azure image generation endpoint
- `AZURE_IMAGE_GEN_KEY` - Azure image generation API key
- `STALLION_WORKSPACE_ROOT` - Override workspace directory
- `STALLION_USE_CONTAINERS` - Enable Docker container mode for agent VMs
- `DEV_AUTH_BYPASS` - Set `"true"` to skip auth in development

**Required env vars (frontend):**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `NEXT_PUBLIC_BACKEND_URL` - Backend URL (default: `http://localhost:4000`)
- `NEXT_PUBLIC_DEV_AUTH_BYPASS` - Set `"true"` to skip auth in development

**Secrets location:**
- `.env` at monorepo root (loaded by backend via dotenv; Next.js picks up `NEXT_PUBLIC_*` natively)

## Webhooks & Callbacks

**Incoming:**
- `/auth/callback` (Next.js route) - Supabase OAuth callback; exchanges code for session (`packages/frontend/src/app/auth/callback/route.ts`)

**Outgoing:**
- None (no outgoing webhooks to external services)

## Real-time Communication

**WebSocket:**
- Socket.IO 4.8.3 server (`packages/backend/src/ws/handler.ts`) — backend pushes mission state and event streams to frontend
- Socket.IO client (`packages/frontend/src/hooks/use-socket.ts`) — frontend subscribes to `mission_state`, `event`, `events_batch`, `sdk_message`, `sdk_messages_batch`
- Auth: token passed via `socket.handshake.auth.token` (Supabase JWT or bypassed in dev)

## Container Management

**Docker (optional):**
- `dockerode` 4.0.9 - Docker daemon client for managing agent VM containers
- Activated via `STALLION_USE_CONTAINERS=true`
- Types: `@types/dockerode` 4.0.1

---

*Integration audit: 2026-03-07*
