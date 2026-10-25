# Requirements: Tenant-Scoped M2M User Management

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)

## Feature Overview

External tenant BFFs must manage users in their own organization with only a configured `client_id` and `client_secret`. The BFF obtains a short-lived `client_credentials` token and uses it against a tenant-scoped user API. No super-admin user, refresh token, or control-plane service account is involved at runtime.

The surface covers create, list, get, update profile and verification flags, permanent delete, activate/deactivate, and role management. It reuses the Admin API path shapes and the existing SDK domains so `apiPrefix: '/api'` selects the tenant API.

## Functional Requirements

### Must Have

- [ ] R1 — A tenant service client can authenticate with `client_credentials` and call the tenant user API only when it is active, confidential, belongs to the route organization, is not the `porta-admin` client, and the route organization is not the super-admin organization.
- [ ] R2 — A service token must carry the route's required scope, and the client's configured scope must include it. The scopes are `org:user:read`, `org:user:write`, `org:user:delete`, plus the existing `org:user:invite`.
- [ ] R3 — `POST /api/organizations/:orgId/users` creates a user with the full OIDC profile, including optional `emailVerified` and `phoneNumberVerified`. It accepts no password. A `phoneNumberVerified: true` value requires a phone number. Duplicate email in the organization returns `409`.
- [ ] R4 — `GET /api/organizations/:orgId/users` lists users in the organization with the existing pagination, search, status, and sort behavior. `GET /api/organizations/:orgId/users/:userId` returns one user and an ETag. Foreign-organization and missing users return the same `404`.
- [ ] R5 — `PUT /api/organizations/:orgId/users/:userId` updates profile fields and the two verification flags. It does not allow email, password, status, or 2FA changes. Optional `If-Match` behavior matches the Admin route.
- [ ] R6 — `DELETE /api/organizations/:orgId/users/:userId` permanently deletes the user and returns `204`. It requires `org:user:delete`. A repeated or foreign-tenant delete returns `404`. Existing session and token revocation behavior is preserved.
- [ ] R7 — `POST .../:userId/deactivate` and `POST .../:userId/activate` change status and require `org:user:write`. They preserve the existing lifecycle behavior.
- [ ] R8 — `GET .../:userId/roles` returns only roles from the caller client's application. `PUT` and `DELETE .../:userId/roles` accept only role IDs from that application. `GET .../:userId/roles/permissions` returns only permissions contributed by that application's roles. Canonical `porta-admin` roles are rejected.
- [ ] R9 — The existing tenant invite route remains behaviorally compatible, remains available to service clients and tenant users, and is moved into the same tenant user router.
- [ ] R10 — Every tenant M2M mutation that has a target user writes one durable audit row with first-class client attribution: `actor_type=client`, `actor_client_id`, `actor_client_name`, `actor_id=null`, and the target `user_id`. Create, update, delete, lifecycle, and role changes commit the audit row with the mutation. Invitations have no user yet and record the invitation ID in metadata; invitation acceptance remains the existing best-effort `user.created` flow and is outside this plan's mutation scope.
- [ ] R11 — User reads are audited: `GET /:userId` writes `user.read`; `GET /` writes `user.listed` with filters and result count only. Read audit is best-effort and never blocks the read.
- [ ] R12 — Write operations are limited to 300 per client and organization per hour. Deletes are limited to 60 per client and organization per hour. Invite remains at 30 per actor and organization per hour. The response uses `429` and `Retry-After` when exceeded.
- [ ] R13 — The SDK exposes the new fields through the existing `users` and `userRoles` domains with `apiPrefix: '/api'`; no new SDK method is required.
- [ ] R14 — The CLI audit list and user history display a client actor as a readable client name/ID instead of an empty actor or `System`.
- [ ] R15 — Public API docs, SDK README, and relevant techdocs describe the tenant M2M surface, scopes, client configuration, audit attribution, and first-credential flow.
- [ ] R16 — Migration `034_audit_client_actor.sql` adds the actor columns, backfills existing client and target-user attribution, enforces the actor shape, and indexes client IDs. Every direct audit insert is updated.

### Should Have

- [ ] R17 — The tenant user router reuses shared auth, error mapping, and rate-limit helpers rather than duplicating the invite implementation.
- [ ] R18 — Existing Admin user mutations pass their admin actor into the shared audit-aware services so the audit gap is closed for both surfaces. This includes create, update, and lifecycle operations in both the organization-scoped and standalone Admin routers; delete already passes the actor; password and dedicated email-verification routes remain their existing flows. CLI bootstrap uses the `system` actor.

### Won't Have (Out of Scope)

- Setting or clearing passwords.
- Changing a user's email address.
- Email-verification and 2FA management endpoints.
- GDPR export, user history, and invite-preview routes on the tenant surface.
- Bulk create, update, delete, or status changes.
- Tenant user-token access to the CRUD surface.
- A multi-organization partner client or dynamic client registration.
- New Admin UI screens or browser UI.
- New audit filters, audit cleanup changes, or audit retention changes.
- New dependencies, workers, queues, or infrastructure.

## Technical Requirements

### Security

