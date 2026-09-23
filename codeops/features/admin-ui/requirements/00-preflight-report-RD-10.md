# Preflight Report: RD-10 — Application, Module, and OIDC Client Deletion

> **Status**: ✅ PREFLIGHT PASSED — all 11 findings resolved
> **Iteration**: 3 (bounded verification after accepted iteration-2 fixes)
> **Previous Iteration**: 1 critical, 8 major, and 2 minor findings
> **This Iteration**: No new critical or major findings
> **Carried Forward**: None
> **Artifact**: Single requirement at `codeops/features/admin-ui/requirements/RD-10-application-module-client-deletion.md`
> **Artifact SHA-256**: `5640d6af41d079d26f0e514d9b577bdc523beaf5a87cc77a9c1dcdc0a6752431`
> **Audit Target**: RD-10 only
> **Context Documents**: requirements ambiguity register, requirements index, RD-04, and feature roadmap
> **Modification Set**: RD-10 accepted corrections; report and continuity workflow artifacts
> **Product Scope**: Strict — the approved RD-10 deletion capability only
> **Codebase Grounded**: 27 source/migration files examined, 25 material references verified
> **Last Updated**: 2026-09-05 18:58 CEST

> **SAME-SESSION REVIEW:** RD-10 was created and reviewed in this session. Same-agent bias risk is
> elevated. Independent clustered auditors and one blind recommendation challenger were used. A
> human identity/security review remains advisable before implementation.

## Codebase Context Summary

**Tech Stack:** Node.js TypeScript ESM monorepo; Koa Admin API; PostgreSQL; Redis;
`oidc-provider`; public SDK transports; JSVision terminal Admin UI.

**Architecture:** Applications, modules, clients, roles, permissions, and claims are relational.
Long-lived OIDC artifacts use PostgreSQL, while sessions, interactions, authorization codes,
client-credentials artifacts, replay detection, and pushed authorization requests use Redis.
`admin_sessions` is a best-effort PostgreSQL mirror rather than the authority for live sessions.

**Key Files Examined:**

- `packages/server/src/routes/applications.ts`
- `packages/server/src/routes/clients.ts`
- `packages/server/src/applications/service.ts`
- `packages/server/src/clients/service.ts`
- `packages/server/src/clients/cache.ts`
- `packages/server/src/oidc/adapter-factory.ts`
- `packages/server/src/oidc/postgres-adapter.ts`
- `packages/server/src/oidc/redis-adapter.ts`
- `packages/server/src/lib/session-tracking.ts`
- `packages/server/src/lib/database.ts`
- `packages/server/src/lib/audit-log.ts`
- `packages/server/src/middleware/admin-mutation-audit.ts`
- `packages/server/src/lib/admin-permissions.ts`
- `packages/server/src/rbac/cache.ts`
- `packages/server/src/rbac/user-role-service.ts`
- `packages/server/src/routes/invitation.ts`
- `packages/server/src/routes/users.ts`
- migrations `003`, `004`, `006`, `007`, `009`, `010`, `018`, `019`, and `024`
- SDK application/client domains and transports
- CLI application/client services, workspaces, dialogs, and representative specification tests

**Key Observations:**

- Most application-owned relational rows already cascade. `permissions.module_id` is the known
  `ON DELETE SET NULL` exception.
- Current client and RBAC caches accept positive entries without a database recheck and suppress
  invalidation failures.
- Redis session records have no user/client reverse index. The PostgreSQL mirror can be missing and
  its `client_id` is not populated by the current Redis adapter.
- Transaction-bound audit support exists, but generic mutation middleware already writes one event
  for every successful Admin API DELETE.
- Invitation claim preassignment code uses table and column names that do not exist in migration
  `007_custom_claims.sql`.

**Reference Verification:** 25 material references mapped; 25 verified. Several verified references
contradict assumptions in RD-10 and are findings below.

**Selected Domain Lenses:** web application; distributed and concurrent; data and migration.

## Summary by Dimension

