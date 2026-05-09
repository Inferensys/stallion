"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Playfair_Display } from "next/font/google";
import { Dashboard } from "@/components/dashboard";
import { Sidebar } from "@/components/sidebar";
import { Markdown } from "@/components/markdown";
import { useSocket } from "@/hooks/use-socket";
import { useAuth } from "@/hooks/use-auth";
import { useMissionStore, type ExplorationFeedEntry } from "@/store/mission-store";
import { cn, formatTime } from "@/lib/utils";
import { authFetch } from "@/lib/api";
import type { Mission, ChatMessage } from "@stallion/shared";

const logoFont = Playfair_Display({
  weight: "700",
  subsets: ["latin"],
  style: "italic",
  display: "swap",
});

const headingFont = Playfair_Display({
  weight: "600",
  subsets: ["latin"],
  style: "normal",
  display: "swap",
});

const STORAGE_KEY = "stallion-mission-id";
const SIDEBAR_KEY = "stallion-sidebar";
const PORTFOLIO_MODE = process.env.NEXT_PUBLIC_PORTFOLIO_MODE === "true";
const ONE_DAY_MS = 86_400_000;

type LandingPhase = "idle" | "exploring" | "planning" | "entering";

interface ExplorationMessage {
  id: string;
  role: "user" | "assistant" | "activity";
  content: string;
  timestamp: number;
  feed?: ExplorationFeedEntry[];
}

const STATUS_COLORS: Record<string, string> = {
  exploring: "bg-accent",
  planning: "bg-warning",
  review: "bg-warning",
  launching: "bg-info",
  running: "bg-success",
  paused: "bg-text-muted",
  completed: "bg-info",
  failed: "bg-error",
};

function readinessLabel(score: number): string {
  if (score <= 3) return "Exploring";
  if (score <= 6) return "Getting clearer";
  if (score <= 8) return "Almost ready";
  return "Ready to plan";
}

function readinessColor(score: number): string {
  if (score <= 3) return "bg-accent";
  if (score <= 6) return "bg-warning";
  return "bg-success";
}

function ReadinessIndicator({ score }: { score: number }) {
  const pct = Math.round((score / 10) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", readinessColor(score))}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-text-muted whitespace-nowrap">
        {readinessLabel(score)}
      </span>
    </div>
  );
}

const EXAMPLES = [
  {
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8" /><path d="M12 17v4" />
        <path d="M7 8l3 3-3 3" /><path d="M13 14h4" />
      </svg>
    ),
    title: "Build a full-stack app",
    prompt: "Build a modern task management app with Next.js, real-time updates, and a clean dashboard UI",
  },
  {
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7" />
        <rect x="15" y="15" width="6" height="6" rx="1" />
        <path d="M9 9h6" /><path d="M9 13h3" />
      </svg>
    ),
    title: "Design a landing page",
    prompt: "Design and build a conversion-optimized SaaS landing page with hero, features, testimonials, and pricing sections",
  },
  {
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="M7 17l4-8 4 4 5-10" />
      </svg>
    ),
    title: "Analyze & visualize data",
    prompt: "Analyze this dataset for trends and anomalies, create visualizations, and write a summary report with key insights",
  },
  {
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14" /><path d="M18 11l-6-6-6 6" />
        <path d="M4 21h16" />
        <circle cx="19" cy="5" r="3" />
      </svg>
    ),
    title: "Ship an API",
    prompt: "Design and implement a RESTful API with authentication, rate limiting, OpenAPI docs, and integration tests",
  },
];

