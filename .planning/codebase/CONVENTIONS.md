# Coding Conventions

**Analysis Date:** 2026-03-07

## Naming Patterns

**Files:**
- React components: PascalCase matching component name (`dashboard.tsx`, `sdk-activity-log.tsx`, `workspace-inspector.tsx`)
- Hooks: kebab-case with `use-` prefix (`use-socket.ts`, `use-sdk-stream.ts`, `use-auth.ts`)
- Services/utilities: kebab-case (`mission-manager.ts`, `mission-engine.ts`, `mission-env.ts`)
- Stores: kebab-case with `-store` suffix (`mission-store.ts`)
- Route handlers: kebab-case (`missions.ts`)
- Schemas: kebab-case matching domain entity (`mission.ts`, `events.ts`)

**Functions:**
- Regular functions: camelCase (`buildEnvConfig`, `getWorkspaceRoot`, `buildSdkEnv`, `formatDuration`)
- React components: PascalCase (`Dashboard`, `SDKActivityLog`, `ToolCallEntry`)
- React hooks: camelCase with `use` prefix (`useSocket`, `useSDKStream`, `useAuth`)
- Event handlers: camelCase with `handle` prefix (`handleJoin`, `handleLeave`, `handleSignOut`, `handleNewMission`)
- Setup functions: camelCase with `setup` prefix (`setupWebSocket`)

**Variables:**
- Standard variables: camelCase (`missionId`, `taskInput`, `envConfig`)
- Constants/lookup tables: SCREAMING_SNAKE_CASE for module-level (`STORAGE_KEY`, `SIDEBAR_KEY`, `BACKEND_URL`, `STATUS_BADGE`, `STATUS_COLOR`)
- Boolean state: camelCase adjective/past-participle (`loading`, `connected`, `resuming`, `sidebarOpen`)

**Types / Interfaces:**
- Zod schemas: PascalCase matching the TypeScript type they produce (`Mission`, `SessionEvent`, `ChatMessage`, `SDKEnvelope`)
- TypeScript types derived from Zod: co-declared with same name via `z.infer` (`export type Mission = z.infer<typeof Mission>`)
- Plain interfaces: PascalCase (`MissionData`, `MissionSnapshot`, `MissionStore`, `AuthPayload`, `ProcessState`)
- Discriminated union types: use `kind` or `type` string literal discriminant (`SDKFeedEntry`, `AnySDKMsg`)

**Classes:**
- PascalCase (`MissionManager`, `MissionEngine`)
- Private fields: camelCase with no underscore — access controlled via `private` keyword (`private missions`, `private envConfig`)

## Code Style

**Formatting:**
- No dedicated prettier config detected — relies on TypeScript strict mode and team consistency
- 2-space indentation throughout all packages
- Single quotes for strings (consistent across backend/runtime)
- Trailing commas in function parameters and object literals
- Semicolons throughout

**Linting:**
- No ESLint config detected at project level
- TypeScript strict mode enabled: `"strict": true` in `tsconfig.base.json`
- `noUncheckedIndexedAccess: true` — array index access yields `T | undefined`, requires null checks
- `noUnusedLocals: false` and `noUnusedParameters: false` — unused vars not enforced by tsc
- One deliberate `// eslint-disable-next-line` suppression seen in `packages/frontend/src/app/page.tsx` for `react-hooks/exhaustive-deps`

**TypeScript Strictness:**
- All packages inherit from `tsconfig.base.json`
- `isolatedModules: true` — no const enums, each file is self-contained
- `moduleResolution: "bundler"` — compatible with Vite/Next/tsx
- `declaration: true` and `declarationMap: true` — type output generated for cross-package imports

## Import Organization

**Order (observed pattern):**
1. Third-party SDK/framework imports (`import { query } from "@anthropic-ai/claude-agent-sdk"`)
2. Node built-ins with `node:` prefix (`import fs from "node:fs/promises"`, `import path from "node:path"`)
3. Monorepo workspace packages (`import type { SessionEvent } from "@stallion/shared"`)
4. Local relative imports (`import { MissionEngine } from "./mission-engine.js"`)
5. React components and hooks (`import { Dashboard } from "@/components/dashboard"`)

**Path Aliases:**
- Frontend uses `@/*` → `./src/*` (defined in `packages/frontend/tsconfig.json`)
- Backend/runtime use relative imports with `.js` extension (required for ESM)

**ESM Imports:**
- All packages are `"type": "module"` — use `.js` extension on relative imports even for `.ts` source files
  - Example: `import { MissionEngine } from "./mission-engine.js"`
- Dynamic imports used in frontend for lazy-loading Supabase client: `const { createClient } = await import("@/lib/supabase/client")`

## Error Handling

**Backend pattern — guard + return:**
```typescript
// Route handlers: check precondition, return early with error JSON
if (!data) throw new Error(`Mission ${id} not found`);

const result = checkOwnership(id, c.var.auth.userId);
if ("error" in result) return c.json({ error: result.error }, result.status);
```

