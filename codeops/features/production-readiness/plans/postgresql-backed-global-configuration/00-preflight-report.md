# Preflight Report: PostgreSQL-Backed Global Configuration

> **Status**: ✅ PREFLIGHT PASSED — all 9 findings resolved
> **Iteration**: 2 (bounded re-scan after approved corrections)
> **Artifact**: Full implementation plan at `codeops/features/production-readiness/plans/postgresql-backed-global-configuration`
> **Content Hash**: SHA-256 `603937d48bca4830e4b2f02d258c6822a4c1955f1baf331dfb84ffec97fda79a`
> **Iteration 1 Content Hash**: SHA-256 `fbbf70f693c0f9231e73589d434c982a45ced3a82fae29aaaaa20ac33ca27ae2`
> **Current RD-03 Content Hash**: Git hash-object `6615451480584f4c12f5a3733f802c0e80b30666`
> **Hash Method**: SHA-256 of ordered `sha256sum` output for the original ten plan documents, excluding audit files
> **Last Updated**: 2026-09-16
> **Same-Session Review**: Plan created in this session; independent cluster reviewers and a blind recommendation challenger counter same-agent bias.

## Scope and Codebase Context

Target: original ten plan documents. Context only: approved RD-03, its preflight report,
requirements register, AGENTS.md, feature roadmap, actual source/tests/manifests.
Initial modification set: audit report and continuity notes only. On 2026-09-16 the user approved
all simplified corrections, authorizing this plan's edits plus the exact RD-03 AC-14 amendment.
Strict scope: exact 18-key operational policy, existing 60-second local cache, direct transaction
and audit helpers, SDK/CLI, four-tab terminal Admin UI. All 17 approved ARs remain respected.

Porta uses TypeScript ESM, Koa, PostgreSQL, Redis, Yarn workspaces and JSVision. Recon examined the
existing config reader/routes, transaction/audit helpers, internal protection reader, recovery
processor, locale initialization, limiter and lockout call sites, SDK domain/agent/manifests,
CLI commands/workspace/lifecycle, migration schema and specification registration/tests.
References resolve to existing seams or explicitly proposed new feature files. Migration 030 must
retain compatible database metadata values; public `integer` is not a legacy SQL metadata enum.

All 13 dimensions scanned. Independent packets covered all five clusters. Applicable domain lenses:
web application, distributed/cache, data/migration. No compiler or financial domain applies.
No new OIDC protocol behavior is specified; no external protocol-conformance claim was inferred.
Structural checks: required documents/links, closed ARs, 59 unique tasks and specification-first
phase ordering pass. Plan parser reports no target-local structural problems. Its repository-wide
nonzero exit concerns unrelated legacy plans and is outside this audit.
Local Markdown link validation and `git diff --check` pass. No product test suites run for this
planning-only audit.

## Summary by Dimension

Counts below use each finding's primary dimension; cross-dimension symptoms are not duplicated.

| # | Dimension | Findings | Highest severity |
|---|---|---:|---|
| 1 | Ambiguities | 1 | Minor |
| 2 | Implicit assumptions | 0 | — |
| 3 | Logical contradictions | 2 | Major |
| 4 | Completeness gaps | 1 | Major |
| 5 | Dependency issues | 0 | — |
| 6 | Feasibility | 1 | Major |
| 7 | Testability | 1 | Major |
| 8 | Security blind spots | 0 | — |
| 9 | Edge cases | 1 | Major |
| 10 | Scope creep | 0 | — |
| 11 | Ordering | 1 | Major |
| 12 | Consistency | 1 | Minor |
| 13 | Codebase alignment | 0 | — |

| Severity | Count | Decision |
|---|---:|---|
| Critical | 0 | — |
| Major | 7 | Resolved and verified |
| Minor | 2 | Resolved and verified |
| Observation | 0 | — |

## Findings

### PF-001: CLI strings cannot call the proposed closed SDK lookup 🟠 MAJOR

