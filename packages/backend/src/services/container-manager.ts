import Docker from "dockerode";
import type { MissionEnvConfig } from "@stallion/agent-runtime";
import type { SessionEvent } from "@stallion/shared";
import { WebSocket } from "ws";

const AGENT_VM_IMAGE = "stallion-agent-vm";
const CONTAINER_PREFIX = "stallion-mission-";

export interface ContainerInfo {
  containerId: string;
  missionId: string;
  vncPort: number;
  controlPort: number;
  status: "creating" | "running" | "stopped" | "error";
  createdAt: number;
}

export interface CredentialPayload {
  requestId: string;
  credentials: Record<string, string>;
}

export class ContainerManager {
  private docker: Docker;
  private containers = new Map<string, ContainerInfo>();
  private eventConnections = new Map<string, WebSocket>();

  constructor() {
    this.docker = new Docker();
  }

  /**
   * Create and start a new container for a mission.
   */
  async createContainer(
    missionId: string,
    envConfig: MissionEnvConfig
  ): Promise<ContainerInfo> {
    const existing = this.containers.get(missionId);
    if (existing && existing.status === "running") {
      return existing;
    }

    const info: ContainerInfo = {
      containerId: "",
      missionId,
      vncPort: 0,
      controlPort: 0,
      status: "creating",
      createdAt: Date.now(),
    };
    this.containers.set(missionId, info);

    try {
      // Build env vars for the container
      const envArray = [
        `CLAUDE_CODE_USE_FOUNDRY=1`,
        `ANTHROPIC_FOUNDRY_RESOURCE=${envConfig.foundryResource}`,
        `ANTHROPIC_FOUNDRY_API_KEY=${envConfig.foundryApiKey}`,
        `DISPLAY=:99`,
      ];

      if (envConfig.defaultModel) {
        envArray.push(`ANTHROPIC_DEFAULT_SONNET_MODEL=${envConfig.defaultModel}`);
      }
      if (envConfig.capableModel) {
        envArray.push(`ANTHROPIC_DEFAULT_OPUS_MODEL=${envConfig.capableModel}`);
      }
      if (envConfig.imageGenEndpoint) {
        envArray.push(`AZURE_IMAGE_GEN_ENDPOINT=${envConfig.imageGenEndpoint}`);
      }
      if (envConfig.imageGenApiKey) {
        envArray.push(`AZURE_IMAGE_GEN_KEY=${envConfig.imageGenApiKey}`);
      }

      // Create container with dynamic port mapping
      const container = await this.docker.createContainer({
        Image: AGENT_VM_IMAGE,
        name: `${CONTAINER_PREFIX}${missionId}`,
        Env: envArray,
        ExposedPorts: {
          "6080/tcp": {},
          "9999/tcp": {},
        },
        HostConfig: {
          PortBindings: {
            "6080/tcp": [{ HostPort: "0" }], // dynamic port
            "9999/tcp": [{ HostPort: "0" }], // dynamic port
          },
          // Resource limits
          Memory: 4 * 1024 * 1024 * 1024, // 4GB
          NanoCpus: 2 * 1e9, // 2 CPUs
          // Security
          SecurityOpt: ["no-new-privileges"],
        },
        Labels: {
          "stallion.mission": missionId,
          "stallion.component": "agent-vm",
        },
      });

      await container.start();

      // Get the assigned ports
      const inspectData = await container.inspect();
      const portBindings = inspectData.NetworkSettings.Ports;

      const vncPort = parseInt(
        portBindings["6080/tcp"]?.[0]?.HostPort ?? "0",
        10
      );
      const controlPort = parseInt(
        portBindings["9999/tcp"]?.[0]?.HostPort ?? "0",
        10
      );

      info.containerId = container.id;
      info.vncPort = vncPort;
      info.controlPort = controlPort;
      info.status = "running";

      console.log(
        `[container-manager] Container started for mission ${missionId}: ` +
          `vnc=:${vncPort}, control=:${controlPort}, id=${container.id.slice(0, 12)}`
      );

      // Wait for control server to be ready before returning
      await this.waitForReady(controlPort);

      return info;
    } catch (err) {
      info.status = "error";
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[container-manager] Failed to create container for ${missionId}:`, msg);
      throw err;
    }
  }

  /**
   * Poll the control server's /status endpoint until it responds 200, or timeout.
   */
  private async waitForReady(controlPort: number, timeout = 30000): Promise<void> {
    const start = Date.now();
    const interval = 500;

    while (Date.now() - start < timeout) {
      try {
        const res = await fetch(`http://localhost:${controlPort}/status`);
        if (res.ok) {
          console.log(`[container-manager] Control server ready on :${controlPort}`);
          return;
        }
      } catch {
        // Not ready yet — ECONNREFUSED expected
      }
      await new Promise((r) => setTimeout(r, interval));
    }

