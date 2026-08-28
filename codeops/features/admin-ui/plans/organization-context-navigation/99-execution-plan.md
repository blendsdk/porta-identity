# Execution Plan: Organization Context and Navigation

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-08-28 14:10
> **Progress**: 28/31 tasks (90%)
> **CodeOps Artifact Schema**: 1

## Overview

Implement RD-02 inside the existing CLI through four specification-first phases: trusted
capability/service state, dialogs/presentation, application integration, and packed-playground/docs
completion. No server, SDK, dependency, workflow, or runtime-matrix task exists. (AR-4)

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                                                    | Tasks |
| ----- | -------------------------------------------------------- | ----: |
| 1     | Capability and organization service boundary             |     8 |
| 2     | Dialogs, menus, and landing presentation                 |    10 |
| 3     | Application workflows and production wiring              |     7 |
| 4     | Packed playground, documentation, and final verification |     6 |

**Total: 31 tasks across 4 phases**

> **⚠️ EXECUTION RULE — APPLIES TO EVERY AGENT EXECUTING THIS PLAN:**
>
> The task checkboxes in the phase sections below are the single source of truth for progress. The
> executing agent MUST:
>
> 1. On implementation, mark the task `[~]` with an implementation timestamp.
> 2. On verify pass, promote it to `[x]` with a completion timestamp.
> 3. Update Progress and Last Updated after every task; only `[x]` counts as complete.
> 4. Resume the first `[~]` task, otherwise the first `[ ]` task, scanning top-to-bottom.
> 5. Mark a blocked task `[!]` with its concise reason on the same line.
>
> Timestamps come from `date '+%Y-%m-%d %H:%M'`. New ST expectations are immutable after their
> expected-red checkpoint. Existing RD-01 assertions may change only through the Phase 2 green
> supersession split explicitly authorized by RD-02; every unaffected assertion remains immutable.

---

## Phase 1: Capability and Organization Service Boundary

> **Phase baseline tree**: `40119fe2136b2d214d9b57a71c0a7d0ae1886591`
> **Expected modification set**: `packages/cli/src/admin/{state,organization-service,session-service}.ts`, `packages/cli/src/auth/{types,login-coordinator}.ts`, `packages/cli/tests/admin/{session,organization-service}.{spec,impl}.test.ts`, `packages/cli/vitest.config.ts`, the CLI test-inventory count in `repo-tests/monorepo/server-package.spec.test.mjs`, this execution plan, the execution review, and the admin-ui roadmap
> **Scope mode**: strict — existing CLI only; no server, SDK, dependency, workflow, matrix, search, or pagination changes

### Step 1.1: Specification Tests

**Reference**: [03-01](03-01-organization-state-and-service.md) · ST-01–ST-10 and service portions of ST-28–ST-30 · AR-1–AR-3, AR-6–AR-8

- [x] 1.1.1 [spec-author] Add capability/session specification cases ST-01–ST-05 — `packages/cli/tests/admin/session.spec.test.ts` ✅ (completed: 2026-08-28 12:16)
- [x] 1.1.2 [spec-author] Add organization service cases ST-06–ST-10 plus sanitized reconciliation outcomes from ST-28–ST-30 — `packages/cli/tests/admin/organization-service.spec.test.ts` ✅ (completed: 2026-08-28 12:20)
- [x] 1.1.3 Run the two focused specification suites and record the expected red result before production changes ✅ (completed: 2026-08-28 12:21; expected red: 36 new failures, 11 existing passes)

### Step 1.2: Implementation and Green Phase

- [x] 1.2.1 Add documented capability/context/result types and the order-preserving validation/error wrapper — `packages/cli/src/admin/state.ts`, `packages/cli/src/admin/organization-service.ts`, `packages/cli/vitest.config.ts` ✅ (completed: 2026-08-28 12:25)
- [x] 1.2.2 Carry ephemeral capabilities through live UserInfo verification/login without changing persisted credentials — `packages/cli/src/admin/session-service.ts`, `packages/cli/src/auth/login-coordinator.ts` ✅ (completed: 2026-08-28 12:29; mechanical target correction: the verified-session type is owned by `login-coordinator.ts`)
- [x] 1.2.3 Run the Phase 1 capability, service, and reconciliation specifications and make the implementation green without changing expectations ✅ (completed: 2026-08-28 12:30; 47/47 focused specifications green)

