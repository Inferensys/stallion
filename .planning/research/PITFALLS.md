# Pitfalls Research

**Domain:** Cloud AI coding agent platform (Claude Code as a service)
**Researched:** 2026-03-07
**Confidence:** HIGH — based on real incidents (Replit DB deletion, Devin failures, Claude Code CVEs, Manus cost abuse), verified against official docs and multiple primary sources

---

## Critical Pitfalls

### Pitfall 1: Shared-Kernel Container Isolation Is Not Enough

**What goes wrong:**
Using standard Docker containers to isolate CC sessions appears secure but isn't. Containers share the host kernel. A single kernel exploit (e.g., CVE-2024-1086 netfilter use-after-free, CVE-2025-31133 runc maskedPaths bypass) gives an attacker host access and lateral movement to every other tenant's session.

The runc CVEs disclosed in November 2025 affected AWS, Azure, and GCP simultaneously, and required emergency patches across all major cloud providers. n8n, a popular workflow platform, was found to have two independent sandbox escape paths in its container-based execution, exposing hundreds of thousands of enterprise systems.

**Why it happens:**
Containers are familiar, fast, and operationally simple. Teams prototype with Docker and never revisit the isolation model. "It works" until it doesn't. The mistake is treating containers as a security boundary rather than a process-isolation mechanism.

**How to avoid:**
Use microVM-level isolation (Firecracker) or gVisor for all CC session execution environments. Firecracker provides hardware-enforced boundaries — a kernel exploit inside a session's VM only compromises that VM, not the host. E2B (the leading AI sandbox platform) chose Firecracker specifically for this reason.

