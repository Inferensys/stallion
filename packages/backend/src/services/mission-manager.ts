import { nanoid } from "nanoid";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type {
  Mission,
  MissionPlan,
  SessionEvent,
  ChatMessage,
  MissionAgentState,
  ContainerStatus,
} from "@stallion/shared";
import { MissionPlanner, MissionEngine } from "@stallion/agent-runtime";
import type { MissionEnvConfig, ExplorationActivity } from "@stallion/agent-runtime";
import type { ContainerManager, CredentialPayload } from "./container-manager.js";

function buildEnvConfig(): MissionEnvConfig {
  const foundryResource = process.env.ANTHROPIC_FOUNDRY_RESOURCE;
  const foundryApiKey = process.env.ANTHROPIC_FOUNDRY_API_KEY;

  if (!foundryResource || !foundryApiKey) {
    throw new Error(
      "Missing required env vars: ANTHROPIC_FOUNDRY_RESOURCE and ANTHROPIC_FOUNDRY_API_KEY",
    );
  }

  return {
    foundryResource,
    foundryApiKey,
    defaultModel: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL,
    capableModel: process.env.ANTHROPIC_DEFAULT_OPUS_MODEL,
    workspaceRoot: process.env.STALLION_WORKSPACE_ROOT,
    imageGenEndpoint: process.env.AZURE_IMAGE_GEN_ENDPOINT,
    imageGenApiKey: process.env.AZURE_IMAGE_GEN_KEY,
  };
}

interface MissionData {
  planner: MissionPlanner;
  engine: MissionEngine | null;
  plan: MissionPlan | null;
  events: SessionEvent[];
  chat: ChatMessage[];
  status: Mission["status"];
  workspace: string;
  agents: MissionAgentState[];
  readinessScore: number | null;
  userId?: string;
  startedAt: number | null;
  completedAt: number | null;
  createdAt: number;
  // Container fields
  vncUrl?: string;
  containerStatus?: ContainerStatus;
  containerUnsubscribe?: () => void;
}

interface MissionSnapshot {
  id: string;
  plan: MissionPlan | null;
  events: SessionEvent[];
  chat: ChatMessage[];
  status: Mission["status"];
  workspace: string;
  agents: MissionAgentState[];
  readinessScore: number | null;
  userId?: string;
  startedAt: number | null;
  completedAt: number | null;
  createdAt: number;
}

export class MissionManager {
  private missions = new Map<string, MissionData>();
  private eventListeners = new Map<string, Set<(event: SessionEvent) => void>>();
  private envConfig: MissionEnvConfig;
  private dataDir: string;
  private saveTimers = new Map<string, NodeJS.Timeout>();
  private containerManager: ContainerManager | null = null;

  private constructor() {
    this.envConfig = buildEnvConfig();
    this.dataDir = path.join(os.homedir(), ".stallion", "missions");
  }

  static async create(containerManager?: ContainerManager): Promise<MissionManager> {
    const mm = new MissionManager();
    if (containerManager) {
      mm.containerManager = containerManager;
    }
    await fs.mkdir(mm.dataDir, { recursive: true });
    await mm.loadMissions();
    console.log(
      `MissionManager initialized (Foundry: ${mm.envConfig.foundryResource}, data: ${mm.dataDir}, containers: ${containerManager ? "enabled" : "disabled"})`,
    );
    return mm;
  }

  private useContainers(): boolean {
    return this.containerManager !== null && process.env.STALLION_USE_CONTAINERS === "true";
  }

  private async saveMission(id: string, immediate = false): Promise<void> {
    // Clear any existing debounce timer
    const existing = this.saveTimers.get(id);
    if (existing) clearTimeout(existing);

    if (immediate) {
      await this.writeMissionSnapshot(id);
    } else {
      const timer = setTimeout(() => {
        this.writeMissionSnapshot(id).catch((err) =>
          console.error(`Failed to save mission ${id}:`, err),
        );
        this.saveTimers.delete(id);
      }, 1000);
      this.saveTimers.set(id, timer);
    }
  }