**Backend pattern — try/catch with instanceof check:**
```typescript
try {
  await missionManager.startMission(id, parsed.data.prompt);
  return c.json({ mission });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  return c.json({ error: message }, 400);
}
```

**Agent runtime pattern — re-throw after lifecycle event:**
```typescript
catch (err) {
  const errorMsg = err instanceof Error ? err.message : String(err);
  onLifecycle({ ..., type: "session_error", summary: `Session failed: ${errorMsg}` });
  throw err;  // caller still sees the error
}
```

**Frontend pattern — silent swallow for non-critical fetches:**
```typescript
authFetch(`/api/missions/${missionId}/events`)
  .then(...)
  .catch(() => {});  // network errors don't crash the UI
```

**Validation pattern — Zod safeParse at API boundary:**
```typescript
const schema = z.object({ prompt: z.string().min(1) });
const parsed = schema.safeParse(body);
if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
```

**Env var validation — fail-fast on startup:**
```typescript
if (!foundryResource || !foundryApiKey) {
  throw new Error("Missing required env vars: ANTHROPIC_FOUNDRY_RESOURCE and ANTHROPIC_FOUNDRY_API_KEY");
}
```

## Logging

**Framework:** `console.log` / `console.error` (no structured logging library)

**Patterns:**
- Backend logs lifecycle events: connection, join, disconnect, initialization, save failures
- Format: template literals with relevant IDs — `console.log(\`Client ${socket.id} joined mission ${missionId}\`)`
- Errors logged with context: `console.error(\`Mission ${id} failed:\`, err)`
- No debug/trace levels — only `log` (info) and `error`
- Frontend logs only WebSocket errors: `console.error("[WebSocket] Error:", msg)`

## Comments

**Section Dividers:**
Box-comment dividers with Unicode dashes are used throughout to delimit logical sections within large files:
```typescript
// ─── Tool Call Entry (Claude Code style) ──────────────────────────────────────
// ─── Mission Status ──────────────────────────────────────────────────────────
// ─── Actions ────────────────────────────────────────────────────────────────
```

**When to Comment:**
- Non-obvious intent is always commented: `// Remove the nesting guard so Agent SDK can spawn Claude Code`
- Dev-bypass branches always have explanatory comments: `// Dev-mode auth bypass: skip JWT verification`
- Inline comments for subtle TypeScript behavior: `// Refresh session — IMPORTANT: use getUser() not getSession()`
- CRITICAL notes in MEMORY.md for architectural gotchas

**JSDoc/TSDoc:**
- Minimal use — only one JSDoc block found in `buildProcessEnv` in `packages/agent-runtime/src/mission-env.ts`
- Public interfaces/types are self-documenting via descriptive names and optional field comments

## Function Design

**Size:** Functions are kept small and focused. Route handlers delegate to service methods. Long business logic (>50 lines) is in service classes.

**Parameters:** Prefer interfaces/typed objects for config parameters (`MissionEnvConfig`, `MissionData`). Callbacks typed explicitly as named function types.

**Return Values:**
- Functions return typed values; no `any` visible in application code
- Async functions return `Promise<void>` when side-effect-only, `Promise<T>` when returning data
- Fallback null pattern: functions return `T | null` when not-found is valid (`getMission`, `readWorkspaceFile`)

## Module Design

**Exports:**
- Named exports throughout — no default exports except Next.js pages/layouts (required by framework)
- Each module exports its public API explicitly
- Barrel files: `packages/shared/src/index.ts` and `packages/agent-runtime/src/index.ts` are clean re-export barrels

**Class Pattern:**
- Private constructors with static `create()` factory used when async initialization is required:
  ```typescript
  private constructor() { ... }
  static async create(): Promise<MissionManager> {
    const mm = new MissionManager();
    await fs.mkdir(mm.dataDir, { recursive: true });
    return mm;
  }
  ```

**Zod Schema Pattern:**
- Schema and derived type share the same name — Zod validator is the source of truth:
  ```typescript
  export const Mission = z.object({ ... });
  export type Mission = z.infer<typeof Mission>;
  ```

**React Component Pattern:**
- Named function exports (not arrow functions) for components: `export function Dashboard(...)`
- Sub-components within a file are defined as regular functions above the main export, named descriptively (`ToolCallEntry`, `TextEntry`, `ResultEntry`)
- Props typed via inline interfaces or destructured type annotations
- `"use client"` directive always on its own line at top of client components

**State Management Pattern (Frontend):**
- Zustand store with flat slice pattern in `packages/frontend/src/store/mission-store.ts`
- Store actions are co-located with state in `create()` call
- Selectors used at component level: `useMissionStore((s) => s.mission)` — no full store subscriptions

---

*Convention analysis: 2026-03-07*
