# Execution Plan: Production Security Corrections

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-09-13 03:25
> **Progress**: 39/51 tasks (76%)
> **Lifecycle**: Ready
> **CodeOps Artifact Schema**: 1

## Execution Rules

Update this file after every task. Mark implementation `[~]` with `implemented: YYYY-MM-DD HH:MM`,
then `[x]` only after verification with `completed: YYYY-MM-DD HH:MM`. Resume the first `[~]`,
otherwise the first `[ ]`. Mark a blocker `[!]` with its reason. Immutable specification tests are
never changed to match implementation.

| Phase | Scope | Tasks |
|---:|---|---:|
| 1 | Signing-key storage, cache, and bootstrap | 14 |
| 2 | TOTP schema and atomic replay consumption | 14 |
| 3 | TOTP route security and public outcomes | 8 |
| 4 | Production configuration, operations, docs, final gates | 15 |

## Phase 1: Signing-Key Storage, Cache, and Bootstrap

**Reference:** [03-01](03-01-signing-keys.md), AR-3, AR-5, AR-7, ST-01–ST-08. **Scope:** named signing-key source,
specification/implementation tests, this plan, review evidence, and roadmap only.

> **Phase baseline tree**: `638c3d1f2ac4e3260f623a6c13e59b6be1124c52`
> **Expected modification set**: named signing-key source and tests, the mechanical retained-test count, this plan, phase review evidence, and the feature roadmap
> **Scope mode**: strict

### Step 1.1: Specification Tests

- [x] 1.1.1 [spec-author] Write route, storage, rollback, cache-overlap, strict-row, diagnostic, and authorization specifications from ST-01–ST-04 and ST-06–ST-08 — `packages/server/tests/unit/security/signing-key-security.spec.test.ts` ✅ (completed: 2026-09-13 01:26)
- [x] 1.1.2 [spec-author] Write real PostgreSQL encrypted-storage and concurrent-bootstrap specifications from ST-01–ST-03 and ST-05 — `packages/server/tests/integration/security/signing-key-storage.spec.test.ts` ✅ (completed: 2026-09-13 01:26)
- [x] 1.1.3 Run both Phase 1 specification files and record their expected red results before implementation ✅ (completed: 2026-09-13 01:26)

**Red evidence:** unit 10 failed / 5 passed; integration 3 failed / 1 passed. The failures cover
the planned encrypted-write, cache-generation, strict-row, bounded-diagnostic, and serialized
bootstrap behavior. Log: `/tmp/porta-rd01-exec.noLev5/verify-1.1.3-red.log`.

### Step 1.2: Implementation

- [x] 1.2.1 Make decryption/row/PEM failures use the fixed domain error and bounded `kid` diagnostic — `packages/server/src/lib/signing-key-crypto.ts`, `packages/server/src/lib/signing-keys.ts` ✅ (completed: 2026-09-13 01:29)
- [x] 1.2.2 Encrypt Admin-generated keys and register post-commit invalidation while retaining the existing transaction and response contracts — `packages/server/src/routes/keys.ts` ✅ (completed: 2026-09-13 01:32)
- [x] 1.2.3 Add the local cache-generation guard against stale in-flight installation — `packages/server/src/lib/signing-keys.ts` ✅ (completed: 2026-09-13 01:33)
- [x] 1.2.4 Serialize the bootstrap recheck/insertion with the short PostgreSQL transaction lock — `packages/server/src/lib/signing-keys.ts` ✅ (completed: 2026-09-13 01:34)
- [x] 1.2.5 Suppress sensitive signing-row stacks from server startup and every server CLI mode — `packages/server/src/index.ts`, `packages/server/src/cli/error-handler.ts` ✅ (completed: 2026-09-13 01:37)
- [x] 1.2.6 Run ST-01–ST-08 and make the immutable Phase 1 expectations green ✅ (completed: 2026-09-13 01:37)

