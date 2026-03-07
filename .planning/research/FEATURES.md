# Feature Research

**Domain:** Cloud AI coding agent platform (browser-based Claude Code wrapper)
**Researched:** 2026-03-07
**Confidence:** HIGH (competitive landscape verified against live products; all major competitors researched)

---

## Competitive Landscape Summary

Platforms analyzed: Devin (Cognition), ChatGPT Codex (OpenAI), Bolt.new (StackBlitz), Replit Agent, Cursor, Windsurf, GitHub Copilot Workspace, Manus AI.

The market has split into two segments:

1. **IDE-embedded agents** (Cursor, Windsurf, GitHub Copilot): Run on local codebases, require local setup. Powerful but not browser-native.
2. **Cloud-native agents** (Devin, Bolt, Replit, Codex web): Zero local setup, run in sandboxed cloud environments. The direct competitive set for Stallion.

Stallion's differentiating position: **Claude Code specifically** (the most developer-trusted terminal agent) delivered as a hosted cloud service with persistent user configuration and an MCP marketplace.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features every cloud coding agent offers. Missing any of these makes Stallion feel broken or incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Real-time streaming output** | Every competitor streams — Devin, Bolt, Replit all show live output. Users won't submit and wait blind. | MEDIUM | Socket.IO relay already exists in Stallion codebase. Terminal-style display preferred by developers. |
| **Sandboxed execution environment** | Users expect their code won't break other sessions or the host. This is baseline safety. | HIGH | Biggest open question per PROJECT.md. Docker/Firecracker/gVisor decision needed. ~1GiB RAM, 1-2 CPU per session. |
| **Session persistence** | Devin, Replit, Codex all support returning to a running or completed session. Users close tabs and come back. | MEDIUM | Sessions stored at `~/.stallion/missions/`. Need session list + resume UI. |
| **File browser + download** | Every competitor exposes generated files. Bolt exports to GitHub; Replit shows a file tree; Devin has IDE. Users need to get their code out. | LOW | Backend file list/read routes already exist. Need frontend file tree + download ZIP. |
| **Multi-turn chat during session** | Users steer agents mid-task. Devin supports it. Replit supports it. Codex supports it. Single-shot with no feedback is unusable. | MEDIUM | Already in PROJECT.md requirements. Socket.IO message relay exists. |
| **User authentication + session history** | Every commercial product requires login. Users expect to see their past sessions. | MEDIUM | Standard OAuth/email auth. Session list per user. |
| **Zero local setup** | The core promise — browser only. No CLI, no Node, no Docker on user machine. | HIGH | This is the whole point. Execution environment must be fully server-side. |
| **Task progress indicator** | Devin shows step-by-step plans; Bolt shows live file changes; Replit shows agent steps. Users need to know what's happening. | LOW | Terminal-style activity feed covers this. Elapsed timer already in Stallion frontend. |
| **Interrupt / stop session** | Users need to cancel a runaway agent. All competitors support this. | LOW | Need stop endpoint + SDK cancellation signal. |
| **Successful task completion signal** | Clear "done" state when CC finishes. Not just output ending — explicit status. | LOW | Session state machine already in codebase. |
| **Error recovery / failure surface** | When an agent fails or gets stuck, surface it clearly. Don't silently time out. | MEDIUM | Needs error state in UI + timeout detection. |

### Differentiators (Competitive Advantage)

