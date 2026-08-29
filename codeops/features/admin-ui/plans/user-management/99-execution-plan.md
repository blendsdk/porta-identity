# Execution Plan: User Management

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-08-29 16:54
> **Progress**: 0/46 tasks (0%)
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

> **Phase baseline tree**: _(recorded by exec-plan)_
> **Expected modification set**: `packages/sdk/src/{types/common,types/users,types/index,domains/users,agent}.ts`, `packages/sdk/tests/{domains/users-contract.{spec,impl},domains/users,domains/standalone-users,agent/agent}.test.ts`, `packages/cli/src/commands/user.ts`, `packages/cli/tests/{commands/user-contract.spec,commands/user}.test.ts`, registered packed P1 requirement/probe files only if their current expectation needs alignment, test inventory, and execution evidence
> **Scope mode**: strict — named current user contracts only; no shim, new endpoint, server change, or unrelated SDK cleanup

### Step 1.1: Specification Tests

**Reference**: [03-01](03-01-sdk-user-contracts.md) · ST-01–ST-07 · AR-3

- [ ] 1.1.1 [spec-author] Add SDK user contract specifications for list modes, complete inputs, invite result, reasons, and history — `packages/sdk/tests/domains/users-contract.spec.test.ts`
- [ ] 1.1.2 [spec-author] Add current `porta user` consumer specifications for update, invite, reasons, and history — `packages/cli/tests/commands/user-contract.spec.test.ts`
- [ ] 1.1.3 Run both focused specification files and record the expected red failures before production changes

### Step 1.2: Implementation and Green Phase

- [ ] 1.2.1 Correct documented public user, address, invitation, list, and history types/exports — `packages/sdk/src/types/users.ts`, `packages/sdk/src/types/common.ts`, `packages/sdk/src/types/index.ts`
- [ ] 1.2.2 Correct offset/cursor mapping, invite result, reason bodies, and history envelopes for both user domains — `packages/sdk/src/domains/users.ts`
- [ ] 1.2.3 Align current SDK agent metadata and ordinary CLI user commands without aliases — `packages/sdk/src/agent.ts`, `packages/cli/src/commands/user.ts`
- [ ] 1.2.4 Run ST-01–ST-07 and make the implementation green without changing expectations

### Step 1.3: Implementation Tests and Verification

- [ ] 1.3.1 Add query omission, route/header, standalone parity, agent, and current-command implementation regressions — `packages/sdk/tests/domains/users-contract.impl.test.ts`, affected existing SDK/CLI tests
- [ ] 1.3.2 Run SDK and CLI package verification for the completed current-contract boundary

**Deliverables:** truthful current user SDK, aligned current consumers, and no compatibility shim.

**Verify:** `yarn workspace @portaidentity/sdk verify` · `yarn workspace @portaidentity/cli verify`

---

## Phase 2: Validated User State and Service

> **Phase baseline tree**: _(recorded by exec-plan)_
> **Expected modification set**: `packages/cli/src/admin/{state,session-service,user-state,user-service,index}.ts`, `packages/cli/tests/admin/{session,user-service}.{spec,impl}.test.ts`, test inventory, and execution evidence
> **Scope mode**: strict — immutable user projections and lazy current SDK operations only; no JSVision UI, cache, persistence, polling, or lock subsystem

### Step 2.1: Specification Tests

**Reference**: [03-02](03-02-user-state-and-service.md) · ST-08–ST-17 and ST-35 · AR-4, AR-9

- [ ] 2.1.1 [spec-author] Add exact capability, input, page/detail/history/preview, hostile-response, and fixed-failure specifications — `packages/cli/tests/admin/user-service.spec.test.ts`, `packages/cli/tests/admin/session.spec.test.ts`
- [ ] 2.1.2 Run the focused service/session specifications and record expected red failures

### Step 2.2: Implementation and Green Phase

- [ ] 2.2.1 Add documented user capabilities and immutable user/page/detail/history/view-state projections — `packages/cli/src/admin/state.ts`, `packages/cli/src/admin/user-state.ts`
- [ ] 2.2.2 Implement list/detail/history/preview validation and fixed read operations — `packages/cli/src/admin/user-service.ts`
- [ ] 2.2.3 Implement local mutation input conversion, fixed mutation results, and no-secret-state handling — `packages/cli/src/admin/user-service.ts`
- [ ] 2.2.4 Derive exact live UserInfo capabilities and expose lazy authenticated user operations — `packages/cli/src/admin/session-service.ts`, `packages/cli/src/admin/index.ts`
- [ ] 2.2.5 Run ST-08–ST-17 and ST-35 and make the implementation green without changing expectations

