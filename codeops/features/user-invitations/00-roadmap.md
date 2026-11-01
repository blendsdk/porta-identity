# Roadmap: User Invitations

> **Feature-Set**: User Invitations
> **Status**: Complete
> **Created**: 2026-09-26
> **Last Updated**: 2026-11-01 09:27
> **Progress**: n/a (task-only feature)
> **CodeOps Artifact Schema**: 1

## Legend

⬜ Backlog · ✏️ RD Drafted · 🔎 RD Preflighted · 📋 Plan Created · 🔬 Plan Preflighted · 🔄 Executing · ✅ Done · ⛔ Blocked · ⏸️ Deferred

## Tracker

| ID   | Title | RD  | Plan | Stage | Status | Last Updated | Depends-on / Blocker |
| ---- | ----- | --- | ---- | ----- | ------ | ------------ | -------------------- |
| T-01 | Deferred invitation creation (no user until acceptance) | — | [plan](plans/deferred-invitation-creation/00-index.md) | ✅ Done | ✅ | 2026-11-01 09:27 | 68/68; released in v1.11.0 via PR #140; AR-14 equivalence |
| T-02 | Invitation localization and formal Dutch support (#179) | — | [plan](plans/invitation-localization/00-index.md) | ✅ Done | ✅ | 2026-11-01 09:27 | 40/40; merged PR #210; promoted #211; released in v1.15.0; AR #17 limitation retained |
| T-03 | Tenant invitation revocation (#196) | — | [plan](plans/tenant-invitation-revocation/00-index.md) | ✅ Done | ✅ | 2026-10-31 22:10 | 30/30; assurance/compat green; merged to develop via PR #212; not in v1.15.0 |

## Notes

- Implementation complete; deferred creation released in v1.11.0 via PR #140 (AR-14 equivalence).
  Localization merged to develop via PR #210, promoted via #211 and released in v1.15.0.
  Revocation merged to develop via PR #212 and is not in v1.15.0.
- At execution, the user chose to stop at `develop`; the later release completed under the
  recorded AR-14 operational equivalence. The historical authorization boundary remains unchanged.
- Preflight iteration 2 passed on 2026-09-26 (all 13 findings resolved); evidence in
  `plans/deferred-invitation-creation/00-preflight-report.md`.
- This feature has no upstream RD; the standalone plan's `01-requirements.md` is the owning
  requirements document. The plan declares `> **Implements**: user-invitations/T-01`.
- The deferred-creation plan's scope excludes listing/revoking pending invitations, a pending
  `UserStatus`, Redis storage, and any new purge worker or scheduler. T-03 subsequently shipped
  revocation as a separate task.
- Release scope: the plan's final gated phase covered `develop` → `main` and the manual Release
  dispatch for T-01; it completed in v1.11.0. T-03 remains on `develop`.
