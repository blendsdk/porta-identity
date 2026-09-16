# Execution Plan: PostgreSQL-Backed Global Configuration

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-09-16 21:57
> **Progress**: 37/59 tasks (63%)
> **CodeOps Artifact Schema**: 1

## Overview

Implement RD-03 through five ordered phases: catalog/runtime/storage, Admin API, SDK/CLI, embedded
Admin UI, then documentation and complete verification. The plan uses direct existing patterns and
introduces no generalized configuration framework or distributed machinery. (AR-14)

**🚨 Update this document after EACH completed task.**

## Implementation Phases

| Phase | Title                                     | Tasks |
| ----- | ----------------------------------------- | ----: |
| 1     | Catalog, migration, and runtime consumers |    16 |
| 2     | Authoritative Admin API                   |    11 |
| 3     | SDK and conventional CLI                  |    10 |
| 4     | Embedded Admin UI workspace               |    14 |
| 5     | Documentation and final gates             |     8 |

**Total: 59 tasks across 5 phases**

> **⚠️ EXECUTION RULE — APPLIES TO EVERY AGENT EXECUTING THIS PLAN:**
>
> The task checkboxes in the phase sections below are the single source of truth for progress. The
> executor must mark an implemented task `[~]` with its timestamp, promote it to `[x]` only after its
> verification passes, and update this document's Progress and Last Updated fields after every task.
> Resume the first `[~]` task, otherwise the first `[ ]` task. Mark a blocker `[!]` with its reason.
> Only `[x]` counts as complete. Timestamps come from `date '+%Y-%m-%d %H:%M'`.

**Approved commit mode (AR-18):** automatic commit/push at passing verification checkpoints.
Specification-authoring tasks use independent oracle review, formatting/lint and recorded expected
red as their task checks. Implementation tasks keep focused checks. Do not checkpoint until
specifications are green and all applicable workspace/structure pre-commit gates pass.

**Approved clean-revision exception (AR-19):** after root/affected-workspace, structure and
applicable UI gates pass, create an unpublished local candidate commit. Run mandatory
production-security assurance against that clean exact commit and push only after it passes.
On failure keep the candidate unpublished, preserve evidence, correct the cause and re-verify;
never weaken security assertions or provenance checks. User approved this timing-only exception
on 2026-09-16. No product scope or global policy changed.

## Phase 1: Catalog, Migration, and Runtime Consumers

> **Phase baseline tree**: `5d7aaf4a9ef002403f966c9dc484a155c23c70f9`
> **Scope mode**: strict
> **Expected modification set**: the Phase 1 target source, migration and test paths listed below,
> this execution plan, its ambiguity/review evidence, and the isolated feature roadmap.
> Existing consumer test mocks/call expectations and repository test-inventory counts are included
> where the approved new getter contracts and test additions require direct alignment.
> **Scope baseline**: exact 18-key catalog, native values, existing local cache and direct runtime
> consumers; no new framework, worker, distributed coordination or compatibility layer.

### Step 1.1: Specification Tests

**Reference**: [03-01](03-01-catalog-storage-runtime.md) · ST-1–ST-19 · AR-2–AR-9, AR-12

