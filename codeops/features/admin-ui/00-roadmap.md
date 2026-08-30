# Roadmap: Porta Admin UI

> **Feature-Set**: Porta Admin UI
> **Status**: Active
> **Created**: 2026-08-27
> **Last Updated**: 2026-08-30 12:28
> **Progress**: 3 / 9 (33%)
> **CodeOps Artifact Schema**: 1

## Legend

⬜ Backlog · ✏️ RD Drafted · 🔎 RD Preflighted · 📋 Plan Created · 🔬 Plan Preflighted · 🔄 Executing · ✅ Done · ⛔ Blocked · ⏸️ Deferred

## Tracker

| ID    | Title                                | RD                                                                 | Plan                                                                                 | Stage            | Status | Last Updated     | Depends-on / Blocker |
| ----- | ------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------- | ------ | ---------------- | -------------------- |
| RD-01 | JSVision admin foundation            | [RD-01](requirements/RD-01-jsvision-admin-foundation.md)           | [jsvision-foundation](plans/jsvision-foundation/00-index.md)                         | Done             | ✅     | 2026-08-27 20:11 | —                    |
| RD-02 | Organization context and navigation  | [RD-02](requirements/RD-02-organization-context-and-navigation.md) | [organization-context-navigation](plans/organization-context-navigation/00-index.md) | Done             | ✅     | 2026-08-29 00:17 | RD-01                |
| T-01  | Unauthenticated authentication gate  | —                                                                  | [plan](plans/authentication-gate/99-execution-plan.md)                               | Done             | ✅     | 2026-08-29 12:36 | RD-01                |
| RD-03 | User management                      | [RD-03](requirements/RD-03-user-management.md)                     | [user-management](plans/user-management/00-index.md)                                 | Done             | ✅     | 2026-08-30 06:23 | RD-02                |
| RD-04 | Applications and OIDC clients        | [RD-04](requirements/RD-04-applications-and-oidc-clients.md)       | [applications-oidc-clients](plans/applications-oidc-clients/00-index.md)             | Executing        | 🔄     | 2026-08-30 12:28 | RD-02                |
| RD-05 | Roles and permissions                | —                                                                  | —                                                                                    | Backlog          | ⬜     | 2026-08-29 13:13 | RD-03, RD-04         |
| RD-06 | Organization settings and branding   | —                                                                  | —                                                                                    | Backlog          | ⬜     | 2026-08-29 13:13 | RD-02                |
| RD-07 | Sessions and authentication security | —                                                                  | —                                                                                    | Backlog          | ⬜     | 2026-08-29 13:13 | RD-03                |
| RD-08 | Audit and activity                   | —                                                                  | —                                                                                    | Backlog          | ⬜     | 2026-08-29 13:13 | RD-02                |
| RD-09 | Advanced operational tools           | —                                                                  | —                                                                                    | Backlog          | ⬜     | 2026-08-29 13:13 | RD-06, RD-08         |

Backlog rows intentionally describe capabilities only. Each item is scoped immediately before
implementation so the Admin UI grows one useful feature at a time without speculative framework
or screen design.

## Future feature map

| Order | Feature                              | Initial capability boundary                                                                                                               |
| ----- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | User management                      | List, inspect, create or invite, edit, and manage user status within the selected organization.                                           |
| 2     | Applications and OIDC clients        | Manage global applications and modules, plus clients, redirect configuration, and secrets within the selected organization.               |
| 3     | Roles and permissions                | Manage application roles and permissions, then assign roles to users.                                                                     |
| 4     | Organization settings and branding   | Edit organization configuration and its existing branding settings and assets.                                                            |
| 5     | Sessions and authentication security | Inspect or revoke sessions and administer the existing organization and user two-factor controls.                                         |
| 6     | Audit and activity                   | Show organization statistics and inspect the existing audit history.                                                                      |
| 7     | Advanced operational tools           | Expose existing import, export, bulk, signing-key, and global configuration operations only where they are safe and useful interactively. |
