# Roadmap: Monorepo Migration

> **Feature-Set**: Monorepo Migration
> **Status**: Executing — automated release trigger in progress
> **Created**: 2026-08-08
> **Last Updated**: 2026-09-25 10:31
> **Progress**: 74 / 75 tasks (99%)
> **CodeOps Artifact Schema**: 1

## Legend

⬜ Backlog · ✏️ RD Drafted · 🔎 RD Preflighted · 📋 Plan Created · 🔬 Plan Preflighted · 🔄 Executing · ✅ Done · ⛔ Blocked · ⏸️ Deferred

## Tracker

| ID   | Title                             | RD  | Plan                                                             | Stage     | Status | Last Updated     | Depends-on / Blocker                                              |
| ---- | --------------------------------- | --- | ---------------------------------------------------------------- | --------- | ------ | ---------------- | ----------------------------------------------------------------- |
| T-01 | Migrate Porta to a monorepo       | —   | [monorepo-migration](plans/monorepo-migration/00-index.md)       | Done      | ✅     | 2026-08-09 00:45 | Complete; publishing remains deferred to T-02                     |
| T-02 | Publishing and production cutover | —   | [plan](plans/publishing-production-cutover/99-execution-plan.md) | Done      | ✅     | 2026-08-26 14:59 | Complete; tokenless 1.7.2 release verified                       |
| T-03 | Automated release trigger         | —   | [plan](plans/automated-release/00-index.md)                      | Executing | 🔄     | 2026-09-25 10:31 | One manual dispatch does bump, notes, tag, publish, Docker, develop sync |
