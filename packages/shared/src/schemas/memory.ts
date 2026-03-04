import { z } from "zod";

// ─── Memory Tiers ─────────────────────────────────────────────────────────────

export const MemoryTier = z.enum(["short_term", "medium_term", "long_term"]);
export type MemoryTier = z.infer<typeof MemoryTier>;

// Short-term: Redis + in-context, ~1 hour
export const ShortTermMemory = z.object({
  sessionId: z.string(),
  key: z.string(),
  value: z.unknown(),
  expiresAt: z.number(),
  createdAt: z.number(),
});
export type ShortTermMemory = z.infer<typeof ShortTermMemory>;

// Medium-term: Filesystem + Supabase, session lifespan
export const MediumTermMemory = z.object({
  id: z.string(),
  sessionId: z.string(),
  category: z.enum([
    "decision",
    "convention",
    "error_pattern",
    "approach",
    "finding",
  ]),
  content: z.string(),
  tags: z.array(z.string()),
  importance: z.number().min(0).max(1),
  createdAt: z.number(),
  accessedAt: z.number(),
  accessCount: z.number(),
});
export type MediumTermMemory = z.infer<typeof MediumTermMemory>;

// Long-term: Supabase + pgvector, permanent
export const LongTermMemory = z.object({
  id: z.string(),
  userId: z.string(),
  category: z.enum([
    "user_preference",
    "learned_pattern",
    "project_summary",
    "skill",
    "tool_knowledge",
  ]),
  content: z.string(),
  embedding: z.array(z.number()).optional(),
  tags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  usageCount: z.number(),
});
export type LongTermMemory = z.infer<typeof LongTermMemory>;

// ─── Memory Operations ───────────────────────────────────────────────────────

export const MemoryQuery = z.object({
  tier: MemoryTier.optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  query: z.string().optional(),
  limit: z.number().default(10),
});
export type MemoryQuery = z.infer<typeof MemoryQuery>;

// ─── Context Window Management ────────────────────────────────────────────────

export const ContextBudget = z.object({
  systemPrompt: z.number().default(2000),
  spec: z.number().default(2000),
  planSection: z.number().default(3000),
  compressedHistory: z.number().default(20000),
  recentEvents: z.number().default(15000),
  workingSet: z.number().default(50000),
  reasoningSpace: z.number().default(108000),
});
export type ContextBudget = z.infer<typeof ContextBudget>;
