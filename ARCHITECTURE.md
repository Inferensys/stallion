# Stallion Architecture

Complete data flow from first user message to mission completion.

## System Overview

```
User prompt → Explore (Aria researches) → Plan (structured MissionPlan) → Approve → Execute (parallel agents) → Deliver
```

Four packages, all TypeScript:

| Package | Role |
|---------|------|
| `@stallion/shared` | Zod schemas — missions, agents, events, SDK envelope |
| `@stallion/agent-runtime` | MissionPlanner + MissionEngine (thin SDK relay) |
| `@stallion/backend` | Hono API + Socket.IO, MissionManager service |
| `@stallion/frontend` | Next.js 15 + Tailwind + Zustand + React Flow |

Built on the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/typescript). Three separate `query()` calls power the three phases: explore, plan, execute.

---

## Phase 1: Landing — User Types a Prompt

**Frontend** (`page.tsx`)

User lands at `/`. The `Home` component renders in `idle` phase — centered textarea with example cards. User types a prompt and hits Enter, calling `startExploration()`:

1. `POST /api/missions` — creates a mission shell (status: `exploring`)
2. `setPhase("exploring")` — switches to the chat UI
3. `setSending(true)` — shows the streaming bubble
4. `clearExplorationStream()` — resets `explorationFeed: []`
5. `POST /api/missions/:id/explore` — fires the exploration query over HTTP

At step 2, `useSocket(missionId)` activates — connects Socket.IO to port 4000 and joins the mission room.

---

## Phase 2: Exploration — Aria Researches

### Backend

**Route** (`missions.ts`) — `POST /:id/explore` calls `missionManager.exploreMission()`.

**MissionManager** (`mission-manager.ts`) does three things:
1. Saves user message to `data.chat[]`
2. Creates two streaming callbacks:
   - `streamActivity(activity)` → emits `exploration_activity` via WebSocket
   - `streamToken(chunk)` → emits `exploration_token` via WebSocket
3. Calls `data.planner.explore(userInput, chat, streamActivity, streamToken)`

**MissionPlanner.explore()** (`mission-planner.ts`):
1. Builds conversation history into a single prompt string
2. Creates SDK options:
   - `systemPrompt` = the Aria exploration prompt (research-only, never writes code)
   - `tools` = `["Read", "Glob", "Grep", "WebSearch", "WebFetch"]` — read-only
   - `includePartialMessages: true` — enables token streaming
   - `maxTurns: 5`
3. Calls `query({ prompt, options })` — spawns a Claude Code CLI subprocess
4. Iterates the async generator:
   - `stream_event` with `text_delta` → calls `onToken(chunk)` — character-by-character streaming
   - `assistant` with `tool_use` block → calls `onActivity()` — e.g. `Searching for "finance tracker patterns"`
   - `tool_use_summary` → calls `onActivity()` with the SDK's summary
   - `result` → captures final text
5. Parses `[READINESS: 7/10]` from the end of the response, strips it
6. Returns `{ text, readiness }`

### WebSocket Streaming (concurrent with HTTP)

While `explore()` runs, the callbacks fire events through `notifyListeners()`. These go through the WebSocket handler to the connected frontend:

```
exploration_token    → "Let me "
exploration_token    → "research "
exploration_activity → 'Searching for "finance tracker patterns"'
exploration_token    → "Good findings. "
...
exploration_done     → { readiness: 7 }
```

### Frontend — Building the Interleaved Feed

The socket hook (`use-socket.ts`) pushes events into the Zustand store:

- `exploration_token` → `appendExplorationToken(chunk)` — if last entry in `explorationFeed[]` is `type: "text"`, appends to it. Otherwise creates a new text entry.
- `exploration_activity` → `addExplorationActivity()` — pushes a `type: "tool"` entry. The next token naturally starts a fresh text entry.
- `exploration_done` → `setReadinessScore(readiness)`

