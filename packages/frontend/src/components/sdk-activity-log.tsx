"use client";

import { useRef, useEffect, useMemo } from "react";
import { useSDKStream, type SDKFeedEntry } from "@/hooks/use-sdk-stream";
import { useMissionStore, buildDisplayNameMap } from "@/store/mission-store";
import { Markdown } from "@/components/markdown";
import { cn, formatDuration } from "@/lib/utils";

// ─── Agent Styling ────────────────────────────────────────────────────────────

const AGENT_COLORS = [
  "bg-accent/20 text-accent",
  "bg-success/20 text-success",
  "bg-warning/20 text-warning",
  "bg-info/20 text-info",
  "bg-error/20 text-error",
  "bg-[#ec4899]/20 text-[#ec4899]",
  "bg-[#8b5cf6]/20 text-[#8b5cf6]",
];

function agentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length]!;
}

function AgentBadge({ name, displayName }: { name: string; displayName?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0",
        agentColor(name),
      )}
    >
      {displayName ?? name}
    </span>
  );
}

// ─── Entry Renderers ──────────────────────────────────────────────────────────

function TextEntry({ entry, displayNames }: { entry: SDKFeedEntry & { kind: "text" }; displayNames: Record<string, string> }) {
  const name = entry.agent && entry.agent !== "orchestrator" ? displayNames[entry.agent] ?? entry.agent : null;
  return (
    <div className="px-4 py-2">
      {name && (
        <div className="mb-1">
          <AgentBadge name={entry.agent!} displayName={name} />
        </div>
      )}
      <div className="text-sm text-text-primary">
        <Markdown content={entry.content} className="text-sm" />
      </div>
    </div>
  );
}

function ToolEntry({ entry, displayNames }: { entry: SDKFeedEntry & { kind: "tool" }; displayNames: Record<string, string> }) {
  const name = entry.agent ? displayNames[entry.agent] ?? entry.agent : null;
  return (
    <div className="flex items-center gap-2 px-4 py-1 text-xs">
      <span className="text-accent text-[10px]">●</span>
      {name && entry.agent !== "orchestrator" && (
        <AgentBadge name={entry.agent!} displayName={name} />
      )}
      <span className="text-text-muted italic truncate">{entry.summary}</span>
    </div>
  );
}

function ToolSummaryEntry({ entry, displayNames }: { entry: SDKFeedEntry & { kind: "tool_summary" }; displayNames: Record<string, string> }) {
  const name = entry.agent ? displayNames[entry.agent] ?? entry.agent : null;
  return (
    <div className="flex items-center gap-2 px-4 py-1 text-xs">
      <span className="text-success text-[10px]">✓</span>
      {name && entry.agent !== "orchestrator" && (
        <AgentBadge name={entry.agent!} displayName={name} />
      )}
      <span className="text-text-muted">{entry.summary}</span>
    </div>
  );
}

function AgentDispatchEntry({ entry, displayNames }: { entry: SDKFeedEntry & { kind: "agent_dispatch" }; displayNames: Record<string, string> }) {
  const displayName = entry.displayName ?? displayNames[entry.agent] ?? entry.agent;
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-bg-surface/50 border-l-2 border-accent/30">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      <AgentBadge name={entry.agent} displayName={displayName} />
      <span className="text-xs text-text-muted">started working{entry.task ? ` on ${entry.task}` : ""}</span>
    </div>
  );
}

function AgentCompleteEntry({ entry, displayNames }: { entry: SDKFeedEntry & { kind: "agent_complete" }; displayNames: Record<string, string> }) {
  const displayName = entry.displayName ?? displayNames[entry.agent] ?? entry.agent;
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-success/5 border-l-2 border-success/30">
      <span className="text-success text-xs">✓</span>
      <AgentBadge name={entry.agent} displayName={displayName} />
      <span className="text-xs text-text-muted">
        completed
        {entry.durationMs != null && (
          <span className="ml-1 text-text-muted/60">({formatDuration(entry.durationMs)})</span>
        )}
      </span>
    </div>
  );
}