**Green evidence:** unit 15 passed; integration 4 passed. Log:
`/tmp/porta-rd01-exec.noLev5/verify-1.2.6-green.log`.

### Step 1.3: Implementation Tests and Verification

- [x] 1.3.1 Update existing crypto, loader, and CLI error-handler tests for encrypted-only rows and bounded startup/verbose errors — `packages/server/tests/unit/lib/signing-key-crypto.test.ts`, `packages/server/tests/unit/lib/signing-keys.test.ts`, `packages/server/tests/unit/cli/error-handler.test.ts` ✅ (completed: 2026-09-13 01:40)
- [x] 1.3.2 Add route internals and update real-database coverage for encrypted mutations — `packages/server/tests/unit/routes/keys.impl.test.ts`, `packages/server/tests/integration/services/signing-key.service.test.ts` ✅ (completed: 2026-09-13 01:44)
- [x] 1.3.3 Add cache-generation and bootstrap-lock implementation branches — `packages/server/tests/unit/lib/signing-key-cache.impl.test.ts` ✅ (completed: 2026-09-13 01:45)
- [x] 1.3.4 Run focused Phase 1 suites, server lint/typecheck/build, and `yarn test:structure` ✅ (completed: 2026-09-13 01:48)

**Phase verification evidence:** 77 focused unit and 8 focused integration tests passed; server
lint, typecheck, and build passed; structure passed 100/100 after the mechanical retained-file
count advanced from 292 to 296. Logs: `/tmp/porta-rd01-exec.noLev5/verify-1.3.4.log` and
`/tmp/porta-rd01-exec.noLev5/verify-1.3.4-structure-rerun.log`.
- [x] 1.3.5 Complete the risk-derived phase review and resolve every critical/major finding before checkpointing ✅ (completed: 2026-09-13 01:52)

**Phase review evidence:** the independent correctness/maintainability/concurrency reviewer and
the independent security auditor reviewed the complete diff from baseline tree
`638c3d1f2ac4e3260f623a6c13e59b6be1124c52`; both reported no findings. No remediation or
scope expansion was required.

## Phase 2: TOTP Schema and Atomic Replay Consumption

**Reference:** [03-02](03-02-totp-replay.md), AR-1–AR-3, AR-6–AR-7, AR-9, ST-09–ST-19 and ST-23. **Scope:** migration 028,
TOTP types/utility/repository/service, named tests, this plan, review evidence, and roadmap only.

> **Phase baseline tree**: `dbf0922eee4e5427d09074d5df2f2d2fe80bf3f4`
> **Expected modification set**: migration 028, TOTP types/utility/repository/service, named tests, the mechanical retained-test count, this plan, phase review evidence, and the feature roadmap
> **Scope mode**: strict

### Step 2.1: Specification Tests

- [x] 2.1.1 [spec-author] Write migration SQL-shape and matched-step/parameter specifications from ST-09–ST-11 — `packages/server/tests/unit/two-factor/totp-replay.spec.test.ts` ✅ (completed: 2026-09-13 02:07)
- [x] 2.1.2 [spec-author] Write real migration Up/Down behavior from ST-09 — `packages/server/tests/integration/migrations/totp-replay.spec.test.ts` ✅ (completed: 2026-09-13 02:07)
- [x] 2.1.3 [spec-author] Write real PostgreSQL consume, concurrency, replacement, enrollment, rollback, and exact-row specifications from ST-12–ST-19 and ST-23 — `packages/server/tests/integration/security/totp-replay.spec.test.ts` ✅ (completed: 2026-09-13 02:07)
- [x] 2.1.4 Run all three Phase 2 specification files and record their expected red results before implementation ✅ (completed: 2026-09-13 02:09)

**Red evidence:** unit 21 failed / 2 passed; integration 8 failed. The failures cover the planned
migration, absolute-step validation, fixed stored parameters, safe BIGINT mapping, exact-row
conditional writes, transactional enrollment, replay/concurrency, and replacement-row behavior.
The existing organization-scoped interaction boundary remains green. Log:
`/tmp/porta-rd01-exec.noLev5/verify-2.1.4-red.log`.

