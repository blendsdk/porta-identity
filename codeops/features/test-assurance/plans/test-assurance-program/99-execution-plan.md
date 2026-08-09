# Execution Plan: Porta Test Assurance Program

> **Parent**: [Plan Index](00-index.md)
> **Status**: Ready for Execution
> **Last Updated**: 2026-08-09
> **Progress**: 0/76 tasks (0%)
> **CodeOps Artifact Schema**: 1

## Execution Contract

Execute top-to-bottom. Mark the active task `[~]` with a timestamp, mark `[x]` only after its
verification passes, and mark blockers `[!]` with a concrete reason. Resume the first `[~]`, else
the first `[ ]`. Update this file immediately after each task.

Every phase follows specification-first order: author independent specs, observe genuine red (or
record legacy green and obtain controlled-fault red), implement, reach green, add implementation
tests, then run full verification. Existing product behavior, tests, and security invariants are not
weakened. Product defects are reproduced and routed outside this plan.

## Phase Overview

| Phase | Title                                        | Tasks |
| ----- | -------------------------------------------- | ----: |
| 1     | Claim and evidence foundation                |     7 |
| 2     | Fail-fast harness lifecycle                  |     7 |
| 3     | Multi-tenant fixtures and project ownership  |     8 |
| 4     | Attributed server-process coverage           |     8 |
| 5     | Tenant isolation and RBAC slice              |     7 |
| 6     | OIDC, JWT, PKCE, and token slice             |     7 |
| 7     | Human authentication slice                   |     7 |
| 8     | P1 validation and exposure slice             |     7 |
| 9     | Curated faults and mutation pilot            |     8 |
| 10    | Packed SDK/CLI compatibility                 |     6 |
| 11    | Reliability, ratchets, CI, and documentation |     4 |

**Total: 76 tasks across 11 release-safe phases.**

## Phase 1: Claim and Evidence Foundation

> **Scope**: `test-harness/assurance/`, root assurance aliases, repository contract tests
> **References**: [Assurance Model](03-01-assurance-model.md), ST-01–ST-08, RD-01

- [ ] 1.1 [spec-author] Write claim/state/redaction specifications ST-01–ST-08 in `test-harness/assurance/tests/assurance.spec.test.ts`.
- [ ] 1.2 Run the new specification file and record red for missing schema/validator/renderer without changing expectations.
- [ ] 1.3 Implement typed Zod schemas and safe path/reference resolution in `test-harness/assurance/schema.ts` and `scripts/validate-assurance.ts`.
- [ ] 1.4 Implement redaction and deterministic JSON/Markdown result rendering in `scripts/redact-evidence.ts` and `scripts/render-summary.ts`.
- [ ] 1.5 Add a sanitized sample claim, schema documentation, ignored result directory, and root validation/report aliases.
- [ ] 1.6 Run ST-01–ST-08 to green; add `assurance.impl.test.ts` for diagnostics, canonical paths, state-transition edges, and renderer determinism.
- [ ] 1.7 Run `yarn verify`; inspect generated sample evidence for canaries and confirm repository status contains no generated artifact.

**Verify**: `yarn verify`

**Phase gate**: definitions validate, zero imported inventory claims are assured, and evidence cannot
persist known secret canaries.

## Phase 2: Fail-Fast Harness Lifecycle

> **Scope**: `test-harness/fixtures/`, global setup, start/stop/test scripts, Compose identity
> **References**: [Harness and Fixtures](03-02-harness-and-fixtures.md), ST-09–ST-12, RD-02

- [ ] 2.1 [spec-author] Write lifecycle specifications ST-09–ST-12 using isolated fake command/HTTP/process boundaries.
- [ ] 2.2 Force Redis, MailHog, health, and cleanup failures; record current false continuation/ownership red results.
- [ ] 2.3 Add strict typed run identity/environment parsing and a lifecycle controller with explicit owned-resource records.
- [ ] 2.4 Replace non-fatal global cleanup with fatal reset preconditions and verified postconditions; retain safe final cleanup on test failure.
- [ ] 2.5 Make start/stop/test scripts use unique validated Compose project/port identities and graceful Porta shutdown before removal.
- [ ] 2.6 Run ST-09–ST-12 to green; add lifecycle implementation cases for timeouts, interrupted reset, unknown state, and cross-run ownership.
- [ ] 2.7 Run changed-script syntax/lint, `docker compose config`, one success/failure cleanup smoke, and `yarn verify`.

