# Roadmap: Connected Apps

> **Feature-Set**: Connected Apps
> **Status**: Complete
> **Created**: 2026-11-07
> **Last Updated**: 2026-11-07
> **Progress**: 6 / 6 tasks (100%)
> **CodeOps Artifact Schema**: 1

## Legend

⬜ Backlog · 🔄 Executing · ✅ Done · ⛔ Blocked · ⏸️ Deferred · 📦 Archived

## Tracker

| ID   | Title                                   | RD  | Plan                                                    | Stage     | Status | Last Updated | Depends-on / Blocker |
| ---- | --------------------------------------- | --- | ------------------------------------------------------- | --------- | ------ | ------------ | -------------------- |
| T-01 | Admin connected-apps list and revoke (#155) | —   | [Standalone task plan](plans/connected-apps-admin/99-execution-plan.md) | Done      | ✅     | 2026-11-07   | 6/6; reviews, local gates and PR CI green |

## Notes

- The first surface is Admin-only: an organization-scoped user subresource using existing Admin
  authentication and user permissions. No end-user self-service, SDK, CLI or terminal Admin UI is
  included in this task; those remain a later product decision.
- A connected app is one live OIDC Grant for a user and client. Listing reports the client, scopes
  and grant times. Revoking deletes the Grant and all access/refresh artifacts linked by its
  `grant_id`; it does not delete the user, client or browser session.