### Step 2.2: Implementation

- [x] 2.2.1 Add migration 028 and exact raw/domain replay-state mappings — `packages/server/migrations/028_totp_replay_protection.sql`, `packages/server/src/two-factor/types.ts` ✅ (completed: 2026-09-13 02:13)
- [x] 2.2.2 Directly replace the internal validator with an absolute matched-step contract, add the typed unsupported-state error, and update barrel exports without a compatibility wrapper — `packages/server/src/two-factor/totp.ts`, `packages/server/src/two-factor/errors.ts`, `packages/server/src/two-factor/index.ts` ✅ (completed: 2026-09-13 02:17)
- [x] 2.2.3 Add exact-row conditional consume and enrollment-confirm repository operations — `packages/server/src/two-factor/repository.ts` ✅ (completed: 2026-09-13 02:20)
- [x] 2.2.4 Capture validation time once and use atomic consume/transactional enrollment in the service — `packages/server/src/two-factor/service.ts` ✅ (completed: 2026-09-13 02:24)
- [x] 2.2.5 Run ST-09–ST-19 and ST-23 and make the immutable Phase 2 expectations green ✅ (completed: 2026-09-13 02:28)

**Green evidence:** unit 23 passed; integration 8 passed. Log:
`/tmp/porta-rd01-exec.noLev5/verify-2.2.5-green.log`.

### Step 2.3: Implementation Tests and Verification

- [x] 2.3.1 Update existing migration, type, and TOTP utility tests for changed internals — `packages/server/tests/unit/migrations.test.ts`, `packages/server/tests/unit/two-factor/types.test.ts`, `packages/server/tests/unit/two-factor/totp.test.ts` ✅ (completed: 2026-09-13 02:33)
- [x] 2.3.2 Update existing repository and service tests for conditional consume and transactional enrollment — `packages/server/tests/unit/two-factor/repository.test.ts`, `packages/server/tests/unit/two-factor/service.test.ts` ✅ (completed: 2026-09-13 02:39)
- [x] 2.3.3 Add conditional-update and transaction-rollback implementation branches — `packages/server/tests/unit/two-factor/totp-replay.impl.test.ts` ✅ (completed: 2026-09-13 02:45)
- [x] 2.3.4 Run focused Phase 2 unit/integration suites, server lint/typecheck/build, and `yarn test:structure` ✅ (completed: 2026-09-13 02:51)

**Phase verification evidence:** 331 focused unit and 40 focused integration tests passed; server
lint, typecheck, and build passed; structure passed 100/100 with the retained server test count at
300. Log: `/tmp/porta-rd01-exec.noLev5/verify-2.3.4.log`.
- [x] 2.3.5 Complete the risk-derived phase review and resolve every critical/major finding before checkpointing ✅ (completed: 2026-09-13 02:54)

**Phase review finding:** RV-2-01 (MAJOR, accepted) — the independent reviewer found that
the real PostgreSQL specifications do not directly exercise first consumption from a verified row
whose replay step is null, or exact-row conditional failures for wrong row ID, wrong user ID, and
wrong verification state. The security auditor reported no findings. Recommended remediation:
add only these missing real-database assertions to the existing Phase 2 integration specification;
no production code or supporting machinery is required. The user approved this test-only
correction on 2026-09-13.

**Phase review evidence:** the accepted remediation added real PostgreSQL assertions for initial
null-step consumption and exact row/user/state conditional failures. The focused remediation gate
passed 8 integration and 100 structure tests plus server typecheck/build. The independent reviewer
and security auditor then reviewed the remediation diff once and both reported no findings. Log:
`/tmp/porta-rd01-exec.noLev5/verify-rv-2-01.log`.

## Phase 3: TOTP Route Security and Public Outcomes

