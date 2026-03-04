# QA Tester Memory — Stallion Frontend

## App: Stallion (http://localhost:3000)
Next.js 15 frontend, Backend on localhost:4000, WebSocket via Socket.IO.

## Known Stable Patterns (as of 2026-03-03)
- Console errors from `localhost:55008` / `localhost:55010` (VNC/noVNC container) are infrastructure noise — NOT frontend bugs
- WebSocket warnings ("closed before connection established") are reconnection cycle noise — NOT bugs
- React DevTools INFO message on every load — expected
- The only real errors to flag are from `localhost:3000` origin
- "Disconnected" banner after page refresh is transient — app recovers on its own (WS reconnects within ~10s); REST API continues to serve data during disconnect

## Verified Bug Fixes (2026-03-03 session)
- Bug #3: Markdown renders correctly in chat (bold, lists, code, tables, headings)
- Bug #4/#5: Sidebar timestamps show relative times (e.g. "5m ago"), update every minute, never frozen
- Bug #6: Failed mission task dots show RED; completed show GREEN; pending show gray
- Bug #7: Completed mission graph agents show "Completed" status (not "Idle")
- Bug #11: Terminal/Browser tab resets to Terminal when switching missions in sidebar
- Bug #18: Missions in exploring/planning show "New mission" in sidebar (not raw IDs); once plan is titled, shows title
- Fix UX-4: Workspace message is status-accurate — "after the mission failed." vs "after mission completion."
- Fix P2-4 (tab auto-revert): Terminal tab IS active on failed missions; code logic confirmed correct in dashboard.tsx lines 57-62

## STILL BROKEN — REST Hydration on Refresh (P1-2, as of 2026-03-03)
- Root cause confirmed in use-socket.ts: REST hydration (authFetch for mission, events, chat) fires INSIDE socket.on("connect") callback, NOT on component mount
- On page refresh, panels show blank state ("Start a conversation", "Waiting for mission plan", "No activity yet", "0 events") until WS connects
- WS connect triggers REST fetches; data appears only after that — NOT before, as the fix intended
- The fix DOES work once WS connects (fast REST population); the issue is it should fire on mount INDEPENDENTLY of WS connect
- Evidence: browser_navigate snapshot captured mid-load showing "Disconnected" banner + all empty panels simultaneously
- Fix would require: move authFetch calls to a separate useEffect that runs on mount, not inside socket.on("connect")

## Open Bugs Found (2026-03-03 session)
- P1: Streaming text concatenation drops spaces between chunks — "build this right.Good findings!" (period + capital, no space)
- P2: Large inline code blocks (500+ lines of HTML) in chat with no collapse/copy button
- P2: Planner metadata ("Agents: X Tasks: 2 Complexity: moderate") renders as raw plain text, not formatted
- P2: Two sidebar DOM instances exist simultaneously when collapsed (mini + full hidden) — a11y concern

## Regression Notes
- New mission create → explore → plan → approve flow works end-to-end (UI-wise)
- Mission execution failures (code 1) are backend/VM issues, not frontend regressions
- Progress tab (Tasks/Graph) selection does NOT reset on mission switch — only Terminal/Browser tab resets
- "just now" timestamp correctly transitions to "1m ago" after ~60 seconds
- Workspace message correctly shows "after the mission failed." for failed, "after mission completion." for completed

## Testing Patterns
- Use existing missions to verify status-dependent rendering (failed=red, completed=green)
- Tab reset (Bug #11): set Browser tab on mission A, switch to mission B, verify Terminal is active
- Timestamp updates: note times, wait 60+ seconds, re-snapshot sidebar
- Graph tab: switch to completed mission, click Graph, verify agent nodes show "Completed" not "Idle"
- Disconnected state: page refresh → banner appears → wait ~10s → should auto-recover (if not, that's a bug)
- Streaming text spacing: during explore, look for sentences concatenated without spaces at chunk boundaries
