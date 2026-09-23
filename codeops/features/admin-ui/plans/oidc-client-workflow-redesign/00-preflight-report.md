# Preflight Report: OIDC Client Workflow Redesign

> **Status**: ✅ PREFLIGHT PASSED — all 13 findings resolved and verified
> **Iteration**: 2 (bounded re-scan after accepted fixes)
> **Previous Iteration**: 13 findings — all resolved
> **This Iteration**: 0 new findings
> **Carried Forward**: None
> **Artifact**: full implementation plan at
> `codeops/features/admin-ui/plans/oidc-client-workflow-redesign/`
> **Artifact Content Hash**: `8852c0912cc310857adab5296acea516e73484b99db15ce51f35170419a2dee6`
> **Codebase Grounded**: 18 source, test, policy, and manifest files examined; 38 references verified
> **Last Updated**: 2026-09-08
>
> **SAME-SESSION REVIEW:** This artifact was created in the current session. Same-agent bias risk is
> elevated. Independent clustered auditors and one recommendation challenger were used, but a new
> session or human identity/OIDC review provides stronger independence.

## Audit Scope

- **Audit target:** the complete plan directory named above.
- **Context documents:** amended `admin-ui/RD-04`, the feature ambiguity register, project
  `AGENTS.md`, package manifests, JSVision 1.7 declarations, and directly affected source/tests.
- **Modification set:** the user authorized all accepted plan corrections on 2026-09-08; those
  corrections and this report were updated.
- **Scope mode:** strict. Optional Azure capabilities and unrelated existing defects were excluded.

## Codebase Context Summary

**Tech Stack:** Node.js 24, TypeScript ESM, Koa Admin API, public SDK, JSVision terminal CLI,
PostgreSQL, Redis, Vitest, and a retained OIDC SPA/BFF harness.

**Architecture:** the server owns client and secret validation/persistence; the SDK exposes typed
Admin contracts; the CLI keeps immutable organization-scoped projections behind an existing
controller and modal orchestration boundary. The redesign replaces one oversized tabbed editor with
ordinary Layout DSL dialogs and existing JSVision controls.

**Key Files Examined:**

- `packages/server/src/routes/clients.ts`
- `packages/server/src/clients/validators.ts`
- `packages/server/src/clients/secret-service.ts`
- `packages/sdk/src/types/clients.ts`
- `packages/cli/src/admin/client-dialogs.ts`
- `packages/cli/src/admin/client-controller.ts`
- `packages/cli/src/admin/client-workspace.ts`
- `packages/cli/src/admin/client-state.ts`
- `packages/cli/src/admin/application-client-features.ts`
- `packages/cli/src/admin/index.ts`
- existing CLI OIDC workspace specification and implementation suites
- registered assurance commands and project verification policy

## Summary by Dimension

|   # | Dimension              | Findings | Highest Severity |
| --: | ---------------------- | -------: | ---------------- |
|   1 | Ambiguities            |        1 | 🟠 Major         |
|   2 | Implicit Assumptions   |        0 | —                |
|   3 | Logical Contradictions |        2 | 🟠 Major         |
|   4 | Completeness Gaps      |        2 | 🟠 Major         |
|   5 | Dependency Issues      |        0 | —                |
|   6 | Feasibility Concerns   |        1 | 🟠 Major         |
|   7 | Testability            |        1 | 🟠 Major         |
|   8 | Security Blind Spots   |        1 | 🟠 Major         |
|   9 | Edge Cases             |        1 | 🟡 Minor         |
|  10 | Scope Creep Indicators |        0 | —                |
|  11 | Ordering & Sequencing  |        1 | 🟠 Major         |
|  12 | Consistency            |        1 | 🟠 Major         |
|  13 | Codebase Alignment     |        2 | 🟠 Major         |

## Summary by Severity

| Severity    | Count | Status                   |
| ----------- | ----: | ------------------------ |
| CRITICAL    |     0 | None                     |
| MAJOR       |    12 | 12 resolved and verified |
| MINOR       |     1 | 1 resolved and verified  |
| OBSERVATION |     0 | None                     |

## Iteration 2 Verification