**Reference:** [03-02](03-02-totp-replay.md), AR-1–AR-3, AR-6–AR-7, AR-9, ST-13 and ST-20–ST-23. **Scope:** TOTP route,
English locale, named route tests, this plan, review evidence, and roadmap only.

> **Phase baseline tree**: `57d4a8f825d0154018920195c81da6c0cf0ec3c1`
> **Expected modification set**: TOTP route, English locale, named route tests, the mechanical retained-test count, this plan, phase review evidence, and the feature roadmap
> **Scope mode**: strict

### Step 3.1: Specification Tests

- [x] 3.1.1 [spec-author] Write invalid/replay uniformity, enrollment limiter, 429 data reuse, 503 parity, non-disclosure, and tenant-context specifications from ST-13 and ST-20–ST-23 — `packages/server/tests/unit/routes/two-factor-security.spec.test.ts` ✅ (completed: 2026-09-13 02:51)
- [x] 3.1.2 Run the Phase 3 specification file and record its expected red result before implementation ✅ (completed: 2026-09-13 02:51)

**Red evidence:** 5 failed / 6 passed. The failures cover the missing enrollment verification
budget, stored pending-setup rendering on HTTP 429, generic HTTP 503 parity for login and
enrollment, and bounded unsupported-configuration diagnostics. Log:
`/tmp/porta-rd01-exec.noLev5/verify-3.1.2-red.log`.

### Step 3.2: Implementation

- [x] 3.2.1 Apply existing `2fa_verify` only after email setup returns, then re-render stored pending TOTP setup on 429 — `packages/server/src/routes/two-factor.ts` ✅ (completed: 2026-09-13 02:55)
- [x] 3.2.2 Map typed unsupported configuration consistently to a generic localized 503 page using the same pending enrollment data and fixed safe diagnostic — `packages/server/src/routes/two-factor.ts`, `packages/server/locales/default/en/errors.json` ✅ (completed: 2026-09-13 02:57)
- [x] 3.2.3 Run ST-13 and ST-20–ST-23 and make the immutable Phase 3 expectations green ✅ (completed: 2026-09-13 02:59)

**Green evidence:** all 11 immutable Phase 3 route-security specifications passed. Log:
`/tmp/porta-rd01-exec.noLev5/verify-3.2.3-green.log`.

### Step 3.3: Implementation Tests and Verification

- [x] 3.3.1 Update existing TOTP route tests for rate-limit and typed-error branches without weakening security assertions — `packages/server/tests/unit/routes/two-factor.test.ts` ✅ (completed: 2026-09-13 03:01)
- [x] 3.3.2 Run focused route/unit/integration/E2E/pentest selectors, server lint/typecheck/build, and `yarn test:structure` ✅ (completed: 2026-09-13 03:07)

**Phase verification evidence:** 204 focused unit, 42 integration, 10 E2E, and 34 penetration
tests passed; server lint, typecheck, and build passed; structure passed 100/100 with the retained
server test count at 301. Log: `/tmp/porta-rd01-exec.noLev5/verify-3.3.2.log`.
- [x] 3.3.3 Complete the risk-derived phase review and resolve every critical/major finding before checkpointing ✅ (completed: 2026-09-13 03:17)

**Phase review finding:** RV-3-001 (MINOR, report-only) — the specification translation mock
returns the generic unavailable message for every `errors.*` key, so the 503 assertion does not
pin the exact locale key. The immutable specification remains unchanged after its red run. The
security auditor reported no findings.

**Phase review evidence:** a final boundary check allowlisted the user-controlled `codeType` before
it can enter diagnostics or audit descriptions and added one route regression test. The focused
correction gate passed 27 route tests plus server lint, typecheck, build, and 100 structure tests.
The one-time correctness and security re-reviews reported no findings. The complete final Phase 3
gate then passed 205 unit, 42 integration, 10 E2E, 34 penetration, and 100 structure tests plus
server lint, typecheck, and build. Log:
`/tmp/porta-rd01-exec.noLev5/verify-3.3.3-final.log`.

