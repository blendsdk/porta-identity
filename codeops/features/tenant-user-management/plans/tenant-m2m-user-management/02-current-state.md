# Current State: Tenant-Scoped M2M User Management

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

Porta has a tenant-scoped invitation route for BFFs, backed by a dual service-client/tenant-user auth middleware. It also has a complete Admin user API that requires super-admin organization membership, and a shared user service layer. The tenant route currently covers only invitations; the Admin user routes cover create, list, get, update, lifecycle, delete, password, verification, export, and history.

### Relevant Files

| File | Purpose | Changes Needed |
| --- | --- | --- |
| `packages/server/src/routes/tenant-invitations.ts` | Tenant invite route; prefix at `:81`, invite handler at `:85` | Move into a tenant user router and add CRUD/lifecycle/role routes |
| `packages/server/src/middleware/tenant-invite-auth.ts` | Dual service/user auth; scope check at `:158-185`, permission check at `:263-273` | Generalize required scope/permission and allowed actor kinds; rename state |
| `packages/server/src/oidc/scopes.ts` | `org:user:invite` constants at `:13-16` | Add read/write/delete scope constants |
| `packages/server/src/oidc/configuration.ts` | Provider scope list at `:551-559` | Register the three new scopes |
| `packages/server/src/server.ts` | Tenant invite import at `:45`; mount at `:296-298` | Mount the consolidated tenant user router |
| `packages/server/src/routes/users.ts` | Admin create `:247-260`, update `:315-335`, lifecycle `:341-370`, delete `:445-458`, invite `:487-511`; standalone router `:606-720` | Extract shared schemas; pass admin actor in create/update/lifecycle including the standalone router; reuse tenant services |
| `packages/server/src/cli/commands/init.ts` | Bootstrap `createUser` at `:367`, `activateUser` at `:380` | Pass the `system` actor or document the service default; no admin user exists at bootstrap |
| `packages/server/src/users/invitation-service.ts` | Invitation acceptance `user.created` at `:120-135` | Existing best-effort flow; outside this plan's mutation scope; document the boundary |
| Existing tests and fixtures | `tests/unit/lib/audit-log.test.ts`, `tests/unit/users/service.test.ts`, `tests/unit/users/invite-service.spec.test.ts`, `tests/unit/rbac/user-role-service.test.ts`, `tests/unit/routes/users.test.ts`, `tests/unit/routes/user-roles.test.ts`, `tests/integration/migrations.test.ts`, `tests/integration/repositories/audit-log.repo.test.ts`, `tests/integration/admin/record-deletion.spec.test.ts`, `tests/integration/admin/portability-round-trip.spec.test.ts`, `tests/integration/rbac/authority-mutations.spec.test.ts`, `tests/integration/rbac/permission-deletion-concurrency.impl.test.ts`, `tests/unit/admin/administrative-data-production-driver.ts`, `packages/sdk/tests/type-contracts/users-contract.spec.test.ts` | Update writer mocks, actor expectations, duplicate-email status, direct audit inserts, and exact SDK type contracts |
| `packages/server/src/users/service.ts` | Create `:101-157`, update `:213-284`, deactivate `:338-355`, activate `:365-382` | Accept an audit actor, set target `user_id`, make mutation audit transaction-bound |
| `packages/server/src/users/invite-service.ts` | Invite workflow and `user.invited` audit at `:334-348` | First-class client actor; transaction-bound invitation insert + audit |
| `packages/server/src/rbac/user-role-service.ts` | Assign `:61-91`; remove `:105-148`; human-actor delegation checks | Add service-aware app-boundary assignment and client audit |
| `packages/server/src/routes/user-roles.ts` | Admin role routes at `:123`; assign `:148-172`; remove `:177-201`; permissions `:207-222` | Mirror tenant routes; filter to client application |
| `packages/server/src/lib/audit-log.ts` | Audit entry contract `:21-31`; inserts `:50-67`, `:93-110` | Add actor type/client fields and set them on every insert |
| `packages/server/src/lib/entity-history.ts` | History query `:122-191`; `user_id` filter at `:137` | Return actor type/client fields for CLI history |
| `packages/server/src/routes/audit.ts` | Audit API select/map `:86-117` | Return actor type/client fields |
| `packages/server/src/auth/token-repository.ts` | Direct audit insert at `:649-664` | Set actor type and actor identity |
| `packages/server/src/lib/data-export.ts` | Direct audit insert at `:238-255` | Set actor type |
| `packages/server/migrations/009_audit_log.sql` | Audit table `:5-17`; `actor_id` is a user FK | Add `034` migration for client actor columns |
| `packages/sdk/src/domains/users.ts` | Create `:138-145`; invite `:157-164`; update/delete methods | Reuse with `apiPrefix: '/api'`; no new method |
| `packages/sdk/src/domains/user-roles.ts` | List/assign/remove/effective permissions `:44-83` | Reuse with tenant role routes |
| `packages/sdk/src/types/users.ts` | Create input `:152-190`; update input `:194-225` | Add `emailVerified`/`phoneNumberVerified` optional fields |
| `packages/sdk/src/types/audit.ts` | Audit entry `:10-31` | Add actor type/client fields |
| `packages/sdk/src/types/common.ts` | History entry `:107-129` | Add actor type/client fields |
| `packages/cli/src/commands/audit.ts` | Audit table `:84-93` | Display client actor |
| `packages/cli/src/admin/user-service.ts` | History mapping `:265-280` | Display client actor |
| `docs/api/users.md` | Tenant invite section `:80-112` | Add tenant CRUD/lifecycle/role contract |
| `docs/api/audit.md` | Audit API docs | Add actor type/client fields |
| `packages/sdk/README.md` | Tenant invite example `:109-172` | Add CRUD example and scope guidance |
| `techdocs/architecture/api-design.md`, `security.md`, `data-model.md`, `decisions/index.md` | Architecture docs | Document tenant surface, M2M actor, audit columns, ADR |