| Finding | Verification evidence                                                                                                                                    | Status |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| PF-001  | Post-create flow now presents the secret, then reloads through `select(created.id)`.                                                                     | Closed |
| PF-002  | Initial and rotated expiry now share a strict ISO-instant-to-`Date` contract.                                                                            | Closed |
| PF-003  | One JSVision `ListBox` is placed left normally and above content at compact size.                                                                        | Closed |
| PF-004  | Overview now includes concise authoritative Protocol and Login summaries.                                                                                | Closed |
| PF-005  | Overview owns one small `{clientName}` editor.                                                                                                           | Closed |
| PF-006  | Existing superseded assertions, Admin barrel exports, and direct consumers have explicit migration tasks; no wrappers are added.                         | Closed |
| PF-007  | Raw expiry reaches the one-time presenter; the complete expiry helper is implemented once in Phase 2 and reused in Phase 4.                              | Closed |
| PF-008  | The nine applicable commands include docs, operational protocol assurance, and clean-revision compatibility while root `yarn verify` remains prohibited. | Closed |
| PF-009  | Authentication uses one collection selector and one reused editor region with parent-local staging at 48×12.                                             | Closed |
| PF-010  | One route-local control-free label schema covers initial and rotated labels with C0, DEL, and C1 tests.                                                  | Closed |
| PF-011  | One representative editor abort and one continuation late-result case cover the changed seam without a per-editor matrix.                                | Closed |
| PF-012  | ST-23–ST-45 now contain concrete protocol, collection, geometry, and exact calendar contracts.                                                           | Closed |
| PF-013  | The existing shared server validator and existing server suites now own exact-array uniqueness.                                                          | Closed |

The bounded scan rechecked all 13 dimensions against the unchanged product boundary. It found no
new ambiguity, contradiction, dependency, feasibility, security, scope, ordering, consistency, or
codebase-alignment defect.

## Findings

### PF-001: Post-create flow bypasses the authoritative reload 🟠 MAJOR

**Dimension:** Logical Contradictions
**Location:** `03-02-client-workflow.md`, Post-Create Continuation; `01-requirements.md`
**Codebase Evidence:** `packages/cli/src/admin/client-controller.ts:373-393,569-576`
**The Problem:** The plan merges the create response directly and forbids an extra read, while RD-04
AC-14 requires a definite successful mutation to reload its affected entity or collection. AR-12
decides presentation order and destination, not a reload exemption.

**Options:**

| Option | Description                                                                                         | Pros                                          | Cons                                          |
| ------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------- |
| A      | Present the one-time secret, then reuse the existing `select(created.id)` reload and open Overview. | Meets AC-14 and existing controller behavior. | One expected read.                            |
| B      | Amend AC-14 and define response validation, merge, and ETag semantics.                              | Avoids the read.                              | Adds unnecessary state-publication machinery. |

**Recommendation:** Option A — it is smaller and preserves the existing authoritative boundary.
**Confidence:** High. **Hardening:** Independent challenger confirmed A and rejected merge/ETag work.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-002: ISO expiry contract permits non-ISO parser input 🟠 MAJOR

**Dimension:** Consistency
**Location:** `03-01-initial-secret-contract.md`, Public Contract and Validation
**Codebase Evidence:** `packages/server/src/routes/clients.ts:151-155`; `packages/sdk/src/types/clients.ts:156-160`
**The Problem:** The public contract promises an ISO instant, but `z.coerce.date()` accepts some
non-ISO strings. Initial and rotated secret endpoints could expose inconsistent wire behavior.

**Options:**

| Option | Description                                                                                                                         | Pros                                       | Cons                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------- |
| A      | Use one route-local strict ISO-instant string schema, transform to `Date`, then enforce future time for initial and rotated expiry. | Deterministic public contract; one schema. | Slightly tightens rotation input. |
| B      | Document every string accepted by the runtime parser.                                                                               | Preserves permissive parsing.              | Makes behavior parser-dependent.  |

**Recommendation:** Option A — the typed SDK already exposes ISO strings.
**Confidence:** High. **Hardening:** Independent challenger confirmed A.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-003: Detail-section navigation is undefined 🟠 MAJOR

**Dimension:** Ambiguities
**Location:** `03-02-client-workflow.md`, Proposed Changes and Detail Sections
**Codebase Evidence:** `packages/cli/src/admin/application-workspace.ts`; JSVision
`list/list-box.d.ts:8-35`
**The Problem:** The plan names six sections but does not define the selector, its placement, or its
compact layout. The referenced existing bounded section-list recipe does not exist in Porta.

