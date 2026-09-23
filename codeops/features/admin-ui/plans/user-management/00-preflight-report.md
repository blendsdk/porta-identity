## Preflight Report: RD-03 User Management Implementation Plan

> **Status**: ✅ PASSED — all iteration-1 findings and iteration-2 residuals resolved
> **Iteration**: 2 (re-scan after accepted fixes)
> **Artifact**: full implementation plan at `codeops/features/admin-ui/plans/user-management/`
> **Artifact Content Hash**: `00c914b0a91fb34bca7342aba5cea168d91a060c6903eeb9178e6faa2af2feb9`
> **Repository Revision**: `0dc802ce330073341066d8d7c5a6afb02ccb7fe3`
> **Codebase Grounded**: 24 source files examined; 41 source, test, configuration, and documentation references verified
> **Scope Mode**: strict
> **Auto-design**: active; eligible technical resolutions selected, but plan-fix permission remains separate
> **Last Updated**: 2026-08-29

> **SAME-SESSION REVIEW:** This plan was created earlier in the current workflow chain. Five
> independent dimension-cluster dispatches and one blind challenger were used to reduce same-agent
> bias. A fresh human review remains appropriate for this identity-administration feature.

### Audit Scope

| Role             | Artifact                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Audit target     | The 10 plan documents committed under `codeops/features/admin-ui/plans/user-management/` at the recorded tree           |
| Context          | `requirements/RD-03-user-management.md`, its ambiguity register/preflight report, `AGENTS.md`, and current source/tests |
| Product baseline | Approved RD-03 only; no later-RD behavior or optional additions                                                         |
| Modification set | The 10 plan documents and this report, as authorized by the user                                                        |

### Codebase Context Summary

**Tech stack:** Node.js 24 LTS development workflow, TypeScript ESM, Yarn Classic/Turbo, public SDK
and CLI workspaces, and JSVision 1.6.0 embedded in `porta admin`.

**Architecture:** the SDK user domain wraps existing organization-scoped and standalone Admin API
routes. The CLI command composition root creates authenticated SDK clients; the Admin UI then
projects untrusted SDK data into bounded terminal state. The server implementation remains outside
RD-03.

**Key files examined:**

- `packages/sdk/src/types/{common,users,index}.ts`, `packages/sdk/src/domains/users.ts`,
  `packages/sdk/src/agent.ts`
- `packages/cli/src/{client-factory,commands/admin,commands/user}.ts` and
  `packages/cli/src/admin/{state,session-service,organization-service,organization-dialogs,presentation,application-runtime,application,index}.ts`
- `packages/server/src/routes/users.ts`, `packages/server/src/users/{types,service,repository}.ts`,
  `packages/server/src/lib/entity-history.ts`
- existing SDK/CLI Admin UI tests, packed Admin UI journey, packed P1 requirements/live adapter,
  package manifests, TypeScript configuration, and public SDK/CLI documentation

**Applicable domain lenses:** web application, distributed/concurrent behavior, and public
data/compatibility evolution. Compiler/language and financial lenses are not applicable.

### Iteration-1 Summary by Dimension

|   # | Dimension              | Findings | Highest severity |
| --: | ---------------------- | -------: | ---------------- |
|   1 | Ambiguities            |        2 | 🟠 Major         |
|   2 | Implicit Assumptions   |        1 | 🟠 Major         |
|   3 | Logical Contradictions |        1 | 🟠 Major         |
|   4 | Completeness Gaps      |        3 | 🟠 Major         |
|   5 | Dependency Issues      |        2 | 🟠 Major         |
|   6 | Feasibility Concerns   |        0 | —                |
|   7 | Testability            |        2 | 🟠 Major         |
|   8 | Security Blind Spots   |        1 | 🟠 Major         |
|   9 | Edge Cases             |        1 | 🟠 Major         |
|  10 | Scope Creep Indicators |        0 | —                |
|  11 | Ordering & Sequencing  |        1 | 🟠 Major         |
|  12 | Consistency            |        0 | —                |
|  13 | Codebase Alignment     |        3 | 🟠 Major         |

