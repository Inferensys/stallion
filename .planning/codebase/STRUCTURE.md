# Codebase Structure

**Analysis Date:** 2026-03-07

## Directory Layout

```
stallion/                              # Monorepo root
├── packages/
│   ├── shared/                        # @stallion/shared — Zod schemas
│   │   └── src/
│   │       ├── schemas/
│   │       │   ├── mission.ts         # Mission, MissionStatus
│   │       │   └── events.ts          # SessionEvent, SDKEnvelope, ChatMessage
│   │       └── index.ts
│   ├── agent-runtime/                 # @stallion/agent-runtime — SDK relay
│   │   └── src/
│   │       ├── mission-engine.ts      # MissionEngine class (wraps query())
│   │       ├── mission-env.ts         # MissionEnvConfig, buildProcessEnv
│   │       └── index.ts
│   ├── backend/                       # @stallion/backend — Hono API + Socket.IO
│   │   └── src/
│   │       ├── index.ts               # Server entry point
│   │       ├── middleware/
│   │       │   └── auth.ts            # Supabase JWT auth middleware
│   │       ├── routes/
│   │       │   └── missions.ts        # REST routes for missions
│   │       ├── services/
│   │       │   └── mission-manager.ts # MissionManager singleton
│   │       └── ws/
│   │           └── handler.ts         # Socket.IO event handlers
│   └── frontend/                      # @stallion/frontend — Next.js 15
│       └── src/
│           ├── app/
│           │   ├── layout.tsx          # Root layout (Inter font, dark class)
│           │   ├── page.tsx            # Landing page + mission dashboard toggle
│           │   ├── globals.css         # Tailwind base styles + CSS vars
│           │   ├── login/
│           │   │   └── page.tsx        # Login page
│           │   └── auth/
│           │       └── callback/
│           │           └── route.ts    # Supabase OAuth callback
│           ├── components/
│           │   ├── dashboard.tsx       # Mission dashboard (header + feed + workspace)
│           │   ├── sdk-activity-log.tsx # Claude Code-style feed renderer
│           │   ├── sidebar.tsx         # Collapsible mission list sidebar
│           │   ├── workspace-inspector.tsx # File browser for agent workspace
│           │   ├── markdown.tsx        # react-markdown wrapper
│           │   ├── login-button.tsx    # OAuth login button
│           │   └── logo.tsx            # StallionMark SVG logo
│           ├── hooks/
│           │   ├── use-socket.ts       # Socket.IO connection + REST hydration
│           │   ├── use-sdk-stream.ts   # SDK message → SDKFeedEntry[] (useMemo)
│           │   └── use-auth.ts         # Supabase auth state hook
│           ├── store/
│           │   └── mission-store.ts    # Zustand store (mission, sdkMessages, timer)
│           ├── lib/
│           │   ├── api.ts              # authFetch — fetch wrapper with Bearer token
│           │   ├── utils.ts            # cn(), formatDuration(), formatTime()
│           │   └── supabase/
│           │       ├── client.ts       # createClient (browser)
│           │       └── server.ts       # createServerClient (SSR)
│           └── middleware.ts           # Next.js auth redirect middleware
├── .planning/
│   └── codebase/                      # GSD planning documents
├── package.json                       # npm workspaces root
├── tsconfig.base.json                 # Shared TypeScript base config
├── .env.example                       # Required env var template
├── ARCHITECTURE.md                    # In-depth flow documentation
└── PROMPTS.md                         # System prompt reference
```

## Directory Purposes

**`packages/shared/src/schemas/`:**
- Purpose: Single source of truth for all shared types
- Contains: Two schema files — `mission.ts` (entity types) and `events.ts` (event/envelope types)
- Key files: `mission.ts` exports `Mission`, `MissionStatus`; `events.ts` exports `SessionEvent`, `SDKEnvelope`, `ChatMessage`