function TaskChangeEntry({ entry }: { entry: SDKFeedEntry & { kind: "task_change" } }) {
  const colors: Record<string, string> = {
    in_progress: "bg-accent/10 text-accent border-accent/30",
    completed: "bg-success/10 text-success border-success/30",
    failed: "bg-error/10 text-error border-error/30",
  };
  const color = colors[entry.status] ?? "bg-bg-elevated text-text-muted border-border";
  return (
    <div className={cn("flex items-center gap-2 px-4 py-1.5 text-xs border-l-2", color)}>
      <span className="font-mono text-[10px] opacity-60">{entry.taskId}</span>
      {entry.title && <span className="truncate">{entry.title}</span>}
      <span className="ml-auto text-[10px] opacity-60">{entry.status.replace("_", " ")}</span>
    </div>
  );
}

function ResultEntry({ entry }: { entry: SDKFeedEntry & { kind: "result" } }) {
  const isSuccess = entry.status === "success";
  return (
    <div className={cn(
      "px-4 py-3 border-l-2",
      isSuccess ? "bg-success/5 border-success/40" : "bg-error/5 border-error/40",
    )}>
      <div className="flex items-center gap-2 mb-1">
        <span className={cn("text-sm font-medium", isSuccess ? "text-success" : "text-error")}>
          {isSuccess ? "Mission Complete" : "Mission Failed"}
        </span>
      </div>
      {isSuccess && (entry.costUsd != null || entry.durationMs != null || entry.turns != null) && (
        <div className="flex gap-3 text-[11px] text-text-muted">
          {entry.costUsd != null && <span>Cost: ${entry.costUsd.toFixed(4)}</span>}
          {entry.durationMs != null && <span>Duration: {formatDuration(entry.durationMs)}</span>}
          {entry.turns != null && <span>Turns: {entry.turns}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SDKActivityLog() {
  const { feed, agentStatuses } = useSDKStream();
  const plan = useMissionStore((s) => s.mission?.plan);
  const displayNames = useMemo(() => buildDisplayNameMap(plan), [plan]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new entries
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [feed.length]);

  // Show working agents as thinking at the bottom
  const workingAgents = useMemo(() => {
    const working: string[] = [];
    for (const [name, status] of agentStatuses) {
      if (status === "working") working.push(name);
    }
    return working;
  }, [agentStatuses]);

  if (feed.length === 0 && workingAgents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
        Waiting for mission execution...
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="divide-y divide-border/30">
        {feed.map((entry, i) => {
          const key = `feed-${i}`;
          switch (entry.kind) {
            case "text":
              return <TextEntry key={key} entry={entry} displayNames={displayNames} />;
            case "tool":
              return <ToolEntry key={key} entry={entry} displayNames={displayNames} />;
            case "tool_summary":
              return <ToolSummaryEntry key={key} entry={entry} displayNames={displayNames} />;
            case "agent_dispatch":
              return <AgentDispatchEntry key={key} entry={entry} displayNames={displayNames} />;
            case "agent_complete":
              return <AgentCompleteEntry key={key} entry={entry} displayNames={displayNames} />;
            case "task_change":
              return <TaskChangeEntry key={key} entry={entry} />;
            case "result":
              return <ResultEntry key={key} entry={entry} />;
            case "thinking":
              return (
                <div key={key} className="flex items-center gap-2 px-4 py-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                  </span>
                  <span className="text-xs text-text-muted italic">
                    {entry.agent ? `${displayNames[entry.agent] ?? entry.agent} thinking...` : "Thinking..."}
                  </span>
                </div>
              );
            default:
              return null;
          }
        })}

        {/* Show thinking indicators for currently working agents */}
        {workingAgents.map((name) => (
          <div key={`thinking-${name}`} className="flex items-center gap-2 px-4 py-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            <AgentBadge name={name} displayName={displayNames[name]} />
            <span className="text-xs text-text-muted italic">working...</span>
          </div>
        ))}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
