# Codebase Concerns

**Analysis Date:** 2026-03-07

## Tech Debt

**ARCHITECTURE.md describes a codebase that no longer exists:**
- Issue: `ARCHITECTURE.md` and `PROMPTS.md` document a three-phase explore/plan/approve flow with `MissionPlanner`, `Aria`, phase-based UI, and routes like `/explore`, `/chat`, `/approve`. None of this code exists. The actual implementation is a single-phase direct-execute model.
- Files: `/Users/prasad/projects/aise-hi/stallion/ARCHITECTURE.md`, `/Users/prasad/projects/aise-hi/stallion/PROMPTS.md`
- Impact: Severely misleading for any developer onboarding or AI agent using these docs for context. Plan-phase tools that load ARCHITECTURE.md will produce incorrect plans.
- Fix approach: Rewrite ARCHITECTURE.md and PROMPTS.md to reflect the actual codebase — `MissionEngine` wraps a single `query()` call, there is no planner or explore step.

**`dockerode` is an unused dependency:**
- Issue: `@stallion/backend/package.json` lists `dockerode` and `@types/dockerode` as dependencies, but no source file in `packages/backend/src/` imports or references Docker at all.
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/backend/package.json`
- Impact: Unnecessary dependency weight, potential supply chain risk, confusion for future developers.
- Fix approach: Remove `dockerode` and `@types/dockerode` from backend `package.json`.

**`buildSdkEnv` is exported but only used internally:**
- Issue: `buildSdkEnv` is exported from `@stallion/agent-runtime` but is only called inside `buildProcessEnv` in the same file. No external consumer uses it.
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/agent-runtime/src/mission-env.ts`, `/Users/prasad/projects/aise-hi/stallion/packages/agent-runtime/src/index.ts`
- Impact: Leaks a low-level implementation detail as public API surface; creates confusion about which function callers should use.
- Fix approach: Remove the export from `index.ts`; keep `buildSdkEnv` as an unexported helper.

**`@xyflow/react` is imported but the workflow graph component referenced in memory was replaced:**
- Issue: `packages/frontend/package.json` depends on `@xyflow/react ^12.0.0`, but searching the source reveals no import of `@xyflow/react` in the current component files. The `workflow-graph.tsx` component referenced in MEMORY.md does not exist.
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/frontend/package.json`
- Impact: Dead dependency adding bundle weight.
- Fix approach: Remove `@xyflow/react` if not used; or restore the intended graph component.

**`noUnusedLocals` and `noUnusedParameters` are disabled:**
- Issue: `tsconfig.base.json` explicitly sets `noUnusedLocals: false` and `noUnusedParameters: false`, allowing dead code and unused imports to silently accumulate.
- Files: `/Users/prasad/projects/aise-hi/stallion/tsconfig.base.json`
- Impact: No compile-time signal when variables/imports become stale, leading to accumulation of dead code over time.
- Fix approach: Enable both flags; fix resulting errors (or use `_` prefix for intentionally unused params).

**`process.env` spread propagates undefined values as "undefined" strings:**
- Issue: In `buildProcessEnv`, `const base = { ...process.env } as Record<string, string>` spreads the entire parent process environment including optional `undefined` values, then casts to `Record<string, string>`. This means `undefined` env vars become the string `"undefined"` when serialized.
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/agent-runtime/src/mission-env.ts` (line 42)
- Impact: Agent subprocess receives polluted env; subtle bugs if any tool checks for var existence by value.
- Fix approach: Filter out undefined values before spreading: `Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined)) as Record<string, string>`.

---

## Security Considerations

**Hardcoded dev auth bypass accessible via environment variable:**
- Risk: `DEV_AUTH_BYPASS=true` completely disables JWT verification on all API routes and WebSocket connections. If accidentally set in staging/prod, all missions are accessible to any unauthenticated caller.
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/backend/src/middleware/auth.ts` (lines 35–41), `/Users/prasad/projects/aise-hi/stallion/packages/backend/src/ws/handler.ts` (lines 36–38), `/Users/prasad/projects/aise-hi/stallion/packages/frontend/src/middleware.ts` (line 6)
- Current mitigation: None — purely convention-based (only set locally).
- Recommendations: Add a compile-time or startup assertion that `DEV_AUTH_BYPASS` cannot be set when `NODE_ENV=production`. Log a loud warning on startup when bypass is active.

**Agent runs with `bypassPermissions: true` and `allowDangerouslySkipPermissions: true`:**
- Risk: The Claude Agent SDK is explicitly configured to skip all permission prompts and bypass tool sandboxing. Any prompt injected into user input could cause the agent to run arbitrary shell commands on the host machine.
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/agent-runtime/src/mission-engine.ts` (lines 39–40)
- Current mitigation: Each mission gets an isolated workspace directory; file operations are constrained to `cwd: workspace`.
- Recommendations: Validate/sanitize user prompts before passing to the SDK. Consider running agents inside a container or VM for production use. This is the highest-severity security concern in the codebase.