### Iteration-1 Summary by Severity

| Severity       | Count | Status   |
| -------------- | ----: | -------- |
| 🔴 Critical    |     0 | None     |
| 🟠 Major       |    15 | Resolved |
| 🟡 Minor       |     2 | Resolved |
| 🔵 Observation |     0 | None     |

---

### PF-001: Public SDK user contracts are not exact or compile-enforced 🟠 MAJOR

**Dimension:** Ambiguities

**Location:** `03-01-sdk-user-contracts.md`, Input/result types and List parameters;
`07-testing-strategy.md`, ST-03; Phase 1 in `99-execution-plan.md`

**Codebase Evidence:** `packages/server/src/routes/users.ts:59-120` defines different nested create
and nullable update address shapes. `packages/sdk/src/types/users.ts:95-149` is incomplete, retains
legacy list keys and a broad index signature. `packages/sdk/tsconfig.json:15-17` excludes tests, so a
Vitest file cannot enforce negative public type contracts through package typecheck.

**The Problem:** execution would have to rediscover exact input properties/nullability, could leave
`sort`/`order` accepted through the index signature, and could pass runtime tests without proving
the advertised TypeScript contract.

**Only viable resolution:** enumerate the exact create, update, nested address, and list parameter
interfaces; remove the user-list index signature; and add one tracked focused TypeScript contract
fixture/config compiled by the existing TypeScript binary with positive and `@ts-expect-error`
cases. Runtime tests continue to prove request mapping.

**Recommendation:** apply that focused contract oracle. Runtime-only tables were dropped because
they cannot prove excluded TypeScript keys.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: public-contract specification mechanics inside approved UM-15; Objective: make the
SDK correction exact and executable without a new dependency; Decision: the only viable resolution
above; Evidence: cited route schemas, SDK type drift, and excluded test tree; Rejected alternatives:
runtime-only assertions and a new type-test dependency; Strongest counterargument: one small
TypeScript fixture configuration must be maintained; Confidence: High; Hardening: challenger
converged and strengthened the requirement to run the fixture through SDK verification; Policy
version: 1; Root invocation ID: `preflight-admin-ui-rd03-plan-20260829`; Reopen triggers: SDK tests
become part of the package compiler project or the server user schemas change.

### PF-002: Agent metadata changes do not match the positional executor 🟠 MAJOR

**Dimension:** Codebase Alignment

**Location:** `03-01-sdk-user-contracts.md`, Current Consumer Alignment and Testing Requirements;
Phase 1 in `99-execution-plan.md`

**Codebase Evidence:** `packages/sdk/src/agent.ts:51-58,88-103` spreads shared scalar list
parameters, while `packages/sdk/src/domains/users.ts:23-25` expects `(orgId, paramsObject)` and
`packages/sdk/src/agent.ts:208-219` forwards declared parameters positionally. No user-history tool
definition exists.

**The Problem:** editing descriptions or shared list names would either leave user operations
runtime-incorrect or alter unrelated agent domains.

**Only viable resolution:** define user-specific object parameters matching the actual user method
signatures, add the missing history operation and corrected invite/reason metadata, and test exact
`executeTool()` calls. Leave shared list metadata unchanged.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: current-consumer adapter design inside UM-15; Objective: truthful agent operations
without unrelated cleanup; Decision: the only viable resolution above; Evidence: cited metadata,
executor, and domain signatures; Rejected alternatives: changing shared list metadata or descriptions
alone; Strongest counterargument: a nested params object is less convenient for agent callers;
Confidence: High; Hardening: challenger converged; Policy version: 1; Root invocation ID:
`preflight-admin-ui-rd03-plan-20260829`; Reopen triggers: the generic executor gains signature-aware
object packing in separately authorized work.

### PF-003: Production `porta admin` cannot receive the planned users domain 🟠 MAJOR

**Dimension:** Codebase Alignment

**Location:** `02-current-state.md`, Relevant Files; `03-04-application-integration.md`, Production
Wiring/Application Changes; Phase 4 in `99-execution-plan.md`

