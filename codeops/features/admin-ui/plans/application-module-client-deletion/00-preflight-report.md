# Preflight Report: Record Deletion and Lifecycle Simplification — Iteration 3

> **Status**: ✅ PREFLIGHT PASSED — all 15 findings resolved
> **Previous Iteration**: 15 findings — 4 critical, 7 major, 4 minor; all decisions approved
> **This Iteration**: Bounded verification of accepted corrections and direct dependencies
> **Remaining Findings**: 0
> **Artifact**: Full plan at `codeops/features/admin-ui/plans/application-module-client-deletion/`
> **Artifact Content Hash**: `104f892c76654281a427374a4a5529eba70c36ff1e5f2c6091a82d96cd81a351`
> **Codebase Grounded**: 37 source/schema/test/config files examined; corrected claims rechecked against their direct dependencies
> **Last Updated**: 2026-09-06 03:23 CEST

> **SAME-SESSION REVIEW:** The revised artifact and its corrections were created in this session.
> Independent risk, fit, and delivery/testability reviewers performed the bounded third iteration.
> A human identity/security review remains advisable before implementation.

## Iteration 3 Audit Boundary

- **Scope mode:** Strict. This iteration checked only the iteration-2 critical/major fixes, the four
  accepted minor corrections, and their direct dependency surfaces.
- **Target:** The ten plan documents. This report and `_preflight-notes.md` were excluded from the
  content hash and audit inputs.
- **Context only:** Approved RD-10/RD-03 corrections, package scripts, assurance registry, and the
  source/schema/test files directly cited by the iteration-2 findings.
- **Modification set:** The previously authorized plan and requirements corrections, this report,
  and the existing Admin UI feature roadmap.
- **Validation:** Independent bounded review, plan parser, link/reference scans, Markdown formatting,
  checklist count/order, and `git diff --check`. `yarn verify` was not run.

## Iteration 3 Result

| Finding | Verification result                                                                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PF-003  | Verified: both invitation paths use canonical claim schema; creation validates the deployment-global application without an organization predicate and retains parent-qualified role/claim checks |
| PF-005  | Verified: migration owns only lifecycle constraints/module cascade; `porta init` exclusively owns permission creation and built-in mappings                                                       |
| PF-009  | Verified: ten planned specification files and copy-paste workspace-relative selectors are explicit; compiled PTY and final gate commands are named                                                |
| PF-013  | Verified: concurrent last-admin checks serialize on the unique control-plane organization row before the exact-role survivor recheck                                                              |
| PF-014  | Verified: historical audit remains separately governed evidence, may identify the deleted user, and relies on nullable foreign keys without scrub machinery                                       |
| PF-015  | Verified: generic post-handler audit resolves a physically deleted actor through a nullable live-user subquery                                                                                    |
| PF-016  | Verified: PostgreSQL Session tracking precedes Redis publication and all Session reads reject missing, expired, or revoked tracking                                                               |
| PF-017  | Verified: `find`, `findByUid`, and `findByUserCode` validate every specified authority reference; Client, account, RBAC, and claim paths are direct PostgreSQL reads                              |
| PF-018  | Verified after refinement: Phase 1 is authority-only through ST-24; Phase 2 owns ST-25 and performs one coherent lifecycle/schema/permission/route cutover after deletion prerequisites           |
| PF-019  | Verified: focused SDK/CLI specifications, existing compiled PTY coverage, clean-commit compatibility, and the manual `yarn admin` journey remain separate evidence                                |
| PF-020  | Verified: exact operational protocol/security assurance commands and the conditional production-security rule are stated                                                                          |
| PF-021  | Verified: the current-state table renders correctly                                                                                                                                               |
| PF-022  | Verified: a five-row Admin UI oracle covers organization, user, application, module, and client only                                                                                              |
| PF-023  | Verified: API/SDK/CLI cover eight resources while the Admin UI covers only its five existing workspaces                                                                                           |
| PF-024  | Verified: `01-requirements.md` is a thin RD-10 delta rather than a duplicate specification                                                                                                        |

No finding remains open, no accepted correction adds a generalized framework or new infrastructure,
and the third iteration found no independent critical or major defect. The plan is ready for
specification-first execution.

## Iteration 2 Audit Boundary

- **Scope mode:** Strict; no optional functionality was treated as a finding.
- **Target:** The ten revised plan documents. This report and `_preflight-notes.md` are evidence,
  not audit inputs.
- **Context only:** AGENTS.md, RD-02 through RD-04, approved RD-10, requirements ambiguity records,
  iteration 1, and directly affected source/schema/test/documentation files.
- **Modification set:** This report only. No plan fix was applied.
- **Domain lenses:** Web application, authentication protocol, tenant isolation, concurrency,
  migration/data integrity, public API compatibility, and terminal UI.
- **Validation:** Plan parser, Markdown formatting, link/reference scans, checklist ordering,
  roadmap consistency, and `git diff --check`. `yarn verify` was not run.

## Codebase Context Summary

Porta is a Node.js 24 TypeScript ESM identity platform using Koa, PostgreSQL, Redis,
`oidc-provider`, an SDK, a conventional CLI, and an embedded JSVision terminal UI. Admin mutations
run inside transaction-owning audit middleware. PostgreSQL owns relational state; Redis owns OIDC
session payloads and read caches. Existing source confirms that organization/role/permission/claim
hard deletes, user Purge, lifecycle status branches, SDK contracts, commands, and Admin UI
capabilities must all be changed together.

Key evidence includes `packages/server/src/middleware/admin-mutation-audit.ts`,
`packages/server/src/lib/database.ts`, `packages/server/src/oidc/adapter-factory.ts`,
`packages/server/src/oidc/redis-adapter.ts`, session tracking, user GDPR code, permission/init code,
migrations 002–007/009/018, SDK domains, conventional commands, Admin UI state/workspaces, and the
registered assurance harness.

## Iteration 2 Summary by Dimension

