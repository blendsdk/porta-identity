# Execution Plan: User Management

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-08-30 03:29
> **Progress**: 31/46 tasks (67%)
> **CodeOps Artifact Schema**: 1

## Overview

Implement RD-03 in five specification-first phases: correct the current SDK user contract, add the
validated user service/state boundary, build direct JSVision workspace/dialogs, wire the
organization/session-owned workflow, then complete the existing packed journey and documentation.
No generalized UI framework, dependency, endpoint, server implementation, workflow, or matrix is
part of this plan (AR-1–AR-7).

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                                | Tasks |
| ----- | ------------------------------------ | ----: |
| 1     | SDK contracts and current consumers  |     9 |
| 2     | Validated user state and service     |     9 |
| 3     | Users workspace and dialogs          |    13 |
| 4     | Application workflow integration     |     8 |
| 5     | Packed journey, docs, and completion |     7 |

**Total: 46 tasks across 5 phases**

> **⚠️ EXECUTION RULE — APPLIES TO EVERY AGENT EXECUTING THIS PLAN:**
>
> The task checkboxes below are the single source of truth. The executor must:
>
> 1. mark a task `[~]` with `implemented: YYYY-MM-DD HH:MM` after implementation;
> 2. promote it to `[x]` with `completed: YYYY-MM-DD HH:MM` only after its verification passes;
> 3. update Progress and Last Updated after every task; only `[x]` counts as complete;
> 4. resume the first `[~]`, otherwise the first `[ ]`, scanning top-to-bottom;
> 5. mark a blocker `[!]` with its concise reason on the same task line.
>
> Timestamps come from `date '+%Y-%m-%d %H:%M'`. Specification expectations are immutable after
> their expected-red checkpoint. Commit and push behavior belongs to the exec-plan/git-commit
> workflow, never to task shell commands.

---

## Phase 1: SDK Contracts and Current Consumers

> **Phase baseline tree**: `2a4c1684d189f01ea2dcb9e4c20bb8f4ed49423a`
> **Expected modification set**: `packages/sdk/src/{types/common,types/users,types/index,domains/users,agent}.ts`, `packages/sdk/tests/type-contracts/{users-contract.spec.test.ts,tsconfig.json}`, `packages/sdk/tests/{domains/users-contract.{spec,impl},domains/users,domains/standalone-users,agent/agent}.test.ts`, `packages/cli/src/commands/user.ts`, `packages/cli/tests/{commands/user-contract.spec,commands/user}.test.ts`, registered packed P1 requirement/probe files only if their current expectation needs alignment, test inventory, and execution evidence
> **Scope mode**: strict — named current user contracts only; no shim, new endpoint, server change, or unrelated SDK cleanup

### Step 1.1: Specification Tests

**Reference**: [03-01](03-01-sdk-user-contracts.md) · ST-01–ST-07 · AR-3

- [x] 1.1.1 [spec-author] Add SDK runtime contract specifications plus a tracked focused TypeScript oracle/config for exact closed create/update/address/list contracts and exact invite/reason/history result signatures — `packages/sdk/tests/domains/users-contract.spec.test.ts`, `packages/sdk/tests/type-contracts/{users-contract.spec.test.ts,tsconfig.json}` ✅ (completed: 2026-08-30 01:11)
- [x] 1.1.2 [spec-author] Add current `porta user` consumer specifications for update, invite, reasons, and history — `packages/cli/tests/commands/user-contract.spec.test.ts` ✅ (completed: 2026-08-30 01:10)
- [x] 1.1.3 Run both focused specification files plus `node_modules/@typescript/native/bin/tsc --project packages/sdk/tests/type-contracts/tsconfig.json --noEmit`; record already-correct preservation assertions as the green baseline and missing or mismatched behavior as expected red before production changes — expected red: SDK 4/7 failed, CLI 7/12 failed, and the focused TypeScript oracle reported missing/incorrect public contracts; preservation assertions remained green ✅ (completed: 2026-08-30 01:11)

### Step 1.2: Implementation and Green Phase

