import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { nanoid } from "nanoid";

// ─── SDK Executor ─────────────────────────────────────────────────────────────
// Wraps the Claude Agent SDK query() with abort support and envelope emission.
// Inside the container, env vars are already set by Docker — do NOT pass env:
// to query(). The SDK reads process.env naturally.

export interface RunSessionParams {
  prompt: string;
  sessionId: string;
  resumeSessionId?: string;
  abortSignal?: AbortSignal;
}

export interface RunSessionResult {
  sessionId: string;
  totalCostUsd?: number;
}

export interface SDKEnvelopeShape {
  id: string;
  sessionId: string;
  timestamp: number;
  msg: unknown;
}

export async function runSession(
  params: RunSessionParams,
  onMessage: (envelope: SDKEnvelopeShape) => void,
): Promise<RunSessionResult> {
  const { prompt, sessionId, resumeSessionId, abortSignal } = params;

  // Workspace dir from env — already set by Docker
  const workspaceDir = process.env["WORKSPACE_DIR"] ?? "/workspace";

  // Create an AbortController wrapping the provided signal
  const abortController = new AbortController();
  if (abortSignal) {
    abortSignal.addEventListener("abort", () => abortController.abort());
  }

  const options: Options = {
    systemPrompt: { type: "preset", preset: "claude_code" },
    tools: { type: "preset", preset: "claude_code" },
    cwd: workspaceDir,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    abortController,
    ...(resumeSessionId ? { resume: resumeSessionId } : {}),
  };

  let capturedSessionId = sessionId;
  let totalCostUsd: number | undefined;

  try {
    for await (const msg of query({ prompt, options })) {
      // Capture session_id and cost from result-type messages
      const raw = msg as Record<string, unknown>;
      if (raw["type"] === "result") {
        if (typeof raw["session_id"] === "string") {
          capturedSessionId = raw["session_id"];
        }
        if (typeof raw["total_cost_usd"] === "number") {
          totalCostUsd = raw["total_cost_usd"];
        }
      }

      onMessage({
        id: nanoid(),
        sessionId,
        timestamp: Date.now(),
        msg,
      });
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    // Emit a final error envelope before throwing
    onMessage({
      id: nanoid(),
      sessionId,
      timestamp: Date.now(),
      msg: { type: "error", error: errorMsg },
    });
    throw err;
  }

  return { sessionId: capturedSessionId, totalCostUsd };
}