**Verify**: `yarn verify`

**Phase gate**: no required prerequisite or cleanup failure can produce a passing harness result.

## Phase 3: Multi-Tenant Fixtures and Project Ownership

> **Scope**: seed/manifest modules, Playwright fixtures/config, harness test directories
> **References**: [Harness and Fixtures](03-02-harness-and-fixtures.md), ST-13–ST-18, RD-02

- [ ] 3.1 [spec-author] Write fixture-manifest/isolation specs ST-13–ST-16 before changing the seed.
- [ ] 3.2 [spec-author] Write Playwright collection and no-production-control specs ST-17–ST-18.
- [ ] 3.3 Run ST-13–ST-18 and record red for single-tenant reuse, overlapping/missing projects, and internal expectation risk.
- [ ] 3.4 Split seeding into typed arrangement modules and create fresh `alpha`, `bravo`, super-admin, role, lifecycle, client, and invalid-client fixtures.
- [ ] 3.5 Remove secret console output; generate a redacted public manifest and protected runtime credentials with post-seed public verification.
- [ ] 3.6 Add `protocol`, `security`, and `compatibility` projects/directories and shared typed fixtures while retaining `spa`/`bff` behavior.
- [ ] 3.7 Run ST-13–ST-18 to green; add seed/reset implementation tests for transactions, idempotent same-run setup, and invalid namespaces.
- [ ] 3.8 Run the retained six harness journeys twice in reversed/shuffled order, verify residue postconditions, then run `yarn verify`.

**Verify**: `yarn verify`

**Phase gate**: five projects collect files exactly once and two disjoint tenants support an
unambiguous cross-tenant probe without leaked state.

## Phase 4: Attributed Server-Process Coverage

> **Scope**: harness Docker/Compose, coverage converter/tests/scripts, exact direct dev dependencies
> **References**: [Coverage and Faults](03-03-coverage-and-faults.md), ST-19–ST-27, RD-03

- [ ] 4.1 [spec-author] Write raw-record, provenance, graceful-flush, mapping, reproducibility, and policy specs ST-19–ST-27.
- [ ] 4.2 Run the specifications and record red for absent process capture/conversion; retain the known-module expected mapping fixture.
- [ ] 4.3 Promote `@bcoe/v8-coverage@1.0.2`, `ast-v8-to-istanbul@1.0.5`, and `acorn@8.18.0` to direct development dependencies and update the frozen lockfile.
- [ ] 4.4 Add ignored raw/report paths, Porta-only `NODE_V8_COVERAGE`, read/write mount ownership, and clean shutdown collection.
- [ ] 4.5 Implement record validation/merge and TypeScript source-map conversion with build/image/lock/fixture provenance.
- [ ] 4.6 Execute the known-module spike; manually audit mapped executed/unexecuted lines and stop the plan if material attribution is wrong.
- [ ] 4.7 Run ST-19–ST-27 to green; add implementation tests for path normalization, duplicate processes, malformed maps, and partial output.
- [ ] 4.8 Run two clean fixed-seed captures, prove identical exact counts, publish observation-only summary, and run `yarn verify`.

**Verify**: `yarn verify`

**Phase gate**: reproducible server-process coverage is provenance-bound and remains separate from
Vitest coverage; no historical threshold blocks development.

## Phase 5: Tenant Isolation and RBAC Slice

> **Scope**: tenant/RBAC claims and `tests/security/tenant-rbac/*.spec.ts`
> **References**: [Risk Slices](03-04-risk-slices.md), ST-28–ST-30, RD-05

- [ ] 5.1 [spec-author] Catalog tenant/RBAC surfaces and write reviewed P0 claim definitions with explicit gaps and standards/contracts.
- [ ] 5.2 [spec-author] Write ST-28–ST-30 for cross-tenant ID/slug/list/write, membership-plus-role, path/header/session/cache variants, and prohibited side effects.
- [ ] 5.3 Run the specs; record natural red failures or legacy green per claim without altering the oracle.
- [ ] 5.4 Review existing E2E/pentest cases against exact-assertion rules; select only qualifying sentinels and keep all other tests unchanged.
- [ ] 5.5 Add missing black-box probes/independent state checks and reach green; route any confirmed product defect separately and block its claim.
- [ ] 5.6 Add harness implementation tests for actor/resource matrix generation and cross-tenant state comparison.
- [ ] 5.7 Run tenant/RBAC project, capture attributed coverage/evidence, run the phase's curated-fault precheck, and run `yarn verify`.

