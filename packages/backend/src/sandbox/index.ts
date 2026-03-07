// ─── Sandbox Module ───────────────────────────────────────────────────────────
// Barrel export for backend sandbox module.
//
// Plan 01 + 02: Container lifecycle, session management, cost stub
// Plan 03: Credential proxy, full CostMonitor, network isolation

// ── Plan 02 modules ──────────────────────────────────────────────────────────
export { ContainerManager } from "./container-manager.js";
export { ContainerClient } from "./container-client.js";
export { SessionStore } from "./session-store.js";
export { startSessionTimers } from "./session-timers.js";
export type { TimerHandle } from "./session-timers.js";

// ── Plan 03 modules ──────────────────────────────────────────────────────────
export { CredentialProxy } from "./credential-proxy.js";
export type { CredentialProxyOptions } from "./credential-proxy.js";
export { CostMonitor } from "./cost-monitor.js";
export type { BudgetResult } from "./cost-monitor.js";
export { applyNetworkIsolation } from "./network-isolation.js";
