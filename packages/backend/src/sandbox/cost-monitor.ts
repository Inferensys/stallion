// ─── CostMonitor (stub) ───────────────────────────────────────────────────────
// Minimal stub for Plan 02. Plan 03 will replace this with the full
// implementation that parses SDK message cost fields.
//
// Interface:
//   processSDKMessage(sessionId, msg) — accumulate cost from SDK result messages
//   checkBudget(sessionId, budgetUsd) — return { exceeded, total, budget }
//   reset(sessionId) — clear accumulated cost for session

export interface BudgetResult {
  exceeded: boolean;
  total: number;
  budget: number;
}

export class CostMonitor {
  private costs = new Map<string, number>();
  // Track which sessions have already emitted a budget warning so we don't spam
  private warned = new Set<string>();

  processSDKMessage(sessionId: string, msg: unknown): void {
    // Look for cost fields in SDK result messages
    // SDK emits: { type: "result", total_cost_usd: number, ... }
    if (
      msg !== null &&
      typeof msg === "object" &&
      "type" in msg &&
      (msg as Record<string, unknown>)["type"] === "result"
    ) {
      const costValue = (msg as Record<string, unknown>)["total_cost_usd"];
      if (typeof costValue === "number") {
        this.costs.set(sessionId, costValue);
      }
    }
  }

  checkBudget(sessionId: string, budgetUsd: number): BudgetResult {
    const total = this.costs.get(sessionId) ?? 0;
    const exceeded = total > budgetUsd && !this.warned.has(sessionId);

    if (exceeded) {
      this.warned.add(sessionId);
    }

    return { exceeded, total, budget: budgetUsd };
  }

  reset(sessionId: string): void {
    this.costs.delete(sessionId);
    this.warned.delete(sessionId);
  }
}