### Step 1.3: Implementation Tests and Verification

- [x] 1.3.1 Add internal validation, typed-error, hostile-detail, and non-persistence coverage — `packages/cli/tests/admin/organization-service.impl.test.ts`, `packages/cli/tests/admin/session.impl.test.ts` ✅ (completed: 2026-08-28 12:31)
- [x] 1.3.2 Run the complete CLI package verification for the finished Phase 1 boundary ✅ (completed: 2026-08-28 12:32; 43 files and 504 tests passed)

**Deliverables:** trusted ephemeral capabilities, four-field organization projection, fixed failure
mapping, and green Phase 1 tests.

**Verify:** `yarn workspace @portaidentity/cli verify`

---

## Phase 2: Dialogs, Menus, and Landing Presentation

> **Phase baseline tree**: `3ef4da31558b92a275804b0250f08ecb607af84b`
> **Expected modification set**: `packages/cli/src/admin/{application,index,organization-dialogs,presentation,state}.ts`, `packages/cli/tests/admin/{application,organization-dialogs}.{spec,impl}.test.ts`, `packages/cli/vitest.config.ts`, the CLI test-inventory count in `repo-tests/monorepo/server-package.spec.test.mjs`, this execution plan, the ambiguity register, and the execution review
> **Scope mode**: strict — existing JSVision application only; no new UI framework, dependency, workspace, workflow, or runtime matrix

### Step 2.1: Specification Tests

**Reference**: [03-02](03-02-dialogs-and-presentation.md) · presentation/dialog portions of ST-11–ST-19 · AR-1–AR-3, AR-8

- [x] 2.1.1 Split the mixed RD-01 application specifications while green according to the supersession inventory; retain every unaffected theme, server, authentication, warning, shortcut, lifecycle, and security assertion — `packages/cli/tests/admin/application.spec.test.ts` ✅ (completed: 2026-08-28 12:41; 9/9 specifications remain green)
- [x] 2.1.2 [spec-author] Add real JSVision dialog specification cases ST-12–ST-18 — `packages/cli/tests/admin/organization-dialogs.spec.test.ts` ✅ (completed: 2026-08-28 12:46)
- [x] 2.1.3 [spec-author] Replace only RD-02-superseded presentation assertions and add menu, Who am I keyboard/modal/focus, and landing cases ST-11–ST-13, ST-17, and ST-19 — `packages/cli/tests/admin/application.spec.test.ts` ✅ (completed: 2026-08-28 12:52; expected red: 7 new failures, 8 retained passes)
- [x] 2.1.4 Run the focused dialog/application specification suites and record the expected red result for new RD-02 behavior ✅ (completed: 2026-08-28 12:53; expected red: 22 new failures, 8 retained passes)

### Step 2.2: Implementation and Green Phase

- [x] 2.2.1 Implement Who am I, chooser, and create dialogs with real JSVision controls and bounded values — `packages/cli/src/admin/organization-dialogs.ts`, `packages/cli/vitest.config.ts` ✅ (completed: 2026-08-28 12:58; 15/15 dialog specifications green; 7 later presentation specifications remain expected-red)
- [x] 2.2.2 Implement labelled global/Organizations menus, concise disabled reasons, minimal landing view, and default-theme responsive rendering — `packages/cli/src/admin/presentation.ts` ✅ (completed: 2026-08-28 13:01; mechanical state target correction: selected organization fields are owned by `state.ts`; typecheck and 4 presentation-owned specifications green)
- [x] 2.2.3 Add dialog/menu exports needed by the application without creating a public package surface — `packages/cli/src/admin/index.ts`, `packages/cli/src/admin/application.ts` ✅ (completed: 2026-08-28 13:08; 30/30 focused application and dialog specifications green)
- [x] 2.2.4 Run the Phase 2-owned portions of ST-11–ST-19 and make the implementation green without changing specification expectations ✅ (completed: 2026-08-28 13:09; 30/30 focused specifications green)