**Codebase Evidence:** `packages/cli/src/commands/admin.ts:96-110` owns production `createClient()`
construction and passes only `.organizations`. `packages/cli/src/admin/session-service.ts:123-127,197-210`
can expose only supplied factories. The plan omits the command composition root and its existing
specification.

**The Problem:** internal controller/session tests could pass while the packed application has no
user operations. The statement that session-service uses the “selected authenticated client” is
currently false because it retains no client.

**Only viable resolution:** include `commands/admin.ts` and its focused command specification, use
one memoized lazy client closure per prepared server, and derive both narrow organization and user
domain providers from it. Construction remains lazy and no second client or service locator is
added.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: production composition inside approved CLI integration; Objective: make the feature
reachable while preserving one lazy client; Decision: the only viable resolution above; Evidence:
cited composition root/session factory; Rejected alternatives: a second client, eager construction,
or a global locator; Strongest counterargument: a shared client closure couples the two provider
factories; Confidence: Medium-High; Hardening: challenger converged; Policy version: 1; Root
invocation ID: `preflight-admin-ui-rd03-plan-20260829`; Reopen triggers: production client ownership
moves out of `commands/admin.ts` before execution.

### PF-004: User terminal state omits an exact detail allowlist and history variant 🟠 MAJOR

**Dimension:** Completeness Gaps

**Location:** `03-02-user-state-and-service.md`, Immutable Projections/View State;
`03-03-workspace-and-dialogs.md`, workspace interface/detail/history; ST-12, ST-22, and ST-23

**Codebase Evidence:** `packages/sdk/src/types/users.ts:33-84` contains approved, deferred, and
internal account fields together. The planned workspace's only remote-data ingress is
`setState(AdminUserViewState)`, but the declared union has no history-bearing case. Existing Admin UI
state uses explicit discriminated unions at `packages/cli/src/admin/state.ts:85-111`.

**The Problem:** implementers cannot determine whether fields such as `passwordChangedAt`,
`twoFactorMethod`, `lockedAt`, or `lockedReason` are retained, and validated history has no path to
the view.

**Only viable resolution:** declare exact user-specific page, detail, history, loading, failure, and
preserved-state variants. The detail interface names every retained field and excludes everything
else; the history variant carries validated history plus enough validated selection/detail context
for Back and focus.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: internal state contract within approved detail/history behavior; Objective: preserve
an explicit untrusted-data allowlist; Decision: the only viable resolution above; Evidence: cited
SDK and current state conventions; Rejected alternatives: implicit controller side channels or raw
SDK state; Strongest counterargument: explicit projection types duplicate selected SDK fields;
Confidence: High; Hardening: challenger converged; Policy version: 1; Root invocation ID:
`preflight-admin-ui-rd03-plan-20260829`; Reopen triggers: RD-07 or another approved feature expands
the detail projection.

### PF-005: Terminal safety bounds are undefined for server-unbounded values 🟠 MAJOR

**Dimension:** Security Blind Spots

**Location:** `03-02-user-state-and-service.md`, Validation/Input Validation;
`03-03-workspace-and-dialogs.md`, Invite/Preview; ST-12, ST-14, ST-15, and ST-35

**Codebase Evidence:** `packages/server/src/routes/users.ts:67-69,79-86,97-100,110-119` leaves URLs
and address street without finite maxima; history event type and rendered invitation subject/text
also lack terminal-specific bounds. Existing Admin UI validation uses explicit maxima at
`packages/cli/src/admin/organization-service.ts:39-48`.

**The Problem:** “match server bounds” cannot make every retained/displayed value bounded, and the
current ST cases have no numeric max/max+1 oracle. Raw local input can also reach a dialog before
service validation.

