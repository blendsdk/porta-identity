# User CRUD Routes: Tenant-Scoped M2M User Management

> **Document**: 03-02-user-crud-routes.md
> **Parent**: [Index](00-index.md)

## Overview

This component adds the tenant user router. It mirrors the Admin API resource shapes, reuses the existing user and role services, and applies the tenant actor/scope rules. The router is service-only for CRUD; the invite route remains dual.

## Architecture

### Current Architecture

`routes/tenant-invitations.ts` has one `/invite` route under `/api/organizations/:orgId/users`. The Admin routes in `routes/users.ts` and `routes/user-roles.ts` own the full behavior but require `requireAdminAuth()` and super-admin organization membership.

### Proposed Changes

- Create `packages/server/src/routes/tenant-users.ts` with prefix `/api/organizations/:orgId/users`.
- Move the invite handler into this router unchanged except for the shared actor/auth refactor.
- Add CRUD, lifecycle, and role routes with per-route auth/scope, target-user organization guard, and rate limiters.
- Extract shared user request schemas from `routes/users.ts` into `packages/server/src/users/schemas.ts` (or a similarly named module) so the Admin and tenant routes validate the same fields.
- Keep the Admin routes and their permissions intact; only add actor propagation and shared schema imports.

## Implementation Details

### Route Table

| Method | Path | Scope | Handler behavior |
| --- | --- | --- | --- |
| `POST` | `/` | `org:user:write` | Create user; no password; full profile; optional verification flags |
| `GET` | `/` | `org:user:read` | List users; existing offset/cursor pagination, search, status, sort |
| `GET` | `/:userId` | `org:user:read` | Get user; ETag |
| `PUT` | `/:userId` | `org:user:write` | Update profile/verification flags; optional `If-Match` |
| `DELETE` | `/:userId` | `org:user:delete` | Permanently delete; `204` |
| `POST` | `/:userId/deactivate` | `org:user:write` | Active → inactive; `204` |
| `POST` | `/:userId/activate` | `org:user:write` | Inactive → active; `204` |
| `GET` | `/:userId/roles` | `org:user:read` | Roles assigned to the user, filtered to client application |
| `GET` | `/:userId/roles/permissions` | `org:user:read` | Effective permissions from the client application only |
| `PUT` | `/:userId/roles` | `org:user:write` | Assign roles from the client application |
| `DELETE` | `/:userId/roles` | `org:user:write` | Remove roles from the client application |
| `POST` | `/invite` | `org:user:invite` | Existing invite behavior; service or user actor |

### Validation Schemas

Extract from `packages/server/src/routes/users.ts`:

- `createUserSchema`: existing profile fields, optional `password`, optional `phoneNumberVerified`; add optional `emailVerified`.
- `updateUserSchema`: existing mutable profile fields, optional `phoneNumberVerified`; add optional `emailVerified`; keep email, status, password, and 2FA out.
- `tenantCreateUserSchema`: `createUserSchema.omit({ password: true }).extend({ organizationId: z.string().uuid().optional(), password: z.never().optional() }).strict()` so a password or other unsupported field is rejected rather than silently stripped, while the SDK's body `organizationId` remains accepted and ignored in favor of the path.
- `tenantUpdateUserSchema`: `updateUserSchema` with `.strict()` so unsupported fields such as `email`, `status`, `password`, `twoFactorEnabled` are rejected.
- Refinement: `phoneNumberVerified === true` requires a non-empty `phoneNumber` in the same request for create, or a non-null existing phone for update.

The Admin route keeps its existing non-strict behavior, password support, and duplicate-email `400`
mapping; only the tenant handler maps the typed duplicate conflict to `409`. Admin accepts the
additive `emailVerified` field through the shared schema. The tenant route uses the tenant variants.

Extract `listUsersSchema`, `listUsersCursorSchema`, `identifierSchema`, and `roleIdsSchema` into the
same shared module so the tenant read/delete/role routes do not duplicate validation. Extract a
shared route-error mapper for user/invite/role errors so the Admin, tenant, and standalone routers
use one mapping; the Admin duplicate-email branch remains `400`.

### Create Behavior