    console.warn(`[container-manager] Control server on :${controlPort} not ready after ${timeout}ms — proceeding anyway`);
  }

  /**
   * Destroy a mission's container.
   */
  async destroyContainer(missionId: string): Promise<void> {
    const info = this.containers.get(missionId);
    if (!info) return;

    // Close event WebSocket
    const ws = this.eventConnections.get(missionId);
    if (ws) {
      ws.close();
      this.eventConnections.delete(missionId);
    }

    if (info.containerId) {
      try {
        const container = this.docker.getContainer(info.containerId);
        try {
          await container.stop({ t: 5 });
        } catch {
          // May already be stopped
        }
        await container.remove({ force: true });
        console.log(
          `[container-manager] Container destroyed for mission ${missionId}`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[container-manager] Failed to destroy container for ${missionId}:`, msg);
      }
    }

    info.status = "stopped";
    this.containers.delete(missionId);
  }

  /**
   * Get container info for a mission.
   */
  getContainer(missionId: string): ContainerInfo | null {
    return this.containers.get(missionId) ?? null;
  }

  /**
   * Get the noVNC URL for a mission's container.
   */
  getVncUrl(missionId: string): string | null {
    const info = this.containers.get(missionId);
    if (!info || info.status !== "running" || !info.vncPort) return null;
    return `http://localhost:${info.vncPort}/vnc.html?autoconnect=true`;
  }

  /**
   * Connect to container's WebSocket event stream and relay events.
   * Retries up to 10 times with 1s delay if connection fails.
   */
  connectEvents(
    missionId: string,
    onEvent: (event: SessionEvent) => void
  ): () => void {
    const info = this.containers.get(missionId);
    if (!info || info.status !== "running") {
      return () => {};
    }

    let cancelled = false;
    let currentWs: WebSocket | null = null;
    let receivedTerminalEvent = false;

    const connect = (attempt: number) => {
      if (cancelled) return;

      const wsUrl = `ws://localhost:${info.controlPort}/events`;
      const ws = new WebSocket(wsUrl);
      currentWs = ws;

      this.eventConnections.set(missionId, ws);

      ws.on("open", () => {
        console.log(`[container-manager] Event stream connected for ${missionId} (attempt ${attempt})`);
      });

      ws.on("message", (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === "event" && parsed.data) {
            const event = parsed.data as SessionEvent;
            if (event.type === "session_completed" || (event.type === "session_error" && !event.agent)) {
              receivedTerminalEvent = true;
            }
            onEvent(event);
          }
          if (parsed.type === "credential_request" && parsed.data) {
            const credReq = parsed.data;
            onEvent({
              id: `cred-${Date.now()}`,
              sessionId: missionId,
              type: "credential_request",
              summary: `Agent needs credentials for ${credReq.platform}`,
              data: credReq,
              timestamp: Date.now(),
            });
          }
        } catch {
          // Ignore parse errors
        }
      });

      ws.on("close", () => {
        console.log(`[container-manager] Event stream closed for ${missionId}`);
        this.eventConnections.delete(missionId);

        // If stream closed without a terminal event, the container died unexpectedly
        if (!receivedTerminalEvent && !cancelled) {
          console.warn(`[container-manager] Stream closed without terminal event for ${missionId}, emitting synthetic error`);
          onEvent({
            id: `synth-err-${Date.now()}`,
            sessionId: missionId,
            type: "session_error",
            summary: "Mission failed: container execution ended unexpectedly",
            timestamp: Date.now(),
          });
        }
      });

      ws.on("error", (err) => {
        console.error(`[container-manager] Event stream error for ${missionId} (attempt ${attempt}):`, err.message);
        ws.close();
        this.eventConnections.delete(missionId);

        // Retry with backoff
        if (!cancelled && attempt < 10) {
          const delay = Math.min(1000 * attempt, 5000);
          setTimeout(() => connect(attempt + 1), delay);
        }
      });
    };

    connect(1);

    return () => {
      cancelled = true;
      if (currentWs) {
        currentWs.close();
      }
      this.eventConnections.delete(missionId);
    };
  }

  /**
   * Start mission execution in the container.
   */
  async executeInContainer(
    missionId: string,
    plan: unknown,
    envConfig: MissionEnvConfig
  ): Promise<void> {
    const info = this.containers.get(missionId);
    if (!info || info.status !== "running") {
      throw new Error(`No running container for mission ${missionId}`);
    }

    const response = await fetch(
      `http://localhost:${info.controlPort}/execute`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          envConfig: {
            foundryResource: envConfig.foundryResource,
            foundryApiKey: envConfig.foundryApiKey,
            defaultModel: envConfig.defaultModel,
            capableModel: envConfig.capableModel,
            imageGenEndpoint: envConfig.imageGenEndpoint,
            imageGenApiKey: envConfig.imageGenApiKey,
          },
          missionId,
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Container execute failed: ${response.status} ${body}`);
    }
  }

  /**
   * Send a user message to the running agent in the container.
   */
  async sendMessage(missionId: string, content: string): Promise<void> {
    const info = this.containers.get(missionId);
    if (!info || info.status !== "running") {
      throw new Error(`No running container for mission ${missionId}`);
    }

    const response = await fetch(
      `http://localhost:${info.controlPort}/message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Container message failed: ${response.status} ${body}`);
    }
  }

  /**
   * Relay credentials to the agent in the container.
   */
  async sendCredential(
    missionId: string,
    credential: CredentialPayload
  ): Promise<void> {
    const info = this.containers.get(missionId);
    if (!info || info.status !== "running") {
      throw new Error(`No running container for mission ${missionId}`);
    }

    const response = await fetch(
      `http://localhost:${info.controlPort}/credential`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credential),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Container credential relay failed: ${response.status} ${body}`);
    }
  }

  /**
   * List workspace files inside the container.
   */
  async listFiles(missionId: string, dir?: string): Promise<string[]> {
    const info = this.containers.get(missionId);
    if (!info || info.status !== "running") return [];

    try {
      const url = new URL(`http://localhost:${info.controlPort}/files`);
      if (dir) url.searchParams.set("dir", dir);

      const response = await fetch(url.toString());
      if (!response.ok) return [];

      const data = (await response.json()) as { files: string[] };
      return data.files;
    } catch {
      return [];
    }
  }

  /**
   * Read a workspace file from inside the container.
   */
  async readFile(missionId: string, path: string): Promise<string | null> {
    const info = this.containers.get(missionId);
    if (!info || info.status !== "running") return null;

    try {
      const url = new URL(`http://localhost:${info.controlPort}/files/read`);
      url.searchParams.set("path", path);

      const response = await fetch(url.toString());
      if (!response.ok) return null;

      const data = (await response.json()) as { content: string };
      return data.content;
    } catch {
      return null;
    }
  }

  /**
   * Cleanup all containers (called on server shutdown).
   */
  async cleanup(): Promise<void> {
    const missionIds = Array.from(this.containers.keys());
    await Promise.allSettled(
      missionIds.map((id) => this.destroyContainer(id))
    );
  }
}
