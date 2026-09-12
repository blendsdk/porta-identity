## Preflight Report: Organization Context and Navigation Plan

> **Status**: PASSED — all 17 findings resolved
> **Iteration**: 3 (bounded blocker recheck)
> **Artifact**: full implementation plan at `codeops/features/admin-ui/plans/organization-context-navigation/`
> **Artifact content hash**: `89ebd82fd0992800ed6a13712bcc036854c89d7e498f1004d96c4241a3d09ead`
> **Codebase Grounded**: 25 source, test, manifest, dependency, and framework-contract files examined
> **Last Updated**: 2026-08-28

> **SAME-SESSION REVIEW:** This plan was created in the current working session. Independent
> clustered auditors and a separate whole-batch challenger were used to reduce same-agent bias.

### Audit Scope

- **Audit target:** the nine authored plan documents in this directory
- **Modification set:** this report only; plan fixes require explicit user authorization
- **Context documents:** approved RD-02 and its preflight/ambiguity records, current CLI/SDK/server
  code needed to verify plan claims, project guidance, and the admin-ui roadmap
- **Product-scope baseline:** organization context/navigation in the existing `porta admin` CLI;
  no server, SDK, dependency, workspace, workflow, runtime-matrix, search, or pagination work
- **Scope mode:** strict
- **Domain lenses:** web application and distributed/concurrent operation ownership

### Codebase Context Summary

**Tech Stack:** Node.js 24 LTS, TypeScript ESM, Yarn Classic/Turbo, JSVision 1.6.0, and the
existing Porta SDK.

**Architecture:** `porta admin` is a stateful JSVision application. `application.ts` owns one
abortable modal/session operation, `presentation.ts` owns responsive terminal chrome,
`session-service.ts` validates live UserInfo, and `commands/admin.ts` performs TTY/server wiring.
The SDK already owns organization list/create and transparent token refresh. The packed playground
installs packed SDK/CLI artifacts and drives a real PTY/browser login.

**Key files examined:** `packages/cli/src/admin/{application,presentation,session-service,state}.ts`,
`packages/cli/src/auth/{types,login-coordinator}.ts`, `packages/cli/src/commands/{admin,org}.ts`,
`packages/cli/src/client-factory.ts`, `packages/sdk/src/{domains/organizations,types/organizations,
errors/index,transport/node-transport}.ts`, `packages/server/src/routes/organizations.ts`, current
admin tests and packed journey files, and JSVision's Dialog/ListView/event-loop declarations.

### Summary by Dimension

|   # | Dimension              | Findings | Highest severity |
| --: | ---------------------- | -------: | ---------------- |
|   1 | Ambiguities            |        0 | —                |
|   2 | Implicit Assumptions   |        1 | 🟠 Major         |
|   3 | Logical Contradictions |        1 | 🟠 Major         |
|   4 | Completeness Gaps      |        1 | 🟠 Major         |
|   5 | Dependency Issues      |        0 | —                |
|   6 | Feasibility Concerns   |        1 | 🟠 Major         |
|   7 | Testability            |        1 | 🟡 Minor         |
|   8 | Security Blind Spots   |        1 | 🟠 Major         |
|   9 | Edge Cases             |        1 | 🟠 Major         |
|  10 | Scope Creep Indicators |        0 | —                |
|  11 | Ordering & Sequencing  |        1 | 🟠 Major         |
|  12 | Consistency            |        1 | 🟡 Minor         |
|  13 | Codebase Alignment     |        1 | 🟠 Major         |

### Summary by Severity

| Severity       | Count | Status      |
| -------------- | ----: | ----------- |
| 🔴 Critical    |     0 | None        |
| 🟠 Major       |    10 | 10 resolved |
| 🟡 Minor       |     7 | 7 resolved  |
| 🔵 Observation |     0 | None        |

---

### PF-001: Reauthentication outcomes cannot pass through the planned service result 🟠 MAJOR