**Only viable resolution:** record explicit conservative local maxima for every server-unbounded
terminal input/retained value (including URLs, street, history event type, preview subject/text),
reject controls and over-bound values before display/dispatch, and test each boundary. Reject rather
than truncate so stored data is never presented deceptively.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: terminal resource/injection protection within approved validation; Objective: make
bounded state measurable without changing the server; Decision: the only viable resolution above;
Evidence: cited unbounded schemas and established CLI validator pattern; Rejected alternatives:
truncation and trusting the renderer/server; Strongest counterargument: local caps can reject values
the server accepts; Confidence: High; Hardening: challenger converged; Policy version: 1; Root
invocation ID: `preflight-admin-ui-rd03-plan-20260829`; Reopen triggers: the server publishes finite
matching limits or the terminal renderer adopts a separately approved streaming model.

### PF-006: Planned `404` handling contradicts immutable-state requirements 🟠 MAJOR

**Dimension:** Logical Contradictions

**Location:** `03-02-user-state-and-service.md`, Failure Mapping

**Codebase Evidence:** RD-03 UM-13 and AC-6 require `404` and failed credential outcomes to preserve
the last validated state. The plan instead permits closing detail after a “confirmed absent
refresh,” a behavior not defined by the approved RD.

**Only viable resolution:** preserve validated list/detail on every `404`. Close stale detail only
after definite purge success, which is already authorized.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: error-state mechanics constrained by approved behavior; Objective: restore the
immutable-state invariant; Decision: the only viable resolution above; Evidence: RD-03 UM-13/AC-6;
Rejected alternatives: an unapproved absence reconciliation path; Strongest counterargument: stale
detail can remain visible until manual refresh/navigation; Confidence: High; Hardening: challenger
converged; Policy version: 1; Root invocation ID: `preflight-admin-ui-rd03-plan-20260829`; Reopen
triggers: the owning requirement explicitly authorizes a not-found reconciliation transition.

### PF-007: Pagination consistency has no exact boundary invariant 🟡 MINOR

**Dimension:** Ambiguities

**Location:** `03-02-user-state-and-service.md`, User page/Validation Rules; ST-11

**Codebase Evidence:** `packages/server/src/users/repository.ts:377-397` computes
`totalPages = Math.ceil(total / pageSize)` and can truthfully return page 1 with `totalPages=0`, or
an empty requested page beyond the new final page after rows shrink.

**Only viable resolution:** define the server-envelope invariants explicitly: exact requested page,
`pageSize=20`, non-negative total, `totalPages === Math.ceil(total/20)`, at most 20 unique rows, and
acceptance of a truthful empty out-of-range page. Add zero-total and page-shrink cases to ST-11.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: response-validation algorithm; Objective: reject malformed envelopes without rejecting
truthful server boundaries; Decision: the only viable resolution above; Evidence: cited repository
formula; Rejected alternatives: rejecting every page above `totalPages`; Strongest counterargument:
navigation recovery remains controller-owned; Confidence: High; Hardening: challenger converged;
Policy version: 1; Root invocation ID: `preflight-admin-ui-rd03-plan-20260829`; Reopen triggers: the
server changes offset-envelope semantics.

### PF-008: Phase 3 requires controller-owned specifications to pass before Phase 4 🟠 MAJOR

**Dimension:** Ordering & Sequencing

**Location:** Phase 3/4 in `99-execution-plan.md`; ST-19 and ST-24–ST-29 mappings in
`07-testing-strategy.md`

**Codebase Evidence:** current command enablement, dialog dispatch, and registration live in
`packages/cli/src/admin/application.ts:169-199,317-363,569-607`. The plan correctly assigns future
user dispatch/reconciliation to the Phase 4 controller, but Phase 3 requires those complete journeys
to turn green first.

**Only viable resolution:** keep Phase 3 specifications to workspace rendering and typed dialog
results. Move/split dispatch, at-most-once, failure, and reconciliation assertions into Phase 4,
then complete the full ST journeys after the controller is green.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: specification-first sequencing; Objective: preserve honest red/green checkpoints;
Decision: the only viable resolution above; Evidence: cited ownership and phase design; Rejected
alternatives: moving the controller into the UI-composition phase; Strongest counterargument: some
journeys turn green one phase later than their controls; Confidence: High; Hardening: challenger
converged; Policy version: 1; Root invocation ID: `preflight-admin-ui-rd03-plan-20260829`; Reopen
triggers: dialog modules become authorized owners of dispatch/reconciliation.