- Tenant isolation is enforced in the authentication boundary, the route target-user guard, and every database query.
- Client secrets are never logged or returned. Access tokens are short-lived and cached by the SDK.
- The tenant route rejects control-plane clients, the super-admin organization, public clients, inactive clients, and cross-organization targets.
- Role assignment cannot cross the client application boundary. Role list and effective-permission reads are filtered to the client application.
- All input is validated with Zod on the server. SQL remains parameterized.
- Error responses are fixed and sanitized; no stack traces, SQL errors, or cross-tenant existence signals.
- Audit rows never contain passwords, tokens, client secrets, or unsalted sensitive values.
- The BFF's `emailVerified` and `phoneNumberVerified` assertions are recorded as part of the mutation audit.

### Compatibility

- Existing Admin authorization and duplicate-email `400` behavior remain unchanged. Admin accepts the additive `emailVerified` field, and its create/update/lifecycle mutations pass the admin actor. Only the tenant duplicate-email response is `409`.
- Existing tenant invite behavior, response shape, scope, and email flow remain compatible.
- The SDK change is additive: new optional input fields and new audit/history response fields. The exact input-type contracts and the old negative type assertions are updated in the same change.
- Applied migrations are never rewritten. The new migration is `034`.
- The OIDC provider's supported scope list is extended; all Porta instances must restart after deployment.

### Performance and Availability

- Read routes reuse the existing pagination and user caches.
- Write and delete limits use the existing Redis-backed rate limiter.
- Audit read events are best-effort and do not add a second transaction to reads.
- The migration adds columns, updates every audit row to set `actor_type`, and applies `NOT NULL` under the migration transaction. It requires a documented maintenance window, a pre-migration backup, post-migration verification, and a full stop/upgrade of every server instance before applying it. Historical rows whose actor user was deleted are classified `system`; future actor deletions retain `actor_type='user'`. Applied migrations are never rewritten.

### Verification

- Focused unit, integration, and pentest suites pass.
- `yarn test:structure` passes.
- SDK and CLI workspace verification passes.
- `yarn docs:build` passes.
- `yarn verify` passes.
- `yarn assurance:harness --project security --profile production-security` runs against the recorded accepted incomplete-observer baseline. Record the run ID, observer IDs, and exit code (expected `40`); require no new observer-set difference, new gap, or failed assertion, and never describe the run as fully passed.
- `yarn assurance:compat --select tenant-admin` passes from a clean committed revision.

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
| --- | --- | --- | --- | --- |
| Operation set | Create only; CRUD; full Admin parity | CRUD + lifecycle + roles | Matches the BFF's actual user-management need without credential or bulk scope | AR-1 |
| Actor model | Dual; service-only; user-only | Service-only CRUD | The BFF has only client credentials; avoids a destructive user-token delegation model | AR-2 |
| Scope granularity | Coarse; three scopes; six scopes | Three scopes plus invite | Separates read, write, and destructive delete without excessive configuration | AR-3 |
| Route shape | New paths; mirror Admin | Mirror Admin | Existing SDK domains work with `apiPrefix: '/api'` | AR-4 |
| Organization scope | One client per org; multi-org | One client per org | Preserves the existing tenant boundary | AR-5 |
| Role boundary | Any org role; client-app roles | Client-app roles | Prevents cross-application authority | AR-8 |
| Verification flags | Profile only; allow flags | Allow email and phone flags | Explicit user decision; BFF is trusted to assert verification | AR-9 |
| Create plus roles | Atomic; separate | Separate | Smaller create contract; reuses `userRoles.assign` | AR-10 |
| First credential | Activation email; BFF password; BFF directs | BFF directs to existing login/reset | No password known to the BFF; no new email path | AR-11 |
| Delete | Deactivate only; delete only; both | Both with separate delete scope | Routine offboarding is reversible; erasure is explicitly authorized | AR-12 |
| Read audit | None; get only; get and list | Get and list | Covers PII access without recording returned user lists | AR-13 |
| Audit actor | Metadata only; first-class columns | First-class client columns | CRUD requires queryable, durable client accountability | AR-14 |
| Audit durability | Best-effort; transaction-bound | Transaction-bound mutations | A successful mutation cannot be unaudited | AR-16 |
| Rate limits | 30/hour; 300/60; none | 300 writes, 60 deletes | Supports BFF volume while bounding abuse | AR-17 |
| Verification gates | Unit only; full verify; new harness | Existing full gates | Reuses the project's authoritative gates | AR-23 |

> **Traceability:** Every scope decision references the Ambiguity Register entry that resolved it. See `00-ambiguity-register.md`.

## Acceptance Criteria

1. [ ] A tenant BFF with a client ID and secret can create, list, get, update, deactivate, reactivate, and permanently delete a user in its own organization without a control-plane account.
2. [ ] A BFF cannot read or mutate a user in another organization; the response is the same `404` as a missing user.
3. [ ] A BFF cannot assign a role from another application or a canonical `porta-admin` role.
4. [ ] A BFF cannot call create or update with a password; a BFF can set `emailVerified` and `phoneNumberVerified`, and a verified phone requires a phone number.
5. [ ] Every tenant M2M mutation with a target user produces a durable audit row naming the OAuth client as actor and the target user as `user_id`; invitations record the invitation ID because no user exists yet.
6. [ ] Reading one user and listing users produce `user.read` and `user.listed` audit events with the client actor and no returned list contents.
7. [ ] All required verification commands in `07-testing-strategy.md` pass, and the production-security harness is recorded against the accepted incomplete-observer baseline rather than described as fully passed.
8. [ ] Documentation and techdocs are updated and `yarn docs:build` passes.
9. [ ] No dead code or duplicate tenant auth implementation remains.
