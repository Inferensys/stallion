import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startSessionTimers } from "../session-timers.js";

describe("SessionTimers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("idle timer", () => {
    it("fires callback after idleTimeoutMs with reason=idle", () => {
      const onTimeout = vi.fn();
      startSessionTimers("session-1", onTimeout, 5000, 60000);

      vi.advanceTimersByTime(5000);

      expect(onTimeout).toHaveBeenCalledOnce();
      expect(onTimeout).toHaveBeenCalledWith("session-1", "idle");
    });

    it("does not fire before idleTimeoutMs elapses", () => {
      const onTimeout = vi.fn();
      startSessionTimers("session-2", onTimeout, 5000, 60000);

      vi.advanceTimersByTime(4999);

      expect(onTimeout).not.toHaveBeenCalled();
    });

    it("resets when resetActivity() is called", () => {
      const onTimeout = vi.fn();
      const handle = startSessionTimers("session-3", onTimeout, 5000, 60000);

      vi.advanceTimersByTime(4000);
      handle.resetActivity();
      vi.advanceTimersByTime(4000); // total 8s but only 4s since last reset

      expect(onTimeout).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1001); // now 5001ms since last reset
      expect(onTimeout).toHaveBeenCalledWith("session-3", "idle");
    });

    it("fires with idle reason when idle timeout expires after reset", () => {
      const onTimeout = vi.fn();
      const handle = startSessionTimers("session-4", onTimeout, 5000, 60000);

      handle.resetActivity();
      vi.advanceTimersByTime(5000);

      expect(onTimeout).toHaveBeenCalledWith("session-4", "idle");
    });
  });

  describe("wall-clock timer", () => {
    it("fires callback after wallClockMs regardless of activity", () => {
      const onTimeout = vi.fn();
      const handle = startSessionTimers("session-5", onTimeout, 30000, 10000);

      // Reset activity repeatedly to keep idle timer from firing
      vi.advanceTimersByTime(2000);
      handle.resetActivity();
      vi.advanceTimersByTime(2000);
      handle.resetActivity();
      vi.advanceTimersByTime(2000);
      handle.resetActivity();
      vi.advanceTimersByTime(2000);
      handle.resetActivity();
      vi.advanceTimersByTime(2001); // total 10001ms

      expect(onTimeout).toHaveBeenCalledOnce();
      expect(onTimeout).toHaveBeenCalledWith("session-5", "wall_clock");
    });

    it("fires with wall_clock reason", () => {
      const onTimeout = vi.fn();
      startSessionTimers("session-6", onTimeout, 60000, 5000);

      vi.advanceTimersByTime(5000);

      expect(onTimeout).toHaveBeenCalledWith("session-6", "wall_clock");
    });

    it("does not reset when resetActivity() is called", () => {
      const onTimeout = vi.fn();
      const handle = startSessionTimers("session-7", onTimeout, 60000, 5000);

      vi.advanceTimersByTime(4000);
      handle.resetActivity(); // reset idle but not wall-clock
      vi.advanceTimersByTime(1001); // 5001ms total, wall-clock should fire

      expect(onTimeout).toHaveBeenCalledWith("session-7", "wall_clock");
    });
  });

  describe("clearAll", () => {
    it("prevents idle timer from firing", () => {
      const onTimeout = vi.fn();
      const handle = startSessionTimers("session-8", onTimeout, 5000, 60000);

      vi.advanceTimersByTime(2000);
      handle.clearAll();
      vi.advanceTimersByTime(10000); // well past idle timeout

      expect(onTimeout).not.toHaveBeenCalled();
    });

    it("prevents wall-clock timer from firing", () => {
      const onTimeout = vi.fn();
      const handle = startSessionTimers("session-9", onTimeout, 60000, 5000);

      vi.advanceTimersByTime(2000);
      handle.clearAll();
      vi.advanceTimersByTime(10000); // well past wall-clock timeout

      expect(onTimeout).not.toHaveBeenCalled();
    });

    it("can be called multiple times without error", () => {
      const onTimeout = vi.fn();
      const handle = startSessionTimers("session-10", onTimeout, 5000, 10000);

      expect(() => {
        handle.clearAll();
        handle.clearAll();
      }).not.toThrow();
    });
  });

  describe("default timeouts", () => {
    it("uses 30 min idle timeout by default", () => {
      const onTimeout = vi.fn();
      startSessionTimers("session-defaults", onTimeout);

      vi.advanceTimersByTime(30 * 60 * 1000 - 1);
      expect(onTimeout).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onTimeout).toHaveBeenCalledWith("session-defaults", "idle");
    });

    it("uses 60 min wall-clock timeout by default", () => {
      const onTimeout = vi.fn();
      const handle = startSessionTimers("session-defaults-wc", onTimeout);

      // Keep resetting idle timer so only wall-clock fires
      for (let i = 0; i < 60; i++) {
        vi.advanceTimersByTime(59 * 1000); // 59 seconds at a time
        handle.resetActivity();
      }
      vi.advanceTimersByTime(60 * 1000);

      expect(onTimeout).toHaveBeenCalledWith("session-defaults-wc", "wall_clock");
    });
  });
});
