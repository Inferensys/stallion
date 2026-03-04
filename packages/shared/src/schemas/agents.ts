import { z } from "zod";

// ─── Agent Types ──────────────────────────────────────────────────────────────

export const AgentRole = z.enum([
  "conductor",
  "researcher",
  "coder",
  "writer",
  "analyst",
  "designer",
  "reviewer",
  "devops",
]);
export type AgentRole = z.infer<typeof AgentRole>;

export const AgentRoleConfig: Record<
  AgentRole,
  { label: string; icon: string; description: string; tools: string[]; sandboxTools: string[] }
> = {
  conductor: {
    label: "Conductor",
    icon: "wand-sparkles",
    description: "Orchestration, delegation, user communication",
    tools: ["all-readonly"],
    sandboxTools: [],
  },
  researcher: {
    label: "Researcher",
    icon: "search",
    description: "Web research, documentation, competitive analysis",
    tools: ["browser", "search", "file-reader"],
    sandboxTools: ["web_fetch", "file_read", "file_list"],
  },
  coder: {
    label: "Coder",
    icon: "code",
    description: "Write code, debug, refactor, test",
    tools: ["terminal", "editor", "git", "lsp"],
    sandboxTools: ["shell_exec", "file_write", "file_read", "file_list", "web_fetch"],
  },
  writer: {
    label: "Writer",
    icon: "pen-line",
    description: "Docs, reports, emails, presentations",
    tools: ["editor", "pandoc", "latex"],
    sandboxTools: ["file_write", "file_read", "file_list"],
  },
  analyst: {
    label: "Analyst",
    icon: "bar-chart-3",
    description: "Data analysis, visualization, statistics",
    tools: ["python", "pandas", "jupyter"],
    sandboxTools: ["shell_exec", "file_write", "file_read", "file_list"],
  },
  designer: {
    label: "Designer",
    icon: "palette",
    description: "UI mockups, diagrams, image generation",
    tools: ["svg-tools", "image-gen", "css"],
    sandboxTools: ["file_write", "file_read", "file_list"],
  },
  reviewer: {
    label: "Reviewer",
    icon: "shield-check",
    description: "Code review, QA, security audit, fact-checking",
    tools: ["linters", "sast", "readonly"],
    sandboxTools: ["file_read", "file_list", "shell_exec"],
  },
  devops: {
    label: "DevOps",
    icon: "server",
    description: "Deployment, CI/CD, infrastructure",
    tools: ["docker", "cloud-cli", "terraform"],
    sandboxTools: ["shell_exec", "file_write", "file_read", "file_list", "web_fetch"],
  },
};

// ─── Agent State ──────────────────────────────────────────────────────────────

export const AgentStatus = z.enum([
  "idle",
  "working",
  "waiting",
  "error",
  "completed",
]);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const AgentState = z.object({
  id: z.string(),
  role: AgentRole,
  status: AgentStatus,
  currentTask: z.string().nullable(),
  currentAction: z.string().nullable(),
  startedAt: z.number().nullable(),
  lastActivityAt: z.number(),
  actionsCompleted: z.number(),
  errorsEncurred: z.number(),
});
export type AgentState = z.infer<typeof AgentState>;
