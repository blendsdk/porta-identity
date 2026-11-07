# Task T-01: Admin Connected-Apps List and Revoke

> **Type**: Task (lightweight) · **Feature**: connected-apps · **CodeOps Artifact Schema**: 1
> **Progress**: 5/6 tasks (83%)
> **Reasoning**: high — public authorization surface over OIDC grant state with cross-tenant
> isolation and token invalidation.

## Objective

Let an administrator list one user's connected OIDC applications and revoke a selected grant,
invalidating the grant and its linked access/refresh artifacts. Closes GitHub #155 for the
admin-only first surface confirmed by the user.

**Smallest viable design:** one organization/user-scoped Admin subresource backed by the existing
`oidc_payloads` Grant rows and the existing grant-wide delete helper. No new tables, no end-user
surface, no SDK/CLI/terminal UI in this task.

## Scope

In scope:

- `GET /api/admin/organizations/:orgId/users/:userId/connected-apps` returning live grants for that
  user with client identity, granted scopes and timestamps.
- `DELETE /api/admin/organizations/:orgId/users/:userId/connected-apps/:grantId` deleting the grant
  and every artifact sharing its `grant_id`.
- Existing Admin authentication, organization membership, and `admin:user:read` /
  `admin:user:update` permissions.
- Cross-user and cross-organization isolation; expired grants excluded; revoked tokens no longer
  resolve.
- Spec-first service and route tests, docs and roadmap.

Out of scope:

- End-user self-service, SDK, CLI, terminal Admin UI, new permissions, session revocation, client or
  user deletion, consent-screen changes, pagination beyond a bounded first surface, caching or a new
  worker.
- Provider protocol changes or resource-server work (#156 is complete).

## Decisions (auto-design provenance)

| ID  | Decision | Rationale |
| --- | -------- | --------- |
| D1  | Admin-only server subresource under the user | User confirmed admin-only first; this is the smallest usable surface. |
| D2  | Use existing `admin:user:read` for list and `admin:user:update` for revoke | Avoids a new permission and matches the user-owned resource. |
| D3  | A connected app is one live OIDC Grant | The provider already stores exactly this authorization state; no duplicate table. |
| D4  | Revoke deletes the grant and all `oidc_payloads` rows sharing its `grant_id` | Reuses the established grant-wide cleanup path; access and refresh artifacts stop resolving. |
| D5  | Do not delete user/client rows; revoking a Grant may invalidate the shared browser session authority | Deleting a Grant makes the session authority check fail closed; the user reauthenticates. No cross-tenant data or user/client rows are deleted. |
| D6  | Exclude expired grants from the list | Expired grants are not connectable authority. |

AI resolved D2–D6 under `--auto-design`; D1 is the user-confirmed surface.

## Technical design

1. **Service.** `packages/server/src/connected-apps/service.ts` validates UUIDs, queries live Grant
   payloads joined to the owning client and organization, extracts granted scopes from `openid.scope`
   and resource scopes, and maps fixed fields. Revoke first proves the grant belongs to the exact
   user/organization/client, then calls `revokeGrantsByIds([grantId])`.
2. **Routes.** `packages/server/src/routes/connected-apps.ts` registers the two routes with
   `requireAdminAuth`, the existing permission middleware and `requireUserOrganization`. Validation
   and storage errors use fixed bodies; unknown or foreign grants return `404`.
3. **Registration.** Mount the router in `server.ts` beside the user-role and session routers.
4. **Tests.** Real-PostgreSQL integration covers list shape/scopes, expired exclusion, cross-user
   and cross-organization isolation, and deletion of grant plus access/refresh artifacts. A route
   test covers validation and fixed errors where practical.
5. **Docs.** Add the admin surface to `techdocs/architecture/api-design.md` and
   `techdocs/architecture/security.md`.

## Tasks

- [x] T-01.1 Write service specs for live list shape, scopes, expired exclusion, cross-user and
  cross-organization isolation, and grant-wide revoke; observe red. ✅ (completed: 6 service specs green)
- [x] T-01.2 Implement the service and make the specs green. ✅ (completed: live list, scope union,
  expiry filter, ownership lock, grant+artifact delete)
- [x] T-01.3 Add the Admin router with fixed validation/not-found errors and mount it. ✅
  (completed: GET/DELETE, existing user permissions, fixed 400/404/503, server registration)
- [x] T-01.4 Add route/authorization tests and registration/structure evidence. ✅ (completed:
  5 route specs; structure 158; server unit 4,450)
- [x] T-01.5 Update security/API docs and roadmap; run server lint, typecheck, build, focused tests,
  the affected integration selection and structure. ✅ (completed: techdocs API/security/data-model;
  lint/typecheck/build; focused 6+5; unit 4,450; structure 158; docs build)
- [~] T-01.6 Independent review and scoped fixes; full server/CI gate; merge through `develop`, close
  #155 and record evidence/cleanup. ⏳ (review, CI, merge and closure pending)

**Verify**: `pnpm --filter @portaidentity/server lint && pnpm --filter @portaidentity/server typecheck && pnpm --filter @portaidentity/server build && pnpm --filter @portaidentity/server test && pnpm test:structure`

## Evidence plan

- Record spec-red, focused green counts, cross-tenant/token-invalidations and review.
- Record CI, merge commit and #155 closure; clean up owned services and temporary artifacts.
