# Execution Plan: Assurance Product Remediation

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Status**: Executing
> **Last Updated**: 2026-08-22 08:19
> **Progress**: 38/55 tasks (69%)
> **CodeOps Artifact Schema**: 1

## Overview

Implement the four approved product/security corrections in strict specification-first order. This
is the separately authorized exception to the migration's no-product-fix boundary; only behavior
owned by RD-05 R5.6, R5.7, R5.9, and R5.17 may change.

## Execution contract

The task checkboxes below are the single source of truth. On implementation mark the active task
`[~]` with the current timestamp and update Progress/Last Updated. After its targeted command and
`yarn verify` pass, promote it to `[x]`. Resume the first `[~]`, otherwise the first `[ ]`; mark a
blocker `[!]` with its exact cause. Every specification RED succeeds only when the named immutable
assertion fails while existing required lanes remain green; collection/setup/timeout/unrelated
failures never count.

Every task runs its phase's targeted command plus `yarn verify`. Full output is captured according
to the exec-plan protocol.

## Implementation phases

| Phase | Title | Tasks |
| ---: | --- | ---: |
| 1 | Enumeration-resistant password and recovery work | 17 |
| 2 | Tenant-bound atomic magic links | 13 |
| 3 | Bulk/import/export product contracts | 12 |
| 4 | Correlated security decisions and durable audit | 9 |
| 5 | Black-box closure and documentation | 4 |

**Total: 55 tasks across 5 phases.**

## Targeted verification bindings

| Phase | Required targeted commands |
| --- | --- |
| 1 | `yarn workspace @portaidentity/server vitest run --project unit tests/unit/security/enumeration-resistance.spec.test.ts tests/unit/auth/recovery-job.impl.test.ts` and, once live, the affected human-auth harness selector |
| 2 | `yarn workspace @portaidentity/server vitest run --project unit tests/unit/auth/magic-link-tenant-binding.spec.test.ts tests/unit/auth/magic-link-binding.impl.test.ts` plus affected integration tests |
| 3 | `yarn workspace @portaidentity/server vitest run --project unit tests/unit/admin/administrative-data-contract.spec.test.ts tests/unit/admin/administrative-data.impl.test.ts` plus structure and packed compatibility selectors |
| 4 | `yarn workspace @portaidentity/server vitest run --project unit tests/unit/security/security-decision-event.spec.test.ts tests/unit/security/security-decision-event.impl.test.ts` plus affected P1 assurance selectors |
| 5 | Exact existing production-security human-auth, P1, compatibility, pentest, UI, structure, aggregate/report, and `yarn verify` commands named in the completed assurance program |

Before a planned implementation-test file exists, omit only that nonexistent path from the phase's
targeted command; all already-created paths remain mandatory.

---

## Phase 1: Enumeration-resistant password and recovery work

> **Phase baseline tree**: `cffb76d0bde7ea89f097b83de50ffe5222e8cb87`
> **Lenses**: security, concurrency

**Reference**: 03-01; ST-01–ST-06; AR-1, AR-5, AR-9, AR-10