**`packages/agent-runtime/src/`:**
- Purpose: Isolates the Claude Agent SDK dependency; the rest of the system never imports the SDK directly
- Contains: `MissionEngine` (the only class), env config utilities
- Key files: `mission-engine.ts` — the 88-line relay; `mission-env.ts` — `buildProcessEnv` strips `CLAUDECODE` to allow nested Claude Code spawning

**`packages/backend/src/services/`:**
- Purpose: Core business logic — mission lifecycle, persistence, pub/sub
- Contains: `MissionManager` — the only service; it is a singleton created via `MissionManager.create()`
- Key files: `mission-manager.ts` — all mission CRUD, `subscribe()` / `subscribeSDK()` pub/sub, JSON snapshot persistence

**`packages/backend/src/routes/`:**
- Purpose: HTTP API surface — thin wrappers that delegate to `MissionManager`
- Contains: `missions.ts` exports a single Hono router factory `missionsRouter(missionManager)`

**`packages/backend/src/ws/`:**
- Purpose: WebSocket event routing — joins, live event push, replay on join
- Contains: `handler.ts` exports `setupWebSocket(io, missionManager)` — attaches all socket listeners

**`packages/frontend/src/app/`:**
- Purpose: Next.js App Router pages and layouts
- Contains: Root layout, main page (dual-mode: landing vs dashboard), auth routes
- Key files: `page.tsx` is the entire UI entry point — it conditionally renders landing or `<Dashboard>`

**`packages/frontend/src/hooks/`:**
- Purpose: Side-effect logic separated from rendering
- Contains: Three hooks — `use-socket.ts` (connection + hydration), `use-sdk-stream.ts` (feed derivation), `use-auth.ts` (Supabase auth)
- Note: `use-sdk-stream.ts` contains the most complex logic in the frontend

**`packages/frontend/src/store/`:**
- Purpose: Global client state
- Contains: Single Zustand store with mission state, SDK message buffer, timer controls

**`packages/frontend/src/lib/`:**
- Purpose: Utilities and external service clients
- Contains: `api.ts` (authenticated fetch), `utils.ts` (class names, formatting), `supabase/` (Supabase client factory)

## Key File Locations

**Entry Points:**
- `packages/backend/src/index.ts`: Backend server — Hono + Socket.IO startup
- `packages/frontend/src/app/page.tsx`: Frontend entry — landing + dashboard routing
- `packages/frontend/src/app/layout.tsx`: Next.js root layout

**Configuration:**
- `.env` / `.env.example`: Environment variables (monorepo root, loaded by backend)
- `packages/frontend/src/middleware.ts`: Next.js middleware (auth redirect)
- `tsconfig.base.json`: Shared TypeScript settings

**Core Logic:**
- `packages/agent-runtime/src/mission-engine.ts`: SDK `query()` wrapper and relay
- `packages/backend/src/services/mission-manager.ts`: Mission lifecycle, persistence, pub/sub
- `packages/frontend/src/hooks/use-sdk-stream.ts`: All SDK message interpretation logic
- `packages/shared/src/schemas/events.ts`: `SDKEnvelope` type (the relay contract)

**Auth:**
- `packages/backend/src/middleware/auth.ts`: HTTP route auth (Supabase JWT via `jose`)
- `packages/backend/src/ws/handler.ts`: WebSocket handshake auth
- `packages/frontend/src/middleware.ts`: Next.js auth redirect (Supabase SSR)
- `packages/frontend/src/lib/supabase/client.ts`: Browser Supabase client
- `packages/frontend/src/lib/supabase/server.ts`: SSR Supabase client

**UI Components:**
- `packages/frontend/src/components/dashboard.tsx`: Main dashboard shell (header, feed, workspace panel)
- `packages/frontend/src/components/sdk-activity-log.tsx`: Feed renderer (text, tool_call, result entries)
- `packages/frontend/src/components/sidebar.tsx`: Collapsible mission history sidebar
- `packages/frontend/src/components/workspace-inspector.tsx`: File browser (polls `GET /files` every 5s)

