# Preflight Report: Production Security Corrections Plan

> **Status**: ✅ PREFLIGHT PASSED — all 14 findings resolved
> **Iteration**: 3 (final bounded verification)
> **Previous Iteration**: 13 original findings fixed; PF-004, PF-005, and PF-008 required completion; PF-014 was added and resolved
> **This Iteration**: 0 new findings
> **Carried Forward**: none
> **Artifact**: full implementation plan at `codeops/features/production-readiness/plans/production-security-corrections/`
> **Artifact Aggregate SHA-256**: `84b8a3e92a306be3788906f35f3d08848a2e3576a79286e70c8223843b7a7c18`
> **Codebase Grounded**: 18 source/config files, 14 test files, 6 public documentation surfaces, and 24 named references checked
> **Scope Mode**: strict
> **Modification Set**: the nine audited plan documents; all edits were explicitly authorized
> **Last Updated**: 2026-09-13
>
> **SAME-SESSION REVIEW:** The plan was created in this session. Three independent clustered
> auditors and one independent major-finding challenger reduced same-agent bias.

## Audit Scope

| Role | Documents |
|---|---|
| Audit target | All nine plan documents in this directory |
| Context only | RD-01, its passing preflight report, requirements ambiguity register, AGENTS.md, current source/tests/docs |

The frozen baseline is the smallest direct correction: existing Admin transactions, encryption,
post-commit hooks and rate limiting; one local cache generation; one PostgreSQL bootstrap lock;
one replay column and exact-row conditional update; no new subsystem, dependency, compatibility
layer, distributed coordination, or unrelated refactor.

## Codebase Context Summary

**Tech stack:** Node.js 24 TypeScript ESM, Koa, PostgreSQL through `pg`, Redis, OTPAuth 9.5.1,
Vitest, Playwright, Yarn Classic/Turbo, and CodeOps assurance.

**Architecture:** Admin mutations already run in request-owned PostgreSQL transactions. Repository
queries inherit that client through `getPool()`, while cache/audit effects use
`afterDatabaseCommit()`. The OIDC provider receives signing keys once at startup. TOTP currently
validates to a boolean and has no persistent replay state. Key operations are also exposed through
the conventional HTTP CLI and public operator documentation.

## Summary by Dimension

| # | Dimension | Findings | Highest severity |
|---:|---|---:|---|
| 1 | Ambiguities | 1 | 🟠 Major |
| 2 | Implicit Assumptions | 1 | 🟡 Minor |
| 3 | Logical Contradictions | 0 | — |
| 4 | Completeness Gaps | 3 | 🟠 Major |
| 5 | Dependency Issues | 0 | — |
| 6 | Feasibility Concerns | 0 | — |
| 7 | Testability | 2 | 🟠 Major |
| 8 | Security Blind Spots | 3 | 🟠 Major |
| 9 | Edge Cases | 0 | — |
| 10 | Scope Creep Indicators | 0 | — |
| 11 | Ordering & Sequencing | 0 | — |
| 12 | Consistency | 2 | 🟠 Major |
| 13 | Codebase Alignment | 2 | 🟠 Major |

## Summary by Severity

| Severity | Count | Status |
|---|---:|---|
| 🔴 Critical | 0 | — |
| 🟠 Major | 9 | All resolved and verified |
| 🟡 Minor | 5 | All resolved and verified |
| 🔵 Observation | 0 | — |

## Iteration 3 Verification

| Finding | Result |
|---|---|
| PF-001–PF-003, PF-006–PF-007, PF-009–PF-013 | Verified in iteration 2 |
| PF-004 | Required timestamp is passed to OTPAuth and used for the persisted step |
| PF-005 | CAS tests cover row/user/state; tenant preservation tests the real interaction-creation boundary |
| PF-008 | ST-07 and implementation coverage include `porta init --verbose` stack/path suppression |
| PF-014 | Ambiguous preflight citations were removed; AC traceability remains |

Independent bounded reviewers found no direct-consequence defect or new finding.