|   # | Dimension              | Findings | Highest Severity |
| --: | ---------------------- | -------: | ---------------- |
|   1 | Ambiguities            |        2 | 🟠 MAJOR         |
|   2 | Implicit Assumptions   |        0 | —                |
|   3 | Logical Contradictions |        3 | 🔴 CRITICAL      |
|   4 | Completeness Gaps      |        1 | 🟠 MAJOR         |
|   5 | Dependency Issues      |        0 | —                |
|   6 | Feasibility Concerns   |        0 | —                |
|   7 | Testability            |        0 | —                |
|   8 | Security Blind Spots   |        1 | 🟠 MAJOR         |
|   9 | Edge Cases             |        1 | 🟠 MAJOR         |
|  10 | Scope Creep Indicators |        0 | —                |
|  11 | Ordering & Sequencing  |        0 | —                |
|  12 | Consistency            |        1 | 🟡 MINOR         |
|  13 | Codebase Alignment     |        2 | 🟠 MAJOR         |

## Summary by Severity

| Severity       | Count | Status   |
| -------------- | ----: | -------- |
| 🔴 CRITICAL    |     1 | Resolved |
| 🟠 MAJOR       |     8 | Resolved |
| 🟡 MINOR       |     2 | Resolved |
| 🔵 OBSERVATION |     0 | —        |

## Findings

### PF-001: PostgreSQL and Redis cannot share the promised rollback boundary 🔴 CRITICAL

**Dimension:** 3 — Logical Contradictions

**Location:** AC-06 and AC-08; Protocol and session semantics; Acceptance Criteria 8–9

**Codebase Evidence:** `packages/server/src/oidc/adapter-factory.ts:25-44,71-86` splits OIDC
authority between Redis and PostgreSQL. `packages/server/src/lib/database.ts:77-86` commits
PostgreSQL before external effects and suppresses their failures. Existing Redis cleanup suppresses
failures in `packages/server/src/oidc/redis-adapter.ts:325-371`.

**The Problem:** RD-10 simultaneously promises that all Redis and PostgreSQL state is physically
removed before success and that every pre-commit failure leaves sessions unchanged. Redis cleanup
before commit cannot be rolled back. Cleanup after commit can fail after relational deletion is
irreversible. The approved no-outbox/no-worker design cannot provide a cross-store transaction.

**Options:**

| Option | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Pros                                                                                                                     | Cons                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| A      | PostgreSQL deletion and audit are the atomic authority. The transaction returns its cleanup descriptor, commits, and releases the PostgreSQL client before Redis work starts. The request then performs bounded direct Redis cleanup. Every Redis continuation and positive security cache entry must recheck PostgreSQL, so residual keys are inert. Return `204` only when cleanup finishes; a cleanup failure returns the existing fixed indeterminate result and the UI reloads. | Security remains immediate; the database transaction stays short; no worker, outbox, or blacklist; response is truthful. | A failed response can follow a committed deletion, and physical stale keys may remain until expiry. |
| B      | Return `204` after PostgreSQL commit once stale state is proven inert; make physical Redis removal best effort.                                                                                                                                                                                                                                                                                                                                                                      | Simplest operation and clearest commit result.                                                                           | Weakens the user's requested direct logout/cleanup signal.                                          |

**Recommendation:** Option A. It is the strongest result possible inside the approved simplicity
boundary. A durable coordinator or moving all OIDC state to PostgreSQL was considered and rejected
because it adds the machinery already declined in AR-94 and AR-97.

**Confidence:** High — changed only if physical cross-store atomicity becomes a hard requirement.
**Hardening:** No change. **Challenger:** converged.

**User Decision:** Resolved — On 2026-09-05, the user revised the earlier Option A decision and
chose Option B. PostgreSQL is the atomic authority. The transaction captures immutable cleanup
identifiers, deletes the relational records, writes the audit event, commits, and releases its
PostgreSQL client. Only after the transaction returns, Porta schedules targeted Redis cleanup with
`setImmediate` or an equivalent macrotask and returns `204` without awaiting that cleanup. The
callback receives no database client, catches every rejection, and logs only a fixed event without
user IDs, client IDs, session IDs, tokens, or Redis keys. Redis cleanup is explicitly best effort;
authoritative PostgreSQL checks must make any residual state unusable. Logout remains limited to
clients and users whose authorization state was affected, while unrelated users and sessions remain
active.

### PF-002: Current state cannot enumerate all targeted Redis sessions 🟠 MAJOR

**Dimension:** 4 — Completeness Gaps

**Location:** AC-06 and AC-07; Ownership and cascade model; Protocol and session semantics;
Acceptance Criterion 7