### PF-009: Required capability fields omit mechanically affected fallbacks and fixtures 🟠 MAJOR

**Dimension:** Dependency Issues

**Location:** `03-02-user-state-and-service.md`, Capability State; Phase 2 in
`99-execution-plan.md`

**Codebase Evidence:** `AdminCapabilities` properties are required at
`packages/cli/src/admin/state.ts:5-11`. The presentation fallback and retained typed fixtures contain
only organization booleans, including `packages/cli/src/admin/presentation.ts:220-228` and current
authentication/organization specifications.

**The Problem:** Phase 2 cannot pass its required CLI typecheck while those consumers remain outside
its modification set.

**Only viable resolution:** include all mechanically affected production fallbacks and typed
fixtures in Phase 2, setting new user capabilities to false except focused cases that intentionally
enable one.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: compile-impact repair inside the capability change; Objective: keep fail-closed state
and phase verification green; Decision: the only viable resolution above; Evidence: cited required
interface and consumers; Rejected alternatives: optional capability fields or deferring broken
fixtures; Strongest counterargument: the fixture diff appears broad for a small state extension;
Confidence: High; Hardening: challenger converged; Policy version: 1; Root invocation ID:
`preflight-admin-ui-rd03-plan-20260829`; Reopen triggers: capability defaults move to one existing
canonical factory before execution.

### PF-010: Required public SDK documentation has no execution path 🟠 MAJOR

**Dimension:** Completeness Gaps

**Location:** `01-requirements.md`, in-scope documentation; `03-01-sdk-user-contracts.md`, Current
Consumer Alignment; Phase 5 in `99-execution-plan.md`

**Codebase Evidence:** `docs/guide/sdk.md:96-149` is the existing public SDK reference, while Phase 5
names only CLI/playground documentation. `docs/cli/users.md:51-57` separately advertises the stale
email-update command.

**Only viable resolution:** add a focused `docs/guide/sdk.md` update for the corrected user
contracts, and update `packages/sdk/README.md` only where its current user examples directly conflict.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: documentation file selection for an approved public contract; Objective: prevent stale
public guidance without broad regeneration; Decision: the only viable resolution above; Evidence:
cited public docs; Rejected alternatives: leaving SDK changes documented only in CLI docs;
Strongest counterargument: declarations already carry detailed types; Confidence: High; Hardening:
challenger converged; Policy version: 1; Root invocation ID:
`preflight-admin-ui-rd03-plan-20260829`; Reopen triggers: the canonical SDK user reference moves.

### PF-011: ST-37 is procedural evidence, not an expected-red specification 🟠 MAJOR

**Dimension:** Testability

**Location:** `07-testing-strategy.md`, ST-37, test mapping, and checklist; Phase 5 in
`99-execution-plan.md`

**Codebase Evidence:** ST-37 combines package verification, structure/docs, a live journey, and a
clean-commit compatibility command. The plan maps it to the packed Node test while separately
running those commands after implementation and commit.

**The Problem:** the packed test cannot be written expected-red and safely assert its own recursive
repository/clean-commit gates without creating the prohibited orchestration layer.

**Only viable resolution:** retain ST-36 as the packed behavioral specification and reclassify
ST-37 as completion evidence `EV-01`, outside the expected-red rule. Keep the exact commands in the
execution checklist.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: evidence classification and sequencing; Objective: keep immutable tests executable;
Decision: the only viable resolution above; Evidence: current task/command ownership; Rejected
alternatives: a recursive orchestration test; Strongest counterargument: AC-13 no longer has one
ST-numbered umbrella; Confidence: High; Hardening: challenger converged; Policy version: 1; Root
invocation ID: `preflight-admin-ui-rd03-plan-20260829`; Reopen triggers: the repository adopts an
existing non-recursive completion-evidence test convention.

### PF-012: AC-1 search, filter, navigation, and empty boundaries lack concrete oracles 🟠 MAJOR

**Dimension:** Testability