## Findings

### PF-001: Equal encryption keys can bypass comparison through hex casing 🟠 MAJOR

**Dimension:** Security Blind Spots

**Location:** `03-03-production-configuration-and-operations.md`, Production Secret Separation;
ST-24.

**Codebase Evidence:** Both key schemas accept upper/lowercase hexadecimal at
`packages/server/src/config/schema.ts:35-46`. Hex strings with different casing decode to the same
AES key, while the planned raw `===` comparison treats them as different.

**Options:** A — normalize both validated strings to lowercase before comparing. B — decode them
to buffers and compare bytes.

**Recommendation:** A. It is byte-correct after fixed-length hex validation and adds no machinery.
Add a mixed-case equivalent ST-24 case.

**Confidence:** High. **Hardening:** Independent auditors and challenger agreed.

**User Decision:** Resolved — User accepted recommendation: normalize validated hex before comparison and add the mixed-case ST-24 case.

### PF-002: The production safety escape hatch can bypass key separation 🟠 MAJOR

**Dimension:** Security Blind Spots

**Location:** `03-03-production-configuration-and-operations.md`, Production Secret Separation;
task 4.2.1; ST-24.

**Codebase Evidence:** `packages/server/src/config/schema.ts:81-86` returns before production
refinements when `PORTA_SKIP_PROD_SAFETY=true`. Placing equality beside current refinements would
permit equal root keys despite AC-14.

Only one compliant option exists: enforce root-key separation before the escape-hatch return and
test the escape-hatch case. Allowing bypass would weaken an approved security invariant.

**Recommendation:** Enforce before the return.

**Confidence:** High. **Hardening:** Independent soundness auditor and challenger agreed.

**User Decision:** Resolved — User accepted recommendation: enforce separation before the production-safety escape-hatch return.

### PF-003: Enrollment limiter placement can alter email setup 🟠 MAJOR

**Dimension:** Ambiguities

**Location:** `03-02-totp-replay.md`, Route Behavior; task 3.2.1.

**Codebase Evidence:** Email setup returns at `packages/server/src/routes/two-factor.ts:655-700`;
TOTP confirmation starts afterward. The plan's broad “apply to enrollment” wording permits the
limiter before the email branch even though email setup is outside RD-01.

**Options:** A — place `2fa_verify` after the email early return and before TOTP code validation,
and assert email setup is unchanged. B — limit both setup methods.

**Recommendation:** A. It protects only the authorized TOTP attempt surface.

**Confidence:** High. **Hardening:** Two auditors and the challenger agreed.

**User Decision:** Resolved — User accepted recommendation: limit only the TOTP confirmation branch and preserve email setup.

### PF-004: Validation and persisted time step can sample different instants 🟠 MAJOR

**Dimension:** Completeness Gaps

**Location:** `03-02-totp-replay.md`, Validation Result; ST-10.

**Codebase Evidence:** Current `packages/server/src/two-factor/totp.ts:95-106` calls instance
validation without `timestamp`. OTPAuth accepts an explicit millisecond timestamp. The plan derives
the stored step from `validationTime` but does not require passing it to validation.

**Options:** A — call `totp.validate({ token, timestamp: validationTime, window: 1 })`. B — use the
static validator with the same timestamp and explicit parameters.

**Recommendation:** A. It retains the current instance pattern and guarantees one instant.

**Confidence:** High. **Hardening:** Grounding auditor and challenger agreed.

**User Decision:** Resolved — User accepted recommendation: pass the captured timestamp to instance validation.

### PF-005: Tenant test promises an unplanned repository predicate 🟠 MAJOR

**Dimension:** Codebase Alignment

**Location:** `03-02-totp-replay.md`, Atomic Repository Operations; ST-23; Phases 2–3.

**Codebase Evidence:** The approved CAS carries row ID, user ID, verification state, and step. It
has no organization ID. Existing routes resolve the organization and obtain the trusted pending
user through the organization-scoped interaction before calling `verifyTotp(userId, code)`.

