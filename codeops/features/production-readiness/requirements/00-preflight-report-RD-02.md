## Preflight Report: RD-02 Selective Environment Portability — Iteration 2

> **Status**: PASSED — CLEAN (15 findings corrected and verified; 0 new findings)
> **Previous Iteration**: 15 findings — all resolved
> **This Iteration**: 0 new findings
> **Carried Forward**: none
> **Iteration**: 2 (bounded re-scan after authorized corrections)
> **Artifact**: requirements document at `codeops/features/production-readiness/requirements/RD-02-selective-environment-portability.md`
> **Artifact SHA-256**: `746f3f9065e32359020cdfcaac2d0765a9d096283394476a89e6c493de7d6485`
> **Repository Revision**: `df19ceb519e6651769b17931ddd4c72f9ce04759`
> **Codebase Grounded**: 24 source and test files examined, 31 references verified
> **Scope Mode**: strict; no scope expansion proposed
> **Last Updated**: 2026-09-13

> **SAME-SESSION REVIEW:** This artifact was created in the current working sequence. Same-agent
> bias risk is elevated. One independent challenger reviewed the complete critical/major finding
> batch. Because this feature moves identity and authorization data, a human security review is
> still recommended before implementation.

### Codebase Context Summary

**Tech Stack:** Node.js 24, TypeScript ESM, Koa, PostgreSQL, Redis, Zod, Yarn/Turbo, and the
terminal JSVision Admin UI.

**Architecture:** The authenticated Admin API owns server-side validation and persistence. The SDK,
conventional CLI, and embedded Admin UI consume it. PostgreSQL is authoritative; Redis holds runtime
caches and authentication/session state. Admin identities belong to the single control-plane
organization and receive roles through the canonical `porta-admin` application.

**Key Files Examined:**

- `packages/server/src/lib/data-import.ts`
- `packages/server/src/lib/data-export.ts`
- `packages/server/src/lib/database.ts`
- `packages/server/src/server.ts`
- `packages/server/src/middleware/admin-auth.ts`
- `packages/server/src/middleware/admin-mutation-audit.ts`
- `packages/server/src/lib/deletion-cleanup.ts`
- `packages/server/src/lib/authority-revocation.ts`
- `packages/server/src/services/image-validator.ts`
- `packages/server/src/routes/imports.ts`
- `packages/server/src/routes/exports.ts`
- `packages/sdk/src/domains/imports.ts`
- `packages/sdk/src/types/imports.ts`
- `packages/cli/src/commands/provision.ts`
- `packages/cli/src/commands/exports.ts`
- `packages/server/tests/unit/admin/administrative-data-contract.spec.test.ts`

No new OIDC protocol behavior is proposed. Existing exact redirect-URI, PKCE, client-secret, and
domain validation contracts remain authoritative, so no external-standard gap was identified.

### Summary by Dimension

| #   | Dimension               | Findings | Highest Severity |
| --- | ----------------------- | -------: | ---------------- |
| 1   | Ambiguities             |        1 | 🟠 MAJOR         |
| 2   | Implicit Assumptions    |        0 | —                |
| 3   | Logical Contradictions  |        1 | 🟠 MAJOR         |
| 4   | Completeness Gaps       |        1 | 🟠 MAJOR         |
| 5   | Dependency Issues       |        1 | 🟠 MAJOR         |
| 6   | Feasibility Concerns    |        1 | 🟠 MAJOR         |
| 7   | Testability Problems    |        2 | 🟠 MAJOR         |
| 8   | Security Blind Spots    |        2 | 🔴 CRITICAL      |
| 9   | Edge Cases              |        2 | 🟠 MAJOR         |
| 10  | Scope Creep             |        1 | 🟡 MINOR         |
| 11  | Ordering and Sequencing |        1 | 🟠 MAJOR         |
| 12  | Internal Consistency    |        1 | 🟠 MAJOR         |
| 13  | Codebase Alignment      |        1 | 🟡 MINOR         |

### Summary by Severity

| Severity    | Count | Status       |
| ----------- | ----: | ------------ |
| CRITICAL    |     1 | All resolved |
| MAJOR       |    11 | All resolved |
| MINOR       |     3 | All resolved |
| OBSERVATION |     0 | —            |

---

