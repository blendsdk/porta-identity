# Execution Plan: Selective Environment Portability

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-09-13 19:33
> **Progress**: 9/60 tasks (15%)
> **CodeOps Artifact Schema**: 1

## Overview

Implement the strict RD-02 manifest and its server, SDK, conventional CLI, and terminal Admin UI
workflows by correcting the unused v1 import surface directly. Every implementation phase begins
with immutable specification tests and a recorded red phase. (AR-1, AR-2, AR-6)

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                                       | Tasks |
| ----- | ------------------------------------------- | ----: |
| 1     | Strict server contract and protected routes |     9 |
| 2     | Selective manifest export                   |     9 |
| 3     | Atomic preview and import                   |    12 |
| 4     | SDK, conventional CLI, and public docs      |    19 |
| 5     | Terminal Admin UI and completion gates      |    11 |

**Total: 60 tasks across 5 phases**

> **⚠️ EXECUTION RULE — APPLIES TO EVERY AGENT EXECUTING THIS PLAN:**
>
> The task checkboxes in the phase sections below are the **single source of truth** for progress.
> Every task line appears exactly once in this document. The executing agent MUST:
>
> 1. **On implementation:** mark the task `[~]` with a timestamp —
>    `- [~] 1.1.1 Task description ⏳ (implemented: YYYY-MM-DD HH:MM)`
> 2. **On verify pass:** promote it to `[x]` —
>    `- [x] 1.1.1 Task description ✅ (completed: YYYY-MM-DD HH:MM)`
> 3. **Update the Progress header** and Last Updated stamp after EVERY task. Only `[x]` counts.
> 4. **Resume** with the first `[~]` task, otherwise the first `[ ]` task, scanning top-to-bottom.
> 5. **On blocker:** mark `[!]` and append `Blocked: <short reason>` on the same line.
>
> Timestamps come from `date '+%Y-%m-%d %H:%M'`. The lifecycle is Ready, Executing, Done, or
> Blocked, derived from these markers.

---

## Phase 1: Strict Server Contract and Protected Routes

> **Phase baseline tree**: `fc747d694d1d6d68fc5964be3324bca4adf41b53`
> **Scope mode**: strict
> **Expected modification set**: Phase 1 server contract, shared domain validators and affected
> routes, focused server specification/implementation tests, this execution plan, phase review
> evidence, and directly affected technical documentation.

### Step 1.1: Specification Tests

**Reference**: [03-01](03-01-server-contract.md) · [ST-1–ST-10](07-testing-strategy.md) · AR-1, AR-2

- [x] 1.1.1 [spec-author] Write strict manifest specification tests ST-1–ST-4 — `packages/server/tests/unit/portability/manifest-contract.spec.test.ts` ✅ (completed: 2026-09-13 18:02)
- [x] 1.1.2 [spec-author] Write exact error/request-ID, permission, accepted-path parser, limit, and no-store route specifications ST-5–ST-10 — `packages/server/tests/unit/routes/portability-routes.spec.test.ts` ✅ (completed: 2026-09-13 18:13)
- [x] 1.1.3 Run the Phase 1 specification selectors and record the expected missing-contract failures (red phase) ✅ (completed: 2026-09-13 18:14; expected red: 2 suites, planned portability modules absent)

### Step 1.2: Implementation

**Reference**: [03-01 §Public Types and Schemas](03-01-server-contract.md) · [03-01 §Authorization](03-01-server-contract.md) · AR-1, AR-2

- [x] 1.2.1 Add exact manifest/result types and strict Zod schemas; extract only shared field validators into existing domain areas and make ordinary routes consume them — `packages/server/src/portability/types.ts`, `packages/server/src/portability/schema.ts`, `packages/server/src/portability/index.ts`, `packages/server/src/organizations/validators.ts`, `packages/server/src/applications/validators.ts`, `packages/server/src/users/validators.ts`, `packages/server/src/clients/validators.ts`, and the four affected route modules ✅ (completed: 2026-09-13 18:31)
- [x] 1.2.2 Add the closed category-permission and exact-super-admin authorization helper — `packages/server/src/portability/authorization.ts`, `packages/server/src/lib/admin-permissions.ts` ✅ (completed: 2026-09-13 18:37)
- [x] 1.2.3 Correct export/import routes with the exact status/code/body contract, existing request-ID correlation, content-free 503 logging, and safe consumer diagnostics — `packages/server/src/routes/exports.ts`, `packages/server/src/routes/imports.ts`, affected SDK/CLI/Admin UI error adapters ✅ (completed: 2026-09-13 18:50)
- [x] 1.2.4 Exclude every router-accepted import POST path variant from the standard parser and mount the protected 64 MiB parser — `packages/server/src/server.ts`, `packages/server/src/routes/imports.ts` ✅ (completed: 2026-09-13 18:56)
- [x] 1.2.5 Run Phase 1 specification selectors and make them pass without changing expectations (green phase) ✅ (completed: 2026-09-13 18:59; 2 suites, 41 tests)

