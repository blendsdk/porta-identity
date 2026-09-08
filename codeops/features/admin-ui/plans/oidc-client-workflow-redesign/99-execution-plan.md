# Execution Plan: OIDC Client Workflow Redesign

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-09-08 10:37
> **Progress**: 22/37 tasks (59%)
> **CodeOps Artifact Schema**: 1

## Overview

Implement the approved RD-04 OIDC client workflow revision through additive secret-expiry support,
compact registration, a sectioned detail workspace, and focused configuration editors. Reuse all
existing runtime, storage, controller, and JSVision boundaries (AR-1, AR-9, AR-14).

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                                  | Tasks |
| ----- | -------------------------------------- | ----- |
| 1     | Initial-secret contract                | 7     |
| 2     | Compact registration and continuation  | 8     |
| 3     | Sectioned client detail                | 7     |
| 4     | Focused editors and final verification | 15    |

**Total: 37 tasks across 4 phases**

> **⚠️ EXECUTION RULE — APPLIES TO EVERY AGENT EXECUTING THIS PLAN:**
>
> The task checkboxes in the phase sections below are the **single source of truth** for progress.
> Every task line appears exactly once. The executing agent MUST:
>
> 1. On implementation, mark the task `[~]` with `implemented: YYYY-MM-DD HH:MM`.
> 2. On verification pass, promote it to `[x]` with `completed: YYYY-MM-DD HH:MM`.
> 3. Update the Progress header and Last Updated timestamp after every task. Only `[x]` counts.
> 4. Resume at the first `[~]` task, otherwise the first `[ ]` task.
> 5. Mark blockers `[!]` with `Blocked: <short reason>` on the same line.
>
> Timestamps come from `date '+%Y-%m-%d %H:%M'`. Lifecycle is Ready, Executing, Done, or Blocked.

---

## Phase 1: Initial-Secret Contract

> **Phase baseline tree**: `13376d37a10aabbaa5ea61a262d86cc4078f4ca4`
> **Scope mode**: strict
> **Expected modification set**: Phase 1 server/SDK expiry specifications, route and SDK contract
> files, the existing SDK type-contract include list, focused implementation tests, this execution
> plan, the existing exact SDK client contract oracle, and the feature roadmap. All other pre-existing
> worktree changes are excluded from the phase review and any task commit.

### Step 1.1: Specification Tests