### PF-001: The control-plane security graph is portable without a safe boundary 🔴 CRITICAL

**Dimension:** Security Blind Spots
**Location:** AC-02, AC-05, AC-06, AC-07, AC-15, and AC-17
**Codebase Evidence:** `packages/server/src/middleware/admin-auth.ts:142-151` authenticates every
Admin through the canonical `porta-admin` application and control-plane organization. The current
import can update applications, roles, permissions, users, and assignments.
**The Problem:** A full-environment import could alter the canonical Admin application, its roles or
permissions, control-plane Admin identities, or their assignments. That can remove administrative
access during the operation. A reset installation also cannot authenticate an import until `porta
init` has created its destination control plane. AC-05 protects only `is_super_admin`, not the graph
that makes Admin authentication work.

**Options:**

| Option | Description                                                                                                                                                                    | Pros                                                                             | Cons                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A      | Require an initialized destination. Exclude the canonical `porta-admin` application graph, control-plane Admin users, and their Admin-role assignments from export and import. | Small, safe, and consistent with logical portability rather than backup/restore. | A full manifest intentionally omits the destination's administrative control plane.                     |
| B      | Permit control-plane portability while preserving and proving a destination survivor Admin graph.                                                                              | Moves more of the source environment.                                            | Adds special bootstrap, survivor, ordering, and rollback rules to a feature that is not backup/restore. |

**Recommendation:** Option A — it preserves the existing authentication root with one clear
exclusion and avoids a second bootstrap/recovery system.

**Confidence:** High.
**Hardening:** The independent challenger chose A. Its strongest counterargument was that “complete
environment” becomes intentionally incomplete; it still rejected B as dangerous and overengineered.
**User Decision:** Resolved — User chose Option A. Keep the solution small: require an initialized
destination and leave its existing control-plane Admin graph untouched. Do not add survivor,
recovery, or compatibility machinery.

### PF-002: Selected-organization membership does not exist in the Admin model 🟠 MAJOR

**Dimension:** Internal Consistency
**Location:** AC-17
**Codebase Evidence:** `packages/server/src/middleware/admin-auth.ts:142-151` requires an active user
in the one control-plane organization. The code has no Admin membership relationship to each
managed organization.
**The Problem:** AC-17 requires “existing organization membership” for selected-organization
operations, but that concept cannot be checked by the current Admin authentication model.

**Options:**

| Option | Description                                                                                                                                                         | Pros                                                      | Cons                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A      | Authorize the existing control-plane Admin with the portability operation permission, every selected category permission, and exact manifest/database target scope. | Reuses the current Admin model without new relationships. | Authorization is role-based rather than per-organization membership-based.     |
| B      | Require exact `porta-super-admin` for every portability operation.                                                                                                  | Smallest authorization rule.                              | Prevents existing delegated Admin roles from using selected-scope portability. |

**Recommendation:** Option A — it matches Porta's current global Admin model and preserves useful
delegation without inventing organization membership.

**Confidence:** High.
**Hardening:** The independent challenger chose A and found that a managed-organization membership
model would be unnecessary machinery.
**User Decision:** Resolved — User accepted Option A. Reuse the existing control-plane Admin model;
do not add managed-organization membership.

### PF-003: Mandatory preview is stated as a server invariant without a proof mechanism 🟠 MAJOR

**Dimension:** Logical Contradictions
**Location:** AC-11, AC-18, and Preview and Apply Contract
**Codebase Evidence:** The API has separate dry-run and apply modes in
`packages/server/src/lib/data-import.ts`; no preview receipt or server state links one call to the
next. The RD explicitly excludes preview tokens at lines 207-211.
**The Problem:** The Admin UI can require preview before Apply, but the server cannot prove that an
SDK caller previously previewed the same manifest and mode. The apply path must remain independently
valid and atomic.

**Options:**

| Option | Description                                                                                                                                                | Pros                                                               | Cons                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------- |
| A      | Make preview mandatory in the first-party CLI and Admin UI workflows. Let SDK/API callers invoke apply directly; apply always repeats complete validation. | Honest, stateless, and consistent with the single-operator design. | A custom API consumer can skip preview. |

The discarded alternative was a server-issued preview token. It contradicts the approved scope and
adds state, expiry, and race handling without making apply validation safer.

**Recommendation:** Option A — it gives people the intended preview while keeping the API concise.

