"use client";

import { useMissionStore } from "@/store/mission-store";
import { cn } from "@/lib/utils";
import { Monitor, Loader2, WifiOff, ExternalLink } from "lucide-react";

interface DesktopViewerProps {
  className?: string;
}

export function DesktopViewer({ className }: DesktopViewerProps) {
  const mission = useMissionStore((s) => s.mission);

  const vncUrl = mission?.vncUrl;
  const containerStatus = mission?.containerStatus;
  const isRunning = containerStatus === "running" && !!vncUrl;
  const isCreating = containerStatus === "creating";

  if (isCreating) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full bg-bg text-text-muted", className)}>
        <Loader2 className="h-8 w-8 animate-spin mb-3 text-accent" />
        <p className="text-sm font-medium">Starting container...</p>
        <p className="text-xs mt-1">Setting up desktop environment</p>
      </div>
    );
  }

  if (!isRunning) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full bg-bg text-text-muted", className)}>
        <Monitor className="h-8 w-8 mb-3 opacity-40" />
        <p className="text-sm font-medium">No active container</p>
        <p className="text-xs mt-1">
          {containerStatus === "error"
            ? "Container encountered an error"
            : containerStatus === "stopped"
            ? "Container has stopped"
            : "Desktop view will appear when mission runs in a container"}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("relative h-full w-full bg-black", className)}>
      {/* Connection status overlay */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-black/60 text-white text-[10px] px-2 py-1 rounded">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          Live
        </div>
        <button
          onClick={() => window.open(vncUrl, "_blank")}
          className="bg-black/60 text-white text-[10px] px-2 py-1 rounded hover:bg-black/80 transition-colors"
          title="Open desktop in new tab"
        >
          <ExternalLink className="h-3 w-3" />
        </button>
      </div>

      {/* noVNC iframe */}
      <iframe
        src={vncUrl}
        className="w-full h-full border-0"
        title="Agent Desktop"
        allow="clipboard-read; clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </div>
  );
}