**Verify**: `yarn verify`

**Phase gate**: claims remain incomplete until Phase 9 kills their designated faults; no tenant
boundary failure is accepted as risk.

## Phase 6: OIDC, JWT, PKCE, and Token Lifecycle Slice

> **Scope**: protocol claims and `tests/protocol/**/*.spec.ts`
> **References**: [Risk Slices](03-04-risk-slices.md), ST-31–ST-34, RD-04/RD-05

- [ ] 6.1 [spec-author] Write version-qualified claims for redirects, PKCE, nonce/state, ES256/JWT validation, codes, refresh rotation, UserInfo, consent, and logout.
- [ ] 6.2 [spec-author] Implement raw HTTP and independent JOSE/client cases ST-31–ST-34, including concurrent replay and prohibited side effects.
- [ ] 6.3 Run the specs and record natural red or legacy green claim-by-claim.
- [ ] 6.4 Review existing OIDC E2E/pentest cases; reject broad statuses, conditional exits, and implementation-derived expected values as sentinels.
- [ ] 6.5 Add missing black-box probes and make exact specs green; reproduce/route product defects without source fixes.
- [ ] 6.6 Add protocol-fixture implementation tests for independent decoding, concurrency barriers, and response normalization.
- [ ] 6.7 Run protocol project, capture attributed evidence, run designated curated-fault prechecks, and run `yarn verify`.

**Verify**: `yarn verify`

**Phase gate**: every P0 protocol claim has exact positive/negative and replay evidence, pending only
its Phase 9 fault kill where applicable.

## Phase 7: Human Authentication Slice

> **Scope**: session/recovery/2FA claims and security/browser protocol tests
> **References**: [Risk Slices](03-04-risk-slices.md), ST-35–ST-40, RD-05

- [ ] 7.1 [spec-author] Define claims for enumeration, lockout, rate limits, magic/reset tokens, sessions, cookies/CSRF, OTP/TOTP, and recovery codes.
- [ ] 7.2 [spec-author] Write ST-35–ST-40 including expired/reused artifacts, equivalent rate-limit inputs, renewal/revocation, and concurrent consumption.
- [ ] 7.3 Run the specs and record natural red or legacy green without weakening exact external semantics.
- [ ] 7.4 Review/select existing E2E/pentest/UI sentinels; require fatal email prerequisites and independent cookie/state checks.
- [ ] 7.5 Add missing black-box cases and reach green; block and route any confirmed invariant violation.
- [ ] 7.6 Add harness implementation tests for mail polling boundaries, concurrency synchronization, clock windows, and secret-free diagnostics.
- [ ] 7.7 Run affected browser/security projects with fresh state, capture coverage/evidence, run fault prechecks, and run `yarn verify`.

**Verify**: `yarn verify`

**Phase gate**: authentication/recovery tests prove exact failure and non-mutation semantics and are
ready for fault-kill completion.

## Phase 8: P1 Validation and Exposure Slice

> **Scope**: validation/exposure claims and `tests/security/validation-exposure/*.spec.ts`
> **References**: [Risk Slices](03-04-risk-slices.md), ST-41–ST-44, RD-04/RD-05

- [ ] 8.1 [spec-author] Define applicable claims for input/injection, CORS/CSP/HTTPS/cookies, minimal errors, and bulk/import/export.
- [ ] 8.2 [spec-author] Write ST-41–ST-44 with encoded variants, tenant-B non-mutation, and safe dependency-error cases.
- [ ] 8.3 Run specs and record natural red or legacy green per claim.
- [ ] 8.4 Review existing pentest/integration cases; classify broad smoke assertions and prerequisite skips as corroboration only.
- [ ] 8.5 Add missing exact probes and reach green; route product defects separately.
- [ ] 8.6 Add harness implementation tests for payload generation bounds, header normalization, and redacted error comparison.
- [ ] 8.7 Run the security project, capture evidence/coverage, run fault prechecks, and run `yarn verify`.