### Step 2.3: Implementation Tests and Verification

- [x] 2.3.1 Add dialog signal/focus/list/button and presentation geometry diagnostics — `packages/cli/tests/admin/organization-dialogs.impl.test.ts`, `packages/cli/tests/admin/application.impl.test.ts` ✅ (completed: 2026-08-28 13:15; 45 files and 530 CLI tests plus 96 structure tests passed)
- [x] 2.3.2 Run the complete CLI package verification for the finished Phase 2 UI ✅ (completed: 2026-08-28 13:16; 45 files and 530 tests passed)

**Deliverables:** keyboard-complete dialogs and menus, responsive organization landing view, and
green Phase 2 tests.

**Verify:** `yarn workspace @portaidentity/cli verify`

---

## Phase 3: Application Workflows and Production Wiring

> **Phase baseline tree**: `e2f7b5a0364f9b42292003cbe43078ee00584659`
> **Expected modification set**: `packages/cli/src/admin/{application,application-runtime,presentation,session-service}.ts`, `packages/cli/src/commands/admin.ts`, `packages/cli/tests/admin/{application,application.organization,application.pty,command,session,session-wiring}.{spec,impl}.test.ts`, the CLI test-inventory count in `repo-tests/monorepo/server-package.spec.test.mjs`, this execution plan, the ambiguity register, and the execution review
> **Scope mode**: strict — approved in-memory organization workflow and lazy existing-SDK wiring only; no server, SDK, dependency, workflow, matrix, search, or pagination changes

### Step 3.1: Specification Tests

**Reference**: [03-03](03-03-application-and-session-integration.md) · application-owned portions of ST-14, ST-17, ST-20–ST-32, and ST-35 · AR-3, AR-6–AR-8

- [x] 3.1.1 [spec-author] Add no-request/gating/modal-ownership, initial-choice, switch/create, recovery, reauthentication, late-result, and lazy selected-server wiring cases — `packages/cli/tests/admin/application.organization.spec.test.ts`, `packages/cli/tests/admin/session.spec.test.ts`, `packages/cli/tests/admin/command.spec.test.ts` ✅ (completed: 2026-08-28 13:31; 63 retained/new specifications pass and 21 Phase 3 specifications are expected-red)
- [x] 3.1.2 Run the focused application/session/command specification suites and record the expected red result ✅ (completed: 2026-08-28 13:31; expected red: 21 Phase 3 failures and 63 passes)

### Step 3.2: Implementation and Green Phase

- [x] 3.2.1 Implement single-owner organization command orchestration, auto-choice, atomic switch/create, recovery gate, and reauthentication reconciliation — `packages/cli/src/admin/application.ts`, `packages/cli/src/admin/application-runtime.ts`, `packages/cli/src/admin/presentation.ts` ✅ (completed: 2026-08-28 13:43; 37/37 focused application specifications green; mechanical target corrections: landing presentation owns the existing fixed organization-failure field, and the pre-existing native terminal adapter moved intact to keep the coordinator within its file limit)
- [x] 3.2.2 Add lazy authenticated organization-domain wiring while reusing `createClient()` unchanged — `packages/cli/src/admin/session-service.ts`, `packages/cli/src/commands/admin.ts` ✅ (completed: 2026-08-28 13:44; typecheck, lint, and 50 focused command/session tests passed)
- [x] 3.2.3 Run the Phase 3-owned portions of ST-14, ST-17, ST-20–ST-32, and ST-35 and make the implementation green without changing specification expectations ✅ (completed: 2026-08-28 13:45; 84/84 focused specifications green)

### Step 3.3: Implementation Tests and Verification

- [x] 3.3.1 Add operation-generation, command-registration, resize, signal, disposal, and lazy-wiring diagnostics — `packages/cli/tests/admin/application.impl.test.ts`, `packages/cli/tests/admin/application.pty.impl.test.ts`, `packages/cli/tests/admin/session-wiring.impl.test.ts` ✅ (completed: 2026-08-28 13:47; lint, typecheck, and 18 focused implementation tests passed)
- [x] 3.3.2 Run the complete CLI package verification for the finished Phase 3 workflow ✅ (completed: 2026-08-28 13:47; 46 files and 557 tests passed; post-review fixes verified with 560 tests and a clean bounded re-review)