**Codebase Evidence:** Redis indexes only UID, user code, and grant ID
(`packages/server/src/oidc/redis-adapter.ts:35-69,96-123`). Session mirroring is best effort
(`packages/server/src/lib/session-tracking.ts:1-8,62-91`) and omits `clientId`
(`packages/server/src/oidc/redis-adapter.ts:127-141`). A Session contains a multi-client
authorization map (`packages/server/src/oidc/adapter-factory.ts:139-151`).

**The Problem:** `admin_sessions` cannot authoritatively identify all sessions for a client or
user, and its single-client shape cannot represent a shared OIDC Session. RD-10 does not define how
legacy/current Redis records are discovered or what happens to a Session containing both deleted
and unaffected clients.

**Options:** The only in-scope direct resolution is to scan the closed OIDC Redis namespaces,
inspect payloads and authorization maps, terminate a whole Session when it contains the deleted
client or affected user, and preserve Sessions proven to contain only unaffected identities. The
scan must cover keys created before deployment. A new authoritative tracking subsystem was rejected
because it adds support machinery and still needs a legacy scan.

**Recommendation:** Adopt the direct scan and whole-affected-session rule. Add specifications for
multi-client Sessions, missing mirror rows, and pre-deployment Redis keys.

**Confidence:** High — changed if Redis deployment policy proves namespace scans operationally
unsafe. **Hardening:** The direct scan replaced the auditors' larger tracking proposal.
**Challenger:** converged on the direct scan.

**User Decision:** Resolved — On 2026-09-05, the user accepted one best-effort post-commit scan of
Porta's existing OIDC Redis namespaces. Matching artifacts and whole affected Sessions are removed;
no reverse index or new tracking subsystem is added.

### PF-003: Concurrent OIDC writes can survive deletion capture 🟠 MAJOR

**Dimension:** 9 — Edge Cases

**Location:** AC-05, AC-06, and AC-08; Ownership and cascade model; Acceptance Criteria 3, 8, and 14

**Codebase Evidence:** PostgreSQL OIDC payloads have no normalized client foreign key
(`packages/server/migrations/010_oidc_adapter.sql:8-26`). PostgreSQL and Redis adapter writes are
independent upserts (`packages/server/src/oidc/postgres-adapter.ts:65-85` and
`packages/server/src/oidc/redis-adapter.ts:82-125`). Current OIDC client resolution may accept a
positive cache entry without checking the database (`packages/server/src/clients/service.ts:297-307,597-603`).

**The Problem:** An OIDC request can validate a client before deletion, then write an artifact after
the deletion scan. Therefore a literal “zero physical artifacts after success” rule requires a
shared fence across hot OIDC creation and rare deletion.

**Options:** The smallest approved resolution is to define success as zero **usable** deleted
authority. Direct cleanup still runs, but every later artifact use rechecks authoritative
PostgreSQL client and role/permission state. A shared serialization fence was considered; it was
rejected because it adds hot-path coordination and conflicts with the approved no-machinery design.

**Recommendation:** Adopt the usable-authority invariant, define the deletion capture cut-off, and
test an artifact write racing before and after commit. This is consistent with PF-001.

**Confidence:** Medium — a hard physical-zero requirement would require the rejected fence.
**Hardening:** The challenger preferred a PostgreSQL-backed fence to preserve physical-zero
semantics; the recommendation remains the smaller inert-state contract because the user explicitly
rejected such support machinery. **Challenger:** diverged.

**User Decision:** Resolved — On 2026-09-05, the user accepted zero usable deleted authority as the
success invariant and rejected a serialization fence. An artifact created or left in Redis cannot
authorize continued use after the corresponding PostgreSQL client, role, or permission state is
deleted because each security decision rechecks that authoritative state. Direct targeted Redis
cleanup remains best effort after commit; physical zero is not promised.

### PF-004: Application deletion ignores changed role claims 🟠 MAJOR

**Dimension:** 8 — Security Blind Spots

**Location:** AC-07; Protocol and session semantics; Acceptance Criterion 7

**Codebase Evidence:** Porta emits both role and permission claims from live RBAC state
(`packages/server/src/oidc/account-finder.ts:78-106`). Role and permission claim builders are both
cache-first (`packages/server/src/rbac/user-role-service.ts:167-209`). Application deletion removes
roles and user-role links even when a role contributes no unique permission.

**The Problem:** RD-10 logs out users only when effective permissions change. A deleted application
role can change a user's role claims while the permission union remains identical. Relying parties
may authorize on either claim, so permission-only capture misses affected security state.