**Options:** A — test wrong user/row/state at the CAS and separately verify the existing
organization-scoped interaction chain. B — thread organization ID through route/service/repository
and add a user ownership predicate.

**Recommendation:** A. It verifies the real boundary and avoids redundant tenant plumbing.

**Confidence:** High. **Hardening:** Grounding auditor and challenger agreed that B is
overengineered.

**User Decision:** Resolved — User accepted recommendation: test the existing tenant interaction boundary separately and add no organization CAS plumbing.

### PF-006: Bootstrap does not say how callers obtain the winning key 🟠 MAJOR

**Dimension:** Completeness Gaps

**Location:** `03-01-signing-keys.md`, Bootstrap Serialization; ST-05.

**Codebase Evidence:** The pre-insert query is empty for the inserting caller. Current
`packages/server/src/lib/signing-keys.ts:302-306` reloads after insertion. Without a defined reload
or merge, the caller can convert its old empty snapshot.

**Options:** A — reload eligible keys after the lock transaction commits, then convert. B — merge
`INSERT ... RETURNING` into the locked snapshot and convert it.

**Recommendation:** A. It reuses the current authoritative reload pattern and serves both callers.

**Confidence:** High. **Hardening:** Grounding auditor and challenger agreed.

**User Decision:** Resolved — User accepted recommendation: reload eligible keys after the bootstrap transaction commits.

### PF-007: A unit test cannot prove migration apply and rollback 🟠 MAJOR

**Dimension:** Testability

**Location:** ST-09; tasks 2.1.1 and 2.3.1.

**Codebase Evidence:** The unit project has no PostgreSQL setup
(`packages/server/vitest.config.ts:80-101`) and existing unit migration tests inspect SQL text.
Real Up/Down checks use integration migration specifications, for example
`packages/server/tests/integration/migrations/record-deletion-lifecycle.spec.test.ts:50-80`.

**Options:** A — keep fast SQL-shape assertions in the unit spec and add immutable integration
Up/Down coverage. B — move all ST-09 assertions to integration.

**Recommendation:** A. It follows the existing two-level convention.

**Confidence:** High. **Hardening:** Grounding auditor and challenger agreed.

**User Decision:** Resolved — User accepted recommendation: retain unit SQL-shape checks and add real integration Up/Down coverage.

### PF-008: `porta init --verbose` can expose an invalid signing-row stack 🟠 MAJOR

**Dimension:** Security Blind Spots

**Location:** `03-01-signing-keys.md`, Stored-Row Validation and File Ownership.

**Codebase Evidence:** `packages/server/src/cli/commands/init.ts:269` loads signing keys, while
`packages/server/src/cli/error-handler.ts:58-60` prints every caught error stack in verbose mode.
The plan bounds server `index.ts` only, leaving another key-loading path that violates AC-05.

**Options:** A — special-case `SigningKeyCryptoError` in the shared server CLI error handler and
never print its stack. B — catch and reduce the error only around init's `ensureSigningKeys()`.

**Recommendation:** A. It is one bounded rule for the sensitive error class and cannot be bypassed
by another direct-DB command.

**Confidence:** High. **Hardening:** Independent challenger agreed; no general error framework is
added.

**User Decision:** Resolved — User accepted recommendation: suppress `SigningKeyCryptoError` stacks in the shared server CLI handler.

### PF-009: Published key-operation guidance remains incomplete and inaccurate 🟠 MAJOR

**Dimension:** Consistency

**Location:** `03-03-production-configuration-and-operations.md`, Documentation Surfaces; Phase 4.

**Codebase Evidence:** `docs/cli/infrastructure.md:85-112` documents both commands without the
restart/verification boundary. `docs/guide/deployment.md:499-541` describes generate followed
later by rotate as if rotate merely deactivated the old key, but the route retires every active
key and creates another new key. The plan does not explicitly correct this lifecycle.

**Options:** A — include the CLI guide, accurately distinguish generate from rotate, require
restart/verification, and keep `--json` output machine-only. B — update only the four general
surfaces and human command output.

