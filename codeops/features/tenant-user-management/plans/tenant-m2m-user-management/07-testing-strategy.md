# Testing Strategy: Tenant-Scoped M2M User Management

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

| Code type | Target |
| --- | --- |
| Tenant auth, route contracts, audit mapping | 90% |
| User services and role boundary | 90% |
| SDK types and domain paths | 85% |
| CLI display and documentation | 80% |
| Migration and backfill | 90% |

- Test names state behavior: `should [expected behavior] when [condition]`.
- Integration tests exercise real PostgreSQL, Redis, and the tenant client credentials flow.
- Browser E2E is `N/A`: this change adds an authenticated M2M API and CLI display, with no browser or OIDC interaction changes. Integration and pentest cover the new surface.
- The Phase 2 route-level live suite substitutes the provider token lookup to isolate route behavior. The Phase 5 handoff runs one real tenant `client_credentials` create/update/delete cycle.
- Browser UI tests are `N/A` for the same reason; the Admin UI is the embedded terminal application, and its audit/history display is covered by CLI tests.

## 🚨 Specification Test Cases (MANDATORY — NON-NEGOTIABLE)

> These cases are derived from `01-requirements.md`, the component specs, and the Ambiguity Register. They define expected behavior before implementation. The immutable-oracle rule applies: if the implementation does not match, fix the implementation, not the test.

### Tenant authentication and scopes

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-1 | Active confidential tenant client with `org:user:read`, valid token, `GET /api/organizations/:orgId/users` | `200` with only that organization's users | R1, R2 / AR-3, AR-6 |
| ST-2 | Same client, token without `org:user:read` | `403` fixed forbidden response | R2 / AR-3 |
| ST-3 | Valid tenant user access token with `org:user:read` permission calls a CRUD route | `403`; CRUD is service-only | R1 / AR-2 |
| ST-4 | Service client from organization A calls organization B's route | `403` fixed forbidden response | R1 / AR-5, AR-6 |
| ST-5 | Client linked to `porta-admin` or route organization is the super-admin organization | `403` fixed forbidden response | R1 / AR-6 |
| ST-6 | Inactive or public client exchanges credentials | `403`; no tenant actor is set | R1 / AR-6 |
| ST-7 | Missing, malformed, or empty bearer token | `401` fixed authentication response | R1 / AR-6 |
| ST-8 | Valid service token on `POST /invite` with `org:user:invite` | Existing invite behavior remains `201` | R9 / AR-2 |
| ST-9 | Tenant user token on `POST /invite` with the invite permission | Existing invite behavior remains `201` | R9 / AR-2 |

### Create

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-10 | Create with full profile, `emailVerified: true`, `phoneNumberVerified: true`, and a phone number | `201`; every supplied field persisted; ETag returned | R3 / AR-9 |
| ST-11 | Create with `password` in the body | `400`; no user row created | R3 / AR-20 |
| ST-12 | Create with `phoneNumberVerified: true` and no phone number | `400`; no user row created | R3 / AR-20 |
| ST-13 | Create with an email already used in the organization | `409`; no second user row created. The Admin route keeps its existing `400` response. | R3 / AR-7, AR-20 |
| ST-14 | Create with a service token lacking `org:user:write` | `403`; no user row created | R2 / AR-3 |
| ST-15 | Create with a foreign `organizationId` in the body and the route org in the path | `201` in the path organization; the body organization is ignored | R1, R3 / AR-4, AR-6 |

### Read and list

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-16 | List with page/pageSize/search/status/sort in organization A | `200`; only A users; pagination metadata matches the existing Admin behavior | R4 / AR-4 |
| ST-17 | Get an existing user in the route organization | `200`; full profile; ETag header | R4 / AR-7 |
| ST-18 | Get a user that exists in another organization | `404 User not found`, indistinguishable from a missing user | R4 / AR-7 |
| ST-19 | Get with a token lacking `org:user:read` | `403`; no profile returned | R2 / AR-3 |
| ST-20 | Get and list as a valid tenant client | `user.read` and `user.listed` audit rows with client actor; list metadata has no user IDs or profile values | R11 / AR-13 |

### Update

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-21 | Update profile fields, `emailVerified`, and `phoneNumberVerified` with a valid phone | `200`; fields persisted; new ETag | R5 / AR-9 |
| ST-22 | Update with `email`, `status`, `password`, or 2FA fields | `400`; no field changed | R5 / AR-20 |
| ST-23 | Update a user in another organization | `404`; no field changed | R5 / AR-7 |
| ST-24 | Update with `phoneNumberVerified: true` and no phone in the request or stored user | `400`; no field changed | R5 / AR-20 |
| ST-25 | Update with a stale `If-Match` | `409`; no field changed | R5 / AR-4, AR-26 |
| ST-26 | Update with a token lacking `org:user:write` | `403`; no field changed | R2 / AR-3 |