### Step 1.3: Implementation Tests and Hardening

**Reference**: [03-01 §Testing Requirements](03-01-server-contract.md) · AR-6

- [x] 1.3.1 Add schema and authorization implementation tests, then run `yarn verify` — `packages/server/tests/unit/portability/manifest.impl.test.ts`, `packages/server/tests/unit/portability/authorization.impl.test.ts` ✅ (completed: 2026-09-13 19:33; 12 focused tests and full repository verification passed)

**Deliverables:** strict public schema, protected parser boundary, closed authorization, safe routes,
and green Phase 1 tests.

**Verify**: focused server unit selectors, `yarn test:structure`, then `yarn verify` (AR-6)

---

## Phase 2: Selective Manifest Export

### Step 2.1: Specification Tests

**Reference**: [03-02 §Export](03-02-portability-engine.md) · [ST-11–ST-18, ST-37](07-testing-strategy.md) · AR-1

- [ ] 2.1.1 [spec-author] Write export-engine specification tests ST-11–ST-18 and ST-37 — `packages/server/tests/unit/portability/portability-engine.spec.test.ts`
- [ ] 2.1.2 [spec-author] Write live export and audit round-trip cases for ST-11–ST-18 — `packages/server/tests/integration/admin/portability-round-trip.spec.test.ts`
- [ ] 2.1.3 Run the Phase 2 selectors and record the expected missing-export failures (red phase)

### Step 2.2: Implementation

**Reference**: [03-02 §Export](03-02-portability-engine.md) · AR-1, AR-2, AR-5

- [ ] 2.2.1 Add explicit-column scope, organization, application, and authorization graph export queries — `packages/server/src/portability/repository.ts`, `packages/server/src/portability/export.ts`
- [ ] 2.2.2 Add users/assignments, clients, branding assets, normalized ordering, and control-plane exclusions — `packages/server/src/portability/repository.ts`, `packages/server/src/portability/export.ts`
- [ ] 2.2.3 Add repeatable-read audit/size/attachment completion and connect the manifest route — `packages/server/src/portability/export.ts`, `packages/server/src/routes/exports.ts`
- [ ] 2.2.4 Run Phase 2 specification and integration selectors and make them pass (green phase)

### Step 2.3: Implementation Tests and Hardening

**Reference**: [03-02 §Testing Requirements](03-02-portability-engine.md) · AR-6

- [ ] 2.3.1 Add export normalization, ordering, exclusion, and size-edge implementation tests — `packages/server/tests/unit/portability/export.impl.test.ts`
- [ ] 2.3.2 Run focused server tests, `yarn test:structure`, and `yarn verify`

**Deliverables:** deterministic selective manifest export, content-free audit, safe size failure, and
retained report exports.

**Verify**: focused server unit/integration selectors, `yarn test:structure`, then `yarn verify`

---

## Phase 3: Atomic Preview and Import

### Step 3.1: Specification Tests

**Reference**: [03-02 §Mutation-Free Plan](03-02-portability-engine.md) · [ST-19–ST-37](07-testing-strategy.md) · AR-1