**Confidence:** High.
**Hardening:** The independent challenger chose A and rejected a proof token as overengineering.
**User Decision:** Resolved — User accepted Option A. Preview is a first-party workflow rule; do not
add preview tokens or server-side preview state.

### PF-004: The manifest and compatibility rules are not exact enough to test 🟠 MAJOR

**Dimension:** Testability Problems
**Location:** AC-04, AC-06–AC-10, AC-12–AC-14, and Manifest Relationship Contract
**Codebase Evidence:** Ordinary mutations use entity-specific Zod schemas and different mutable
field sets. `packages/server/src/lib/data-import.ts` currently defines a different v1 schema and
matching contract. The user domain contains more profile fields than AC-07 names.
**The Problem:** The RD does not give the exact field, type, nullability, normalization, mutable,
immutable, keep, update, and incompatibility rule for each collection. `claim_name` and
“claim slug” are also used for the same key. Implementations and immutable tests could make
different valid-looking choices.

**Options:**

| Option | Description                                                                                                                                                            | Pros                                                                             | Cons                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| A      | Add one normative per-collection schema and compatibility table. Standardize on `claim_name`, and reference the ordinary validators for normalization and value rules. | Makes the contract implementable and testable without a second validation model. | Adds a sizeable table to the RD that contract tests must keep aligned. |

**Recommendation:** Option A — exactness belongs in the requirement oracle, not in undocumented
implementation choices.

**Confidence:** High.
**Hardening:** The independent challenger chose A; it recommended contract tests to prevent drift.
**User Decision:** Resolved — User accepted Option A. Add only the normative schema and contract
tests needed to make the v1 format exact.

### PF-005: Category and application selections do not define their exact record sets 🟠 MAJOR

**Dimension:** Ambiguities
**Location:** AC-03, AC-06, AC-07, AC-09, and lines 190-191
**Codebase Evidence:** The current import schema has independent arrays, while the RD groups those
arrays into four categories. No existing implementation defines the new filter behavior.
**The Problem:** It is unclear which collections must be present for each category and how selected
applications filter user relationships, claim values, and clients. This can create partial or
unexpected authorization graphs.

**Options:**

| Option | Description                                                                                                                                                                                                                                  | Pros                                       | Cons                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| A      | Add a closed category-to-collection/filter matrix. User records are selected by organization; their application-bound roles and claims are filtered to selected applications. Clients are filtered explicitly and never select applications. | Predictable selective exports and imports. | Users may intentionally carry only part of their authorization graph. |

**Recommendation:** Option A — partial authorization is the stated purpose of explicit selection,
and the matrix makes that choice visible.

**Confidence:** High.
**Hardening:** The independent challenger chose A and confirmed that implicit application selection
would be more surprising.
**User Decision:** Resolved — User accepted Option A. Use one closed static category/filter matrix.

### PF-006: Valid manifests cannot pass the ordinary body parser safely 🟠 MAJOR

**Dimension:** Feasibility Concerns
**Location:** AC-04 and Manifest Relationship Contract lines 195-196
**Codebase Evidence:** `packages/server/src/server.ts:150-170` parses ordinary Admin JSON at 100 KiB
before route authorization. `packages/server/src/services/image-validator.ts` accepts branding
assets up to 2 MiB for logos and 512 KiB for favicons.
**The Problem:** A valid embedded asset already exceeds the Admin parser limit. Simply raising the
global pre-auth limit would increase unauthenticated memory allocation, and the RD defines no finite
manifest boundary.

**Options:**

| Option | Description                                                                                                                                                                           | Pros                                                                              | Cons                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A      | Add an import-specific JSON parser after Admin authentication with a documented 64 MiB decoded request limit and safe `413` response. Apply the same finite artifact limit to export. | Supports the approved embedded assets without streaming or global parser changes. | A complete environment larger than the bound must use PostgreSQL backup/restore instead. |

**Recommendation:** Option A — it is the smallest safe transport exception and leaves the ordinary
100 KiB boundary intact.

**Confidence:** High.
**Hardening:** The independent challenger chose A. It rejected streaming and configurable-limit
machinery as unnecessary for the stated dataset size.
**User Decision:** Resolved — User accepted Option A. Use one authenticated fixed-limit parser; do
not add streaming, chunking, or configurable-limit machinery.

