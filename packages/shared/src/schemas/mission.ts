import { z } from "zod";

// ─── Mission Agent (dynamic — replaces fixed AgentRole) ─────────────────────

export const MissionAgent = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  specialization: z.string().optional(),
  description: z.string(),
  prompt: z.string(),
  tools: z.array(z.string()).optional(),
  model: z.enum(["sonnet", "opus", "haiku", "inherit"]).optional(),
  mcpServers: z.array(z.string()).optional(),
});
export type MissionAgent = z.infer<typeof MissionAgent>;

// ─── Mission Task ────────────────────────────────────────────────────────────

export const MissionTaskStatus = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
]);
export type MissionTaskStatus = z.infer<typeof MissionTaskStatus>;

export const MissionTask = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  assignee: z.string().nullable(),
  dependencies: z.array(z.string()),
  status: MissionTaskStatus,
});
export type MissionTask = z.infer<typeof MissionTask>;

// ─── Mission Plan ────────────────────────────────────────────────────────────

export const MissionPlan = z.object({
  id: z.string(),
  title: z.string(),
  objective: z.string(),
  agents: z.array(MissionAgent),
  tasks: z.array(MissionTask),
  mcpServers: z.record(z.string(), z.unknown()).optional(),
  estimatedComplexity: z.enum(["simple", "moderate", "complex"]),
  createdAt: z.number(),
});
export type MissionPlan = z.infer<typeof MissionPlan>;

// ─── Mission Status ──────────────────────────────────────────────────────────

export const MissionStatus = z.enum([
  "exploring",
  "planning",
  "review",
  "launching",
  "running",
  "paused",
  "completed",
  "failed",
]);
export type MissionStatus = z.infer<typeof MissionStatus>;

// ─── Mission Agent State (live runtime state) ────────────────────────────────

export const MissionAgentStatus = z.enum([
  "idle",
  "working",
  "completed",
  "error",
]);
export type MissionAgentStatus = z.infer<typeof MissionAgentStatus>;

export const MissionAgentState = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  specialization: z.string().optional(),
  status: MissionAgentStatus,
  currentAction: z.string().nullable(),
  messagesProcessed: z.number(),
  startedAt: z.number().optional(),
});
export type MissionAgentState = z.infer<typeof MissionAgentState>;

// ─── Container Status ─────────────────────────────────────────────────────────

export const ContainerStatus = z.enum([
  "creating",
  "running",
  "stopped",
  "error",
]);
export type ContainerStatus = z.infer<typeof ContainerStatus>;

// ─── Mission ─────────────────────────────────────────────────────────────────

export const Mission = z.object({
  id: z.string(),
  userId: z.string().optional(),
  status: MissionStatus,
  plan: MissionPlan.nullable(),
  agents: z.array(MissionAgentState),
  workspace: z.string(),
  readinessScore: z.number().nullable(),
  startedAt: z.number().nullable(),
  completedAt: z.number().nullable(),
  createdAt: z.number(),
  // Agent VM container fields
  vncUrl: z.string().optional(),
  containerStatus: ContainerStatus.optional(),
});
export type Mission = z.infer<typeof Mission>;