- [x] 1.2.1 Correct documented public user, address, invitation, list, and history types/exports — `packages/sdk/src/types/users.ts`, `packages/sdk/src/types/common.ts`, `packages/sdk/src/types/index.ts` ✅ (completed: 2026-08-30 01:12)
- [x] 1.2.2 Correct offset/cursor mapping, invite result, reason bodies, and history envelopes for both user domains — `packages/sdk/src/domains/users.ts` ✅ (completed: 2026-08-30 01:14)
- [x] 1.2.3 Align user-specific positional SDK agent metadata/executor tests, including history and reason parameters, and ordinary CLI user commands without changing shared list metadata — `packages/sdk/src/agent.ts`, `packages/cli/src/commands/user.ts` ✅ (completed: 2026-08-30 01:17)
- [x] 1.2.4 Run ST-01–ST-07, including the focused TypeScript oracle command, and make the implementation green without changing expectations ✅ (completed: 2026-08-30 01:17)

### Step 1.3: Implementation Tests and Verification

- [x] 1.3.1 Add query omission, route/header, standalone parity, agent, and current-command implementation regressions — `packages/sdk/tests/domains/users-contract.impl.test.ts`, affected existing SDK/CLI tests ✅ (completed: 2026-08-30 01:19)
- [x] 1.3.2 Run the focused TypeScript oracle, SDK and CLI package verification, then root `yarn verify` for the multi-workspace revision ✅ (completed: 2026-08-30 01:33)

**Deliverables:** truthful current user SDK, aligned current consumers, and no compatibility shim.

**Verify:** `node_modules/@typescript/native/bin/tsc --project packages/sdk/tests/type-contracts/tsconfig.json --noEmit` · `yarn workspace @portaidentity/sdk verify` · `yarn workspace @portaidentity/cli verify` · `yarn verify`

> **Phase review**: completed 2026-08-30 01:36 against baseline tree
> `2a4c1684d189f01ea2dcb9e4c20bb8f4ed49423a`; correctness and security reviewers reported no
> findings. Root verification passed before commit `1d7c5530`. Incremental techdocs are N/A because
> this phase corrects existing contracts and the plan owns their focused documentation update in
> Phase 5.

---

## Phase 2: Validated User State and Service

> **Phase baseline tree**: `378dd8ecd4df2d823e635e2e8ea71d619170fba1`
> **Expected modification set**: `packages/cli/src/admin/{state,session-service,user-state,user-service,presentation,application,index}.ts`, `packages/cli/tests/admin/{session,user-service,application,application.authentication-gate,application.organization,organization-dialogs}.{spec,impl}.test.ts`, test inventory, and execution evidence
> **Scope mode**: strict — immutable user projections and lazy current SDK operations only; no JSVision UI, cache, persistence, polling, or lock subsystem

### Step 2.1: Specification Tests

**Reference**: [03-02](03-02-user-state-and-service.md) · ST-08–ST-17 and ST-35 · AR-4, AR-9

- [x] 2.1.1 [spec-author] Add exact capability, input, page/detail/history/preview, hostile-response, and fixed-failure specifications — `packages/cli/tests/admin/user-service.spec.test.ts`, `packages/cli/tests/admin/session.spec.test.ts` ✅ (completed: 2026-08-30 01:46)
- [x] 2.1.2 Run the focused service/session specifications and record expected red failures — expected red: 98/124 failed because the user service module and live user capability derivation were not implemented; 26 preservation assertions remained green ✅ (completed: 2026-08-30 01:46)

### Step 2.2: Implementation and Green Phase

- [x] 2.2.1 Add documented user capabilities and exact immutable page/detail/history/view-state projections; mechanically update existing presentation fallbacks, application/session constructors, and typed fixtures with fail-closed user capability defaults — `packages/cli/src/admin/{state,user-state,presentation,application}.ts`, affected existing Admin UI tests ✅ (completed: 2026-08-30 01:56)
- [x] 2.2.2 Implement list/detail/history/preview validation and fixed read operations — `packages/cli/src/admin/user-service.ts` ✅ (completed: 2026-08-30 01:56)
- [x] 2.2.3 Implement local mutation input conversion, fixed mutation results, and no-secret-state handling — `packages/cli/src/admin/user-service.ts` ✅ (completed: 2026-08-30 01:56)
- [x] 2.2.4 Derive exact live UserInfo capabilities and expose lazy authenticated user operations — `packages/cli/src/admin/session-service.ts`, `packages/cli/src/admin/index.ts` ✅ (completed: 2026-08-30 01:56)
- [x] 2.2.5 Run ST-08–ST-17 and ST-35 and make the implementation green without changing expectations — 124/124 focused specifications passed ✅ (completed: 2026-08-30 01:56)