**Verify**: `yarn verify`

**Phase gate**: every reviewed P1 surface is assured-ready, incomplete with named gaps, or blocked by
a separately routed defect; nothing is silently treated as safe.

## Phase 9: Curated Faults and Mutation Pilot

> **Scope**: fault metadata/patches/runner/results and optional bounded mutation configuration
> **References**: [Coverage and Faults](03-03-coverage-and-faults.md), ST-45–ST-49, RD-06

- [ ] 9.1 [spec-author] Write fault validation, result-classification, expected-signature, timeout, and cleanup specs ST-45–ST-49.
- [ ] 9.2 Run specs and record red for absent catalog/runner.
- [ ] 9.3 Implement validated fault metadata, target-hash checks, disposable-worktree/build execution, sanitized evidence, and unconditional owned cleanup.
- [ ] 9.4 Add reviewed tenant-scope and RBAC bypass faults; require designated Phase 5 sentinels to kill each.
- [ ] 9.5 Add redirect/PKCE/JWT/replay faults; require designated Phase 6 sentinels to kill each.
- [ ] 9.6 Add CSRF/cookie/rate-limit/recovery/exposure faults; require designated Phase 7/8 sentinels to kill each.
- [ ] 9.7 Run ST-45–ST-49 to green; evaluate the bounded automated-mutation pilot and record go/no-go against explicit compatibility/runtime criteria.
- [ ] 9.8 Execute the clean baseline and full curated catalog; keep survivors incomplete, verify no residue/secrets, close eligible claims, and run `yarn verify`.

**Verify**: `yarn verify`

**Phase gate**: every closed critical claim has a killed representative fault; build/setup failures
and survivors never count as assurance.

## Phase 10: Packed SDK and CLI Compatibility

> **Scope**: isolated consumer templates/scripts and compatibility Playwright project
> **References**: [Compatibility and CI](03-05-compatibility-and-ci.md), ST-50–ST-53, RD-04

- [ ] 10.1 [spec-author] Write packed-resolution and live SDK/CLI specifications ST-50–ST-53 before adding consumer tooling.
- [ ] 10.2 Run specs and record red for absent tarballs/isolated consumer/live journeys.
- [ ] 10.3 Implement deterministic build/pack/identity/integrity/install lifecycle in an ignored non-workspace consumer directory.
- [ ] 10.4 Add live Node SDK, browser export where feasible, and packed CLI positive/negative journeys against harness fixtures.
- [ ] 10.5 Run ST-50–ST-53 to green; add implementation tests for package identity, dependency resolution, cleanup, and sanitized command capture.
- [ ] 10.6 Run the compatibility project from a clean pack/install, capture evidence, verify no source/symlink loading, and run `yarn verify`.

**Verify**: `yarn verify`

**Phase gate**: publishable SDK exports and CLI bin interoperate with the live Porta image outside
the workspace; mock-only suites remain intact.

## Phase 11: Reliability, Ratchets, CI, and Documentation

> **Scope**: assurance command policy, structure/CI contracts, sanitized summaries, inventory/ADR
> **References**: [Compatibility and CI](03-05-compatibility-and-ci.md), ST-54–ST-57, RD-03/RD-07

- [ ] 11.1 [spec-author] Write stability, staleness, artifact hygiene, root-command, and CI-lane specs ST-54–ST-57; record red before promotion changes.
- [ ] 11.2 Run 100 representative shuffled executions, record completed-run flake rate and p50/p95, remediate harness-only flakes, and rerun until the <1% gate passes or leave promotion blocked.
- [ ] 11.3 Commit exact reproducible coverage baselines/no-regression policy, add only reliability-qualified harness/fault CI wiring, and keep `yarn verify` unchanged.
- [ ] 11.4 Run ST-54–ST-57 and all implementation tests; update the test inventory and ADR-014 status truthfully; run final `yarn verify`, `yarn test:ui`, `yarn harness:test`, coverage reproduction, curated faults, packed compatibility, redaction, and cleanup gates.

**Verify**: `yarn verify`

**Final gate**: all Must criteria are traced and verified, every closed critical claim has current
green and killed-fault evidence, residual gaps are named, ordinary development remains usable, and
no product fix, scanner, publish, deployment, or certification claim entered this program.
