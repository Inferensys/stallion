# Stallion

Agentic workflows that ship. Describe what you want to build and a dynamically assembled team of AI agents brings it to life.

## Architecture

Built on the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/typescript). Each session is a **Mission** — a dynamically assembled team of agents tailored to the specific task.

```
User prompt → Explore (Aria researches) → Plan (structured MissionPlan) → Approve → Execute (parallel agents) → Deliver
```

### Packages

| Package | Description |
|---------|-------------|
| `@stallion/shared` | Zod schemas — missions, agents, events, SDK envelope |
| `@stallion/agent-runtime` | MissionPlanner + MissionEngine (thin SDK relay) |
| `@stallion/backend` | Hono API + Socket.IO, MissionManager service |
| `@stallion/frontend` | Next.js 15 + Tailwind + Zustand + React Flow dashboard |

### How It Works

1. **Explore** — Aria (the planner agent) researches your idea using web search, reads docs, analyzes patterns. You see text and tool activity interleaved in real-time.

2. **Plan** — When ready, Aria generates a structured `MissionPlan` with named agents (each with a persona, specialization, and tools), tasks with dependencies, and parallel execution waves.

3. **Execute** — The orchestrator dispatches agents in parallel via the Claude Agent SDK. Raw SDK messages stream to the frontend where they're interpreted client-side into a Claude Code-style activity feed.

4. **Deliver** — Agents write files to a workspace. Browse results in the workspace inspector.

## Setup

```bash
cp .env.example .env
# Fill in your Azure AI Foundry credentials

npm install
```

## Development

```bash
# Terminal 1 — Backend (port 4000)
npm run dev:backend

# Terminal 2 — Frontend (port 3000)
npm run dev:frontend
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CLAUDE_CODE_USE_FOUNDRY` | Set to `1` for Azure AI Foundry |
| `ANTHROPIC_FOUNDRY_RESOURCE` | Azure resource name |
| `ANTHROPIC_FOUNDRY_API_KEY` | Azure API key |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Model for agents (e.g. `claude-sonnet-4-6`) |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Model for planner (e.g. `claude-opus-4-6`) |
| `PORT` | Backend port (default: 4000) |
| `NEXT_PUBLIC_BACKEND_URL` | Backend URL for frontend |
| `DEV_AUTH_BYPASS` | Set to `true` to skip auth in development |

## Tech Stack

- **Runtime**: Node.js, TypeScript, Zod 4
- **Backend**: Hono, Socket.IO, Claude Agent SDK
- **Frontend**: Next.js 15 (Turbopack), Tailwind CSS, Zustand, React Flow
- **LLM**: Claude via Azure AI Foundry
