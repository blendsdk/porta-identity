## Ambiguity Register: Tenant-Scoped M2M User Management

> **Status**: ✅ GATE PASSED — all 25 items resolved
> **Last Updated**: 2026-10-25

| # | Category | Ambiguity / Gap | Options Presented | User Decision | Status |
|---|----------|-----------------|-------------------|---------------|--------|
| AR-1 | Scope | Which user operations must the BFF be able to perform? | Create only / full CRUD plus lifecycle and roles / full Admin parity | Full CRUD plus activate-deactivate and role management. Password, 2FA, export, history, invite preview, and bulk are out of scope. | ✅ Resolved |
| AR-2 | Scope | Should the M2M BFF use a user token, a service client, or both? | Dual actor model / service-client-only for CRUD / user-token-only | Service-client-only for the CRUD surface. The existing tenant invite route remains dual because it is already released. | ✅ Resolved |
| AR-3 | Security | Which OAuth scopes should govern the BFF surface? | One coarse manage scope / three resource scopes / six per-operation scopes | `org:user:read`, `org:user:write`, and `org:user:delete`, plus the existing `org:user:invite`. `write` includes create, update, lifecycle, and role changes. | ✅ Resolved |
| AR-4 | Integration | Should tenant routes mirror the Admin API paths or use new paths? | Mirror the existing paths under `/api` / invent tenant-specific paths | Mirror `POST|GET /api/organizations/:orgId/users` and the user subresources so the existing SDK domains work with `apiPrefix: '/api'`. | ✅ Resolved |
| AR-5 | Security | How many organizations may one tenant client address? | One client per organization / one client across organizations / partner-level grants | One client per organization. A BFF serving multiple organizations needs one client per organization. A multi-org partner model is out of scope. | ✅ Resolved |
| AR-6 | Security | What must be true of the caller before any CRUD operation? | Client identity only / client identity plus active confidential status and organization match / also allow public clients | Client must be active and confidential, belong to the route organization, and carry the required scope in both the token and client metadata. `porta-admin` clients and the super-admin organization are rejected. | ✅ Resolved |
| AR-7 | Security | How should target-user organization mismatches behave? | `403` / `404` / return the foreign user | `404 User not found` for absent, invalid, or foreign-organization users, matching the existing `requireUserOrganization` boundary. List requires an existing organization. | ✅ Resolved |
| AR-8 | Security | What is the role-assignment boundary for a service client? | Allow any role in the organization / allow only roles from the client application / allow only roles the BFF itself holds | Allow only roles owned by the client application. Canonical `porta-admin` roles are rejected. The service path has no delegation ceiling. Role list and effective-permission reads are filtered to the client application. | ✅ Resolved |
| AR-9 | Data | Which profile fields may the BFF create and update? | Minimal email only / full OIDC profile / full Admin parity | Full OIDC profile fields, plus `emailVerified` and `phoneNumberVerified` as explicitly authorized by the user. Email changes, password, status, and 2FA fields remain unavailable. | ✅ Resolved |
| AR-10 | Behavioral | Should create assign roles in the same request? | Atomic create plus roles / separate create and role calls | Separate calls. Create returns the user; the BFF calls the existing `userRoles.assign` endpoint. Atomic create-plus-roles is out of scope. | ✅ Resolved |
| AR-11 | Behavioral | How does a newly created user obtain a first credential? | Create sends an activation email / BFF supplies a password / BFF directs the user to existing login or reset | Create sends no email and accepts no password. The BFF sends its own welcome message and directs the user to the tenant login, magic-link, or forgot-password flow. | ✅ Resolved |
| AR-12 | Behavioral | Is delete soft or permanent? | Deactivate only / permanent delete only / both with separate authority | Both. Deactivate and activate use `org:user:write`. Permanent delete uses the separate `org:user:delete` scope and is irreversible. Routine offboarding should prefer deactivate. | ✅ Resolved |
| AR-13 | Security | Should BFF reads of user data be audited? | Mutations only / audit single-user reads only / audit reads and lists | Audit both `GET /:userId` as `user.read` and `GET /` as `user.listed`, with the service client as actor. List metadata records filters and result count only, never the returned user list. | ✅ Resolved |
| AR-14 | Data | How is a service client represented in the audit log? | Put the client ID only in metadata / add first-class client actor columns / create a synthetic service user | Add first-class `actor_type`, `actor_client_id`, and `actor_client_name` columns. `actor_id` remains null for clients. Never create a synthetic Porta user for the BFF. | ✅ Resolved |
| AR-15 | Data | Should audit rows also identify the affected user? | Metadata only / set the indexed `user_id` column | Set `user_id` on every target-user mutation and read audit row. Backfill existing `user.created` rows from metadata where possible. | ✅ Resolved |
| AR-16 | Security | How durable must mutation audit be? | Best-effort after commit / transaction-bound with the mutation | Create, update, delete, lifecycle, role changes, and invitations commit the mutation and audit row together. Read audit remains best-effort and never blocks a read. | ✅ Resolved |
| AR-17 | Non-functional | What rate limits apply to the new surface? | Reuse 30/hour invite limit / higher write limit with separate delete limit / no new limit | 300 write operations per client and organization per hour; 60 deletes per client and organization per hour. Invite remains 30/hour. No new read limiter is added. | ✅ Resolved |
| AR-18 | Technical | How should the existing invite-specific tenant auth be reused? | Duplicate middleware / generalize the existing middleware and state / create a new auth service | Generalize the existing middleware into a tenant actor resolver with configurable actor kinds, required scope, and required permission. Rename `tenantInviteActor` to `tenantActor`. Keep the invite route's dual actor behavior. | ✅ Resolved |
| AR-19 | Technical | Where should the tenant CRUD router live? | Add routes to `tenant-invitations.ts` / create `tenant-users.ts` and retire the invite-only router | Create `routes/tenant-users.ts`, move the invite route into it, and mount one tenant user router. Update server and test imports. | ✅ Resolved |
| AR-20 | Data | Which validation schema should create and update use? | Duplicate schemas / extract shared schemas and add tenant variants | Extract the shared create/update schemas, add `emailVerified`, and build a tenant create schema that rejects `password`. Admin accepts the additive `emailVerified` field but keeps its duplicate-email `400`, existing authorization, and existing route behavior; only the tenant duplicate-email response is `409`. Require a phone number when `phoneNumberVerified` is true. | ✅ Resolved |
| AR-21 | Data | What is the audit migration and backfill? | No migration, metadata only / new migration with first-class columns and backfill / rewrite the audit table | Migration `034_audit_client_actor.sql`: add the three actor columns, backfill from existing metadata and `userId`, add the actor check constraint and client index, and update every direct audit insert. The migration performs a full-table `actor_type` update and `SET NOT NULL` under the migration transaction; deployment requires a maintenance window and backup. Historical rows whose actor user was deleted are classified `system`; future deletions retain `actor_type='user'`. | ✅ Resolved |
| AR-22 | Integration | What must change in the SDK, CLI, and documentation? | New SDK methods / reuse existing domains and update types/docs / server-only change | Reuse existing SDK domains and `apiPrefix: '/api'`. Add optional `emailVerified` and `phoneNumberVerified` types, add client actor fields to audit/history types, update the exact input-type contracts and remove the old negative assertions, update the CLI audit/history display with terminal-safe client actor handling, and update public docs and techdocs. | ✅ Resolved |
| AR-23 | Non-functional | What verification gates apply? | Unit tests only / focused suites plus full verify / add a new assurance harness profile | Focused unit, integration, pentest, structure, SDK, CLI, and docs gates; final `yarn verify`; `yarn assurance:harness --project security --profile production-security` recorded against the accepted incomplete-observer baseline (expected exit 40; no new gaps or failed assertions; never call it fully passed); and the registered `yarn assurance:compat --select tenant-admin` from a clean committed revision. No new harness profile. | ✅ Resolved |
| AR-24 | Naming | What are the stable names for the plan, scopes, routes, and audit fields? | Free-form names / follow existing `org:user:*` and `/api/organizations/:orgId/users` conventions | Plan `tenant-m2m-user-management`; scopes `org:user:read|write|delete`; router `routes/tenant-users.ts`; audit fields `actor_type`, `actor_client_id`, `actor_client_name`; events `user.read` and `user.listed` in addition to existing `user.*` mutation events. | ✅ Resolved |
| AR-25 | Technical (runtime) | How should tenant denials satisfy the ST-51 security instrumentation requirement? | Add an additive `tenant-api` surface to the existing security decision event / document tenant exclusion and assert no event | Add the additive `tenant-api` surface, classify `/api/organizations/*`, and prove one end-to-end tenant denial event with protected actor/tenant references. Existing admin and public-auth behavior is unchanged. | ✅ Resolved — Authority: AI — delegated by `--auto-design` |

