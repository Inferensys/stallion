import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";

// ─── Event Relay ──────────────────────────────────────────────────────────────
// WebSocket server that broadcasts SDKEnvelope objects to connected clients.
// Validates x-control-token header on WS upgrade.

export interface EventRelay {
  broadcast(data: unknown): void;
  wss: WebSocketServer;
}

export function createEventRelay(
  server: http.Server,
  authToken: string,
): EventRelay {
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade — validate auth token before accepting connection
  server.on("upgrade", (request, socket, head) => {
    const token =
      request.headers["x-control-token"] ||
      request.headers["x-auth-token"];

    if (token !== authToken) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws) => {
    console.log("[relay] WebSocket client connected");

    ws.on("close", () => {
      console.log("[relay] WebSocket client disconnected");
    });

    ws.on("error", (err) => {
      console.error("[relay] WebSocket client error:", err.message);
    });
  });

  function broadcast(data: unknown): void {
    const payload = JSON.stringify(data);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  return { broadcast, wss };
}