### PF-007: Transaction and runtime side effects use outdated or incomplete boundaries 🟠 MAJOR

**Dimension:** Ordering and Sequencing
**Location:** AC-15, Preview and Apply Contract lines 212-217, and Security and Transaction Boundaries lines 247-250
**Codebase Evidence:** `packages/server/src/lib/database.ts:58-107` provides
`runDatabaseTransaction()` and `afterDatabaseCommit()`. The current importer manually holds a
serializable transaction and advisory locks at `packages/server/src/lib/data-import.ts:517-529`.
Existing deletion paths perform targeted cache and authority cleanup after commit.
**The Problem:** Requiring explicit transaction-client threading conflicts with the newer shared
transaction convention. The RD also assumes reads will repopulate caches but does not invalidate
changed cached records or revoke affected users when an import deactivates them or reduces their
authority.

**Options:**

| Option | Description                                                                                                                                                                                                                 | Pros                                                                               | Cons                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A      | Use `runDatabaseTransaction()` for apply. Register targeted cache invalidation and existing targeted authority/session revocation through `afterDatabaseCommit()` only for affected records and security-impacting changes. | Reuses established concise boundaries and does not hold PostgreSQL open for Redis. | A failed post-commit Redis action can briefly leave stale runtime state until normal expiry/reload. |

**Recommendation:** Option A — it matches current repository behavior and avoids locks, workers,
automatic retries, or broad logout.

**Confidence:** High.
**Hardening:** The independent challenger chose A and specifically limited revocation to affected
identities.
**User Decision:** Resolved — User accepted Option A. Reuse the existing transaction and targeted
post-commit mechanisms; do not add workers, retries, locks, or broad logout.

### PF-008: The superseded public v1 import surfaces have no retirement contract 🟠 MAJOR

**Dimension:** Dependency Issues
**Location:** AC-18, AC-22, and Verification Contract
**Codebase Evidence:** `packages/sdk/src/domains/imports.ts` and
`packages/cli/src/commands/provision.ts` expose the old manifest and modes.
`packages/server/tests/unit/admin/administrative-data-contract.spec.test.ts` freezes that old
contract as an immutable specification.
**The Problem:** Correcting v1 in place necessarily breaks the unused SDK and CLI surface and makes
parts of the existing immutable oracle false. The RD says no compatibility parser but does not say
which commands/types/tests replace the obsolete contract.

**Options:**

| Option | Description                                                                                                                                                                                                                     | Pros                                                                 | Cons                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| A      | Replace the old SDK import domain and CLI `provision` surface with typed manifest export, preview, and import commands. Replace only obsolete v1 assertions while retaining all still-valid validation and security assertions. | Delivers one correct unadopted v1 without speculative compatibility. | Any undisclosed private consumer must migrate. |

**Recommendation:** Option A — the repository and approved scope both say the old contract is
unadopted; a compatibility layer would be unsupported extra machinery.

**Confidence:** High.
**Hardening:** The independent challenger chose A and found compatibility speculative.
**User Decision:** Resolved — User accepted Option A. Replace the unused v1 surfaces directly; do
not add a compatibility layer or legacy parser.

### PF-009: The authorization matrix is incomplete 🟠 MAJOR

**Dimension:** Completeness Gaps
**Location:** AC-17
**Codebase Evidence:** Admin authorization resolves canonical application roles and permissions in
`packages/server/src/middleware/admin-auth.ts`; current export/import routes use operation-specific
permission checks.
**The Problem:** “Existing read/write permissions for every selected category” does not map the four
categories and three operations to exact permission slugs. Different API paths could enforce
different combinations.

**Options:**

| Option | Description                                                                                                  | Pros                                          | Cons                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------- |
| A      | Define an exact operation/category permission matrix and enforce it through one portability-specific helper. | Testable and preserves delegated Admin roles. | Adds a small dedicated authorization helper.                              |
| B      | Require exact `porta-super-admin` for every operation.                                                       | Simplest rule.                                | Removes delegated selected-scope portability without a demonstrated need. |

**Recommendation:** Option A — a narrow shared helper prevents drift without creating a general
authorization framework.

**Confidence:** Medium-high.
**Hardening:** The independent challenger chose A; it found B unnecessarily restrictive.
**User Decision:** Resolved — User accepted Option A. Add one narrow portability authorization
helper, not a general authorization framework.