The single `explorationFeed: ExplorationFeedEntry[]` array naturally interleaves text and tool entries because WebSocket events arrive in chronological order.

### Frontend — Rendering

The streaming bubble in `page.tsx` renders `explorationFeed.map()`:
- `type: "text"` → `<Markdown content={entry.content} />`
- `type: "tool"` → `● Searching for "finance tracker patterns"`

If the last entry is a tool, bouncing dots show below it (waiting for next text).

### Finalization

When `POST /explore` returns its HTTP response (authoritative final text):

1. Snapshots `explorationFeed` from the store before clearing
2. Creates an `ExplorationMessage` with `content` (clean text) and `feed` (the snapshot)
3. Pushes to `messages[]` local state
4. `clearExplorationStream()` — resets for next turn
5. `setSending(false)` — hides streaming bubble

The finalized message renders the `feed` array. If `feed` is missing (restored sessions from disk), falls back to plain Markdown of `content`.

---

## Phase 3: Iteration (Optional)

User sends follow-up messages. Same flow: `sendExplorationMessage()` → `POST /explore` → streaming → finalize. The readiness bar updates with each response. User can iterate until satisfied.

---

## Phase 4: Planning — User Clicks "Plan Mission"

### Frontend

`handleBeginPlanning()` calls `POST /api/missions/:id/begin-planning`.

### Backend

**MissionManager.beginPlanning()**:
1. Sets `status = "planning"`
2. Concatenates all chat history: `"User: Build a finance...\n\nAria: Here's what I found..."`
3. Calls `data.planner.planFromContext(explorationContext)`

**MissionPlanner.planFromContext()**:
1. Wraps context in a directive: `"Based on this conversation, output the mission plan as JSON directly"`
2. Uses the **planning prompt** — instructs Claude to output structured JSON with agents, tasks, dependencies
3. Calls `query()` with `maxTurns: 5`
4. Collects all text from the response
5. `extractJson(resultText)` — tries code block regex first, then raw JSON extraction from the text
6. `hydratePlan(json)` — normalizes: generates IDs, sets all task statuses to `"pending"`, fills defaults

Returns a `MissionPlan`:
```typescript
{
  id: "abc123",
  title: "Personal Finance Tracker",
  objective: "Build a...",
  agents: [
    { name: "api-designer", displayName: "Sarah", specialization: "API design",
      prompt: "You are Sarah...", tools: ["Read","Write","Edit","Bash"], model: "sonnet" },
    { name: "frontend-dev", displayName: "Alex", specialization: "React UI",
      prompt: "You are Alex...", tools: ["Read","Write","Edit","Bash"], model: "sonnet" },
  ],
  tasks: [
    { id: "t1", title: "Design data models", assignee: "api-designer", dependencies: [], status: "pending" },
    { id: "t2", title: "Build React UI", assignee: "frontend-dev", dependencies: ["t1"], status: "pending" },
    { id: "t3", title: "Setup project", assignee: "frontend-dev", dependencies: [], status: "pending" },
  ],
  estimatedComplexity: "moderate",
  createdAt: 1709...
}
```

**Back in MissionManager:**
1. Stores `data.plan = plan`, sets `status = "review"`
2. Creates agent states from plan (all `status: "idle"`)
3. Emits `mission_planned` event via WebSocket
4. Returns the updated Mission

**Frontend** receives the response and calls `enterMission(missionId)` which resets the store and renders the `<Dashboard>` component.

---

## Phase 5: Dashboard — Review & Approve

Dashboard mounts. `useSocket(missionId)` connects and receives:
- `mission_state` — full Mission object with plan, agents, status
- `events_batch` — any historical events
- `sdk_messages_batch` — empty (no execution yet)

REST hydration also fires in parallel (`GET /api/missions/:id`, `/events`, `/chat`, `/sdk-messages`).