|   # | Dimension               | Findings | Highest severity |
| --: | ----------------------- | -------: | ---------------- |
|   1 | Ambiguities             |        2 | 🔴 CRITICAL      |
|   2 | Implicit assumptions    |        2 | 🔴 CRITICAL      |
|   3 | Logical contradictions  |        2 | 🟠 MAJOR         |
|   4 | Completeness gaps       |        5 | 🔴 CRITICAL      |
|   5 | Dependency issues       |        2 | 🔴 CRITICAL      |
|   6 | Feasibility concerns    |        1 | 🔴 CRITICAL      |
|   7 | Testability             |        3 | 🟠 MAJOR         |
|   8 | Security blind spots    |        3 | 🔴 CRITICAL      |
|   9 | Edge cases              |        3 | 🔴 CRITICAL      |
|  10 | Scope creep indicators  |        0 | —                |
|  11 | Ordering and sequencing |        2 | 🔴 CRITICAL      |
|  12 | Consistency             |        2 | 🟡 MINOR         |
|  13 | Codebase alignment      |        8 | 🔴 CRITICAL      |

One finding may affect several dimensions; severity totals count unique findings.

| Severity       | Count | Status                            |
| -------------- | ----: | --------------------------------- |
| 🔴 CRITICAL    |     4 | All resolved; corrections pending |
| 🟠 MAJOR       |     7 | All resolved; corrections pending |
| 🟡 MINOR       |     4 | 4 pending                         |
| 🔵 OBSERVATION |     0 | —                                 |

## Iteration 1 Verification

| Finding | Iteration 2 result                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------------------- |
| PF-001  | Verified resolved: Client-model OIDC lookup is explicitly direct PostgreSQL with no cache population        |
| PF-002  | Verified resolved: exact cache identifiers and compare-before-delete are specified                          |
| PF-003  | Reopened: design mentions creation, but ST-40/task 2.10 still cover acceptance only                         |
| PF-004  | Verified resolved: transaction graph distinguishes internal/public client IDs                               |
| PF-005  | Reopened: migration again claims permission row/mapping ownership                                           |
| PF-006  | Verified resolved: Down is explicitly a no-op                                                               |
| PF-007  | Verified resolved: the ST matrix now includes the required security boundaries                              |
| PF-008  | Verified resolved: unsupported numeric coverage targets were removed                                        |
| PF-009  | Reopened: focused commands and registered selectors remain unspecified                                      |
| PF-010  | Verified resolved: active/inactive records are directly deletable and terminal lifecycle states are removed |
| PF-011  | Verified resolved: warning applicability and content are explicit                                           |
| PF-012  | Verified resolved: the plan no longer claims form-CSRF middleware for bearer Admin APIs                     |

## Critical Findings

### PF-013: Concurrent deletes can remove the final capable administrator 🔴 CRITICAL

**Dimensions:** 1, 8, 9, 13
**Location:** `03-01-transactional-deletion.md`, Transaction Sequence and Guards;
`99-execution-plan.md`, tasks 1.10/1.12
**Codebase Evidence:** `packages/server/src/lib/database.ts:68-80` uses ordinary transactions;
`packages/server/migrations/006_roles_permissions.sql:59-67` has independent assignment rows and no
minimum-administrator invariant.

Locking only the target allows two transactions deleting different remaining Super Admin users to
each observe the other and both commit.

| Option | Resolution                                                                                                         | Trade-off                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| A      | Lock the single control-plane organization row `FOR UPDATE`, then recheck another active exact `porta-super-admin` | Small existing-row serialization point               |
| B      | Lock all qualifying users/assignments in deterministic order, then recheck                                         | Broader locking and easier to implement incompletely |

**Recommendation:** A. Apply the same continuity lock to any in-scope mutation that can remove the
last qualifying assignment/status, or keep the invariant explicitly limited to user deletion.
**Confidence:** High. **Hardening:** Independent challenger selected A and upheld Critical severity.
**User Decision:** Resolved — User accepted Option A.

### PF-016: Session revocation is not a durable authority boundary 🔴 CRITICAL

**Dimensions:** 2, 6, 8, 9, 13
**Location:** `03-01-transactional-deletion.md`, Transaction Sequence;
`03-02-authority-and-cleanup.md`, PostgreSQL Authority/Cleanup; ST-20/ST-24/ST-25
**Codebase Evidence:** `packages/server/src/oidc/redis-adapter.ts:127-141` mirrors Session rows
fire-and-forget and omits client ID; `packages/server/migrations/018_admin_api_enhancements.sql:38-50`
stores one nullable client/grant; Redis Session reads at `redis-adapter.ts:153-165` do not check
`revoked_at`.

Best-effort Redis failure can leave a role/permission/claim-affected user logged in. Client-specific
sessions also cannot be derived exactly from the current single-column mirror because one Session
may contain several client authorizations.

| Option | Resolution                                                                                                                                                                                                                                | Trade-off                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| A      | Make Session mirroring awaited and failure-propagating; transactionally revoke affected-user tracking rows; make Session reads check `revoked_at`; use direct client authority plus best-effort exact Redis scan for client-only deletion | Uses current table but makes session creation depend on its tracking write |
| B      | Define targeted logout as best effort                                                                                                                                                                                                     | Simpler, but contradicts approved logout behavior                          |
| C      | Add normalized session-client tracking                                                                                                                                                                                                    | Exact client mapping, but adds unapproved schema/support machinery         |

**Recommendation:** A. It preserves the simple design. The plan must specify partial-write ordering
and must not claim the current `client_id` column represents a Session's complete client set.
**Confidence:** High. **Hardening:** Independent challenger selected tightened A and rejected C as
overengineering.
**User Decision:** Resolved — User accepted Option A as tightened: reuse the existing tracking
table, make Session mirroring reliable, validate revocation live, and keep client-only Redis cleanup
detached and best effort.

### PF-017: Backed OIDC validation is too vague to close stale Redis authority 🔴 CRITICAL

**Dimensions:** 1, 2, 8, 13
**Location:** `03-02-authority-and-cleanup.md`, PostgreSQL Authority; task 2.8; ST-22
**Codebase Evidence:** `packages/server/src/oidc/adapter-factory.ts:101-115` exposes independent
`find`, `findByUserCode`, and `findByUid` paths. Session payloads carry client/grant pairs in an
`authorizations` map at `adapter-factory.ts:139-151`.