**Options:**

| Option | Description                                                                                                                             | Pros                                               | Cons                                     |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| A      | Use one existing JSVision `ListBox`, as a left rail normally and above content at compact size; keep Back in the bottom navigation row. | One selection model; keyboard friendly; no router. | One responsive DSL branch.               |
| B      | Use horizontal buttons normally and a `ListBox` when compact.                                                                           | Familiar button presentation.                      | Duplicates controls and resize behavior. |

**Recommendation:** Option A — it directly prevents another scattered-button layout.
**Confidence:** Medium-high. **Hardening:** Independent challenger confirmed A.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-004: Overview omits required authoritative defaults 🟠 MAJOR

**Dimension:** Logical Contradictions
**Location:** `03-02-client-workflow.md`, Detail Sections
**Codebase Evidence:** RD-04 AC-18; existing returned client protocol and effective-login fields
**The Problem:** AC-18 requires the returned Overview to display server-applied protocol and login
defaults, but the plan's exhaustive Overview row omits both.

**Options:**

| Option | Description                                                                             | Pros                                 | Cons                             |
| ------ | --------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------- |
| A      | Add concise read-only Protocol and Login summaries to Overview; retain focused editors. | Satisfies AC-18 using returned data. | Small display duplication.       |
| B      | Amend AC-18 so only the focused sections display the values.                            | Keeps Overview smaller.              | Changes an approved requirement. |

**Recommendation:** Option A — it is a small display-only correction.
**Confidence:** High. **Hardening:** Independent challenger confirmed A.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-005: Mutable client name has no editor 🟠 MAJOR

**Dimension:** Completeness Gaps
**Location:** `03-02-client-workflow.md`, Detail Sections; `03-03-focused-editors.md`
**Codebase Evidence:** `packages/sdk/src/types/clients.ts:112-116`;
`packages/cli/src/admin/client-dialogs.ts:615-623`
**The Problem:** Overview is navigate-only and no focused editor owns `clientName`, although RD-04
requires each editable update field to remain mapped.

**Options:**

| Option | Description                                                                | Pros                                  | Cons                                       |
| ------ | -------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------ |
| A      | Add a small Edit name action/dialog in Overview that emits `{clientName}`. | Smallest UI; direct contract mapping. | One extra focused dialog.                  |
| B      | Add a seventh General section.                                             | Groups general edits.                 | Adds unnecessary navigation for one field. |

**Recommendation:** Option A — a General section is disproportionate.
**Confidence:** High. **Hardening:** Independent challenger confirmed A.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-006: Legacy shared-editor tests and exports are not migrated 🟠 MAJOR

**Dimension:** Codebase Alignment
**Location:** `03-02-client-workflow.md`, Dialog File Responsibilities; `99-execution-plan.md`, Phases 2–4
**Codebase Evidence:** `packages/cli/tests/admin/oidc-clients-workspace.spec.test.ts:359-427`;
`packages/cli/tests/admin/oidc-clients-workspace.impl.test.ts:446-466`;
`packages/cli/src/admin/index.ts:147-173`; `packages/cli/src/admin/client-workspace.ts:29-41`
**The Problem:** Existing immutable tests require the tabbed/scrolled UI being removed, while the
public admin barrel still exports the obsolete tab discriminator and shared-dialog symbols. The
current plan adds suites without owning this migration, so CLI verification or typecheck will fail.

**Options:**

| Option | Description                                                                                                                                                                                   | Pros                                                 | Cons                                                               |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| A      | Revise the existing suites in place, replacing only superseded assertions and preserving valid security/focus/sizing/lifecycle assertions; explicitly update the barrel and direct consumers. | One current specification surface; removes dead API. | Intentional public CLI export change needs compatibility evidence. |
| B      | Preserve deprecated wrappers and duplicate legacy suites.                                                                                                                                     | Avoids immediate symbol removal.                     | Preserves the design being removed and adds maintenance surface.   |

**Recommendation:** Option A — Porta has no compatibility need that justifies dead UI wrappers.
**Confidence:** High. **Hardening:** Independent challenger confirmed A and rejected wrappers.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-007: Secret-expiry UI work is incomplete and split between phases 🟠 MAJOR

