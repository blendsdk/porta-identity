# Current State: Porta Test Assurance

> **Parent**: [Plan Index](00-index.md)
> **Snapshot**: 2026-08-09 at commit `9e10bc1c`

## Healthy Baseline

| Surface           | Evidence                                                                        | Limitation                                                                           |
| ----------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Root verification | `package.json:21-32` runs structure plus server, SDK, and CLI; 4,167 cases pass | UI and harness are separate; passing is not oracle independence                      |
| Server            | 224 files / 3,348 cases across unit, integration, E2E, and pentest              | Most cases were written after implementation; coverage misses assembled startup work |
| UI                | 24 files / 134 Chromium cases                                                   | Browser-only and separate from `yarn verify`                                         |
| OIDC harness      | Six external SPA/BFF journeys                                                   | Small, shared-state, single-tenant surface                                           |
| SDK               | 31 files / 404 cases                                                            | Mock transports; no live packed-artifact proof                                       |
| CLI               | 29 files / 355 cases                                                            | SDK calls commonly mocked; public bin points to compiled output                      |
| Coverage          | Server statements 79.18%, branches 70.28%, functions 85.87%, lines 79.57%       | Configured 80/75 thresholds fail; attribution is incomplete                          |

The complete inventory and methodology live in
[`techdocs/reference/current-test-inventory.md`](../../../../../techdocs/reference/current-test-inventory.md).

## Grounded Gaps

| Gap                                    | Repository evidence                                                                                   | Planned response                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Cleanup can fail silently              | `test-harness/tests/global-setup.ts:7-27` catches Redis/MailHog errors and continues                  | Phase 2 fatal lifecycle specifications and typed reset controller |
| Shared serial state                    | `test-harness/playwright.config.ts:3-31` fixes one worker and only `spa`/`bff` projects               | Phase 3 project ownership and isolation; defer parallelism        |
| Fixture cannot prove tenant boundaries | `test-harness/scripts/seed.ts:51-68` declares one org/app/user                                        | Phase 3 disjoint tenant/actor/client manifest                     |
| Seed reuses mutable state              | `test-harness/scripts/seed.ts:101-213` finds/reuses resources and rotates one secret                  | Recreate a known baseline and verify postconditions               |
| Seed prints secrets                    | `test-harness/scripts/seed.ts:184-187,266-275` logs the BFF secret and password                       | Redacted generated config/evidence and no secret console output   |
| Harness server runs outside Vitest     | `test-harness/docker-compose.yml:20-55` starts compiled Porta in Docker                               | Phase 4 process-owned V8 capture                                  |
| Source maps are available              | `packages/server/tsconfig.json:7-17` emits `dist` maps                                                | Remap only against the matching build                             |
| Maps exist but capture does not        | `test-harness/Dockerfile:37-43` copies compiled output, including maps; Compose has no coverage mount | Add explicit evidence mount and graceful stop                     |
| Live package surface is untested       | `packages/sdk/package.json:6-25`; `packages/cli/package.json:6-10` target `dist`                      | Phase 5 establishes packed consumers; owning slices run journeys  |
| CI lanes already separate              | `.github/workflows/build-and-test.yml:18-190` has verify, UI, harness, docs, Docker, audit jobs       | Keep workflow untouched; produce separately authorized proposal   |

## Constraints and Risks

| Risk                            | Control                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| Self-validating expectations    | Claim source/oracle review; no production imports in specification assertions            |
| False pass from stale state     | Fatal reset, postcondition checks, scenario namespaces, shuffled repeats                 |
| Misleading coverage             | Commit/image provenance, exact counts, sampled map audit, separate report                |
| Mutation false kill             | Require designated assertion failure; classify build/setup failure as invalid            |
| Assurance blocks daily work     | Preserve `yarn verify`; stage expensive lanes and ratchets                               |
| Security detail or secrets leak | Synthetic fixtures, redaction tests, ignored generated evidence, restricted CI retention |
| Product bug gets normalized     | Block claim, preserve expected contract, route separate fix                              |
| Harness becomes a catch-all     | Playwright external plus root Node/tsx internal checks; no new harness/package/framework |