**Deliverables:** complete in-memory organization workflow with deterministic cancellation,
reauthentication, and production SDK wiring.

**Verify:** `yarn workspace @portaidentity/cli verify`

---

## Phase 4: Packed Playground, Documentation, and Final Verification

> **Phase baseline tree**: `bc7e48c785f7971f9bad69c27dffbab33efdb390`
> **Expected modification set**: `docker/admin-playground/tests/admin-cli.e2e.spec.test.mjs`, `docker/admin-playground/tests/support/admin-cli-journey.mjs`, `docs/cli/overview.md`, `packages/cli/README.md`, `techdocs/guides/admin-playground.md`, this execution plan, the execution review, and the admin-ui and portfolio roadmaps
> **Scope mode**: strict — existing packed playground and documentation only; no server, SDK, dependency, workspace, workflow, matrix, search, or pagination changes

### Step 4.1: Packed Specification

**Reference**: ST-33–ST-34 and EV-01 · AR-4, AR-5, AR-9, AR-10

- [x] 4.1.1 [spec-author] Extend packed evidence expectations for chooser, Who am I identity, explicit switch, create-auto-select, exact cleanup, and restoration — `docker/admin-playground/tests/admin-cli.e2e.spec.test.mjs` ✅ (completed: 2026-08-28 14:03)
- [x] 4.1.2 Run the packed specification against the unchanged journey adapter and record the expected red result ✅ (completed: 2026-08-28 14:04; expected red: 4 failures — missing live password plus 3 missing cleanup helper cases)

### Step 4.2: Journey Implementation and Green Phase

- [x] 4.2.1 Drive the existing PTY journey through chooser cancellation/focus restoration, Who am I, switch, and high-entropy create; prove the slug absent, then use a packed Node cleanup child with the temporary credential home, selected issuer, and trusted system CA to verify nonce ownership, destroy exactly that slug through the installed packed SDK in an inner `finally`, verify absence, and expose one narrow post-dispatch failure seam — `docker/admin-playground/tests/support/admin-cli-journey.mjs` ✅ (completed: 2026-08-28 14:10; 3 deterministic cleanup/error cases green; live password prerequisite remains for task 4.2.2)
- [ ] 4.2.2 Run the existing packed playground journey and focused cleanup-failure check; make ST-33–ST-34 green and prove ordered preservation of primary-only, cleanup-only, and simultaneous failures without changing expectations

### Step 4.3: Documentation and Scoped Completion

- [ ] 4.3.1 Update CLI usage and maintainer-playground guidance for organization choice/create — `docs/cli/overview.md`, `packages/cli/README.md`, `techdocs/guides/admin-playground.md`
- [ ] 4.3.2 Run Node 24 LTS scoped completion and record EV-01: CLI package verification, repository structure tests, packed playground journey, formatting, diff/sensitive-file inspection, and confirmation that no server/SDK/workflow/matrix change exists

**Deliverables:** packed live proof, exact test cleanup, updated usage guidance, and scoped final
verification.

**Verify:** `yarn workspace @portaidentity/cli verify` · `yarn test:structure` · existing packed
admin-playground journey on Node 24 LTS

---

## Dependencies

```text
Phase 1 trusted state/service
    ↓
Phase 2 dialogs/presentation
    ↓
Phase 3 application integration
    ↓
Phase 4 packed journey/docs/verification
```

## Success Criteria

The feature is complete when:

1. All 31 tasks are `[x]` and every phase remains specification-first.
2. Every ST-01–ST-35 expectation is green, EV-01 is recorded, and every non-superseded specification remains intact.
3. CLI verification, structure tests, and the existing packed journey pass on Node 24 LTS.
4. No raw identity/SDK/server data escapes the bounded presentation boundary.
5. No dead code, duplicate operation, leaked modal, late state update, or test-owned organization
   remains.
6. No server, SDK, dependency, workspace, workflow, matrix, search, or pagination implementation is
   introduced. (AR-4)
7. Documentation is updated and the CodeOps roadmap reflects completion state.