**Dimension:** Feasibility Concerns

**Location:** `03-01-organization-state-and-service.md` §§Organization Validation/Operations;
`03-03-application-and-session-integration.md` §Reauthentication; ST-07, ST-29, ST-30

**Codebase Evidence:** `packages/sdk/src/domains/organizations.ts:30-55` returns the raw complete
SDK list. The plan's wrapper then collapses every malformed list to one `invalid-response` and
accepts no selected UUID.

**The Problem:** Reauthentication must clear a malformed matching organization but preserve the
prior selection for malformed unrelated/envelope data. The proposed result cannot distinguish
those transitions.

**Options:**

| Option | Description                                                                                                                                     | Trade-off                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A      | Add a narrow `reconcile(selectedId)` operation returning sanitized `match`, `absent`, `matching-invalid`, and generic-invalid/failure outcomes. | Small extra service operation; keeps ordinary `listAll()` simple and all-or-nothing. |
| B      | Return structured sanitized validation metadata from every `listAll()`.                                                                         | One API, but burdens ordinary chooser calls with reconciliation-only detail.         |

**Recommendation:** Option A, plus immutable cases for malformed-match clearing and
malformed-unrelated preservation.

**Confidence:** High. **Hardening:** Whole-batch challenger converged.

**User Decision:** Resolved — user approved the consolidated minimal correction on 2026-08-28.

### PF-002: Planned dialog commands do not match JSVision's modal contract 🟠 MAJOR

**Dimension:** Codebase Alignment

**Location:** `03-02-dialogs-and-presentation.md` §§Commands/Identity Dialog/Organization Chooser;
`03-03-application-and-session-integration.md` §§Operation Ownership/Initial Authentication

**Codebase Evidence:** JSVision confines commands to the modal subtree
(`node_modules/@jsvision/ui/dist/event/types.d.ts:300-307`), standard `Dialog` terminates only on
`ok`, `cancel`, `yes`, or `no` (`dist/dialog/dialog.js:20-21,168-205`), and `ModalDialogHost.loop`
exposes only `execView` (`dist/dialog/message-box.d.ts:20-26`). Existing cancellation belongs to
`runAbortableDialog()` at `packages/cli/src/admin/application.ts:170-184`.

**The Problem:** Dialog-local custom Create/Switch commands cannot terminate the standard dialog;
global Reauthenticate cannot run under modal scope; the chooser result lacks a reauthenticate
variant; and `showWhoAmIDialog(..., signal)` cannot close through its declared host.

**Options:**

| Option | Description                                                                                                                                                      | Trade-off                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| A      | Use standard terminating commands internally, map them to typed results including `reauthenticate`, and keep abort handling in the existing application wrapper. | Smallest change; internal command mapping is less semantically pretty.    |
| B      | Add a custom Dialog subclass or richer modal host.                                                                                                               | Explicit custom commands, but adds unnecessary modal lifecycle machinery. |

**Recommendation:** Option A. Release chooser ownership before scheduling reauthentication and
test that handoff plus late-result quarantine.

**Confidence:** High. **Hardening:** Whole-batch challenger converged.

**User Decision:** Resolved — user approved the consolidated minimal correction on 2026-08-28.

### PF-003: A final Create 401 leaves the recovery gate undefined 🟠 MAJOR

**Dimension:** Edge Cases

**Location:** `03-03-application-and-session-integration.md` §§Operation Ownership/Create Flow;
ST-02, ST-27, ST-31

**Codebase Evidence:** Admin authentication/authorization middleware returns before the create
handler on 401 (`packages/server/src/middleware/admin-auth.ts:156-173,206-232,253-267,301-314`;
`packages/server/src/routes/organizations.ts:170-182`).

**The Problem:** Recovery is set at dispatch and cleared for success/400/403/409, but not for a
final SDK-handled 401. After reauthentication, a create-only administrator cannot clear the stale
gate through a list reload because read capability may be absent.

