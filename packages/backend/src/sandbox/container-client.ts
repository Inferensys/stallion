import WebSocket from "ws";

// ─── ContainerClient ──────────────────────────────────────────────────────────
// HTTP + WebSocket client connecting the backend to an in-container control server.
// HTTP methods use native fetch (Node 22). WebSocket uses the `ws` package.

const MAX_WS_RECONNECTS = 3;
const WS_RECONNECT_DELAY_MS = 1000;

export class ContainerClient {
  // ── HTTP helpers ────────────────────────────────────────────────────────────

  private baseUrl(hostPort: number): string {
    return `http://localhost:${hostPort}`;
  }

  private async post(
    hostPort: number,
    authToken: string,
    endpoint: string,
    body: unknown,
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl(hostPort)}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-control-token": authToken,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "(no body)");
      throw new Error(`ContainerClient: ${endpoint} returned ${res.status}: ${text}`);
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async startSession(
    hostPort: number,
    authToken: string,
    params: { prompt: string; sessionId: string; resumeSessionId?: string },
  ): Promise<void> {
    await this.post(hostPort, authToken, "/start", params);
  }

  async sendMessage(
    hostPort: number,
    authToken: string,
    params: { prompt: string; sessionId: string; resumeSessionId: string },
  ): Promise<void> {
    await this.post(hostPort, authToken, "/message", params);
  }

  async abortSession(hostPort: number, authToken: string): Promise<void> {
    await this.post(hostPort, authToken, "/abort", {});
  }

  connectEvents(
    hostPort: number,
    authToken: string,
    onMessage: (data: unknown) => void,
    onError: (err: Error) => void,
  ): () => void {
    let ws: WebSocket | null = null;
    let reconnectCount = 0;
    let stopped = false;

    const connect = () => {
      if (stopped) return;

      ws = new WebSocket(`ws://localhost:${hostPort}/events`, {
        headers: { "x-control-token": authToken },
      });

      ws.on("message", (raw) => {
        try {
          const data: unknown = JSON.parse(raw.toString());
          onMessage(data);
        } catch (err) {
          console.warn("ContainerClient: failed to parse WS message:", err);
        }
      });

      ws.on("error", (err) => {
        console.warn("ContainerClient: WebSocket error:", err.message);
      });

      ws.on("close", () => {
        if (stopped) return;

        reconnectCount++;
        if (reconnectCount > MAX_WS_RECONNECTS) {
          onError(
            new Error(
              `ContainerClient: WebSocket connection to port ${hostPort} failed after ${MAX_WS_RECONNECTS} reconnect attempts`,
            ),
          );
          return;
        }

        console.warn(
          `ContainerClient: WS closed, reconnect attempt ${reconnectCount}/${MAX_WS_RECONNECTS}…`,
        );
        setTimeout(connect, WS_RECONNECT_DELAY_MS);
      });
    };

    connect();

    // Return disconnect function
    return () => {
      stopped = true;
      if (ws) {
        ws.close();
        ws = null;
      }
    };
  }
}
