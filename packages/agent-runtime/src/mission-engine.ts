import { query, type SDKMessage, type Options, type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { nanoid } from "nanoid";
import fs from "node:fs/promises";
import path from "node:path";
import type { MissionPlan, MissionTask, MissionAgentState, SessionEvent } from "@stallion/shared";
import { type MissionEnvConfig, buildProcessEnv, getWorkspaceRoot } from "./mission-env.js";

// ─── Orchestrator Prompt ─────────────────────────────────────────────────────

function buildOrchestratorPrompt(plan: MissionPlan): string {
  const taskList = plan.tasks
    .map((t) => {
      const deps = t.dependencies.length > 0 ? ` (depends on: ${t.dependencies.join(", ")})` : "";
      const assignee = t.assignee ? ` [assigned to: ${t.assignee}]` : "";
      return `- [${t.id}] ${t.title}${assignee}${deps}\n  ${t.description}`;
    })
    .join("\n");

  const agentList = plan.agents
    .map((a) => `- **${a.name}** (subagent_type: "${a.name}"): ${a.description}`)
    .join("\n");

  // Compute parallel groups from dependency graph
  const parallelAnalysis = buildParallelAnalysis(plan.tasks);

  return `You are the Mission Orchestrator for Stallion. You are executing the following mission plan.

## Mission: ${plan.title}
**Objective:** ${plan.objective}

## Available Agents
${agentList}

## Task List
${taskList}

## Execution Strategy — PARALLEL DISPATCH
${parallelAnalysis}

## Instructions
1. **Analyze dependencies first.** Tasks with NO unmet dependencies MUST be dispatched simultaneously.
2. **Use the Task tool** to dispatch work to subagents. Set \`subagent_type\` to the agent name (e.g. "${plan.agents[0]?.name ?? "agent-name"}").
3. **ALWAYS dispatch multiple Task calls in a single response** when multiple tasks have all dependencies met. This runs them in parallel. DO NOT wait for one agent to finish before dispatching the next independent task.
4. After each batch completes, immediately dispatch newly unblocked tasks.
5. When ALL tasks are complete, provide a final summary.

## Critical Rules
- Delegate ALL work to subagents via the Task tool — do not do the work yourself
- When dispatching, include the task ID in the prompt (e.g. "Complete task t1: ...")
- If a task has no assignee, choose the best-fit agent
- NEVER dispatch tasks sequentially when they could run in parallel`;
}

function buildParallelAnalysis(tasks: MissionTask[]): string {
  const completed = new Set<string>();
  const waves: string[][] = [];

  // Compute execution waves using topological sort
  const remaining = [...tasks];
  while (remaining.length > 0) {
    const wave = remaining.filter((t) =>
      t.dependencies.every((d) => completed.has(d))
    );
    if (wave.length === 0) break; // circular dependency guard
    waves.push(wave.map((t) => t.id));
    for (const t of wave) {
      completed.add(t.id);
      const idx = remaining.indexOf(t);
      if (idx >= 0) remaining.splice(idx, 1);
    }
  }

  return waves
    .map((ids, i) => {
      const label = ids.length > 1 ? `**Wave ${i + 1} (PARALLEL):**` : `**Wave ${i + 1}:**`;
      return `${label} ${ids.join(", ")}`;
    })
    .join("\n");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shortenPath(fullPath: unknown, workspace: string): string {
  const p = String(fullPath ?? "file");
  if (workspace && p.startsWith(workspace)) {
    return p.slice(workspace.length).replace(/^\//, "") || ".";
  }
  return p;
}

function summarizeToolUse(toolName: string, input: Record<string, unknown>, workspace: string): string {
  switch (toolName) {
    case "Read":
      return `Reading ${shortenPath(input.file_path ?? input.path, workspace)}`;
    case "Write":
      return `Writing ${shortenPath(input.file_path ?? input.path, workspace)}`;
    case "Edit":
      return `Editing ${shortenPath(input.file_path ?? input.path, workspace)}`;
    case "Bash":
      return `Running: ${String(input.command ?? "").slice(0, 80)}`;
    case "Grep":
      return `Searching for '${input.pattern ?? ""}'`;
    case "Glob":
      return `Finding files: ${input.pattern ?? ""}`;
    case "WebFetch":
      return `Fetching ${input.url ?? "URL"}`;
    case "WebSearch":
      return `Searching: ${input.query ?? ""}`;
    case "Task":
    case "Agent":
      return `Dispatching agent: ${String(input.description ?? "").slice(0, 60)}`;
    case "NotebookEdit":
      return `Editing notebook ${shortenPath(input.notebook_path, workspace)}`;
    default:
      return `Using ${toolName}`;
  }
}

/** Try to extract a task ID like "t1", "t2" from text. */
function extractTaskId(text: string, validIds: Set<string>): string | undefined {
  for (const id of validIds) {
    // Match task IDs like "t1", "task t1", "[t1]"
    const pattern = new RegExp(`\\b${id}\\b`, "i");
    if (pattern.test(text)) return id;
  }
  return undefined;
}

// ─── Mission Engine ──────────────────────────────────────────────────────────

export class MissionEngine {
  private envConfig: MissionEnvConfig;
  private agentStates: Map<string, MissionAgentState> = new Map();
  private abortController: AbortController | null = null;
  private pendingMessage: string | null = null;
  private toolUseToAgent = new Map<string, string>();
  private taskIdToAgent = new Map<string, string>();
  private agentToMissionTask = new Map<string, string>(); // agent name → plan task ID
  private workspace = "";
  private plan: MissionPlan | null = null;
  private validTaskIds = new Set<string>();

  constructor(envConfig: MissionEnvConfig) {
    this.envConfig = envConfig;
  }

  async initWorkspace(missionId: string): Promise<string> {
    const root = getWorkspaceRoot(this.envConfig);
    const workspace = path.join(root, missionId);
    await fs.mkdir(workspace, { recursive: true });
    // Resolve symlinks so paths match SDK output (macOS: /var → /private/var)
    return fs.realpath(workspace);
  }

  async executePlan(
    plan: MissionPlan,
    workspace: string,
    onEvent: (event: SessionEvent) => void,
  ): Promise<void> {
    this.abortController = new AbortController();
    this.workspace = workspace;
    this.plan = plan;
    this.validTaskIds = new Set(plan.tasks.map((t) => t.id));

    // Initialize agent states with displayName and specialization from plan
    for (const agent of plan.agents) {
      this.agentStates.set(agent.name, {
        name: agent.name,
        displayName: agent.displayName,
        specialization: agent.specialization,
        status: "idle",
        currentAction: null,
        messagesProcessed: 0,
      });
      onEvent({
        id: nanoid(),
        sessionId: plan.id,
        type: "agent_created",
        agent: agent.name,
        summary: `Agent "${agent.displayName ?? agent.name}" created: ${agent.description}`,
        timestamp: Date.now(),
      });
    }

    // Build AgentDefinition objects from plan
    const agents: Record<string, AgentDefinition> = {};
    for (const agent of plan.agents) {
      agents[agent.name] = {
        description: agent.description,
        prompt: agent.prompt,
        ...(agent.tools && { tools: agent.tools }),
        ...(agent.model && agent.model !== "inherit" && { model: agent.model as "sonnet" | "opus" | "haiku" }),
      };
    }

    const options: Options = {
      systemPrompt: buildOrchestratorPrompt(plan),
      agents,
      cwd: workspace,
      env: buildProcessEnv(this.envConfig),
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      abortController: this.abortController,
    };

    const prompt = `Execute the mission plan now. Analyze the dependency graph and dispatch the first wave of tasks immediately. Remember: dispatch ALL independent tasks in PARALLEL by making multiple Task tool calls in a single response.`;

    onEvent({
      id: nanoid(),
      sessionId: plan.id,
      type: "session_started",
      summary: `Mission "${plan.title}" execution started`,
      timestamp: Date.now(),
    });

    try {
      const queryResult = query({ prompt, options });

      for await (const msg of queryResult) {
        this.processMessage(msg, plan.id, onEvent);
      }

      // Mark any remaining in_progress tasks as completed
      if (this.plan) {
        for (const task of this.plan.tasks) {
          if (task.status === "in_progress") {
            task.status = "completed";
          }
        }
      }

      onEvent({
        id: nanoid(),
        sessionId: plan.id,
        type: "session_completed",
        summary: `Mission "${plan.title}" completed successfully`,
        timestamp: Date.now(),
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      onEvent({
        id: nanoid(),
        sessionId: plan.id,
        type: "session_error",
        summary: `Mission failed: ${errorMsg}`,
        data: { error: errorMsg },
        timestamp: Date.now(),
      });
      throw err;
    }
  }

  // ─── Agent Resolution ────────────────────────────────────────────────────

  private resolveAgent(msg: SDKMessage): string | undefined {
    // For messages with parent_tool_use_id, look up which agent owns that tool_use
    const parentId = "parent_tool_use_id" in msg ? (msg.parent_tool_use_id as string | undefined) : undefined;
    if (parentId) {
      return this.toolUseToAgent.get(parentId);
    }
    // For messages with task_id, look up which agent owns that task
    const taskId = "task_id" in msg ? (msg.task_id as string | undefined) : undefined;
    if (taskId) {
      return this.taskIdToAgent.get(taskId);
    }
    return undefined;
  }

  /**
   * Find the agent state by exact name match (from subagent_type),
   * falling back to description matching.
   */
  private resolveAgentFromTask(input: Record<string, unknown>): MissionAgentState | undefined {
    // Primary: exact match on subagent_type (this is the agent name)
    const agentType = input.subagent_type as string | undefined;
    if (agentType) {
      const state = this.agentStates.get(agentType);
      if (state) return state;
    }
    // Fallback: search description for agent name
    const desc = input.description as string | undefined;
    if (desc) {
      return this.findAgentByDescription(desc);
    }
    return undefined;
  }

  private findAgentByDescription(description: string): MissionAgentState | undefined {
    const lower = description.toLowerCase();
    for (const state of this.agentStates.values()) {
      if (lower.includes(state.name.toLowerCase())) {
        return state;
      }
    }
    return undefined;
  }

  // ─── Task Status Tracking ────────────────────────────────────────────────

  /**
   * When an agent starts working, find the task they're assigned to
   * and mark it in_progress.
   */
  private markTaskInProgress(agentName: string, promptText: string | undefined, sessionId: string, onEvent: (event: SessionEvent) => void): void {
    if (!this.plan) return;

    // If this agent already has an in-progress task, auto-complete it
    // (the SDK doesn't emit task_notification for built-in agents)
    const prevTaskId = this.agentToMissionTask.get(agentName);
    if (prevTaskId) {
      this.markTaskCompleted(agentName, sessionId, onEvent);
    }

    // Try to extract task ID from the prompt
    let taskId: string | undefined;
    if (promptText) {
      taskId = extractTaskId(promptText, this.validTaskIds);
    }

    // Fallback: find first pending task assigned to this agent
    if (!taskId) {
      const task = this.plan.tasks.find((t) =>
        t.assignee === agentName && t.status === "pending"
      );
      taskId = task?.id;
    }

    if (taskId) {
      const task = this.plan.tasks.find((t) => t.id === taskId);
      if (task && task.status === "pending") {
        task.status = "in_progress";
        this.agentToMissionTask.set(agentName, taskId);
        onEvent({
          id: nanoid(),
          sessionId,
          type: "task_status_changed",
          agent: agentName,
          summary: `Task ${taskId} started: ${task.title}`,
          data: { taskId, status: "in_progress" },
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * When an agent completes, mark their current task as completed.
   */
  private markTaskCompleted(agentName: string, sessionId: string, onEvent: (event: SessionEvent) => void): void {
    if (!this.plan) return;

    const taskId = this.agentToMissionTask.get(agentName);
    if (taskId) {
      const task = this.plan.tasks.find((t) => t.id === taskId);
      if (task && task.status === "in_progress") {
        task.status = "completed";
        this.agentToMissionTask.delete(agentName);
        onEvent({
          id: nanoid(),
          sessionId,
          type: "task_status_changed",
          agent: agentName,
          summary: `Task ${taskId} completed: ${task.title}`,
          data: { taskId, status: "completed" },
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * When an agent fails, mark their current task as failed.
   */
  private markTaskFailed(agentName: string, sessionId: string, onEvent: (event: SessionEvent) => void): void {
    if (!this.plan) return;

    const taskId = this.agentToMissionTask.get(agentName);
    if (taskId) {
      const task = this.plan.tasks.find((t) => t.id === taskId);
      if (task && task.status === "in_progress") {
        task.status = "failed";
        this.agentToMissionTask.delete(agentName);
        onEvent({
          id: nanoid(),
          sessionId,
          type: "task_status_changed",
          agent: agentName,
          summary: `Task ${taskId} failed: ${task.title}`,
          data: { taskId, status: "failed" },
          timestamp: Date.now(),
        });
      }
    }
  }

  // ─── Message Processing ──────────────────────────────────────────────────

  private processMessage(
    msg: SDKMessage,
    sessionId: string,
    onEvent: (event: SessionEvent) => void,
  ): void {
    if (msg.type === "assistant") {
      const agentName = this.resolveAgent(msg) ?? (("parent_tool_use_id" in msg && msg.parent_tool_use_id) ? undefined : "orchestrator");

      for (const block of msg.message.content) {
        if (block.type === "text" && block.text.trim()) {
          // Increment messagesProcessed for the resolved agent
          if (agentName && agentName !== "orchestrator") {
            const state = this.agentStates.get(agentName);
            if (state) state.messagesProcessed++;
          }

          onEvent({
            id: nanoid(),
            sessionId,
            type: "agent_message",
            agent: agentName,
            summary: block.text,
            timestamp: Date.now(),
          });
        } else if (block.type === "tool_use") {
          const isAgentDispatch = block.name === "Task" || block.name === "Agent";
          let dispatchedAgentName: string | undefined;

          if (isAgentDispatch) {
            // Subagent dispatch — resolve agent by subagent_type (exact match)
            const input = block.input as Record<string, unknown>;
            const state = this.resolveAgentFromTask(input);
            if (state) {
              dispatchedAgentName = state.name;
              this.toolUseToAgent.set(block.id, state.name);

              // If agent was previously working, emit completed first
              if (state.status === "working" || state.status === "completed") {
                onEvent({
                  id: nanoid(),
                  sessionId,
                  type: "agent_completed",
                  agent: state.name,
                  summary: `${state.displayName ?? state.name} completed previous task`,
                  data: {
                    durationMs: state.startedAt ? Date.now() - state.startedAt : undefined,
                  },
                  timestamp: Date.now(),
                });
              }

              state.status = "working";
              state.startedAt = Date.now();
              state.currentAction = input.prompt as string | null;

              // Track task status (auto-completes previous task if any)
              this.markTaskInProgress(state.name, input.prompt as string | undefined, sessionId, onEvent);

              onEvent({
                id: nanoid(),
                sessionId,
                type: "agent_working",
                agent: state.name,
                summary: `${state.displayName ?? state.name} started working`,
                data: { prompt: input.prompt },
                timestamp: Date.now(),
              });
            }
          }

          // Emit enriched tool_executed for all tool uses
          const input = block.input as Record<string, unknown>;
          const summary = summarizeToolUse(block.name, input, this.workspace);

          // Map this tool_use to the current agent context
          // BUT don't overwrite if we already mapped it to a dispatched agent above
          if (!dispatchedAgentName && agentName) {
            this.toolUseToAgent.set(block.id, agentName);
          }

          onEvent({
            id: nanoid(),
            sessionId,
            type: "tool_executed",
            agent: isAgentDispatch ? (dispatchedAgentName ?? agentName) : agentName,
            summary,
            data: { tool: block.name, input, summary },
            timestamp: Date.now(),
          });
        }
      }
    } else if (msg.type === "result") {
      if (msg.subtype === "success") {
        // Mark all working agents as completed, emit agent_completed events
        for (const state of this.agentStates.values()) {
          if (state.status === "working") {
            state.status = "completed";
            state.currentAction = null;
            this.markTaskCompleted(state.name, sessionId, onEvent);
            onEvent({
              id: nanoid(),
              sessionId,
              type: "agent_completed",
              agent: state.name,
              summary: `${state.displayName ?? state.name} completed`,
              data: {
                durationMs: state.startedAt ? Date.now() - state.startedAt : undefined,
              },
              timestamp: Date.now(),
            });
          }
        }
        // Mark ALL remaining non-completed tasks as completed
        // (the orchestrator may group work or skip explicit per-task dispatch)
        if (this.plan) {
          for (const task of this.plan.tasks) {
            if (task.status !== "completed") {
              task.status = "completed";
              onEvent({
                id: nanoid(),
                sessionId,
                type: "task_status_changed",
                summary: `Task ${task.id} completed: ${task.title}`,
                data: { taskId: task.id, status: "completed" },
                timestamp: Date.now(),
              });
            }
          }
        }
        onEvent({
          id: nanoid(),
          sessionId,
          type: "status_update",
          summary: `Mission result: ${msg.result?.slice(0, 200) ?? "completed"}`,
          data: {
            costUsd: msg.total_cost_usd,
            turns: msg.num_turns,
            durationMs: msg.duration_ms,
          },
          timestamp: Date.now(),
        });
      } else {
        onEvent({
          id: nanoid(),
          sessionId,
          type: "session_error",
          summary: `Mission error: ${msg.subtype}`,
          data: { subtype: msg.subtype },
          timestamp: Date.now(),
        });
      }
    } else if (msg.type === "system") {
      this.processSystemMessage(msg, sessionId, onEvent);
    } else if ("tool_name" in msg && "elapsed_time_seconds" in msg) {
      // tool_progress message
      const toolMsg = msg as SDKMessage & { tool_name: string; elapsed_time_seconds: number; tool_use_id?: string; task_id?: string };
      const agentName = this.resolveAgent(msg);
      onEvent({
        id: nanoid(),
        sessionId,
        type: "tool_executed",
        agent: agentName,
        summary: `${toolMsg.tool_name} (${toolMsg.elapsed_time_seconds.toFixed(1)}s)`,
        data: {
          tool: toolMsg.tool_name,
          elapsedSeconds: toolMsg.elapsed_time_seconds,
        },
        timestamp: Date.now(),
      });
    } else if ("summary" in msg && "preceding_tool_use_ids" in msg) {
      // tool_use_summary — Claude Code-style summarized action
      const summaryMsg = msg as SDKMessage & { summary: string; preceding_tool_use_ids?: string[] };
      const agentName = summaryMsg.preceding_tool_use_ids?.length
        ? this.toolUseToAgent.get(summaryMsg.preceding_tool_use_ids[0]!)
        : undefined;
      onEvent({
        id: nanoid(),
        sessionId,
        type: "agent_message",
        agent: agentName,
        summary: summaryMsg.summary,
        data: { isSummary: true },
        timestamp: Date.now(),
      });
    }
  }

  private processSystemMessage(
    msg: SDKMessage,
    sessionId: string,
    onEvent: (event: SessionEvent) => void,
  ): void {
    const sysMsg = msg as SDKMessage & { subtype?: string; task_id?: string; tool_use_id?: string; description?: string; status?: string; summary?: string; usage?: Record<string, unknown>; last_tool_name?: string };

    if (sysMsg.subtype === "task_started") {
      // Subagent launched — resolve agent via tool_use_id (set during Task tool_use processing)
      let agentName: string | undefined;
      if (sysMsg.tool_use_id) {
        agentName = this.toolUseToAgent.get(sysMsg.tool_use_id);
      }
      if (!agentName && sysMsg.description) {
        agentName = this.findAgentByDescription(sysMsg.description)?.name;
      }

      if (agentName && sysMsg.task_id) {
        this.taskIdToAgent.set(sysMsg.task_id, agentName);
      }
      if (agentName && sysMsg.tool_use_id) {
        this.toolUseToAgent.set(sysMsg.tool_use_id, agentName);
      }
      if (agentName) {
        const state = this.agentStates.get(agentName);
        if (state) {
          state.status = "working";
          state.startedAt = Date.now();
        }
      }
    } else if (sysMsg.subtype === "task_progress") {
      const agentName = sysMsg.task_id ? this.taskIdToAgent.get(sysMsg.task_id) : undefined;
      if (agentName) {
        // Keep agent status "working" during progress
        const state = this.agentStates.get(agentName);
        if (state && state.status !== "working") {
          state.status = "working";
        }
        onEvent({
          id: nanoid(),
          sessionId,
          type: "status_update",
          agent: agentName,
          summary: sysMsg.last_tool_name
            ? `${agentName}: using ${sysMsg.last_tool_name}`
            : `${agentName}: processing`,
          data: {
            lastTool: sysMsg.last_tool_name,
            usage: sysMsg.usage,
          },
          timestamp: Date.now(),
        });
      }
    } else if (sysMsg.subtype === "task_notification") {
      const agentName = sysMsg.task_id ? this.taskIdToAgent.get(sysMsg.task_id) : undefined;
      if (agentName) {
        const state = this.agentStates.get(agentName);
        if (sysMsg.status === "completed") {
          if (state) {
            state.status = "completed";
            state.currentAction = null;
          }
          // Mark the corresponding mission task as completed
          this.markTaskCompleted(agentName, sessionId, onEvent);

          const durationMs = sysMsg.usage?.duration_ms as number | undefined;
          onEvent({
            id: nanoid(),
            sessionId,
            type: "agent_completed",
            agent: agentName,
            summary: sysMsg.summary ?? `${state?.displayName ?? agentName} completed`,
            data: {
              durationMs,
              usage: sysMsg.usage,
            },
            timestamp: Date.now(),
          });
        } else if (sysMsg.status === "failed") {
          if (state) {
            state.status = "error";
            state.currentAction = null;
          }
          // Mark the corresponding mission task as failed
          this.markTaskFailed(agentName, sessionId, onEvent);

          onEvent({
            id: nanoid(),
            sessionId,
            type: "session_error",
            agent: agentName,
            summary: sysMsg.summary ?? `${state?.displayName ?? agentName} failed`,
            data: { usage: sysMsg.usage },
            timestamp: Date.now(),
          });
        }
      }
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  getAgentStates(): MissionAgentState[] {
    return Array.from(this.agentStates.values());
  }

  getTaskStatuses(): Array<{ id: string; status: string }> {
    if (!this.plan) return [];
    return this.plan.tasks.map((t) => ({ id: t.id, status: t.status }));
  }

  async sendMessage(content: string): Promise<void> {
    this.pendingMessage = content;
  }

  abort(): void {
    this.abortController?.abort();
  }
}
