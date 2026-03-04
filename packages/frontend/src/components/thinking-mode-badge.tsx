"use client";

import type { ThinkingMode } from "@stallion/shared";
import { ThinkingModeConfig } from "@stallion/shared";
import { cn } from "@/lib/utils";

const MODE_ICONS: Record<ThinkingMode, string> = {
  structured: "🏗️",
  iterative: "🔄",
  exploratory: "🔍",
  creative: "✨",
  reflective: "🪞",
};

export function ThinkingModeBadge({
  mode,
  size = "md",
}: {
  mode: ThinkingMode | null;
  size?: "sm" | "md" | "lg";
}) {
  if (!mode) {
    return (
      <span className="text-text-muted text-xs italic">No active mode</span>
    );
  }

  const config = ThinkingModeConfig[mode];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "sm" && "px-2 py-0.5 text-xs",
        size === "md" && "px-3 py-1 text-sm",
        size === "lg" && "px-4 py-1.5 text-base"
      )}
      style={{
        backgroundColor: `${config.color}20`,
        color: config.color,
        borderWidth: 1,
        borderColor: `${config.color}40`,
      }}
    >
      <span>{MODE_ICONS[mode]}</span>
      <span>{config.label}</span>
    </span>
  );
}
