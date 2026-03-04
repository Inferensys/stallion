"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useMissionStore, buildDisplayNameMap } from "@/store/mission-store";
import { cn, formatTime } from "@/lib/utils";
import { Markdown } from "./markdown";
import { authFetch } from "@/lib/api";

export function ChatPanel({
  missionId,
  onSend,
}: {
  missionId: string;
  onSend: (message: string) => void;
}) {
  const [input, setInput] = useState("");
  const [approving, setApproving] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mission = useMissionStore((s) => s.mission);
  const events = useMissionStore((s) => s.events);
  const chatMessages = useMissionStore((s) => s.chatMessages);

  const plan = mission?.plan;
  const displayNameMap = useMemo(() => buildDisplayNameMap(plan), [plan]);
  const status = mission?.status;
  const isExploring = status === "exploring";
  const isPlanning = status === "planning" || isExploring;
  const isReview = status === "review";
  const isRunning = status === "running";

  // During planning: show chat messages from the planner Q&A
  // During running: show agent messages from events
  const messages =
    isRunning || status === "completed" || status === "failed"
      ? events
          .filter(
            (e) =>
              e.type === "user_message" ||
              e.type === "agent_message" ||
              e.type === "escalation" ||
              e.type === "session_error"
          )
          .map((e) => ({
            id: e.id,
            role:
              e.type === "user_message"
                ? ("user" as const)
                : ("assistant" as const),
            content: (e.data as Record<string, unknown> | undefined)?.text as string ?? e.summary,
            agent: e.agent,
            timestamp: e.timestamp,
            isError: e.type === "session_error",
          }))
      : chatMessages.map((m) => ({
          id: m.id,
          role: m.role === "user" ? ("user" as const) : ("assistant" as const),
          content: m.content,
          agent: m.agentRole ?? undefined,
          timestamp: m.timestamp,
          isError: false,
        }));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleApprovePlan() {
    setApproving(true);
    try {
      await authFetch(`/api/missions/${missionId}/approve`, {
        method: "POST",
      });
    } catch (error) {
      console.error("Failed to approve plan:", error);
    } finally {
      setApproving(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text-primary">Chat</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-text-muted text-sm text-center py-8">
            {isPlanning
              ? "The planner is analyzing your task..."
              : "Start a conversation with your AI agent..."}
          </p>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "max-w-[85%] rounded-xl px-4 py-2.5",
              msg.isError
                ? "bg-error/10 text-error border border-error/20"
                : msg.role === "user"
                  ? "ml-auto bg-accent text-white"
                  : "bg-bg-elevated text-text-primary"
            )}
          >
            {msg.role === "assistant" && msg.agent && (
              <span className="text-xs text-text-muted block mb-1">
                {displayNameMap[msg.agent] ?? msg.agent}
                {msg.agent in displayNameMap && displayNameMap[msg.agent] !== msg.agent && (
                  <span className="font-mono ml-1 opacity-60">({msg.agent})</span>
                )}
              </span>
            )}
            {msg.role === "assistant" ? (
              <Markdown content={msg.content} />
            ) : (
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            )}
            <span className="text-[10px] text-text-muted mt-1 block opacity-60">
              {formatTime(msg.timestamp)}
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Approve Plan button */}
      {isReview && (
        <div className="border-t border-border p-3">
          <button
            onClick={handleApprovePlan}
            disabled={approving}
            className="w-full rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white hover:bg-success/90 disabled:opacity-50 transition-colors"
          >
            {approving ? "Approving..." : "Approve Plan & Start Mission"}
          </button>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-border p-3 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isExploring
              ? "Tell me more..."
              : isPlanning
                ? "Answer planner questions..."
                : isReview
                  ? "Ask to modify the plan..."
                  : "Send a message or assign a task..."
          }
          className="flex-1 rounded-lg bg-bg-elevated border border-border px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