**Dimension:** Completeness Gaps
**Location:** `03-02-client-workflow.md`, Post-Create Continuation;
`03-03-focused-editors.md`, Secret Expiry Selector; `99-execution-plan.md`, Phases 2 and 4
**Codebase Evidence:** `packages/cli/src/admin/application-client-features.ts:145-153`;
`packages/cli/src/admin/client-dialogs.ts:813-839`; `packages/cli/src/admin/client-state.ts:68-89`
**The Problem:** AC-11 requires expiry in the one-time dialog, but the presenter contract drops it
and ST-14 does not assert it. The execution plan also assigns partial expiry-helper implementation
to both Phase 2 and Phase 4 and omits some presets from Phase 2.

**Only viable resolution:** Pass raw `expiresAt` through the existing presenter adapter, format the
timestamp or `Never` in the existing dialog, assert both forms in ST-14, and implement the complete
3/6/12/24/custom/Never helper once in Phase 2. Phase 4 only reuses it. A new presentation model or
extra helper phase was considered and dropped as unnecessary.

**Recommendation:** Use the single resolution above.
**Confidence:** High. **Hardening:** Independent challenger confirmed direct presenter plumbing.
**User Decision:** Resolved — User accepted the only viable resolution.

### PF-008: Final verification omits required existing gates 🟠 MAJOR

**Dimension:** Ordering & Sequencing
**Location:** `07-testing-strategy.md`, Verification Checklist; `99-execution-plan.md`, Phase 4
**Codebase Evidence:** project `AGENTS.md`, Feature verification workflow;
`test-harness/assurance/README.md`; registered assurance command selectors
**The Problem:** The plan changes OIDC behavior and public SDK/CLI contracts, but omits applicable
OIDC assurance, clean-revision compatibility assurance, and `yarn docs:build`. Compatibility cannot
run until the implementation and docs are committed cleanly.

**Only viable resolution:** Retain package verifies, structure tests, and `yarn harness:test`; add
`yarn docs:build`, the registered operational protocol assurance command, and registered `p1-admin`
and `protocol` compatibility selectors after a clean implementation commit. Keep the explicit ban
on root `yarn verify`. Extra assurance campaigns and new harnesses were considered and dropped.

**Recommendation:** Use only those existing applicable gates and order compatibility last.
**Confidence:** High. **Hardening:** Independent challenger confirmed this bounded gate set.
**User Decision:** Resolved — User accepted the only viable resolution.

### PF-009: Authentication editor cannot meet 48×12 as described 🟠 MAJOR

**Dimension:** Feasibility Concerns
**Location:** `03-03-focused-editors.md`, Authentication Collections
**Codebase Evidence:** `packages/cli/src/admin/client-dialogs.ts:516-565`; RD-04 AC-16
**The Problem:** Three grids, three inputs, and three action groups cannot all remain usable in the
minimum terminal geometry without a layout rule. Hard-coded scroll extents are forbidden.

**Options:**

| Option | Description                                                                                                                         | Pros                                                 | Cons                                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| A      | Use one three-choice collection selector and reuse one DataGrid/input/action region while one parent-local value stages all arrays. | Fits compact geometry; one Save; no new state layer. | Users switch views to compare collections. |
| B      | Use three child dialogs under a staging parent.                                                                                     | Each editor is compact.                              | Adds modal depth and ownership complexity. |

**Recommendation:** Option A — test collection switching at 48×12 without losing staged edits.
**Confidence:** High. **Hardening:** Independent challenger confirmed A and rejected nested dialogs/scrollers.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-010: Secret labels are not control-free at the server boundary 🟠 MAJOR

**Dimension:** Security Blind Spots
**Location:** `03-01-initial-secret-contract.md`, Validation; `07-testing-strategy.md`, ST-1–ST-7
**Codebase Evidence:** `packages/server/src/routes/clients.ts:95,153`;
`packages/server/src/clients/secret-service.ts:77-89`
**The Problem:** RD-04 limits initial and rotated labels to 0–255 control-free characters, but both
route schemas only enforce length. Direct API calls can persist terminal control text in credential
metadata and audit content.

**Only viable resolution:** Define one bounded control-free Zod string schema in `clients.ts`, reuse
it for initial and rotated labels, and add C0, DEL, and C1 rejection cases. Duplicating validation in
the service was considered and dropped because no current non-route caller requires it.

