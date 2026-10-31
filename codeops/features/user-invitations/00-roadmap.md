# Roadmap: User Invitations

> **Feature-Set**: User Invitations
> **Status**: Active
> **Created**: 2026-09-26
> **Last Updated**: 2026-10-30 12:25
> **Progress**: 0 / 0 (0%)
> **CodeOps Artifact Schema**: 1

## Legend

⬜ Backlog · ✏️ RD Drafted · 🔎 RD Preflighted · 📋 Plan Created · 🔬 Plan Preflighted · 🔄 Executing · ✅ Done · ⛔ Blocked · ⏸️ Deferred

## Tracker

| ID   | Title | RD  | Plan | Stage | Status | Last Updated | Depends-on / Blocker |
| ---- | ----- | --- | ---- | ----- | ------ | ------------ | -------------------- |
| T-01 | Deferred invitation creation (no user until acceptance) | — | [plan](plans/deferred-invitation-creation/00-index.md) | 🔄 Executing | 🔄 | 2026-09-27 00:35 | — |
| T-02 | Invitation localization and formal Dutch support (#179) | — | [plan](plans/invitation-localization/00-index.md) | ✅ Done | ✅ | 2026-10-30 10:47 | 40/40; full CI green on c9e9e761; AR #17 limitation retained |
| T-03 | Tenant invitation revocation (#196) | — | [plan](plans/tenant-invitation-revocation/00-index.md) | 🔄 Executing | 🔄 | 2026-10-31 21:34 | 27/30; assurance/compat passed; publication and final CI next |

## Notes

- Implementation complete and merged to `develop` via PR #138 (`27a31452`); `Build and Test` green on
  develop HEAD. The gated `main` promotion and Release dispatch are deferred to the user (they
  chose to stop at `develop`).
- Preflight iteration 2 passed on 2026-09-26 (all 13 findings resolved); evidence in
  `plans/deferred-invitation-creation/00-preflight-report.md`.
- This feature has no upstream RD; the standalone plan's `01-requirements.md` is the owning
  requirements document. The plan declares `> **Implements**: user-invitations/T-01`.
- Scope excludes listing/revoking pending invitations, a pending `UserStatus`, Redis storage, and
  any new purge worker or scheduler.
- Release scope: the plan's final gated phase covers `develop` → `main` and the manual Release
  dispatch.
