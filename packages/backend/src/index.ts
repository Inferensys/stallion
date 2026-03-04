import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env from monorepo root
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env"), override: true });
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { Server as SocketServer } from "socket.io";
import { missionsRouter } from "./routes/missions.js";
import { MissionManager } from "./services/mission-manager.js";
import { ContainerManager } from "./services/container-manager.js";
import { setupWebSocket } from "./ws/handler.js";
import { authMiddleware } from "./middleware/auth.js";

const app = new Hono();

// CORS for frontend
app.use(
  "/*",
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Health check
app.get("/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

// Initialize services
const containerManager = new ContainerManager();
const missionManager = await MissionManager.create(containerManager);

// Cleanup containers on shutdown
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    console.log(`Received ${signal}, cleaning up containers...`);
    await containerManager.cleanup();
    process.exit(0);
  });
}

// Auth middleware for all mission routes
app.use("/api/missions/*", authMiddleware);

// Mount routes
app.route("/api/missions", missionsRouter(missionManager));

// Start server
const port = parseInt(process.env.PORT ?? "4000", 10);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Stallion Backend running on http://localhost:${info.port}`);
});

// WebSocket server
const io = new SocketServer(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
    methods: ["GET", "POST"],
  },
});

setupWebSocket(io, missionManager);

console.log("WebSocket server ready");