**Recommendation:** A. B leaves contradictory operator instructions published.

**Confidence:** High. **Hardening:** Independent challenger agreed.

**User Decision:** Resolved — User accepted recommendation: correct CLI/deployment lifecycle guidance while preserving machine-only JSON.

### PF-010: The changed TOTP utility contract and barrel export are not explicit 🟡 MINOR

**Dimension:** Codebase Alignment

**Location:** `03-02-totp-replay.md`, Validation Result/File Ownership; task 2.2.2.

**Codebase Evidence:** `verifyTotpCode()` is re-exported by
`packages/server/src/two-factor/index.ts:50-56`, but the plan changes its two-argument boolean
contract and omits the barrel from the task.

**Options:** A — explicitly replace the internal contract, update/re-export `TotpMatch` and the new
error through the barrel, and update callers/tests. B — preserve the boolean helper and add a
second matched-step helper.

**Recommendation:** A. The server package exposes no library `main`/`exports`, repository use is
internal, and Porta has no adopters; B adds an unnecessary compatibility surface.

**User Decision:** Resolved — User accepted recommendation: replace the internal contract directly, update the barrel, and add no compatibility wrapper.

### PF-011: Enrollment 503 does not explicitly preserve pending setup data 🟡 MINOR

**Dimension:** Completeness Gaps

**Location:** `03-02-totp-replay.md`, Route Behavior; ST-21.

**Codebase Evidence:** Existing enrollment GET reconstructs the stored secret's QR context through
`getPendingTotpSetupInfo()` at `packages/server/src/routes/two-factor.ts:553-573`. The plan requires
reuse for 429 but not explicitly for 503, despite AR-1 preserving the existing page.

Only one compliant option exists: use the same pending-setup rendering data for 429 and 503, with
no new secret or recovery codes, and assert it in ST-21.

**Recommendation:** Make that reuse explicit.

**User Decision:** Resolved — User accepted recommendation: reuse pending enrollment data for the 503 response.

### PF-012: PostgreSQL `BIGINT` row and domain types are conflated 🟡 MINOR

**Dimension:** Implicit Assumptions

**Location:** `03-02-totp-replay.md`, Schema.

**Codebase Evidence:** `pg` returns `int8` as a string by default. The plan says mappings carry
`number | null`, which can lead the raw row type to be declared incorrectly.

**Options:** A — define raw row state as `string | null`, parse and range-check it into domain
`number | null`. B — register a process-wide `pg` type parser.

**Recommendation:** A. It is local and has no global database behavior change.

**User Decision:** Resolved — User accepted recommendation: model raw `BIGINT` as `string | null` and map safely to `number | null`.

### PF-013: Final verification is one oversized progress task 🟡 MINOR

**Dimension:** Testability

**Location:** task 4.3.2.

**The Problem:** Six independent, potentially long gates are grouped under one checkbox. An
interrupted run cannot retain precise evidence and can cause unnecessary reruns.

**Options:** A — give each final command its own task. B — retain one grouped task.

**Recommendation:** A. This changes tracking only, not product or verification scope.

**User Decision:** Resolved — User accepted recommendation: track each final verification command separately.

### PF-014: Specification cases cite ambiguous preflight identifiers 🟡 MINOR

**Dimension:** Consistency

**Location:** ST-04 and ST-25 in `07-testing-strategy.md`.

**The Problem:** ST-04 cites `PF-005` and ST-25 cites `PF-006` intending the RD preflight, but this
plan's own report uses those identifiers for tenant testing and bootstrap reload. Their existing
AC-03 and AC-12 citations already provide unambiguous requirement ownership.

**Options:** A — remove the two redundant PF citations and retain the AC citations. B — qualify
them as requirement-preflight references.

**Recommendation:** A. It is the smallest unambiguous traceability fix.

**User Decision:** Resolved — User accepted recommendation and authorized removal of the two redundant PF citations; iteration 3 verified the fix.
