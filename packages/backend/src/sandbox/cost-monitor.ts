// ─── CostMonitor ──────────────────────────────────────────────────────────────
// Per-session cost tracking and budget enforcement.
//
// Important limitation:
//   The SDK only emits `total_cost_usd` in "result" messages at query() completion.
//   This means cost enforcement is POST-HOC — we cannot abort a session mid-turn
//   based on cost. Real-time enforcement needs a provider-side budget API,
//   proxy-level metering, or turn limits as a rough guardrail.
//
//   processSDKMessage() uses SET semantics (not additive) for result messages
//   because `total_cost_usd` in the result is already cumulative — adding it
//   would double-count across multiple query() calls for the same session.

export interface BudgetResult {
  exceeded: boolean;
  total: number;
  budget: number;
}

export class CostMonitor {
  private sessionCosts = new Map<string, number>();

  /**
   * Manually accumulate cost for a session (additive).
   * Use this for incremental cost additions if known; NOT for processing SDK result messages.
   */
  recordCost(sessionId: string, costUsd: number): void {
    const current = this.sessionCosts.get(sessionId) ?? 0;
    this.sessionCosts.set(sessionId, current + costUsd);
  }

  /** Return total accumulated cost for a session. Returns 0 for unknown sessions. */
  getCost(sessionId: string): number {
    return this.sessionCosts.get(sessionId) ?? 0;
  }

  /** Check whether a session has exceeded its budget. */
  checkBudget(sessionId: string, budgetUsd: number): BudgetResult {
    const total = this.getCost(sessionId);
    return { exceeded: total >= budgetUsd, total, budget: budgetUsd };
  }

  /**
   * Process an SDK message and extract cost from result messages.
   *
   * If msg.type === "result" and msg.total_cost_usd is present, SETS the session cost
   * to that value (not additive). The SDK's total_cost_usd is already cumulative, so
   * SET semantics prevent double-counting if this method is called multiple times with
   * the same result message.
   *
   * Called by MissionManager when relaying SDK events.
   */
  processSDKMessage(sessionId: string, msg: unknown): void {
    if (typeof msg !== "object" || msg === null) {
      return;
    }
    const m = msg as Record<string, unknown>;
    if (m["type"] !== "result") {
      return;
    }
    const costValue = m["total_cost_usd"];
    if (typeof costValue === "number") {
      // Use SET semantics: total_cost_usd is already cumulative in the SDK
      this.sessionCosts.set(sessionId, costValue);
    }
  }

  /** Clear accumulated cost for a session (e.g. on session cleanup). */
  reset(sessionId: string): void {
    this.sessionCosts.delete(sessionId);
  }
}
