"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSocket } from "@/hooks/use-socket";
import { useMissionStore } from "@/store/mission-store";
import { ChatPanel } from "./chat-panel";
import { ProgressPanel } from "./progress-panel";
import { WorkspaceInspector } from "./workspace-inspector";
import { ActivityLog } from "./activity-log";
import { DesktopViewer } from "./desktop-viewer";
import { CredentialModal } from "./credential-modal";
import { cn, formatDuration } from "@/lib/utils";
import { Terminal, Monitor } from "lucide-react";

const STATUS_BADGE_STYLES: Record<string, string> = {
  exploring: "bg-accent/10 text-accent",
  planning: "bg-warning/10 text-warning",
  review: "bg-accent/10 text-accent",
  launching: "bg-info/10 text-info",
  running: "bg-success/10 text-success",
  paused: "bg-text-muted/10 text-text-muted",
  completed: "bg-info/10 text-info",
  failed: "bg-error/10 text-error",
};

type ActivityTab = "terminal" | "browser";

export function Dashboard({ missionId }: { missionId: string }) {
  const { sendMessage, sendCredential } = useSocket(missionId);
  const mission = useMissionStore((s) => s.mission);
  const connected = useMissionStore((s) => s.connected);
  const events = useMissionStore((s) => s.events);
  const credentialRequests = useMissionStore((s) => s.credentialRequests);
  const removeCredentialRequest = useMissionStore((s) => s.removeCredentialRequest);
  const elapsedMs = useMissionStore((s) => s.elapsedMs);

  const [activeTab, setActiveTab] = useState<ActivityTab>("terminal");
  const autoSwitchedRef = useRef(false);
  const revertedRef = useRef(false);

  const containerStatus = mission?.containerStatus;
  const hasContainer = containerStatus === "running" || containerStatus === "creating";
  const missionStatus = mission?.status;

  // Reset tab state when switching missions
  useEffect(() => {
    setActiveTab("terminal");
    autoSwitchedRef.current = false;
    revertedRef.current = false;
  }, [missionId]);

  // Auto-switch to Browser tab ONCE when container first becomes running
  useEffect(() => {
    if (containerStatus === "running" && !autoSwitchedRef.current) {
      autoSwitchedRef.current = true;
      setActiveTab("browser");
    }
  }, [containerStatus]);

  // Auto-revert to Terminal ONCE when mission ends
  useEffect(() => {
    if (autoSwitchedRef.current && !revertedRef.current && (
      missionStatus === "completed" || missionStatus === "failed"
    )) {
      revertedRef.current = true;
      setActiveTab("terminal");
    }
  }, [missionStatus]);

  // Handle credential submission
  const handleCredentialSubmit = useCallback(
    (requestId: string, credentials: Record<string, string>) => {
      sendCredential(requestId, credentials);
      removeCredentialRequest(requestId);
    },
    [sendCredential, removeCredentialRequest]
  );

  const handleCredentialDismiss = useCallback(() => {
    if (credentialRequests.length > 0) {
      removeCredentialRequest(credentialRequests[0]!.id);
    }
  }, [credentialRequests, removeCredentialRequest]);

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* Header */}
      <header className="border-b border-border px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          {mission?.plan?.title && (
            <h1 className="text-sm font-medium text-text-primary truncate max-w-[300px]">
              {mission.plan.title}
            </h1>
          )}
        </div>

        <div className="flex items-center gap-4">
          {mission?.status && (
            <span
              className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                STATUS_BADGE_STYLES[mission.status] ?? "bg-bg-elevated text-text-muted"
              )}
            >
              {mission.status}
            </span>
          )}

          {containerStatus && (
            <span
              className={cn(
                "text-[10px] font-medium px-1.5 py-0.5 rounded",
                containerStatus === "running"
                  ? "bg-success/10 text-success"
                  : containerStatus === "creating"
                  ? "bg-info/10 text-info"
                  : containerStatus === "error"
                  ? "bg-error/10 text-error"
                  : "bg-text-muted/10 text-text-muted"
              )}
            >
              VM: {containerStatus}
            </span>
          )}

          {mission?.plan && (
            <span className="text-xs text-text-muted">
              {mission.plan.agents.length} agents
            </span>
          )}

          {elapsedMs > 0 && (
            <span className="text-xs text-text-muted font-mono">
              {formatDuration(elapsedMs)}
            </span>
          )}

          <span
            className={cn(
              "h-2 w-2 rounded-full",
              connected ? "bg-success" : "bg-error"
            )}
            title={connected ? "Connected" : "Disconnected"}
          />
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 grid grid-cols-12 gap-0 overflow-hidden">
        {/* Left: Chat */}
        <div className="col-span-3 border-r border-border overflow-hidden">
          <ChatPanel missionId={missionId} onSend={sendMessage} />
        </div>

        {/* Center: Progress + Activity/Browser */}
        <div className="col-span-6 flex flex-col overflow-hidden">
          <div className="h-1/2 border-b border-border overflow-hidden">
            <ProgressPanel />
          </div>
          <div className="h-1/2 flex flex-col overflow-hidden">
            {/* Tab bar */}
            <div className="flex items-center border-b border-border shrink-0 bg-bg">
              <button
                onClick={() => setActiveTab("terminal")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px",
                  activeTab === "terminal"
                    ? "border-accent text-text-primary"
                    : "border-transparent text-text-muted hover:text-text-secondary"
                )}
              >
                <Terminal className="h-3 w-3" />
                Terminal
              </button>
              <button
                onClick={() => setActiveTab("browser")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px",
                  activeTab === "browser"
                    ? "border-accent text-text-primary"
                    : "border-transparent text-text-muted hover:text-text-secondary"
                )}
              >
                <Monitor className="h-3 w-3" />
                Browser
                {hasContainer && (
                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                )}
              </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === "terminal" ? (
                <ActivityLog />
              ) : (
                <DesktopViewer />
              )}
            </div>
          </div>
        </div>

        {/* Right: Workspace Inspector */}
        <div className="col-span-3 border-l border-border overflow-hidden">
          <WorkspaceInspector missionId={missionId} />
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-2 flex items-center justify-between shrink-0">
        <span className="text-[10px] text-text-muted">
          Mission: {missionId}
        </span>
        <span className="text-[10px] text-text-muted">
          {events.length} events
        </span>
      </footer>

      {/* Credential Modal */}
      {credentialRequests.length > 0 && (
        <CredentialModal
          request={credentialRequests[0]!}
          onSubmit={handleCredentialSubmit}
          onDismiss={handleCredentialDismiss}
        />
      )}
    </div>
  );
}