### PF-010: Result and audit ownership contracts are under-specified 🟠 MAJOR

**Dimension:** Testability Problems
**Location:** AC-20, AC-21, AC-23, and API Shape
**Codebase Evidence:** The existing exporter returns a typed body plus `filename` and `rowCount` in
`packages/server/src/lib/data-export.ts:280-304`. Existing audit events require an organization
owner.
**The Problem:** The RD does not define stable result item shapes, safe natural-key encoding, entity
order, or which organization owns selected- and full-scope audit events. Aggregate count headers
also duplicate information already available in the manifest or result body.

**Options:**

| Option | Description                                                                                                                                                                                                                                                                                                        | Pros                                                  | Cons                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------- |
| A      | Define one typed preview/apply envelope with canonical entity order and structured safe natural keys. Use `Content-Disposition` for export filename, derive export counts from manifest arrays, assign selected-scope audits to that organization, and assign full-scope audits to the control-plane organization. | Exact, compact, and avoids duplicate count contracts. | Clients calculate export counts locally. |

**Recommendation:** Option A — it supplies the missing stable contract while removing redundant
headers.

**Confidence:** Medium-high.
**Hardening:** The challenger proposed this smaller combined option after rejecting both redundant
headers and an incomplete body-only alternative.
**User Decision:** Resolved — User accepted Option A. Use one typed result contract and avoid
duplicate count headers or additional response formats.

### PF-011: Multi-collection export lacks a consistent database snapshot 🟠 MAJOR

**Dimension:** Edge Cases
**Location:** AC-02, AC-06, AC-07, AC-09, and Security and Transaction Boundaries
**Codebase Evidence:** The existing one-entity export already uses `BEGIN ISOLATION LEVEL REPEATABLE
READ` at `packages/server/src/lib/data-export.ts:280-294`.
**The Problem:** Separate ordinary reads can observe related collections at different committed
moments, producing a manifest whose parent and relationship rows never formed one coherent state.

**Options:**

| Option | Description                                                                                                     | Pros                                                                | Cons                                                                |
| ------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| A      | Read all selected collections and write the content-free export audit inside one `REPEATABLE READ` transaction. | Reuses the existing export boundary and yields one stable snapshot. | Holds one read transaction while the bounded manifest is assembled. |

**Recommendation:** Option A — `SERIALIZABLE` would add aborts without improving a read-only
snapshot.

**Confidence:** High.
**Hardening:** The independent challenger chose A and rejected stronger isolation as unnecessary.
**User Decision:** Resolved — User accepted Option A. Reuse one `REPEATABLE READ` export transaction;
do not add serializable isolation or locking.

### PF-012: Sensitive portability responses may be cached 🟠 MAJOR

**Dimension:** Security Blind Spots
**Location:** AC-08, AC-16, AC-20, and API Shape
**Codebase Evidence:** Apply may return a plaintext client secret once, while export and preview may
contain identity, authorization, and branding data. The RD defines no HTTP cache policy.
**The Problem:** Browsers or intermediaries can cache authenticated responses unless the server
explicitly forbids it. The one-time-secret promise is incomplete without a response policy.

**Options:**

| Option | Description                                                                                   | Pros                                                                        | Cons                                                        |
| ------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| A      | Send `Cache-Control: no-store` on all export, preview, and apply responses, including errors. | Nearly free and protects every sensitive portability response consistently. | Prevents response caching that this workflow does not need. |

**Recommendation:** Option A — it closes the disclosure boundary with one standard header.

**Confidence:** High.
**Hardening:** The independent challenger chose A and found it proportionate.
**User Decision:** Resolved — User accepted Option A. Add the standard no-store response header only.

### PF-013: Branding filenames are required but not stored 🟡 MINOR

**Dimension:** Codebase Alignment
**Location:** AC-04
**Codebase Evidence:** Organization branding persistence stores kind, media type, binary content,
and size, but no original filename. The upload API does not require one.
**The Problem:** Export cannot preserve a filename that Porta does not have. Inventing or persisting
one adds no import behavior because the destination also does not use it.

**Options:**

