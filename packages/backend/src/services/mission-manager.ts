import { nanoid } from "nanoid";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { Mission, SessionEvent, ChatMessage, SDKEnvelope } from "@stallion/shared";
import {
  ContainerManager,
  ContainerClient,
  SessionStore,
  CostMonitor,
  startSessionTimers,
} from "../sandbox/index.js";
import type { TimerHandle } from "../sandbox/index.js";

// ─── Default Proxy Port ───────────────────────────────────────────────────────
// The credential proxy (Plan 03) runs on this port by default.
// Override via CREDENTIAL_PROXY_PORT env var.
const DEFAULT_PROXY_PORT = 9100;

// ─── MissionData ─────────────────────────────────────────────────────────────

interface MissionData {
  engine: null; // Always null — engine now runs inside a container
  containerId: string | null;
  hostPort: number | null;
  authToken: string | null;
  sdkSessionId: string | null; // SDK session ID for resume capability
  disconnectWs: (() => void) | null; // Runtime only — not persisted
  timers: TimerHandle | null; // Runtime only — not persisted
  prompt: string;
  events: SessionEvent[];
  sdkMessages: SDKEnvelope[];
  chat: ChatMessage[];
  status: Mission["status"];
  workspace: string;
  userId?: string;
  startedAt: number | null;
  completedAt: number | null;
  createdAt: number;
}

// ─── MissionSnapshot ─────────────────────────────────────────────────────────

interface MissionSnapshot {
  id: string;
  containerId?: string | null;
  hostPort?: number | null;
  authToken?: string | null;
  sdkSessionId?: string | null;
  prompt: string;
  events: SessionEvent[];
  sdkMessages?: SDKEnvelope[];
  chat: ChatMessage[];
  status: Mission["status"];
  workspace: string;
  userId?: string;
  startedAt: number | null;
  completedAt: number | null;
  createdAt: number;
}

// ─── MissionManager ───────────────────────────────────────────────────────────

export class MissionManager {
  private missions = new Map<string, MissionData>();
  private eventListeners = new Map<string, Set<(event: SessionEvent) => void>>();
  private sdkMessageListeners = new Map<string, Set<(envelope: SDKEnvelope) => void>>();
  private dataDir: string;
  private saveTimers = new Map<string, NodeJS.Timeout>();

  private containerManager: ContainerManager;
  private containerClient: ContainerClient;
  private sessionStore: SessionStore;
  private costMonitor: CostMonitor;
  private proxyPort: number;

  private constructor(proxyPort: number) {
    this.proxyPort = proxyPort;
    this.dataDir = path.join(os.homedir(), ".stallion", "missions");
    this.containerManager = new ContainerManager();
    this.containerClient = new ContainerClient();
    this.sessionStore = new SessionStore(path.join(os.homedir(), ".stallion", "sessions"));
    this.costMonitor = new CostMonitor();
  }

