# Technology Stack

**Analysis Date:** 2026-03-07

## Languages

**Primary:**
- TypeScript 5.7 - All packages (`packages/shared`, `packages/agent-runtime`, `packages/backend`, `packages/frontend`)

**Secondary:**
- CSS (Tailwind utility classes) - Frontend styling

## Runtime

**Environment:**
- Node.js v24.10.0

**Package Manager:**
- npm 11.6.1
- Lockfile: `package-lock.json` present (root)
- Workspaces: npm workspaces (5 packages defined in root `package.json`)

## Frameworks

**Backend API:**
- Hono 4.12.3 - HTTP router (`packages/backend/src/index.ts`)
- `@hono/node-server` 1.13.0 - Node.js HTTP adapter

**Frontend:**
- Next.js 15.5.12 - App Router, SSR/SSG (`packages/frontend`)
- React 19.2.4 - UI library
- Tailwind CSS 4.2.1 - Utility CSS (via `@tailwindcss/postcss`)

**Agent Orchestration:**
- `@anthropic-ai/claude-agent-sdk` 0.2.63 - Claude Code subprocess orchestration (`packages/agent-runtime/src/mission-engine.ts`)

**Testing:**
- Vitest 4.0.18 - Test runner (all packages with `vitest run`)

**Build/Dev:**
- tsx 4.21.0 - TypeScript execution for backend and agent-runtime (`dev` and `start` scripts)
- Next.js Turbopack - Frontend dev server (`next dev --turbopack`)

## Key Dependencies

**Critical:**
- `@anthropic-ai/claude-agent-sdk` 0.2.63 - Core agent execution engine; wraps Claude Code CLI. Used in `packages/agent-runtime/src/mission-engine.ts`
- `zod` 4.3.6 - Schema validation and type inference across all packages (Zod v4 required by Agent SDK)
- `socket.io` 4.8.3 / `socket.io-client` 4.8.3 - Real-time bidirectional communication between backend and frontend
- `@supabase/supabase-js` 2.98.0 + `@supabase/ssr` 0.9.0 - Auth provider integration (frontend + backend JWT verification)

**Infrastructure:**
- `jose` 6.1.3 - JWT verification for Supabase tokens in backend middleware (`packages/backend/src/middleware/auth.ts`, `packages/backend/src/ws/handler.ts`)
- `dockerode` 4.0.9 - Docker container management (agent VM feature, `packages/backend`)
- `dotenv` 17.3.1 - Environment loading in backend (`packages/backend/src/index.ts`)
- `nanoid` 5.1.6 - ID generation for missions and events

**Frontend UI:**
- `zustand` 5.0.11 - Client state management (`packages/frontend/src/store/mission-store.ts`)
- `@xyflow/react` 12.10.1 - Workflow graph visualization (`packages/frontend/src/components/`)
- `lucide-react` 0.468.0 - Icon library
- `react-markdown` 10.1.0 + `remark-gfm` 4.0.1 - Markdown rendering
- `tailwind-merge` 2.6.1 - Conditional class merging
- `clsx` 2.1.1 - Class name utility

## Configuration

**TypeScript:**
- Base config: `tsconfig.base.json` (root) — target ES2022, strict mode, `noUncheckedIndexedAccess`
- Each package extends base; frontend adds DOM lib, JSX preserve, path alias `@/*` → `./src/*`
- Module system: ESNext with bundler resolution; all packages use `"type": "module"`

**Environment:**
- Loaded via `dotenv` at backend startup from monorepo root `.env`
- Frontend uses `NEXT_PUBLIC_*` prefix for browser-exposed vars
- Dev auth bypass: `DEV_AUTH_BYPASS=true` / `NEXT_PUBLIC_DEV_AUTH_BYPASS=true` skips Supabase JWT verification
- Key vars required: `ANTHROPIC_FOUNDRY_RESOURCE`, `ANTHROPIC_FOUNDRY_API_KEY`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Build:**
- Frontend build: `npm -w @stallion/frontend run build` (Next.js build)
- Shared package transpiled into frontend via `transpilePackages: ["@stallion/shared"]` in `packages/frontend/next.config.ts`
- Backend/agent-runtime run directly via `tsx` (no compile step)

## Platform Requirements

**Development:**
- Node.js v24.10.0
- npm (no Bun)
- `.env` at monorepo root with Azure Foundry and Supabase credentials
- Backend on port 4000, frontend on port 3000

**Production:**
- Backend: Node.js process (no containerization detected in main path)
- Frontend: Next.js build output (deployable to Vercel, Node.js server, etc.)
- Data dir: `~/.stallion/missions/` (backend persists mission state to JSON files)
- Workspace dir: `os.tmpdir()/stallion-missions/` or `STALLION_WORKSPACE_ROOT`

---

*Stack analysis: 2026-03-07*