**Options:**

| Option | Description                                              | Trade-off                                                       |
| ------ | -------------------------------------------------------- | --------------------------------------------------------------- |
| A      | Clear recovery before entering session-invalid handling. | Relies on the current, verified pre-handler 401 boundary.       |
| B      | Reset recovery after a newly verified session.           | Delays the correction and obscures why the outcome is definite. |

**Recommendation:** Option A, with a final-401 → reauthenticate → create-only specification case.

**Confidence:** High. **Hardening:** Whole-batch challenger converged.

**User Decision:** Resolved — user approved the consolidated minimal correction on 2026-08-28.

### PF-004: The accepted packed cleanup path is broken and insufficiently guarded 🟠 MAJOR

**Dimension:** Security Blind Spots

**Location:** AR-10; `01-requirements.md` acceptance criterion 3; ST-34; Phase 4 tasks 4.1–4.2

**Codebase Evidence:** `porta org destroy --force` first requests a dry run
(`packages/cli/src/commands/org.ts:494-524`), but the SDK sends `dryRun=true`
(`packages/sdk/src/domains/organizations.ts:94-100`) while the server accepts only `dry-run=true`
(`packages/server/src/routes/organizations.ts:337-366`). The supposed preview therefore deletes,
then the CLI's follow-up read fails. The current outer teardown removes live services/credentials at
`docker/admin-playground/tests/support/admin-cli-journey.mjs:223-271`.

**The Problem:** The named cleanup command cannot report successful cleanup. The plan also does not
prove the high-entropy slug was absent/test-owned before destructive cleanup, order cleanup before
Compose/temp-home teardown, or deterministically exercise failure after create dispatch.

**Options:**

| Option | Description                                                                                                                                                                                                                                          | Trade-off                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| A      | Add a test-only helper using the installed packed SDK and temporary credentials: prove the high-entropy slug absent, verify nonce-bearing ownership, destroy once in an inner `finally`, verify absence, and test an injected post-dispatch failure. | Scoped and deterministic; duplicates a small amount of test client setup.             |
| B      | Repair the existing SDK/server/CLI destroy contract first.                                                                                                                                                                                           | Makes the CLI reusable, but expands into forbidden SDK/server/unrelated-command work. |
| C      | Reset the playground environment.                                                                                                                                                                                                                    | Simple cleanup but contradicts the accepted exact-resource boundary.                  |

**Recommendation:** Option A. Preserve both the primary journey error and any cleanup error.

**Confidence:** High. **Hardening:** Whole-batch challenger converged.

**User Decision:** Resolved — user approved the consolidated minimal correction on 2026-08-28.

### PF-005: Phase/test allocation violates specification-first execution 🟠 MAJOR

**Dimension:** Ordering & Sequencing

**Location:** `07-testing-strategy.md` ST-12, ST-14, ST-17, ST-20 and test mapping;
`99-execution-plan.md` Phases 2–3

**Codebase Evidence:** Command gating is application-owned at
`packages/cli/src/admin/application.ts:302-375`; credential/origin-sensitive production wiring is
in `packages/cli/src/commands/admin.ts:73-108`.

**The Problem:** Phase 2 promises ST-11–ST-20 green before Phase 3 implements ST-14's no-request
behavior, ST-17 command gating, and ST-20 modal cancellation. Phase 3's lazy client wiring has only
a later implementation diagnostic. ST-12 tests dialog content but not the real Who am I keyboard,
menu, modal, close, and focus path.

**Options:**

| Option | Description                                                                                                                                                                                        | Trade-off                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A      | Keep four phases; move application-owned ST portions to Phase 3, add Phase 2 Who am I application specification, and add a pre-implementation lazy-wiring/server-binding specification in Phase 3. | Precise small edits; some ST cases are split by ownership.               |
| B      | Merge Phases 2 and 3.                                                                                                                                                                              | Avoids allocation bookkeeping but creates a much larger red/green batch. |