- [x] 1.1 [spec-author] Write immutable enumeration/recovery specifications — `packages/server/tests/unit/security/enumeration-resistance.spec.test.ts` (completed 2026-08-21 09:06 CEST; default 3/3 green; required-mode capability RED registered; `yarn verify` 234 files/3,385 tests green)
- [x] 1.2 Run the isolated specifications and record exact RED assertions for missing constant-work password and recovery-job behavior. (completed 2026-08-21 09:15 CEST; exact exit 1, one failed/two passed, sole marker `ENUMERATION_RESISTANCE_CAPABILITY_MISSING`; ordinary `yarn verify` 234 files/3,385 tests green)
- [x] 1.3 Add the ordered recovery-job migration and typed repository/outbox API — `packages/server/migrations/`, `packages/server/src/auth/recovery-job-repository.ts` (completed 2026-08-21 09:43 CEST; migration up/down/reapply and live repository transition smoke green; `yarn verify` 234 files/3,390 tests green)
- [x] 1.4 Implement the bounded idempotent recovery scheduler and lifecycle boundary — `packages/server/src/auth/recovery-worker.ts` (completed 2026-08-21 10:01 CEST; five attempts/four delays, owner-fenced transitions, single-flight wake/poll, and bounded shutdown implemented; activation remains fail-closed until Task 1.6 supplies the protected processor; `yarn verify` 234 files/3,390 tests green)
- [x] 1.5 Implement process-cached dummy Argon2id verification and fixed-shape password failure accounting — `packages/server/src/users/password.ts`, `packages/server/src/users/service.ts`, `packages/server/src/users/repository.ts`, `packages/server/src/routes/interactions.ts`, `packages/server/src/index.ts` (completed 2026-08-21 10:25 CEST; process-start initialization with embedded-app fallback, equal-shape cooldown/hash/failure operations, generic public failures; focused 4 files/96 tests and E2E 1 file/7 tests green; `yarn verify` 234 files/3,390 tests green)
- [x] 1.6 Replace account-dependent magic-link/reset request work with identical outbox enqueue and generic outcomes, then activate the concrete recovery processor under application startup/shutdown ownership — `packages/server/src/routes/interactions.ts`, `packages/server/src/routes/password-reset.ts`, `packages/server/src/auth/recovery-job-processor.ts`, `packages/server/src/index.ts` (completed 2026-08-21 14:55 CEST; bounded at-least-once delivery uses one deterministic job-owned artifact, focused unit 5 files/82 tests and affected E2E 2 files/12 tests green, migration 022 up/down/reapply green, `yarn verify` 234 files/3,395 tests green)
- [x] 1.7 Run ST-01–ST-06 green, including public response and intended/no-op job observations. (completed 2026-08-21 15:24 CEST; live route/scheduler specification 9/9 green, focused lint/type/format/diff checks green, `yarn verify` 234 files/3,401 tests green)
- [x] 1.8 Add repository, worker, retry, lease, shutdown, dummy-hash, and redaction implementation tests — `packages/server/tests/unit/auth/recovery-job.impl.test.ts` (completed 2026-08-21 15:39 CEST; focused 2 files/17 tests and structure 70/70 green; `yarn verify` 235 files/3,409 tests green)
- [x] 1.9a Update affected auth/operator documentation and both roadmaps; run Phase 1 targeted checks and `yarn verify`. (completed 2026-08-21 15:56 CEST; docs build and focused 2 files/17 tests green; `yarn verify` 235 files/3,409 tests green)
- [x] 1.9b Preserve the exact evidence-bound forwarding-observer continuation in the direct security harness while retaining exit `40`; add dispatcher regression coverage and run Phase 1 targeted checks plus `yarn verify`. (completed 2026-08-21 16:13 CEST; focused dispatcher/admission tests 10/10, Phase 1 tests 17/17, structure 70/70, and `yarn verify` 235 files/3,409 tests green)
- [x] 1.9c From the clean committed revision, run the production-security human-auth harness, final Phase 1 targeted checks, `yarn verify`, and the Phase 1 quality gate. (completed 2026-08-21 16:43 CEST; clean run `70c147f6-ed38-4212-843e-f5386b119202` executed functional 7/7, second-factor 4/4, and tenant/admin 17/17 before retaining the registered exit `40`; `yarn verify` 235 files/3,409 tests green; quality review recorded six Major corrections and left Phase 1 open)
- [x] 1.9d Correct the immutable ST-01–ST-06 oracle to exercise real password/repository/processor/token/mail boundaries and reconcile ST-05 with bounded at-least-once identical-artifact delivery; record exact RED. (completed 2026-08-21 17:09 CEST; default oracle 3/3 green, required-mode RED failed only with `ENUMERATION_RESISTANCE_CAPABILITY_MISSING`, and `yarn verify` passed 235 files/3,403 tests)
- [x] 1.9e Move attempt start accounting to immediately before processing; serialize recovery artifacts per user, suppress superseded job delivery, and bind password-reset GET/POST token lookup to the route organization. (completed 2026-08-21 17:24 CEST; focused 3 files/49 tests green, full type/lint/format gates green, and `yarn verify` passed 235 files/3,403 tests)
- [x] 1.9f Add real concurrent-job, mid-batch crash/reclaim, superseded retry, wrong-tenant reset, and SMTP unknown-outcome implementation tests; run corrected ST-01–ST-06 green. (completed 2026-08-21 17:48 CEST; service-backed ST-01–ST-06 9/9, concurrency/SMTP 3/3, wrong-tenant reset E2E 7/7, structure 70/70, and `yarn verify` 237 files/3,416 tests green)
- [x] 1.9g Preserve the documented assurance exit precedence across retained production-exposure and later security-block outcomes, with a complete combination matrix. ✅ (completed: 2026-08-21 18:01 CEST; complete 10×10 registered-exit matrix green, focused assurance type/lint/format checks green, and `yarn verify` passed 237 files/3,416 tests)
- [x] 1.9h From the clean committed revision, rerun the production-security human-auth evidence, Phase 1 targeted checks, `yarn verify`, and one bounded quality re-review; close Phase 1 only if no Critical or Major remains. ✅ (completed: 2026-08-21 19:21 CEST; clean run `06cfd7f2-b732-462c-ad3d-084609e00799` completed functional 7/7, second-factor 4/4, and tenant/admin 17/17 with expected retained exit `40`; bounded re-review accepted and corrected RV-105 plus RV-106/SA-104; service-backed integration 14/14 twice, affected unit 59/59, structure 70/70, and `yarn verify` passed 237 files/3,418 tests)
- [x] 1.9i From the clean pushed correction revision, rerun production-security human-auth evidence, corrected ST-01–ST-06, Phase 1 targeted checks, and `yarn verify`; record exact provenance and zero residue, then close Phase 1 without another review pass. ✅ (completed: 2026-08-21 20:00 CEST; clean production-security run `0c567504-0fb8-4bbc-9539-00a5ffaaa99b` completed with expected retained exit `40`, functional 7/7, second-factor 4/4, tenant/admin 17/17, commit `93f856326a702e2b39d1d13e848655a240fd82b4`, tree `12b3ad981686d0956bb510a00ae16a7e052fdef7`, mode `0600`, and zero active-run/Docker residue; corrected unit 11/11, integration 14/14, E2E 7/7, dispatcher 11/11, and `yarn verify` passed 237 files/3,418 tests)