**Location:** ST-10, ST-20, and ST-21 in `07-testing-strategy.md`; Phase 2/3 specification tasks

**Codebase Evidence:** RD-03 AC-1 requires search lengths 0/255/256, all exact status filters,
Previous/Next request behavior, and distinct empty/no-match states. The current ST rows cover only
initial browse and a failed request.

**Only viable resolution:** add table-driven cases in the already planned service/workspace
specifications for each boundary and exact dispatched request; update contiguous IDs/mappings only
as required.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: test-case decomposition inside approved AC-1; Objective: make acceptance deterministic
without new harnesses; Decision: the only viable resolution above; Evidence: AC-1 versus current ST
rows; Rejected alternatives: treating a browse smoke test as coverage; Strongest counterargument:
the table adds test rows; Confidence: High; Hardening: challenger converged; Policy version: 1; Root
invocation ID: `preflight-admin-ui-rd03-plan-20260829`; Reopen triggers: AC-1 changes.

### PF-013: Indeterminate mutations lack a fixed outcome and controller oracle 🟠 MAJOR

**Dimension:** Edge Cases

**Location:** `03-03-workspace-and-dialogs.md`, cancellation; `03-04-application-integration.md`,
generation/mutations/error handling; ST-17 and ST-24–ST-32

**Codebase Evidence:** RD-03 UM-13/UM-14 require cancellation-after-dispatch and other indeterminate
mutation outcomes to produce fixed local results, preserve validated state, avoid retry, and
quarantine late continuations. The plan silently redraws stale state, and its application specs do
not cover edit/credential/lifecycle/purge failure preservation.

**Only viable resolution:** publish one fixed `outcome-unknown` result only after genuinely
indeterminate post-dispatch outcomes; preserve validated data; prevent automatic/duplicate target
mutation until an authorized reconciliation succeeds where read is available; and add one
table-driven controller specification covering representative mutations, fixed failures,
post-dispatch cancellation, late results, and server `403`/super-admin rejection. Create/invite-only
sessions show the fixed outcome and require a new deliberate action; no lock/polling subsystem is
added.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: failure/recovery mechanics already required by UM-13/14; Objective: avoid silently
repeating an operation that may have succeeded; Decision: the narrowed resolution above; Evidence:
approved indeterminate-outcome rules and missing controller specs; Rejected alternatives: silent
stale redraw, automatic retry, or persistent locking; Strongest counterargument: reconciliation
adds a small controller state; Confidence: Medium-High; Hardening: challenger narrowed the rule to
genuinely indeterminate post-dispatch outcomes and rejected generalized blocking; Policy version: 1;
Root invocation ID: `preflight-admin-ui-rd03-plan-20260829`; Reopen triggers: the SDK gains an
authoritative idempotency/outcome query contract.

### PF-014: User dialogs are not mutually exclusive with existing modal owners 🟠 MAJOR

**Dimension:** Dependency Issues

**Location:** `03-03-workspace-and-dialogs.md`, Dialogs; `03-04-application-integration.md`,
Production Wiring/Application Changes; ST-30

**Codebase Evidence:** existing auth, organization, Who-am-I, and session operations are guarded by
application-owned flags at `packages/cli/src/admin/application.ts:430-489,573-607`. The shared dialog
surface removes all windows at `packages/cli/src/admin/application-runtime.ts:119-145`, while the
planned controller owns a separate flag with no bidirectional exclusion.

**Only viable resolution:** add one small bidirectional busy/ownership seam: existing owners refuse
while user work is active, user commands refuse while an existing owner is active, and global
cancel/resize/dispose reaches the user controller before shared teardown. Test both directions. Do
not add a modal manager.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: concurrency/ownership mechanism inside the single application; Objective: preserve one
modal/operation owner; Decision: the only viable resolution above; Evidence: cited flags and shared
surface; Rejected alternatives: independent flags without coordination or a generalized manager;
Strongest counterargument: explicit callbacks/flags may be less elegant if many later modules
arrive; Confidence: High; Hardening: challenger converged; Policy version: 1; Root invocation ID:
`preflight-admin-ui-rd03-plan-20260829`; Reopen triggers: a separately approved shared modal owner
already exists before execution.