**Recommendation:** Option A.

**Confidence:** High. **Hardening:** Both delivery and whole-batch challengers converged.

**User Decision:** Resolved — user approved the consolidated minimal correction on 2026-08-28.

### PF-006: Packed identity evidence is not migrated to Who am I 🟠 MAJOR

**Dimension:** Completeness Gaps

**Location:** ST-33 and Phase 4 task 4.2.1

**Codebase Evidence:** The current journey waits for email in the main frame and reports success
only when terminal output contains it
(`docker/admin-playground/tests/support/admin-cli-journey.mjs:199-208,251-260`). RD-02 removes
identity from the landing view.

**The Problem:** Following the plan makes the existing packed identity evidence time out or invites
weakening it.

**Options:** The only in-scope path is to cancel/close the initial chooser, open Who am I through
the real keyboard/menu path, observe the verified email, close it, then continue explicit switch
and create actions. Restoring identity to the landing view contradicts RD-02; dropping the evidence
weakens an existing specification.

**Recommendation:** Add that journey to ST-33 and task 4.2.1.

**Confidence:** High. **Hardening:** Both delivery and whole-batch challengers converged.

**User Decision:** Resolved — user approved the consolidated minimal correction on 2026-08-28.

### PF-007: Token-refresh maintenance conflicts with a literal switching invariant 🟠 MAJOR

**Dimension:** Implicit Assumptions

**Location:** `00-index.md` overview; `03-03-application-and-session-integration.md` §§Production
Wiring/Switch Flow; ST-22

**Codebase Evidence:** `createClient()` deliberately uses refresh-capable CLI auth
(`packages/cli/src/client-factory.ts:57-67`); the transport refreshes and replays once after 401
(`packages/sdk/src/transport/node-transport.ts:66-80`) and may durably persist refreshed credentials.

**The Problem:** The plan says switching does not mutate token/credentials while also reusing the
standard client unchanged. A list request can transparently refresh the global session.

**Options:**

| Option | Description                                                                                                                                                                   | Trade-off                                                                                     |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A      | Build a non-refreshing list/switch client.                                                                                                                                    | Literal no-write behavior, but duplicates auth/client machinery and makes normal expiry fail. |
| B      | Clarify that switching does not change issuer/server/profile/tenant binding or initiate authentication; transparent global-session refresh remains allowed RD-01 maintenance. | Matches existing thin client reuse; narrows the wording to its intended product meaning.      |

**Recommendation:** Option B. This is a clarification, not a new feature.

**Confidence:** High. **Hardening:** Whole-batch challenger converged.

**User Decision:** Resolved — user approved the consolidated minimal correction on 2026-08-28.

### PF-008: Existing immutable specifications have no controlled supersession path 🟠 MAJOR

**Dimension:** Logical Contradictions

**Location:** `99-execution-plan.md` execution rule and task 2.1.2

**Codebase Evidence:** `packages/cli/tests/admin/application.spec.test.ts:40-141,168-207` mixes
RD-02-superseded Application/Session menu, landing identity, and no-Organizations assertions with
still-binding theme, normalized-server, authentication, warning, shortcut, lifecycle, and security
assertions.

**The Problem:** The plan says ST-derived expectations are immutable but also says to replace the
mixed foundation-summary expectations. Blanket replacement can weaken valid RD-01 behavior;
absolute immutability prevents the authorized RD-02 change.

**Options:**

| Option | Description                                                                                                                                            | Trade-off                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| A      | Inventory assertion-level supersession and directly replace only RD-02-conflicting assertions while re-expressing every retained invariant.            | Least churn; proof is mainly documentary.                                        |
| B      | Inventory every assertion, first split the mixed tests while green, then retire only RD-02-superseded presentation cases and author the new red specs. | One extra mechanical test step; clearest proof that surviving invariants remain. |