Deliverable: password and recovery public paths are functionally and structurally non-enumerating;
timing remains explicitly diagnostic.

---

## Phase 2: Tenant-bound atomic magic links

> **Phase baseline tree**: `829f66aa378e6cd6f3f9f7eb271000fadde48da1`
> **Lenses**: security, concurrency

**Reference**: 03-02; ST-07–ST-13; AR-2, AR-6, AR-7

- [x] 2.1 [spec-author] Write immutable magic-link authority specifications — `packages/server/tests/unit/auth/magic-link-tenant-binding.spec.test.ts` ✅ (completed: 2026-08-21 20:28 CEST; immutable ST-07–ST-13 catalog, contract, and fail-closed adapter authored; same-artifact foreign rejection→intended success, expiry, exact consume counts, generic failure equivalence, and continuation concurrency/retry oracles included; ordinary focused spec 3/3 and `yarn verify` 238 files/3,421 tests green)
- [x] 2.2 Run the isolated specifications and record exact RED for cross-tenant acceptance and non-atomic continuation consumption. ✅ (completed: 2026-08-21 20:49 CEST; required-mode spec exited `1` with exactly one failed/two passed and sole registered marker `MAGIC_LINK_TENANT_BINDING_CAPABILITY_MISSING`; ordinary `yarn verify` passed 238 files/3,421 tests)
- [x] 2.3 Extend the ordered migration and token repository with immutable organization/interaction authority and locked conditional consumption — `packages/server/migrations/`, `packages/server/src/auth/token-repository.ts` ✅ (completed: 2026-08-21 23:27 CEST; additive migration 023 preserves legacy rows as explicitly unbound, mandates organization authority for new rows, and adds interaction/index constraints; recovery issuance persists authority; locked lookup and conditional consume APIs added; migration up/down/reapply schema 48/48 green; server test projects now use separate lifecycle processes to prevent shared recovery-worker ownership; sequential server suites passed 238 files/3,431 tests and `yarn verify` passed)
- [x] 2.4 Implement one verification transaction that validates all authority before token/user/audit mutation — `packages/server/src/routes/magic-link.ts`, supporting repository APIs ✅ (completed: 2026-08-21 23:53 CEST; exact tenant, active-account, and persisted-interaction authority is locked before mutation; token consumption, account verification/login state, and privacy-safe success audit commit atomically; authority mismatch and failed account mutation roll back; focused spec/unit 42/42, public magic-link E2E 6/6, lint/typecheck, and `yarn verify` passed 238 files/3,434 tests)
- [x] 2.5 Implement tenant/interaction-bound atomic Redis continuation consume and interaction-side authority derivation — `packages/server/src/auth/magic-link-session.ts`, `packages/server/src/routes/interactions.ts` ✅ (completed: 2026-08-22 00:23 CEST; one Lua decision compares the provider-owned interaction tenant and continuation tenant/interaction before deleting, mismatches preserve key and cookie, and issuance rejects route/provider/client-tenant disagreement; focused unit/spec 54/54, service-backed enumeration 9/9, public magic-link E2E 6/6, lint/typecheck, and corrected `yarn verify` passed 238 files/3,437 tests)
- [x] 2.6 Run ST-07–ST-13 green through unit, integration, and public Alpha/Bravo boundaries. ✅ (completed: 2026-08-22 00:50 CEST; unchanged unit oracle 3/3, service-backed PostgreSQL/Redis/MailHog integration 7/7, and public magic-link E2E 6/6 green; retained server inventory 240 files and `yarn verify` passed)
- [x] 2.7 Add transaction rollback, post-commit Redis failure, Lua concurrency, expiry, and privacy implementation tests — `packages/server/tests/unit/auth/magic-link-binding.impl.test.ts` ✅ (completed: 2026-08-22 01:11 CEST; five focused implementation cases cover durable-audit rollback, post-commit Redis failure, exact continuation races, expiry cleanup, and protected-value redaction; Phase 2 unit target 8/8, structure 70/70, and `yarn verify` passed)
- [x] 2.8a Update magic-link/API/architecture documentation and run Phase 2 targeted, E2E, pentest, docs-build, and `yarn verify` checks. ✅ (completed: 2026-08-22 01:42 CEST; public and maintainer docs now describe outbox issuance, durable tenant/interaction authority, transactional consume, and Redis continuation behavior; targeted 8/8, live integration 7/7, E2E 6/6, pentest 224/224, docs build, structure 70/70, and `yarn verify` passed)
- [x] 2.8b From the clean pushed documentation checkpoint, run the production-security human-auth collector, repeated Phase 2 targeted/pentest checks, `yarn verify`, and the Phase 2 quality gate. ✅ (completed: 2026-08-22 02:42 CEST; clean collector run `062a1b50-a27a-4f45-b8e5-9292fe75ed62` completed functional 7/7, second-factor 4/4, and tenant/admin 17/17 with the expected registered exit `40`, mode `0600`, exact commit/tree provenance, and zero active-run/Docker residue; the mandatory review recorded four Major corrections and left Phase 2 open)
- [x] 2.8c Extend the immutable ST-07–ST-13 oracle for exact live interaction/client authority, standalone delivered URLs, callback limiting, and real operational-log privacy; record the exact RED assertions. ✅ (completed: 2026-08-22 02:58 CEST; ordinary structural oracle 2/2 green and required mode produced exactly one failed/one passed with sole marker `MAGIC_LINK_LIVE_AUTHORITY_CORRECTION_CAPABILITY_MISSING`; structure 70/70 and `yarn verify` passed with 242 server test files)
- [x] 2.8d Implement live interaction/client authority admission at issuance and callback consumption, conditional standalone URLs, the protected callback limiter, privacy-safe logs, and authority-only token APIs; add focused implementation and public-boundary tests. ✅ (completed: 2026-08-22 03:37 CEST; production-backed correction oracle 8/8, focused unit 87/87, existing live authority 12/12, enumeration 9/9, live issuance 3/3, structure 70/70, and final `yarn verify` passed with 244 server files/3,466 tests)
- [x] 2.8e From the clean pushed correction revision, rerun production-security evidence, Phase 2 unit/integration/E2E/pentest gates, documentation build, `yarn verify`, and one bounded quality re-review; implement and verify every accepted residual correction without a prohibited third review. ✅ (completed: 2026-08-22 04:50 CEST; bounded re-review accepted three residual Majors; real Koa/provider oracle 8/8, unit 3,386/3,386, integration 301/301, E2E 129/129, pentest 224/224, docs build, and final `yarn verify` all passed; no third review dispatched)
- [x] 2.8f From the clean pushed residual-correction revision, rerun production-security evidence, the Phase 2 command set, documentation build, and `yarn verify`; close Phase 2 only when provenance and cleanup are exact and no accepted review correction remains unresolved. ✅ (completed: 2026-08-22 05:34 CEST; clean collector run `213b2914-312a-44d9-8a78-574642b8e332` is bound to commit `d16cc4ec`/tree `6c528099`, retained expected exit `40`, mode `0600`, functional 7/7 and tenant/admin 17/17, active-run absent, and zero run-labelled Docker residue; correction 8/8, unit 3,386/3,386, integration 301/301, E2E 129/129, pentest 224/224, docs, and final `yarn verify` passed)