| Option | Description                                          | Pros                                                        | Cons                                                    |
| ------ | ---------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| A      | Remove branding filename from the portable contract. | Matches stored data and avoids needless schema/API changes. | The JSON does not retain the operator's local filename. |

**Recommendation:** Option A — media type and asset kind provide everything import requires.
**User Decision:** Resolved — User accepted Option A. Remove the unused filename requirement; do not
add filename persistence or synthesis.

### PF-014: Browser verification is unconditional for a terminal-only UI change 🟡 MINOR

**Dimension:** Scope Creep
**Location:** Verification Contract lines 263-268
**Codebase Evidence:** The embedded Admin UI is in `packages/cli`; `yarn test:ui` is the separate
Playwright browser suite.
**The Problem:** Requiring browser tests even when no browser/OIDC surface changes spends time
without exercising the new terminal workspace.

**Options:**

| Option | Description                                                                                                                                | Pros                                          | Cons                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------- |
| A      | Require focused server, SDK, CLI, and terminal Admin UI specifications. Run `yarn test:ui` only when browser-facing OIDC behavior changes. | Keeps verification proportional and relevant. | Does not add unrelated broad browser regression coverage to this feature. |

**Recommendation:** Option A — the ordinary workspace and security gates remain; only the unrelated
unconditional browser gate is removed.
**User Decision:** Resolved — User accepted Option A. Keep verification focused; browser tests remain
conditional on browser-facing OIDC changes.

### PF-015: Six-calendar-month expiry is not deterministic at month end 🟡 MINOR

**Dimension:** Edge Cases
**Location:** AC-16
**Codebase Evidence:** JavaScript date rollover can turn an intended end-of-month result into the
following month unless the operation is defined explicitly.
**The Problem:** “Six calendar months” has multiple results for dates such as 31 August and does not
state which timezone preserves the time component.

**Options:**

| Option | Description                                                                                           | Pros                                                          | Cons                                              |
| ------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| A      | Add six months in UTC, preserve the UTC time, and clamp the day to the destination month's final day. | Deterministic and matches the approved calendar-based expiry. | Requires a small date helper and month-end tests. |

**Recommendation:** Option A — a fixed-day duration would silently change the stated calendar
meaning.
**User Decision:** Resolved — User accepted Option A. Use the small deterministic UTC month-end rule.

---

### Resolution State

All 15 authorized corrections are present and verified. The bounded re-scan found no residual,
regression, or new finding across the 13 dimensions.

### Iteration 2 Verification

| Findings | Verified correction                                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| PF-001   | Destination initialization and complete control-plane exclusion are explicit; no survivor or recovery machinery was added.        |
| PF-002   | Selected scope uses the existing control-plane Admin model and exact database scope; managed-organization membership was removed. |
| PF-003   | Preview is mandatory only in first-party workflows; direct apply revalidates without preview state or tokens.                     |
| PF-004   | Root, collection, field, type, natural-key, normalization, mutability, and incompatibility contracts are normative.               |
| PF-005   | One closed category/collection/application-filter matrix defines every selective record set.                                      |
| PF-006   | One 64 MiB import parser follows authentication and operation authorization; the ordinary parser remains unchanged.               |
| PF-007   | Apply reuses `runDatabaseTransaction()` and targeted `afterDatabaseCommit()` cleanup without locks, workers, or retries.          |
| PF-008   | SDK/CLI replacements and selective retirement of obsolete immutable assertions are explicit; no compatibility surface remains.    |
| PF-009   | One exact operation/category permission matrix is defined; it contains no general authorization framework.                        |
| PF-010   | One typed ordered result envelope, standard filename header, derived export counts, and audit ownership are explicit.             |
| PF-011   | All export graph reads and audit use one existing-style `REPEATABLE READ` transaction.                                            |
| PF-012   | Every portability success and error response requires `Cache-Control: no-store`.                                                  |
| PF-013   | Original branding filename is excluded; no persistence or synthesis was added.                                                    |
| PF-014   | Browser verification is conditional on browser-facing OIDC changes.                                                               |
| PF-015   | Six-month secret expiry uses deterministic UTC addition with month-end clamping.                                                  |

**Bounded fresh scan:** No new ambiguity, assumption, contradiction, completeness, dependency,
feasibility, testability, security, edge-case, scope, ordering, consistency, or codebase-alignment
issue was found in the unchanged RD-02 scope.
