# Roadmap: Porta Production Readiness

> **Feature-Set**: Porta Production Readiness
> **Status**: In Progress
> **Created**: 2026-09-12
> **Last Updated**: 2026-09-16
> **Progress**: 2 / 3 (67%)
> **CodeOps Artifact Schema**: 1

## Legend

⬜ Backlog · ✏️ RD Drafted · 🔎 RD Preflighted · 📋 Plan Created · 🔬 Plan Preflighted · 🔄 Executing · ✅ Done · ⛔ Blocked · ⏸️ Deferred

## Tracker

| ID    | Title                                  | RD                                                                    | Plan                                                        | Stage            | Status | Last Updated | Depends-on / Blocker    |
| ----- | -------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------- | ------ | ------------ | ----------------------- |
| RD-01 | Production security corrections        | [RD-01](requirements/RD-01-production-security-corrections.md)        | [Plan](plans/production-security-corrections/00-index.md)   | Done             | ✅     | 2026-09-13   | —                       |
| RD-02 | Selective environment portability      | [RD-02](requirements/RD-02-selective-environment-portability.md)      | [Plan](plans/selective-environment-portability/00-index.md) | Done             | ✅     | 2026-09-15   | depends on RD-01        |
| RD-03 | PostgreSQL-backed global configuration | [RD-03](requirements/RD-03-postgresql-backed-global-configuration.md) | [Plan](plans/postgresql-backed-global-configuration/00-index.md) | Executing | 🔄     | 2026-09-16   | Phase 2 verified, 27/59 tasks; AR-20 B accepted with incomplete classification retained; proceeding to Phase 3; depends on RD-01, RD-02 |
