# Roadmap: Tenant User Management

> **Feature-Set**: Tenant User Management
> **Status**: Complete
> **Created**: 2026-10-25
> **Last Updated**: 2026-11-01 11:06
> **Progress**: n/a (task-only feature)
> **CodeOps Artifact Schema**: 1

## Legend

⬜ Backlog · ✏️ RD Drafted · 🔎 RD Preflighted · 📋 Plan Created · 🔬 Plan Preflighted · 🔄 Executing · ✅ Done · ⛔ Blocked · ⏸️ Deferred

## Tracker

| ID   | Title | RD  | Plan | Stage | Status | Last Updated | Depends-on / Blocker |
| ---- | ----- | --- | ---- | ----- | ------ | ------------ | -------------------- |
| T-01 | Tenant-scoped M2M user management (CRUD, lifecycle, roles, audit) | — | [plan](plans/tenant-m2m-user-management/00-index.md) | ✅ Done | ✅ | 2026-11-01 11:06 | Production-security run `069b36ff` green; deployment pending |

## Notes

- This feature has no upstream RD; the standalone plan's `01-requirements.md` is the owning
  requirements document. The plan declares `> **Implements**: tenant-user-management/T-01`.
- Preflight iteration 1 (2026-10-25) found 17 findings: 10 major, 7 minor. Fifteen were resolved by
  delegated `--auto-design` authority; the two reserved decisions were resolved by the user:
  PF-005 chose the simple audit backfill with a documented maintenance window and accepted
  historical `system` classification, and PF-009 chose this new feature with a branch from
  `origin/develop`.
- Preflight iteration 2 passed on 2026-10-25 (17/17 resolved; 0 new findings; 2 accepted
  conditions). Evidence: `plans/tenant-m2m-user-management/00-preflight-report.md`.
- 2026-11-01: production-security run `069b36ff` exited 0; exact throttle and wrong-tenant probes
  pass with the required rejection event. Original failures and repair failures remain recorded.
  Deployment remains with the operator.
- The promoted plan, report, feature roadmap, and portfolio row are committed on
  `feat/tenant-m2m-user-management`, based on `origin/develop`.
- Execution completed 55/56 tasks. All product and verification gates pass (`yarn verify`, E2E,
  pentest, compatibility, docs, structure). The remaining gate is the production-security harness:
  its 11 production-exposure cases pass, but the human-auth recovery case
  `password-reset-throttled-request` fails because the normalized rejection log event is missing.
  The failing test/adapter are in `test-harness/assurance`, which this branch did not modify. See
  `plans/tenant-m2m-user-management/08-handoff.md`; do not deploy until this is resolved.
- The plan was promoted from the Plan-mode workspace into this feature. Implementation starts from
  an up-to-date `origin/develop`, which already contains the tenant invitation prerequisite
  (PR #189). Do not use the stale local `develop` or the older `feat/tenant-user-invitations` branch.
- Scope: tenant service-client CRUD, activate/deactivate, permanent delete, app-bound role
  management, three OAuth scopes, first-class client audit attribution, read audit, rate limits,
  SDK/CLI/docs updates. No passwords, email changes, 2FA management, bulk operations, multi-org
  partners, new Admin UI, or new assurance profile.
- Migration `034_audit_client_actor.sql` requires a maintenance window, verified pre-migration
  backup, and post-migration audit verification.
