// ─── CostMonitor Tests ────────────────────────────────────────────────────────
// Tests for per-session cost tracking and budget enforcement.
// NOTE: Budget enforcement is post-hoc (SDK only reports total_cost_usd at query()
// completion in "result" messages). This is documented in cost-monitor.ts.

import { describe, it, expect, beforeEach } from "vitest";
import { CostMonitor } from "../cost-monitor.js";

describe("cost monitor", () => {
  let monitor: CostMonitor;

  beforeEach(() => {
    monitor = new CostMonitor();
  });

  it("recordCost accumulates over multiple calls", () => {
    monitor.recordCost("session-1", 0.10);
    monitor.recordCost("session-1", 0.05);
    monitor.recordCost("session-1", 0.03);

    expect(monitor.getCost("session-1")).toBeCloseTo(0.18);
  });

  it("getCost returns 0 for unknown session", () => {
    expect(monitor.getCost("nonexistent-session")).toBe(0);
  });

  it("checkBudget returns exceeded=true when cost >= budget", () => {
    monitor.recordCost("session-1", 5.00);

    const result = monitor.checkBudget("session-1", 5.00);
    expect(result.exceeded).toBe(true);
    expect(result.total).toBeCloseTo(5.00);
    expect(result.budget).toBe(5.00);
  });

  it("checkBudget returns exceeded=true when cost > budget", () => {
    monitor.recordCost("session-1", 6.00);

    const result = monitor.checkBudget("session-1", 5.00);
    expect(result.exceeded).toBe(true);
  });

  it("checkBudget returns exceeded=false when cost < budget", () => {
    monitor.recordCost("session-1", 2.50);

    const result = monitor.checkBudget("session-1", 5.00);
    expect(result.exceeded).toBe(false);
    expect(result.total).toBeCloseTo(2.50);
    expect(result.budget).toBe(5.00);
  });

  it("processSDKMessage extracts total_cost_usd from result message and SETS it (not adds)", () => {
    // Set up some existing cost first
    monitor.recordCost("session-1", 0.50);

    // processSDKMessage with a result message should SET (override), not add
    monitor.processSDKMessage("session-1", { type: "result", total_cost_usd: 1.23 });

    // Should be 1.23, not 1.73 (0.50 + 1.23)
    expect(monitor.getCost("session-1")).toBeCloseTo(1.23);
  });

  it("processSDKMessage called twice with same result value does NOT double the cost", () => {
    monitor.processSDKMessage("session-1", { type: "result", total_cost_usd: 2.00 });
    monitor.processSDKMessage("session-1", { type: "result", total_cost_usd: 2.00 });

    // SET semantics: should be 2.00, not 4.00
    expect(monitor.getCost("session-1")).toBeCloseTo(2.00);
  });

  it("processSDKMessage ignores non-result messages", () => {
    monitor.recordCost("session-1", 1.00);

    // These message types should be ignored
    monitor.processSDKMessage("session-1", { type: "assistant", content: "hello" });
    monitor.processSDKMessage("session-1", { type: "tool_use", id: "x" });
    monitor.processSDKMessage("session-1", { type: "text", text: "response" });
    monitor.processSDKMessage("session-1", null);
    monitor.processSDKMessage("session-1", "not an object");
    monitor.processSDKMessage("session-1", 42);

    // Cost should be unchanged
    expect(monitor.getCost("session-1")).toBeCloseTo(1.00);
  });

  it("reset clears accumulated cost", () => {
    monitor.recordCost("session-1", 3.00);
    monitor.reset("session-1");

    expect(monitor.getCost("session-1")).toBe(0);
    expect(monitor.checkBudget("session-1", 5.00).exceeded).toBe(false);
  });

  it("multiple sessions tracked independently", () => {
    monitor.recordCost("session-1", 2.00);
    monitor.recordCost("session-2", 0.50);

    expect(monitor.getCost("session-1")).toBeCloseTo(2.00);
    expect(monitor.getCost("session-2")).toBeCloseTo(0.50);

    monitor.reset("session-1");

    expect(monitor.getCost("session-1")).toBe(0);
    expect(monitor.getCost("session-2")).toBeCloseTo(0.50);
  });
});