### Code Analysis

The existing tenant auth middleware is structurally correct but invite-specific. It resolves a `ClientCredentials` token first, then an `AccessToken`; service authorization hardcodes `TENANT_INVITE_SCOPE` at `tenant-invite-auth.ts:175`, and user authorization hardcodes `TENANT_INVITE_PERMISSION` at `:264`. The actor type and state key are also invite-specific. The tenant boundary checks (`:139-146`) already reject the `porta-admin` application and super-admin organization, which is the right foundation for the CRUD surface.

The Admin user routes require `requireAdminAuth()` (`routes/users.ts:242`), and the Admin auth middleware verifies super-admin organization membership (`middleware/admin-auth.ts:238-274`). They cannot be reused directly for a tenant BFF. The underlying services are mostly reusable: `createUser` supports the full profile and optional password; `updateUser` supports profile and verification flags; `deactivateUser`/`activateUser` change status; `deleteUser` already runs in a transaction. The missing piece is a tenant route layer and actor-aware audit.

The current audit table has only `actor_id UUID REFERENCES users(id)` (`migrations/009_audit_log.sql:9`). A service client has no user row, so the existing invite route records `actor_id` null and puts `serviceClientId` in metadata (`users/invite-service.ts:334-348`). The CLI audit list selects `actorId` only (`cli/commands/audit.ts:84-93`), and user history maps `actorId ?? 'System'` (`cli/admin/user-service.ts:265-280`). This is insufficient for a full CRUD surface.

The shared user services accept optional string actor IDs (`createUser`, `updateUser`, `deactivateUser`, `activateUser`, `deleteUser`), while the role services require a string actor ID. The Admin routes do not pass them: create at `routes/users.ts:247-260`, update at `:315-335`, deactivate/activate at `:341-370`; the standalone router does the same at `:629,644,658`; the CLI bootstrap calls `createUser`/`activateUser` without an actor. Several services also put the target user only in metadata; `createUser` does not set the audit `user_id` column, and `updateUser`/deactivate/activate do the same. The new work must close this gap for both Admin and tenant callers and document the bootstrap `system` actor.

Role assignment is human-actor-oriented. `assignRolesToUser` requires an `assignedBy` user ID and calls `requireDelegableRoles` against that user's roles (`rbac/user-role-service.ts:61-91`). A service client has no user ID. The existing invite acceptance path bypasses this by inserting `user_roles` directly (`routes/invitation.ts:456-484`). The tenant CRUD surface needs a service-aware role path that validates the client's application boundary and writes client audit, while the Admin route keeps its human delegation check.

The SDK domains already use `/organizations/:orgId/users` and `/organizations/:orgId/users/:userId/roles`; with `apiPrefix: '/api'` they will address the tenant routes (`sdk/domains/users.ts:105-226`, `sdk/domains/user-roles.ts:44-83`). The SDK types lack some fields the tenant surface will accept, and the audit/history types lack client actor fields.

## Gaps Identified

### Gap 1: Invite-specific tenant auth

**Current Behavior:** The middleware requires `org:user:invite` and writes `ctx.state.tenantInviteActor`.

**Required Behavior:** A reusable tenant actor resolver that accepts a required scope, an optional required permission, and a set of allowed actor kinds. CRUD routes allow only service clients; invite allows both.

**Fix Required:** Refactor `tenant-invite-auth.ts` into a generic tenant actor middleware and update the invite route/tests.

### Gap 2: No tenant user routes

**Current Behavior:** Tenant paths exist only for `/invite`; all other user operations require `/api/admin/*` and super-admin membership.

**Required Behavior:** Tenant create/list/get/update/delete/lifecycle/role routes under `/api/organizations/:orgId/users`.

**Fix Required:** Add `routes/tenant-users.ts` and mount it in `server.ts`.

### Gap 3: No first-class client audit actor

**Current Behavior:** `audit_log.actor_id` is a user FK; service clients are only in metadata; CLI output shows no actor or `System`.

**Required Behavior:** `actor_type`, `actor_client_id`, and `actor_client_name` columns; target `user_id` set; client actor displayed and filterable in SQL.

**Fix Required:** Add migration `034`, extend the audit writer/API/types/CLI, and update direct inserts.

