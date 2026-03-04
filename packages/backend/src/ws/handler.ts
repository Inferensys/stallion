import type { Server as SocketServer } from "socket.io";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MissionManager } from "../services/mission-manager.js";

let _wsJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getWsJWKS() {
  const url = process.env.SUPABASE_URL;
  if (!url) return null;
  if (!_wsJwks) {
    _wsJwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
  }
  return _wsJwks;
}

async function verifyToken(token: string): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const jwks = getWsJWKS();
  if (!jwks || !supabaseUrl) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `${supabaseUrl}/auth/v1`,
      audience: "authenticated",
    });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

/**
 * WebSocket handler — real-time event streaming to the frontend.
 *
 * Clients join a mission room and receive all events in real-time.
 */
export function setupWebSocket(
  io: SocketServer,
  missionManager: MissionManager
): void {
  // Authenticate socket connections
  io.use(async (socket, next) => {
    // Dev-mode auth bypass
    if (process.env.DEV_AUTH_BYPASS === "true") {
      (socket.data as Record<string, unknown>).userId = "dev-user-001";
      return next();
    }

    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error("Authentication required"));
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return next(new Error("Invalid token"));
    }

    (socket.data as Record<string, unknown>).userId = userId;
    next();
  });

  io.on("connection", (socket) => {
    const userId = (socket.data as Record<string, unknown>).userId as string;
    console.log(`Client connected: ${socket.id} (user: ${userId})`);
    let unsubscribe: (() => void) | null = null;

    // Join a mission room (supports both new and legacy event names)
    const handleJoin = (missionId: string) => {
      // Verify mission ownership
      const missionUserId = missionManager.getMissionUserId(missionId);
      if (missionUserId && missionUserId !== userId) {
        socket.emit("error", { message: "Forbidden" });
        return;
      }

      // Leave previous mission
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }

      socket.join(missionId);
      console.log(`Client ${socket.id} joined mission ${missionId}`);

      // Send current mission state
      const mission = missionManager.getMission(missionId);
      if (mission) {
        socket.emit("mission_state", mission);
      }

      // Send all events (for restored sessions too)
      const events = missionManager.getEvents(missionId);
      if (events.length > 0) {
        socket.emit("events_batch", events);
      }

      // Subscribe to live events
      unsubscribe = missionManager.subscribe(missionId, (event) => {
        socket.emit("event", event);

        // Push updated mission state on lifecycle transitions
        if (
          event.type === "session_started" ||
          event.type === "session_completed" ||
          event.type === "session_error" ||
          event.type === "mission_planned" ||
          event.type === "agent_working" ||
          event.type === "agent_completed" ||
          event.type === "task_status_changed" ||
          event.type === "container_creating" ||
          event.type === "container_running" ||
          event.type === "container_stopped" ||
          event.type === "container_error" ||
          event.type === "credential_request"
        ) {
          const updated = missionManager.getMission(missionId);
          if (updated) {
            socket.emit("mission_state", updated);
          }
        }
      });
    };

    socket.on("join_mission", handleJoin);
    socket.on("join_session", handleJoin); // backwards compat

    // Leave mission
    const handleLeave = (missionId: string) => {
      socket.leave(missionId);
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    };

    socket.on("leave_mission", handleLeave);
    socket.on("leave_session", handleLeave); // backwards compat

    // Send message to mission
    socket.on(
      "send_message",
      async (data: { sessionId?: string; missionId?: string; content: string }) => {
        const id = data.missionId ?? data.sessionId;
        if (!id) return;

        // Verify ownership
        const missionUserId = missionManager.getMissionUserId(id);
        if (missionUserId && missionUserId !== userId) {
          socket.emit("error", { message: "Forbidden" });
          return;
        }

        try {
          const message = await missionManager.sendMessage(id, data.content);
          socket.emit("message_sent", message);

          const mission = missionManager.getMission(id);
          if (mission) {
            socket.emit("mission_state", mission);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          socket.emit("error", { message: msg });
        }
      }
    );

    // Relay credentials from frontend to container
    socket.on(
      "credential_provided",
      async (data: { missionId: string; requestId: string; credentials: Record<string, string> }) => {
        const id = data.missionId;
        if (!id) return;

        // Verify ownership
        const missionUserId = missionManager.getMissionUserId(id);
        if (missionUserId && missionUserId !== userId) {
          socket.emit("error", { message: "Forbidden" });
          return;
        }

        try {
          await missionManager.relayCredential(id, {
            requestId: data.requestId,
            credentials: data.credentials,
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          socket.emit("error", { message: msg });
        }
      }
    );

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
      if (unsubscribe) {
        unsubscribe();
      }
    });
  });
}
