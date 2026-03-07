---
phase: 1
slug: sandbox-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18 (already in agent-runtime devDeps) |
| **Config file** | packages/agent-runtime/vitest.config.ts (create in Wave 0 if needed) |
| **Quick run command** | `npm run test -w @stallion/agent-runtime` |
| **Full suite command** | `npm run test -w @stallion/agent-runtime && npm run test -w @stallion/backend` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -w @stallion/agent-runtime`
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | SAND-01 | integration | `vitest run sandbox-provider` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | SAND-03 | unit | `vitest run resource-limits` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | SAND-07 | integration | `vitest run container-cleanup` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | SAND-06 | integration | `vitest run credential-proxy` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | SAND-02 | integration | `vitest run container-tools` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | SAND-04 | unit | `vitest run timeout-monitor` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 2 | SAND-05 | unit | `vitest run budget-cap` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/agent-runtime/src/__tests__/sandbox-provider.test.ts` — stubs for SAND-01, SAND-03, SAND-07
- [ ] `packages/agent-runtime/src/__tests__/credential-proxy.test.ts` — stubs for SAND-06
- [ ] `packages/backend/src/__tests__/container-session.test.ts` — stubs for SAND-02, SAND-04, SAND-05

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Container network isolation (iptables) | SAND-06 | Requires Docker runtime + network probing | Start container, attempt curl to api.anthropic.com, verify blocked |
| VNC/desktop absence | N/A | Visual confirmation | Inspect container image, confirm no Xvfb/VNC packages |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