  private async writeMissionSnapshot(id: string): Promise<void> {
    const data = this.missions.get(id);
    if (!data) return;

    const snapshot: MissionSnapshot = {
      id,
      plan: data.plan,
      events: data.events,
      chat: data.chat,
      status: data.status,
      workspace: data.workspace,
      agents: data.agents,
      readinessScore: data.readinessScore,
      userId: data.userId,
      startedAt: data.startedAt,
      completedAt: data.completedAt,
      createdAt: data.createdAt,
    };

    const filePath = path.join(this.dataDir, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(snapshot), "utf-8");
  }

  private async loadMissions(): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.dataDir);
    } catch {
      return;
    }

    const jsonFiles = entries.filter((e) => e.endsWith(".json"));
    for (const file of jsonFiles) {
      try {
        const raw = await fs.readFile(path.join(this.dataDir, file), "utf-8");
        const snapshot: MissionSnapshot = JSON.parse(raw);

        // If was running/launching, mark as failed (can't resume SDK session)
        let status = snapshot.status;
        let completedAt = snapshot.completedAt;
        if (status === "running" || status === "launching") {
          status = "failed";
          completedAt = Date.now();
        }

        const data: MissionData = {
          planner: new MissionPlanner(this.envConfig),
          engine: null,
          plan: snapshot.plan,
          events: snapshot.events,
          chat: snapshot.chat,
          status,
          workspace: snapshot.workspace,
          agents: snapshot.agents,
          readinessScore: snapshot.readinessScore ?? null,
          userId: snapshot.userId,
          startedAt: snapshot.startedAt,
          completedAt,
          createdAt: snapshot.createdAt,
        };

        this.missions.set(snapshot.id, data);

        // If we changed status, persist that
        if (status !== snapshot.status) {
          await this.writeMissionSnapshot(snapshot.id);
        }
      } catch (err) {
        console.error(`Failed to load mission from ${file}:`, err);
      }
    }

    console.log(`Loaded ${this.missions.size} missions from disk`);
  }

  createMission(userId?: string): Mission {
    const id = `mission-${nanoid(10)}`;
    const data: MissionData = {
      planner: new MissionPlanner(this.envConfig),
      engine: null,
      plan: null,
      events: [],
      chat: [],
      status: "exploring",
      workspace: "",
      agents: [],
      readinessScore: null,
      userId,
      startedAt: null,
      completedAt: null,
      createdAt: Date.now(),
    };
    this.missions.set(id, data);
    this.saveMission(id);
    return this.toMission(id, data);
  }

  async planMission(
    id: string,
    userInput: string,
  ): Promise<{ type: "questions" | "plan"; content: string | MissionPlan }> {
    const data = this.missions.get(id);
    if (!data) throw new Error(`Mission ${id} not found`);

    // Store the user message
    data.chat.push({
      id: `msg-${nanoid(8)}`,
      sessionId: id,
      role: "user",
      content: userInput,
      timestamp: Date.now(),
    });

    const result = await data.planner.planMission(userInput, data.chat);

    if (result.type === "plan") {
      data.plan = result.content as MissionPlan;
      data.status = "review";
      data.agents = data.plan.agents.map((a) => ({
        name: a.name,
        displayName: a.displayName,
        specialization: a.specialization,
        status: "idle" as const,
        currentAction: null,
        messagesProcessed: 0,
      }));

      // Store assistant response
      data.chat.push({
        id: `msg-${nanoid(8)}`,
        sessionId: id,
        role: "assistant",
        content: `Mission plan created: **${data.plan.title}**\n\n${data.plan.objective}\n\nAgents: ${data.plan.agents.map((a) => a.name).join(", ")}\nTasks: ${data.plan.tasks.length}\nComplexity: ${data.plan.estimatedComplexity}`,
        timestamp: Date.now(),
      });

      this.emitEvent(id, {
        id: nanoid(),
        sessionId: id,
        type: "mission_planned",
        summary: `Mission plan created: ${data.plan.title}`,
        data: { plan: data.plan },
        timestamp: Date.now(),
      });
    } else {
      // Store assistant questions
      data.chat.push({
        id: `msg-${nanoid(8)}`,
        sessionId: id,
        role: "assistant",
        content: result.content as string,
        timestamp: Date.now(),
      });
    }

    this.saveMission(id, result.type === "plan");
    return result;
  }

  async exploreMission(
    id: string,
    userInput: string,
    onActivity?: (activity: ExplorationActivity) => void,
  ): Promise<{ text: string; readiness: number }> {
    const data = this.missions.get(id);
    if (!data) throw new Error(`Mission ${id} not found`);
    if (data.status !== "exploring") {
      throw new Error(`Mission ${id} is not in exploring status (current: ${data.status})`);
    }

    // Store user message
    data.chat.push({
      id: `msg-${nanoid(8)}`,
      sessionId: id,
      role: "user",
      content: userInput,
      timestamp: Date.now(),
    });

    // Stream activity events to WebSocket listeners (ephemeral — not persisted)
    const streamActivity = (activity: ExplorationActivity) => {
      onActivity?.(activity);
      this.notifyListeners(id, {
        id: nanoid(),
        sessionId: id,
        type: "exploration_activity",
        summary: activity.summary,
        data: { tool: activity.tool, activityType: activity.type },
        timestamp: activity.timestamp,
      });
    };

    // Stream token events to WebSocket listeners (ephemeral)
    const streamToken = (chunk: string) => {
      this.notifyListeners(id, {
        id: nanoid(),
        sessionId: id,
        type: "exploration_token",
        summary: chunk,
        timestamp: Date.now(),
      });
    };

    const result = await data.planner.explore(userInput, data.chat, streamActivity, streamToken);

    // Store clean assistant text
    data.chat.push({
      id: `msg-${nanoid(8)}`,
      sessionId: id,
      role: "assistant",
      content: result.text,
      agentRole: "explorer",
      timestamp: Date.now(),
    });

    data.readinessScore = result.readiness;
    this.saveMission(id);

    // Notify completion (ephemeral)
    this.notifyListeners(id, {
      id: nanoid(),
      sessionId: id,
      type: "exploration_done",
      summary: "Exploration response complete",
      data: { readiness: result.readiness, text: result.text },
      timestamp: Date.now(),
    });

    return result;
  }

  async beginPlanning(id: string): Promise<Mission> {
    const data = this.missions.get(id);
    if (!data) throw new Error(`Mission ${id} not found`);
    if (data.status !== "exploring") {
      throw new Error(`Mission ${id} is not in exploring status (current: ${data.status})`);
    }

    data.status = "planning";
    this.saveMission(id, true);

    // Build exploration context from chat history
    const explorationContext = data.chat
      .map((m) => `${m.role === "user" ? "User" : "Aria"}: ${m.content}`)
      .join("\n\n");

    const plan = await data.planner.planFromContext(explorationContext);

    if (plan) {
      data.plan = plan;
      data.status = "review";
      data.agents = plan.agents.map((a) => ({
        name: a.name,
        displayName: a.displayName,
        specialization: a.specialization,
        status: "idle" as const,
        currentAction: null,
        messagesProcessed: 0,
      }));

      data.chat.push({
        id: `msg-${nanoid(8)}`,
        sessionId: id,
        role: "assistant",
        content: `Mission plan created: **${plan.title}**\n\n${plan.objective}\n\nAgents: ${plan.agents.map((a) => a.name).join(", ")}\nTasks: ${plan.tasks.length}\nComplexity: ${plan.estimatedComplexity}`,
        agentRole: "planner",
        timestamp: Date.now(),
      });

      this.emitEvent(id, {
        id: nanoid(),
        sessionId: id,
        type: "mission_planned",
        summary: `Mission plan created: ${plan.title}`,
        data: { plan },
        timestamp: Date.now(),
      });
    } else {
      // Plan generation failed — stay in planning status
      data.chat.push({
        id: `msg-${nanoid(8)}`,
        sessionId: id,
        role: "assistant",
        content: "Failed to generate a mission plan from the conversation. Please try again.",
        agentRole: "planner",
        timestamp: Date.now(),
      });
    }

    await this.saveMission(id, true);
    return this.toMission(id, data);
  }

  async approvePlan(id: string): Promise<void> {
    const data = this.missions.get(id);
    if (!data) throw new Error(`Mission ${id} not found`);
    if (!data.plan) throw new Error(`Mission ${id} has no plan to approve`);

    data.status = "launching";
    data.startedAt = Date.now();

    if (this.useContainers()) {
      await this.approvePlanWithContainer(id, data);
    } else {
      await this.approvePlanLocal(id, data);
    }
  }

  /**
   * Container-based execution: create a Docker container, execute plan inside it,
   * and relay events back through WebSocket.
   */
  private async approvePlanWithContainer(id: string, data: MissionData): Promise<void> {
    const cm = this.containerManager!;

    try {
      // Emit container lifecycle event
      data.containerStatus = "creating";
      this.notifyListeners(id, {
        id: nanoid(),
        sessionId: id,
        type: "container_creating",
        summary: "Creating sandboxed container for mission execution",
        timestamp: Date.now(),
      });
      this.saveMission(id, true);

      // Create the container
      const containerInfo = await cm.createContainer(id, this.envConfig);
      data.containerStatus = "running";
      data.vncUrl = cm.getVncUrl(id) ?? undefined;
      data.workspace = "/workspace"; // inside container
      data.status = "running";

      this.emitEvent(id, {
        id: nanoid(),
        sessionId: id,
        type: "container_running",
        summary: `Container running (VNC: :${containerInfo.vncPort}, Control: :${containerInfo.controlPort})`,
        data: {
          containerId: containerInfo.containerId,
          vncPort: containerInfo.vncPort,
          controlPort: containerInfo.controlPort,
          vncUrl: data.vncUrl,
        },
        timestamp: Date.now(),
      });
      this.saveMission(id, true);

      // Track agent→task mapping for auto-complete (same pattern as MissionEngine)
      const agentToTask = new Map<string, string>();

      // Connect to event stream from container
      const unsubscribe = cm.connectEvents(id, (event) => {
        data.events.push(event);

        // Sync agent states and infer task progress from container events
        if (event.type === "agent_working" && event.agent) {
          const agentState = data.agents.find((a) => a.name === event.agent);
          if (agentState) {
            agentState.status = "working";
            agentState.currentAction = event.summary;
          }

          if (data.plan) {
            // Try to determine which task this dispatch is for
            const promptText = (event.data as Record<string, unknown> | undefined)?.prompt as string | undefined;
            let taskId: string | undefined;
            if (promptText) {
              for (const t of data.plan.tasks) {
                if (promptText.includes(t.id)) { taskId = t.id; break; }
              }
            }
            if (!taskId) {
              const task = data.plan.tasks.find(
                (t) => t.assignee === event.agent && t.status === "pending"
              );
              taskId = task?.id;
            }

            const prevTaskId = agentToTask.get(event.agent);

            // Only auto-complete previous task if this is a genuinely NEW task dispatch
            // (not a duplicate dispatch for the same task)
            if (prevTaskId && taskId && taskId !== prevTaskId) {
              const prevTask = data.plan.tasks.find((t) => t.id === prevTaskId);
              if (prevTask && prevTask.status === "in_progress") {
                prevTask.status = "completed";
              }
            }

            if (taskId) {
              const task = data.plan.tasks.find((t) => t.id === taskId);
              if (task && task.status === "pending") {
                task.status = "in_progress";
                agentToTask.set(event.agent, taskId);
              }
            }
          }
        }

        // Set completion state BEFORE notifying (WS handler reads data synchronously)
        if (event.type === "session_completed") {
          data.status = "completed";
          data.completedAt = Date.now();
          data.containerStatus = "stopped";
          // Mark all remaining tasks as completed (auto-complete any in-progress too)
          if (data.plan) {
            for (const task of data.plan.tasks) {
              if (task.status !== "failed") task.status = "completed";
            }
          }
          // Mark all agents as completed
          for (const agentState of data.agents) {
            if (agentState.status !== "error") {
              agentState.status = "completed";
              agentState.currentAction = null;
            }
          }
        } else if (event.type === "session_error" && !event.agent) {
          data.status = "failed";
          data.completedAt = Date.now();
          data.containerStatus = "error";
          // Mark in-progress tasks as failed, leave pending as pending
          if (data.plan) {
            for (const task of data.plan.tasks) {
              if (task.status === "in_progress") task.status = "failed";
            }
          }
          // Mark working agents as error
          for (const agentState of data.agents) {
            if (agentState.status === "working") {
              agentState.status = "error";
              agentState.currentAction = null;
            }
          }
        }

        this.notifyListeners(id, event);

        // Post-notify actions
        if (event.type === "session_completed" || (event.type === "session_error" && !event.agent)) {
          this.saveMission(id, true);
          cm.destroyContainer(id).catch((err) =>
            console.error(`Failed to destroy container for ${id}:`, err)
          );
        } else {
          this.saveMission(id); // debounced
        }
      });
      data.containerUnsubscribe = unsubscribe;

      // Start execution inside the container
      await cm.executeInContainer(id, data.plan, this.envConfig);
    } catch (err) {
      console.error(`Mission ${id} container execution failed:`, err);
      data.status = "failed";
      data.completedAt = Date.now();
      data.containerStatus = "error";
      this.saveMission(id, true);

      // Try to cleanup
      cm.destroyContainer(id).catch(() => {});
    }
  }

  /**
   * Local execution (original behavior): run MissionEngine directly on host.
   */
  private async approvePlanLocal(id: string, data: MissionData): Promise<void> {
    // Initialize engine and workspace
    const engine = new MissionEngine(this.envConfig);
    data.engine = engine;
    data.workspace = await engine.initWorkspace(id);
    data.status = "running";

    this.saveMission(id, true);

    // Execute in background
    engine
      .executePlan(data.plan!, data.workspace, (event) => {
        data.events.push(event);
        // Sync agent states from engine
        data.agents = engine.getAgentStates();
        // Sync task statuses from engine back to the plan
        if (data.plan) {
          const taskStatuses = engine.getTaskStatuses();
          for (const { id: taskId, status } of taskStatuses) {
            const task = data.plan.tasks.find((t) => t.id === taskId);
            if (task) {
              task.status = status as typeof task.status;
            }
          }
        }
        this.notifyListeners(id, event);

        // Detect completion/failure
        if (event.type === "session_completed") {
          data.status = "completed";
          data.completedAt = Date.now();
          this.saveMission(id, true);
        } else if (event.type === "session_error" && !event.agent) {
          // Only top-level errors fail the mission (agent errors don't)
          data.status = "failed";
          data.completedAt = Date.now();
          this.saveMission(id, true);
        } else {
          this.saveMission(id); // debounced
        }
      })
      .catch((err) => {
        console.error(`Mission ${id} execution failed:`, err);
        data.status = "failed";
        data.completedAt = Date.now();
        this.saveMission(id, true);
      });
  }

  async sendMessage(id: string, content: string): Promise<ChatMessage> {
    const data = this.missions.get(id);
    if (!data) throw new Error(`Mission ${id} not found`);

    const message: ChatMessage = {
      id: `msg-${nanoid(8)}`,
      sessionId: id,
      role: "user",
      content,
      timestamp: Date.now(),
    };
    data.chat.push(message);

    // Delegate to container or local engine
    if (this.useContainers() && this.containerManager) {
      try {
        await this.containerManager.sendMessage(id, content);
      } catch (err) {
        console.error(`Failed to send message to container for ${id}:`, err);
      }
    } else if (data.engine) {
      await data.engine.sendMessage(content);
    }

    this.saveMission(id);
    return message;
  }

  /**
   * Relay user-provided credentials to the running container agent.
   */
  async relayCredential(id: string, credential: CredentialPayload): Promise<void> {
    if (!this.containerManager) {
      throw new Error("Container manager not available");
    }

    await this.containerManager.sendCredential(id, credential);

    this.emitEvent(id, {
      id: nanoid(),
      sessionId: id,
      type: "credential_provided",
      summary: `Credentials provided for request ${credential.requestId}`,
      data: { requestId: credential.requestId },
      timestamp: Date.now(),
    });
  }

  /**
   * Get container info for a mission (VNC URL, status).
   */
  getContainerInfo(id: string): { vncUrl: string | null; containerStatus: string | null } {
    const data = this.missions.get(id);
    if (!data) return { vncUrl: null, containerStatus: null };

    return {
      vncUrl: data.vncUrl ?? (this.containerManager?.getVncUrl(id) ?? null),
      containerStatus: data.containerStatus ?? null,
    };
  }

  getMission(id: string): Mission | null {
    const data = this.missions.get(id);
    if (!data) return null;
    return this.toMission(id, data);
  }

  listMissions(userId?: string): Mission[] {
    return Array.from(this.missions.entries())
      .filter(([, data]) => !userId || data.userId === userId)
      .map(([id, data]) => this.toMission(id, data));
  }

  getEvents(id: string, since?: number, limit?: number): SessionEvent[] {
    const data = this.missions.get(id);
    if (!data) return [];

    let events = data.events;
    if (since) {
      events = events.filter((e) => e.timestamp > since);
    }
    if (limit) {
      events = events.slice(-limit);
    }
    return events;
  }

  getChat(id: string): ChatMessage[] {
    return this.missions.get(id)?.chat ?? [];
  }

  async listWorkspaceFiles(id: string, dir?: string): Promise<string[]> {
    const data = this.missions.get(id);
    if (!data) return [];

    // Delegate to container if using containers
    if (this.useContainers() && this.containerManager) {
      return this.containerManager.listFiles(id, dir);
    }

    if (!data.workspace) return [];

    const target = dir
      ? path.resolve(data.workspace, dir)
      : data.workspace;

    // Security: ensure target is within workspace
    if (!target.startsWith(data.workspace)) return [];

    try {
      return await walkDir(target, data.workspace);
    } catch {
      return [];
    }
  }

  async readWorkspaceFile(id: string, filePath: string): Promise<string | null> {
    const data = this.missions.get(id);
    if (!data) return null;

    // Delegate to container if using containers
    if (this.useContainers() && this.containerManager) {
      return this.containerManager.readFile(id, filePath);
    }

    if (!data.workspace) return null;

    const target = path.resolve(data.workspace, filePath);
    if (!target.startsWith(data.workspace)) return null;

    try {
      return await fs.readFile(target, "utf-8");
    } catch {
      return null;
    }
  }

  subscribe(
    id: string,
    listener: (event: SessionEvent) => void,
  ): () => void {
    if (!this.eventListeners.has(id)) {
      this.eventListeners.set(id, new Set());
    }
    this.eventListeners.get(id)!.add(listener);
    return () => {
      this.eventListeners.get(id)?.delete(listener);
    };
  }

  private emitEvent(id: string, event: SessionEvent): void {
    const data = this.missions.get(id);
    if (data) data.events.push(event);
    this.notifyListeners(id, event);
  }

  private notifyListeners(id: string, event: SessionEvent): void {
    const listeners = this.eventListeners.get(id);
    if (!listeners) return;
    for (const listener of listeners) {
      listener(event);
    }
  }

  getMissionUserId(id: string): string | undefined {
    return this.missions.get(id)?.userId;
  }

  private toMission(id: string, data: MissionData): Mission {
    return {
      id,
      userId: data.userId,
      status: data.status,
      plan: data.plan,
      agents: data.agents,
      workspace: data.workspace,
      readinessScore: data.readinessScore,
      startedAt: data.startedAt,
      completedAt: data.completedAt,
      createdAt: data.createdAt,
      vncUrl: data.vncUrl,
      containerStatus: data.containerStatus,
    };
  }
}

async function walkDir(dir: string, root: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDir(full, root)));
    } else {
      files.push(path.relative(root, full));
    }
  }
  return files;
}
