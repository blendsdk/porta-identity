# Roadmap: Porta Maintenance

> **Feature-Set**: Porta Maintenance
> **Status**: In Progress
> **Created**: 2026-09-27
> **Last Updated**: 2026-11-01 16:44
> **Progress**: n/a (task-only feature)
> **CodeOps Artifact Schema**: 1

## Legend

⬜ Backlog · ✏️ RD Drafted · 🔎 RD Preflighted · 📋 Plan Created · 🔬 Plan Preflighted · 🔄 Executing · ✅ Done · ⛔ Blocked · ⏸️ Deferred

## Tracker

| ID   | Title                                                                  | RD  | Plan                                                                | Stage | Status | Last Updated     | Depends-on / Blocker |
| ---- | ---------------------------------------------------------------------- | --- | ------------------------------------------------------------------- | ----- | ------ | ---------------- | -------------------- |
| T-01 | Porta Console callback URI, startup version log, and cleanup directive | —   | [plan](plans/console-callback-version-cleanup/99-execution-plan.md) | Done  | ✅     | 2026-09-27 22:35 | —                    |
| T-02 | Make the tampered-tag signing-key crypto test deterministic            | —   | [plan](plans/signing-key-crypto-flake/99-execution-plan.md)         | Done  | ✅     | 2026-09-27 23:35 | —                    |
| T-03 | Make release verification resilient to registry lag and re-runs        | —   | [plan](plans/release-verify-resilience/99-execution-plan.md)        | Done  | ✅     | 2026-09-28 01:05 | —                    |
| T-04 | Migrate the monorepo from Yarn Classic to pnpm                          | —   | [plan](plans/pnpm-migration/99-execution-plan.md)                   | Complete  | ✅ | 2026-11-01 16:40 | 44/44; PR #213 single-document graph fix; cache scopes green; main updates on next release |
| T-05 | Guard audit schema and diagnose admin mutation failures                 | —   | [plan](plans/admin-mutation-schema-guard/99-execution-plan.md)      | Done  | ✅     | 2026-10-26 15:10 | Released in v1.14.1; live migration/instance alignment remains with the operator |
| T-06 | Narrow local tests and resolve five open bugs                           | —   | [delivery record](plans/local-tests-and-open-bugfixes/99-execution-plan.md) | Done | ✅ | 2026-11-01 09:27 | Merged to `develop`; PRs #202–#206; issues closed; released in v1.15.0 |
| T-07 | Reconcile roadmap closeout and complete active verification | — | [plan](plans/porta-roadmap-closeout/99-execution-plan.md) | Executing | 🔄 | 2026-11-01 16:44 | Phase 5.1 complete; portfolio 5/8; Vitest advisory patched; DEF-23/M2 remain |