### Step 2.3: Implementation Tests and Verification

- [x] 2.3.1 Add validator, ETag, whole-response rejection, no-secret-state, and lazy-domain implementation tests — `packages/cli/tests/admin/user-service.impl.test.ts`, `packages/cli/tests/admin/session.impl.test.ts` ✅ (completed: 2026-08-30 01:56)
- [x] 2.3.2 Run complete CLI package verification for the finished service/state boundary — final CLI verify passed: 51 files, 688 tests; final root verify passed including structure 96, server unit 2,863, integration 363, E2E 128, and pentest 224 ✅ (completed: 2026-08-30 02:30)

**Deliverables:** exact user capabilities and a UI-neutral validated user service boundary.

**Verify:** `yarn workspace @portaidentity/cli verify` · `yarn test:structure`; run root `yarn verify` before commit

> **Phase review**: completed 2026-08-30 02:18 against baseline tree
> `378dd8ecd4df2d823e635e2e8ea71d619170fba1`. Initial correctness and security review found
> runtime extra-property tenant/assignment injection, non-exact update payloads, missing requested-user
> response correlation, permissive timestamp/integer validation, and insufficient hostile-input
> regressions. Auto-design resolved them with explicit payload allowlists, strict projection validation,
> response correlation, and focused tests. Both reviewers then reported no remaining findings. A purge
> response schema was not invented: the immutable specification defines resolved `{}` as definite
> success and no purge response field enters application state. Incremental techdocs are N/A because
> this phase adds the already planned internal validation boundary; Phase 5 owns focused documentation.

---

## Phase 3: Users Workspace and Dialogs

> **Phase baseline tree**: `14a00da42280f3218807bb8a9ac03fe0e4d594c2`
> **Expected modification set**: `packages/cli/src/admin/{user-workspace,user-dialogs,presentation,application-runtime,index}.ts`, `packages/cli/tests/admin/{user-workspace,user-dialogs}.{spec,impl}.test.ts`, `packages/cli/tests/admin/application.spec.test.ts`, test inventory, and execution evidence
> **Scope mode**: strict — direct user-specific JSVision composition; no form/table generator, new shortcut, dependency, or generic screen abstraction

### Step 3.1: Specification Tests

**Reference**: [03-03](03-03-workspace-and-dialogs.md) · ST-18–ST-29 · AR-5, AR-9

- [x] 3.1.1 [spec-author] Add real JSVision Users menu and workspace rendering/typed-intent specifications for browse/search/filter/navigation/empty, detail, history, focus, and fixed states without SDK dispatch assertions — `packages/cli/tests/admin/user-workspace.spec.test.ts`, `packages/cli/tests/admin/application.spec.test.ts` ✅ (completed: 2026-08-30 02:39)
- [x] 3.1.2 [spec-author] Add create, invite/preview, edit, credentials, lifecycle, and purge dialog-result specifications without application reconciliation assertions — `packages/cli/tests/admin/user-dialogs.spec.test.ts` ✅ (completed: 2026-08-30 02:39)
- [x] 3.1.3 Run workspace/dialog specifications and record expected red failures — two missing feature modules and four missing Users-menu expectations failed while 14 retained application specifications passed ✅ (completed: 2026-08-30 02:39)

### Step 3.2: Implementation and Green Phase

- [x] 3.2.1 Implement list, detail, history, fixed states, selection, pagination, focus, and the closed user-specific intent callback — `packages/cli/src/admin/user-workspace.ts` ✅ (completed: 2026-08-30 02:47)
- [x] 3.2.2 Implement the create dialog with profile sections, local bounds, and secret cleanup — `packages/cli/src/admin/user-dialogs.ts` ✅ (completed: 2026-08-30 02:47)
- [x] 3.2.3 Implement invite and safe plain-text preview dialogs without assignment controls — `packages/cli/src/admin/user-dialogs.ts` ✅ (completed: 2026-08-30 02:47)
- [x] 3.2.4 Implement read-only-email profile editing with touched/clear semantics — `packages/cli/src/admin/user-dialogs.ts` ✅ (completed: 2026-08-30 02:47)
- [x] 3.2.5 Implement set/clear password and verify-email dialogs with unconditional secret cleanup — `packages/cli/src/admin/user-dialogs.ts` ✅ (completed: 2026-08-30 02:47)
- [x] 3.2.6 Implement lifecycle and explicit purge dialogs; apply only a mechanical user-specific split if AR-5's file-size trigger fires — `packages/cli/src/admin/user-dialogs.ts`, `packages/cli/src/admin/user-dialog-fields.ts` ✅ (completed: 2026-08-30 02:49)
- [x] 3.2.7 Add independently governed Users menu/chrome mounting and reuse the abortable modal helper — `packages/cli/src/admin/presentation.ts`, `packages/cli/src/admin/application-runtime.ts`, `packages/cli/src/admin/index.ts` ✅ (completed: 2026-08-30 02:50)
- [x] 3.2.8 Run ST-18–ST-29 and make the implementation green without changing expectations — 33/33 specification tests green ✅ (completed: 2026-08-30 02:52)