- [x] 1.1.1 [spec-author] Write exact catalog and supported-locale specifications for ST-1–ST-6 — `packages/server/tests/unit/lib/system-config-catalog.spec.test.ts` ✅ (completed: 2026-09-16 15:32; independent oracle review, formatting/lint and expected-red missing catalog module; product green deferred to 1.2.8, checkpoint per AR-18)
- [x] 1.1.2 [spec-author] Write SQL/Down and real isolated pre-upgrade schema specifications for ST-7–ST-8 before migration implementation — `packages/server/tests/unit/migrations/global-configuration-catalog.spec.test.ts`, `packages/server/tests/integration/migrations/global-configuration-catalog.spec.test.ts` (PF-006) ✅ (completed: 2026-09-16 15:34; independent review/lint, expected red: 2 unit and 1 real-schema integration case, migration absent)
- [x] 1.1.3 [spec-author] Write typed getter/warning/cache/startup specifications including delayed-read-after-clear; supersede retired legacy getter contracts without weakening applicable safety assertions — `packages/server/tests/unit/lib/system-config-runtime.spec.test.ts`, `packages/server/tests/unit/lib/system-config.test.ts` (PF-003, PF-005) ✅ (completed: 2026-09-16 15:37; independent review/lint; expected red: 42 failures, 6 existing native/cache/startup behaviors pass)
- [x] 1.1.4 [spec-author] Write recovery, invitation, limiter, lockout, audit, and locale consumer specifications for ST-15–ST-19 — `packages/server/tests/unit/auth/system-config-consumers.spec.test.ts` ✅ (completed: 2026-09-16 15:43; independent review/lint; final red: 10 semantic failures, explicit audit override passes; test-fixture and SQL-representation errors corrected without changing retention requirements)
- [x] 1.1.5 Run Phase 1 unit and isolated-schema integration specification selectors; record red failures and justify any already-passing behavior before implementation ✅ (completed: 2026-09-16 15:43; 5 unit suites red: 54 failed, 7 existing behaviours pass; real isolated-schema migration case red due absent migration)

### Execution Entry Evidence

The approved ten-document preflight hash matched before execution:
`603937d48bca4830e4b2f02d258c6822a4c1955f1baf331dfb84ffec97fda79a`.
Task 1.1.1 was independently authored from approved catalog metadata and planned interfaces.
Its focused selector records expected red: one suite cannot collect because the catalog module
is not implemented yet. Log: `/tmp/porta-system-config-catalog-spec-red.log`.
Migration specifications record expected red before SQL implementation: two unit cases and one
real-database isolated-schema case fail because migration 030 is absent. Logs:
`/tmp/porta-global-config-migration-unit-red.log`,
`/tmp/porta-global-config-migration-integration-red.log`.
Runtime specifications record 42 expected failures and six existing native-read/cache/startup
passes before reader implementation. The delayed pre-clear read demonstrably refills stale policy
in the current code. Log: `/tmp/porta-system-config-runtime-red.log`.
Final combined Phase 1 unit red: five suites, 54 failed cases and seven passes; catalog suite cannot
collect before its planned module exists. Existing passes are native reads, cache/normal clearing,
startup lifetimes and explicit audit override. Consumer red contains only semantic contract failures.
Logs: `/tmp/porta-config-phase1-unit-red.log`, `/tmp/porta-system-config-consumers-red.log`.
Formatting, local Markdown links and diff checks pass. No specification is product-verified,
and no commit/push occurred. The user resolved AR-18 on 2026-09-16: automatic checkpoints wait for
passing verification, while the approved specification-first task order remains unchanged.

### Step 1.2: Implementation