**Dimension:** 3, logical contradictions.
**Location:** `03-03-sdk-cli.md:33,52–59`; ST-32/ST-37.
**Codebase Evidence:** `packages/cli/src/commands/config.ts:25–31,78,114`;
`packages/sdk/src/domains/config.ts:12–13,23–29`.
**Problem:** CLI accepts arbitrary string keys and delegates unknown-key rejection to server 404.
Proposed SDK `get(ConfigKey)` cannot receive those strings without an unsafe cast or another
lookup/narrowing mechanism. This contradicts the no-local-registry workflow.

| Option | Resolution | Trade-off |
|---|---|---|
| A | Let read-only SDK `get(key:string)` accept untrusted names; return a typed entry. Keep writes closed; CLI set uses returned `entry.key`. Encode the path segment. | Smallest path; explicitly relaxes the approved read signature. |
| B | Add a separate untrusted-key SDK lookup alongside typed get. | Keeps typed get, but adds a redundant public method. |

**Recommendation:** A. The server already owns key validation; closed writes and typed returned
keys preserve the useful type boundary. Update ST-32 to test closed mutation keys, not rejected
read strings. A copied CLI registry or unsafe cast is rejected.
**User Decision:** Resolved — user approved simplified recommendation A on 2026-09-16; string reads, closed writes and returned typed key applied.

### PF-002: Updates overwrite corrupt rows before checking their integrity 🟠 MAJOR

**Dimension:** 3, logical contradictions.
**Location:** `03-02-admin-api.md:75–88,102`; ST-23/ST-29.
**Codebase Evidence:** `packages/server/src/routes/config.ts:136–159`; owning RD-03 AC-14:104–106.
**Problem:** UPDATE followed by validation of the returned new row silently replaces an invalid
stored value. The approved contract explicitly requires authoritative updates on invalid stored
catalog values to return 503.

| Option | Resolution | Trade-off |
|---|---|---|
| A | Read and validate targeted existing rows inside the same transaction before writes; missing/invalid targets return fixed 503. | One bounded query; follows the current requirement. |
| B | Explicitly permit targeted replacement of corrupt values. | Smaller mutation path, but needs separately authorized upstream RD-03 modification. |

**Recommendation:** A, with single/batch corruption specifications proving no data/audit/cache
change. No repair subsystem or extra transaction abstraction.
**User Decision:** Resolved — after proportionality reassessment, user approved B on 2026-09-16, explicitly including the RD-03 AC-14 amendment. Valid submitted values may replace corrupt targeted content directly; missing rows/readback failure remain 503. No preliminary old-value query.

### PF-003: An in-flight read can refill the cache after post-save clearing 🟠 MAJOR

**Dimension:** 9, edge cases.
**Location:** `03-01-catalog-storage-runtime.md:93–104`; `03-02-admin-api.md:83`; ST-12/ST-13.
**Codebase Evidence:** `packages/server/src/lib/system-config.ts:67–79,194–195`.
**Problem:** A normal authentication SELECT can fetch old policy, finish after the save commits and
clears the map, then cache that old policy again. A read started after successful save can see stale
policy for another cache lifetime. This is normal overlapping server reads, not concurrent admins.

| Option | Resolution | Trade-off |
|---|---|---|
| A | Replace the active Map on clear; each query retains its starting Map. Old completions cannot populate the replacement. | Small module-local change, no version state. |
| B | Use a module-local invalidation counter and discard obsolete query completions. | Also correct, adds counter bookkeeping. |

**Recommendation:** A. Add deterministic delayed-read → commit/clear → old-completion coverage.
An already-started read may finish; it must not refill the active cache.
**User Decision:** Resolved — user approved A on 2026-09-16; starting-map capture/replacement and delayed-completion oracle specified.

### PF-004: The SDK type specification is not enrolled in typecheck 🟠 MAJOR

**Dimension:** 7, testability.
**Location:** `99-execution-plan.md:104`; ST-32 and test-file mapping.
**Codebase Evidence:** `packages/sdk/tests/type-contracts/tsconfig.json:12–19`;
`packages/sdk/package.json:36–37`; source tsconfig excludes tests.
**Problem:** The planned new type-contract file is outside the explicit compiler include list.
Vitest does not verify compile-time rejection, so the claimed oracle would not run.