### Delete and lifecycle

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-27 | Delete a user with `org:user:delete` | `204`; user row gone; existing session/token revocation occurs; `user.deleted` audit remains | R6 / AR-12 |
| ST-28 | Delete with only `org:user:write` | `403`; user remains | R6 / AR-3, AR-12 |
| ST-29 | Delete a foreign-organization user, repeat a completed delete, or use an invalid UUID | `404`; no information leak | R6 / AR-7 |
| ST-30 | Deactivate an active user, then activate the inactive user | `204` each; status becomes inactive then active; audit events recorded | R7 / AR-12 |
| ST-31 | Deactivate an already inactive user, or activate an active user | `400`; status unchanged | R7 / AR-12 |

### Roles

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-32 | List roles for a user who has roles in the client app and another app | `200`; only the client-app roles returned | R8 / AR-8 |
| ST-33 | Assign a role owned by the client application | `204`; assignment exists; `user.roles.assigned` audit has client actor and target user | R8 / AR-8, AR-16 |
| ST-34 | Assign a role owned by another application or a canonical `porta-admin` role | `400` via `RoleApplicationBoundaryError`; no assignment created | R8 / AR-8 |
| ST-35 | Get effective permissions for a user with roles in multiple applications | `200`; only permissions from the client-app roles returned | R8 / AR-8 |
| ST-36 | Remove a role owned by another application | `400` via `RoleApplicationBoundaryError`; existing assignment unchanged | R8 / AR-8 |
| ST-37 | Role read with only `org:user:write` and no read scope | `403`; no role data returned | R2 / AR-3 |

### Audit and durability

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-38 | Create, update, deactivate, activate, delete, or assign/remove a role as a service client | One audit row per mutation with `actor_type=client`, `actor_client_id`, `actor_client_name`, `actor_id=null`, target `user_id`, organization, and IP/user-agent | R10 / AR-14, AR-16 |
| ST-39 | Delete a user and inspect the audit log | `user.deleted` row remains; client actor fields remain; `user_id` may be null under the FK; metadata preserves the deleted user's email/ID | R10 / AR-12, AR-14 |
| ST-40 | Invite a user as a service client | `user.invited` row has first-class client actor fields; no user row created by the invite | R9, R10 / AR-14, AR-16 |
| ST-41 | Force the audit insert to fail during a create/update/delete/lifecycle/role/invite mutation | The mutation or invitation insert rolls back; no unaudited success | R10 / AR-16 |
| ST-42 | Force the audit insert to fail during a read | The read still returns its result; a bounded warning is logged | R11 / AR-13 |

### Rate limiting

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-43 | 301st write operation in an hour for one client/org | `429`, `Retry-After`, no mutation | R12 / AR-17 |
| ST-44 | 61st delete in an hour for one client/org | `429`, `Retry-After`, no deletion | R12 / AR-17 |
| ST-45 | 31st invite in an hour for one actor/org | `429`; existing invite limit unchanged | R12 / AR-17 |

### Migration, SDK, and CLI

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-46 | Apply migration `034` to rows containing `serviceClientId` metadata, live user actor IDs, `user.created` metadata, and a row whose actor user was deleted | Client rows have `actor_type=client` and client ID; live user rows have `actor_type=user`; target `user_id` is backfilled when valid; system rows and historical deleted-actor rows are `system`; constraint/index exist | R16 / AR-21 |
| ST-47 | SDK client with `apiPrefix: '/api'` calls create/list/get/update/delete/lifecycle and userRoles | Requests target `/api/organizations/:orgId/users...`; no Admin prefix is used | R13 / AR-4, AR-22 |
| ST-48 | SDK types receive audit/history responses with client fields | Optional client fields type-check and are returned unchanged | R13 / AR-14, AR-22 |
| ST-49 | CLI audit list and user history receive a client actor row | Display shows the client name/ID; user rows still show the user ID; missing actor shows `—`/`System` as appropriate | R14 / AR-22 |
| ST-50 | Public docs and techdocs are built | `yarn docs:build` passes; links resolve | R15 / AR-23 |
| ST-51 | Valid and invalid tenant auth requests exercise the generalized middleware | The same security decision points and actor/tenant references are emitted as before the refactor | R1, R2 / AR-6 |
| ST-52 | CLI user history receives a client actor name containing terminal control characters | The history page renders with a safe placeholder; no control characters reach the terminal | R14 / AR-22 |

## Test Categories

### Specification Tests