### PF-015: Verification gates do not match current project policy 🟠 MAJOR

**Dimension:** Codebase Alignment

**Location:** AR-6 in `00-ambiguity-register.md`; verification checklist in
`07-testing-strategy.md`; Phase 1/5 verification in `99-execution-plan.md`

**Codebase Evidence:** current `AGENTS.md` requires affected workspaces plus
`yarn test:structure` before commits and root `yarn verify` when a revision changes multiple product
workspaces. Phase 1 changes SDK and CLI but names only package verification. The registered
assurance harness projects observe server/browser protocol boundaries, not JSVision controller
state; the server remains unchanged.

**Only viable resolution:** require root `yarn verify` for SDK+CLI revisions and CLI verify plus
structure tests for CLI-only revisions; keep final docs/packed/clean `p1-admin` gates. Record the
security harness as not applicable only to this unchanged-server, JSVision-only boundary, with
controller security specifications and the packed journey as the relevant UI evidence. Any server,
OIDC, cookie, or protocol change reactivates the registered security harness requirement.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: verification sequencing under current repository policy; Objective: satisfy mandatory
gates without running unrelated assurance; Decision: the resolution above; Evidence: current
AGENTS policy and registered harness ownership; Rejected alternatives: package-only verification for
a multi-workspace revision or running every server/harness gate after every CLI-only task;
Strongest counterargument: root verification remains expensive; Confidence: High; Hardening:
challenger converged and retained the evidence requirement for harness non-applicability; Policy
version: 1; Root invocation ID: `preflight-admin-ui-rd03-plan-20260829`; Reopen triggers: the diff
touches server/auth/protocol behavior or a registered harness gains a JSVision client observer.

### PF-016: Fixed HTTP failure mapping is incomplete 🟡 MINOR

**Dimension:** Completeness Gaps

**Location:** `03-02-user-state-and-service.md`, Failure Mapping; ST-17

**Codebase Evidence:** server validation can return `400`; retained ETag handling can return `412`
through `packages/server/src/routes/users.ts:280-292`; the SDK exposes typed HTTP statuses.

**Only viable resolution:** make the mapping exhaustive: `400 → validation`, `401 → session-invalid`,
`403 → unauthorized`, `404 → not-found`, `409/412 → conflict`, and every other status/transport
failure → unavailable. Never retain remote detail. Add 400/412/unknown-4xx cases to ST-17.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: internal fixed-result mapping; Objective: total safe error handling; Decision: the only
viable resolution above; Evidence: current route/SDK status behavior; Rejected alternatives:
status-specific remote text; Strongest counterargument: 429 and other 4xx lose diagnostic
specificity; Confidence: High; Hardening: challenger converged; Policy version: 1; Root invocation
ID: `preflight-admin-ui-rd03-plan-20260829`; Reopen triggers: RD-03 authorizes another fixed local
category.

### PF-017: Session generation has no explicit source 🟠 MAJOR

**Dimension:** Implicit Assumptions

**Location:** `03-04-application-integration.md`, controller interface and Context/Generation
Ownership; Phase 4 in `99-execution-plan.md`

**Codebase Evidence:** `AdminConnectionState` has no session generation at
`packages/cli/src/admin/state.ts:85-111`. Current same-subject reauthentication can retain the same
organization at `packages/cli/src/admin/application.ts:525-543`. The proposed
`syncContext(AdminConnectionState)` cannot distinguish that replacement session from an ordinary
same-context capability refresh, yet RD-03 requires reauthentication to clear user state.

**Only viable resolution:** let the application own a monotonically increasing session epoch, pass
it explicitly to `syncContext`, and increment it at initial verified session establishment,
reauthentication/session replacement, and invalidation boundaries. The controller combines that
epoch with the selected organization UUID and tests same-subject/same-organization replacement.