### Step 3.3: Implementation Tests and Verification

- [x] 3.3.1 Add geometry, control, signal, focus, password-clearing, modal teardown, and no-HTML implementation tests — `packages/cli/tests/admin/user-workspace.impl.test.ts`, `packages/cli/tests/admin/user-dialogs.impl.test.ts` ✅ (completed: 2026-08-30 02:52)
- [x] 3.3.2 Run complete CLI package verification for the finished workspace/dialog boundary — final CLI verify passed: 55 files, 734 tests; structure 96 and root verification passed ✅ (completed: 2026-08-30 03:29)

**Deliverables:** keyboard/mouse-complete Users UI using only existing JSVision components.

**Verify:** `yarn workspace @portaidentity/cli verify` · `yarn test:structure`; run root `yarn verify` before commit

> **Phase review**: completed 2026-08-30 03:29 against baseline tree
> `14a00da42280f3218807bb8a9ac03fe0e4d594c2`. Initial correctness and security reviews found
> compact geometry/action reachability, retained query/focus state, detail projection, unavailable-menu,
> preview-ownership, lifecycle-copy, and focused-boundary coverage gaps. Auto-design resolved those
> findings directly with responsive user-specific composition and focused regressions. Both reviewers
> reported no remaining findings. Resize-driven workflow ownership remains in its approved Phase 4
> task. Incremental techdocs are N/A because Phase 5 owns the focused Admin UI documentation update.

---

## Phase 4: Application Workflow Integration

> **Phase baseline tree**: _(recorded by exec-plan)_
> **Expected modification set**: `packages/cli/src/admin/{user-controller,application,session-service,presentation,index}.ts`, `packages/cli/src/commands/admin.ts`, `packages/cli/tests/admin/{application.users,application,session-wiring,command}.{spec,impl}.test.ts`, test inventory, and execution evidence
> **Scope mode**: strict — one in-memory selected-organization workflow; no application cache, background refresh, multi-operator conflict handling, or server change

### Step 4.1: Specification Tests

**Reference**: [03-04](03-04-application-integration.md) · ST-30–ST-34 · AR-4, AR-7, AR-9

- [ ] 4.1.1 [spec-author] Add exact selected-organization SDK dispatch for workspace intents, table-driven mutation outcome/reconciliation, bidirectional modal ownership, no-read mutation, explicit session-epoch context clearing including same-subject reauthentication, resize, final-401, late-result, and production command-provider specifications — `packages/cli/tests/admin/{application.users,session-wiring,command}.spec.test.ts`
- [ ] 4.1.2 Run focused application/session specifications and record expected red failures

### Step 4.2: Implementation and Green Phase

- [ ] 4.2.1 Implement user command routing, read state, retry, selection, context generation, and focus ownership — `packages/cli/src/admin/user-controller.ts`
- [ ] 4.2.2 Implement modal submit guards, fixed indeterminate outcomes, deliberate reconciliation/new-action release, fixed no-read success, and authentication-gate handoff — `packages/cli/src/admin/user-controller.ts`
- [ ] 4.2.3 Wire application-owned session epoch, bidirectional existing/user modal busy seam, controller command/cancel/resize/context forwarding, lazy session operations, disposal, and one memoized lazy production client feeding both organization and user providers — `packages/cli/src/admin/{application,session-service,presentation}.ts`, `packages/cli/src/commands/admin.ts`
- [ ] 4.2.4 Run ST-30–ST-34 plus retained authentication/organization/terminal specifications and make the implementation green without changing expectations

### Step 4.3: Implementation Tests and Verification