- [ ] 3.1.1 [spec-author] Complete engine cases ST-19–ST-21 and ST-25–ST-37 plus route cases ST-22–ST-24 — `packages/server/tests/unit/portability/portability-engine.spec.test.ts`, `packages/server/tests/unit/routes/portability-routes.spec.test.ts`
- [ ] 3.1.2 [spec-author] Complete live plan/apply/rollback/cleanup round-trip cases ST-19–ST-37 — `packages/server/tests/integration/admin/portability-round-trip.spec.test.ts`
- [ ] 3.1.3 Add portability authorization pentest specifications for tenant scope, exact role, hostile values, payload limit, and secret exposure — `packages/server/tests/pentest/admin-security/portability.spec.test.ts`
- [ ] 3.1.4 Run Phase 3 unit, integration, and pentest selectors and record expected missing-import failures (red phase)

### Step 3.2: Implementation

**Reference**: [03-02 §Atomic Apply](03-02-portability-engine.md) · AR-1, AR-2

- [ ] 3.2.1 Implement normalization, duplicate rejection, natural-key resolution, compatibility, ordered result planning, and exact aggregate role-permission actions — `packages/server/src/portability/plan.ts`, `packages/server/src/portability/repository.ts`
- [ ] 3.2.2 Implement organization, application, module, role, permission, claim, and role-permission writers — `packages/server/src/portability/apply.ts`, `packages/server/src/portability/repository.ts`
- [ ] 3.2.3 Implement user, role-assignment, claim-value, and client writers plus one-time client-secret creation — `packages/server/src/portability/apply.ts`, `packages/server/src/portability/repository.ts`
- [ ] 3.2.4 Add transaction-bound audit and targeted post-commit cache/authority cleanup — `packages/server/src/portability/apply.ts`, `packages/server/src/portability/cleanup.ts`
- [ ] 3.2.5 Remove the legacy import engine/plan, connect preview/apply routes, and migrate its direct server test consumers while preserving still-valid security and atomicity assertions — `packages/server/src/lib/data-import.ts`, `packages/server/src/lib/data-import-plan.ts`, `packages/server/src/routes/imports.ts`, `packages/server/tests/unit/admin/administrative-data-{adapter,contract,production-driver}.ts`, `packages/server/tests/unit/admin/administrative-data-{contract.spec,impl}.test.ts`, `packages/server/tests/unit/clients/protocol-compatibility.spec.test.ts`, `packages/server/tests/unit/lib/data-import-extensions.test.ts`, `packages/server/tests/integration/services/data-export-import.test.ts`
- [ ] 3.2.6 Run Phase 3 specification, integration, and pentest selectors and make them pass (green phase)

### Step 3.3: Implementation Tests and Hardening

**Reference**: [03-02 §Testing Requirements](03-02-portability-engine.md) · AR-6

- [ ] 3.3.1 Add planner/apply internal edge tests — `packages/server/tests/unit/portability/plan.impl.test.ts`, `packages/server/tests/unit/portability/apply.impl.test.ts`
- [ ] 3.3.2 From the phase checkpoint, run focused suites, `yarn assurance:harness --project security --profile production-security`, `yarn test:structure`, and `yarn verify`; review the assurance exit taxonomy and artifact

**Deliverables:** mutation-free preview, atomic keep/update apply, one-time new-client credentials,
safe results, targeted cleanup, and no legacy importer.

**Verify**: focused unit/integration/pentest selectors, applicable production-security assurance,
`yarn test:structure`, then `yarn verify` (AR-6)

---

## Phase 4: SDK, Conventional CLI, and Public Docs

### Step 4.1: Specification Tests

**Reference**: [03-03](03-03-sdk-cli.md) · [ST-38–ST-51](07-testing-strategy.md) · AR-4, AR-7

- [ ] 4.1.1 [spec-author] Write SDK wire/type specifications ST-38–ST-42 and register the type-contract file — `packages/sdk/tests/domains/portability.spec.test.ts`, `packages/sdk/tests/type-contracts/portability.spec.test.ts`, `packages/sdk/tests/type-contracts/tsconfig.json`
- [ ] 4.1.2 [spec-author] Write conventional CLI workflow specifications ST-43–ST-51 — `packages/cli/tests/commands/portability.spec.test.ts`
- [ ] 4.1.3 Run the SDK and CLI specification selectors and record expected missing-surface failures (red phase)

### Step 4.2: Implementation

**Reference**: [03-03 §SDK Types and Methods](03-03-sdk-cli.md) · [03-03 §Export Command](03-03-sdk-cli.md) · AR-1, AR-4, AR-5, AR-7