Dashboard layout:
- **Chat panel** (left) — mission chat context
- **Progress panel** (top center) — agents list (all idle), task list (all pending), workflow graph (React Flow)
- **Terminal tab** (bottom center) — "Waiting for mission execution..."
- **Workspace inspector** (right) — empty

User clicks "Approve" → `POST /api/missions/:id/approve`.

---

## Phase 6: Execution — The SDK Relay

### Backend

**MissionManager.approvePlan()**:
- Sets `status = "launching"`, `startedAt = Date.now()`
- Routes to `approvePlanLocal()`

**approvePlanLocal()**:
1. Creates `new MissionEngine(envConfig)`
2. `engine.initWorkspace(id)` — creates `~/.stallion/missions/<id>/` directory
3. Sets `status = "running"`, saves to disk
4. Fires `engine.executePlan()` in background (non-blocking)

### MissionEngine.executePlan()

1. Builds `AgentDefinition` objects from the plan:
   ```typescript
   agents["api-designer"] = {
     description: "Designs RESTful APIs...",
     prompt: "You are Sarah, an API design specialist...",
     tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
     model: "sonnet"
   }
   ```

2. Builds the **orchestrator prompt** containing:
   - Mission title and objective
   - Agent list with `subagent_type` names
   - Task list with dependencies
   - Parallel wave analysis (topological sort): `Wave 1 (PARALLEL): t1, t3 | Wave 2: t2`
   - Instructions: "dispatch ALL independent tasks in PARALLEL"

3. Creates SDK options:
   - `systemPrompt` = orchestrator prompt
   - `agents` = the AgentDefinition map
   - `cwd` = workspace directory
   - `permissionMode: "bypassPermissions"`

4. Emits `session_started` lifecycle event

5. **The relay loop** — the core of the thin relay pattern:
   ```typescript
   const queryResult = query({ prompt, options });
   for await (const msg of queryResult) {
     onSDKMessage({
       id: nanoid(),
       sessionId: plan.id,
       timestamp: Date.now(),
       msg,  // raw SDKMessage — no translation
     });
   }
   ```
   Every SDK message is wrapped in an `SDKEnvelope` and passed through with zero interpretation.

6. After the loop ends, emits `session_completed` lifecycle event.

### What the SDK Generates

The Claude orchestrator dispatches subagents via the `Agent` tool:

```
assistant: [text: "Dispatching Wave 1...",
            tool_use: { name: "Agent", input: { subagent_type: "api-designer", prompt: "Complete t1..." } },
            tool_use: { name: "Agent", input: { subagent_type: "frontend-dev", prompt: "Complete t3..." } }]

system: { subtype: "task_started", task_id: "sdk-1", tool_use_id: "tu_01" }
system: { subtype: "task_started", task_id: "sdk-2", tool_use_id: "tu_02" }

// Sarah works (parent_tool_use_id links to tu_01):
assistant: { parent_tool_use_id: "tu_01", content: [text: "I'll design the data models..."] }
assistant: { parent_tool_use_id: "tu_01", content: [tool_use: Write { file_path: "models.ts" }] }

// Alex works in parallel (parent_tool_use_id links to tu_02):
assistant: { parent_tool_use_id: "tu_02", content: [tool_use: Bash { command: "npm init" }] }

tool_use_summary: { summary: "Created models.ts with User and Transaction schemas" }

system: { subtype: "task_notification", task_id: "sdk-1", status: "completed" }

// Orchestrator dispatches Wave 2...

result: { subtype: "success", total_cost_usd: 0.42, duration_ms: 180000, num_turns: 12 }
```

### MissionManager — Two Callbacks

```
onSDKMessage(envelope):
  → data.sdkMessages.push(envelope)        // persist for replay
  → notifySDKMessageListeners(id, envelope) // → WebSocket
  → saveMission(id)                         // debounced to disk

onLifecycle(event):
  → data.events.push(event)
  → notifyListeners(id, event)              // → WebSocket
  → if session_completed: status = "completed", save immediately
  → if session_error:     status = "failed",    save immediately
```