1. Auth/scope check (`org:user:write`), org exists, rate limit.
2. Parse `tenantCreateUserSchema`; reject password; validate phone-verification consistency.
3. Call the audit-aware `createUser` service with the tenant client actor.
4. Return `201 { data: user }` and the user ETag.
5. Audit `user.created` with target `user_id`, client actor, organization, email, `emailVerified`, `phoneNumberVerified`, and IP/user-agent.
6. No email is sent. The BFF is responsible for directing the user to the existing login, magic-link, or forgot-password flow.

The service must distinguish a duplicate-email conflict from other validation failures. Add a typed `UserEmailConflictError` in `users/errors.ts`; throw it from `createUser` when the organization already has the email. The tenant handler maps it to `409`; the Admin handler preserves its existing `400` response. Also translate the PostgreSQL unique-violation path to the same error so a concurrent create cannot surface as a `500`. Other `UserValidationError` cases remain `400`.

Create supports the full OIDC profile: email, given/family/middle name, nickname, preferred username, profile/picture/website URL, gender, birthdate, zoneinfo, locale, phone, address, plus `emailVerified` and `phoneNumberVerified`.

### Read Behavior

- `GET /` imports the extracted list schemas and uses `listUsersByOrganization` / `listUsersCursor`; organization comes only from the path.
- `GET /:userId` uses `requireUserOrganization` after auth, then `getUserById`; sets ETag.
- Both write read-audit rows with the client actor. List metadata contains filters, pagination, and result count only. No foreign user IDs are returned.
- Missing, invalid, or foreign user returns `404 User not found`.

### Update Behavior

1. Auth/scope (`org:user:write`), target-user org guard, rate limit.
2. Parse `tenantUpdateUserSchema`; reject email/status/password/2FA fields.
3. Load the current user; apply optional `If-Match` via the existing ETag helper.
4. Validate `phoneNumberVerified: true` against the resulting phone number.
5. Call the audit-aware `updateUser` with the client actor.
6. Return `200 { data: user }` and the new ETag.
7. Audit `user.updated` with the changed field list and target `user_id`.

The BFF may set `emailVerified` and `phoneNumberVerified`; this is an explicit trust decision recorded in AR-9. It may not change the email address.

### Delete Behavior

1. Auth/scope (`org:user:delete`), target-user org guard, delete rate limit.
2. Validate path UUIDs.
3. Call `deleteUser` with the client actor. The service owns `runDatabaseTransaction` (nested calls reuse the Admin transaction) and retains its session/token revocation and super-admin survivor guard.
4. Return `204`.
5. Audit `user.deleted` with target `user_id` and metadata containing the email and status captured before deletion. The audit row survives; the `user_id` FK may become null under the existing `ON DELETE SET NULL`, while metadata and client actor fields remain.
6. A repeat or foreign-tenant delete returns `404`.

### Lifecycle Behavior

- `deactivateUser` and `activateUser` are called with the client actor and target-user guard.
- Status validation remains in the service: deactivate only from active; activate only from inactive.
- Return `204`; audit `user.deactivated` / `user.activated` with target `user_id`.
- The Admin route keeps its `guardSuperAdmin` call; the tenant route cannot reach the super-admin organization by construction.
- Both the organization-scoped and standalone Admin lifecycle handlers pass `{ kind: 'user', userId: ctx.state.adminUser.id }`. The tenant handler passes the service client actor.

### Role Behavior

Add a service-aware role path in `packages/server/src/rbac/user-role-service.ts` using the shared `AuditActor` contract from [03-03](03-03-audit-client-actor.md):

```typescript
export interface UserRoleMutationOptions {
  readonly organizationId: string;
  readonly userId: string;
  readonly roleIds: readonly string[];
  readonly actor: AuditActor;
  readonly allowedApplicationId?: string;
}

export async function assignRolesToUser(options: UserRoleMutationOptions): Promise<void>;

export async function removeRolesFromUser(
  options: UserRoleMutationOptions,
): Promise<{ reauthenticationRequired: boolean }>;
```