### Gap 4: Mutation audit is not consistently durable or attributed

**Current Behavior:** Create/update/lifecycle audit is best-effort; Admin routes do not pass actor IDs; target user IDs are often only in metadata.

**Required Behavior:** Mutation and audit commit together; every mutation records the caller and, where applicable, the target user. Invitations record the invitation ID because no user exists yet. Tenant routes are not covered by `adminMutationAudit`, so the mutation services must own the transaction boundary; nested calls reuse the Admin transaction.

**Fix Required:** Add a shared `AuditActor` type, make create/update/lifecycle/delete/role/invite mutations run inside `runDatabaseTransaction`, and use `writeAuditLogInTransaction`. Keep `InviteActor` for invitation display/delegation and map it to the audit actor.

### Gap 5: Role assignment assumes a human actor

**Current Behavior:** `assignRolesToUser` requires a user ID and delegation check; role list/effective permissions return all applications' data.

**Required Behavior:** Service-aware role assignment limited to the client application; tenant role reads filtered to the client application; role mutations run inside a service-owned transaction; cross-application/canonical role requests return the specified `400` boundary response.

**Fix Required:** Extend the role service with an options object carrying an `AuditActor` and `allowedApplicationId`; set `assigned_by` to null for service actors; reject `system`; add a boundary error mapped to `400`; add tenant role routes.

### Gap 6: Tenant schemas and SDK types are incomplete

**Current Behavior:** The Admin create schema accepts a password and lacks `emailVerified`; the update schema lacks `emailVerified`; SDK create/update types lack the new optional fields.

**Required Behavior:** Shared schemas with the verification flags; tenant create rejects password; SDK types expose the fields additively.

**Fix Required:** Extract shared schemas, add tenant variants, update SDK types.

### Gap 7: Documentation covers invites only

**Current Behavior:** `docs/api/users.md` and the SDK README document the tenant invite route, not CRUD.

**Required Behavior:** Document routes, scopes, client setup, audit, delete safety, and first-credential flow.

**Fix Required:** Update public docs, SDK README, techdocs, and the ADR log.

## Dependencies

### Internal Dependencies

- Existing tenant invite route and middleware.
- Existing Admin user services and role services.
- Existing audit log writer and migration runner.
- Existing Redis rate limiter.
- Existing SDK domains and transport `apiPrefix`.
- Existing CLI audit and user-history display.
- An up-to-date `origin/develop`, which already contains the tenant invitation prerequisite (PR #189). Local `develop` and the older `feat/tenant-user-invitations` branch are stale and must not be used as the feature base.

### External Dependencies

- PostgreSQL 16 for the audit migration and user/role data.
- Redis for rate limiting and existing caches.
- MailHog only for existing invitation tests; the new create route sends no email.
- Docker for the integration/pentest/assurance stacks.

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Cross-tenant user mutation through a crafted `:userId` | Medium | Critical | Reuse `requireUserOrganization`; return `404` for foreign users; pentest all routes |
| Service client gains control-plane authority | Low | Critical | Reject `porta-admin` application and super-admin organization in the auth boundary; test both |
| Role assignment crosses application boundaries | Medium | High | Validate every role against the client application; filter reads; test canonical admin roles |
| BFF asserts false verification flags | Medium | High | Explicit user decision; audit the assertion; document the trust boundary |
| Audit loss hides an M2M mutation | Medium | High | Transaction-bound mutation audit; test rollback on audit failure |
| Delete is used accidentally | Medium | High | Separate `org:user:delete` scope; document deactivate for routine offboarding; rate limit |
| Audit read volume grows too large | Medium | Medium | List audit records filters/count only; no per-user rows on list; read audit is best-effort |
| Existing Admin routes regress from actor refactor | Medium | Medium | Update Admin route tests; pass the actor in create/update/lifecycle including the standalone router; preserve permissions and behavior |
| Migration locks a large audit table | Medium | High | The migration updates every audit row and applies `SET NOT NULL` under the migration transaction; require a maintenance window, pre-migration backup, post-migration verification, and an accepted historical `system` classification for deleted actors |
| New scopes are not available at runtime | High if not deployed | High | Register scopes, update client metadata, restart every instance, document deployment |
| SDK consumers break from type changes | Medium | Medium | Additive optional fields, but update the exact input-type contracts and old negative assertions; run SDK verify and tenant-admin compatibility selector |
| Existing tests/mocks/fixtures and exact SDK contracts fail | High | Medium | Update the listed writer mocks, actor expectations, duplicate-email tests, direct audit inserts, and SDK contract tests; add a central test-side insert helper |
| Tenant delete/role routes lack a transaction owner | Medium | High | Make mutation services own `runDatabaseTransaction`; correct the stale `03-03` assignment durability claim |
| CLI user history displays client-controlled actor names | Low | Medium | Validate `actorClientName`/`actorClientId` with the terminal-safety helper; sanitize at render; degrade to a placeholder |
| Plan is outside the feature roadmap or based on a stale branch | High | Medium | Promote to `codeops/features/tenant-user-management`, add `T-01`, and branch from an up-to-date `origin/develop` |