### WebSocket Handler

For SDK envelopes: `socket.emit("sdk_message", envelope)`

For lifecycle events: `socket.emit("event", event)` + `socket.emit("mission_state", updatedMission)` on status changes.

---

## Phase 7: Frontend Receives & Renders

### Socket Hook

- `sdk_message` → `addSDKMessage(envelope)` → pushes to `sdkMessages[]` in Zustand store
- `event` / `mission_state` → updates `events[]`, `mission` in store

### useSDKStream Hook — Client-Side Interpretation

`useSDKStream()` runs in `useMemo` over `sdkMessages[]`. This is where all the intelligence lives — the same logic that used to be in the backend's `processMessage()`, now running client-side:

```typescript
const state = createState();  // toolUseToAgent, taskStatuses, agentStatuses, feed[]

for (const envelope of sdkMessages) {
  const msg = envelope.msg;

  if (msg.type === "assistant") {
    // Resolve agent via parent_tool_use_id → toolUseToAgent map
    for (block of msg.message.content) {
      if (text)     → feed.push({ kind: "text", agent, content })
      if (tool_use) {
        if (Agent)  → resolve agent from subagent_type
                    → update agentStatuses to "working"
                    → extract taskId from prompt text
                    → feed.push({ kind: "agent_dispatch" })
                    → feed.push({ kind: "task_change", status: "in_progress" })
        else        → feed.push({ kind: "tool", summary: "Writing models.ts" })
      }
    }
  }
  if (result)             → mark all agents completed, all tasks completed
                          → feed.push({ kind: "result", costUsd, durationMs })
  if (system)             → task_started: map task_id → agent
                          → task_notification: mark agent completed/failed
  if (tool_use_summary)   → feed.push({ kind: "tool_summary" })
  if (tool_progress)      → feed.push({ kind: "tool", summary: "Edit (3.2s)" })
}

return { feed, agentStatuses, taskStatuses, totalCostUsd, ... }
```

Key maps maintained during processing:
- `toolUseToAgent` — maps SDK `tool_use.id` → agent name (set when orchestrator dispatches via Agent tool)
- `taskIdToAgent` — maps SDK `task_id` → agent name (set on `task_started` system messages)
- `agentToTask` — maps agent name → mission task ID (extracted from prompt text, e.g. "Complete task t1")

### SDKActivityLog Component

Renders `feed.map()` — each entry kind gets a dedicated renderer:

| Kind | Renders As |
|------|-----------|
| `text` | Markdown block with agent badge |
| `tool` | `● Writing models.ts` chip with agent badge |
| `tool_summary` | `✓ Created data models` summary line |
| `agent_dispatch` | Pinging dot + "Sarah started working on t1" |
| `agent_complete` | Checkmark + "Sarah completed (12.4s)" |
| `task_change` | Color-coded status pill |
| `result` | Green/red "Mission Complete/Failed" bar with cost, duration, turns |

Working agents show a thinking indicator (pinging dot + "working...") at the bottom of the feed.

### Dashboard

Checks `sdkMessageCount > 0`:
- **True** → renders `<SDKActivityLog />` in Terminal tab
- **False** → falls back to legacy `<ActivityLog />` (for container-based missions or old data)

The Progress Panel reads from `mission.agents` and `mission.plan.tasks` (pushed via `mission_state` from lifecycle events).

---

## Phase 8: Completion

1. SDK query loop ends
2. `MissionEngine` emits `session_completed` lifecycle event
3. `MissionManager` sets `status = "completed"`, `completedAt = Date.now()`, saves to disk
4. WebSocket pushes final `mission_state` with `status: "completed"`
5. Frontend store updates, timer stops
6. `useSDKStream` processes the `result` message → all agents/tasks marked completed
7. `SDKActivityLog` renders the "Mission Complete" bar with cost and duration

---

## Reconnect / Page Refresh