**Recommendation:** Option B. The independent challenge changed the initial preference because the
current tests are materially mixed, making the green split useful rather than ceremonial.

**Confidence:** High. **Hardening:** Whole-batch challenger diverged toward the stronger green-split
sequence; the final recommendation adopts it.

**User Decision:** Resolved — user approved the consolidated minimal correction on 2026-08-28.

### PF-009: Organization rows unnecessarily require ASCII-safe names 🟡 MINOR

**Dimension:** Consistency

**Location:** `03-02-dialogs-and-presentation.md` §Organization Chooser; ST-13/ST-16

**Codebase Evidence:** Server organization names are bounded but not ASCII-only
(`packages/server/src/routes/organizations.ts:55-58`); current terminal sanitization rejects
controls while retaining Unicode (`packages/cli/src/admin/presentation.ts:58-68`), and JSVision
uses width-aware cells.

**The Problem:** “ASCII-safe” could strip legitimate names such as `München`, exceeding RD-02.

**Options:** The only requirement-preserving correction is “control-free and clipped by display
cell width”; ASCII fallback remains limited to the hamburger label.

**Recommendation:** Apply that wording correction.

**User Decision:** Resolved — user approved the consolidated minimal correction on 2026-08-28.

### PF-010: ST-35 is not a deterministic packed runtime specification 🟡 MINOR

**Dimension:** Testability

**Location:** `07-testing-strategy.md` ST-35/test mapping/checklist; Phase 4 final verification

**The Problem:** ST-35 asks a packed runtime test to inspect repository diff/scope, but the runtime
test has no stable phase baseline and becomes dirty-worktree dependent. The execution plan already
owns phase baselines and final diff inspection.

**Options:**

| Option | Description                                                                                                                                     | Trade-off                                                        |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| A      | Move ST-35 to deterministic final execution evidence against the recorded baseline; keep `yarn test:structure` for static repository contracts. | Correct ownership; ST-35 is evidence rather than a runtime test. |
| B      | Narrow ST-35 to structure-testable assertions and keep diff inspection as separate final evidence.                                              | Retains a test ID but splits the claim.                          |

**Recommendation:** Option A.

**User Decision:** Resolved — user approved the consolidated minimal correction on 2026-08-28.

## Iteration 2 Findings

The ten iteration-1 findings were accepted, applied, and verified. The bounded re-scan found the
following direct residuals.

### PF-011: The owning RD still forbids accepted transparent session refresh 🟠 MAJOR

**Dimension:** Logical Contradictions

**Location:** Plan ST-22 and `03-03` §Production Wiring; context document RD-02 OC-08 and AC-3

**The Problem:** The corrected plan allows ordinary RD-01 session refresh while switching, but the
owning RD still literally says no token exchange or credential write. The requirement must be
synchronized before it can remain the implementation oracle.

**Recommendation:** Apply the same narrow clarification to RD-02 OC-08/AC-3: switching never changes
organization-specific issuer/server/profile binding or initiates authentication, while transparent
global-session maintenance remains allowed. This requires explicit authorization to add RD-02 to
the modification set.

**User Decision:** Resolved — user authorized the RD-02 modification set and instructed execution
to proceed with `--auto-design` on 2026-08-28.

### PF-012: The packed journey sequence needs two explicit existing-boundary steps 🟠 MAJOR

**Dimension:** Completeness Gaps

**Location:** ST-33/ST-34 and Phase 4 task 4.2.1

**The Problem:** The plan does not explicitly close the initial chooser before invoking global Who
am I, and an in-process cleanup client is not guaranteed to inherit the temporary credential/TLS
boundary used by spawned packed commands.

**Recommendation:** State that the journey cancels the chooser and restores focus before Who am I;
run cleanup in a packed Node child with `NODE_USE_SYSTEM_CA=1`, the temporary home/credentials, and
the selected issuer. Keep the absent-before-dispatch proof in ST-34/task 4.2.1.