- [ ] 4.3.1 Add generation, duplicate-submit, command registration, lazy wiring, resize, and disposal implementation tests — `packages/cli/tests/admin/application.users.impl.test.ts`, `packages/cli/tests/admin/session-wiring.impl.test.ts`
- [ ] 4.3.2 Run complete CLI package verification for the finished user workflow

**Deliverables:** complete organization/session-isolated user workflow with unchanged existing shell behavior.

**Verify:** `yarn workspace @portaidentity/cli verify` · `yarn test:structure`; run root `yarn verify` before commit

---

## Phase 5: Packed Journey, Documentation, and Completion

> **Phase baseline tree**: _(recorded by exec-plan)_
> **Expected modification set**: `docker/admin-playground/tests/{admin-cli.e2e.spec.test.mjs,support/admin-cli-journey.mjs}`, `docs/guide/sdk.md`, `docs/cli/{overview,users}.md`, `packages/{sdk,cli}/README.md`, `techdocs/guides/admin-playground.md`, affected test inventory, this plan/review, and the admin-ui roadmap
> **Scope mode**: strict — existing Node 24 playground and current documentation only; no new playground, workflow, matrix, dependency, server implementation, or broad techdocs regeneration

### Step 5.1: Packed Specification

**Reference**: ST-36 · EV-01 · AR-1, AR-6

- [ ] 5.1.1 [spec-author] Extend the packed Admin UI specification with bounded Users browse/detail, one nonce-owned create/invite, exact cleanup, and terminal restoration — `docker/admin-playground/tests/admin-cli.e2e.spec.test.mjs`
- [ ] 5.1.2 Run the packed specification against the unchanged journey and record the expected red observation

### Step 5.2: Journey Implementation and Green Phase

- [ ] 5.2.1 Extend the existing PTY journey and inner cleanup path without adding a second harness — `docker/admin-playground/tests/support/admin-cli-journey.mjs`
- [ ] 5.2.2 Run ST-36 on Node 24 LTS and make the packed journey green without changing expectations

### Step 5.3: Documentation and Completion Gates

- [ ] 5.3.1 Update only directly affected user examples in the public SDK reference/package README, Admin UI Users guidance, corrected current `porta user` guidance, and maintainer playground steps — `docs/guide/sdk.md`, `packages/sdk/README.md`, `docs/cli/{overview,users}.md`, `packages/cli/README.md`, `techdocs/guides/admin-playground.md`
- [ ] 5.3.2 Run affected SDK/CLI package verifies, root `yarn verify`, repository structure tests, docs build, Prettier/diff checks, and the packed Node 24 journey; confirm no server/dependency/workflow/matrix or sensitive/generated file changed. Record security/protocol harness as N/A only while server/auth/protocol/production-security behavior remains unchanged.
- [ ] 5.3.3 From the clean committed Phase 5 revision, run `yarn assurance:compat --select p1-admin`, review its registered outcome taxonomy, and record EV-01

**Deliverables:** live packed proof, exact owned cleanup, truthful docs, and clean current compatibility evidence.

**Verify:** `yarn workspace @portaidentity/sdk verify` · `yarn workspace @portaidentity/cli verify` · `yarn verify` · `yarn test:structure` · `yarn docs:build` · existing packed Admin UI journey on Node 24 LTS · clean committed `yarn assurance:compat --select p1-admin`

---

## Dependencies

```text
Phase 1 truthful SDK/current consumers
    ↓
Phase 2 validated user state/service
    ↓
Phase 3 direct JSVision workspace/dialogs
    ↓
Phase 4 application/session workflow
    ↓
Phase 5 packed journey/docs/completion
```

## Success Criteria

The feature is complete when:

1. All 46 tasks are `[x]` and every phase retains spec → red → implementation → green → impl-test ordering.
2. ST-01–ST-36 and all unaffected existing tests remain green; EV-01 is recorded as completion evidence.
3. SDK/CLI package, structure/docs, packed Node 24, and clean `p1-admin` compatibility gates pass.
4. No cross-organization, malformed, control-bearing, secret, raw-error, or late result reaches the terminal state.
5. Password buffers are cleared on every exit, mutations dispatch at most once, and purge requires its explicit action.
6. No generic UI machinery, new dependency/endpoint/workflow/matrix, unrelated SDK cleanup, or server implementation enters the result.
7. Public/maintainer documentation and the Admin UI roadmap reflect the completed feature.
