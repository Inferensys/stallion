import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { Executor } from "./executor.js";
import { CredentialRelay } from "./credential-relay.js";

const PORT = parseInt(process.env.CONTROL_PORT ?? "9999", 10);

const executor = new Executor();
const credentialRelay = new CredentialRelay();

// Track connected WebSocket clients for event streaming
const wsClients = new Set<WebSocket>();

// Pipe executor events to all WS clients
executor.onEvent((event) => {
  const msg = JSON.stringify({ type: "event", data: event });
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
});

// Pipe credential requests to WS clients
credentialRelay.onRequest((request) => {
  const msg = JSON.stringify({ type: "credential_request", data: request });
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
});

// ─── HTTP Server ──────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const method = req.method ?? "GET";

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // POST /execute — start mission execution
    if (method === "POST" && url.pathname === "/execute") {
      const body = JSON.parse(await readBody(req));
      const { plan, envConfig, missionId } = body;

      if (!plan || !missionId) {
        return json(res, 400, { error: "plan and missionId are required" });
      }

      await executor.execute(plan, envConfig, missionId);
      return json(res, 200, { status: "started", missionId });
    }

    // GET /status — container health check
    if (method === "GET" && url.pathname === "/status") {
      return json(res, 200, {
        status: executor.getStatus(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      });
    }

    // POST /message — send user message to running agent
    if (method === "POST" && url.pathname === "/message") {
      const body = JSON.parse(await readBody(req));
      const { content } = body;

      if (!content) {
        return json(res, 400, { error: "content is required" });
      }

      await executor.sendMessage(content);
      return json(res, 200, { status: "sent" });
    }

    // POST /credential — relay credentials to agent
    if (method === "POST" && url.pathname === "/credential") {
      const body = JSON.parse(await readBody(req));
      credentialRelay.provide(body);
      return json(res, 200, { status: "received" });
    }

    // GET /files — list workspace files
    if (method === "GET" && url.pathname === "/files") {
      const dir = url.searchParams.get("dir") || undefined;
      const files = await executor.listFiles(dir);
      return json(res, 200, { files });
    }

    // GET /files/read — read a workspace file
    if (method === "GET" && url.pathname === "/files/read") {
      const filePath = url.searchParams.get("path");
      if (!filePath) {
        return json(res, 400, { error: "path query parameter required" });
      }
      const content = await executor.readFile(filePath);
      if (content === null) {
        return json(res, 404, { error: "File not found" });
      }
      return json(res, 200, { path: filePath, content });
    }

    // 404
    json(res, 404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[control] Request error:", message);
    json(res, 500, { error: message });
  }
}

const server = createServer(handleRequest);

// ─── WebSocket Server ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server, path: "/events" });

wss.on("connection", (ws) => {
  console.log("[control] WebSocket client connected");
  wsClients.add(ws);

  ws.on("close", () => {
    wsClients.delete(ws);
    console.log("[control] WebSocket client disconnected");
  });

  ws.on("error", (err) => {
    console.error("[control] WebSocket error:", err.message);
    wsClients.delete(ws);
  });

  // Send current status on connect
  ws.send(
    JSON.stringify({
      type: "status",
      data: { status: executor.getStatus() },
    })
  );
});

server.listen(PORT, () => {
  console.log(`[control] Agent control server listening on :${PORT}`);
});
