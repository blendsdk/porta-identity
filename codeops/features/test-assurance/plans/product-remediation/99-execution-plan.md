# Execution Plan: Assurance Product Remediation

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Status**: Executing
> **Last Updated**: 2026-08-21 14:44
> **Progress**: 6/40 tasks (15%)
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
| 1 | Enumeration-resistant password and recovery work | 9 |
| 2 | Tenant-bound atomic magic links | 8 |
| 3 | Bulk/import/export product contracts | 10 |
| 4 | Correlated security decisions and durable audit | 9 |
| 5 | Black-box closure and documentation | 4 |

**Total: 40 tasks across 5 phases.**

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
- [ ] 1.7 Run ST-01–ST-06 green, including public response and intended/no-op job observations.
- [ ] 1.8 Add repository, worker, retry, lease, shutdown, dummy-hash, and redaction implementation tests — `packages/server/tests/unit/auth/recovery-job.impl.test.ts`
- [ ] 1.9 Run Phase 1 targeted/live checks, `yarn verify`, and update affected auth/operator documentation.

Deliverable: password and recovery public paths are functionally and structurally non-enumerating;
timing remains explicitly diagnostic.

---

## Phase 2: Tenant-bound atomic magic links

> **Phase baseline tree**: _(record at execution start)_
> **Lenses**: security, concurrency

**Reference**: 03-02; ST-07–ST-13; AR-2, AR-6, AR-7

- [ ] 2.1 [spec-author] Write immutable magic-link authority specifications — `packages/server/tests/unit/auth/magic-link-tenant-binding.spec.test.ts`
- [ ] 2.2 Run the isolated specifications and record exact RED for cross-tenant acceptance and non-atomic continuation consumption.
- [ ] 2.3 Extend the ordered migration and token repository with immutable organization/interaction authority and locked conditional consumption — `packages/server/migrations/`, `packages/server/src/auth/token-repository.ts`
- [ ] 2.4 Implement one verification transaction that validates all authority before token/user/audit mutation — `packages/server/src/routes/magic-link.ts`, supporting repository APIs
- [ ] 2.5 Implement tenant/interaction-bound atomic Redis continuation consume and interaction-side authority derivation — `packages/server/src/auth/magic-link-session.ts`, `packages/server/src/routes/interactions.ts`
- [ ] 2.6 Run ST-07–ST-13 green through unit, integration, and public Alpha/Bravo boundaries.
- [ ] 2.7 Add transaction rollback, post-commit Redis failure, Lua concurrency, expiry, and privacy implementation tests — `packages/server/tests/unit/auth/magic-link-binding.impl.test.ts`
- [ ] 2.8 Run Phase 2 targeted/human-auth/pentest checks, `yarn verify`, and update magic-link/API/architecture documentation.

Deliverable: cross-tenant or wrong-interaction presentation cannot authenticate, mutate, or consume;
intended use remains atomic and single-use.

---

## Phase 3: Bulk/import/export product contracts

> **Phase baseline tree**: _(record at execution start)_
> **Lenses**: security, api-surface, concurrency

**Reference**: 03-03; ST-14–ST-24; AR-3

- [ ] 3.1 [spec-author] Write immutable bulk/import/export specifications — `packages/server/tests/unit/admin/administrative-data-contract.spec.test.ts`
- [ ] 3.2 Run the isolated specifications and record exact RED for duplicate, tenant, rollback, secret, scope, bound, and CSV cases.
- [ ] 3.3 Implement whole-request validation, tenant-scoped per-item transactions, ordered closed outcomes, and not-attempted bulk results — `packages/server/src/routes/bulk.ts`, `packages/server/src/lib/bulk-operations.ts`
- [ ] 3.4 Implement the closed import prevalidator/planner and remove secret-equivalent manifest inputs — `packages/server/src/lib/data-import.ts`, import schemas/types
- [ ] 3.5 Implement atomic merge/overwrite/dry-run execution, sanitized typed errors, and credential-after-commit handling — `packages/server/src/lib/data-import.ts`, `packages/server/src/routes/imports.ts`
- [ ] 3.6 Implement dedicated export authorization, exact relationship scope, field policies, 10,000-row bound, audit-detail filtering, and CSV formula neutralization — `packages/server/src/routes/exports.ts`, `packages/server/src/lib/data-export.ts`
- [ ] 3.7 Align SDK/CLI export types and public bulk/import/export documentation with the approved contract — `packages/sdk/`, `packages/cli/`, `docs/api/`, `docs/cli/`
- [ ] 3.8 Run ST-14–ST-24 green through unit/integration/raw HTTP and packed-client boundaries.
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

1. All 40 tasks are `[x]`; no `[~]`, `[ ]`, or `[!]` remains.
2. ST-01–ST-30 were observed RED before implementation and are GREEN afterward.
3. Existing tests and pentest assertions remain unweakened and all authoritative verification passes.
4. Migrations are additive and tested; no generated/sensitive artifact is committed.
5. Product/public/SDK/CLI documentation matches the approved contracts.
6. A completed quality review has no unresolved Critical or Major finding.
7. CI workflows and release/publishing/deployment policy are unchanged.