**Options:** The only secure resolution is to terminate sessions for users whose effective role
**or** permission set changes. Treating role claims as non-authoritative is not enforceable across
external relying parties and contradicts the public claim surface.

**Recommendation:** Expand “permission-affected users” to “authorization-affected users,” defined as
an effective role or permission set change, and test role-only changes plus duplicate permission
grants.

**Confidence:** High. **Hardening:** The role-only counterexample was added during the adversarial
pass. **Challenger:** converged.

**User Decision:** Resolved — On 2026-09-05, the user accepted capturing users whose effective role
or permission set changes. The implementation uses a direct set-based query before deletion and
adds no authorization-impact subsystem.

### PF-005: RD-10 preserves RD-04 rules that forbid some required Delete actions 🟠 MAJOR

**Dimension:** 3 — Logical Contradictions

**Location:** AC-01 through AC-03; Integration with RD-04

**Codebase Evidence:** RD-04 excludes hard deletion and makes archived application/module and
revoked-client details read-only (`RD-04-applications-and-oidc-clients.md`, Must Have AC-02, AC-04,
AC-07, and Acceptance Criteria 4–5, 8). RD-10 says only RD-04's absence of module deletion is
superseded while requiring deletion in every lifecycle state.

**The Problem:** A planner cannot preserve the inherited read-only rules and also expose Delete on
archived applications, modules under archived applications, and revoked clients.

**Options:** The only resolution consistent with AR-88 is to supersede RD-04's hard-delete absence
and terminal read-only restrictions for the Delete action only. All edit and lifecycle restrictions
remain unchanged.

**Recommendation:** State that narrow supersession explicitly.

**Confidence:** High. **Hardening:** No change. **Challenger:** converged.

**User Decision:** Resolved — On 2026-09-05, the user accepted the narrow supersession. Delete is
allowed in every approved lifecycle state; all existing edit and lifecycle restrictions remain.

### PF-006: “Existing” invitation claim handling uses nonexistent tables 🟠 MAJOR

**Dimension:** 13 — Codebase Alignment

**Location:** AC-15; Integration with RD-03; Acceptance Criterion 16

**Codebase Evidence:** Invitation creation and acceptance query `claim_definitions` and
`user_claim_values` (`packages/server/src/routes/users.ts:850-863` and
`packages/server/src/routes/invitation.ts:434-461`). Migration 007 defines
`custom_claim_definitions`, `custom_claim_values`, and `claim_id`
(`packages/server/migrations/007_custom_claims.sql:5-40`). The acceptance catch converts the SQL
failure into a skipped assignment.

**The Problem:** Valid claim preassignments are currently skipped too. Acceptance Criterion 16
cannot pass by preserving existing behavior.

**Options:** The only viable resolution is to include the minimal canonical table/column correction
in both invitation creation validation and invitation acceptance. Removing the claim behavior would
contradict AR-102.

**Recommendation:** Make the correction explicit and cover deleted, valid, and mixed claim
references with immutable specifications.

**Confidence:** High. **Hardening:** No change. **Challenger:** converged.

**User Decision:** Resolved — On 2026-09-05, the user accepted correcting the two existing
invitation paths to use the canonical custom-claim tables and columns. No invitation redesign is
included.

### PF-007: “One durable audit event” conflicts with generic mutation audit behavior 🟠 MAJOR

**Dimension:** 1 — Ambiguities

**Location:** AC-08; Acceptance Criteria 1, 8, and 10

**Codebase Evidence:** Every successful Admin API DELETE already runs in one PostgreSQL transaction
and writes `admin.mutation.committed` (`packages/server/src/middleware/admin-mutation-audit.ts:19-59`).
Only bulk and import routes are excluded (`packages/server/src/middleware/admin-mutation-audit.ts:6-25`).

**The Problem:** Adding one resource-specific deletion event produces two audit rows unless the
generic contract changes. The RD does not say whether “one” means one deletion-specific row or one
total row.

**Options:**

| Option | Description                                                                                                           | Pros                                                           | Cons                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| A      | Require exactly one resource-specific deletion row; allow the existing generic mutation row to coexist.               | Smallest change; preserves the established central middleware. | Two rows describe one request.                                  |
| B      | Let the generic middleware accept a resource-specific event payload and omit its fallback event for these operations. | Exactly one total row and one transaction owner.               | Cross-cutting middleware change and broader regression surface. |