“One set-based validation” does not identify the methods or payload references. An executor can
secure one lookup while leaving device or UID/session lookup cache-authoritative.

| Option | Resolution                                                                                                                                                                                 | Trade-off                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| A      | Add one post-read validator to all three adapter lookup methods; validate every present `clientId`, `accountId`, `grantId`, and Session authorization pair through direct PostgreSQL paths | Central, complete, and consistent |
| B      | Add checks separately in each OIDC endpoint                                                                                                                                                | Duplicated and omission-prone     |

**Recommendation:** A, while keeping Client itself on the accepted direct `findForOidc` path.
**Confidence:** High. **Hardening:** Independent challenger selected A and upheld Critical severity.
**User Decision:** Resolved — User accepted Option A.

### PF-018: The execution order exposes Delete before its security boundary 🔴 CRITICAL

**Dimensions:** 4, 5, 8, 11
**Location:** `99-execution-plan.md`, Phase 1 tasks 1.8–1.11 versus Phase 2 tasks 2.6–2.9
**Codebase Evidence:** `packages/server/src/server.ts:233-238` mounts Admin mutation routes directly;
current Client resolution remains cache-first through `packages/server/src/clients/service.ts:297-307,597-603`.

Phase 1 makes callable deletes green before Phase 2 adds affected-graph capture, live authority, and
cleanup. This creates an insecure checkpoint and forces the delete services to be reopened.

| Option | Resolution                                                                                                                   | Trade-off                                           |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| A      | Put capture, live authority, audit, and cleanup registration in the same phase before any Delete route is mounted/normalized | Reorders current tasks only                         |
| B      | Build dormant routes and mount them later                                                                                    | Adds dead intermediate code and delayed route proof |

**Recommendation:** A.
**Confidence:** High. **Hardening:** Independent challenger selected A and upheld Critical severity.
**User Decision:** Resolved — User accepted Option A.

## Major Findings

### PF-003: Invitation creation remains on obsolete schema queries 🟠 MAJOR

**Location:** `03-04-invitation-and-playground.md`, Pending Invitations; ST-40; task 2.10
**Codebase Evidence:** `packages/server/src/routes/users.ts:850-855` and
`packages/server/src/routes/invitation.ts:439-455` use obsolete claim-table vocabulary.

The design names creation and acceptance, but the test and task correct acceptance only.

**Only viable baseline resolution:** Correct both routes directly. Creation rejects missing
references; acceptance skips deleted optional references and applies the remaining valid ones.
**Recommendation:** Apply that direct correction; a shared helper would obscure the different
policies. **Confidence:** High. **Hardening:** Challenger agreed.
**User Decision:** Resolved — User accepted the direct two-route correction without a shared helper.

### PF-005: Migration and `porta init` both claim permission ownership 🟠 MAJOR

**Location:** `03-01-transactional-deletion.md`, Migration; tasks 1.6–1.7
**Codebase Evidence:** `packages/server/src/cli/commands/init.ts:316-368` creates the Admin
application, permissions, roles, and mappings after migrations.

This reopens the rejected fresh-initialization defect: the parent Admin application does not exist
when the migration runs.

**Only viable baseline resolution:** Restrict migration to status constraints and the module FK;
make permission definitions and built-in mappings exclusive to normal `porta init`.
**Recommendation:** Apply the accepted fresh reset/migrate/init ownership. **Confidence:** High.
**Hardening:** Challenger agreed.
**User Decision:** Resolved — User accepted exclusive `porta init` ownership for permissions and
role mappings; the migration owns only constraints and the module foreign key.

### PF-009: Phase verification remains non-reproducible 🟠 MAJOR

**Location:** `07-testing-strategy.md`, Verification Matrix; all phase spec/run tasks
**Codebase Evidence:** Server, SDK, and CLI package scripts accept exact file selectors, while the
plan says only “focused files” and defers known assurance selectors.

**Options:** A — name each proposed spec file and exact runnable command now; B — add a discovery
task per phase. **Recommendation:** A. Keep discovery only for detecting later registry drift.
**Confidence:** High. **Hardening:** Challenger selected A.
**User Decision:** Resolved — User accepted bounded named specification files and copy-paste phase
commands without discovery tasks.

### PF-014: User deletion and retained audit identity have conflicting contracts 🟠 MAJOR

**Location:** `03-01-transactional-deletion.md`, Audit; ST-18; task 2.7
**Codebase Evidence:** `packages/server/migrations/009_audit_log.sql:5-16` retains metadata,
description, IP, and user-agent after FK nulling; `packages/server/src/users/service.ts:143-150`
already stores email metadata.

| Option | Resolution                                                                                                 | Trade-off                                                          |
| ------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| A      | Before user deletion, sanitize identified historical rows to minimal event/time/category evidence          | Retains evidence but requires heterogeneous metadata rewriting     |
| B      | Delete target-associated audit rows with one set-based query, then write one PII-free `user.deleted` event | Smallest hard-erasure rule; discards the old target-linked history |

**Final Recommendation:** Treat audit history as separate security and operational evidence.
Preserve it unchanged, let the existing `user_id` and `actor_id` foreign keys become NULL, and keep
it under configured audit retention. Remove GDPR-erasure and historical sanitization claims from
RD-10 and the plan. Do not add cleanup code.
**Confidence:** High. **Hardening:** The independent simplicity review confirmed that the existing
nullable foreign keys and retention policy make this the smallest coherent design.
**User Decision:** Resolved — User confirmed that audit records may potentially identify a deleted
user because attribution is the purpose of the audit record. Audit history is outside the owned
user-data cascade and is neither scrubbed nor deleted.

### PF-015: Physical self-delete rolls back at generic audit insertion 🟠 MAJOR

**Location:** `03-01-transactional-deletion.md`, Transaction Sequence; ST-27
**Codebase Evidence:** `packages/server/src/middleware/admin-mutation-audit.ts:42-59` writes the
generic event after the route with the deleted actor ID; `audit-log.ts:92-109` inserts it directly;
`migrations/009_audit_log.sql:8-9` enforces the actor FK.

