import { describe, it, expect } from "vitest";
import {
  MetacognitiveState,
  ThinkingMode,
  ModeSwitchDecision,
  ReflectionResult,
  TaskPlan,
  Subtask,
  Phase,
  IterationResult,
  CreativeAlternative,
  ExplorationResult,
  DEFAULT_METACOGNITIVE_STATE,
  TaskSpec,
  Session,
  ChatMessage,
  Artifact,
  SessionEvent,
  ContextEntry,
  ShortTermMemory,
  MediumTermMemory,
  LongTermMemory,
  ContextBudget,
  AgentState,
  AgentRole,
  ThinkingModeConfig,
} from "../index";

describe("ThinkingMode", () => {
  it("accepts valid thinking modes", () => {
    expect(ThinkingMode.parse("structured")).toBe("structured");
    expect(ThinkingMode.parse("iterative")).toBe("iterative");
    expect(ThinkingMode.parse("exploratory")).toBe("exploratory");
    expect(ThinkingMode.parse("creative")).toBe("creative");
    expect(ThinkingMode.parse("reflective")).toBe("reflective");
  });

  it("rejects invalid thinking modes", () => {
    expect(() => ThinkingMode.parse("invalid")).toThrow();
    expect(() => ThinkingMode.parse("")).toThrow();
  });

  it("has config for all modes", () => {
    const modes = ThinkingMode.options;
    for (const mode of modes) {
      expect(ThinkingModeConfig[mode]).toBeDefined();
      expect(ThinkingModeConfig[mode].label).toBeTruthy();
      expect(ThinkingModeConfig[mode].color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("MetacognitiveState", () => {
  it("accepts valid state", () => {
    const state = MetacognitiveState.parse({
      confidence: 0.7,
      progressRate: 0.5,
      errorFrequency: 0.1,
      novelty: 0.3,
      qualityTrend: [0.5, 0.6, 0.7],
      timeInMode: 15,
      stuckScore: 0.0,
      knowledgeGaps: ["auth system"],
      userSignal: "none",
    });
    expect(state.confidence).toBe(0.7);
    expect(state.knowledgeGaps).toHaveLength(1);
  });

  it("rejects out-of-range confidence", () => {
    expect(() =>
      MetacognitiveState.parse({
        ...DEFAULT_METACOGNITIVE_STATE,
        confidence: 1.5,
      })
    ).toThrow();
    expect(() =>
      MetacognitiveState.parse({
        ...DEFAULT_METACOGNITIVE_STATE,
        confidence: -0.1,
      })
    ).toThrow();
  });

  it("limits quality trend to 5 entries", () => {
    expect(() =>
      MetacognitiveState.parse({
        ...DEFAULT_METACOGNITIVE_STATE,
        qualityTrend: [1, 2, 3, 4, 5, 6],
      })
    ).toThrow();
  });

  it("validates userSignal enum", () => {
    expect(() =>
      MetacognitiveState.parse({
        ...DEFAULT_METACOGNITIVE_STATE,
        userSignal: "invalid",
      })
    ).toThrow();
  });

  it("has correct defaults", () => {
    expect(DEFAULT_METACOGNITIVE_STATE.confidence).toBe(0.5);
    expect(DEFAULT_METACOGNITIVE_STATE.stuckScore).toBe(0);
    expect(DEFAULT_METACOGNITIVE_STATE.userSignal).toBe("none");
    expect(DEFAULT_METACOGNITIVE_STATE.knowledgeGaps).toEqual([]);
  });
});

describe("ModeSwitchDecision", () => {
  it("accepts valid decision", () => {
    const decision = ModeSwitchDecision.parse({
      fromMode: "structured",
      toMode: "iterative",
      reason: "clear_plan_ready",
      confidence: 0.9,
      explanation: "Plan is ready, switching to execution",
      timestamp: Date.now(),
    });
    expect(decision.fromMode).toBe("structured");
    expect(decision.toMode).toBe("iterative");
  });

  it("allows null fromMode for initial switch", () => {
    const decision = ModeSwitchDecision.parse({
      fromMode: null,
      toMode: "structured",
      reason: "task_start",
      confidence: 1.0,
      explanation: "Starting new task",
      timestamp: Date.now(),
    });
    expect(decision.fromMode).toBeNull();
  });
});

describe("ReflectionResult", () => {
  it("accepts valid reflection with all dimensions", () => {
    const result = ReflectionResult.parse({
      verdict: "continue",
      completeness: 0.8,
      correctness: 0.9,
      quality: 0.7,
      efficiency: 0.6,
      risk: 0.3,
      alignment: 0.9,
      issues: ["missing edge case"],
      lessonsLearned: ["use boundary checks"],
      nextAction: "add edge case tests",
    });
    expect(result.verdict).toBe("continue");
    expect(result.issues).toHaveLength(1);
  });

  it("validates verdict enum", () => {
    expect(() =>
      ReflectionResult.parse({
        verdict: "invalid",
        completeness: 0,
        correctness: 0,
        quality: 0,
        efficiency: 0,
        risk: 0,
        alignment: 0,
        issues: [],
        lessonsLearned: [],
        nextAction: "",
      })
    ).toThrow();
  });
});

describe("Subtask", () => {
  it("accepts valid subtask", () => {
    const subtask = Subtask.parse({
      id: "st-1",
      title: "Implement auth",
      description: "JWT authentication",
      status: "pending",
      assignee: "coder",
      dependencies: [],
      complexity: 3,
      priority: "high",
      deliverable: "auth module",
    });
    expect(subtask.status).toBe("pending");
    expect(subtask.complexity).toBe(3);
  });

  it("validates complexity range", () => {
    expect(() =>
      Subtask.parse({
        id: "st-1",
        title: "t",
        description: "d",
        status: "pending",
        assignee: null,
        dependencies: [],
        complexity: 6,
        priority: "low",
        deliverable: "d",
      })
    ).toThrow();
  });
});

describe("TaskSpec", () => {
  it("accepts valid spec", () => {
    const spec = TaskSpec.parse({
      id: "spec-1",
      title: "Build API",
      description: "REST API for todos",
      deliverables: ["API endpoints", "Documentation"],
      constraints: ["Must use TypeScript"],
      acceptanceCriteria: ["All CRUD operations work"],
      priority: "high",
      createdAt: Date.now(),
    });
    expect(spec.title).toBe("Build API");
    expect(spec.priority).toBe("high");
  });

  it("defaults priority to medium", () => {
    const spec = TaskSpec.parse({
      id: "spec-1",
      title: "t",
      description: "d",
      deliverables: [],
      constraints: [],
      acceptanceCriteria: [],
      createdAt: Date.now(),
    });
    expect(spec.priority).toBe("medium");
  });
});

describe("SessionEvent", () => {
  it("accepts valid event", () => {
    const event = SessionEvent.parse({
      id: "evt-1",
      sessionId: "session-1",
      type: "mode_switch",
      agent: "conductor",
      thinkingMode: "structured",
      summary: "Switching to structured mode",
      timestamp: Date.now(),
    });
    expect(event.type).toBe("mode_switch");
  });

  it("validates event type enum", () => {
    expect(() =>
      SessionEvent.parse({
        id: "evt-1",
        sessionId: "session-1",
        type: "invalid_type",
        summary: "test",
        timestamp: Date.now(),
      })
    ).toThrow();
  });
});

describe("AgentState", () => {
  it("accepts valid agent state", () => {
    const state = AgentState.parse({
      id: "agent-1",
      role: "coder",
      status: "working",
      currentTask: "Implement API",
      currentAction: "Writing code",
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      actionsCompleted: 5,
      errorsEncurred: 1,
    });
    expect(state.role).toBe("coder");
    expect(state.status).toBe("working");
  });

  it("validates all agent roles", () => {
    const roles = AgentRole.options;
    expect(roles).toContain("conductor");
    expect(roles).toContain("researcher");
    expect(roles).toContain("coder");
    expect(roles).toContain("writer");
    expect(roles).toContain("analyst");
    expect(roles).toContain("designer");
    expect(roles).toContain("reviewer");
    expect(roles).toContain("devops");
  });
});

describe("Memory schemas", () => {
  it("validates ShortTermMemory", () => {
    const mem = ShortTermMemory.parse({
      sessionId: "s-1",
      key: "current_file",
      value: "index.ts",
      expiresAt: Date.now() + 3600000,
      createdAt: Date.now(),
    });
    expect(mem.key).toBe("current_file");
  });

  it("validates MediumTermMemory", () => {
    const mem = MediumTermMemory.parse({
      id: "m-1",
      sessionId: "s-1",
      category: "decision",
      content: "Using Prisma as ORM",
      tags: ["database", "orm"],
      importance: 0.8,
      createdAt: Date.now(),
      accessedAt: Date.now(),
      accessCount: 3,
    });
    expect(mem.category).toBe("decision");
  });

  it("validates LongTermMemory", () => {
    const mem = LongTermMemory.parse({
      id: "l-1",
      userId: "user-1",
      category: "user_preference",
      content: "Prefers TypeScript over JavaScript",
      tags: ["language"],
      confidence: 0.95,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 10,
    });
    expect(mem.confidence).toBe(0.95);
  });

  it("validates ContextBudget defaults", () => {
    const budget = ContextBudget.parse({});
    expect(budget.systemPrompt).toBe(2000);
    expect(budget.reasoningSpace).toBe(108000);
  });
});

describe("ContextEntry", () => {
  it("accepts valid context entry", () => {
    const entry = ContextEntry.parse({
      id: "ctx-1",
      sessionId: "s-1",
      agent: "researcher",
      category: "finding",
      summary: "Auth uses JWT",
      tags: ["auth", "jwt"],
      confidence: 0.9,
      timestamp: Date.now(),
    });
    expect(entry.category).toBe("finding");
    expect(entry.tags).toContain("jwt");
  });
});