**Path traversal protection uses `startsWith` — symlink-unsafe:**
- Risk: `listWorkspaceFiles` and `readWorkspaceFile` in `MissionManager` check `target.startsWith(d.workspace)` to prevent traversal. However, if the workspace path contains a symlink (e.g., macOS `/var` → `/private/var`), a resolved target path may not match the non-resolved workspace prefix.
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/backend/src/services/mission-manager.ts` (lines 196, 203)
- Current mitigation: `initWorkspace` uses `fs.realpath()` to resolve the workspace path, which largely mitigates this. However, the check is still `startsWith` not a proper path separator boundary check (e.g., `/foo` would match `/foobar`).
- Recommendations: Use `target.startsWith(d.workspace + path.sep) || target === d.workspace` to prevent false-positive prefix matches on adjacent directories.

**CORS allows all local dev origins with no production config:**
- Risk: `backend/src/index.ts` hardcodes CORS origins as `["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"]`. In production, these origins would be incorrect or overly permissive.
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/backend/src/index.ts` (lines 22–27, 50–52)
- Current mitigation: None for production.
- Recommendations: Read allowed origins from an environment variable (e.g., `CORS_ORIGINS`) and fall back to localhost only in development.

**Auth callback does not validate the `origin` parameter:**
- Risk: The Supabase OAuth callback in `route.ts` reads `origin` directly from `new URL(request.url)`. In a reverse-proxy setup, this could be spoofed via `Host` header manipulation.
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/frontend/src/app/auth/callback/route.ts` (line 5)
- Current mitigation: Supabase validates the redirect URL against the configured allowlist.
- Recommendations: Pin the redirect origin to an env var (`NEXT_PUBLIC_SITE_URL`) rather than reflecting the request origin.

**Login form silently attempts sign-up on failed login:**
- Risk: `LoginButton.tsx` attempts `signInWithPassword`, and if it fails with `"Invalid login"`, automatically tries `signUp`. This could allow account enumeration or cause surprise account creation.
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/frontend/src/components/login-button.tsx` (lines 38–63)
- Current mitigation: Supabase enforces email confirmation in most configurations.
- Recommendations: Separate sign-in and sign-up into explicit user flows. Do not silently escalate to account creation.

---

## Performance Bottlenecks

**`useSDKStream` replays all messages on every render:**
- Problem: The hook in `use-sdk-stream.ts` iterates over all `sdkMessages` in a `useMemo` on every change to the array. For long missions with hundreds of tool calls, this is an O(n) full replay on every new message.
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/frontend/src/hooks/use-sdk-stream.ts` (lines 160–179)
- Cause: The entire feed is recomputed from scratch rather than appending incrementally.
- Improvement path: Maintain a ref to the last-processed index and only process new envelopes since the last render; or use a reducer pattern with Zustand.

**Workspace file polling at 5-second intervals:**
- Problem: `WorkspaceInspector` polls `GET /api/missions/:id/files` every 5 seconds unconditionally while the component is mounted, even when the mission is completed.
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/frontend/src/components/workspace-inspector.tsx` (lines 21–24)
- Cause: No check against mission status before scheduling the interval.
- Improvement path: Stop polling when `mission.status` is `completed` or `failed`. Use WebSocket `mission_state` events to trigger re-fetches instead.

**Mission list polls REST endpoint every 15 seconds:**
- Problem: `page.tsx` fetches `GET /api/missions` every 15 seconds via `setInterval`. This is unnecessary since mission state changes are already broadcast via WebSocket.
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/frontend/src/app/page.tsx` (lines 94–96)
- Cause: The WebSocket subscription doesn't notify the parent page when new missions appear; polling is the fallback.
- Improvement path: Emit a WebSocket event when a new mission is created; update the sidebar reactively.

**All missions loaded into memory on server startup:**
- Problem: `MissionManager.loadMissions()` loads every mission snapshot from disk into the in-memory `Map` on startup. With many completed missions, this could be a large allocation.
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/backend/src/services/mission-manager.ts` (lines 110–134)
- Cause: No lazy loading or pagination of mission history.
- Improvement path: Load only recent/active missions eagerly; load historical missions on demand via `getMission()`.

**Entire SDK message history sent in `sdk_messages_batch` on every WebSocket join:**
- Problem: When a client joins a mission, the backend emits the full `SDKEnvelope[]` array in a single Socket.IO message. For missions with thousands of messages, this is a large payload.
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/backend/src/ws/handler.ts` (lines 79–81)
- Cause: No pagination or chunked replay.
- Improvement path: Send messages in chunks (e.g., 100 at a time) or use a REST cursor-based endpoint for historical replay.

---

## Fragile Areas

**`MissionManager` is a singleton with no per-request isolation:**
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/backend/src/services/mission-manager.ts`
- Why fragile: All missions share a single `Map` and listener sets. Concurrent high-traffic scenarios could cause listener leaks if `unsubscribe` callbacks are dropped (e.g., if a WebSocket disconnects without triggering cleanup).
- Safe modification: Always call the unsubscribe function returned by `subscribe()` and `subscribeSDK()` in the `disconnect` handler. Currently done correctly in `ws/handler.ts`, but any future subscriber must follow this pattern.
- Test coverage: No tests exist; all behavior is implicitly tested through manual use.