**Reference**: [03-01 §Implementation Details](03-01-catalog-storage-runtime.md#implementation-details) · AR-2–AR-9, AR-12, AR-14, AR-17

- [x] 1.2.1 Implement the immutable catalog, types, lookup, strict validation, supported locales, labels, and descriptions — `packages/server/src/lib/system-config-catalog.ts` ✅ (completed: 2026-09-16 15:45; 264 catalog/validation cases green, lint/typecheck/docs self-check pass; 13 locale namespace/resource cases depend on 1.2.4 and remain required for 1.2.8/checkpoint)
- [x] 1.2.2 Add migration 030 and align test database catalog fixtures without changing applied migrations — `packages/server/migrations/030_global_configuration_catalog.sql`, `packages/server/tests/integration/helpers/database.ts` ✅ (completed: 2026-09-16 15:46; 2 unit and 1 real PostgreSQL isolated-schema oracle pass; formatting/diff/docs checks pass, prior migrations untouched)
- [x] 1.2.3 Replace coercing getters with typed cached getters, safe warnings/internal reader/expiry seam; replace active Map on clear and capture starting Map per query — `packages/server/src/lib/system-config.ts`, `packages/server/src/lib/super-admin-protection.ts` (PF-003) ✅ (completed: 2026-09-16 15:48; 74 runtime/bootstrap-protection tests green, lint/format/docs self-check pass; old in-flight SELECT cannot refill replacement cache)
- [x] 1.2.4 Export and use the supported locale/namespace contract for initialization and final fallback — `packages/server/src/auth/i18n.ts` ✅ (completed: 2026-09-16 15:49; full catalog/resource and legacy locale selectors: 298 cases green; locale consumer green; lint/diff/docs checks pass)
- [x] 1.2.5 Apply current catalog TTLs at recovery-artifact and invitation creation — `packages/server/src/auth/recovery-job-processor.ts`, `packages/server/src/routes/users.ts` ✅ (completed: 2026-09-16 15:50; three immutable expiry consumer cases green, lint/docs self-check pass; existing absolute expiries unchanged)
- [x] 1.2.6 Apply catalog maxima/windows and lockout values at the existing decision points — `packages/server/src/auth/rate-limiter.ts`, `packages/server/src/users/service.ts` ✅ (completed: 2026-09-16 15:51; 41 regressions and 5 immutable limiter/lockout cases green; lint/docs self-check pass; fixed 2FA limits and existing Redis expiry unchanged)
- [x] 1.2.7 Apply catalog audit retention through the new typed getter — `packages/server/src/routes/audit.ts` ✅ (completed: 2026-09-16 15:52; omitted and explicit retention specification cases green; lint/docs self-check pass)
- [x] 1.2.8 Run Phase 1 specification selectors and make them green without changing oracle expectations ✅ (completed: 2026-09-16 15:54; all 338 unit cases and the real-database migration specification pass)

### Step 1.3: Implementation Tests and Hardening

- [x] 1.3.1 Add cache-edge, warning, invalid-row, and internal-reader implementation tests — `packages/server/tests/unit/lib/system-config-runtime.impl.test.ts` ✅ (completed: 2026-09-16 15:56; 14 implementation cases and lint pass)
- [x] 1.3.2 Extend real-database migration/service tests for native JSONB, exact rows, reset behavior, and cache expiry — `packages/server/tests/integration/migrations.test.ts`, `packages/server/tests/integration/services/config.service.test.ts` ✅ (completed: 2026-09-16 15:58; 57 real-database cases and lint pass; seed assertion establishes its own clean test fixture)
- [x] 1.3.3 Run focused Phase 1 unit/integration selectors, `yarn workspace @portaidentity/server typecheck`, and `yarn test:structure` ✅ (completed: 2026-09-16 16:00; 440 unit, 58 integration and 104 structure cases pass; server typecheck passes)

**Verify**: focused server unit/integration selectors, server typecheck, and `yarn test:structure` (AR-15)

### Phase 1 Review Evidence

On 2026-09-16 the independent correctness reviewer and security auditor reviewed the snapshot
diff from tree `5d7aaf4a9ef002403f966c9dc484a155c23c70f9`. Both reported no findings.
Security profiles: auth-protocol, owasp-web and tenant-isolation. The scope remained the exact
catalog, migration, local cache and direct runtime consumers; Phase 2 was not reviewed.
Evidence: 440 unit cases, 58 integration cases, 104 structure cases and server typecheck pass.
The opted-in technical documentation hook updated the existing maintainer configuration page;
full pre-commit and production-security verification remain pending before automatic checkpoint.

Root verification subsequently passed: server unit 3,527, integration 468, E2E 127 and pentest
250; SDK 527; CLI 1,290; structure 104. The separate browser gate passed all 133 tests.
Logs: `/tmp/porta-config-phase1-precommit-verify.log`,
`/tmp/porta-config-phase1-precommit-ui.log`. Maintainer Markdown link checks pass.
AR-19 is explicitly approved: this checkpoint may be committed locally, but must remain
unpublished until mandatory production-security assurance passes on that clean exact revision.
The prior dirty-tree collector failure remains recorded; no assertion or provenance safeguard
was weakened. No Phase 2 specifications or implementation are included in this checkpoint.

Local candidate `cde6cd5a` remains unpublished. Clean-revision production-security returned
exit 40: three pre-existing registered observer gaps, followed by a session-expiry assertion
failure caused by its retired string/one-second setup. Remaining live security blocks did not
run after that failure. Cleanup completed. AR-20 requires explicit approval for the smallest
existing-observer correction and separate acceptance of the exact registered incomplete evidence.
Log: `/tmp/porta-config-phase1-clean-production-security.log`.

The user subsequently delegated the choice. AR-20 A is selected: Phase 2 may proceed and the
existing observer may use native 300 seconds with a 301.5-second natural-expiry wait.
No assertions change. B is not selected; publication stays blocked pending corrected evidence.

## Phase 2: Authoritative Admin API

> **Phase baseline tree**: `dcd1d939a5b9f91fb924274e07164004d04dbfa4`
> **Scope mode**: strict
> **Scope baseline**: direct closed catalog projection and native single/batch updates in the
> existing config router, one existing transaction/audit/post-commit boundary, and fixed errors.
> **Expected modification set**: Phase 2 target source/tests, direct superseded API-test alignment,
> repository inventory count, execution/review evidence, and the isolated feature roadmap.
> AR-20 A also authorizes only the existing human-auth session-expiry observer setup and
> testing-strategy enrollment; assertions remain unchanged. Publication stays evidence-gated.
> The opted-in phase documentation hook updates `techdocs/architecture/api-design.md` only.
> The independent specification author may share inert fixed catalog test data via
> `packages/server/tests/unit/routes/system-config-api-fixtures.ts`; no test framework is added.

### Step 2.1: Specification Tests

**Reference**: [03-02](03-02-admin-api.md) · ST-20–ST-31 · AR-2, AR-6, AR-9, AR-10, AR-12

- [x] 2.1.1 [spec-author] Write list/get/update validation and fixed-error specifications for ST-20–ST-26 — `packages/server/tests/unit/routes/system-config-api.spec.test.ts` ✅ (completed: 2026-09-16 19:48; independent oracle lint/typecheck pass; all 88 cases fail on approved old-API contract differences; documentation self-check clean)
- [x] 2.1.2 [spec-author] Write real-database transaction, permission, audit, restart, and cache specifications for ST-27–ST-31 — `packages/server/tests/integration/admin/system-config-api.spec.test.ts` ✅ (completed: 2026-09-16 19:52; lint/typecheck pass; seven expected contract failures, one existing native-seed pass; documentation self-check clean)
- [x] 2.1.3 [spec-author] Write non-enumeration, forged-value, authorization, and audit-exposure specifications — `packages/server/tests/pentest/admin-security/system-config.spec.test.ts` ✅ (completed: 2026-09-16 19:49; lint/typecheck pass; seven expected failures and three existing bearer-denial passes; documentation self-check clean)
- [x] 2.1.4 Run the Phase 2 specification selectors; record red failures and justify any behavior already passing ✅ (completed: 2026-09-16 19:49; 106 cases: 102 expected contract failures, four existing passes—native defaults and three bearer denials; all authoring lint/typecheck checks pass; logs `/tmp/porta-config-phase2-{unit,integration,pentest}-red.log`)

### Step 2.2: Implementation

**Reference**: [03-02 §Implementation Details](03-02-admin-api.md#implementation-details) · AR-6, AR-9, AR-10, AR-12, AR-14

- [x] 2.2.1 Add catalog-key projection and authoritative row validation for list/get responses — `packages/server/src/routes/config.ts` ✅ (completed: 2026-09-16 19:52; all 20 read specifications and lint pass; independent author corrected SQL mock verb detection without changing oracle; documentation self-check clean)
- [x] 2.2.2 Add strict single/batch schemas, native validation, uniform 400/404/503 responses, and restart-result projection — `packages/server/src/routes/config.ts` ✅ (completed: 2026-09-16 19:53; 88 API specifications and 18 legacy schema cases pass; lint/typecheck and documentation self-check pass)
- [x] 2.2.3 Add self-managed update transactions with one specialized audit row and post-commit cache clear — `packages/server/src/routes/config.ts`, `packages/server/src/lib/audit-log.ts` ✅ (completed: 2026-09-16 19:54; eight real-database specifications pass, including rollback/readback/audit failure and post-commit cache behavior; existing audit writer unchanged; lint/documentation self-check pass)
- [x] 2.2.4 Exclude the config prefix from the generic Admin mutation wrapper — `packages/server/src/middleware/admin-mutation-audit.ts` ✅ (completed: 2026-09-16 19:54; real-database tests assert one specialized audit and exact config errors through generic middleware; lint/documentation self-check pass)
- [x] 2.2.5 Run Phase 2 specification selectors and make them green without changing oracle expectations ✅ (completed: 2026-09-16 19:55; all 106 specifications pass: 88 unit, eight real-database integration and ten live security; no oracle changes; lint/typecheck pass; logs `/tmp/porta-config-phase2-{unit,integration,pentest}-green.log`)

### Step 2.3: Implementation Tests and Hardening

- [x] 2.3.1 Add projection-helper and transaction/error-branch implementation tests — `packages/server/tests/unit/routes/system-config-api.impl.test.ts` ✅ (completed: 2026-09-16 19:57; 20 defensive implementation cases plus 106 API/schema cases pass; lint/typecheck and documentation self-check clean)
- [x] 2.3.2 Run focused Phase 2 unit/integration/pentest selectors, `yarn workspace @portaidentity/server verify`, and `yarn test:structure` ✅ (completed: 2026-09-16 20:12; root verify passes affected server workspace verification and structure plus SDK/CLI regressions; server 3,635 unit, 476 integration, 127 E2E and 260 pentest; SDK 527, CLI 1,290 and structure 104; documentation self-check clean)

**Verify**: focused server unit/integration/pentest selectors, server workspace verify, and structure tests (AR-15)

### Phase 2 Review Evidence

Independent correctness review (correctness, maintainability, standards and API surface) and
security review (auth-protocol, owasp-web and tenant-isolation) report no findings against baseline
`dcd1d939a5b9f91fb924274e07164004d04dbfa4`. No new service, retry, concurrency or harness machinery
was introduced. All 106 immutable API specifications and 20 implementation cases pass.
Root verification passes: server 3,635 unit, 476 integration, 127 E2E and 260 pentest; SDK 527,
CLI 1,290 and structure 104. Log: `/tmp/porta-config-phase2-precommit-verify.log`.
The existing observer correction passes assurance lint/typecheck; corrected clean security
verification and publication remain pending. The opted-in maintainer documentation hook updates
the existing API design page; public documentation remains scheduled for Phase 5.
Separate browser regression verification passes all 133 cases; log:
`/tmp/porta-config-phase2-precommit-ui.log`. All three maintainer documentation-link checks pass;
`git diff --check` is clean. Root verification is not repeated for documentation-only updates:
no product source changed after the passing run, and the changed documentation is validated directly.

Unpublished candidate `0b4a1f84` is committed. Corrected clean production-security run
`3b457f9a-2b30-49c8-9b5f-4d1cd1b6bc1a` passes all 28 functional/security tests, with no failures
or skips, including natural session expiry. The collector records eight passes and exactly
three pre-existing registered forwarding observer limitations, with no product/execution failure.
Owned-stack cleanup completed. Overall classification remains incomplete, exit 40; it is not
a full security pass. Log: `/tmp/porta-config-phase2-clean-production-security.log`.
AR-20 A is verified. The user explicitly accepted B with "i do, proceed with the rest" on
2026-09-16. Publication and Phase 3 execution are authorized; retain the incomplete classification
for only the exact three registered baseline limitations. No new harness machinery is proposed.

## Phase 3: SDK and Conventional CLI

> **Phase baseline tree**: f5feca3a1e4a6dbe7b747ff83c7d2eb77e1843d9
> **Scope mode**: strict. Expected changes: the SDK/CLI source and test paths listed below,
> this plan's execution evidence, the isolated feature roadmap and incremental maintainer docs.
> Mechanical enrollment also updates the existing exact test-file inventory in
> `repo-tests/monorepo/server-package.spec.test.mjs` for the newly planned SDK/CLI test files.
> Smallest design: reuse the existing domains, agent parameter representation and config commands;
> no shared package, generator, new command family or settings framework.

### Step 3.1: Specification Tests

**Reference**: [03-03](03-03-sdk-cli.md) · ST-32–ST-37 · AR-4, AR-13

- [x] 3.1.1 [spec-author] Write SDK read-string/closed-write and transport specs; register type oracle in explicit tsconfig includes; supersede retired domain and agent config contracts — `packages/sdk/tests/type-contracts/config.spec.test.ts`, `packages/sdk/tests/type-contracts/tsconfig.json`, `packages/sdk/tests/domains/config.spec.test.ts`, `packages/sdk/tests/domains/config.test.ts`, `packages/sdk/tests/agent/agent.test.ts` (PF-001, PF-004, PF-005) ✅ (completed: 2026-09-16 21:21; independent oracle/doc review and lint pass; focused RED 6 failed/20 passed, compiler RED confirms retired contracts; follow-up agent RED 1 failed/15 passed; no implementation edits; green checkpoint per AR-18)
- [x] 3.1.2 [spec-author] Write CLI specs ST-34–ST-37 and inventory/supersede intentionally retired CLI config contracts — `packages/cli/tests/commands/config.spec.test.ts`, `packages/cli/tests/commands/config.test.ts` (PF-005) ✅ (completed: 2026-09-16 21:24; independent oracle/doc review, formatting/lint pass; expected RED 19 failed/9 passed; retained list/get/error and JSON behavior justify passes; green checkpoint per AR-18)
- [x] 3.1.3 Run Phase 3 specification selectors and SDK compiler typecheck; record red failures and justify any already-passing behavior ✅ (completed: 2026-09-16 21:24; primary confirms SDK 6 failed/20 passed, CLI 19 failed/9 passed, compiler missing/native/closed-write contract errors; unchanged reads/JSON/HTTP errors/native locale/agent dispatch justify passes; logs `/tmp/porta-config-phase3-{sdk,cli}-primary-red.log` and `/tmp/porta-config-phase3-primary-compiler-red.log`)

### Step 3.2: Implementation

**Reference**: [03-03 §SDK Contract](03-03-sdk-cli.md#sdk-contract), [§CLI Contract](03-03-sdk-cli.md#cli-contract) · AR-4, AR-13, AR-14

- [x] 3.2.1 Implement SDK closed keys, native metadata/value types, and result contracts — `packages/sdk/src/types/config.ts`, `packages/sdk/src/types/index.ts` ✅ (completed: 2026-09-16 21:25; SDK source compiler/lint and two type-shape runtime cases pass; semantic docs/exact18 review pass; compiler domain call-site oracle remains required after 3.2.2)
- [x] 3.2.2 Implement typed list/get/set/setMany, string-key read with encoded path and closed writes; update existing agent config.set native-value/result metadata — `packages/sdk/src/domains/config.ts`, `packages/sdk/src/agent.ts` (PF-001, PF-005) ✅ (completed: 2026-09-16 21:57; AR-21 18 regressions RED then green; SDK verify 558 and structure 104 pass; clean compatibility six journeys/provenance/cleanup pass at `73098270`; single correctness/security fix re-review reports no findings and SA-001 resolved; docs self-check pass)
- [x] 3.2.3 Implement metadata-rich list/get and metadata-driven native set parsing/output — `packages/cli/src/commands/config.ts` ✅ (completed: 2026-09-16 21:27; 28 focused CLI cases, typecheck/lint and semantic docs review pass; no copied key registry or new commands)
- [x] 3.2.4 Run Phase 3 specification selectors and SDK compiler typecheck; make them green without changing oracle expectations ✅ (completed: 2026-09-16 21:28; SDK 26 and CLI 28 cases plus SDK compiler oracle pass; immutable expectations unchanged)

### Step 3.3: Implementation Tests and Hardening

- [x] 3.3.1 Add SDK transport/error and CLI formatting/parser implementation tests — `packages/sdk/tests/domains/config.impl.test.ts`, `packages/cli/tests/commands/config.impl.test.ts` ✅ (completed: 2026-09-16 21:29; 5 SDK and 14 CLI cases plus lint/docs self-check pass; no retry or metadata registry introduced)
- [x] 3.3.2 Run SDK and CLI workspace verifies plus `yarn test:structure` ✅ (completed: 2026-09-16 21:43; root verify PASS: structure 104, SDK 540, CLI 1,325, server unit 3,635/integration 476/E2E 127/pentest 260; all workspace lint/compiler/build gates pass; log `/tmp/porta-config-phase3-precommit-verify.log`)
- [x] 3.3.3 From a clean committed checkpoint, run `yarn assurance:compat --select p1-admin` and review its artifact/exit taxonomy ✅ (completed: 2026-09-16 21:44; exit 0, all six packed-client journeys passed on clean candidate `0c031ecbcfe151b96d790e7fcf575e59b18c3c68`; package/source provenance valid, primary tree unchanged, cleanup success/no residue; run `2afb5df4-7098-4613-83a6-d23638d5dc3f`; log `/tmp/porta-config-phase3-clean-compat.log`)

**Verify**: SDK/CLI focused selectors and workspace verifies, structure tests, clean-revision compatibility assurance (AR-15)

## Phase 4: Embedded Admin UI Workspace

### Step 4.1: Specification Tests

**Reference**: [03-04](03-04-admin-ui.md) · ST-38–ST-46 · AR-11, AR-14, AR-16, AR-17

- [ ] 4.1.1 [spec-author] Write workspace layout, validation, save, restart, discard, duration, permission, and compact-geometry specifications for ST-39–ST-46 — `packages/cli/tests/admin/system-config-workspace.spec.test.ts`
- [ ] 4.1.2 [spec-author] Write application menu, capability, mount, cancel, and teardown specifications for ST-38 and ST-44 — `packages/cli/tests/admin/system-config-application.spec.test.ts`
- [ ] 4.1.3 Run the Phase 4 specification selectors; record red failures and justify any behavior already passing

### Step 4.2: Implementation

**Reference**: [03-04 §Implementation Details](03-04-admin-ui.md#implementation-details) · AR-11, AR-14, AR-16, AR-17

- [ ] 4.2.1 Add validated Admin config operations and fixed service result mapping — `packages/cli/src/admin/system-config-service.ts`
- [ ] 4.2.2 Add immutable loaded/draft/dirty/valid/busy/restart state and duration presentation — `packages/cli/src/admin/system-config-state.ts`
- [ ] 4.2.3 Build the four-tab full-page Layout DSL workspace and persistent footer — `packages/cli/src/admin/system-config-workspace.ts`
- [ ] 4.2.4 Add controller load/save/reload/discard/close lifecycle without retries — `packages/cli/src/admin/system-config-controller.ts`
- [ ] 4.2.5 Add config read/update capabilities and session-bound operations — `packages/cli/src/admin/state.ts`, `packages/cli/src/admin/session-service.ts`
- [ ] 4.2.6 Add the top-level command/menu, busy gating, workspace mount/cancel, and teardown — `packages/cli/src/admin/presentation.ts`, `packages/cli/src/admin/application.ts`
- [ ] 4.2.7 Export the new Admin UI surface through the existing barrel — `packages/cli/src/admin/index.ts`
- [ ] 4.2.8 Run Phase 4 specification selectors and make them green without changing oracle expectations

### Step 4.3: Implementation Tests and Hardening

- [ ] 4.3.1 Add response-validation, draft-state, duration, and busy-transition implementation tests — `packages/cli/tests/admin/system-config-state.impl.test.ts`
- [ ] 4.3.2 Add controller load/save/failure/cancellation/cleanup implementation tests — `packages/cli/tests/admin/system-config-controller.impl.test.ts`
- [ ] 4.3.3 Run focused Admin UI tests, `yarn workspace @portaidentity/cli verify`, `yarn test:structure`, and `yarn test:ui`

**Verify**: focused terminal Admin UI selectors, CLI workspace verify, structure tests, and UI regression gate (AR-15)

## Phase 5: Documentation and Final Gates

### Step 5.1: Specification Tests

**Reference**: ST-47–ST-48 · RD-03 AC-20 · AR-3, AR-15

- [ ] 5.1.1 [spec-author] Write exact public catalog/external-boundary and propagation documentation specifications — `repo-tests/monorepo/global-configuration-docs.spec.test.mjs`
- [ ] 5.1.2 Run the documentation specification selector; record red failures and justify any behavior already passing

### Step 5.2: Implementation

- [ ] 5.2.1 Document exact API and conventional CLI contracts, native values, errors, and restart results — `docs/api/config.md`, `docs/cli/infrastructure.md`
- [ ] 5.2.2 Add the editable-catalog and external bootstrap/secret tables plus cache/restart guidance — `docs/guide/environment.md`, `docs/guide/deployment.md`
- [ ] 5.2.3 Align public database/capability references and maintainer configuration architecture — `docs/database/schema.md`, `docs/concepts/capabilities.md`, `techdocs/reference/configuration.md`
- [ ] 5.2.4 Run ST-47–ST-48 and make them green without changing oracle expectations

### Step 5.3: Implementation Tests and Final Hardening

- [ ] 5.3.1 Run `yarn docs:build`, all focused RD-03 selectors, affected workspace verifies, `yarn test:structure`, and `yarn test:ui`
- [ ] 5.3.2 Run `yarn assurance:harness --project security --profile production-security`, review its artifact/exit taxonomy, then run final `yarn verify`

**Verify**: documentation build, focused suites, server/SDK/CLI verifies, structure/UI gates, production-security assurance, and final root verify (AR-15)

## Dependencies

```text
Phase 1 catalog/runtime
    ↓
Phase 2 Admin API
    ↓
Phase 3 SDK/CLI
    ↓
Phase 4 Admin UI
    ↓
Phase 5 documentation/final gates
```

## Success Criteria

1. All 59 tasks are complete and ST-1–ST-48 pass unchanged.
2. Every RD-03 acceptance criterion is satisfied.
3. No arbitrary, internal, environment-owned, or secret key is exposed or mutable.
4. Single/batch saves are atomic, audited once, and clear cache only after commit.
5. Runtime consumers use exact catalog defaults/types and approved timing boundaries.
6. SDK, CLI, and Admin UI use API metadata without a shared package or generator.
7. Public and maintainer documentation match the implemented catalog and propagation behavior.
8. Every verification gate in AR-15 passes and its artifact/exit taxonomy is reviewed where applicable.