## Phase 4: Production Configuration, Operations, Documentation, and Final Gates

**Reference:** [03-03](03-03-production-configuration-and-operations.md), AR-4, AR-7–AR-8, ST-24–ST-28. **Scope:**
production schema, CLI keys, named docs/examples/tests, this plan, review evidence, and roadmaps.

> **Phase baseline tree**: `99a21bd7b9a8f661bd10adc2a69b215ec024610b`
> **Expected modification set**: production schema, CLI key commands, named documentation and examples, named tests, this plan, phase review evidence, and feature/portfolio roadmaps
> **Scope mode**: strict

### Step 4.1: Specification Tests

- [x] 4.1.1 [spec-author] Write unequal-key and CLI success/failure guidance specifications from ST-24–ST-26 — `packages/server/tests/unit/config/production-key-separation.spec.test.ts`, `packages/cli/tests/commands/key-restart-guidance.spec.test.ts` ✅ (completed: 2026-09-13 03:25)
- [x] 4.1.2 [spec-author] Write the production documentation contract specifications from ST-27–ST-28 — `repo-tests/monorepo/production-security-guidance.spec.test.mjs` ✅ (completed: 2026-09-13 03:25)
- [x] 4.1.3 Run the Phase 4 specification files and record their expected red results before implementation ✅ (completed: 2026-09-13 03:26)

**Red evidence:** server 4 failed / 2 passed; CLI 2 failed / 4 passed; documentation 4 failed.
The failures cover byte-equivalent production root keys, successful human key lifecycle/restart
guidance, consistent production-secret and migration guidance, later-work boundaries, and removal
of automatic steady-state migration recommendations. Log:
`/tmp/porta-rd01-exec.noLev5/verify-4.1.3-red.log`.

### Step 4.2: Implementation and Focused Verification

- [ ] 4.2.1 Reject normalized byte-equivalent production encryption-key values before the safety escape hatch and update existing config tests — `packages/server/src/config/schema.ts`, `packages/server/tests/unit/config/schema.production.test.ts`
- [ ] 4.2.2 Add successful generate/rotate restart and verification guidance and update existing CLI tests — `packages/cli/src/commands/keys.ts`, `packages/cli/tests/commands/keys.test.ts`
- [ ] 4.2.3 Correct production secret and restart guidance — `README.md`, `docs/guide/environment.md`, `docs/guide/deployment.md`
- [ ] 4.2.4 Correct conventional CLI, production Docker, and migration guidance — `docs/cli/infrastructure.md`, `docker/DOCKERHUB.md`, `docs/database/migrations.md`
- [ ] 4.2.5 Run ST-24–ST-28, affected workspace verification, `yarn test:structure`, and `yarn docs:build`; make all immutable expectations green

### Step 4.3: Final Security and Compatibility Gates

- [ ] 4.3.1 Complete the final risk-derived review and resolve every critical/major finding, then checkpoint a clean committed revision
- [ ] 4.3.2 Run `yarn verify` and record evidence
- [ ] 4.3.3 Run `yarn test:ui` and record evidence
- [ ] 4.3.4 Run `yarn harness:test` and record evidence
- [ ] 4.3.5 Run `yarn assurance:harness --project security --profile production-security`; inspect its registered exit taxonomy and record evidence
- [ ] 4.3.6 Run `yarn assurance:compat --select p1-admin` from the clean committed checkpoint; inspect its registered exit taxonomy and record evidence
- [ ] 4.3.7 Run `yarn docs:build` and record evidence

## Dependencies

```text
Signing keys → TOTP persistence/service → TOTP routes → production operations and final gates
```

## Completion Conditions

All 51 tasks and ST-01–ST-28 pass; no plaintext signing-key path or TOTP replay remains; public
responses/logs remain bounded; the complete AR-4 matrix passes; review evidence and roadmaps are
synchronized; and no excluded machinery or unrelated refactor is present.