| Option | Resolution                                                                         | Trade-off                                                   |
| ------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| A      | Resolve `actor_id` through a live nullable subquery inside generic audit insertion | Handles ordering at the database boundary                   |
| B      | Pass a deletion-specific request flag to middleware                                | Smaller query change but couples route and middleware state |

**Recommendation:** A, plus an immutable self-delete transaction specification.
**Confidence:** High. **Hardening:** Challenger selected A and calibrated this Major.
**User Decision:** Resolved — User accepted the nullable live-actor subquery and focused self-delete
transaction specification.

### PF-020: Security assurance scope and commands are undefined 🟠 MAJOR

**Location:** `07-testing-strategy.md`, Verification Matrix; Phase 2/4 gates
**Codebase Evidence:** Existing registered command grammar and project/profile pairs are documented
in `test-harness/assurance/README.md:18-30` and command validation.

| Option | Resolution                                                                                                                    | Trade-off                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| A      | Use exact existing operational protocol and security regression commands; focused server specs remain the new deletion oracle | Deterministic and minimal                               |
| B      | Add new deletion cases to the assurance program                                                                               | Larger independent surface not required by the baseline |

**Recommendation:** A: `yarn assurance:harness --project protocol --profile operational` and
`yarn assurance:harness --project security --profile operational`; use production-security only
for production cookie/TLS/CORS/CSP claims.
**Confidence:** High. **Hardening:** Challenger selected A and rejected B as overengineering.
**User Decision:** Resolved — User accepted the two existing operational assurance commands with
focused server specifications as the feature oracle and no assurance expansion.

### PF-023: Admin UI scope uses nonexistent optional workspaces 🟠 MAJOR

**Location:** `00-index.md`, Overview; `01-requirements.md`, Delivery Boundary;
`03-03-sdk-and-admin-ui.md`, UI Scope
**Codebase Evidence:** `packages/cli/src/admin/session-service.ts:15-32`, state capabilities, and
`presentation.ts:132-205` expose organization, user, application/module, and client surfaces, but no
role/permission/claim workspaces.

| Option | Resolution                                                                                                             | Trade-off                             |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| A      | State that embedded Admin UI covers its five current resource surfaces; API, SDK, and conventional CLI cover all eight | Matches the no-new-workspace baseline |
| B      | Add role, permission, and claim management workspaces                                                                  | Material unauthorized UI expansion    |

**Recommendation:** A and remove “if present.” This is a wording/scope correction, not permission
to create new workspaces.
**Confidence:** High. **Hardening:** Challenger treated the implementation choice as already
resolved by scope; the remaining cross-document contradiction keeps the plan finding Major until
corrected.
**User Decision:** Resolved — User accepted Admin UI deletion only on the five current surfaces;
API, SDK, and conventional CLI cover all eight record types. No new workspaces are added.

## Minor Findings

### PF-019: Packed and manual evidence are conflated 🟡 MINOR

**Location:** ST-42; Phase 3 gate; Phase 4 tasks 4.3/4.11
**Codebase Evidence:** `yarn admin` runs TypeScript source; compiled TUI evidence already lives in
`packages/cli/tests/admin/application.pty.impl.test.ts`; `tenant-admin` is an SDK/CLI compatibility
selector rather than a packed TUI journey.

**Revised Recommendation:** Do not extend the packed operation matrix. Use focused SDK/CLI specs
for Delete, run the existing clean-commit `yarn assurance:compat --select tenant-admin` unchanged,
use the existing compiled PTY suite for TUI behavior, and keep `yarn admin` as separate manual
evidence.
**Confidence:** High. **Hardening:** Simplicity review downgraded this from Major and rejected a
packed-TUI/Delete harness expansion as unnecessary.
**User Decision:** Resolved — User accepted the simplified evidence boundary with no packed-harness
expansion.

### PF-021: Current-state status rows render as broken Markdown 🟡 MINOR

**Location:** `02-current-state.md`, Verified Existing Behavior

Inline status unions contain unescaped pipe characters and split three table rows into extra
columns. **Recommendation:** Use slash-separated status names.
**User Decision:** Resolved — User accepted the formatting correction.

### PF-022: Admin UI tests do not enumerate the five current resource surfaces 🟡 MINOR

**Location:** ST-32–ST-39 and Phase 4 specification tasks

Generic wording could accidentally exercise only one workflow. **Recommendation:** Add a five-row
oracle matrix for organization, user, application, module, and client across capability, context,
Keep, duplicate, success/failure, and compact geometry.
**User Decision:** Resolved — User accepted the compact five-surface oracle matrix.

### PF-024: The RD-based requirements delta restates owned requirements 🟡 MINOR

**Location:** `01-requirements.md`, Delivery Boundary/Traceability/Explicit Exclusions

The make-plan schema requires an RD-based `01-requirements.md` to remain a thin delta and cite the
owning RD. **Recommendation:** Reduce it to the source link, plan scope note, no deferred RD items,
and plan-local criteria only.
**User Decision:** Resolved — User accepted the thin RD-based delta.

## Verdict

Iteration 2 is blocked. No finding requires the workers, queues, retry machinery, compatibility
conversion, or generic deletion framework the user rejected. The recommended corrections reuse
existing rows, tables, hooks, adapters, tests, and public surface boundaries.

## Historical Iteration 1 Report

> **Status**: ❌ BLOCKED — audited plan superseded by an authorized lifecycle revision; 12 findings
> (1 critical, 9 major, 2 minor)
> **Iteration**: 1 (first scan)
> **Artifact**: Full plan at `codeops/features/admin-ui/plans/application-module-client-deletion/`
> **Artifact Content Hash**: `3ea34b19cf93d06da7d5e916c601aae4be2ad3456e7132ed470df15f3070f790`
> **Codebase Grounded**: 31 source/schema files examined, 46 named references verified
> **Last Updated**: 2026-09-06 00:23 CEST

> **Same-session review warning:** This plan was created earlier in the current working session.
> Independent risk, decision, and recommendation challengers were used, but a fresh-session review
> remains advisable before implementing this security-sensitive deletion feature.

## Audit Boundary

- **Scope mode:** Strict. No optional product expansion was considered.
- **Target:** All ten plan documents in this directory (1,298 lines).
- **Context only:** `AGENTS.md`, RD-10, its requirements preflight report, and directly affected
  source, schema, test, command, and documentation files.