Features that distinguish Stallion from Devin/Bolt/Replit. These align directly with Stallion's core value: Claude Code's autonomous coding power, accessible from a browser with persistent user configuration.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Persistent user skills (CLAUDE.md injection)** | Users build up a personal CC configuration over time — their coding preferences, patterns, conventions. No competitor does this. Windsurf has per-project "Memories"; no one has user-level skill accumulation that travels across sessions. | MEDIUM | Skills stored as DB records + .md blobs. Injected into each new CC session via system prompt. Already in PROJECT.md. |
| **MCP marketplace** | Users install tools (browser automation, external APIs, dev tools) that CC gets access to in every session. GitHub Copilot has an MCP registry but it's IDE-only. No cloud agent has a browser-accessible MCP marketplace. | HIGH | MCP is now the universal standard (Linux Foundation, adopted by OpenAI/Google/MS). First-mover advantage for cloud-native MCP marketplace is real. |
| **GSD-style structured workflow** | CC follows a guided plan-then-execute workflow (question → research → plan → execute) rather than immediately writing code. Users get better results from structured autonomy than from raw "go do it" instructions. | MEDIUM | GSD skill installed as a CC skill. Differentiates from Bolt (just generates) and Devin (plans but doesn't follow structured methodology). |
| **Terminal-style transparency** | Developers want "glass box" not "black box." Research shows the #1 pain point with Devin/Manus is hidden reasoning. Showing every tool call (Read, Write, Bash, WebSearch) with IN/OUT creates trust. | LOW | Activity log already implemented Claude Code-style. This is a differentiator to lean into, not just a nice-to-have. |
| **BYOK (Bring Your Own Key)** | Power users and teams want cost control and data sovereignty. JetBrains, VS Code, Warp all ship BYOK. It reduces Stallion's LLM cost liability and removes a purchasing objection. | LOW | Azure Foundry already configured. Add Anthropic direct as a second provider. Store keys encrypted per user. |
| **Skill sharing / skill store** | Users could publish skills (e.g., "React expert" skill, "test-driven development" skill) for others to install. No competitor does this. Mirrors VSCode extension model but for CC configuration. | HIGH | v2+ feature. Requires moderation, versioning, marketplace UI. High value but high complexity — defer post-validation. |
| **Per-session .claude directory** | Session-local agents and skills created during a session are captured and optionally promoted to user-level. Users discover what works and save it. | LOW | Already in PROJECT.md. Low complexity, high value for power users. |
| **Workspace file git export** | Export session files directly to a GitHub repo. Bolt does GitHub export from WebContainers. Users want to own their code in their own infrastructure. | MEDIUM | After file browsing is done. Requires GitHub OAuth + push. High user demand based on research. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Real-time collaboration (multiplayer)** | Bolt and Replit offer it; seems like a natural ask. | Transforms a single-agent tool into a multiplayer system with conflict resolution, presence, permissions — 3x the complexity with marginal early-stage value. PROJECT.md explicitly scopes this out. | Single user per session now; team-level "share a completed session" as read-only link later. |
| **Built-in hosting / deployment** | Bolt deploys to .bolt.host; Replit deploys to its cloud. Users ask "can I deploy from here?" | Deployment is a deep product vertical (DNS, SSL, serverless, containers, scaling). Distraction from the core job-to-be-done: building code, not hosting it. | Offer GitHub export and/or copy-to-clipboard for deployment commands. Let Vercel/Railway handle hosting. |
| **Custom LLM providers (non-Claude)** | Cost-conscious users want GPT-4o or Gemini instead. | Claude Code IS Claude — the system prompt, tool suite, and reasoning patterns are tuned for Claude models. Supporting non-Anthropic models breaks the core product. BYOK should be Anthropic/Azure only. | BYOK for Anthropic direct vs. Azure Foundry covers cost flexibility without model switching. |
| **VS Code extension / IDE plugin** | Developers want Stallion inside their local IDE, like Cursor. | This is a completely different product. Cursor and Windsurf already own this space. Building a VS Code extension competes on Cursor's turf, abandons the "no local setup" differentiator, and splits engineering focus. | Own the browser-native niche. IDE integration is a competitor strategy, not ours. |
| **Automated recurring tasks / cron agents** | Codex Automations and Cursor Automations offer trigger-based agents. Users ask for "run this every night." | Requires event infrastructure, scheduling, billing per-run, monitoring, alerting — a whole secondary platform. Not core to the initial value prop. | Manual session initiation for v1. Scheduled sessions as v2+ after platform matures. |
| **Full in-browser code editor** | Users see the file tree and want to edit files directly, like Bolt or Replit. | Stallion's value is autonomous CC execution, not manual editing. Adding a full editor splits the product identity and adds Monaco/CodeMirror integration complexity. | Read-only file viewer with download. Users who need to edit can pull files to their local editor or use GitHub. |
| **Native mobile app** | Users want to check on running sessions from their phone. | Mobile app is a separate release cycle, App Store friction, and push notification infrastructure. Web-first already stated as out of scope in PROJECT.md. | Responsive web UI that works on mobile browser for session monitoring (no coding, just status). |

---

## Feature Dependencies

```
[User Auth]
    └──required by──> [Session History]
    └──required by──> [User Skills Storage]
    └──required by──> [MCP Marketplace]
    └──required by──> [BYOK]

[Sandboxed Execution Environment]
    └──required by──> [CC Session Creation]
                           └──required by──> [Real-time Streaming Output]
                           └──required by──> [Multi-turn Chat]
                           └──required by──> [File Browser]
                           └──required by──> [Session Persistence]

[User Skills Storage]
    └──enhances──> [CC Session Creation] (skills injected into session)

[MCP Marketplace]
    └──requires──> [User Auth]
    └──enhances──> [CC Session Creation] (MCPs configured in session)
    └──requires──> [Sandboxed Execution Environment] (MCPs run in sandbox)

[File Browser]
    └──enables──> [File Download / ZIP export]
    └──enables──> [GitHub Export] (v1.x)

[Session Persistence]
    └──requires──> [User Auth]
    └──enables──> [Session Resume]

[GSD Structured Workflow]
    └──requires──> [Sandboxed Execution Environment]
    └──enhances──> [Multi-turn Chat] (plan approval flow)

[BYOK]
    └──requires──> [User Auth] (encrypted per user)
    └──enhances──> [CC Session Creation] (uses user's key)

[Terminal Transparency]
    └──requires──> [Real-time Streaming Output]
    └──enhances──> [Trust / Retention]
```

### Dependency Notes

- **Sandboxed execution is the critical path**: Everything that matters (sessions, streaming, files, MCP) depends on getting the execution environment right first. This is the highest-risk item.
- **User auth unlocks the personalization layer**: Skills, MCP marketplace, BYOK, and session history all require knowing who the user is. Auth must precede any persistence features.
- **MCP marketplace requires execution environment**: MCPs run inside the sandbox. You can't test or validate MCP integrations until the execution environment works.
- **GSD workflow is a soft dependency**: It's a CC skill injected at session start. Does not require any new infrastructure — just skill storage and injection working.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate that users will pay for browser-native Claude Code.

- [ ] **Sandboxed CC session in the cloud** — Core value. No setup, runs in browser.
- [ ] **Real-time terminal-style activity feed** — Glass box transparency. The experience differentiator.
- [ ] **Multi-turn chat during session** — Users steer CC without starting over.
- [ ] **File browser + download** — Users can get their code out. Essential for trust.
- [ ] **Session persistence + history** — Return to completed sessions. Auth required.
- [ ] **User authentication** — Accounts, session list, minimal profile.
- [ ] **GSD workflow skill injection** — The "structured autonomy" differentiator, low complexity, high value.
- [ ] **Interrupt / stop session** — Safety valve. Required for trust.

### Add After Validation (v1.x)

Features to add once core loop is proven (users successfully build things and want to come back).

- [ ] **User skills storage + injection** — Triggered when users ask "can CC remember my preferences?" Multiple requests = add it.
- [ ] **MCP marketplace (curated)** — Start with 5-10 verified MCPs (browser, GitHub, search). Triggered when users ask for more tool capabilities.
- [ ] **BYOK (Anthropic + Azure)** — Triggered when power users or teams resist per-session billing model. Reduces cost friction.
- [ ] **GitHub export** — Triggered when users ask "how do I get this into my repo?" High demand signal in research.
- [ ] **Per-session .claude directory capture** — Triggered when power users start building session-specific agents they want to keep.

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Skill sharing / skill store** — High complexity marketplace problem. Defer until skills are widely used.
- [ ] **Scheduled / automated sessions** — Requires separate infrastructure. Defer until use cases are understood.
- [ ] **Parallel sessions (multiple CCs at once)** — Devin and Cursor offer this. Resource-intensive (~1GiB per session). Defer until usage patterns justify it.
- [ ] **Responsive mobile monitoring UI** — Nice-to-have for session status checks. Low coding value.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Sandboxed execution environment | HIGH | HIGH | P1 |
| Real-time streaming output | HIGH | LOW (infra exists) | P1 |
| Multi-turn chat | HIGH | LOW (infra exists) | P1 |
| User authentication | HIGH | MEDIUM | P1 |
| File browser + download | HIGH | LOW | P1 |
| Session persistence + history | HIGH | MEDIUM | P1 |
| GSD workflow skill injection | HIGH | LOW | P1 |
| Interrupt / stop session | MEDIUM | LOW | P1 |
| User skills storage + injection | HIGH | MEDIUM | P2 |
| MCP marketplace (curated) | HIGH | HIGH | P2 |
| BYOK | MEDIUM | LOW | P2 |
| GitHub export | MEDIUM | MEDIUM | P2 |
| Per-session .claude capture | MEDIUM | LOW | P2 |
| Skill sharing / store | HIGH | HIGH | P3 |
| Scheduled sessions | MEDIUM | HIGH | P3 |
| Parallel sessions | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | Devin | Bolt.new | Replit Agent | Cursor (cloud) | GitHub Copilot WS | Stallion |
|---------|-------|----------|--------------|----------------|-------------------|---------|
| Browser-native, no setup | Yes | Yes | Yes | No (local IDE) | No (local IDE) | Yes |
| Real-time streaming output | Yes (IDE view) | Yes (live preview) | Yes | Yes | Yes | Yes |
| Terminal-style transparency | Partial | No (preview-focused) | No | Yes (local) | Partial | Yes (differentiator) |
| Multi-turn chat | Yes | Yes | Yes | Yes | Yes | Yes |
| Session persistence + resume | Yes | Limited | Yes (checkpoints) | N/A | N/A | Yes |
| File browser + download | Yes (IDE) | Yes (export to GitHub) | Yes | Yes (local) | Yes (local) | Yes |
| User auth + history | Yes | Yes | Yes | Yes | Yes | Yes |
| Persistent user config (skills) | No | No | Partial (replit.md) | Yes (.cursorrules) | No | Yes (differentiator) |
| MCP marketplace | No | No | No | Yes (MCP + registry) | Yes (MCP registry) | Yes (differentiator) |
| Structured workflow (plan-execute) | Yes (Interactive Planning) | No | Yes (Plan mode) | Yes (Plan mode) | No | Yes (GSD) |
| BYOK | No | No | No | No | Partial (VS Code BYOK) | Yes (v1.x) |
| Multi-agent / parallel sessions | Yes (Parallel Devins) | No | No | Yes (8 agents) | No | No (v2+) |
| Collaboration (multiplayer) | Limited | No | Yes | No | No | No (out of scope) |
| Built-in deployment | No | Yes (.bolt.host) | Yes (Replit hosting) | No | No | No (anti-feature) |
| GitHub export | Yes (PRs) | Yes | Yes | Yes | Yes (PRs) | Yes (v1.x) |

---

## Sources

- [Devin 2.0 announcement — Cognition](https://cognition.ai/blog/devin-2)
- [Devin session tools documentation](https://docs.devin.ai/work-with-devin/devin-session-tools)
- [OpenAI Codex introduction](https://openai.com/index/introducing-codex/)
- [OpenAI Codex app announcement](https://openai.com/index/introducing-the-codex-app/)
- [Bolt v2 announcement](https://bolt.new/blog/bolt-v2)
- [Replit Agent documentation](https://docs.replit.com/replitai/agent)
- [Replit 2025 in review](https://blog.replit.com/2025-replit-in-review)
- [Cursor features page](https://cursor.com/features)
- [Cursor Agent product page](https://cursor.com/product)
- [Windsurf review 2026 — Second Talent](https://www.secondtalent.com/resources/windsurf-review/)
- [GitHub MCP Server changelog — Jan 2026](https://github.blog/changelog/2026-01-28-github-mcp-server-new-projects-tools-oauth-scope-filtering-and-new-features/)
- [Extending Copilot with MCP — GitHub Docs](https://docs.github.com/copilot/customizing-copilot/using-model-context-protocol/extending-copilot-chat-with-mcp)
- [Best AI coding agents 2026 — Faros AI](https://www.faros.ai/blog/best-ai-coding-agents-2026)
- [MCP predictions 2026 — DEV Community](https://dev.to/blackgirlbytes/my-predictions-for-mcp-and-ai-assisted-coding-in-2026-16bm)
- [BYOK in JetBrains IDEs](https://blog.jetbrains.com/ai/2025/12/bring-your-own-key-byok-is-now-live-in-jetbrains-ides/)
- [Manus AI review 2026 — Lindy](https://www.lindy.ai/blog/manus-ai-review)
- [AI coding platform wars 2026 — Medium](https://medium.com/@aftab001x/the-2026-ai-coding-platform-wars-replit-vs-windsurf-vs-bolt-new-f908b9f76325)
- [AI coding agents real-world pain points — Faros AI](https://www.faros.ai/blog/best-ai-coding-agents-2026)

---
*Feature research for: Cloud AI coding agent platform (Stallion)*
*Researched: 2026-03-07*