### Resolution Notes

**AR-1:** The user asked for CRUD plus "such"; the confirmed boundary is CRUD, lifecycle, and roles. Credential and bulk operations remain separate future work.

**AR-2 / AR-3 / AR-6:** The BFF only holds a client ID and secret. It obtains a short-lived `client_credentials` token from the tenant token endpoint. It does not hold a user token or a control-plane account.

**AR-9:** The user explicitly chose to allow both `emailVerified` and `phoneNumberVerified`. This is a trust decision: the BFF is asserting that it verified those values. The audit trail records the assertion as part of the mutation.

**AR-13:** Read auditing covers the user PII surface. Role reads are not audited in this slice because they expose authorization metadata, not profile PII.

**AR-14 / AR-16:** The audit column and transaction work is the prerequisite that makes the M2M surface accountable. The existing invite audit metadata pattern is retained only for historical rows and backfilled into the new columns.

**AR-21:** Latest applied migration is `033_invitation_deferred_user_creation.sql`; the new migration is `034`. Applied migrations are never rewritten.

**AR-23:** `yarn verify` is the project's authoritative full verification command from `AGENTS.md`. Integration, pentest, harness, and compatibility commands require PostgreSQL, Redis, MailHog, and Docker and must use the repository-owned lifecycle/cleanup commands.

