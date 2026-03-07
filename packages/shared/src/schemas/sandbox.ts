import { z } from "zod";

// ─── Sandbox Configuration ────────────────────────────────────────────────────

// SandboxConfig — passed from backend to container manager
export const SandboxConfig = z.object({
  sessionId: z.string(),
  workspaceDir: z.string(), // /workspace/<sessionId>
  controlPort: z.number().default(3001), // port inside container
  memoryBytes: z.number().default(4 * 1024 * 1024 * 1024), // 4GB
  nanoCpus: z.number().default(2_000_000_000), // 2 CPUs
  diskSizeGb: z.number().default(10),
  wallClockTimeoutMs: z.number().default(30 * 60 * 1000), // 30 min
  idleTimeoutMs: z.number().default(30 * 60 * 1000), // 30 min
  costBudgetUsd: z.number().default(5), // $5
});
export type SandboxConfig = z.infer<typeof SandboxConfig>;

// ─── Container Info ───────────────────────────────────────────────────────────

// ContainerInfo — returned after container creation
export const ContainerInfo = z.object({
  containerId: z.string(),
  sessionId: z.string(),
  hostPort: z.number(),
  authToken: z.string(),
  createdAt: z.number(),
});
export type ContainerInfo = z.infer<typeof ContainerInfo>;

// ─── Control Server Status ────────────────────────────────────────────────────

// ControlServerStatus — from GET /status
export const ControlServerStatus = z.object({
  status: z.enum(["ready", "busy", "error"]),
  sessionId: z.string().optional(),
  uptime: z.number(),
});
export type ControlServerStatus = z.infer<typeof ControlServerStatus>;

// ─── Session Request/Response ─────────────────────────────────────────────────

// StartSessionRequest — POST /start body
export const StartSessionRequest = z.object({
  prompt: z.string(),
  sessionId: z.string(),
  resumeSessionId: z.string().optional(),
});
export type StartSessionRequest = z.infer<typeof StartSessionRequest>;

// StartSessionResponse — POST /start response
export const StartSessionResponse = z.object({
  ok: z.boolean(),
  sessionId: z.string(),
});
export type StartSessionResponse = z.infer<typeof StartSessionResponse>;