- **Modification set:** This report only. No plan or implementation correction was applied.
- **Deployment constraint:** Porta has no current users or production data. Existing development
  and playground databases are disposable and may be recreated with `yarn admin:env reset`.
- **Domain lenses:** Web application; distributed and concurrent behavior; data and migration.
- **Validation performed:** Document structure, links, ST/task numbering, task ordering, named-path
  existence, Prettier check, and `git diff --check`. `yarn verify` was not run.

## Authorized Lifecycle Revision

The user authorized a product-wide removal of Archive semantics before this plan is executed:

- Applications retain only reversible Active/Inactive states plus permanent Delete.
- Organizations retain only reversible Active/Suspended states plus permanent Delete; Archive and
  Restore are removed.
- Existing role, permission, and custom-claim routes already perform physical deletion. Their
  Archive commands and permissions are renamed to Delete rather than adding another behavior.
- User Purge is replaced by ordinary User Delete using a dedicated `admin:user:delete` permission.
  The user row is physically deleted; owned authentication/security data cascades, nullable
  references are cleared, Redis authority is removed, and retained audit evidence contains no
  target personal data.
- No anonymized `purged-<UUID>@purged.local` placeholder user remains.
- Credential, secret, session, invitation, and signing-key Revocation remains a distinct security
  operation and is not treated as archival.
- No compatibility or data-conversion machinery is required because Porta has no deployed users or
  production data and current environments are resettable.

This revision supersedes the application-archive and user-purge assumptions in the audited plan and
related requirements. The affected requirements and plan must be revised before a new preflight can
produce an execution-ready verdict.

## Codebase Context Summary

**Tech Stack:** Node.js 24 TypeScript ESM monorepo; Koa, PostgreSQL, Redis, `oidc-provider`, Yarn
Classic/Turbo, Vitest, Playwright, and the embedded JSVision Admin UI.

**Architecture:** Admin DELETE requests pass through bearer-token authentication, authorization,
rate limiting, CORS, and a transaction-owning mutation-audit middleware. PostgreSQL is authoritative;
Redis holds OIDC artifacts and several read caches. The SDK supplies typed transport domains and the
CLI package owns Admin UI state, controllers, dialogs, and workspaces.

**Key Files Examined:** `packages/server/src/lib/database.ts`,
`packages/server/src/middleware/admin-mutation-audit.ts`,
`packages/server/src/oidc/adapter-factory.ts`, `packages/server/src/clients/service.ts`, server cache
modules, migrations 003/006/007/018/024, invitation routes, CLI controllers/workspaces, Vitest
configuration, assurance registration, and the playground scripts/tests.

## Summary by Dimension

|   # | Dimension               | Findings | Highest Severity |
| --: | ----------------------- | -------: | ---------------- |
|   1 | Ambiguities             |        2 | 🟠 MAJOR         |
|   2 | Implicit Assumptions    |        0 | —                |
|   3 | Logical Contradictions  |        0 | —                |
|   4 | Completeness Gaps       |        2 | 🟠 MAJOR         |
|   5 | Dependency Issues       |        0 | —                |
|   6 | Feasibility Concerns    |        0 | —                |
|   7 | Testability             |        2 | 🟠 MAJOR         |
|   8 | Security Blind Spots    |        0 | —                |
|   9 | Edge Cases              |        0 | —                |
|  10 | Scope Creep Indicators  |        0 | —                |
|  11 | Ordering and Sequencing |        1 | 🟠 MAJOR         |
|  12 | Consistency             |        0 | —                |
|  13 | Codebase Alignment      |        5 | 🔴 CRITICAL      |

## Summary by Severity

| Severity       | Count | Status                                |
| -------------- | ----: | ------------------------------------- |
| 🔴 CRITICAL    |     1 | Decision resolved; correction pending |
| 🟠 MAJOR       |     9 | 2 decisions resolved; 7 pending       |
| 🟡 MINOR       |     2 | 2 pending                             |
| 🔵 OBSERVATION |     0 | None                                  |

---

## Findings

### PF-001: OIDC Client lookup still trusts a stale cache 🔴 CRITICAL

**Dimension:** 13 — Codebase Alignment

**Location:** `03-02-authority-and-cleanup.md`, “Live Authority Rules” and “Adapter Validation”;
`99-execution-plan.md`, task 1.2.1

**Codebase Evidence:** `packages/server/src/oidc/adapter-factory.ts:97-105` routes the Client model
to `findForOidc`; `packages/server/src/clients/service.ts:297-307,597-603` makes that lookup
cache-first; `packages/server/src/clients/cache.ts:31-38,53-58,101-114` gives positive entries a
five-minute lifetime.

**The Problem:** The plan calls `findForOidc` a live PostgreSQL check and exempts Client from the
generic validator. A deleted active client already present in Redis can therefore continue to
resolve as an OIDC Client, violating the central “no new authority after deletion” invariant.

**Options:**

| Option | Description                                                                                                                                           | Pros                                                                   | Cons                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| A      | Add a narrowly named OIDC-only repository read for an active client and make `findForOidc` use it; add a pre-primed stale Client-cache specification. | Smallest authoritative correction; returns fresh metadata in one read. | Adds one PostgreSQL read per OIDC Client lookup.                      |
| B      | Pass Client through the generic validator backed by a direct database existence check.                                                                | Reuses the generic validation flow.                                    | Can require a second read and may still return stale client metadata. |

**Recommendation:** Option A — it closes the authority gap with the smallest security-specific
change and avoids returning stale metadata.

**Confidence:** High. **Hardening:** Independent challenger agreed with Option A; its strongest
counterargument is the added PostgreSQL latency on every OIDC Client resolution.

**User Decision:** Resolved — User accepted Option A, refined so the OIDC-only lookup always reads
PostgreSQL and neither consults nor repopulates the client cache.

### PF-002: Required exact cache cleanup lacks identifiers and key coverage 🟠 MAJOR

**Dimension:** 4 — Completeness Gaps

**Location:** `03-01-transactional-deletion.md`, “Internal Capture Contracts” and “Transaction
Order”; `03-02-authority-and-cleanup.md`, “One-Pass Redis Cleanup”

