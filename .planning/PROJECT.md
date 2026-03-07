# Stallion

## What This Is

A cloud-based Claude Code platform. Anyone — developers or non-technical users — can start a CC session from their browser, give it a task, and watch it explore, plan, and build autonomously. CC runs in a sandboxed cloud environment with the same capabilities it has locally (file creation, terminal, browser, web search), but managed and hosted by Stallion. User-level configuration (skills, agents, MCPs, credentials) persists across sessions. An MCP marketplace lets users install tools that extend CC's capabilities.

## Core Value

Make Claude Code's autonomous coding power accessible to anyone through a browser — no local setup, no API keys, no CLI. Just describe what you want and watch it get built.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can create a new CC session from the browser
- [ ] CC session runs in a sandboxed, isolated cloud environment
- [ ] User sees a terminal-style activity feed (text, tool calls with IN/OUT, file changes) in real-time
- [ ] CC has full tool access: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Task
- [ ] CC follows a guided workflow (GSD-style) installed as a skill: question → research → plan → execute
- [ ] User can chat with CC during the session (multi-turn conversation)
- [ ] User-level storage: skills, agents, MCPs stored as DB records + .md files
- [ ] User config is injected into each new CC session automatically
- [ ] Session-level .claude directory for per-session state (agents, skills created during session)
- [ ] MCP marketplace: user can browse and install tools (dev, browser, external APIs)
- [ ] Installed MCPs are configured in the CC session automatically
- [ ] User can browse and download files CC created
- [ ] Sessions persist — user can return to a completed/running session
- [ ] Authentication — user accounts with session history

### Out of Scope

- Native mobile app — web-first
- Self-hosting / on-prem — cloud-only initially
- Real-time collaboration — single user per session
- Custom LLM providers — Claude only (via Anthropic API or Azure Foundry)

## Context

- Built on the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/typescript) (`@anthropic-ai/claude-agent-sdk`)
- CC is a thin wrapper: `query({ prompt, options })` returns an async generator of `SDKMessage` events
- The SDK spawns a `cli.js` subprocess per session (~12s cold start, ~1GiB RAM)
- CC has a built-in system prompt (`{ type: "preset", preset: "claude_code" }`) and tool suite
- GSD (get-shit-done) is a Claude Code skill that provides structured project workflows
- The existing Stallion codebase has: Hono backend, Next.js frontend, Socket.IO WebSocket, Zustand store, SDK message relay pattern, workspace file browsing
- Execution environment is the biggest open question — needs research (how do Manus, Devin, ChatGPT Codex, Bolt, Replit Agent handle sandboxing?)
- Azure AI Foundry is the current LLM provider (env: `ANTHROPIC_FOUNDRY_RESOURCE`, `ANTHROPIC_FOUNDRY_API_KEY`)

## Constraints

- **Execution isolation**: Each CC session MUST be sandboxed — user code cannot affect other sessions or the host
- **SDK cold start**: ~12s per `query()` call — acceptable per session, not per message
- **Resource per session**: ~1GiB RAM, 1-2 CPU, 5GiB disk per SDK instance
- **Existing stack**: TypeScript, Node.js, npm workspaces — keep consistent
- **API provider**: Azure AI Foundry (Claude via Azure) — already configured

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CC IS the workflow | Instead of orchestrating around CC, install GSD-like skills INTO CC so it follows structured workflows naturally | — Pending |
| Terminal-style feed UI | Matches CC's natural output format, familiar to developers, extensible to non-technical users | — Pending |
| Simple DB + files for user storage | Skills/agents as DB records, .md files as blobs — avoids git complexity, easy to inject | — Pending |
| Research execution env first | Biggest risk — sandboxing approach affects everything. Research Manus/Devin/Codex/Bolt patterns before committing | — Pending |
| BYO API key initially | Defer billing complexity — users provide their own Anthropic/Azure key | — Pending |

---
*Last updated: 2026-03-07 after initialization*