Deliverable: cross-tenant or wrong-interaction presentation cannot authenticate, mutate, or consume;
intended use remains atomic and single-use.

---

## Phase 3: Bulk/import/export product contracts

> **Phase baseline tree**: `3a31a5d3e1c586daea3149a401da9a7912e33a2e`
> **Lenses**: security, api-surface, concurrency

**Reference**: 03-03; ST-14–ST-24; AR-3

- [x] 3.1 [spec-author] Write immutable bulk/import/export specifications — `packages/server/tests/unit/admin/administrative-data-contract.spec.test.ts` ✅ (completed: 2026-08-22 06:10 CEST; immutable ST-14–ST-24 catalog, stable product-driver contract, and fail-closed adapter authored; ordinary specification 4/4, structure 70/70 with the exact 245-file inventory, and `yarn verify` passed with 159 unit files/2,819 tests, 30 integration files/301 tests, 20 E2E files/129 tests, and 35 pentest files/224 tests)
- [x] 3.2 Run the isolated specifications and record exact RED for duplicate, tenant, rollback, secret, scope, bound, and CSV cases. ✅ (completed: 2026-08-22 06:21 CEST; required mode exited `1` with exactly one failed/three passed and sole marker `ADMINISTRATIVE_DATA_CAPABILITY_MISSING`; ordinary `yarn verify` passed all four tasks in 9m04s)
- [x] 3.3 Implement whole-request validation, tenant-scoped per-item transactions, ordered closed outcomes, and not-attempted bulk results — `packages/server/src/routes/bulk.ts`, `packages/server/src/lib/bulk-operations.ts` ✅ (completed: 2026-08-22 06:35 CEST; duplicate/scope/action/reason validation precedes access, user locks and writes are tenant-qualified, each item transaction includes durable audit, dependency failure emits closed not-attempted rows and one correlation ID; focused unit/spec 13/13, PostgreSQL integration 8/8, type/lint/format gates, and `yarn verify` passed in 8m50s)
- [x] 3.4 Implement the closed import prevalidator/planner and remove secret-equivalent manifest inputs — `packages/server/src/lib/data-import.ts`, import schemas/types ✅ (completed: 2026-08-22 06:53 CEST; strict versioned schemas reject unknown, duplicate, and authentication-material inputs before mutation; deterministic dependency/collision planning is snapshot-ready; focused unit/contract 84/84, import/export integration 10/10, lint/type/format gates, and `yarn verify` passed in 8m52s)
- [x] 3.5 Implement atomic merge/overwrite/dry-run execution, sanitized typed errors, and credential-after-commit handling — `packages/server/src/lib/data-import.ts`, `packages/server/src/routes/imports.ts` ✅ (completed: 2026-08-22 07:24 CEST; repeatable-read execution rolls back every non-skip failure, overwrite changes only approved mutable fields, dry-run returns boolean credential intent without effects, committed confidential credentials return once, and public/audit failures are sanitized; focused unit/contract 84/84, PostgreSQL integration 10/10, lint/type/format gates, and final `yarn verify` passed in 9m24s)
- [x] 3.6 Implement dedicated export authorization, exact relationship scope, field policies, 10,000-row bound, audit-detail filtering, and CSV formula neutralization — `packages/server/src/routes/exports.ts`, `packages/server/src/lib/data-export.ts` ✅ (completed: 2026-08-22 07:38 CEST; every export requires dedicated plus entity-read authority, role scope proves tenant/application participation, all closed queries probe 10,001 rows, audit details use an event allowlist, and CSV formulas are neutralized before RFC quoting; focused unit/spec 12/12, PostgreSQL integration 10/10, lint/type/format gates, and `yarn verify` passed in 9m00s)
- [x] 3.7 Align SDK/CLI export types and public bulk/import/export documentation with the approved contract — `packages/sdk/`, `packages/cli/`, `docs/api/`, `docs/cli/` ✅ (completed: 2026-08-22 07:53 CEST; SDK and CLI expose exactly five export entities and complete audit scope, successful imports omit errors, dry-run credential intent is boolean-only, password provisioning is rejected before network access, and API/CLI docs plus the full example match the atomic bounded contract; SDK 7/7, CLI 16/16, structure 70/70, docs build, type/lint/format gates, and `yarn verify` passed in 8m51s)
- [x] 3.8a Connect the immutable ST-14–ST-24 contract to production validation, transactions, and independent PostgreSQL/audit observers; run the service-backed integration boundary green. ✅ (completed: 2026-08-22 08:19 CEST; split from 3.8 because packed archives require a clean committed source revision; production-backed ST-14–ST-24 passed 35/35, combined admin integration 53/53, SDK 12/12, CLI 25/25, structure 70/70, and `yarn verify` passed in 9m46s with server unit 2,823, integration 336, E2E 129, pentest 224, SDK 404, and CLI 355 tests)
- [ ] 3.8b Add the bounded raw-HTTP and packed SDK/CLI administrative-data journey capability with exact package, credential, response, state, and cleanup observations.
- [ ] 3.8c From the clean pushed capability revision, run ST-14–ST-24 through the raw-HTTP and packed-client boundaries and record provenance and zero residue.
- [ ] 3.9 Add transaction, lock, infrastructure-stop, dry-run, credential-once, export-redaction, and compatibility implementation tests — `packages/server/tests/unit/admin/administrative-data.impl.test.ts`
- [ ] 3.10 Run Phase 3 targeted/P1/compatibility/pentest checks, `yarn test:structure`, and `yarn verify`; update admin-data techdocs.