**AR-20 / AR-21 / AR-23 (preflight 2026-10-25):** The preflight narrowed the Admin duplicate-email
change to the tenant surface, documented the audit migration's full-table update/lock and accepted
historical `system` classification, and replaced the harness "passes" wording with an accepted
baseline result. Durable evidence and the remaining decisions are in
`00-preflight-report.md`.

**AR-25 (runtime, Phase 1 review):**
- Authority: AI — delegated by `--auto-design`; policy version 1; root invocation ID `ep-tenant-m2m-20261025-01`.
- Eligibility: security mechanism within the approved instrumentation requirement; no product-scope or reserved-authority change.
- Objective: make the ST-51 tenant decision/reference claims observable at the existing event boundary.
- Decision: add the additive `tenant-api` surface and classify `/api/organizations/*`.
- Evidence: Phase 1 review SA-001; `finalizeSecurityDecision` returned `null` for tenant paths; the closed surface enum and docs covered only admin/auth.
- Rejected alternatives: documenting exclusion and asserting no event (contradicts ST-51's emitted claim); a separate tenant event schema (unnecessary support surface).
- Strongest counterargument: the event surface is a documented closed contract and consumers may not recognize a new value.
- Confidence: High — the change is additive; admin and public-auth classification and behavior are unchanged.
- Hardening: independent security auditor identified the gap; the fix is subject to the phase re-review.
- Reopen triggers: an external consumer rejects unknown surface values; the event contract is declared closed to new surfaces; assurance evidence requires no tenant events.