- Both role mutations own `runDatabaseTransaction`; nested calls reuse the Admin transaction. Both use `writeAuditLogInTransaction`, including assignment (the current assignment audit is best-effort).
- Admin caller: `{ kind: 'user', userId: adminUser.id }`, no `allowedApplicationId`; `assigned_by = actor.userId`; existing delegation checks remain.
- Tenant caller: `{ kind: 'service', clientId, clientName }`, `allowedApplicationId = client.applicationId`; `assigned_by = null`; validate every role belongs to that application; skip the human delegation ceiling; audit with client fields. `system` actors are rejected for role mutations.
- Cross-application or canonical `porta-admin` role requests throw `RoleApplicationBoundaryError`, mapped to `400`. Removal uses the same actor union, application boundary, and error.
- Admin removal keeps the super-admin survivor check. Tenant removal returns `{ data: { reauthenticationRequired: false } }` because the caller is not a user.
- Tenant role list returns only roles whose `applicationId` equals the client application. Effective permissions resolve only roles from that application. Add a focused service helper if the existing `getUserPermissions` is not application-filtered.
- Canonical `porta-admin` roles are rejected because the tenant client cannot belong to the `porta-admin` application; also reject explicitly if a role resolves to that application.

### Error Handling

| Error Case | Status | Body |
| --- | --- | --- |
| Invalid JSON/body/field | `400` | Fixed validation message |
| Password present on tenant create | `400` | Fixed validation message |
| Email/status/password/2FA on tenant update | `400` | Fixed validation message |
| Phone verified without a phone | `400` | Fixed validation message |
| Missing/invalid token | `401` | Fixed authentication message |
| Wrong actor kind / scope / client boundary | `403` | Fixed forbidden message |
| Invalid/foreign organization at the auth boundary | `403` | Fixed forbidden message |
| Foreign/absent user | `404` | `User not found` |
| Role from another application or canonical `porta-admin` role | `400` | Fixed validation message |
| Duplicate email (`UserEmailConflictError`) | `400` Admin / `409` tenant | `User already exists in this organization` |
| Stale `If-Match` | `412` | Existing precondition failure |
| Rate limit | `429` | Fixed rate-limit message with `Retry-After` |
| Unexpected error | `500` | Global sanitized error boundary |

### SDK Mapping

| SDK call | Tenant route |
| --- | --- |
| `client.users.create(input)` | `POST /organizations/:orgId/users` |
| `client.users.list(orgId)` / `listAll` | `GET /organizations/:orgId/users` |
| `client.users.get(orgId, userId)` | `GET /organizations/:orgId/users/:userId` |
| `client.users.update(orgId, userId, input, etag?)` | `PUT /organizations/:orgId/users/:userId` |
| `client.users.delete(orgId, userId)` | `DELETE /organizations/:orgId/users/:userId` |
| `client.users.deactivate/activate` | `POST .../:userId/deactivate|activate` |
| `client.userRoles.list/assign/remove` | `GET|PUT|DELETE .../:userId/roles` |
| `client.userRoles.getEffectivePermissions` | `GET .../:userId/roles/permissions` |

### Integration Points

- `server.ts` mounts `createTenantUsersRouter(oidcProvider)` once.
- `routes/tenant-users.ts` imports the shared auth resolver, rate limiters, shared schemas, services, and audit mapper.
- `routes/users.ts` imports the shared schemas and passes `{ kind: 'user', userId: ctx.state.adminUser.id }` to create, update, and lifecycle services in both the organization-scoped and standalone routers. The CLI bootstrap passes `{ kind: 'system' }` or relies on the documented service default.
- `routes/user-roles.ts` passes the admin actor options object to the updated role service.

## Testing Requirements

- Unit tests for create/list/get/update/delete/lifecycle/role route contracts and error mapping.
- Error-mapping tests: Admin duplicate email `400`, tenant duplicate email `409`, cross-application/canonical role `400`, invalid/foreign organization `403`, absent user `404`.
- Integration tests for real database persistence, ETag, role filtering, audit rows, cross-org 404s, and tenant delete/role transaction ownership.
- Pentest tests for scope escalation, wrong actor kind, foreign tenant, canonical admin role, and password injection.
- Existing route/service/role tests updated for the typed actor contract, transaction-bound audit, and Admin lifecycle/standalone actor propagation.
- SDK tests proving each domain method uses the tenant path with `apiPrefix: '/api'`.
- CLI tests for audit/history display and terminal-safe client actor names.

## Traceability

- AR-1, AR-2, AR-4, AR-7, AR-8, AR-9, AR-10, AR-11, AR-12, AR-17, AR-19, AR-20, AR-22, AR-24.
- Requirements R3–R9, R12–R14, R17–R18.
