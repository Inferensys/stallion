"use client";

import { useState, useRef, useEffect } from "react";
import { useMissionStore } from "@/store/mission-store";
import { cn, formatTime } from "@/lib/utils";
import type { EventType } from "@stallion/shared";

const EVENT_ICONS: Partial<Record<EventType, string>> = {
  task_assigned: "📋",
  task_started: "▶️",
  task_completed: "✅",
  task_failed: "❌",
  agent_spawned: "🤖",
  agent_error: "⚠️",
  agent_created: "🔧",
  agent_message_streamed: "💬",
  mission_planned: "📐",
  plan_created: "📐",
  session_started: "🚀",
  session_completed: "🏁",
  session_error: "💥",
  user_message: "💬",
  agent_message: "🤖",
  status_update: "📡",
  tool_executed: "🔧",
};

const TYPE_FILTERS = [
  "all",
  "agents",
  "tasks",
  "system",
] as const;

type TypeFilter = (typeof TYPE_FILTERS)[number];

const TYPE_FILTER_MAP: Record<TypeFilter, EventType[] | null> = {
  all: null,
  agents: [
    "agent_spawned",
    "agent_working",
    "agent_idle",
    "agent_error",
    "agent_created",
    "agent_message",
    "agent_message_streamed",
    "context_share",
    "tool_executed",
  ],
  tasks: [
    "task_assigned",
    "task_started",
    "task_completed",
    "task_failed",
    "plan_created",
    "plan_updated",
    "mission_planned",
  ],
  system: [
    "session_started",
    "session_completed",
    "session_error",
    "status_update",
    "user_message",
    "escalation",
  ],
};

export function EventLog() {
  const [filter, setFilter] = useState<TypeFilter>("all");
  const events = useMissionStore((s) => s.events);
  const bottomRef = useRef<HTMLDivElement>(null);

  const filteredEvents = TYPE_FILTER_MAP[filter]
    ? events.filter((e) => TYPE_FILTER_MAP[filter]!.includes(e.type))
    : events;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filteredEvents.length]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Event Log</h2>
        <div className="flex gap-1">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-medium capitalize transition-colors",
                filter === f
                  ? "bg-accent text-white"
                  : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredEvents.length === 0 && (
          <p className="text-text-muted text-sm text-center py-8">
            No events yet
          </p>
        )}

        <div className="divide-y divide-border/50">
          {filteredEvents.map((event) => (
            <div
              key={event.id}
              className="px-4 py-2 hover:bg-bg-hover/50 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span className="text-xs shrink-0 mt-0.5">
                  {EVENT_ICONS[event.type] ?? "·"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-primary truncate">
                    {event.summary}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-text-muted">
                      {formatTime(event.timestamp)}
                    </span>
                    {event.agent && (
                      <span className="text-[10px] text-text-muted">
                        {event.agent}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