| Test File | ST Cases Covered | Component |
| --- | --- | --- |
| `packages/server/tests/unit/middleware/tenant-user-auth.spec.test.ts` | ST-1–ST-9, ST-51 | Tenant auth/scopes; decision instrumentation |
| `packages/server/tests/unit/routes/tenant-users.spec.test.ts` | ST-10–ST-31 | CRUD/lifecycle contracts |
| `packages/server/tests/unit/rbac/tenant-user-roles.spec.test.ts` | ST-32–ST-37 | Role boundary |
| `packages/server/tests/unit/lib/audit-client-actor.spec.test.ts` | ST-38–ST-42 | Audit mapping/durability |
| `packages/server/tests/integration/migrations/034-audit-client-actor.spec.test.ts` | ST-46 | Migration/backfill |
| `packages/server/tests/integration/security/tenant-user-management.spec.test.ts` | ST-1–ST-46 | Live tenant API |
| `packages/server/tests/pentest/admin-security/tenant-user-boundary.spec.test.ts` | ST-1–ST-9, ST-22, ST-28, ST-34, ST-36 | Scope/tenant/role attacks |
| `packages/sdk/tests/type-contracts/tenant-user-management.spec.test.ts` | ST-47, ST-48 | SDK contracts |
| `packages/sdk/tests/domains/tenant-user-paths.spec.test.ts` | ST-47 | SDK paths |
| `packages/cli/tests/commands/audit-client-actor.spec.test.ts` | ST-49 | CLI audit display |
| `packages/cli/tests/admin/user-service-client-actor.spec.test.ts` | ST-49, ST-52 | CLI history display and terminal safety |

### Implementation Tests

| Test File | Description | Priority |
| --- | --- | --- |
| `packages/server/tests/unit/middleware/tenant-user-auth.impl.test.ts` | Token lookup order, provider failure, rate-limit keys, state isolation | High |
| `packages/server/tests/unit/routes/tenant-users.impl.test.ts` | Validation edge cases, ETag formatting, error mapping, body organization mismatch | High |
| `packages/server/tests/unit/rbac/tenant-user-roles.impl.test.ts` | Duplicate role IDs, empty arrays, role-not-found, cross-application removal | High |
| `packages/server/tests/unit/lib/audit-client-actor.impl.test.ts` | Actor normalization, SQL parameter shape, metadata sanitization | High |
| `packages/server/tests/integration/migrations/034-audit-client-actor.impl.test.ts` | Malformed metadata, down migration, index/constraint names | Medium |
| `packages/sdk/tests/type-contracts/tenant-user-management.impl.test.ts` | Optional-field compatibility, no breaking Admin types | Medium |
| `packages/cli/tests/commands/audit-client-actor.impl.test.ts` | Client name-only, ID-only, missing actor, user actor | Medium |

### Existing Test Updates

These files must be updated in the same change; they are not optional cleanups.

| File | Required update |
| --- | --- |
| `packages/server/tests/unit/lib/audit-log.test.ts` | New SQL columns and parameter order; assertion on `actor_type` normalization |
| `packages/server/tests/unit/users/service.test.ts` | Typed `AuditActor`, transaction-bound writer mocks, duplicate `UserEmailConflictError` |
| `packages/server/tests/unit/users/invite-service.spec.test.ts` | Keep `InviteActor`; transaction-bound audit; client actor fields |
| `packages/server/tests/unit/middleware/tenant-invite-auth.spec.test.ts` | Rename/update to `tenant-user-auth.spec.test.ts`; new state key, actor kinds, and instrumentation cases |
| `packages/server/tests/unit/routes/tenant-invitations.spec.test.ts` | Move invite cases to `tenant-users.spec.test.ts`; update router import and state key |
| `packages/server/tests/unit/rbac/user-role-service.test.ts` | Options object, service actor `assigned_by=null`, transaction-bound assignment audit, boundary error |
| `packages/server/tests/unit/routes/users.test.ts` | Admin duplicate email remains `400`; Admin lifecycle actor propagation |
| `packages/server/tests/unit/routes/user-roles.test.ts` | Admin actor options object and boundary error |
| `packages/server/tests/integration/migrations.test.ts` | Direct audit insert includes `actor_type` |
| `packages/server/tests/integration/repositories/audit-log.repo.test.ts` | Direct inserts include `actor_type` |
| `packages/server/tests/integration/admin/record-deletion.spec.test.ts` | Direct insert includes `actor_type`; delete service actor type |
| `packages/server/tests/integration/admin/portability-round-trip.spec.test.ts` | Direct insert includes `actor_type` |
| `packages/server/tests/integration/rbac/authority-mutations.spec.test.ts` | Service role actor options object |
| `packages/server/tests/integration/rbac/permission-deletion-concurrency.impl.test.ts` | Service role actor options object |
| `packages/server/tests/unit/admin/administrative-data-production-driver.ts` | Direct insert includes `actor_type` |
| `packages/sdk/tests/type-contracts/users-contract.spec.test.ts` | Exact input shapes; remove/replace old negative `phoneNumberVerified`/`emailVerified` assertions |