**Recommendation:** Option A. It preserves the current audit convention and avoids a generalized
middleware extension for three rare routes.

**Confidence:** Medium — changed if audit consumers require exactly one total event.
**Hardening:** The challenger chose Option B to preserve literal cardinality; the lead retained A
because the approved baseline rejects unnecessary cross-cutting support changes.
**Challenger:** diverged.

**User Decision:** Resolved — On 2026-09-05, the user chose Option A. Each operation writes one
resource-specific deletion event while the existing generic mutation event may coexist. The shared
audit middleware is not redesigned.

### PF-008: The server cannot verify UI organization state before dispatch 🟠 MAJOR

**Dimension:** 3 — Logical Contradictions

**Location:** AC-03; Ownership and cascade model; Admin UI state and layout

**Codebase Evidence:** The DELETE path contains only a client ID. Admin authentication resolves the
super-admin organization, not the Admin UI's selected organization
(`packages/server/src/middleware/admin-auth.ts:235-272`). Existing client routes are ID-only
(`packages/server/src/routes/clients.ts:303-325`). The current Admin UI performs a server-backed
client read and validates `organizationId` before mutation (`packages/cli/src/admin/client-service.ts:445`).

**The Problem:** The server receives neither a pre-dispatch request nor the selected UI organization.
The statement incorrectly presents a UI stale-context guard as a server tenant authorization check.

**Options:** The only option consistent with the exact route and deployment-wide permission is to
state that the Admin UI performs the server-backed ownership read and epoch check before dispatch.
The server remains authoritative for target existence and `admin:client:delete`, but it does not
authorize against untransmitted UI state. Adding organization context would change the approved API.

**Recommendation:** Correct the actor and boundary wording.

**Confidence:** High. **Hardening:** No change. **Challenger:** converged.

**User Decision:** Resolved — On 2026-09-05, the user accepted correcting the actor and boundary
wording. The Admin UI checks its selected organization against authoritative client data before
dispatch; the server checks target existence and the deployment-wide delete permission.

### PF-009: Migration execution and verification boundaries remain open 🟠 MAJOR

**Dimension:** 13 — Codebase Alignment

**Location:** AC-13; Migration and recovery; Acceptance Criterion 14

**Codebase Evidence:** The FK requires replacement
(`packages/server/migrations/006_roles_permissions.sql:26-40`). PostgreSQL protocol rows contain
client identity only inside JSON and have no client index
(`packages/server/migrations/010_oidc_adapter.sql:8-26`). Migration 024 demonstrates the repository's
explicit lock, precondition, idempotent correction, and irreversible-down conventions
(`packages/server/migrations/024_application_client_correction.sql:3-38`).

**The Problem:** “Schema or indexes needed” does not identify the required foreign-key correction or
permission seeding and could be interpreted as authority for unnecessary migration machinery.

**Options:** The smallest viable resolution is one ordinary forward migration that changes the
module-permission foreign key to `ON DELETE CASCADE` and seeds the three delete permissions plus
Application Admin mappings. A protocol lookup index is added only if the implemented query
demonstrates that it is needed. A backfill framework, custom deployment coordination, generated
columns, and a new migration system were rejected as unnecessary.

**Recommendation:** Adopt the single-migration boundary.

**Confidence:** High. **Hardening:** The recommendation was reduced after the user's explicit
simplicity review. **Challenger:** its larger operational alternatives were rejected because they
do not address a demonstrated need in this change.

**User Decision:** Resolved — On 2026-09-05, the user accepted the single ordinary migration and
rejected additional migration machinery.

### PF-010: Public SDK deletion method names are unspecified 🟡 MINOR

**Dimension:** 1 — Ambiguities

**Location:** AC-09; Acceptance Criterion 11

**Codebase Evidence:** Existing SDK hard-removal names vary: organizations use `destroy`
(`packages/sdk/src/domains/organizations.ts:40`) while roles use `remove`
(`packages/sdk/src/domains/roles.ts:30`). Applications already use compound module methods such as
`deactivateModule` (`packages/sdk/src/domains/applications.ts:90-101`).

**The Problem:** The immutable public SDK specification cannot derive one interface from
“corresponding delete methods.”

**Options:**