**Delegated Decision (`--auto-design`):** Authority: AI — delegated by `--auto-design`;
Eligibility: generation/data structure inside approved context isolation; Objective: make session
replacement observable without identity inference; Decision: the only viable resolution above;
Evidence: cited state/interface and reauthentication behavior; Rejected alternatives: infer from
identity/org equality or rely on an imperative reset call at every future path; Strongest
counterargument: one scalar crosses the application/controller boundary; Confidence: High;
Hardening: challenger selected the explicit epoch over reset inference; Policy version: 1; Root
invocation ID: `preflight-admin-ui-rd03-plan-20260829`; Reopen triggers: verified session identity
gains an existing monotonic generation before execution.

---

## Iteration-2 Resolution Summary

The user authorized all selected PF-001–PF-017 fixes on 2026-08-29. The re-scan checked every
dimension again against the corrected plan and current codebase.

| Finding | Status   | Corrected plan evidence                                                        |
| ------- | -------- | ------------------------------------------------------------------------------ |
| PF-001  | Resolved | Exact closed SDK inputs/results and compiler-owned contract oracle             |
| PF-002  | Resolved | User-specific agent positional metadata and exact executor calls               |
| PF-003  | Resolved | One memoized lazy SDK client in the production Admin UI composition root       |
| PF-004  | Resolved | Exact bounded detail/history view projections; unsupported fields excluded     |
| PF-005  | Resolved | Explicit terminal-safe bounds and reject-without-truncation behavior           |
| PF-006  | Resolved | Every read-side 404 preserves validated state                                  |
| PF-007  | Resolved | Exact requested-page, formula, remaining-row, and shrink-page invariants       |
| PF-008  | Resolved | Phase 3 emits closed typed intents; Phase 4 alone dispatches SDK operations    |
| PF-009  | Resolved | Capability shape plus every affected fail-closed fixture is named              |
| PF-010  | Resolved | Public SDK guide and package README are both in the focused documentation task |
| PF-011  | Resolved | Live verification is EV-01, separate from immutable ST-01–ST-36                |
| PF-012  | Resolved | Browse/search/filter/navigation scenarios have exact observable outcomes       |
| PF-013  | Resolved | Post-invocation indeterminate mutations publish fixed outcome-unknown          |
| PF-014  | Resolved | One narrow bidirectional busy seam excludes overlapping modal owners           |
| PF-015  | Resolved | Package, root, structure, docs, packed, and compatibility gates match policy   |
| PF-016  | Resolved | Read and mutation failure mappings are explicit and distinguish uncertainty    |
| PF-017  | Resolved | Application-owned monotonic session epoch handles session replacement          |

### Residuals found and corrected during re-scan

| Residual   | Severity    | Resolution                                                                                  |
| ---------- | ----------- | ------------------------------------------------------------------------------------------- |
| PA-001–003 | Major       | Phase ownership, capability fixture inventory, and SDK README coverage confirmed/fixed      |
| PA-009–011 | Major/minor | Update-address nullability, failure mapping, and unsupported detail field corrected         |
| PA-012–013 | Major/minor | Red/baseline rule corrected; compile fixture renamed and added to inventory                 |
| PA-101–105 | Major/minor | Outcome uncertainty, session terminology, and executable compile oracle corrected           |
| PA-201–204 | Major/minor | Real history envelopes, page consistency, agent history arguments, and local controls fixed |

No residual remains open. The corrections add no framework, dependency, endpoint, server change,
workflow, matrix, polling, locking, import/export behavior, or later-RD functionality.

### Iteration-2 Scan Result

| Severity       | Open |
| -------------- | ---: |
| 🔴 Critical    |    0 |
| 🟠 Major       |    0 |
| 🟡 Minor       |    0 |
| 🔵 Observation |    0 |

Deterministic validation confirms 46 unique execution tasks, complete ST-01–ST-36 coverage,
separate EV-01 completion evidence, valid local links, current fixture paths, and no stale
standalone-history, ST-37, Node 26, 404-close, or one-argument session-context wording.

## Verdict

The focused RD-03 plan is executable and remains inside the approved boundary.

**Result:** ✅ PREFLIGHT PASSED — all findings are resolved.