**Codebase Evidence:** Existing exact invalidators require application UUID and slug
(`packages/server/src/applications/cache.ts:122-144`), public and internal client IDs
(`packages/server/src/clients/cache.ts:101-143`), application UUID for claim definitions
(`packages/server/src/custom-claims/cache.ts:92-108`), and role/user identifiers
(`packages/server/src/rbac/cache.ts:92-108,212-229`).

**The Problem:** The cleanup descriptor carries only public client, grant, and user IDs and scans
OIDC namespaces. It does not cover the required application, client, claim-definition, role, and
user-RBAC cache keys. Calling the current invalidators inside the transaction would also await
Redis and delay database-client release.

**Options:**

| Option | Description                                                                                                                                                | Pros                                                                  | Cons                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A      | Extend the immutable cleanup descriptor with the exact identifiers already known during graph capture and delete those keys in the same detached callback. | Satisfies physical cleanup without a new index, worker, or framework. | Broadens the descriptor and needs explicit slug-reuse race handling.                     |
| B      | Make every affected cache permanently non-authoritative and remove physical cleanup as a feature requirement.                                              | Shrinks detached cleanup.                                             | Expands the live-read redesign and contradicts approved RD-10 physical-cleanup behavior. |

**Recommendation:** Option A — it reuses existing cache namespaces and the already approved single
callback. A reusable slug key must be deleted only if its cached UUID still matches the deleted
application.

**Confidence:** High. **Hardening:** Independent challenger agreed with Option A and rejected a
broader authority framework as unnecessary.

**User Decision:** Pending

### PF-003: Invitation creation remains on invalid schema queries 🟠 MAJOR

**Dimension:** 13 — Codebase Alignment

**Location:** `03-04-invitation-and-playground.md`, “Canonical Invitation Claim Continuation”;
`07-testing-strategy.md`, ST-35; `99-execution-plan.md`, task 2.2.6

**Codebase Evidence:** `packages/server/src/routes/users.ts:810-869` checks a nonexistent
`applications.organization_id` and stale `claim_definitions`; `packages/server/src/routes/invitation.ts:434-461`
uses stale `claim_definitions` and `user_claim_values`. Canonical global applications and claim
tables are defined by migrations 003 and 007.

**The Problem:** The plan corrects and tests invitation acceptance only. Valid claim-bearing
invitations can still fail during creation, despite RD-10 requiring both creation and acceptance to
use the canonical schema.

**Options:**

| Option | Description                                                                                                                                        | Pros                                                                   | Cons                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A      | Correct both existing routes directly, remove the invalid organization predicate, and extend ST-35 through public creation followed by acceptance. | Smallest complete correction; keeps the two distinct policies visible. | Some parallel lookup orchestration remains.                                                   |
| B      | Introduce a shared canonical preassignment lookup helper used by both routes.                                                                      | Reduces future schema-name drift.                                      | Adds an abstraction although creation rejects missing references while acceptance skips them. |

**Recommendation:** Option A — the direct two-route correction is complete and avoids unnecessary
new machinery; existing repositories should be reused where their current public contracts fit.

**Confidence:** High. **Hardening:** Independent challenger agreed that both paths and the public
creation-to-acceptance test are mandatory.

**User Decision:** Pending

### PF-004: Internal client UUID capture is promised but not defined 🟠 MAJOR

**Dimension:** 1 — Ambiguities

**Location:** `03-01-transactional-deletion.md:40-78`, “Internal Capture Contracts” and
“Transaction Order”

**Codebase Evidence:** `packages/server/migrations/018_admin_api_enhancements.sql:38-64` stores the
internal client UUID in indexed `admin_sessions.client_id`. The displayed `OidcDeletionTargets`
type has no internal-client field.

**The Problem:** The plan requires revoking tracking rows by internal client UUID but defines no
transaction-local structure that retains those UUIDs. An executor must invent the missing data-flow
contract.

**Options:**

| Option | Description                                                                                                                             | Pros                                                    | Cons                                                                        |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| A      | Define a repository-local transaction graph capture containing internal client UUIDs, then derive the smaller Redis descriptor from it. | Makes tracking and cleanup use one consistent snapshot. | Retains one additional bounded array during deletion.                       |
| B      | Update tracking rows with a set-based subquery before cascade, without retaining internal IDs.                                          | More SQL-native and avoids the array.                   | Makes the capture, tracking, and cleanup evidence less directly comparable. |

**Recommendation:** Option A — it matches the plan’s stated capture-first order while keeping
internal UUIDs out of the Redis-only contract.

**Confidence:** Medium-high. **Hardening:** Independent challenger selected Option A, with Option B
remaining a viable smaller-memory alternative.

**User Decision:** Pending

### PF-005: Fresh initialization and upgrade migration ownership are conflated 🟠 MAJOR

**Dimension:** 13 — Codebase Alignment

**Location:** `03-01-transactional-deletion.md`, “Migration 025”; `07-testing-strategy.md`, ST-11;
`99-execution-plan.md`, tasks 2.1.3 and 2.2.1

**Codebase Evidence:** `packages/server/src/cli/commands/init.ts:274-369` runs after migrations and
creates the admin application, permissions, roles, and mappings. Migration 024 explicitly skips its
data correction when the application is not yet present.

**The Problem:** ST-11 expects migration 025 alone to seed mappings on a fresh database before the
normal initialization owner has created their prerequisite records. That fresh-path expectation
cannot pass without duplicating bootstrap behavior in a migration.

**Options:**

| Option | Description                                                                                                                                           | Pros                                                         | Cons                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| A      | Prove only the supported disposable path: reset, migrate through 025, then run normal `porta init`. Do not add initialized-database correction logic. | Preserves current ownership and removes unused upgrade work. | Existing development databases must be reset.                 |
| B      | Make migration 025 create missing bootstrap applications, roles, and mappings.                                                                        | Makes migration-only fresh assertions possible.              | Duplicates initialization and creates partial-init semantics. |

**Recommendation:** Option A — bootstrap remains owned by `porta init`; migration 025 changes only
the required schema, and current disposable environments are reset.

