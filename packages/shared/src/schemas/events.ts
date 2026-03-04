import { z } from "zod";

// ─── Event Bus Events ─────────────────────────────────────────────────────────

export const EventType = z.enum([
  // Task lifecycle
  "task_assigned",
  "task_started",
  "task_completed",
  "task_failed",

  // Agent lifecycle
  "agent_spawned",
  "agent_working",
  "agent_idle",
  "agent_error",

  // Mission lifecycle
  "mission_planned",
  "agent_created",
  "agent_message_streamed",

  // Planning
  "plan_created",
  "plan_updated",

  // Artifacts
  "artifact_created",
  "artifact_updated",

  // Communication
  "user_message",
  "agent_message",
  "context_share",
  "escalation",

  // Tools
  "tool_executed",

  // System
  "session_started",
  "session_completed",
  "session_error",
  "status_update",

  // Rich activity (Claude Code-style)
  "agent_thinking",
  "task_status_changed",
  "agent_completed",

  // Credential relay (agent VM)
  "credential_request",
  "credential_provided",
  "browser_screenshot",

  // Container lifecycle
  "container_creating",
  "container_running",
  "container_stopped",
  "container_error",

  // Exploration streaming
  "exploration_activity",
  "exploration_token",
  "exploration_done",
]);
export type EventType = z.infer<typeof EventType>;

export const SessionEvent = z.object({
  id: z.string(),
  sessionId: z.string(),
  type: EventType,
  agent: z.string().optional(),
  summary: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.number(),
});
export type SessionEvent = z.infer<typeof SessionEvent>;

// ─── Chat Messages ────────────────────────────────────────────────────────────

export const ChatRole = z.enum(["user", "assistant", "system"]);
export type ChatRole = z.infer<typeof ChatRole>;

export const ChatMessage = z.object({
  id: z.string(),
  sessionId: z.string(),
  role: ChatRole,
  content: z.string(),
  agentRole: z.string().optional(),
  timestamp: z.number(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

// ─── SDK Message Envelope (raw relay from Agent SDK) ─────────────────────────

export const SDKEnvelope = z.object({
  id: z.string(),
  sessionId: z.string(),
  timestamp: z.number(),
  msg: z.unknown(), // raw SDKMessage — typed on frontend via SDK types
});
export type SDKEnvelope = z.infer<typeof SDKEnvelope>;

// ─── Context Store Entry ──────────────────────────────────────────────────────

export const ContextCategory = z.enum([
  "finding",
  "decision",
  "constraint",
  "convention",
  "error_pattern",
  "user_preference",
  "assumption",
]);
export type ContextCategory = z.infer<typeof ContextCategory>;

export const ContextEntry = z.object({
  id: z.string(),
  sessionId: z.string(),
  agent: z.string(),
  category: ContextCategory,
  summary: z.string(),
  detail: z.string().optional(),
  tags: z.array(z.string()),
  confidence: z.number().min(0).max(1).default(0.8),
  timestamp: z.number(),
});
export type ContextEntry = z.infer<typeof ContextEntry>;