**User Decision:** Resolved — Option A selected under delegated auto-design authority. The plan
now uses the existing chooser/focus boundary and a packed Node cleanup child; no new harness or
production surface was added.

### PF-013: ST-13 combines three different validation outcomes 🟡 MINOR

**Dimension:** Testability

**The Problem:** Identity controls require fallback, invalid organization data rejects the response,
and valid long Unicode names are display-width clipped. One combined expectation is ambiguous.

**Recommendation:** Split ST-13 into those three explicit outcomes.

**User Decision:** Resolved — the cases are separated by outcome under delegated auto-design
authority.

### PF-014: Duplicate selected UUID reconciliation is undefined 🟡 MINOR

**Dimension:** Edge Cases

**Recommendation:** Treat duplicate matching UUID rows as generic invalid-response and preserve the
prior selection, consistent with all-or-nothing list handling; add one focused case.

**User Decision:** Resolved — duplicate matching UUID rows use the existing generic-invalid,
preserve-selection outcome under delegated auto-design authority.

### PF-015: Malformed SDK page envelopes cannot be identified through unchanged `listAll()` 🟡 MINOR

**Dimension:** Feasibility Concerns

**Recommendation:** Map failures thrown before `listAll()` returns to `unavailable`; reserve
`invalid-response` for malformed arrays/rows that reach the wrapper. Both preserve selection.

**User Decision:** Resolved — pre-return SDK failures map to unavailable under delegated
auto-design authority because the unchanged SDK exposes no malformed-envelope discriminator.

### PF-016: Lazy production wiring has no unique ST identifier 🟡 MINOR

**Dimension:** Traceability

**Recommendation:** Add one explicit ST row for lazy selected-server wiring and map
`command.spec.test.ts` to it instead of overloading ST-21.

**User Decision:** Resolved — ST-35 now uniquely owns lazy selected-server wiring under delegated
auto-design authority.

### PF-017: Simultaneous journey and cleanup failures can hide one another 🟡 MINOR

**Dimension:** Testability

**Recommendation:** Preserve both in an ordered `AggregateError` and cover primary-only,
cleanup-only, and simultaneous failures in the existing focused cleanup check.

**User Decision:** Resolved — ordered `AggregateError([primary, cleanup])` evidence was added under
delegated auto-design authority.

## Iteration 3 Recheck

The third iteration was intentionally bounded to PF-011, PF-012, PF-017, and their direct
requirement/test links. Independent soundness and delivery challengers both returned clean. No new
broad audit cycle was opened.

### Auto-design provenance

- **Authority:** AI — delegated by `--auto-design`
- **Eligibility:** implementation/test mechanics within the already approved RD-02 behavior
- **Objective:** preserve tenant/server/authentication boundaries with the smallest viable CLI-only design
- **Decision:** apply the narrow corrections recorded in PF-012–PF-017; PF-011's modification-set expansion was explicitly authorized by the user
- **Evidence:** existing JSVision modal ownership, SDK refresh behavior, packed CLI credential/TLS setup, and plan specification mappings
- **Rejected alternatives:** new modal framework, non-refreshing client, server/SDK cleanup repair, pagination/search, or a new harness; each adds scope or machinery not required by RD-02
- **Strongest counterargument:** a broader abstraction could centralize lifecycle handling, but it would increase surface area without improving the accepted behavior
- **Confidence:** High — both bounded independent challengers found no residual blocker
- **Hardening:** independent soundness and packed-delivery rechecks converged cleanly
- **Policy version:** 1
- **Root invocation ID:** `ad-20260828-admin-ui-rd02`
- **Reopen triggers:** a changed JSVision termination contract, changed SDK refresh semantics, or packed-playground credentials no longer being readable by a child process

### Verdict

**✅ PREFLIGHT PASSED — all 17 findings are resolved.** The plan is ready for execution in the
existing CLI workflow.