**Recommendation:** Use the route-local shared schema.
**Confidence:** High. **Hardening:** Independent challenger confirmed this boundary and rejected duplicate layers.
**User Decision:** Resolved — User accepted the only viable resolution.

### PF-011: Focused-editor context loss has one uncovered seam 🟡 MINOR

**Dimension:** Edge Cases
**Location:** `03-03-focused-editors.md`, Error Handling and Testing Requirements
**Codebase Evidence:** `packages/cli/src/admin/application-client-features.ts:526-539`;
`packages/cli/src/admin/client-controller.ts:135-145,504-537`
**The Problem:** Existing controller tests cover quarantine and the new plan covers registration and
plaintext loss, but it does not prove that one new focused editor aborts cleanly or that a late update
result cannot publish into a replaced context.

**Only viable resolution:** Add one representative focused-dialog abort case and add one continuation
late-result case only if the changed controller branch lacks it. A per-editor matrix was considered
and rejected as repetitive.

**Recommendation:** Use the representative seam tests only.
**User Decision:** Resolved — User accepted the only viable resolution.

### PF-012: Focused-editor contract tests are incomplete 🟠 MAJOR

**Dimension:** Testability
**Location:** `07-testing-strategy.md`, ST-23–ST-40
**Codebase Evidence:** `packages/cli/src/admin/client-dialogs.ts:516-623`; RD-04 AC-09 and validation table
**The Problem:** The planned tests do not prove grant/authentication/PKCE/scope payloads,
public-versus-confidential affordances, concrete logout/origin boundaries, or deterministic preset
calendar output. ST-36 lacks exact expected values and no month-end clamp input exists.

**Only viable resolution:** Extend the already planned `oidc-client-editors.spec.test.ts` with a small
table-driven protocol matrix, concrete redirect/logout/origin 0/1/10/11 and syntax boundaries, exact
preset dates/ISO payloads, and one month-end clamp row. No new suite or policy engine is needed.

**Recommendation:** Add only these contract rows to the existing planned suite.
**Confidence:** High. **Hardening:** Independent challenger confirmed this bounded test expansion.
**User Decision:** Resolved — User accepted the only viable resolution.

### PF-013: Duplicate URI rejection exists only in presentation 🟠 MAJOR

**Dimension:** Codebase Alignment
**Location:** `03-03-focused-editors.md`, Authentication Collections and Error Handling;
`07-testing-strategy.md`, ST-26
**Codebase Evidence:** `packages/server/src/clients/validators.ts:129+`; RD-04 validation rules
**The Problem:** RD-04 requires every redirect, logout, and origin collection to reject exact
duplicates, but the existing shared server validator permits them and the plan tests only the UI.
Direct Admin API or SDK callers can bypass the stated invariant.

**Only viable resolution:** Add exact-string uniqueness checks for all three arrays to the existing
shared compatibility validator and focused server tests. UI-only rejection was considered and
rejected because server-side validation is authoritative; a new validation layer is unnecessary.

**Recommendation:** Extend the existing validator only.
**Confidence:** High. **Hardening:** Independent challenger identified and confirmed this in-scope gap.
**User Decision:** Resolved — User accepted the only viable resolution.

## Scope and Proportionality Verdict

The planned design contains no unjustified framework, dependency, service, worker, router, policy
engine, state layer, or test harness. The recommended corrections reuse existing JSVision controls,
route schemas, validators, controller/presenter seams, exports, and test files.

The following were deliberately excluded:

- credential-audit actor propagation, because it is a pre-existing unrelated route omission;
- Azure-only certificate, federation, ownership, directory, exposed-API, and permission features;
- merge/ETag machinery, a General section, nested collection dialogs, dynamic scrollers,
  compatibility wrappers, service-level duplicate validation, per-editor context matrices, and
  assurance campaigns beyond the directly applicable registered gates.

## Adversarial Checklist

- **Creation-time assumption challenged:** the direct post-create merge was not authorized by AR-12
  and contradicted the governing mutation rule; PF-001 corrects it.
- **External convention risk:** this plan does not redefine OIDC protocol semantics; existing server
  compatibility validation and retained protocol harness remain authoritative. PF-012 ensures the UI
  maps to those rules rather than duplicating them.
- **Likely dissenting domain-expert concern:** server-side validation must hold for SDK/direct API
  callers, which produced PF-002, PF-010, and PF-013.