**Confidence:** High. **Hardening:** The initial challenge assumed an upgrade path. The user supplied
the authoritative constraint that no deployed data exists and all current databases are disposable,
which makes the fresh-only path smaller and complete.

**User Decision:** Resolved — User accepted Option A as revised for disposable environments: no
migration correction for initialized databases; validate reset, migrate, and normal initialization.

### PF-006: Migration 025 has no rollback contract or proof 🟠 MAJOR

**Dimension:** 4 — Completeness Gaps

**Location:** `03-01-transactional-deletion.md`, “Migration 025”; `07-testing-strategy.md`, ST-11
and ST-12; `99-execution-plan.md`, migration tasks

**Codebase Evidence:** `packages/server/src/lib/migrator.ts:16-38` exposes real rollback behavior;
migration 006 defines the prior `ON DELETE SET NULL` foreign key. Migration 024’s no-op Down applies
only to its provenance-ambiguous data correction.

**The Problem:** Migration 025 changes schema but the plan does not state its Down behavior. The
initial audit assumed rollback support was required; the confirmed disposable-environment constraint
removes that requirement, but the no-op contract must still be explicit.

**Options:**

| Option | Description                                                                                                                                                 | Pros                                                              | Cons                                                     |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| A      | Define a schema-only Down that restores `ON DELETE SET NULL`, leaves provenance-ambiguous seeded data intact, and test Up→Down before destructive deletion. | Matches the existing migrator and honestly bounds recoverability. | Cannot restore rows already deleted under cascade.       |
| B      | Declare migration 025 irreversible and use a documented no-op Down.                                                                                         | Smallest contract; matches the reset-based development workflow.  | Rollback requires resetting and recreating the database. |

**Recommendation:** Option B — no current data needs preservation, and restoring the foreign key
cannot recover cascaded rows. Reset is the supported recovery path.

**Confidence:** High. **Hardening:** This recommendation changed after the user confirmed that Porta
has no deployed users or production data and all current databases may be reset.

**User Decision:** Resolved — User accepted Option B: documented no-op Down, with no rollback SQL,
recovery mechanism, guard, or rollback test.

### PF-007: The immutable ST matrix omits required security boundaries 🟠 MAJOR

**Dimension:** 7 — Testability

**Location:** `07-testing-strategy.md`, ST-03, ST-09, ST-13–ST-17, ST-30, and ST-34; specification
task descriptions in `99-execution-plan.md`

**Codebase Evidence:** The plan’s own behavioral sections promise safe audit metadata, commit-race
handling, global-vs-organization deletion boundaries, terminal-control safety, and reauthentication
after deleting current Admin UI authority. The existing ST rows test only adjacent behavior and
implementation-test prose cannot replace immutable specifications.

**The Problem:** There is no explicit immutable proof for: PostgreSQL and Redis artifacts written
on both sides of commit; cross-organization global deletion with unrelated preservation; forbidden
audit fields; hostile terminal-control input; or deletion of the application/client backing the
current Admin UI followed by the next protected request.

**Options:**

| Option | Description                                                                                                                               | Pros                                                          | Cons                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| A      | Fold every missing expectation into the nearest existing ST row.                                                                          | Fewer ST identifiers.                                         | Produces overloaded scenarios whose failures are hard to localize. |
| B      | Add separate ST rows for each boundary while reusing the already planned API, cleanup, controller, dialog, and packed-journey test files. | Clear immutable oracle and failure ownership; no new harness. | Adds traceability rows to maintain.                                |

**Recommendation:** Option B — separate behavior rows improve diagnosis without creating new test
infrastructure or files solely for each case.

**Confidence:** High. **Hardening:** The independent challenger changed the initial preference from
Option A to B because the behaviors have different owners and failure modes.

**User Decision:** Pending

### PF-008: Numeric changed-module coverage targets are unenforced 🟠 MAJOR

**Dimension:** 7 — Testability

**Location:** `07-testing-strategy.md:8-19,114-145`, “Coverage Goals” and “Exact Integration and
Assurance Commands”

**Codebase Evidence:** `yarn verify` does not collect coverage. The server enforces only global
thresholds in `packages/server/vitest.config.ts:60-75`; SDK and CLI coverage configuration excludes
several planned changed modules (`packages/sdk/vitest.config.ts:16-23`,
`packages/cli/vitest.config.ts:16-45`).

**The Problem:** The plan sets 90% and 80% per-changed-module targets but lists no command that can
measure or enforce them. They cannot serve as completion criteria.

**Options:**

| Option | Description                                                                                                          | Pros                                                      | Cons                                               |
| ------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| A      | Remove the unsupported percentages and retain exhaustive branch, failure-boundary, and ST-completeness requirements. | Honest and small; preserves the stronger behavioral gate. | Removes a simple numeric signal.                   |
| B      | Add focused coverage commands and expand all workspace coverage configuration to include planned modules.            | Makes the percentages measurable.                         | Adds unrelated configuration and maintenance work. |

**Recommendation:** Option A — behavioral completeness is the real requirement and no extra
coverage machinery is justified.

**Confidence:** High. **Hardening:** Independent challenger agreed unless quantitative coverage is
promoted to an explicit product requirement.

**User Decision:** Pending

### PF-009: The exact verification matrix cannot drive the declared phase loop 🟠 MAJOR

**Dimension:** 11 — Ordering and Sequencing

**Location:** `07-testing-strategy.md:114-145`; `99-execution-plan.md`, phase verification tasks

**Codebase Evidence:** SDK and CLI package scripts support focused `vitest run` selectors, but the
matrix lists only full workspace verification. Phase 1 asks for protocol/browser/harness gates that
the matrix assigns to Phase 2; Phase 3 lacks its named focused server route command; and Phase 4 asks
for SDK verification assigned by the matrix to Phase 3.

**The Problem:** Specification-first red/green tasks refer to an “exact” command table that omits
their focused commands and disagrees about phase ownership. Execution evidence can be skipped or
duplicated.

**Options:**

| Option | Description                                                                                | Pros                                                                          | Cons                                                               |
| ------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| A      | Add exact focused SDK/CLI commands and make every phase label and verification task agree. | Supports deterministic red/green execution and preserves proportional checks. | File-specific commands need updates if test files move.            |
| B      | Remove focused-run claims and use full workspace commands for every red/green step.        | Smaller command table.                                                        | Slower feedback and poor isolation of expected-red specifications. |