  static async create(proxyPort?: number): Promise<MissionManager> {
    const port =
      proxyPort ??
      (process.env["CREDENTIAL_PROXY_PORT"]
        ? parseInt(process.env["CREDENTIAL_PROXY_PORT"], 10)
        : DEFAULT_PROXY_PORT);

    const mm = new MissionManager(port);
    await fs.mkdir(mm.dataDir, { recursive: true });
    await mm.loadMissions();

    // Sweep any orphan containers from previous crashed backend runs
    const swept = await mm.containerManager.sweepOrphans();
    if (swept > 0) {
      console.log(`MissionManager: swept ${swept} orphan container(s) on startup`);
    }

    console.log(
      `MissionManager initialized (proxyPort: ${port}, data: ${mm.dataDir})`,
    );
    return mm;
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  private async saveMission(id: string, immediate = false): Promise<void> {
    const existing = this.saveTimers.get(id);
    if (existing) clearTimeout(existing);
    if (immediate) {
      await this.writeMissionSnapshot(id);
    } else {
      const timer = setTimeout(() => {
        this.writeMissionSnapshot(id).catch((err) =>
          console.error(`Save failed ${id}:`, err),
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
      containerId: data.containerId,
      hostPort: data.hostPort,
      authToken: data.authToken,
      sdkSessionId: data.sdkSessionId,
      prompt: data.prompt,
      events: data.events,
      sdkMessages: data.sdkMessages.length > 0 ? data.sdkMessages : undefined,
      chat: data.chat,
      status: data.status,
      workspace: data.workspace,
      userId: data.userId,
      startedAt: data.startedAt,
      completedAt: data.completedAt,
      createdAt: data.createdAt,
    };
    await fs.writeFile(
      path.join(this.dataDir, `${id}.json`),
      JSON.stringify(snapshot),
      "utf-8",
    );
  }

  private async loadMissions(): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.dataDir);
    } catch {
      return;
    }

    for (const file of entries.filter((e) => e.endsWith(".json"))) {
      try {
        const raw = await fs.readFile(path.join(this.dataDir, file), "utf-8");
        const s = JSON.parse(raw) as MissionSnapshot;
        let status = s.status;
        let completedAt = s.completedAt;
        if (status === "running") {
          status = "failed";
          completedAt = Date.now();
        }
        if (!["idle", "running", "completed", "failed"].includes(status)) {
          status = "failed";
          completedAt = completedAt ?? Date.now();
        }
        this.missions.set(s.id, {
          engine: null,
          containerId: s.containerId ?? null,
          hostPort: s.hostPort ?? null,
          authToken: s.authToken ?? null,
          sdkSessionId: s.sdkSessionId ?? null,
          disconnectWs: null,
          timers: null,
          prompt: s.prompt ?? "",
          events: s.events ?? [],
          sdkMessages: s.sdkMessages ?? [],
          chat: s.chat ?? [],
          status: status as Mission["status"],
          workspace: s.workspace ?? "",
          userId: s.userId,
          startedAt: s.startedAt,
          completedAt,
          createdAt: s.createdAt,
        });
        if (status !== s.status) await this.writeMissionSnapshot(s.id);
      } catch (err) {
        console.error(`Failed to load ${file}:`, err);
      }
    }
    console.log(`Loaded ${this.missions.size} missions from disk`);
  }

  // ── Mission lifecycle ────────────────────────────────────────────────────────

  createMission(userId?: string): Mission {
    const id = `mission-${nanoid(10)}`;
    const data: MissionData = {
      engine: null,
      containerId: null,
      hostPort: null,
      authToken: null,
      sdkSessionId: null,
      disconnectWs: null,
      timers: null,
      prompt: "",
      events: [],
      sdkMessages: [],
      chat: [],
      status: "idle",
      workspace: "",
      userId,
      startedAt: null,
      completedAt: null,
      createdAt: Date.now(),
    };
    this.missions.set(id, data);
    this.saveMission(id);
    return this.toMission(id, data);
  }

  async startMission(id: string, prompt: string): Promise<void> {
    const data = this.missions.get(id);
    if (!data) throw new Error(`Mission ${id} not found`);

    data.prompt = prompt;
    data.status = "running";
    data.startedAt = Date.now();
    data.chat.push({
      id: `msg-${nanoid(8)}`,
      sessionId: id,
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    });

    // ── Step 1: Create container ─────────────────────────────────────────────
    const sandboxConfig = {
      sessionId: id,
      workspaceDir: `/workspace/${id}`,
      controlPort: 3001,
      memoryBytes: 4 * 1024 * 1024 * 1024,
      nanoCpus: 2_000_000_000,
      diskSizeGb: 10,
      wallClockTimeoutMs: 30 * 60 * 1000,
      idleTimeoutMs: 30 * 60 * 1000,
      costBudgetUsd: 5,
    };

    const containerInfo = await this.containerManager.createSessionContainer(
      sandboxConfig,
      this.proxyPort,
    );

    data.containerId = containerInfo.containerId;
    data.hostPort = containerInfo.hostPort;
    data.authToken = containerInfo.authToken;
    data.workspace = sandboxConfig.workspaceDir;
    await this.saveMission(id, true);

    // ── Step 2: Wait for control server to be ready ──────────────────────────
    await this.containerManager.waitForReady(containerInfo.hostPort, containerInfo.authToken);

    // ── Step 3: Start session timers ─────────────────────────────────────────
    data.timers = startSessionTimers(id, (sid, reason) =>
      this.handleTimeout(sid, reason),
    );

    // ── Step 4: Connect to event stream ─────────────────────────────────────
    data.disconnectWs = this.containerClient.connectEvents(
      containerInfo.hostPort,
      containerInfo.authToken,
      (rawData) => this.handleContainerEvent(id, rawData, sandboxConfig.costBudgetUsd),
      (err) => this.handleSessionError(id, { error: err.message }),
    );

    // ── Step 5: Send prompt to container ────────────────────────────────────
    await this.containerClient.startSession(containerInfo.hostPort, containerInfo.authToken, {
      prompt,
      sessionId: id,
    });
  }

  // ── Event relay ──────────────────────────────────────────────────────────────

  private handleContainerEvent(
    id: string,
    rawData: unknown,
    costBudgetUsd: number,
  ): void {
    const data = this.missions.get(id);
    if (!data) return;

    // Reset idle timer on any message from the container
    data.timers?.resetActivity();

    const message = rawData as Record<string, unknown>;
    const msgType = message["type"];

    if (msgType === "session_completed") {
      this.handleSessionComplete(id, message);
    } else if (msgType === "session_error") {
      this.handleSessionError(id, message);
    } else if (msgType === "session_started") {
      // session_started event from agent-control — emit to frontend
      const event: SessionEvent = {
        id: nanoid(),
        sessionId: id,
        type: "session_started",
        summary: "Session started",
        data: message as Record<string, unknown>,
        timestamp: Date.now(),
      };
      data.events.push(event);
      this.notifyEvent(id, event);
      this.saveMission(id);
    } else {
      // SDK envelope — relay to existing pipeline
      const envelope = rawData as SDKEnvelope;

      // Capture SDK session ID for resume if present
      if (
        typeof envelope.msg === "object" &&
        envelope.msg !== null &&
        "session_id" in (envelope.msg as object)
      ) {
        const msgRecord = envelope.msg as Record<string, unknown>;
        if (typeof msgRecord["session_id"] === "string") {
          data.sdkSessionId = msgRecord["session_id"];
        }
      }

      data.sdkMessages.push(envelope);
      this.notifySDK(id, envelope);

      // Cost monitoring — process message and check budget
      this.costMonitor.processSDKMessage(id, envelope.msg);
      const budgetResult = this.costMonitor.checkBudget(id, costBudgetUsd);
      if (budgetResult.exceeded) {
        const warningEvent: SessionEvent = {
          id: nanoid(),
          sessionId: id,
          type: "session_error" as SessionEvent["type"],
          summary: `Cost budget exceeded: $${budgetResult.total.toFixed(4)} of $${budgetResult.budget} used`,
          data: {
            costUsd: budgetResult.total,
            budgetUsd: budgetResult.budget,
            exceeded: true,
          },
          timestamp: Date.now(),
        };
        // Emit as a status_update-style event (we use session_error type which is in the enum)
        // Since the EventType enum only has session_started/completed/error, use session_error
        // but add a data.kind field to distinguish budget warnings from actual errors.
        (warningEvent.data as Record<string, unknown>)["kind"] = "budget_warning";
        data.events.push(warningEvent);
        this.notifyEvent(id, warningEvent);
      }

      this.saveMission(id);
    }
  }

  // ── Session completion and cleanup ───────────────────────────────────────────

  private handleSessionComplete(id: string, _rawData: unknown): void {
    const data = this.missions.get(id);
    if (!data) return;

    const event: SessionEvent = {
      id: nanoid(),
      sessionId: id,
      type: "session_completed",
      summary: "Session completed",
      timestamp: Date.now(),
    };
    data.events.push(event);
    this.notifyEvent(id, event);

    data.status = "completed";
    data.completedAt = Date.now();

    this.cleanup(id).catch((err) =>
      console.error(`MissionManager: cleanup failed for ${id}:`, err),
    );
  }

  private handleSessionError(id: string, rawData: unknown): void {
    const data = this.missions.get(id);
    if (!data) return;

    const errData = rawData as Record<string, unknown>;
    const event: SessionEvent = {
      id: nanoid(),
      sessionId: id,
      type: "session_error",
      summary: typeof errData["error"] === "string" ? errData["error"] : "Session error",
      data: errData as Record<string, unknown>,
      timestamp: Date.now(),
    };
    data.events.push(event);
    this.notifyEvent(id, event);

    data.status = "failed";
    data.completedAt = Date.now();

    this.cleanup(id).catch((err) =>
      console.error(`MissionManager: cleanup failed for ${id}:`, err),
    );
  }

  private handleTimeout(id: string, reason: "idle" | "wall_clock"): void {
    console.warn(`MissionManager: session ${id} timed out (${reason})`);
    const data = this.missions.get(id);
    if (!data || data.status !== "running") return;

    // Attempt to abort the session in the container
    if (data.hostPort && data.authToken) {
      this.containerClient
        .abortSession(data.hostPort, data.authToken)
        .catch((err) =>
          console.warn(`MissionManager: abort request failed for ${id}:`, err),
        );
    }

    this.handleSessionError(id, { error: `Session terminated: ${reason} timeout` });
  }

  private async cleanup(id: string): Promise<void> {
    const data = this.missions.get(id);
    if (!data) return;

    // 1. Disconnect WebSocket
    if (data.disconnectWs) {
      data.disconnectWs();
      data.disconnectWs = null;
    }

    // 2. Clear timers
    if (data.timers) {
      data.timers.clearAll();
      data.timers = null;
    }

    // 3. Copy workspace files from container before destruction
    if (data.containerId && data.workspace) {
      try {
        const workspaceStream =
          await this.containerManager.copyWorkspaceFromContainer(
            data.containerId,
            data.workspace,
            path.join(os.homedir(), ".stallion", "sessions", id),
          );
        void workspaceStream; // copyWorkspaceFromContainer writes to disk internally
      } catch (err) {
        console.warn(`MissionManager: failed to copy workspace for ${id}:`, err);
      }
    }

    // 4. Destroy container
    if (data.containerId) {
      await this.containerManager.destroySessionContainer(data.containerId);
      data.containerId = null;
    }

    // 5. Reset cost tracker
    this.costMonitor.reset(id);

    // 6. Save final state
    await this.saveMission(id, true);
  }

  // ── Read-only accessors ──────────────────────────────────────────────────────

  getMission(id: string): Mission | null {
    const d = this.missions.get(id);
    return d ? this.toMission(id, d) : null;
  }

  listMissions(userId?: string): Mission[] {
    return Array.from(this.missions.entries())
      .filter(([, d]) => !userId || d.userId === userId)
      .map(([id, d]) => this.toMission(id, d));
  }

  getEvents(id: string): SessionEvent[] {
    return this.missions.get(id)?.events ?? [];
  }

  getSDKMessages(id: string): SDKEnvelope[] {
    return this.missions.get(id)?.sdkMessages ?? [];
  }

  getChat(id: string): ChatMessage[] {
    return this.missions.get(id)?.chat ?? [];
  }

  getMissionUserId(id: string): string | undefined {
    return this.missions.get(id)?.userId;
  }

  async listWorkspaceFiles(id: string, dir?: string): Promise<string[]> {
    const d = this.missions.get(id);
    if (!d?.workspace) return [];

    // For running sessions, proxy through ContainerClient
    if (d.status === "running" && d.hostPort && d.authToken) {
      try {
        const url = dir
          ? `http://localhost:${d.hostPort}/files?dir=${encodeURIComponent(dir)}`
          : `http://localhost:${d.hostPort}/files`;
        const res = await fetch(url, { headers: { "x-control-token": d.authToken } });
        if (res.ok) {
          const json = (await res.json()) as { files: string[] };
          return json.files ?? [];
        }
      } catch {
        // Fall through to local read
      }
    }

    // For completed sessions (or when container not reachable), read from host storage
    const target = dir ? path.resolve(d.workspace, dir) : d.workspace;
    if (!target.startsWith(d.workspace)) return [];
    try {
      return await walkDir(target, d.workspace);
    } catch {
      return [];
    }
  }

  async readWorkspaceFile(id: string, filePath: string): Promise<string | null> {
    const d = this.missions.get(id);
    if (!d?.workspace) return null;

    // For running sessions, proxy through ContainerClient
    if (d.status === "running" && d.hostPort && d.authToken) {
      try {
        const url = `http://localhost:${d.hostPort}/files/read?path=${encodeURIComponent(filePath)}`;
        const res = await fetch(url, { headers: { "x-control-token": d.authToken } });
        if (res.ok) return res.text();
      } catch {
        // Fall through to local read
      }
    }

    // For completed sessions, read from host workspace
    const target = path.resolve(d.workspace, filePath);
    if (!target.startsWith(d.workspace)) return null;
    try {
      return await fs.readFile(target, "utf-8");
    } catch {
      return null;
    }
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────────

  subscribe(id: string, listener: (e: SessionEvent) => void): () => void {
    if (!this.eventListeners.has(id)) this.eventListeners.set(id, new Set());
    this.eventListeners.get(id)!.add(listener);
    return () => {
      this.eventListeners.get(id)?.delete(listener);
    };
  }

  subscribeSDK(id: string, listener: (e: SDKEnvelope) => void): () => void {
    if (!this.sdkMessageListeners.has(id)) this.sdkMessageListeners.set(id, new Set());
    this.sdkMessageListeners.get(id)!.add(listener);
    return () => {
      this.sdkMessageListeners.get(id)?.delete(listener);
    };
  }

  private notifyEvent(id: string, event: SessionEvent): void {
    for (const l of this.eventListeners.get(id) ?? []) l(event);
  }

  private notifySDK(id: string, envelope: SDKEnvelope): void {
    for (const l of this.sdkMessageListeners.get(id) ?? []) l(envelope);
  }

  private toMission(id: string, d: MissionData): Mission {
    return {
      id,
      userId: d.userId,
      prompt: d.prompt,
      status: d.status,
      workspace: d.workspace,
      startedAt: d.startedAt,
      completedAt: d.completedAt,
      createdAt: d.createdAt,
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function walkDir(dir: string, root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.name === ".claude" || entry.name === "node_modules") continue;
    if (entry.isDirectory()) files.push(...(await walkDir(full, root)));
    else files.push(path.relative(root, full));
  }
  return files;
}