export default function Home() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<LandingPhase>("idle");
  const [missionId, setMissionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [taskInput, setTaskInput] = useState("");
  const [missions, setMissions] = useState<Mission[]>([]);
  const [resuming, setResuming] = useState(true);
  const [messages, setMessages] = useState<ExplorationMessage[]>([]);
  const [readiness, setReadiness] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reset = useMissionStore((s) => s.reset);
  const visibleMissions = PORTFOLIO_MODE
    ? missions.filter((m) => m.status !== "failed" && Date.now() - m.createdAt < ONE_DAY_MS)
    : missions;

  // Exploration streaming state from store (fed by WebSocket)
  const explorationFeed = useMissionStore((s) => s.explorationFeed);
  const clearExplorationStream = useMissionStore((s) => s.clearExplorationStream);
  const storeReadiness = useMissionStore((s) => s.readinessScore);

  // Connect socket during exploration to receive streaming events
  const socketMissionId = phase === "exploring" || phase === "planning" ? missionId : null;
  useSocket(socketMissionId);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, explorationFeed.length, scrollToBottom]);

  // Sync readiness from store (updated by WebSocket exploration_done)
  useEffect(() => {
    if (storeReadiness != null && storeReadiness > 0) {
      setReadiness(storeReadiness);
    }
  }, [storeReadiness]);

  // Restore sidebar state
  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    if (saved === "closed") setSidebarOpen(false);
  }, []);

  function toggleSidebar() {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, next ? "open" : "closed");
      return next;
    });
  }

  // Fetch missions — always (for sidebar)
  const fetchMissions = useCallback(() => {
    authFetch("/api/missions")
      .then((res) => res.json())
      .then((data) => {
        const list = (data.missions ?? []) as Mission[];
        list.sort((a, b) => b.createdAt - a.createdAt);
        setMissions(list);
      })
      .catch(() => setMissions([]));
  }, []);

  useEffect(() => {
    fetchMissions();
  }, [fetchMissions, phase]);

  // Poll mission list every 15s to keep sidebar status/timestamps fresh
  useEffect(() => {
    const interval = setInterval(fetchMissions, 15_000);
    return () => clearInterval(interval);
  }, [fetchMissions]);

  // Auto-resume from localStorage
  useEffect(() => {
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (!savedId) {
      setResuming(false);
      return;
    }

    authFetch(`/api/missions/${savedId}`)
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("not found");
      })
      .then(async (data) => {
        const mission = data.mission as Mission;
        if (!mission) {
          localStorage.removeItem(STORAGE_KEY);
          setResuming(false);
          return;
        }

        if (mission.status === "exploring") {
          setMissionId(savedId);
          const chatRes = await authFetch(`/api/missions/${savedId}/chat`);
          const chatData = await chatRes.json();
          const chatMessages = (chatData.chat ?? []) as ChatMessage[];
          const restored: ExplorationMessage[] = chatMessages.map((m) => ({
            id: m.id,
            role: m.role === "user" ? "user" as const : "assistant" as const,
            content: m.content,
            timestamp: m.timestamp,
          }));
          // If last message is from user (Aria never replied — e.g. page refresh mid-request),
          // add a system note so the user knows they can send again
          if (restored.length > 0 && restored[restored.length - 1]!.role === "user") {
            restored.push({
              id: `msg-system-resume`,
              role: "assistant",
              content: "*(Session resumed — you can send another message or continue exploring.)*",
              timestamp: Date.now(),
            });
          }
          setMessages(restored);
          setReadiness(mission.readinessScore ?? 0);
          setPhase("exploring");
        } else {
          enterMission(savedId);
        }
      })
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY);
      })
      .finally(() => {
        setResuming(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function enterMission(mid: string) {
    reset();
    localStorage.setItem(STORAGE_KEY, mid);
    setMissionId(mid);
    setPhase("entering");
  }

  function handleNewMission() {
    setPhase("idle");
    setMissionId(null);
    setMessages([]);
    setReadiness(0);
    setTaskInput("");
    localStorage.removeItem(STORAGE_KEY);
  }

  function handleSelectMission(m: Mission) {
    if (m.status === "exploring") {
      setMissionId(m.id);
      localStorage.setItem(STORAGE_KEY, m.id);
      authFetch(`/api/missions/${m.id}/chat`)
        .then((r) => r.json())
        .then((d) => {
          const chatMsgs = (d.chat ?? []) as ChatMessage[];
          setMessages(
            chatMsgs.map((msg) => ({
              id: msg.id,
              role: msg.role === "user" ? "user" as const : "assistant" as const,
              content: msg.content,
              timestamp: msg.timestamp,
            })),
          );
          setReadiness(m.readinessScore ?? 0);
          setPhase("exploring");
        });
    } else {
      enterMission(m.id);
    }
  }

  async function startExploration() {
    if (!taskInput.trim()) return;
    setLoading(true);
    try {
      const res = await authFetch("/api/missions", { method: "POST" });
      const data = await res.json();
      const mid = data.mission.id as string;
      setMissionId(mid);
      localStorage.setItem(STORAGE_KEY, mid);

      const userMsg: ExplorationMessage = {
        id: `msg-user-0`,
        role: "user",
        content: taskInput.trim(),
        timestamp: Date.now(),
      };
      setMessages([userMsg]);
      setPhase("exploring");
      setSending(true);
      clearExplorationStream();

      // Fire HTTP POST — WebSocket will deliver tokens/activities live
      const exploreRes = await authFetch(`/api/missions/${mid}/explore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: taskInput.trim() }),
      });
      const exploreData = await exploreRes.json();

      // Snapshot feed before clearing — preserves interleaved text+tool order
      const feed = useMissionStore.getState().explorationFeed.map(e => ({...e}));

      // HTTP response is authoritative — finalize with clean text
      const assistantMsg: ExplorationMessage = {
        id: `msg-aria-0`,
        role: "assistant",
        content: exploreData.text,
        timestamp: Date.now(),
        feed: feed.length > 0 ? feed : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setReadiness(exploreData.readiness ?? 0);
      clearExplorationStream();
      setTaskInput("");
    } catch (error) {
      console.error("Failed to start exploration:", error);
      clearExplorationStream();
      setPhase("idle");
    } finally {
      setLoading(false);
      setSending(false);
    }
  }

  async function sendExplorationMessage() {
    if (!chatInput.trim() || !missionId || sending) return;
    const content = chatInput.trim();
    setChatInput("");
    setSending(true);
    clearExplorationStream();

    const userMsg: ExplorationMessage = {
      id: `msg-user-${Date.now()}`,
      role: "user",
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      // Fire HTTP POST — WebSocket delivers tokens/activities live
      const res = await authFetch(`/api/missions/${missionId}/explore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();

      // Snapshot feed before clearing — preserves interleaved text+tool order
      const feed = useMissionStore.getState().explorationFeed.map(e => ({...e}));

      // HTTP response is authoritative — finalize with clean text
      const now = Date.now();
      const assistantMsg: ExplorationMessage = {
        id: `msg-aria-${now}`,
        role: "assistant",
        content: data.text,
        timestamp: now,
        feed: feed.length > 0 ? feed : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setReadiness(data.readiness ?? 0);
      clearExplorationStream();
    } catch (error) {
      console.error("Failed to send exploration message:", error);
      clearExplorationStream();
    } finally {
      setSending(false);
    }
  }

  async function handleBeginPlanning() {
    if (!missionId) return;
    setPhase("planning");

    try {
      const res = await authFetch(`/api/missions/${missionId}/begin-planning`, {
        method: "POST",
      });
      const data = await res.json();

      if (data.mission) {
        enterMission(missionId);
      } else {
        setPhase("exploring");
      }
    } catch (error) {
      console.error("Failed to begin planning:", error);
      setPhase("exploring");
    }
  }

  if (resuming) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <p className="text-text-muted text-sm">Loading...</p>
      </div>
    );
  }

  // Dashboard view — sidebar + dashboard
  if (phase === "entering" && missionId) {
    return (
      <div className="flex h-screen bg-bg">
        <Sidebar
          missions={visibleMissions}
          activeMissionId={missionId}
          collapsed={!sidebarOpen}
          user={user}
          onToggle={toggleSidebar}
          onNewMission={handleNewMission}
          onSelectMission={handleSelectMission}
        />
        <div className="flex-1 min-w-0">
          <Dashboard missionId={missionId} />
        </div>
      </div>
    );
  }

  // Exploration chat view — sidebar + chat
  if (phase === "exploring" || phase === "planning") {
    const isPlanning = phase === "planning";

    return (
      <div className="flex h-screen bg-bg">
        <Sidebar
          missions={visibleMissions}
          activeMissionId={missionId}
          collapsed={!sidebarOpen}
          user={user}
          onToggle={toggleSidebar}
          onNewMission={handleNewMission}
          onSelectMission={handleSelectMission}
        />
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Header */}
          <header className="border-b border-border px-6 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
              <span className="text-xs text-text-muted">Exploring your idea</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-48">
                <ReadinessIndicator score={readiness} />
              </div>
              <button
                onClick={handleBeginPlanning}
                disabled={isPlanning || messages.length < 2}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                  isPlanning
                    ? "bg-bg-elevated text-text-muted cursor-wait"
                    : readiness >= 7
                      ? "bg-success text-white hover:bg-success/90 shadow-[0_0_12px_rgba(34,197,94,0.3)]"
                      : readiness >= 4
                        ? "bg-accent text-white hover:bg-accent-hover"
                        : "bg-bg-elevated text-text-muted hover:bg-bg-hover opacity-70"
                )}
              >
                {isPlanning ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 border-2 border-text-muted border-t-transparent rounded-full animate-spin" />
                    Creating plan...
                  </span>
                ) : (
                  "Plan Mission"
                )}
              </button>
            </div>
          </header>

          {/* Chat area */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
              {messages.map((msg) =>
                msg.role === "activity" ? (
                  <div key={msg.id} className="flex items-center gap-2 px-2 py-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent/50 shrink-0" />
                    <span className="text-xs italic text-text-muted">{msg.content}</span>
                  </div>
                ) : (
                  <div
                    key={msg.id}
                    className={cn(
                      "max-w-[85%] rounded-xl px-4 py-3",
                      msg.role === "user"
                        ? "ml-auto bg-accent text-white"
                        : "bg-bg-surface border border-border text-text-primary"
                    )}
                  >
                    {msg.role === "assistant" && (
                      <span className="text-xs text-accent font-medium block mb-1">Aria</span>
                    )}
                    {msg.role === "assistant" && msg.feed ? (
                      /* Chronological feed — interleaved text + tool chips */
                      <div className="space-y-1">
                        {msg.feed.map((entry) =>
                          entry.type === "text" ? (
                            <Markdown key={entry.id} content={entry.content} className="text-sm" />
                          ) : (
                            <div key={entry.id} className="flex items-center gap-2 py-0.5 pl-2">
                              <span className="text-accent text-[10px]">●</span>
                              <span className="text-xs text-text-muted italic">{entry.content}</span>
                            </div>
                          )
                        )}
                      </div>
                    ) : msg.role === "assistant" ? (
                      <Markdown content={msg.content} className="text-sm" />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    )}
                    <span className="text-[10px] text-text-muted mt-1 block opacity-60">
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                )
              )}

              {/* Live streaming bubble — shown while sending */}
              {sending && (
                <div className="max-w-[85%] rounded-xl px-4 py-3 bg-bg-surface border border-border text-text-primary">
                  <span className="text-xs text-accent font-medium block mb-1">Aria</span>

                  {/* Chronological feed — interleaved text + tool chips */}
                  {explorationFeed.length > 0 ? (
                    <div className="space-y-1">
                      {explorationFeed.map((entry) =>
                        entry.type === "text" ? (
                          <Markdown key={entry.id} content={entry.content} className="text-sm" />
                        ) : (
                          <div key={entry.id} className="flex items-center gap-2 py-0.5 pl-2">
                            <span className="text-accent text-[10px]">●</span>
                            <span className="text-xs text-text-muted italic">{entry.content}</span>
                          </div>
                        )
                      )}
                      {/* Show dots when last entry is a tool (waiting for next text) */}
                      {explorationFeed[explorationFeed.length - 1]?.type === "tool" && (
                        <div className="flex items-center gap-1.5 pl-2 pt-1">
                          <span className="h-1.5 w-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="h-1.5 w-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="h-1.5 w-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-1.5 w-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-1.5 w-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  )}
                </div>
              )}

              {/* Planning indicator (not streaming) */}
              {isPlanning && !sending && (
                <div className="max-w-[85%] rounded-xl px-4 py-3 bg-bg-surface border border-border">
                  <span className="text-xs text-accent font-medium block mb-1">Aria</span>
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.5 w-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input */}
          <div className="border-t border-border p-4 shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendExplorationMessage();
              }}
              className="max-w-3xl mx-auto flex gap-3"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={isPlanning}
                placeholder={isPlanning ? "Planning in progress..." : "Tell me more about what you're building..."}
                className="flex-1 rounded-xl bg-bg-surface border border-border px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || sending || isPlanning}
                className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Idle landing page — sidebar + centered content
  return (
    <div className="flex h-screen bg-bg">
      <Sidebar
        missions={visibleMissions}
        activeMissionId={null}
        collapsed={!sidebarOpen}
        user={user}
        onToggle={toggleSidebar}
        onNewMission={handleNewMission}
        onSelectMission={handleSelectMission}
      />
      <div className="relative flex-1 min-w-0 flex flex-col items-center overflow-hidden">
        {/* Background glow */}
        <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-accent/[0.04] rounded-full blur-[120px]" />



        {/* Hero area — centered */}
        <div className="flex-1 flex flex-col items-center justify-center w-full max-w-3xl px-4 -mt-8">
          <div className="w-full space-y-10">
            {/* Headline */}
            <div className="text-center space-y-3 animate-fade-in-up">
              <h1 className={cn(headingFont.className, "text-4xl sm:text-5xl text-text-primary tracking-tight")}>
                What should we build?
              </h1>
              <p className="text-base text-text-muted">
                Describe your idea and a team of AI agents will bring it to life.
              </p>
            </div>

            {/* Input area */}
            <div className="animate-fade-in-up-delay-1">
              <div className={cn(
                "relative rounded-2xl border bg-bg-surface transition-all duration-200",
                taskInput.trim()
                  ? "border-accent/40 shadow-[0_0_24px_rgba(99,102,241,0.08)]"
                  : "border-border hover:border-border-focus/50"
              )}>
                <textarea
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      startExploration();
                    }
                  }}
                  placeholder="Build a SaaS dashboard, analyze market trends, design an API..."
                  rows={4}
                  className="w-full rounded-2xl bg-transparent px-5 pt-4 pb-14 text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none resize-none"
                />
                <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
                  <span className="text-[11px] text-text-muted/50">
                    {taskInput.trim() ? "Enter to start" : ""}
                  </span>
                  <button
                    onClick={startExploration}
                    disabled={loading || !taskInput.trim()}
                    className={cn(
                      "rounded-xl px-5 py-2 text-sm font-medium transition-all duration-200",
                      taskInput.trim()
                        ? "bg-accent text-white hover:bg-accent-hover shadow-[0_2px_12px_rgba(99,102,241,0.3)]"
                        : "bg-bg-elevated text-text-muted cursor-default"
                    )}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Starting...
                      </span>
                    ) : (
                      "Start"
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Example cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-in-up-delay-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.title}
                  onClick={() => setTaskInput(ex.prompt)}
                  className="group rounded-xl border border-border bg-bg-surface/50 px-4 py-3.5 text-left hover:bg-bg-hover hover:border-border-focus/30 transition-all duration-200"
                >
                  <div className="text-text-muted group-hover:text-accent transition-colors mb-2">
                    {ex.icon}
                  </div>
                  <p className="text-[13px] font-medium text-text-secondary group-hover:text-text-primary transition-colors leading-snug">
                    {ex.title}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="py-6 text-center animate-fade-in-up-delay-3">
          <p className="text-[11px] text-text-muted/40">
            Explore &rarr; Plan &rarr; Execute &rarr; Deliver
          </p>
        </footer>
      </div>
    </div>
  );
}