### Step 2.3: Implementation Tests and Verification

- [ ] 2.3.1 Add validator, ETag, whole-response rejection, no-secret-state, and lazy-domain implementation tests — `packages/cli/tests/admin/user-service.impl.test.ts`, `packages/cli/tests/admin/session.impl.test.ts`
- [ ] 2.3.2 Run complete CLI package verification for the finished service/state boundary

**Deliverables:** exact user capabilities and a UI-neutral validated user service boundary.

**Verify:** `yarn workspace @portaidentity/cli verify`

---

## Phase 3: Users Workspace and Dialogs

> **Phase baseline tree**: _(recorded by exec-plan)_
> **Expected modification set**: `packages/cli/src/admin/{user-workspace,user-dialogs,presentation,application-runtime,index}.ts`, `packages/cli/tests/admin/{user-workspace,user-dialogs}.{spec,impl}.test.ts`, `packages/cli/tests/admin/application.spec.test.ts`, test inventory, and execution evidence
> **Scope mode**: strict — direct user-specific JSVision composition; no form/table generator, new shortcut, dependency, or generic screen abstraction

### Step 3.1: Specification Tests

**Reference**: [03-03](03-03-workspace-and-dialogs.md) · ST-18–ST-29 · AR-5, AR-9

- [ ] 3.1.1 [spec-author] Add real JSVision Users menu, browse, detail, and history specifications — `packages/cli/tests/admin/user-workspace.spec.test.ts`, `packages/cli/tests/admin/application.spec.test.ts`
- [ ] 3.1.2 [spec-author] Add create, invite/preview, edit, credentials, lifecycle, and purge dialog specifications — `packages/cli/tests/admin/user-dialogs.spec.test.ts`
- [ ] 3.1.3 Run workspace/dialog specifications and record expected red failures

### Step 3.2: Implementation and Green Phase

- [ ] 3.2.1 Implement list, detail, history, fixed states, selection, pagination, and focus — `packages/cli/src/admin/user-workspace.ts`
- [ ] 3.2.2 Implement the create dialog with profile sections, local bounds, and secret cleanup — `packages/cli/src/admin/user-dialogs.ts`
- [ ] 3.2.3 Implement invite and safe plain-text preview dialogs without assignment controls — `packages/cli/src/admin/user-dialogs.ts`
- [ ] 3.2.4 Implement read-only-email profile editing with touched/clear semantics — `packages/cli/src/admin/user-dialogs.ts`
- [ ] 3.2.5 Implement set/clear password and verify-email dialogs with unconditional secret cleanup — `packages/cli/src/admin/user-dialogs.ts`
- [ ] 3.2.6 Implement lifecycle and explicit purge dialogs; apply only a mechanical user-specific split if AR-5's file-size trigger fires — `packages/cli/src/admin/user-dialogs.ts`
- [ ] 3.2.7 Add independently governed Users menu/chrome mounting and reuse the abortable modal helper — `packages/cli/src/admin/presentation.ts`, `packages/cli/src/admin/application-runtime.ts`, `packages/cli/src/admin/index.ts`
- [ ] 3.2.8 Run ST-18–ST-29 and make the implementation green without changing expectations

### Step 3.3: Implementation Tests and Verification

- [ ] 3.3.1 Add geometry, control, signal, focus, password-clearing, modal teardown, and no-HTML implementation tests — `packages/cli/tests/admin/user-workspace.impl.test.ts`, `packages/cli/tests/admin/user-dialogs.impl.test.ts`
- [ ] 3.3.2 Run complete CLI package verification for the finished workspace/dialog boundary

**Deliverables:** keyboard/mouse-complete Users UI using only existing JSVision components.

**Verify:** `yarn workspace @portaidentity/cli verify`

---

## Phase 4: Application Workflow Integration

> **Phase baseline tree**: _(recorded by exec-plan)_
> **Expected modification set**: `packages/cli/src/admin/{user-controller,application,session-service,presentation,index}.ts`, `packages/cli/tests/admin/{application.users,application,session-wiring}.{spec,impl}.test.ts`, test inventory, and execution evidence
> **Scope mode**: strict — one in-memory selected-organization workflow; no application cache, background refresh, multi-operator conflict handling, or server change

### Step 4.1: Specification Tests

**Reference**: [03-04](03-04-application-integration.md) · ST-30–ST-34 · AR-4, AR-7, AR-9

- [ ] 4.1.1 [spec-author] Add submit ownership, success reconciliation, no-read mutation, context clearing, resize preservation, final-401, and late-result specifications — `packages/cli/tests/admin/application.users.spec.test.ts`, `packages/cli/tests/admin/session-wiring.spec.test.ts`
- [ ] 4.1.2 Run focused application/session specifications and record expected red failures