- [ ] 4.2.1 Replace legacy SDK import types, add exact portability request/result exports, and migrate direct SDK contract consumers — `packages/sdk/src/types/imports.ts`, `packages/sdk/src/types/exports.ts`, `packages/sdk/src/types/index.ts`, `packages/server/tests/unit/contracts/sdk-imports-contract.test.ts`, `packages/server/tests/unit/contracts/sdk-domains-contract.test.ts`
- [ ] 4.2.2 Implement SDK manifest export, preview/apply handling for success and exact rejected-plan results, safe attachment handling, and the replacement agent operations; migrate direct SDK tests — `packages/sdk/src/domains/exports.ts`, `packages/sdk/src/domains/imports.ts`, `packages/sdk/src/client.ts`, `packages/sdk/src/agent.ts`, `packages/sdk/tests/client/client.test.ts`, `packages/sdk/tests/domains/imports.test.ts`
- [ ] 4.2.3 Implement `porta export manifest` and register it — `packages/cli/src/commands/export.ts`, `packages/cli/src/index.ts`
- [ ] 4.2.4 Implement `porta import manifest` preview/confirm/apply and structured output — `packages/cli/src/commands/import.ts`, `packages/cli/src/index.ts`, `packages/cli/src/prompt.ts`
- [ ] 4.2.5 Remove legacy `provision` registration, transformer, focused tests, and the `yaml` dependency if the retirement scan confirms no remaining import — `packages/cli/src/commands/provision.ts`, `packages/cli/tests/commands/provision.test.ts`, `packages/cli/src/index.ts`, `packages/cli/package.json`, `yarn.lock`
- [ ] 4.2.6 Remove the obsolete simple and multi-organization provisioning examples — `examples/provision-simple.yaml`, `examples/provision-multi-org.yaml`
- [ ] 4.2.7 Remove the obsolete enterprise and full provisioning examples — `examples/provision-enterprise.yaml`, `examples/provision-full.yaml`
- [ ] 4.2.8 Remove the obsolete provisioning smoke script and stale Docker command inventory — `scripts/provision-smoke-test.ts`, `docker/porta.sh`
- [ ] 4.2.9 Update repository structure expectations for the removed surface — `repo-tests/monorepo/root-scripts.spec.test.mjs`, `repo-tests/monorepo/server-package.spec.test.mjs`
- [ ] 4.2.10 Run Phase 4 SDK/CLI specifications and make them pass (green phase)

### Step 4.3: Implementation Tests and Hardening

**Reference**: [03-03 §Documentation Cleanup](03-03-sdk-cli.md) · AR-6

- [ ] 4.3.1 Add SDK/CLI implementation edge tests and migrate the existing packed `admin-data` compatibility probe, contract, adapters, requirements, tests, and live driver to the new contract — `packages/sdk/tests/domains/portability.impl.test.ts`, `packages/cli/tests/commands/portability.impl.test.ts`, `test-harness/consumers/admin-data-sdk-probe.mjs`, `test-harness/assurance/compat/admin-data-live.ts`, `test-harness/assurance/tests/packed-admin-data-*`
- [ ] 4.3.2 Rewrite API, CLI, and public package portability references and remove stale provisioning claims — `docs/api/exports.md`, `docs/api/imports.md`, `docs/cli/provisioning.md`, `packages/cli/README.md`, `packages/sdk/README.md`
- [ ] 4.3.3 Update conventional CLI overview and VitePress navigation — `docs/cli/overview.md`, `docs/.vitepress/config.ts`
- [ ] 4.3.4 Replace stale quickstart and setup-alternative provisioning guidance — `docs/guide/quickstart.md`, `docs/guide/setup-alternatives.md`
- [ ] 4.3.5 Replace stale SDK portability examples and domain tables — `docs/guide/sdk.md`, `docs/guide/sdk-node.md`, `docs/guide/sdk-agent.md`
- [ ] 4.3.6 Across active source, tests, assurance, public docs, and examples, run a zero-hit scan for `imports.provision`, `porta provision`, legacy import schema/mode symbols, and removed file paths; then run `yarn docs:build`, clean-revision `yarn assurance:compat --select admin-data`, and `yarn verify`; do not rewrite historical CodeOps artifacts

**Deliverables:** exact SDK, two conventional commands, removed legacy provisioning surface, and
accurate public documentation.