**Reference**: [03-01 §Public Contract](03-01-initial-secret-contract.md#public-contract) · AR-7,
AR-11 · ST-1–ST-9

- [x] 1.1.1 [spec-author] Write strict ISO expiry, control-free label, and SDK contract specifications from ST-1–ST-9; register the new SDK type-contract file in its existing explicit include list — `packages/server/tests/unit/routes/client-secret-expiry.spec.test.ts`, `packages/sdk/tests/type-contracts/client-secret-expiry-contract.spec.test.ts`, `packages/sdk/tests/type-contracts/tsconfig.json` ✅ (completed: 2026-09-08 07:42)
- [x] 1.1.2 Run the two new specification suites and record the expected red result before implementation ✅ (completed: 2026-09-08 07:48; server: 16 failed/6 passed, SDK runtime: 3 passed, SDK type contract: 5 expected diagnostics)

### Step 1.2: Implementation

**Reference**: [03-01 §Proposed Changes](03-01-initial-secret-contract.md#proposed-changes) · AR-1,
AR-11

- [x] 1.2.1 Add one route-local strict ISO/future expiry schema, one route-local control-free label schema, and initial-secret plumbing — `packages/server/src/routes/clients.ts` ✅ (completed: 2026-09-08 07:52)
- [x] 1.2.2 Add the optional create input field and request contract; align the existing exact type oracle with the additive field — `packages/sdk/src/types/clients.ts`, `packages/sdk/src/domains/clients.ts`, `packages/sdk/tests/clients-rd04.spec.test.ts` ✅ (completed: 2026-09-08 07:55; the existing domain already forwards create input unchanged)
- [x] 1.2.3 Run ST-1–ST-9 and make the immutable expectations green ✅ (completed: 2026-09-08 07:56; server: 22 passed, SDK: 13 passed plus exact type contract)

### Step 1.3: Implementation Tests and Hardening

- [x] 1.3.1 Add internal route and SDK serialization coverage — `packages/server/tests/unit/routes/client-secret-expiry.impl.test.ts`, `packages/sdk/tests/domains/client-secret-expiry.impl.test.ts` ✅ (completed: 2026-09-08 08:02)
- [x] 1.3.2 Run focused server/SDK tests, typechecks, and builds for the changed contract ✅ (completed: 2026-09-08 08:06; server: 55 focused tests, typecheck, build; SDK: 12 focused tests, typecheck, build)

**Verify**: focused server and SDK selectors, then their package typechecks/builds

**Phase 1 quality gate (2026-09-08 08:08)**: Independent correctness and security reviews passed
with no critical, major, or minor findings. The reviewers confirmed the shared strict expiry and
label schemas, secret-field isolation from client persistence, one-time plaintext handling,
unchanged authorization boundaries, additive SDK contract, and complete focused coverage.

---

## Phase 2: Compact Registration and Continuation

> **Phase baseline tree**: `f3bb5ae1989707ecfe8d241ea1c802fa93740e0b`
> **Expected modification set**: Phase 2 registration specifications and implementation modules,
> their retained facade/controller/orchestration seams, implementation coverage, and this execution
> record. The repository test inventory count tracks the intentionally added test files.
> Pre-existing worktree changes remain excluded from Phase 2 review and task commits.

### Step 2.1: Specification Tests

**Reference**: [03-02 §Compact Registration](03-02-client-workflow.md#compact-registration) · AR-3,
AR-6, AR-12 · ST-10–ST-17

- [x] 2.1.1 [spec-author] Replace only existing shared-tab registration assertions superseded by revised RD-04, preserve still-valid safety/focus/sizing assertions, and write compact-registration/continuation specifications from ST-10–ST-17 — `packages/cli/tests/admin/oidc-clients-workspace.spec.test.ts`, `packages/cli/tests/admin/oidc-client-registration.spec.test.ts` ✅ (completed: 2026-09-08 08:22; 55 retained workspace specifications preserved and 14 ST-10–ST-17 cases added)
- [x] 2.1.2 Run the new registration specification suite and record the expected red result ✅ (completed: 2026-09-08 08:26; 58 passed, 11 expected failures: six missing compact-dialog cases, two missing expiry-display cases, and three missing authoritative-selection cases)

### Step 2.2: Implementation

**Reference**: [03-02 §Post-Create Continuation](03-02-client-workflow.md#post-create-continuation) ·
AR-12, AR-14

- [x] 2.2.1 Move compact create behavior into the direct registration module and retain facade exports — `packages/cli/src/admin/client-registration-dialog.ts`, `packages/cli/src/admin/client-dialogs.ts` ✅ (completed: 2026-09-08 08:33; direct compact dialog and stable facade export added; seven registration specifications pass and remaining failures map to Tasks 2.2.2–2.2.3)
- [x] 2.2.2 Implement the complete 3/6/12/24/custom/Never expiry helper once and use its six-month default for registration — `packages/cli/src/admin/client-registration-dialog.ts`, `packages/cli/src/admin/client-credential-dialogs.ts` ✅ (completed: 2026-09-08 08:38; feature-local DatePicker composition added with civil-month clamping, next-day UTC serialization, warnings, and six-month registration default)
- [x] 2.2.3 After transient secret presentation, authoritatively reload through `select(created.id)` and publish Overview — `packages/cli/src/admin/client-controller.ts` ✅ (completed: 2026-09-08 08:40; successful create values now select and authoritatively reload the created client after any one-time presentation)
- [x] 2.2.4 Pass raw secret expiry through the existing one-time presenter and wire compact registration without changing dialog/network ownership — `packages/cli/src/admin/application-client-features.ts`, `packages/cli/src/admin/client-dialogs.ts` ✅ (completed: 2026-09-08 08:43; existing orchestration opens compact registration and passes raw expiry into the transient one-time presenter)
- [x] 2.2.5 Run ST-10–ST-17 and make the immutable expectations green ✅ (completed: 2026-09-08 08:46; 69 registration and retained workspace specifications passed)

### Step 2.3: Implementation Tests and Hardening

- [x] 2.3.1 Add registration payload, facade, focus, cancellation, and plaintext-lifetime implementation coverage — `packages/cli/tests/admin/oidc-client-registration.impl.test.ts` ✅ (completed: 2026-09-08 08:49; 73 focused specification and implementation tests passed with CLI typecheck, ESLint, and formatting)

**Verify**: focused CLI registration/controller suites and CLI typecheck

**Phase 2 quality gate (2026-09-08 09:17)**: The independent security audit passed without
findings. Correctness review found one Major registration-geometry defect and two Minor items. The
user accepted a focused repair that makes registration a maximized fixed Dialog surface with
captioned groups, scrollable form content, a separate bottom action row, and complete warning text.
The claim that unrelated workspace coverage was weakened was rejected: the Phase 2 diff removes
only assertions for the superseded create-mode dialog, while the maximized workspace and empty-grid
specifications remain present. Phase 2 remains open until the accepted repair verifies and passes
one bounded re-review. **Remediation**: maximized grouped registration, focus-aware vertical
scrolling, fixed bottom actions, and complete expiry-warning height are implemented; verification
passed 149 focused CLI tests, CLI typecheck, scoped lint/format, and 97 structure tests. One bounded
re-review found no Critical or Major findings and closed the accepted repair. It reported one Minor,
non-blocking resize limitation: shrinking while focus remains unchanged does not automatically
recalculate the form offset, but manual scrolling remains available and Create/Cancel stay visible.
Phase 2 is closed (reviewed: 2026-09-08 09:41).

---

## Phase 3: Sectioned Client Detail

> **Phase baseline tree**: `15e59623dfbd8d53568867e23ea73d98668aac41`
> **Expected modification set**: Phase 3 detail specifications and implementation modules,
> retained dialog/orchestration seams, implementation coverage, this execution record, and the
> repository test inventory count for intentionally added test files. Pre-existing changes in
> `client-workspace.ts`, `application-client-features.ts`, and the wider worktree remain excluded
> from Phase 3 review and task commits. **Scope mode**: strict.

### Step 3.1: Specification Tests

**Reference**: [03-02 §Detail Sections](03-02-client-workflow.md#detail-sections) · AR-4, AR-12 ·
ST-18–ST-22, ST-46

- [x] 3.1.1 [spec-author] Write detail workspace, responsive section navigation, Overview summaries, and name-edit specifications from ST-18–ST-22 and ST-46 — `packages/cli/tests/admin/oidc-client-detail.spec.test.ts` ✅ (completed: 2026-09-08 09:52; eight immutable behavior cases added, with scoped lint/format, CLI typecheck, and 97 structure tests passing)
- [x] 3.1.2 Run the new detail specification suite and record the expected red result ✅ (completed: 2026-09-08 09:54; one existing controller case passed and seven expected cases failed only on the missing section navigation, Overview action, and focused name-dialog behavior; log: `/tmp/porta-phase3-task-3.1.2-red.log`)

### Step 3.2: Implementation

**Reference**: [03-02 §Detail Sections](03-02-client-workflow.md#detail-sections) · AR-4, AR-14

- [x] 3.2.1 Replace the long detail block with one responsive `ListBox`, local section state, GroupBox regions, authoritative Overview summaries, a small name editor, and separate Back navigation — `packages/cli/src/admin/client-workspace.ts`, `packages/cli/src/admin/client-dialogs.ts` ✅ (completed: 2026-09-08 10:14; eight detail specifications, CLI typecheck, and scoped lint/format passed)
- [x] 3.2.2 Update feature intents and orchestration for focused section actions without adding a router — `packages/cli/src/admin/client-workspace.ts`, `packages/cli/src/admin/application-client-features.ts` ✅ (completed: 2026-09-08 10:21; 23 focused detail/runtime tests, CLI typecheck, and scoped lint/format passed)
- [x] 3.2.3 Run ST-18–ST-22 and make the immutable expectations green ✅ (completed: 2026-09-08 10:24; all eight detail behavior specifications passed)

### Step 3.3: Implementation Tests and Hardening

- [x] 3.3.1 Add section focus, compact geometry, natural button sizing, and render-cleanup coverage — `packages/cli/tests/admin/oidc-client-detail.impl.test.ts` ✅ (completed: 2026-09-08 10:29; 11 detail tests and 97 structure tests passed with scoped lint/format)
- [x] 3.3.2 Run focused workspace tests and CLI typecheck ✅ (completed: 2026-09-08 10:37; 93 focused workspace tests, CLI typecheck, scoped lint/format, and 97 structure tests passed)

**Verify**: focused CLI workspace suites and `yarn workspace @portaidentity/cli typecheck`

**Phase 3 quality gate (2026-09-08 11:00)**: The independent security audit passed without
findings. Correctness review found three Major issues in compact action reachability, section
selection stability after secret loading, and credential-grid selection restoration, plus one
Minor ETag preservation issue. The user approved all four bounded repairs. **Remediation**:
compact detail content now scrolls below grouped navigation, the name editor keeps fixed actions,
secret projections preserve newer section choices, rebuilt credential grids restore the retained
selection, and both detail projections retain the update ETag. Verification passed 96 focused CLI
tests, CLI typecheck, scoped lint/format, and 97 structure tests. Phase 3 remains open for one
bounded re-review.

---

## Phase 4: Focused Editors and Final Verification

### Step 4.1: Specification Tests

**Reference**: [03-03](03-03-focused-editors.md) · AR-5–AR-8, AR-10, AR-14 · ST-23–ST-45

- [ ] 4.1.1 [spec-author] Revise only shared-tab/scroller assertions superseded by RD-04; preserve existing safety assertions; add server duplicate-validation and authentication, protocol, login, expiry, credential, and representative context specifications from ST-23–ST-45 — `packages/server/tests/unit/clients/protocol-compatibility.spec.test.ts`, `packages/cli/tests/admin/oidc-clients-workspace.spec.test.ts`, `packages/cli/tests/admin/oidc-client-editors.spec.test.ts`
- [ ] 4.1.2 Run the new editor specification suite and record the expected red result

### Step 4.2: Implementation

**Reference**: [03-03 §Architecture](03-03-focused-editors.md#architecture) · AR-5–AR-8, AR-10,
AR-14

- [ ] 4.2.1 Add exact-array uniqueness to the existing shared server validator; implement one selectable, reused URI/origin DataGrid region with parent-local staging and one Save — `packages/server/src/clients/validators.ts`, `packages/cli/src/admin/client-authentication-dialog.ts`
- [ ] 4.2.2 Implement focused protocol and multi-method login editors — `packages/cli/src/admin/client-protocol-login-dialogs.ts`
- [ ] 4.2.3 Implement credential grid dialogs and reuse the complete Phase 2 DatePicker expiry composition — `packages/cli/src/admin/client-credential-dialogs.ts`
- [ ] 4.2.4 Complete retained facade exports and focused editor orchestration; remove obsolete shared-tab symbols from the Admin barrel and direct consumers without compatibility wrappers — `packages/cli/src/admin/client-dialogs.ts`, `packages/cli/src/admin/application-client-features.ts`, `packages/cli/src/admin/index.ts`
- [ ] 4.2.5 Run ST-23–ST-45 and make the immutable expectations green

### Step 4.3: Implementation Tests, Documentation, and Hardening

- [ ] 4.3.1 Add collection selector/geometry, protocol, login, exact calendar, warning, selection, representative late-result, validator, and facade implementation coverage while replacing obsolete shared-tab implementation assertions — `packages/server/tests/unit/clients/validators.test.ts`, `packages/cli/tests/admin/oidc-client-editors.impl.test.ts`, `packages/cli/tests/admin/oidc-clients-workspace.impl.test.ts`
- [ ] 4.3.2 Update focused Admin UI/CLI documentation for registration, sections, redirects, login inheritance, and credentials, then run `yarn docs:build` — `packages/cli/README.md`, `docs/cli/clients.md`
- [ ] 4.3.3 Run `yarn test:structure`
- [ ] 4.3.4 Run `yarn workspace @portaidentity/server verify`
- [ ] 4.3.5 Run `yarn workspace @portaidentity/sdk verify`
- [ ] 4.3.6 Run `yarn workspace @portaidentity/cli verify`
- [ ] 4.3.7 Run `yarn harness:test` and `yarn assurance:harness --project protocol --profile operational`
- [ ] 4.3.8 After the execution workflow creates a clean committed implementation revision, run `yarn assurance:compat --select p1-admin` and `yarn assurance:compat --select protocol`

**Verify**: the complete AR-13 nine-command gate; do not run root `yarn verify`

---

## Dependencies

```text
Phase 1: additive server/SDK contract
    ↓
Phase 2: compact registration and returned-client continuation
    ↓
Phase 3: sectioned detail workspace
    ↓
Phase 4: focused editors, docs, and complete verification
```

## Success Criteria

Feature completion requires:

1. All 37 tasks are complete.
2. ST-1–ST-46 pass without changing their approved expectations except existing shared-tab and
   scroller assertions explicitly superseded by revised RD-04.
3. The complete AR-13 verification gate passes on Node.js 24 LTS.
4. Root `yarn verify` is not run.
5. Plaintext secrets remain transient and all validation/authorization/context protections remain
   intact.
6. No dead code, oversized replacement module, generalized UI framework, dependency, migration, or
   unsupported Azure capability is introduced.
7. Public and technical documentation reflects the implemented workflow.
8. Post-completion project re-analysis is performed by the execution workflow.