### Step 4.2: Implementation and Green Phase

- [ ] 4.2.1 Implement user command routing, read state, retry, selection, context generation, and focus ownership — `packages/cli/src/admin/user-controller.ts`
- [ ] 4.2.2 Implement modal submit guards, mutation reconciliation, fixed no-read success, and authentication-gate handoff — `packages/cli/src/admin/user-controller.ts`
- [ ] 4.2.3 Wire controller construction, command/cancel/resize/context forwarding, lazy session operations, and disposal — `packages/cli/src/admin/application.ts`, `packages/cli/src/admin/session-service.ts`, `packages/cli/src/admin/presentation.ts`
- [ ] 4.2.4 Run ST-30–ST-34 plus retained authentication/organization/terminal specifications and make the implementation green without changing expectations

### Step 4.3: Implementation Tests and Verification

- [ ] 4.3.1 Add generation, duplicate-submit, command registration, lazy wiring, resize, and disposal implementation tests — `packages/cli/tests/admin/application.users.impl.test.ts`, `packages/cli/tests/admin/session-wiring.impl.test.ts`
- [ ] 4.3.2 Run complete CLI package verification for the finished user workflow

**Deliverables:** complete organization/session-isolated user workflow with unchanged existing shell behavior.

**Verify:** `yarn workspace @portaidentity/cli verify`

---

## Phase 5: Packed Journey, Documentation, and Completion

> **Phase baseline tree**: _(recorded by exec-plan)_
> **Expected modification set**: `docker/admin-playground/tests/{admin-cli.e2e.spec.test.mjs,support/admin-cli-journey.mjs}`, `docs/cli/{overview,users}.md`, `packages/cli/README.md`, `techdocs/guides/admin-playground.md`, affected test inventory, this plan/review, and the admin-ui roadmap
> **Scope mode**: strict — existing Node 24 playground and current documentation only; no new playground, workflow, matrix, dependency, server implementation, or broad techdocs regeneration

### Step 5.1: Packed Specification

**Reference**: ST-36–ST-37 · AR-1, AR-6

- [ ] 5.1.1 [spec-author] Extend the packed Admin UI specification with bounded Users browse/detail, one nonce-owned create/invite, exact cleanup, and terminal restoration — `docker/admin-playground/tests/admin-cli.e2e.spec.test.mjs`
- [ ] 5.1.2 Run the packed specification against the unchanged journey and record the expected red observation

### Step 5.2: Journey Implementation and Green Phase

- [ ] 5.2.1 Extend the existing PTY journey and inner cleanup path without adding a second harness — `docker/admin-playground/tests/support/admin-cli-journey.mjs`
- [ ] 5.2.2 Run ST-36 on Node 24 LTS and make the packed journey green without changing expectations

### Step 5.3: Documentation and Completion Gates

- [ ] 5.3.1 Update Admin UI Users guidance, corrected current `porta user` guidance, SDK references, and maintainer playground steps — `docs/cli/overview.md`, `docs/cli/users.md`, `packages/cli/README.md`, `techdocs/guides/admin-playground.md`
- [ ] 5.3.2 Run affected SDK/CLI package verifies, repository structure tests, docs build, Prettier/diff checks, and the packed Node 24 journey; confirm no server/dependency/workflow/matrix or sensitive/generated file changed
- [ ] 5.3.3 From the clean committed Phase 5 revision, run `yarn assurance:compat --select p1-admin`, review its registered outcome taxonomy, and record ST-37

**Deliverables:** live packed proof, exact owned cleanup, truthful docs, and clean current compatibility evidence.

**Verify:** `yarn workspace @portaidentity/sdk verify` · `yarn workspace @portaidentity/cli verify` · `yarn test:structure` · `yarn docs:build` · existing packed Admin UI journey on Node 24 LTS · clean committed `yarn assurance:compat --select p1-admin`

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
2. ST-01–ST-37 and all unaffected existing tests remain green.
3. SDK/CLI package, structure/docs, packed Node 24, and clean `p1-admin` compatibility gates pass.
4. No cross-organization, malformed, control-bearing, secret, raw-error, or late result reaches the terminal state.
5. Password buffers are cleared on every exit, mutations dispatch at most once, and purge requires its explicit action.
6. No generic UI machinery, new dependency/endpoint/workflow/matrix, unrelated SDK cleanup, or server implementation enters the result.
7. Public/maintainer documentation and the Admin UI roadmap reflect the completed feature.