Deliverable: administrative data behavior is exact, tenant-safe, compatible where promised, atomic
where required, and free of secret/formula exposure.

---

## Phase 4: Correlated security decisions and durable audit

> **Phase baseline tree**: _(record at execution start)_
> **Lenses**: security, api-surface

**Reference**: 03-04; ST-25–ST-30; AR-4, AR-8

- [ ] 4.1 [spec-author] Write immutable security-decision event specifications — `packages/server/tests/unit/security/security-decision-event.spec.test.ts`
- [ ] 4.2 Run the isolated specifications and record exact RED for missing/duplicate events, raw data, caller correlation, and audit rollback.
- [ ] 4.3 Implement the strict event model, closed reason vocabulary, HKDF/HMAC protected references, and schema validator — `packages/server/src/security/decision-event.ts`
- [ ] 4.4 Implement correlation-first context, typed decision facts, minimal error mapping, and exactly-once terminal finalization — `packages/server/src/middleware/`, `packages/server/src/server.ts`
- [ ] 4.5 Add sanitized Node `clientError` handling for transport parser failures without raw-packet inspection — `packages/server/src/index.ts`, server listener ownership
- [ ] 4.6 Make covered state-changing admin mutations commit durable audit/outbox intent atomically; preserve denial on sink failure — affected admin services/repositories and audit module
- [ ] 4.7 Run ST-25–ST-30 green through unit, integration, raw malformed transport, admin denial, and mutation rollback boundaries.
- [ ] 4.8 Add unknown-field, redaction-canary, route-template, key-rotation, sink-failure, client-error, and atomicity implementation tests — `packages/server/tests/unit/security/security-decision-event.impl.test.ts`
- [ ] 4.9 Run Phase 4 targeted/P1/production-security/pentest checks and `yarn verify`; update logging, audit, configuration, and security docs.