**`JSON.parse(raw) as MissionSnapshot` with no schema validation:**
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/backend/src/services/mission-manager.ts` (line 117)
- Why fragile: Snapshots loaded from disk are cast directly to `MissionSnapshot` without Zod validation. A corrupt or schema-changed JSON file will silently produce malformed in-memory state rather than a clear error.
- Safe modification: Parse with `MissionSnapshot` Zod schema (which could be defined in `@stallion/shared`) and reject invalid files.
- Test coverage: None.

**`eslint-disable-next-line react-hooks/exhaustive-deps` on auto-resume effect:**
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/frontend/src/app/page.tsx` (line 131)
- Why fragile: The `useEffect` that auto-resumes a mission on mount omits `enterMission` from its deps array. If `enterMission` changes identity (e.g., after a refactor to `useCallback`), the stale closure will silently call the wrong version.
- Safe modification: Wrap `enterMission` in `useCallback` with proper deps, then include it in the effect deps array.
- Test coverage: None.

**`SDKEnvelope.msg` is typed as `z.unknown()`:**
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/shared/src/schemas/events.ts` (line 42)
- Why fragile: The `msg` field is entirely untyped in the shared schema, so the frontend (`use-sdk-stream.ts`) must define its own local type hierarchy and cast manually. Any change to the SDK message format will silently break rendering with no type error.
- Safe modification: Define a discriminated union in `@stallion/shared` covering all known SDK message types (`assistant`, `result`, `tool_progress`, `tool_use_summary`) and use it for `msg`.
- Test coverage: None.

**Workspace path stored as absolute path in snapshot:**
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/backend/src/services/mission-manager.ts` (line 127)
- Why fragile: `data.workspace` (e.g., `/private/var/folders/.../mission-abc`) is saved to disk. If the server restarts on a different machine or OS version, or if `STALLION_WORKSPACE_ROOT` changes, the stored path is stale and file operations will silently fail.
- Safe modification: Store workspace as a relative path from the workspace root, and reconstruct the absolute path on load using the current config.
- Test coverage: None.

---

## Missing Critical Features

**No ability to stop/cancel a running mission:**
- Problem: Once started, a mission runs to completion with no cancel mechanism exposed via API or UI. The `MissionEngine.abort()` method exists but is never called.
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/agent-runtime/src/mission-engine.ts` (lines 85–87), `/Users/prasad/projects/aise-hi/stallion/packages/backend/src/routes/missions.ts`
- Blocks: Users cannot stop runaway or incorrect missions without restarting the backend.

**No input validation on user prompts:**
- Problem: The `POST /api/missions/:id/start` route accepts any non-empty string as a prompt with no length limit, content filtering, or injection mitigation.
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/backend/src/routes/missions.ts` (lines 44–47)
- Blocks: Defense-in-depth against prompt injection into the agent; no protection against excessively long prompts that could inflate costs.

**No mission deletion:**
- Problem: There is no `DELETE /api/missions/:id` endpoint or UI control to remove missions. Missions accumulate indefinitely in `~/.stallion/missions/` and in the sidebar.
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/backend/src/routes/missions.ts`, `/Users/prasad/projects/aise-hi/stallion/packages/frontend/src/components/sidebar.tsx`
- Blocks: Clean-up of old missions; disk space reclamation.

---

## Test Coverage Gaps

**No tests exist anywhere in the codebase:**
- What's not tested: All business logic — `MissionManager`, `MissionEngine`, `MissionEnv`, frontend hooks, WebSocket handler, auth middleware.
- Files: All `.ts` and `.tsx` source files; `vitest` is configured in `package.json` for both `@stallion/backend` and `@stallion/agent-runtime` but no test files exist.
- Risk: Any refactor or behavior change in `MissionManager` (mission lifecycle, persistence, path traversal guards) can break silently.
- Priority: High

**Path traversal guards have no test coverage:**
- What's not tested: The `startsWith` check in `listWorkspaceFiles` and `readWorkspaceFile`.
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/backend/src/services/mission-manager.ts` (lines 195–204)
- Risk: A regression here is a security vulnerability. No automated signal would catch it.
- Priority: High

**Auth middleware bypass logic has no test coverage:**
- What's not tested: The `DEV_AUTH_BYPASS` branch and JWT verification in `authMiddleware`.
- Files: `/Users/prasad/projects/aise-hi/stallion/packages/backend/src/middleware/auth.ts`
- Risk: A mistake in the bypass condition (e.g., wrong env var name) could silently fail open in production.
- Priority: High

---

*Concerns audit: 2026-03-07*
