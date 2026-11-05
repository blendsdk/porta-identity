# Policy and Storage

> **Authority**: R1/R2/R6/R9/R12; AR-15/16/18/20

## Schema

Add037_service_account_invitations.sql. Add users.is_service_account BOOLEAN NOT NULL DEFAULT FALSE.
It is server-owned and is never a create/update/import input. Add client_service_accounts with:
UUID id; unique client_id FK clients; unique nullable account_id FK users; UUID authorization_version;
status(active/revoked); native JSONB targets; created_at/updated_at. Require the stored policy to
be an array and keep normal ownership/shape checks in the feature boundary. Preserve permanent
classification when a client/binding is removed. Account deletion atomically revokes the binding,
changes its version and nulls its account reference. Retain that same row as a non-restorable
ownership marker while its client survives; remove account email/policy PII from the marker and
never interpret a null owner as first provisioning. GET/PUT on a lost-owner marker returns the
existing safe409 lifecycle conflict; DELETE remains204 and does not remove the marker. Client
physical deletion may remove its binding after deactivating any surviving owned account. No
ownership reassignment API or separate identity ledger (PF-009).

Seed the canonical reserved role and its sole operation permission for existing installations;
extend fresh init consistently. Do not grant the role to any existing user. Down migration refuses
if any flagged user OR binding/ownership marker survives; otherwise remove only feature-owned
schema/role data safely. It must not cascade-delete unrelated identity records. Apply schema before compatible processes, provision
only after all old HTTP/worker processes are drained, and never deploy old account-unaware code
while these identities exist. No automatic deployment is part of execution.

The downgrade refusal is transaction-atomic, including writers that commit while it waits.
Under runtime AR-23, reject isolation other than READ COMMITTED; acquire ACCESS EXCLUSIVE on
client_service_accounts then users before the existence check, as separate top-level statements.
Retain both locks through DOWN. A fresh post-wait check must observe committed flags/markers;
maintenance advice alone is not the write fence. No retry or universal deadlock-freedom claim.

## Policy interface

New public feature entry packages/server/src/service-accounts/index.ts re-exports focused modules.
types.ts defines ServiceAccountPolicyTarget, ServiceAccountPolicy, SetServiceAccountInput and
ServiceAccountBinding. Policy target fields are exactly organizationId, allowedRoles and
allowedClaimDefinitions from AR-16. Arrays may be empty for ordinary invitations. Set input is
`{accountEmail?: string, targets: ServiceAccountPolicyTarget[]}`; accountEmail is required by the
service on first creation. Binding is the AR-19 response projection; dates use native Date in the
server and ISO strings on the wire. Never expose authorization_version in the projection.

policy.ts exports:

- parseServiceAccountInput(input: unknown): SetServiceAccountInput
- parseServiceAccountTargets(input: unknown): ServiceAccountPolicyTarget[]
- assertInvitationAllowed(targets, organizationId, input): void

`ServiceAccountPolicy` is `{targets: ServiceAccountPolicyTarget[]}`. The assertion takes that target
array, a UUID organization ID and the existing InviteUserInput shape (email/roles/claims); it is
synchronous and returns void or a fixed authorization-domain error. Parser shape/bounds failures
are fixed validation-domain errors, never partially parsed input. ST-8's authoritative control-plane
identity rejection belongs to Phase2's live-reference validation, not a parser fixture constant.

Use strict Zod objects; reject unknown fields, invalid UUIDs, wildcards, duplicate organization IDs
and duplicate application-qualified assignment pairs case-insensitively. Canonicalize UUIDs to
lowercase for comparison/storage. Preserve established email validation; normalize accountEmail
with trim/lowercase for identity comparison. Count assignment pairs across the complete policy,
not separately per target. Empty target sets and over-limit policy are invalid. Definition values
are not policy inputs. JSON policy parsing does not merge untrusted objects into options.

assertInvitationAllowed requires an exact target and every requested assignment pair in that
target's allowlist; absent/empty allowlists grant no assignment authority. It does not make an
existence/authorization claim about definitions: persistence/dispatch checks authoritative live
organization/application/role/claim ownership too. Reject canonical Admin-application references.
Live definitions may change their effective application permissions; there is no permission snapshot.

## Persistence and errors

repository.ts reads authoritative binding state and exposes narrow parent/binding/account lock
helpers, not a generalized repository framework. writes.ts owns feature SQL and transaction-bound
provisioning/update/revoke operations; service.ts owns validated orchestration. Existing nested
transactions and after-commit cache invalidation are reused. Lock order is client → binding →
account, followed by required role/credential rows in stable order. Never trust a route's cached
eligibility check as the mutation guard. Validate all incoming references before changing rows.

The complete initial account/role/binding/credential-retirement/audit operation is atomic. Use
parameterized SQL and database uniqueness constraints to settle concurrent first creations.
Missing/corrupt stored policy never means unrestricted authority or fallback defaults.
Domain errors carry fixed safe messages; new-route HTTP mapping is AR-19. Known transient storage
errors become503; programming errors remain sanitized500. Stale references cannot grant access.

The Phase1 public feature entry exposes `findServiceAccountByClientId(clientId: string):
Promise<StoredServiceAccount | null>` for the authoritative read oracle. StoredServiceAccount is
an internal projection with id, clientId, accountId(string|null), authorizationVersion, status,
targets, createdAt and updatedAt. Its target JSON is validated before returning. An ownerless marker
must be revoked with an empty target array; it is a distinct internal state, not a public successful
binding. The reader never returns raw invalid JSON or falls back to defaults. The existing public
management projection is only constructed for an existing owner. SQL lock helpers remain internal
and are implementation-test targets, not immutable public-oracle dependencies (AR-18, PF-001/009).

## Verification

ST-1–12 own parser/schema/read expectations; durable invalid replacement is ST-61 in Phase2,
not a Phase1 write requirement. Use real Zod/native JSON and real scratch PostgreSQL for
constraints, migration up/down, rollback and uniqueness. No migration rewriting, custom validator
framework or fixed-depth JSON serializer. Execution-task verification selections are in07.