**Recommendation:** Option A — it makes the declared execution loop reproducible with commands the
workspaces already support.

**Confidence:** High. **Hardening:** Independent challenger agreed with Option A; no extra tooling
is required.

**User Decision:** Pending

### PF-010: Delete-from-terminal-state behavior conflicts with current shared guards 🟠 MAJOR

**Dimension:** 13 — Codebase Alignment

**Location:** `03-03-sdk-and-admin-ui.md`, controller and workspace behavior;
`07-testing-strategy.md`, ST-24 and ST-32–ST-33; `99-execution-plan.md`, Admin UI tasks

**Codebase Evidence:** `packages/cli/src/admin/application-controller.ts:274-282` and
`application-workspace.ts:194-217,293-307` reject operations on archived applications;
`packages/cli/src/admin/client-controller.ts:283-301` and
`client-workspace.ts:226-253,276-290` do the same for revoked clients.

**The Problem:** RD-10 allows deletion from terminal lifecycle states, but the plan does not require
delete-specific predicates, messages, or tests. Reusing current guards would disable deletion;
loosening them would incorrectly enable unrelated mutations.

**Options:**

| Option | Description                                                                                                                                   | Pros                                                                                             | Cons                                                                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| A      | Add narrow delete-specific eligibility predicates and tests for archived applications, revoked clients, and modules beneath archived parents. | Preserves every existing mutation restriction and implements only the approved Delete exception. | Adds parallel predicates that must share ownership checks carefully.   |
| B      | Loosen the current shared mutable-state guards.                                                                                               | Fewer predicates.                                                                                | Enables lifecycle/configuration operations that should remain blocked. |

**Recommendation:** Option A — only Delete should supersede terminal-state read-only rules.

**Confidence:** High. **Hardening:** Independent challenger agreed; narrowly named predicates should
share identity/parent/context checks but not lifecycle restrictions.

**User Decision:** Pending

**Scope Revision Note:** The archived-application and archived-parent portions are superseded by
the authorized removal of Application Archive. Revoked-client eligibility remains pending until the
revised lifecycle artifacts define whether whole-client Revocation remains.

### PF-011: “Where applicable” Admin UI warning has no rule 🟡 MINOR

**Dimension:** 1 — Ambiguities

**Location:** `03-03-sdk-and-admin-ui.md`, delete-dialog behavior; `07-testing-strategy.md`, ST-25

**Codebase Evidence:** The current Admin UI state exposes selected resource identity and
capabilities but no reliable classifier proving whether a selected application, module, or client
backs the current authentication flow.

**The Problem:** ST-25 requires the logout/Admin UI consequence “where applicable” without saying
how applicability is determined. Implementers may omit the warning or invent unreliable matching.

**Options:**

| Option | Description                                                                                                              | Pros                                          | Cons                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| A      | Show a short generic “affected users, including you, may need to sign in again” consequence in all three delete dialogs. | Accurate, simple, and requires no classifier. | Slightly broader wording than the immediate effect in some deletions.                              |
| B      | Add exact current-application/client identity to Admin UI session state and condition the warning.                       | More specific warning.                        | Adds state/API coupling solely for dialog wording and cannot classify every module effect cheaply. |

**Recommendation:** Option A — it is accurate and non-invasive without creating detection
machinery.

**User Decision:** Pending

### PF-012: The plan claims an Admin API CSRF middleware chain that does not exist 🟡 MINOR

**Dimension:** 13 — Codebase Alignment

**Location:** `03-01-transactional-deletion.md:91-97`, “Public Service Signatures”

**Codebase Evidence:** `packages/server/src/server.ts:227-241` installs Admin CORS, rate limiting,
mutation audit, and bearer-token authentication. `packages/server/src/auth/csrf.ts` is used by
cookie-backed form interactions, not `/api/admin/*` bearer-token routes.

**The Problem:** The statement that DELETE routes remain inside an existing Admin CSRF chain is
factually false. Adding one would be new behavior, while keeping the claim makes the security model
misleading.

**Options:**

| Option | Description                                                                                                                | Pros                                                              | Cons           |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------- |
| A      | Remove “CSRF” from the list and state that Admin APIs use Authorization bearer tokens plus the actual middleware controls. | Accurately documents the current non-ambient credential boundary. | None material. |

Adding form-style CSRF middleware was considered and dropped: it is not needed for Authorization
bearer tokens and would add an unsupported client contract.

**Recommendation:** Option A — correct the plan without expanding authentication machinery.

**User Decision:** Pending

## Domain Lens Results

| Lens                   | Result  | Blocking evidence                                                                                    |
| ---------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| Web application        | Blocked | Terminal-state actions, dialog consequence wording, and current-session behavior are underspecified. |
| Distributed/concurrent | Blocked | Exact cache cleanup and commit-race specification coverage are incomplete.                           |
| Data/migration         | Blocked | Fresh/init ownership and Down behavior are incomplete.                                               |

## Adversarial Review Checklist

- [x] Every target document and linked requirement was read.
- [x] Every named task, ST case, path, command family, schema relationship, and security boundary was
      checked against the repository where available.
- [x] Simplicity was challenged; no worker, queue, reverse index, generalized cache framework, or
      new infrastructure is recommended.
- [x] One independent recommendation challenger reviewed all critical/major options without seeing
      the initial recommendations.
- [ ] All findings have user decisions (PF-001, PF-005, and PF-006 resolved; seven major and two
      minor decisions pending).
- [ ] Critical and major corrections are applied and rechecked.
- [ ] A fresh-session human or agent review has been considered for the security-sensitive plan.

## Verdict

**Blocked and superseded.** PF-001 permits deleted OIDC client authority to survive in a primed
cache. Nine major findings also leave physical cleanup, migration behavior, invitation behavior,
immutable security coverage, phase verification, and terminal-state deletion incomplete. The
authorized Archive-removal and User-Delete revision changes the requirements baseline, so this plan
must be revised before remaining findings are decided or rechecked. The roadmap must not advance.