| Option | Description                                                                                      | Pros                                                                         | Cons                                                    |
| ------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| A      | `ApplicationsDomain.delete(id)`, `deleteModule(appId, moduleId)`, and `ClientsDomain.delete(id)` | Matches the approved Delete terminology and existing compound module naming. | Adds another verb beside legacy `destroy` and `remove`. |
| B      | `destroy`, `destroyModule`, and `destroy`                                                        | Matches organization hard deletion.                                          | Conflicts with the deliberate product term Delete.      |

**Recommendation:** Option A.

**User Decision:** Resolved — On 2026-09-05, the user chose Option A:
`ApplicationsDomain.delete(id)`, `ApplicationsDomain.deleteModule(appId, moduleId)`, and
`ClientsDomain.delete(id)`, each returning `Promise<void>`.

### PF-011: The approved RD still declares Draft status 🟡 MINOR

**Dimension:** 12 — Consistency

**Location:** Document header

**Codebase Evidence:** The artifact header says `Draft`, while the user explicitly approved RD-10
immediately before this preflight. The feature roadmap consequently remains at `RD Drafted`.

**The Problem:** Artifact state does not reflect its governing authority. This does not cause the
semantic blockers above, but downstream lifecycle tooling can misclassify it.

**Options:** The only valid correction is to set the RD status to `Approved`. The roadmap must not
advance to `RD Preflighted` until all blocking findings are resolved, applied, and re-scanned.

**Recommendation:** Apply the approved status correction with the semantic fixes.

**User Decision:** Resolved — The user approved RD-10 on 2026-09-05, and the artifact status was
corrected when the accepted findings were applied.

## Iteration 2–3 Verification

| Finding | Verification result                                                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PF-001  | Closed. PostgreSQL commits and releases its client before unawaited best-effort Redis cleanup is scheduled. Absolute logout wording was removed.                                                                               |
| PF-002  | Closed. Cleanup uses one complete cursor-based pass over closed OIDC Redis namespaces. Only tracking rows identifiable from existing captured fields are updated transactionally; unmatched mirror rows are non-authoritative. |
| PF-003  | Closed. The zero-usable-authority invariant names the minimum PostgreSQL decision checks and requires pre/post-commit race specifications without a fence.                                                                     |
| PF-004  | Closed. Affected users are selected by database ID when assigned a deleted role or a role linked to a deleted permission.                                                                                                      |
| PF-005  | Closed. RD-04 is superseded only for Delete; its edit and lifecycle restrictions remain.                                                                                                                                       |
| PF-006  | Closed. Both invitation paths must use the canonical custom-claim schema names.                                                                                                                                                |
| PF-007  | Closed. Each deletion produces exactly one resource-specific event plus the existing generic mutation event.                                                                                                                   |
| PF-008  | Closed. UI organization-context validation and server authorization responsibilities are separate and explicit.                                                                                                                |
| PF-009  | Closed. One ordinary forward migration owns the FK correction and permission seeding; no migration framework was added.                                                                                                        |
| PF-010  | Closed. The public SDK methods are `ApplicationsDomain.delete(id)`, `ApplicationsDomain.deleteModule(appId, moduleId)`, and `ClientsDomain.delete(id)`, each returning `Promise<void>`.                                        |
| PF-011  | Closed. RD-10 now records its approved status.                                                                                                                                                                                 |

The bounded iteration-3 audit found no remaining critical or major defect. Two wording residuals
within the accepted best-effort design were corrected directly: the confirmation now says logout
will be attempted, and residual state is forbidden from restoring deleted authority rather than
being described as wholly unusable.

## Domain-Lens Results

| Lens                       | Result                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| Web application            | Passed; the remaining SDK naming question is a minor public-interface ambiguity.             |
| Distributed and concurrent | Passed under the explicitly accepted best-effort cleanup and zero-usable-authority boundary. |
| Data and migration         | Passed with one ordinary forward migration and no additional deployment machinery.           |

## Adversarial Checklist

- The creation-time assumption that OIDC state was PostgreSQL-owned was false; the adapter is hybrid.
- The creation-time assumption that session tracking could drive targeted logout was false; it is
  best effort and lacks client association.
- The creation-time assumption that invitation claim validation already worked was false against the
  canonical schema.
- No external protocol-conformance claim was required to resolve these findings. The review used
  repository behavior rather than uncited recollection of an RFC.

## Verdict

✅ **PASSED.** All 11 findings are resolved and applied. The bounded iteration-3 review found no
remaining critical, major, minor, or observation finding. RD-10 may advance to `RD Preflighted`.