| Option | Resolution | Trade-off |
|---|---|---|
| A | Enrol this file in the existing explicit include list in the spec-author task; run typecheck for red/green evidence. | Direct existing convention. |
| B | Change discovery to a wildcard include. | Broader unrelated enrollment-policy change. |

**Recommendation:** A. No new runner or validator.
**User Decision:** Resolved — user approved A on 2026-09-16; explicit enrollment and compiler red/green tasks specified.

### PF-005: Superseded contracts and config consumers are missing from the task inventory 🟠 MAJOR

**Dimension:** 4, completeness.
**Location:** Phase 1.1/1.2 and Phase 3.1/3.2; `02-current-state.md` impact inventory.
**Codebase Evidence:** `packages/server/tests/unit/lib/system-config.test.ts:14–16,40–49,74–77`;
`packages/sdk/tests/domains/config.test.ts:37–54,71–75,92–96`;
`packages/sdk/src/agent.ts:425–428`.
**Problem:** Existing tests demand retired coercion, caller defaults, arbitrary/dotted keys,
string updates and the old result. Agent config.set metadata still instructs string values and
advertises the old result. New specs alone leave conflicting tests and a broken public consumer.

**Only viable target-local option A:** Explicitly inventory and supersede changed legacy config
contracts during the matching specification-first steps; update the existing agent config operation
metadata and its tests to native values/new result. Preserve all still-applicable safety assertions.
Deprecated compatibility readers/results are rejected by the approved no-compatibility scope.
**Recommendation:** A. Use existing tests and agent metadata, not a new integration layer.
**User Decision:** Resolved — user approved A on 2026-09-16; legacy contract inventory and existing agent metadata/tests added to spec/implementation tasks.

### PF-006: The real migration oracle is authored after migration implementation 🟠 MAJOR

**Dimension:** 11, ordering.
**Location:** ST-7; `99-execution-plan.md:44,54,65`.
**Codebase Evidence:** `packages/server/tests/integration/setup.ts:56–69`;
`packages/server/tests/integration/migrations/application-client-correction.spec.test.ts:12–30,48–80`.
**Problem:** ST-7 requires real upgrade overwrite/deletion/native JSONB evidence, but initial
spec work maps it only to a unit file. Real database coverage appears after implementation.
Ordinary setup already migrates before tests, so post-migration fixtures cannot prove upgrade behavior.

**Only viable option A:** Author a focused isolated-schema integration migration specification
before task 1.2.2, using the existing pattern and prescribed pre-upgrade fixture; record red/green
evidence. Keep SQL/Down unit checks. Mock-only coverage is insufficient for this accepted behavior.
**Recommendation:** A. No custom harness.
**User Decision:** Resolved — user approved A on 2026-09-16; real isolated-schema migration specification moved before implementation.

### PF-007: The no-scroll form has no feasible compact-size contract 🟠 MAJOR

**Dimension:** 6, feasibility (also testability).
**Location:** `03-04-admin-ui.md:67–80`; ST-40.
**Codebase Evidence:** `packages/cli/src/admin/organization-workspace.ts:162`;
`packages/cli/tests/admin/organization-workspace.spec.test.ts:251–252`;
`packages/cli/src/admin/application.ts:451–452,999–1000`;
JSVision window padding and tab chrome in installed `@jsvision/ui`.
**Problem:** Eight lifetime fields plus seven gaps require fifteen field rows, before tab padding,
frame, help and persistent footer. Existing 49×19 compact geometry cannot fit that layout.
Generic 32×8 recoverability does not supply a configuration-specific fallback. ST-40 has no exact
fit/fallback oracle.

