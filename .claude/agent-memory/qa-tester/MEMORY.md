# QA Tester Memory — Stallion

## Project
Stallion agentic workflow platform at http://localhost:3000 (frontend) + http://localhost:4000 (backend API).

## Known Stable Patterns
- Happy path: New Mission → explore (variable, 1-5 min) → Plan Mission → plan review → Approve → execution → container can succeed or fail
- Completed missions: Vanilla JS Todo List App (mission--3qk0Ygj94) is complete and good for UI testing (1 agent, 1 task, 100%)
- Socket.IO connects via polling fallback even when WebSocket upgrade fails — check http://localhost:4000/socket.io/?EIO=4&transport=polling
- Explore latency is highly variable (Azure API): can be 30s or 13+ minutes — no timeout exists
- E2E test (2026-03-04 session 3): Mission (Personal Finance Tracker) failed at t2 (5 min into execution) — container crash

## Recurring Bugs Found (Updated 2026-03-04 session 3)

### Critical / Major (Confirmed)
- Task t2 "Verify requirements" shows GREEN dot + "Completed" in graph after failure — incorrectly marks in-progress task as completed on container crash
- Duplicate orchestrator wave dispatch messages in chat (t1 complete appears twice with slightly different wording)
- Duplicate "Leo started" events in activity log — agent dispatched twice
- Progress counter frozen at last value (1/3 33%) after failure — never updates to failure state
- Activity log truncation preview cuts off mid-sentence: "Dispatchi..." — not semantic truncation point

### Fixed Since Session 2 (Confirmed in Session 3)
- Header status NOW updates in real-time via WebSocket when mission fails (was broken before)
- Timer NOW stops at failure time (was counting indefinitely before)
- Mission failure message NOW surfaced in chat (red box: "Mission failed: container execution ended unexpectedly")
- Mission failure event NOW shows in System filter of activity log (was missing before)
- Graph: both agent nodes show "Error" after failure (Leo previously showed "Working")
- Task counter DOES increment during execution (was broken in previous session — now works: showed 1/3 at correct time)

### Still Present / Newly Confirmed
- Task dot 01 stays blue (in_progress) even after counter shows 1/3 — dot visual doesn't transition to green when task completes
- Browser tab auto-switches BACK to VNC view repeatedly, even when user manually selects Terminal — hijacks user's view
- VNC desktop area stays gray for 2+ min before showing content
- Planner message shows raw metadata: "Agents: frontend-engineer, qa-reviewer Tasks: 3 Complexity: simple" — unformatted technical identifiers
- Agent specialization text truncates in graph nodes (mid-word overflow)
- "Container running" event not categorized as "system" — doesn't appear in System filter
- favicon.ico 404 on every page load
- "Enter to start" hint text overlaps textarea content area when text is entered
- noVNC console errors (package.json 404) on every container start — cosmetic

## Architecture Notes for Testing
- The /explore endpoint is a long-running synchronous HTTP POST (not streaming) — LLM call can take 2+ min
- WebSocket delivers streaming tokens during explore/plan, but HTTP response is authoritative
- Backend mission states: exploring → planning → review → launching → running → completed/failed
- WebSocket fails with "closed before connection established" on initial load — but reconnects; Socket.IO polling works as fallback
- Browser tab auto-switch to VNC fires multiple times during execution (VNC reconnect events trigger it)

## UI Component Observations
- Markdown rendering: works everywhere — explore chat (Aria), planner messages, orchestrator messages, activity log
- Activity log filters (All/Agents/Tools/System) work correctly; reset when switching missions
- "show more/less" in activity log works correctly
- Sidebar navigation (switching missions) works correctly, data persists
- REST hydration on page refresh works: all state correctly restored instantly (no loading flash)
- Graph controls (zoom, fit, interactivity toggle) present and render correctly
- Files panel: shows "finance.html" during execution, "Workspace unavailable" after failure/completion
- Completed mission (Vanilla JS Todo List App): 1/1 tasks (100%), green dot, "Mission completed successfully" in activity
