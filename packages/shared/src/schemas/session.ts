import { z } from "zod";
import { ThinkingMode, TaskPlan, MetacognitiveState } from "./thinking";
import { AgentState } from "./agents";

// ─── Task Spec (from user) ───────────────────────────────────────────────────

export const TaskSpec = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  deliverables: z.array(z.string()),
  constraints: z.array(z.string()),
  context: z.string().optional(),
  acceptanceCriteria: z.array(z.string()),
  suggestedPhases: z.array(z.string()).optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  createdAt: z.number(),
});
export type TaskSpec = z.infer<typeof TaskSpec>;

// ─── Session ──────────────────────────────────────────────────────────────────

export const SessionStatus = z.enum([
  "spec_building",
  "launching",
  "running",
  "paused",
  "completed",
  "failed",
]);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const Session = z.object({
  id: z.string(),
  status: SessionStatus,
  spec: TaskSpec.nullable(),
  plan: TaskPlan.nullable(),
  currentMode: ThinkingMode.nullable(),
  metacognitiveState: MetacognitiveState.nullable(),
  agents: z.array(AgentState),
  artifacts: z.array(z.string()),
  startedAt: z.number().nullable(),
  completedAt: z.number().nullable(),
  createdAt: z.number(),
});
export type Session = z.infer<typeof Session>;

// ─── Chat Messages ────────────────────────────────────────────────────────────

export const ChatRole = z.enum(["user", "assistant", "system"]);
export type ChatRole = z.infer<typeof ChatRole>;

export const ChatMessage = z.object({
  id: z.string(),
  sessionId: z.string(),
  role: ChatRole,
  content: z.string(),
  agentRole: z.string().optional(),
  thinkingMode: ThinkingMode.optional(),
  timestamp: z.number(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

// ─── Artifacts ────────────────────────────────────────────────────────────────

export const ArtifactType = z.enum([
  "code",
  "document",
  "image",
  "data",
  "diagram",
  "report",
  "other",
]);
export type ArtifactType = z.infer<typeof ArtifactType>;

export const Artifact = z.object({
  id: z.string(),
  sessionId: z.string(),
  type: ArtifactType,
  title: z.string(),
  path: z.string(),
  mimeType: z.string().optional(),
  preview: z.string().optional(),
  createdBy: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Artifact = z.infer<typeof Artifact>;
