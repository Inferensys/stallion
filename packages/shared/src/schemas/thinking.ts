import { z } from "zod";

// ─── Thinking Modes ───────────────────────────────────────────────────────────

export const ThinkingMode = z.enum([
  "structured",
  "iterative",
  "exploratory",
  "creative",
  "reflective",
]);
export type ThinkingMode = z.infer<typeof ThinkingMode>;

export const ThinkingModeConfig: Record<
  ThinkingMode,
  { label: string; color: string; description: string }
> = {
  structured: {
    label: "Structured",
    color: "#6366f1",
    description: "Decomposition & planning",
  },
  iterative: {
    label: "Iterative",
    color: "#22c55e",
    description: "Try → Evaluate → Refine",
  },
  exploratory: {
    label: "Exploratory",
    color: "#f59e0b",
    description: "Research & discovery",
  },
  creative: {
    label: "Creative",
    color: "#ec4899",
    description: "Divergent thinking & brainstorming",
  },
  reflective: {
    label: "Reflective",
    color: "#8b5cf6",
    description: "Meta-cognition & self-critique",
  },
};

// ─── Metacognitive State Vector ───────────────────────────────────────────────

export const UserSignal = z.enum(["none", "new_task", "feedback", "urgent"]);
export type UserSignal = z.infer<typeof UserSignal>;

export const MetacognitiveState = z.object({
  confidence: z.number().min(0).max(1),
  progressRate: z.number(),
  errorFrequency: z.number(),
  novelty: z.number().min(0).max(1),
  qualityTrend: z.array(z.number()).max(5),
  timeInMode: z.number(),
  stuckScore: z.number().min(0).max(1),
  knowledgeGaps: z.array(z.string()),
  userSignal: UserSignal,
});
export type MetacognitiveState = z.infer<typeof MetacognitiveState>;

export const DEFAULT_METACOGNITIVE_STATE: MetacognitiveState = {
  confidence: 0.5,
  progressRate: 0,
  errorFrequency: 0,
  novelty: 0.5,
  qualityTrend: [],
  timeInMode: 0,
  stuckScore: 0,
  knowledgeGaps: [],
  userSignal: "none",
};

// ─── Mode Switch Decision ─────────────────────────────────────────────────────

export const ModeSwitchReason = z.enum([
  "high_novelty",
  "knowledge_gaps",
  "clear_plan_ready",
  "quality_plateau",
  "high_iteration_count",
  "low_confidence",
  "multiple_valid_paths",
  "high_error_rate",
  "stuck_detected",
  "milestone_reached",
  "periodic_check",
  "user_feedback",
  "task_start",
  "diminishing_returns",
]);
export type ModeSwitchReason = z.infer<typeof ModeSwitchReason>;

export const ModeSwitchDecision = z.object({
  fromMode: ThinkingMode.nullable(),
  toMode: ThinkingMode,
  reason: ModeSwitchReason,
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
  timestamp: z.number(),
});
export type ModeSwitchDecision = z.infer<typeof ModeSwitchDecision>;

// ─── Reflective Mode: Pivot or Persevere ──────────────────────────────────────

export const ReflectionVerdict = z.enum([
  "continue",
  "adjust",
  "pivot",
  "escalate",
]);
export type ReflectionVerdict = z.infer<typeof ReflectionVerdict>;

export const ReflectionResult = z.object({
  verdict: ReflectionVerdict,
  completeness: z.number().min(0).max(1),
  correctness: z.number().min(0).max(1),
  quality: z.number().min(0).max(1),
  efficiency: z.number().min(0).max(1),
  risk: z.number().min(0).max(1),
  alignment: z.number().min(0).max(1),
  issues: z.array(z.string()),
  lessonsLearned: z.array(z.string()),
  nextAction: z.string(),
});
export type ReflectionResult = z.infer<typeof ReflectionResult>;

// ─── Structured Mode: Task Decomposition ──────────────────────────────────────

export const TaskPriority = z.enum(["critical", "high", "medium", "low"]);
export type TaskPriority = z.infer<typeof TaskPriority>;

export const SubtaskStatus = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "blocked",
  "skipped",
]);
export type SubtaskStatus = z.infer<typeof SubtaskStatus>;

export const Subtask = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: SubtaskStatus,
  assignee: z.string().nullable(),
  dependencies: z.array(z.string()),
  complexity: z.number().min(1).max(5),
  priority: TaskPriority,
  deliverable: z.string(),
  estimatedMinutes: z.number().optional(),
});
export type Subtask = z.infer<typeof Subtask>;

export const Phase = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  subtasks: z.array(Subtask),
  order: z.number(),
});
export type Phase = z.infer<typeof Phase>;

export const TaskPlan = z.object({
  id: z.string(),
  title: z.string(),
  phases: z.array(Phase),
  criticalPath: z.array(z.string()),
  totalEstimatedMinutes: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type TaskPlan = z.infer<typeof TaskPlan>;

// ─── Iterative Mode: Quality Tracking ─────────────────────────────────────────

export const EvaluationDomain = z.enum([
  "code",
  "writing",
  "design",
  "data_analysis",
  "research",
]);
export type EvaluationDomain = z.infer<typeof EvaluationDomain>;

export const IterationResult = z.object({
  iteration: z.number(),
  qualityScore: z.number().min(0).max(1),
  improvements: z.array(z.string()),
  remainingIssues: z.array(z.string()),
  domain: EvaluationDomain,
  shouldContinue: z.boolean(),
  diminishingReturns: z.boolean(),
});
export type IterationResult = z.infer<typeof IterationResult>;

// ─── Creative Mode: Alternatives ──────────────────────────────────────────────

export const CreativeAlternative = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  merits: z.array(z.string()),
  drawbacks: z.array(z.string()),
  score: z.number().min(0).max(1),
  technique: z.string(),
});
export type CreativeAlternative = z.infer<typeof CreativeAlternative>;

export const CreativeResult = z.object({
  alternatives: z.array(CreativeAlternative),
  synthesis: z.string().optional(),
  recommended: z.string().optional(),
});
export type CreativeResult = z.infer<typeof CreativeResult>;

// ─── Exploratory Mode: Knowledge Graph ────────────────────────────────────────

export const KnowledgeNode = z.object({
  id: z.string(),
  concept: z.string(),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  source: z.string(),
  tags: z.array(z.string()),
});
export type KnowledgeNode = z.infer<typeof KnowledgeNode>;

export const KnowledgeEdge = z.object({
  from: z.string(),
  to: z.string(),
  relationship: z.string(),
});
export type KnowledgeEdge = z.infer<typeof KnowledgeEdge>;

export const ExplorationResult = z.object({
  nodes: z.array(KnowledgeNode),
  edges: z.array(KnowledgeEdge),
  keyFindings: z.array(z.string()),
  openQuestions: z.array(z.string()),
  recommendedApproach: z.string().optional(),
});
export type ExplorationResult = z.infer<typeof ExplorationResult>;
