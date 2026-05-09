// ─── Session Timers ───────────────────────────────────────────────────────────
// Maintains separate idle and wall-clock timers. resetActivity() only resets
// the idle timer. clearAll() stops both.

export interface TimerHandle {
  resetActivity(): void;
  clearAll(): void;
}

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_WALL_CLOCK_MS = 60 * 60 * 1000; // 60 minutes

export function startSessionTimers(
  sessionId: string,
  onTimeout: (sessionId: string, reason: "idle" | "wall_clock") => void,
  idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS,
  wallClockMs: number = DEFAULT_WALL_CLOCK_MS,
): TimerHandle {
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let wallClockTimer: ReturnType<typeof setTimeout> | null = null;

  const startIdleTimer = () => {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimer = null;
      onTimeout(sessionId, "idle");
    }, idleTimeoutMs);
  };

  const startWallClockTimer = () => {
    wallClockTimer = setTimeout(() => {
      wallClockTimer = null;
      onTimeout(sessionId, "wall_clock");
    }, wallClockMs);
  };

  // Start both timers immediately
  startIdleTimer();
  startWallClockTimer();

  return {
    resetActivity(): void {
      // Only resets the idle timer, not the wall-clock
      startIdleTimer();
    },

    clearAll(): void {
      if (idleTimer !== null) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (wallClockTimer !== null) {
        clearTimeout(wallClockTimer);
        wallClockTimer = null;
      }
    },
  };
}