If the user refreshes mid-execution:

1. `useSocket` mounts → connects WebSocket → joins mission room
2. Backend sends `sdk_messages_batch` with all persisted `SDKEnvelope[]`
3. Frontend also fetches `GET /api/missions/:id/sdk-messages` (REST fallback)
4. `addSDKMessages()` loads them into the store (deduplicates by ID)
5. `useSDKStream` replays all messages through `processEnvelope()` — rebuilds the full feed, agent statuses, task statuses
6. Dashboard renders the complete state as if the user never left

---

## Data Structures

```
MissionPlan                  The blueprint
  ├── MissionAgent[]         name, displayName, specialization, prompt, tools, model
  └── MissionTask[]          id, title, assignee, dependencies, status

SDKEnvelope                  Raw SDK message wrapper
  └── msg: unknown           The raw Claude Agent SDK event (typed on frontend)

SDKFeedEntry                 Frontend interpretation of SDK messages
  kinds: text | tool | agent_dispatch | agent_complete | task_change | result | tool_summary | thinking

ExplorationFeedEntry         Exploration phase streaming
  types: text | tool         Interleaved chronologically

SessionEvent                 Lifecycle events (session_started, session_completed, session_error)

Mission                      Top-level entity
  id, status, plan, agents[], workspace, readinessScore, timestamps
```

## The Three `query()` Calls

| Call Site | Phase | System Prompt | Tools | Streaming | Output |
|-----------|-------|---------------|-------|-----------|--------|
| `planner.explore()` | Explore | Aria (discovery, no code) | Read-only + Web | Tokens + activities via WS | Text + readiness score |
| `planner.planFromContext()` | Plan | Planning prompt (output JSON) | Read-only + Web | None | JSON MissionPlan |
| `engine.executePlan()` | Execute | Orchestrator (dispatch agents) | All (via AgentDefinitions) | Raw SDKEnvelopes via WS | Mission artifacts in workspace |

## Key Files

| File | Purpose |
|------|---------|
| `frontend/src/app/page.tsx` | Landing + exploration chat UI |
| `frontend/src/store/mission-store.ts` | Zustand store — mission state, SDK messages, exploration feed |
| `frontend/src/hooks/use-socket.ts` | WebSocket connection + event routing |
| `frontend/src/hooks/use-sdk-stream.ts` | Client-side SDK message interpretation → feed + statuses |
| `frontend/src/components/sdk-activity-log.tsx` | Claude Code-style chronological feed renderer |
| `frontend/src/components/dashboard.tsx` | Mission dashboard layout |
| `frontend/src/components/progress-panel.tsx` | Agent/task status + workflow graph |
| `agent-runtime/src/mission-planner.ts` | Aria exploration + plan generation (two prompts, two `query()` calls) |
| `agent-runtime/src/mission-engine.ts` | Thin SDK relay — orchestrator prompt + raw message forwarding |
| `backend/src/services/mission-manager.ts` | Mission lifecycle, persistence, WebSocket event routing |
| `backend/src/ws/handler.ts` | Socket.IO setup — joins, events, SDK message relay |
| `backend/src/routes/missions.ts` | REST API — explore, plan, approve, files, SDK messages |
| `shared/src/schemas/mission.ts` | MissionPlan, MissionAgent, MissionTask, Mission Zod schemas |
| `shared/src/schemas/events.ts` | SessionEvent, SDKEnvelope, ChatMessage schemas |

## Persistence

Missions are saved to `~/.stallion/missions/<id>.json` as `MissionSnapshot` objects containing: plan, events, sdkMessages, chat, status, agents, timestamps. On server restart, all missions are loaded from disk. Running/launching missions are marked as failed (SDK sessions can't be resumed).

Agent workspaces live at `~/.stallion/missions/<id>/` (or `$STALLION_WORKSPACE_ROOT/<id>/` if configured). These contain the actual files created by agents during execution.