| Option | Resolution | Trade-off |
|---|---|---|
| A | Calculate feature-specific minimum width/height from the actual DSL fields/help/chrome; below it show existing resize guidance, preserve drafts, and do not render clipped editable controls. | Simplest single-column design; smaller terminals must resize. |
| B | Use explicitly tested paired DSL columns plus a calculated fallback minimum. | Shorter form, wider minimum and additional layout decisions. |

**Recommendation:** A. Add explicit fitting and undersized geometry tests; keep no-scroller,
four-tab decisions. Do not revive a universal 48×12 assertion.
**User Decision:** Resolved — user approved A on 2026-09-16; measured fitting/undersized geometry and existing resize guidance specified.

### PF-008: Raw numeric text and native draft equality are not defined 🟡 MINOR

**Dimension:** 1, ambiguity.
**Location:** `03-04-admin-ui.md:53–57,85–86`; ST-41.
**Codebase Evidence:** Existing JSVision Inputs bind string signals, for example
`packages/cli/src/admin/organization-workspace.ts:208–220`.
**Problem:** A draft scalar compared with a loaded number cannot also preserve invalid/incomplete
input text. Comparing text "900" with number 900 could incorrectly report dirty state.

**Recommendation/option A:** Keep raw text plus derived validated native value. Compare valid
numbers with loaded numbers; changed invalid text disables Save. Specify clearing, restoring and
numerically equivalent input cases. A small direct state representation, not a form framework.
**User Decision:** Resolved — user approved A on 2026-09-16; raw text/derived native equality and clear/restore cases specified.

### PF-009: Acceptance-criterion count is stale 🟡 MINOR

**Dimension:** 12, consistency.
**Location:** `01-requirements.md:39–40`.
**Evidence:** Owning RD-03 contains AC-01–AC-21; the same plan maps through AC-21.
**Recommendation/option A:** Replace 14 with 21, or remove the unnecessary count.
**User Decision:** Resolved — user approved A on 2026-09-16; criterion count corrected to 21.

## Recommendation Hardening and Verdict

The blind challenger independently selected A for all seven majors. Lead recommendations
converged; confidence High. Strongest counterarguments and alternatives appear above.
No extra complexity escalation is required: each correction is feature-local code/test enrollment
or clarification using existing facilities. No new package, framework, worker, distributed protocol,
automatic retry or concurrent-editor workflow is recommended.

Adversarial checklist completed: challenged creation assumptions, protocol boundaries, actual
consumer dependencies, delayed cache writes, and migration-before/after evidence.
Consider an additional human maintainer review because configuration affects authentication policy.

The proportionality challenger revised PF-002 to B: validating the new value protects the same
mutation boundaries without an old-value read. User approved that simplification and exact upstream
amendment. Other picks remain A. The first-scan recommendations above are retained as history.

Iteration 2: all nine authorized corrections applied and verified. All 13 dimensions rechecked;
all five independent clusters report no residual or new findings. PF-002's overview/read-summary
wording was completed and directly confirmed by the independent reviewer. The exact authorized
RD-03 amendment was checked against mutation validation, atomicity, audit and missing-row behavior;
its historical requirements-report hash predates this amendment, so the current governing revision
is recorded above rather than silently trusting the older hash.

| Findings | Verification |
|---|---|
| PF-001, PF-002, PF-008, PF-009 | Independent soundness review confirms type boundary, simplified update contract, text/native equality and count |
| PF-003 | Independent risk review confirms starting-map capture/replacement and delayed completion oracle |
| PF-004–PF-006 | Independent delivery review confirms enrollment, contract inventory and real migration oracle before implementation |
| PF-007 | Independent risk/fit reviews confirm measured minimum and recoverable no-scroll geometry |
| All | Codebase alignment confirms existing implementation seams; scope review finds no extra machinery |

Document validation: local links and diff checks pass; target plan parser has no problems and
retains 59 pending tasks. Unrelated repository-wide legacy-plan and portfolio counter drift is not
changed. Plan verdict is passing, not a claim that implementation or product tests have run.
Feature roadmap advances only RD-03 to Plan Preflighted; portfolio remains untouched on this
non-integration branch.
No implementation, commit or push performed.