**Verify**: SDK/CLI focused selectors, workspace verifies, `yarn docs:build`, `yarn test:structure`,
clean-revision compatibility assurance, then `yarn verify` (AR-6)

---

## Phase 5: Terminal Admin UI and Completion Gates

### Step 5.1: Specification Tests

**Reference**: [03-04](03-04-admin-ui.md) · [ST-52–ST-63](07-testing-strategy.md) · AR-3

- [ ] 5.1.1 [spec-author] Write workspace/layout specification tests ST-52–ST-62 — `packages/cli/tests/admin/portability-workspace.spec.test.ts`
- [ ] 5.1.2 [spec-author] Write application lifecycle, cancellation, and focus specification ST-63 — `packages/cli/tests/admin/portability-application.spec.test.ts`
- [ ] 5.1.3 Run terminal Admin UI specification selectors and record expected missing-workspace failures (red phase)

### Step 5.2: Implementation

**Reference**: [03-04 §Menu and Workspace](03-04-admin-ui.md) · [03-04 §State and Cancellation](03-04-admin-ui.md) · AR-1, AR-3

- [ ] 5.2.1 Add immutable portability state, intents, and UI-neutral SDK operations — `packages/cli/src/admin/portability-state.ts`, `packages/cli/src/admin/portability-service.ts`
- [ ] 5.2.2 Build the maximized two-tab Layout DSL workspace, selectable summaries, authorized initial tab, and fixed unauthorized-tab state while reusing the existing selectable input unchanged — `packages/cli/src/admin/portability-workspace.ts`
- [ ] 5.2.3 Implement controller-owned open/save dialogs, file limits, preview invalidation, apply confirmation, and sequential reuse of the existing one-time-secret presenter — `packages/cli/src/admin/portability-controller.ts`, `packages/cli/src/admin/client-dialogs.ts`
- [ ] 5.2.4 Derive exact super-admin capability and expose portability session operations — `packages/cli/src/admin/state.ts`, `packages/cli/src/admin/session-service.ts`, `packages/cli/src/commands/admin.ts`
- [ ] 5.2.5 Wire the menu, controller ownership cancellation, ignored late results, and focus without claiming server-side apply cancellation — `packages/cli/src/admin/presentation.ts`, `packages/cli/src/admin/application.ts`, `packages/cli/src/admin/index.ts`
- [ ] 5.2.6 Run Phase 5 Admin UI specification selectors and make them pass (green phase)

### Step 5.3: Implementation Tests and Hardening

**Reference**: [03-04 §Testing Requirements](03-04-admin-ui.md) · AR-6

- [ ] 5.3.1 Add controller implementation tests — `packages/cli/tests/admin/portability-controller.impl.test.ts`
- [ ] 5.3.2 From the final feature checkpoint, run focused server/SDK/CLI suites, `yarn test:structure`, `yarn docs:build`, applicable security and compatibility assurance, and final `yarn verify`; review every assurance artifact and exit taxonomy

**Deliverables:** focused Import / Export workspace, correct scope/capability gating, safe file and
preview lifecycle, one-time secrets, and all completion gates green.

**Verify**: focused terminal Admin UI and cross-workspace selectors, `yarn test:structure`,
`yarn docs:build`, applicable security/compatibility assurance, and final `yarn verify` (AR-6)

---

## Dependencies

```text
Phase 1 strict contract
    ↓
Phase 2 selective export
    ↓
Phase 3 preview and atomic apply
    ↓
Phase 4 SDK, CLI, and docs
    ↓
Phase 5 terminal Admin UI and final gates
```

## Success Criteria

The feature is complete when:

1. All 60 task markers are `[x]` and all 63 immutable ST cases pass.
2. Every RD-02 acceptance criterion is satisfied without optional machinery.
3. Existing report downloads remain operational and no legacy provisioning surface remains.
4. Import/export authorization, tenant isolation, atomicity, secret handling, and safe errors pass.
5. Public docs describe only the implemented strict manifest workflow.
6. Required workspace, structure, documentation, assurance, and final verification gates pass.
7. No dead code, generated residue, or prohibited browser/UI concurrency machinery remains.
8. Post-completion project re-analysis is complete through the exec-plan workflow.