If Firecracker operational complexity is too high for the initial phase, use gVisor (used by Google Cloud's Agent Sandbox and Modal for ML workloads) as an intermediate option — it intercepts syscalls in userspace, dramatically reducing kernel attack surface, though with ~70-80% syscall compatibility and some I/O overhead.

Never run CC sessions in standard Docker/runc containers in a multi-tenant environment.

**Warning signs:**
- CC session containers are running with `--privileged` flag
- No seccomp profiles applied (Kubernetes defaults to Unconfined)
- Container runtime is `runc` with no additional isolation layer
- Kernel version unpatched beyond 48 hours of CVE disclosure

**Phase to address:** Sandbox Infrastructure (earliest phase — this is load-bearing for everything else)

---

### Pitfall 2: No Session Budget Cap Leads to Runaway API Costs

**What goes wrong:**
A single CC session with no cost ceiling can drain thousands of dollars in API spend. Manus AI users reported burning through 1,000 free credits (an entire monthly allocation) on their first request. Industry data shows AI agent cost overruns average 340% above estimates; one startup saw a 1,700% spike during a provider outage when retry logic burned through backup budgets. 73% of teams are reportedly "one prompt away from budget disaster."

For Stallion, this is compounded: one runaway session per user is a business cost, but multiple concurrent runaway sessions are existential.

**Why it happens:**
LLMs are non-deterministic — a task that costs $0.10 one run costs $12 the next if CC loops, retries, or spawns many sub-agents. No hard ceiling means no upper bound. BYO API key partially transfers risk to users, but platform-level compute (the CC subprocess itself, the sandbox VM) still costs money regardless.

**How to avoid:**
Enforce hard limits at the infrastructure layer, not application logic:
- **Per-session token budget**: Hard `max_tokens` ceiling per SDK `query()` call
- **Per-session wall clock limit**: Terminate CC subprocess after configurable maximum (e.g., 30 min default, 2 hr max)
- **Per-session API call count**: Abort after N LLM API calls regardless of tokens
- **Anomaly detection**: Alert when a session's spend rate exceeds 3x its rolling average
- **User-visible cost estimate**: Show estimated cost before session starts (Manus's #1 UX complaint was no upfront cost visibility)

**Warning signs:**
- A session has been running for >30 minutes with no user interaction
- Token consumption accelerating (geometric not linear growth)
- CC process restarting in a loop (SDK cold start spike pattern)
- Single session consuming >$5 in API costs

**Phase to address:** Session Lifecycle Management phase (before any public access)

---

### Pitfall 3: Claude Code SDK Subprocess Orphan Memory Leaks

**What goes wrong:**
The Claude Agent SDK spawns a `cli.js` subprocess (~1GiB RAM each) per `query()` call. These subprocesses accumulate and are never terminated when the parent process ends, the session crashes, or the container is recycled. Confirmed issues from the official Anthropic GitHub repo:

- 48 orphaned Claude subprocesses consuming 2.3 GB after 17 hours of normal usage
- Long-running sessions growing to 23GB RAM, 143% CPU before OOM kill
- Sessions growing to 93GB+ heap allocation in extended use
- `/tmp/claude-*-cwd` temp files accumulating indefinitely, never cleaned up
- Subagents spawned via Task tool surviving parent session termination

In a multi-tenant cloud environment running dozens of concurrent sessions, this is a crash-and-burn scenario without explicit cleanup.

**Why it happens:**
The SDK was designed for local developer use, not long-running multi-tenant server deployment. Process lifecycle management was not a design consideration. The `query()` call spins up the CC CLI as a subprocess, and Node.js/OS process cleanup on abnormal termination is unreliable.

**How to avoid:**
- Wrap every `query()` call with a process-group supervisor that tracks child PIDs
- On session end (success, failure, timeout, or user disconnect), send SIGTERM to the CC subprocess PID and all its descendants using `process.kill(-pid)` (process group kill)
- Set a container-level PID namespace so all CC child processes die when the container dies
- Implement a health check daemon that scans for orphaned Claude processes every 5 minutes and terminates them
- Mount `/tmp` as `tmpfs` with a size cap to prevent temp file accumulation
- Schedule periodic container recycling (e.g., every 4 hours) regardless of session state as a backstop

**Warning signs:**
- Container RSS grows linearly over time without bound
- `ps aux | grep claude` shows processes with PPID=1 (orphaned)
- `/tmp/claude-*-cwd` file count exceeds session count
- Container memory approaching limit while session appears idle

**Phase to address:** Session Lifecycle Management; also revisit in Reliability/Scaling phase

---

### Pitfall 4: MCP Marketplace as an Attack Vector

**What goes wrong:**
A curated MCP marketplace is a supply chain attack surface. Real documented incidents:

- A malicious "Postmark MCP Server" on npm injected BCC copies of all emails to an attacker's server
- The official GitHub MCP server was exploited via prompt injection in a public GitHub issue — private repo contents were exfiltrated to a public PR
- Anthropic's own Filesystem-MCP server had a sandbox escape allowing arbitrary file read
- CVE-2025-6514: `mcp-remote` passed `authorization_endpoint` directly to the system shell, enabling RCE on the client
- "Rug pull" attacks: MCP tools that appear safe on Day 1 silently reroute API keys to attacker infrastructure on Day 7 after initial approval
- Tool poisoning: malicious instructions hidden in MCP tool descriptions, visible to the LLM but not the user

**Why it happens:**
MCP tools run with whatever permissions the CC session has. The permission model is "user approves the tool once" — not "user approves each action." Marketplace trust bootstrapping is hard: how do you verify a third-party MCP server is safe?

**How to avoid:**
- **Static analysis before listing**: Scan all marketplace MCP server packages for known malicious patterns, hardcoded exfiltration endpoints, and suspicious network behavior before listing
- **Network egress allowlist per MCP**: Each MCP server declares its required domains; CC session's network policy allows only those domains for that tool's traffic
- **MCP execution in isolated subprocess**: Run MCP servers in a separate, more restricted process than the CC session itself
- **Version pinning + update approval**: Pin all installed MCP versions; require explicit user approval for any version update (prevents rug pulls)
- **Credential proxy**: Never expose raw API keys to MCP tools — use a proxy that injects credentials, so the MCP server makes authenticated calls without ever seeing the credential
- **Tool output sanitization**: Treat all MCP tool output as untrusted; apply input filtering before injecting into CC context

**Warning signs:**
- MCP package has very recent publish date with no history
- MCP server makes network calls to domains not declared in its manifest
- Tool description contains unusually long or encoded text (tool poisoning)
- Session makes unexpected API calls to external endpoints after MCP installation

**Phase to address:** MCP Marketplace phase; credential proxy should be in Session Infrastructure phase

---

### Pitfall 5: Workspace Prompt Injection and Data Exfiltration

**What goes wrong:**
CC operates on files in the user's workspace. If a user points CC at a repository containing malicious content (a crafted `CLAUDE.md`, `.claude/settings.json`, or even a README), CC can be hijacked via indirect prompt injection to exfiltrate secrets, SSH keys, `.env` files, or source code. This is OWASP LLM Top 10 #1 (2025).

Claude Code-specific CVEs disclosed in 2026:
- CVE-2025-59536: Malicious `.claude/settings.json` in a cloned repo executed shell commands before the trust prompt appeared
- CVE-2026-21852: Malicious `ANTHROPIC_BASE_URL` in project config redirected API calls (including the API key) to an attacker's server before trust prompt
- Check Point demonstrated RCE and API key exfiltration by simply opening a crafted repository

**Why it happens:**
CC treats its configuration files as instructions. In a cloud context, users may import repositories from GitHub, upload zip files, or paste project URLs. Any of these can contain adversarial content targeting CC's hook and settings system.

**How to avoid:**
- **Workspace quarantine**: New workspaces start in a trust-zero state; CC hooks and project settings are disabled until explicitly reviewed
- **`.claude/` directory stripping**: On workspace import/clone, strip `.claude/` directory contents and inject Stallion-controlled settings instead
- **Environment variable proxy**: Never expose `ANTHROPIC_API_KEY` to the CC subprocess directly — use a proxy pattern where CC calls `http://localhost:PROXY_PORT` and the proxy injects the real key
- **Egress filtering**: Block all non-whitelisted outbound connections from CC sessions; exfiltration via API base URL redirect is impossible if network egress is controlled
- **File access scoping**: CC's workspace root should be a minimal directory; no access to `/etc`, `~/.ssh`, `~/.aws`, or other credential stores

**Warning signs:**
- Workspace contains `.claude/settings.json` or `CLAUDE.md` with unusual content
- CC session making API calls to unexpected endpoints
- Session requesting access to files outside the workspace directory
- Unusual network traffic patterns immediately after workspace load

**Phase to address:** Sandbox Infrastructure phase (egress control, credential proxy); Workspace Management phase (settings stripping, file scoping)

---

### Pitfall 6: Zombie Sessions Silently Consuming Compute

**What goes wrong:**
Cloud environments accumulate "zombie" sessions — CC subprocesses still running after the user disconnected or the session logically ended. Industry data suggests up to 30% of enterprise cloud spend goes to zombie resources. For a session-heavy platform like Stallion, this compounds: each zombie CC session holds ~1GiB RAM, 1-2 CPUs, a container, and an open SDK process.

The problem is detection: a zombie session often looks alive (process is running, WebSocket connection may be half-open) but is doing nothing useful.

**Why it happens:**
TCP connections can appear live for minutes after client disconnects (keepalive, NAT timeout). CC is a long-running subprocess — there's no natural "done" signal if the user just closes their browser tab. Session state machines default to "running" and never transition to "stopped."

**How to avoid:**
- **Heartbeat requirement**: Frontend must send a heartbeat every 30 seconds; if backend receives no heartbeat for 90 seconds, mark session as "abandoned"
- **Abandoned session grace period**: Give abandoned sessions 5 minutes (in case of network flap), then terminate CC subprocess and archive session state
- **Idle timeout**: Sessions with no CC tool activity for X minutes (configurable, e.g., 15 min) automatically pause; CC subprocess stops, sandbox hibernates
- **Hard session TTL**: Every session has a maximum lifetime (e.g., 24 hours); after that, it must be explicitly renewed
- **Session sweep job**: Background cron every 5 minutes cleans up sessions whose containers have exited but whose DB records still show "running"
- **Resource accounting**: Track per-session CPU/memory in real-time; alert when a "completed" session still shows resource consumption

**Warning signs:**
- Session count in DB is higher than active CC subprocess count
- Containers with no network I/O for >30 minutes still marked as running
- Total compute cost growing faster than active session count
- User reconnects to a session and sees it "running" but no progress since they left

**Phase to address:** Session Lifecycle Management phase

---

### Pitfall 7: No Session Resumability After Crash

**What goes wrong:**
CC sessions crash (OOM kill, network partition, provider timeout, deployment restart). If there's no checkpoint or resume mechanism, users lose all work in progress. The Devin team reported that even partial successes were lost when the agent got stuck and needed to restart — users had to start from scratch. This is a major UX failure for a platform positioning itself as "just describe what you want and watch it get built."

**Why it happens:**
Most teams build the "happy path" first. Resumability is treated as a nice-to-have, not a core requirement. The CC SDK's `query()` model is inherently stateless — each call starts fresh unless the conversation history is explicitly re-injected.

**How to avoid:**
- **Conversation persistence**: Store every CC message turn (user, assistant, tool use, tool result) durably as it happens, not just at session end
- **Workspace snapshot**: The workspace filesystem is the primary artifact — ensure it's on durable storage (not ephemeral container fs) so a container crash doesn't lose file changes
- **Resume protocol**: When a user reconnects to a crashed session, reload conversation history and reinject it into a new `query()` call with a "you were working on X, last completed step was Y" prompt
- **Progress checkpoints**: After each major CC task completion (a file written, a test passing), emit a checkpoint event that the session manager persists
- **Clear session states**: RUNNING, PAUSED, COMPLETED, CRASHED, ARCHIVED — crash must be distinguishable from completion

**Warning signs:**
- Session state stored only in memory (Zustand store without DB persistence)
- Workspace files written to container's ephemeral filesystem
- "Resume" feature deferred to a later phase while sandbox is built on ephemeral storage
- No handling for `SIGTERM` during SDK `query()` execution

**Phase to address:** Session Lifecycle Management phase; workspace storage design must be durable from day one

---

### Pitfall 8: SDK Cold Start Compound Latency

**What goes wrong:**
The Claude Agent SDK `query()` has ~12 seconds of overhead per call due to spawning a new `cli.js` subprocess with no process reuse. In a cloud context, this compounds with container cold start (if the container isn't warm), network latency to the Azure AI Foundry endpoint, and any queuing delays. The result is a 20-40 second delay before a user sees any activity after starting a session — which feels broken.

**Why it happens:**
The SDK was not designed for sub-second response. It boots a full CC process, initializes tools, connects to MCP servers, and loads the system prompt on every `query()` call. GitHub Issue #34 on the TypeScript SDK explicitly flags this as "the highest priority issue for production viability."

**How to avoid:**
- **Pre-warm containers**: Maintain a pool of N containers with CC subprocesses already initialized and waiting; assign one to each new session rather than cold-starting
- **Keep the subprocess alive**: Once `query()` completes, do NOT kill the CC subprocess — keep it warm for the next user message in the same session (the SDK's warm reuse is the only mitigation for the ~12s overhead)
- **Decouple session creation from CC start**: Create the session and workspace immediately (fast), then start the CC subprocess asynchronously — show users a "preparing your workspace" state rather than a blank spinner
- **Streaming UI**: Surface the first tokens to the user as soon as they arrive; the perceived latency of a streaming response is much lower than waiting for a full response

**Warning signs:**
- New session creation takes >15 seconds from user click to first output
- Each user message in an ongoing session triggers a full SDK cold start
- Container startup metrics show P95 >30 seconds
- Users reporting "is it working?" after submitting their first task

**Phase to address:** Session Infrastructure phase; pre-warming strategy should be designed before scaling

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Docker containers instead of microVMs for CC sandboxing | Faster to set up, familiar toolchain, cheaper | Multi-tenant kernel attack surface; regulatory non-compliance; rewrite required when scaling | Never — foundation shapes everything |
| Storing conversation history in memory only | Simple, no DB schema needed | Session crash = all history lost; no resumability; no debugging | MVP with single user only (never with real users) |
| Exposing `ANTHROPIC_API_KEY` directly to CC subprocess | No proxy complexity | Exposed to workspace prompt injection via CVE-2026-21852 class attacks | Never |
| No session cost limits during early development | Easy to iterate | Runaway API costs; accidental $500 sessions; no billing model foundation | Dev only, not beta |
| Using same MCP marketplace listing for all users (no per-user versions) | Simple schema | Rug pull attack affects all users simultaneously; no individual rollback | Never once marketplace is live |
| Allowing CC to write anywhere in the container filesystem | No path-scoping logic needed | CC can write to hook configs, MCP settings, cron jobs — persistence mechanism for malicious workspace content | Never |
| Skipping workspace import sanitization (.claude/ stripping) | Faster feature delivery | CVE-2025-59536-class attack surface present from day one | Never |
| Single shared container for multiple CC sessions | Cost savings | Blast radius of one session's compromise = all sessions | Never in multi-tenant context |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Claude Agent SDK | Killing the CC subprocess between messages in a session | Keep subprocess alive across turns; cold start only on new session creation |
| Claude Agent SDK | Not handling `SIGTERM` during `query()` | Register SIGTERM handler; gracefully drain current turn, persist state, then exit |
| Azure AI Foundry | Not setting `max_tokens` on API calls | Always set explicit max_tokens; unbounded completions are the #1 runaway cost source |
| Azure AI Foundry | No retry with exponential backoff | Provider outages trigger naive retry loops that burn 1000% of budget in minutes |
| MCP servers | Allowing MCP output to flow unsanitized into CC context | Treat MCP responses as untrusted; apply a sanitization pass before injecting |
| WebSocket (Socket.IO) | Trusting client-reported session ID without server verification | Validate every session action against authenticated user's owned sessions in DB |
| Workspace filesystem | Mounting the user's workspace at container root | Mount at a specific `/workspace` path; block CC from accessing `/etc`, `/home`, `/root` |
| User API keys (BYO) | Storing raw API keys in session env vars | Store encrypted in DB; inject at runtime via proxy; never log or transmit raw keys |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| One CC subprocess per message (not per session) | 12-second delay on every user message | Keep subprocess alive for session lifetime; only cold-start once per session | Immediately (day one) |
| No container pre-warming | Session start takes 30+ seconds under load | Maintain warm container pool sized to expected concurrency | When concurrent user count exceeds ~5 |
| Synchronous session startup on HTTP request | API timeouts during high concurrency | Queue session start jobs; return session ID immediately, stream readiness via WebSocket | ~10 concurrent session starts |
| Storing all session events in single table without partitioning | Events query slows as session count grows | Partition events by session_id; archive old sessions to cold storage | ~10K sessions in DB |
| Polling for session status instead of WebSocket events | O(N) DB queries per active user | Event-driven architecture only; never poll from frontend | ~50 concurrent users |
| Container images without layer caching | Every deploy takes 10+ minutes; slow rollbacks | Pin base images; separate app layer from system layer in Dockerfile | First deploy with >5 concurrent users trying to start sessions |
| No memory limit on CC container | OOM kill cascades to other sessions on same host | `--memory` flag on container; evict before OOM | Session with memory leak bug hits production |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| CC session has host network access | Session can make requests to internal cloud metadata endpoints (AWS `169.254.169.254`), other sessions' containers, or internal services | Network namespace isolation; allowlist-only egress; block RFC1918 and link-local from session containers |
| Raw user API keys in CC environment | Workspace prompt injection (CVE-2026-21852 class) exfiltrates key to attacker-controlled endpoint | Proxy pattern: CC calls `localhost:PORT`, proxy injects real key; CC never sees it |
| No audit log of tool calls | Cannot investigate security incidents; no evidence for abuse reports | Log every Bash tool invocation, every file write, every network connection from CC sessions |
| Shared filesystem between sessions | Session A can read or overwrite Session B's workspace | Per-session isolated volume mounts; no shared directories between sessions |
| `.claude/` settings accepted from imported workspace | Enables CVE-2025-59536 class hook execution before trust prompt | Strip `.claude/` on workspace import; inject only Stallion-controlled CC config |
| MCP tools with no network egress policy | MCP tool can exfiltrate data to arbitrary endpoints using the CC session's network | Declare + enforce allowed domains per MCP; block undeclared egress from MCP processes |
| No session isolation in WebSocket room | Malicious client broadcasts to other users' session rooms | Server enforces room membership based on authenticated session ownership; clients cannot join arbitrary rooms |
| CC subprocess running as root inside container | Container escape grants immediate root on host | Run CC subprocess as non-root user (uid 1000) inside container; no `--privileged` |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No upfront cost estimate | Users burn through credits on first request (Manus's #1 complaint) | Show estimated token range before starting; update live during session |
| No session progress indicator during long tasks | Users assume it's broken and refresh (destroying session state) | Heartbeat pings from CC displayed as "still working..." with elapsed time |
| Binary session states (running/done) | Users can't tell if CC is thinking vs. stuck vs. done | Granular states: initializing, planning, executing, waiting_for_input, completed, paused |
| CC output is raw SDK events | Raw events are noisy and meaningless to non-developers | Structured activity feed: tool summaries, human-readable action descriptions, clear file change log |
| Session history lost on browser refresh | Users lose context of what was built | Persist full session transcript in DB; reload on reconnect |
| MCP installation succeeds but silently fails at runtime | User thinks a capability is available but it isn't | Test MCP server connectivity at install time; surface health status in session UI |
| No way to stop CC mid-task | CC pursues a wrong path for 20 minutes; user can't intervene | Prominent stop button; graceful interruption that preserves work done so far |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Sandbox isolation**: Container running does NOT mean isolated — verify no `--privileged`, seccomp profile is applied, network egress is restricted, filesystem access is scoped to `/workspace`
- [ ] **Session termination**: Session marked "completed" in DB does NOT mean CC subprocess exited — verify process group was killed and container stopped
- [ ] **MCP installation**: "Install" button succeeded does NOT mean MCP server is functional — verify it passed health check and can handle CC tool calls
- [ ] **API key injection**: CC can make API calls does NOT mean the key is secure — verify it's going through the proxy, not directly in subprocess env
- [ ] **Workspace persistence**: Files appear in the file browser does NOT mean they survive a container restart — verify they're on the durable volume, not ephemeral container FS
- [ ] **Session cost limits**: Budget cap configured in code does NOT mean it's enforced at infrastructure level — verify hard limits exist at API gateway layer, not just application logic
- [ ] **Session resumability**: Conversation history stored does NOT mean sessions are resumable — verify a test session can be crashed and resumed with full context
- [ ] **MCP credential isolation**: MCP tool receives credentials does NOT mean they're secure — verify MCP process cannot read raw keys from env or filesystem

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Container escape via kernel CVE | HIGH | Rotate all credentials, audit all session workspaces for tampering, deploy patched runtime, notify affected users, conduct full incident review |
| Runaway API spend | MEDIUM | Hard-kill CC subprocess, apply emergency budget cap, refund user, audit logs for root cause, deploy rate limiting fix |
| Mass zombie session accumulation | LOW | Run emergency sweep job to terminate all sessions older than TTL, force-recycle containers, verify session state machine logic |
| MCP supply chain compromise | HIGH | Remove compromised MCP from marketplace immediately, terminate all active sessions using it, rotate any credentials the MCP had access to, audit for data exfiltration |
| SDK memory leak causing OOM cascade | MEDIUM | Restart affected containers, implement process memory limit enforcement, add memory-based zombie detection, schedule periodic container recycling as backstop |
| Workspace prompt injection / API key exfiltration | HIGH | Rotate affected API keys immediately, audit all sessions that ran in the same window, strip `.claude/` from all existing workspaces, deploy proxy pattern |
| Session state loss from CC crash | LOW | Restore from last persisted checkpoint, reinject conversation history into new CC session, notify user with option to continue or restart |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Shared-kernel container escape | Sandbox Infrastructure (Phase 1) | Penetration test with container escape CVEs against dev environment |
| Runaway API costs | Session Lifecycle Management (Phase 2) | Load test with intentionally expensive prompts; verify hard kill triggers |
| SDK orphan memory leaks | Session Lifecycle Management (Phase 2) | 24-hour soak test; verify RSS stays flat across 100 session cycles |
| MCP supply chain attacks | MCP Marketplace (Phase 4) | Red team exercise: publish a test malicious MCP, verify detection fires |
| Workspace prompt injection | Sandbox Infrastructure (Phase 1) + Session Management (Phase 2) | Place CVE-2025-59536-style `.claude/settings.json` in test workspace; verify it's stripped |
| Zombie sessions | Session Lifecycle Management (Phase 2) | Kill browser tab mid-session; verify container terminates within 90 seconds |
| No session resumability | Session Lifecycle Management (Phase 2) | SIGKILL CC process mid-session; verify user can resume with full context |
| SDK cold start latency | Session Infrastructure (Phase 1) | Measure P50/P95 time-to-first-token; must be <5s on warm path |
| Credential exposure via MCP | MCP Marketplace (Phase 4) | Verify MCP process cannot read `ANTHROPIC_API_KEY` from env or filesystem |
| Cryptomining/network abuse | Sandbox Infrastructure (Phase 1) | Attempt outbound connections to crypto pool domains from within session container |

---

## Sources

- [Devin AI poor performance report — The Register, January 2025](https://www.theregister.com/2025/01/23/ai_developer_devin_poor_reviews/)
- [Devin AI security vulnerability discovered live on stream — Hacker News](https://news.ycombinator.com/item?id=42420423)
- [Hidden Security Risks of SWE Agents like OpenAI Codex and Devin AI — Pillar Security](https://www.pillar.security/blog/the-hidden-security-risks-of-swe-agents-like-openai-codex-and-devin-ai)
- [Container Escape Vulnerabilities: AI Agent Security for 2026 — Blaxel Blog](https://blaxel.ai/blog/container-escape)
- [How to sandbox AI agents in 2026: MicroVMs, gVisor & isolation strategies — Northflank](https://northflank.com/blog/how-to-sandbox-ai-agents)
- [n8n Sandbox Escape: Critical Vulnerabilities — Pillar Security](https://www.pillar.security/blog/n8n-sandbox-escape-critical-vulnerabilities-in-n8n-exposes-hundreds-of-thousands-of-enterprise-ai-systems-to-complete-takeover)
- [Manus AI pricing and credit system issues — eesel.ai](https://www.eesel.ai/blog/manus-ai-pricing)
- [AI Agent Cost Crisis — AICosts.ai Blog](https://www.aicosts.ai/blog/ai-agent-cost-crisis-budget-disaster-prevention-guide)
- [Hidden Costs of Agentic AI: Why 40% Fail Before Production — Galileo AI](https://galileo.ai/blog/hidden-cost-of-agentic-ai)
- [Worker daemon spawns Claude SDK subprocesses that never terminate — GitHub Issue](https://github.com/thedotmack/claude-mem/issues/1089)
- [Claude Agent SDK query() has ~12s overhead — GitHub Issue #34](https://github.com/anthropics/claude-agent-sdk-typescript/issues/34)
- [Claude Code memory leak: 23GB RAM after 14 hours — GitHub Issue #11377](https://github.com/anthropics/claude-code/issues/11377)
- [Claude Code memory leak: grows to 93GB heap — GitHub Issue #22188](https://github.com/anthropics/claude-code/issues/22188)
- [Orphaned subagent process leaks memory — GitHub Issue #20369](https://github.com/anthropics/claude-code/issues/20369)
- [Timeline of MCP Security Breaches — AuthZed](https://authzed.com/blog/timeline-mcp-breaches)
- [MCP Prompt Injection security problems — Simon Willison](https://simonwillison.net/2025/Apr/9/mcp-prompt-injection/)
- [11 Emerging AI Security Risks with MCP — Checkmarx Zero](https://checkmarx.com/zero-post/11-emerging-ai-security-risks-with-model-context-protocol/)
- [Claude Code flaws: RCE and API key exfiltration via project files (CVE-2025-59536, CVE-2026-21852) — Check Point Research](https://research.checkpoint.com/2026/rce-and-api-token-exfiltration-through-claude-code-project-files-cve-2025-59536/)
- [Claude Code flaws allow RCE and API key exfiltration — The Hacker News](https://thehackernews.com/2026/02/claude-code-flaws-allow-remote-code.html)
- [Securely deploying AI agents — Anthropic Official Docs](https://platform.claude.com/docs/en/agent-sdk/secure-deployment)
- [Replit AI deletes production database — Medium](https://medium.com/@ismailkovvuru/replit-ai-deletes-production-database-2025-devops-security-lessons-for-aws-engineers-4984c6e7a73d)
- [E2B vs Daytona sandbox comparison — ZenML Blog](https://www.zenml.io/blog/e2b-vs-daytona)
- [Firecracker vs Docker: Security Tradeoffs for Agentic Workloads — Nextkick Labs](https://nextkicklabs.substack.com/p/firecracker-vs-docker-security-tradeoffs)
- [AI Agent Data Exfiltration — Trend Micro Part III](https://www.trendmicro.com/vinfo/us/security/news/threat-landscape/unveiling-ai-agent-vulnerabilities-part-iii-data-exfiltration)
- [OWASP AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)
- [Practical Security Guidance for Sandboxing Agentic Workflows — NVIDIA Developer Blog](https://developer.nvidia.com/blog/practical-security-guidance-for-sandboxing-agentic-workflows-and-managing-execution-risk/)
- [Zombie Containers in Kubernetes — IntelligenceX](https://blog.intelligencex.org/zombie-containers-in-kubernetes-the-unseen-threat-in-production)
- [Cryptojacking: Understanding and defending against cloud compute resource abuse — Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog/2023/07/25/cryptojacking-understanding-and-defending-against-cloud-compute-resource-abuse/)

---
*Pitfalls research for: Cloud AI coding agent platform (Stallion — cloud Claude Code wrapper)*
*Researched: 2026-03-07*