Deliverable: every covered request has one independently attributable privacy-safe decision event,
and covered authorized mutations cannot commit without durable audit intent.

---

## Phase 5: Black-box closure and documentation

> **Phase baseline tree**: _(record at execution start)_
> **Lenses**: security, api-surface

**Reference**: RD-05 AC7/AC13–AC15; ST-01–ST-30

- [ ] 5.1 Run the exact production-security human-auth, P1, packed compatibility, UI, and pentest boundaries; persist clean provenance and zero-residue evidence.
- [ ] 5.2 Re-run the affected assurance aggregate/report and prove DEF-7, DEF-10, DEF-12, and DEF-13 are superseded only by exact admitted evidence; preserve unrelated gaps.
- [ ] 5.3 Update RD/traceability, both roadmaps, public docs, techdocs/ADR, and current test inventory with truthful claim status and no certification language.
- [ ] 5.4 Run final `yarn test:structure`, `yarn test:ui`, `yarn test:pentest`, `yarn harness:test`, exact assurance roll-up, and `yarn verify`; confirm clean worktree and zero owned residue.

Deliverable: all four authorized root causes are fixed and independently reverified without changing
CI or claiming absolute exploit absence.

## Dependencies

```text
Phase 1 recovery outbox
    ↓
Phase 2 tenant-bound issuance/consumption
    ↓
Phase 3 administrative data
    ↓
Phase 4 correlated decisions/durable audit
    ↓
Phase 5 clean black-box closure
```

## Success criteria

1. All 55 tasks are `[x]`; no `[~]`, `[ ]`, or `[!]` remains.
2. ST-01–ST-30 were observed RED before implementation and are GREEN afterward.
3. Existing tests and pentest assertions remain unweakened and all authoritative verification passes.
4. Migrations are additive and tested; no generated/sensitive artifact is committed.
5. Product/public/SDK/CLI documentation matches the approved contracts.
6. A completed quality review has no unresolved Critical or Major finding.
7. CI workflows and release/publishing/deployment policy are unchanged.