Add a test-only audit insert helper so future fixtures cannot omit `actor_type`.

### Integration Tests

| Test | Components | Description |
| --- | --- | --- |
| Tenant client credentials exchange | OIDC provider, client service, tenant routes | Real token from the tenant endpoint; all CRUD operations |
| Tenant isolation | Two orgs, two apps, two clients | Cross-org reads/writes/deletes return 404/403; roles cannot cross apps |
| Audit durability | PostgreSQL, audit writer, user services | Mutation and audit commit together; read audit is best-effort |
| Tenant mutation transactions | Tenant delete/role routes, audit writer | Service-owned transactions commit mutation + audit or roll back both |
| Role filtering | RBAC service, user-role routes | List/effective permissions filtered to client app |
| Delete revocation | User deletion service, OIDC payloads | Sessions/tokens revoked; audit row survives |
| Rate limits | Redis limiter, tenant routes | 429 after the configured allowance |
| Admin regression | Admin routes, standalone routes, shared services | Admin actor is recorded for create/update/lifecycle; permissions, duplicate `400`, and behavior unchanged; CLI bootstrap uses `system` |

**Rate and audit-failure coverage note:** ST-43–ST-45 allowance thresholds are verified through the shared Redis limiter tests plus the tenant limiter key/429 tests, not by running 300+/60+/30+ request loops in integration. ST-41 audit-failure rollback is proven for create/update and invitation; delete, lifecycle, and role mutations share the same service-owned transaction writer and have focused rejection tests plus the live transaction suites.

### End-to-End Tests

`N/A` — no browser flow or OIDC interaction changes. The new API is exercised by integration and pentest. The created user's first login remains the existing login/magic-link/reset flow, which is covered by the existing suites.

## Test Data

### Fixtures Needed

- Two organizations: tenant A and tenant B; one super-admin organization.
- Tenant application for A and B; a `porta-admin` application.
- Roles in the tenant application and in a second application; one canonical `porta-admin` role.
- Confidential tenant clients in A and B with `client_credentials`, `client_secret_post`, and the new scopes.
- One tenant user in A with an invite permission for the invite regression.
- Existing user rows for list/get/update/delete, including a user with roles in two applications.
- Audit rows with legacy service metadata, live user-created metadata, and a historical row whose actor user was deleted.
- A tenant client whose display name contains terminal control characters for the CLI safety case.
- A verified pre-migration backup and maintenance-window record for the migration gate.

### Mock Requirements

- Use real PostgreSQL and Redis for integration/pentest.
- Use the existing mail boundary only for invite regression; create sends no email.
- Inject audit-write failure only in focused unit/integration tests.
- Do not mock tenant isolation or the database in pentest.

## Verification Checklist

- [ ] All specification test cases (ST-*) are defined with concrete input/output pairs.
- [ ] Every ST case traces to a requirement, spec document, or AR entry.
- [ ] Specification tests are written before implementation.
- [ ] Specification tests are verified to fail before implementation (red phase).
- [ ] All specification tests pass after implementation (green phase).
- [ ] Implementation tests cover edge cases, internals, and error paths.
- [ ] All unit, integration, and pentest suites pass.
- [ ] All existing tests in the “Existing Test Updates” table are updated and pass; no regressions in Admin, invite, SDK, or CLI tests.
- [ ] Tenant delete/role transactions commit mutation + audit or roll back both.
- [ ] Admin and standalone create/update/lifecycle tests record the admin actor; CLI bootstrap records `system`.
- [ ] The migration has a recorded maintenance window, pre-migration backup, and post-migration verification.
- [ ] `yarn test:structure` passes.
- [ ] `yarn workspace @portaidentity/sdk verify` and `yarn workspace @portaidentity/cli verify` pass.
- [ ] `yarn docs:build` passes.
- [ ] `yarn verify` passes.
- [ ] `yarn assurance:harness --project security --profile production-security` is recorded against the accepted incomplete-observer baseline: run ID, observer IDs, exit code (expected `40`), no new observer-set difference, no new gap, and no failed assertion. It is never described as fully passed.
- [ ] `yarn assurance:compat --select tenant-admin` passes from a clean committed revision.
- [ ] No dead code or duplicate tenant auth implementation remains.