## Naming Conventions

**Files:**
- kebab-case for all source files: `mission-engine.ts`, `use-sdk-stream.ts`, `sdk-activity-log.tsx`
- Schema files are singular nouns: `mission.ts`, `events.ts`
- Hook files prefixed `use-`: `use-socket.ts`, `use-auth.ts`, `use-sdk-stream.ts`
- Component files match the exported component name in kebab-case: `dashboard.tsx` exports `Dashboard`

**Directories:**
- Singular for most: `middleware/`, `routes/`, `services/`, `ws/`
- Plural for collections in frontend: `components/`, `hooks/`, `schemas/`

**Exports:**
- Classes: PascalCase — `MissionEngine`, `MissionManager`
- Functions: camelCase — `buildProcessEnv`, `missionsRouter`, `setupWebSocket`, `authFetch`
- Zod schemas and their TypeScript types share the same name: `Mission` (both schema and type), `SDKEnvelope`
- Hooks: camelCase prefixed `use`: `useSDKStream`, `useSocket`, `useMissionStore`
- React components: PascalCase — `Dashboard`, `SDKActivityLog`, `Sidebar`

**IDs:**
- Mission IDs: `mission-${nanoid(10)}` — e.g. `mission-abc1234567`
- Event/message IDs: `nanoid()` or `msg-${nanoid(8)}`
- localStorage key: `stallion-mission-id`

## Where to Add New Code

**New REST endpoint:**
- Add to `packages/backend/src/routes/missions.ts` using `router.get()` / `router.post()`
- If the endpoint needs a new MissionManager method, add it to `packages/backend/src/services/mission-manager.ts`
- Add the corresponding frontend fetch call to `packages/frontend/src/lib/api.ts` or inline in the hook/component

**New WebSocket event (backend → frontend):**
- Emit in `packages/backend/src/ws/handler.ts`
- Handle in `packages/frontend/src/hooks/use-socket.ts` → update Zustand store

**New SDK message type to interpret:**
- Add shape interface in `packages/frontend/src/hooks/use-sdk-stream.ts` (see existing `SDKAssistantMsg`, `SDKResultMsg` patterns)
- Add case in `processEnvelope()` in the same file
- Add new `SDKFeedEntry` union member if a new feed entry kind is needed
- Add renderer in `packages/frontend/src/components/sdk-activity-log.tsx`

**New shared type:**
- Add Zod schema to `packages/shared/src/schemas/mission.ts` or `packages/shared/src/schemas/events.ts`
- Export from `packages/shared/src/index.ts`

**New UI component:**
- Create `packages/frontend/src/components/<component-name>.tsx`
- Follow the `"use client"` directive pattern for interactive components

**New React hook:**
- Create `packages/frontend/src/hooks/use-<name>.ts`
- Pure data derivation hooks (like `useSDKStream`) should use `useMemo`; side-effect hooks should use `useEffect`

## Special Directories

**`.planning/codebase/`:**
- Purpose: GSD planning documents (architecture, conventions, concerns)
- Generated: No (manually maintained)
- Committed: Yes

**`packages/frontend/.next/`:**
- Purpose: Next.js build output
- Generated: Yes
- Committed: No

**`packages/frontend/dist/`:**
- Purpose: Production build artifacts
- Generated: Yes
- Committed: No

**`~/.stallion/missions/`:**
- Purpose: Runtime mission persistence — `<id>.json` snapshot files and `<id>/` agent workspace directories
- Generated: Yes (at runtime by `MissionManager`)
- Committed: No (runtime data)

**`os.tmpdir()/stallion-missions/`:**
- Purpose: Default agent workspace root when `STALLION_WORKSPACE_ROOT` is not set
- Generated: Yes
- Committed: No

---

*Structure analysis: 2026-03-07*
