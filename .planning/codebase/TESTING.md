# Testing Patterns

**Analysis Date:** 2026-03-07

## Test Framework

**Runner:**
- Vitest (declared in devDependencies of `packages/backend/package.json`, `packages/shared/package.json`, `packages/agent-runtime/package.json`)
- Version: `^4.0.18`
- Config: No `vitest.config.*` file found — Vitest runs with defaults

**Assertion Library:**
- Vitest built-in assertions (expect, describe, it/test)

**Run Commands:**
```bash
npm -w @stallion/backend test       # Run backend tests
npm -w @stallion/shared test        # Run shared tests
npm -w @stallion/agent-runtime test # Run agent-runtime tests
npm run typecheck                    # Type-check all packages (no test equivalent)
```

Individual package scripts (from `package.json` `"test"` scripts):
```bash
vitest run   # in @stallion/backend, @stallion/shared, @stallion/agent-runtime
```

Note: `@stallion/frontend` has NO test script — frontend is untested.

## Test File Organization

**Location:**
- No test files exist anywhere in the codebase. The `vitest run` scripts are declared but no test files have been written.
- Vitest is installed as a devDependency in three packages but zero `.test.ts` or `.spec.ts` files exist.

**Naming (intended pattern based on Vitest defaults):**
- `*.test.ts` or `*.spec.ts` co-located next to source files, OR in a `__tests__/` subdirectory

**Structure (expected by Vitest conventions):**
```
packages/
  backend/src/
    services/mission-manager.test.ts   # (not yet created)
    routes/missions.test.ts            # (not yet created)
  shared/src/
    schemas/mission.test.ts            # (not yet created)
  agent-runtime/src/
    mission-env.test.ts                # (not yet created)
```

## Test Structure

**Suite Organization (Vitest standard):**
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("MissionManager", () => {
  beforeEach(() => {
    // reset state
  });

  it("should create a mission with idle status", () => {
    // ...
    expect(mission.status).toBe("idle");
  });
});
```

**Patterns:**
- No existing test code to reference — infer from Vitest conventions and codebase structure
- Setup: `beforeEach` / `beforeAll` for shared test state
- Teardown: `afterEach` / `afterAll` for cleanup
- Assertions: `expect(value).toBe(expected)`, `expect(fn).toThrow()`

## Mocking

**Framework:** Vitest `vi` (built-in)

**What would need mocking (given the codebase):**
- `node:fs/promises` — for `MissionManager` persistence tests (`fs.mkdir`, `fs.readFile`, `fs.writeFile`)
- `@anthropic-ai/claude-agent-sdk` `query()` — for `MissionEngine` execution tests
- `nanoid` — for deterministic ID generation in tests
- Supabase clients in frontend hooks

**Expected Vitest mock pattern:**
```typescript
import { vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue("{}"),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
}));
```

**What NOT to Mock:**
- Zod schema validation — test real schemas with real data
- Pure utility functions (`buildSdkEnv`, `getWorkspaceRoot`, `formatDuration`, `cn`) — test directly

## Fixtures and Factories

**Test Data:**
No factory helpers or fixtures exist. Would need to be created. Recommended pattern for this codebase:

```typescript
// Factory for MissionEnvConfig
function makeMissionEnvConfig(overrides = {}): MissionEnvConfig {
  return {
    foundryResource: "test-resource",
    foundryApiKey: "test-key",
    ...overrides,
  };
}

// Factory for SessionEvent
function makeSessionEvent(overrides = {}): SessionEvent {
  return {
    id: "test-id",
    sessionId: "test-session",
    type: "session_started",
    summary: "Test event",
    timestamp: Date.now(),
    ...overrides,
  };
}
```

**Location:**
- No fixtures directory exists. Recommended: `packages/{package}/src/__tests__/fixtures.ts`

## Coverage

**Requirements:** None enforced — no coverage thresholds configured

**View Coverage:**
```bash
vitest run --coverage   # (would require @vitest/coverage-v8 or similar to be installed)
```

Note: Coverage reporter not installed in any package's devDependencies.

## Test Types

**Unit Tests:**
- Framework declared (Vitest) but no tests written
- Intended scope: individual functions and class methods in isolation
- Best candidates: `buildSdkEnv`, `buildProcessEnv`, `getWorkspaceRoot` in `packages/agent-runtime/src/mission-env.ts`; Zod schema validation in `packages/shared/src/schemas/`; `processEnvelope` logic in `packages/frontend/src/hooks/use-sdk-stream.ts`

**Integration Tests:**
- Not written
- Would test `MissionManager` with real filesystem or mocked fs operations

**E2E Tests:**
- Not used — no Playwright, Cypress, or similar tooling installed

## Highest Value Test Targets (currently untested)

**`packages/shared/src/schemas/`**
- Files: `packages/shared/src/schemas/mission.ts`, `packages/shared/src/schemas/events.ts`
- Zod schema validation behavior — test valid/invalid shapes, type coercion

**`packages/agent-runtime/src/mission-env.ts`**
- `buildSdkEnv()` — pure function, no side effects, easy to unit test
- `buildProcessEnv()` — verify env var overlay and CLAUDECODE deletion
- `getWorkspaceRoot()` — verify default and override behavior

**`packages/backend/src/services/mission-manager.ts`**
- `MissionManager.createMission()` — ID format, initial status
- `MissionManager.startMission()` — status transitions, error propagation
- `loadMissions()` — running→failed recovery on startup
- `checkOwnership()` in routes — access control logic

**`packages/frontend/src/hooks/use-sdk-stream.ts`**
- `processEnvelope()` — pure processing function, highly testable
- `toolDescription()` / `formatToolInput()` — pure string formatters

---

*Testing analysis: 2026-03-07*
