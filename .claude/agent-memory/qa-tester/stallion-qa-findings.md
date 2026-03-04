# Stallion QA Findings Log

## Session 2026-03-04 — Full E2E Test (Container Execution NOW WORKING)

### Mission Tested
"Create a beautiful HTML page that shows a real-time clock with an analog clock face..."
Mission ID: mission-W-9VJ08lbD
Result: COMPLETED SUCCESSFULLY (first fully successful E2E execution observed)

---

## WORKING Features (Verified This Session)

### Happy Path Flow
- New Mission button → explore screen transition: instant, clean
- Prompt textarea: accepts text, enables Start button
- Start button: creates mission, triggers explore phase
- Explore phase: loading indicator (Aria typing dots), "Exploring" status badge, progress bar animation
- Aria response: full markdown rendering (code blocks, tables, bold, inline code) — WORKS
- "Plan Mission" button: becomes active when explore completes
- Planning phase: "Creating plan..." spinner, input disabled, sidebar updates to "planning" live
- Plan review state: shows task list, agent assignments, complexity badge, Approve button
- Graph view pre-execution: shows agent nodes, task nodes, dependency edges, all "Pending/Idle"
- "Approve Plan & Start Mission": launches in ~2s
- Header transitions: review → running → completed — all correct
- VM badge: "VM: running" (green) appears on launch, "VM: stopped" on completion
- Elapsed timer: ticks correctly during execution, shows final duration on completion
- Browser tab auto-switch: activates when container starts (green dot), Browser tab shown
- VNC iframe: loads noVNC interface with "Live" badge and "Open in new tab" button
- Activity log live streaming: agent_working, tool_executed, agent_message events appear in real time
- Activity log "show more/less": works correctly
- Agent started badges: Leo started, Maya started appear in activity log
- Activity log filters: "All" works, "Tools" shows collapsed tool group then expands, "System" works
- Tool detail expansion: clicking a tool button shows full tool input (Write tool showed full 494-line file)
- Orchestrator messages: proper markdown rendering in both chat AND activity log (bullet lists, bold, code)
- Sidebar updates: "exploring" → "planning" → "review" → "running" → "completed" all update live
- Mission switch and back: state restores correctly
- Page refresh after completion: all state restored correctly
- Post-completion state: "Workspace unavailable" message in Files panel, correct
- Post-completion Browser tab: "No active container / Container has stopped" — correct empty state
- Planner markdown rendering: FIXED (was broken in previous session — now renders bold correctly)
- Task dots on FAILED missions: RED (was gray previously — now correct)

---

## BUGS FOUND

### Critical / Major

**BUG-1: Task statuses never update from pending → completed in backend**
- Confirmed via API: tasks t1 and t2 remain `status: pending` even after mission completes
- Affects: Progress panel shows "0/2 tasks (0%)" on completed mission
- Affects: Task dots show gray/neutral (not green) on completed mission
- Affects: Graph task nodes show "Pending" even when agent nodes show "Completed"
- Root cause: Agent SDK task completion events not persisted to plan.tasks[] in MissionManager
- Contrast: Old Personal Portfolio mission (mission-p_NZdFJlV6) has correct task statuses — likely a regression

**BUG-2: agent_message summary field truncated mid-word in backend**
- The `summary` field on agent_message events is truncated — example: ends at "Thre" instead of "Three glowing hands..."
- The full text is in `data.text` but UI renders `summary`
- Visible as: last bullet in mission complete summary shows "Thre" in both chat and activity log
- Occurs in both live view and after page refresh (data stored truncated)
- Fix: use `data.text` as primary, fall back to `summary`; OR ensure summarizer doesn't cut mid-word

**BUG-3: Activity log "Agents" filter shows orchestrator messages, not agent messages**
- Filter shows Mission Control (orchestrator) messages when "Agents" is selected
- Expected: should show Leo/Maya agent events only
- The agent started badges (Leo/Maya) are absent from the filtered view

**BUG-4: Activity log System filter "Mission result" shows raw markdown**
- Row content: "Mission result: ## ✅ Mission Complete Both waves executed..."
- `##` heading and `**` bold markers visible as raw text
- Confirmed in both new mission and old Personal Portfolio mission — persistent

**BUG-5: Activity log truncation preview shows raw markdown before ellipsis**
- "Dispatching **..." shown instead of rendered text before "show more"
- The truncation chops the string mid-markdown token, exposing the raw `**` marker
- After clicking "show more" the full text renders correctly

### Minor / UX

**BUG-6: Agent tab status shows "Idle" on completed missions**
- Leo and Maya agent tabs show "Idle" status after mission completes
- Graph agent nodes correctly show "Completed"
- Inconsistency between graph node status and agent detail panel status

**BUG-7: Browser tab does NOT auto-revert to Terminal when container stops**
- Spec says: should auto-switch back to Terminal tab when container stops
- Actual: stays on Browser tab showing "No active container" empty state

**BUG-8: Explore phase has no timeout / no feedback for long waits**
- This mission: explore took ~13 minutes (vs expected 10-30 seconds)
- No timeout mechanism, no user feedback about how long to expect
- User sees only "Exploring" badge and typing dots with no time estimate

### Previously Reported (Still Present)

**PERSISTENT: favicon.ico 404 on every page load**
**PERSISTENT: WebSocket upgrade fails, falls back to polling (cosmetic, functional)**
**PERSISTENT: noVNC package.json 404 errors (cosmetic)**
**PERSISTENT: "Enter to start" hint text visible below textarea content**
**PERSISTENT: Responsive layout breaks badly below ~900px width**

---

## FIXED Since Last Session

- Planner chat messages now render markdown correctly (bold, inline code)
- Sidebar status DOES update in real time during live sessions
- Task dots on failed missions show RED (not gray)

---

## Architecture Observations

- task_status_changed events from Agent SDK are not updating plan.tasks[].status in MissionManager
- The Personal Portfolio mission (older) HAS correct task statuses — suggests recent regression
- agent_message events have both `summary` (truncated) and `data.text` (full) — UI should prefer full
- Explore phase timing: ~13 min this session (Azure API latency), previously ~3-6 min
