# Roadmap: User Invitations

> **Feature-Set**: User Invitations
> **Status**: Active
> **Created**: 2026-09-26
> **Last Updated**: 2026-09-26 20:18
> **Progress**: 0 / 1 (0%)
> **CodeOps Artifact Schema**: 1

## Legend

⬜ Backlog · ✏️ RD Drafted · 🔎 RD Preflighted · 📋 Plan Created · 🔬 Plan Preflighted · 🔄 Executing · ✅ Done · ⛔ Blocked · ⏸️ Deferred

## Tracker

| ID   | Title | RD  | Plan | Stage | Status | Last Updated | Depends-on / Blocker |
| ---- | ----- | --- | ---- | ----- | ------ | ------------ | -------------------- |
| T-01 | Deferred invitation creation (no user until acceptance) | — | [plan](plans/deferred-invitation-creation/00-index.md) | 🔄 Executing | 🔄 | 2026-09-26 20:18 | — |

## Notes

- Preflight iteration 2 passed on 2026-09-26 (all 13 findings resolved); evidence in
  `plans/deferred-invitation-creation/00-preflight-report.md`.
- This feature has no upstream RD; the standalone plan's `01-requirements.md` is the owning
  requirements document. The plan declares `> **Implements**: user-invitations/T-01`.
- Scope excludes listing/revoking pending invitations, a pending `UserStatus`, Redis storage, and
  any new purge worker or scheduler.
- Release scope: the plan's final gated phase covers `develop` → `main` and the manual Release
  dispatch.
