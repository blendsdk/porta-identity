# Execution Plan: DEF Quick Cleanup

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Status**: Complete
> **Last Updated**: 2026-09-21 02:15
> **Progress**: 8/8 tasks (100%)
> **CodeOps Artifact Schema**: 1

## Overview

Implement the low-risk residual corrections and the already-fixed-defect evidence refresh in strict
specification-first order. Only behavior owned by the named defects may change; every existing
security assertion, harness expectation, and penetration test is preserved.

## Execution Contract

The task checkboxes below are the single source of truth. On implementation mark the active task
`[~]` with the current date and update Progress/Last Updated. After its targeted command and
`yarn verify` pass, promote it to `[x]`. A specification RED succeeds only when the named immutable
assertion fails while existing required lanes remain green. A blocker is marked `[!]` with its exact
cause.

## Targeted Verification Bindings

| Phase | Required targeted commands                                                                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `yarn test:structure` (proxy tokens) and `yarn workspace @portaidentity/server vitest run --project unit tests/unit/middleware/health.test.ts` and `yarn workspace @portaidentity/sdk vitest run tests/pagination/` as created |
| 2     | `yarn verify` for every affected workspace plus `yarn test:structure`                                                                                                                                                          |

Before a planned implementation-test file exists, omit only that nonexistent path from the phase's
targeted command; all already-created paths remain mandatory.

---

## Phase 1: Low-risk residuals and evidence refresh

> **Lenses**: security, correctness

**Reference**: RD-04 (compatibility), RD-05 (security risk slice), RD-06 (fault sensitivity);
DEF-15, DEF-16, DEF-18 residuals; DEF-4, DEF-9, DEF-19 evidence refresh.

- [x] 1.1 [spec-author] Write the immutable specifications: a repository structure contract that every tracked nginx configuration and deployment documentation example suppresses version tokens; a server unit contract that `/health` fails within a bound when a dependency hangs; and an SDK contract that the cursor loop follows `nextCursor`. (completed 2026-09-21 01:27; added `repo-tests/monorepo/server-tokens.spec.test.mjs`, `packages/server/tests/unit/middleware/health.spec.test.ts`, `packages/sdk/tests/pagination/list-all-next-cursor.spec.test.ts`)
- [x] 1.2 Run the new specifications and record the exact RED assertions for each unimplemented behavior. (completed 2026-09-21 01:28; structure 4/4 red, health 2/2 hang bounds red, SDK 2/2 cursor red)
- [x] 1.3 DEF-15: add `server_tokens off;` to `docker/nginx-dev.conf`, `docker/admin-playground/nginx.conf`, `docs/guide/deployment.md`, and `techdocs/guides/deployment.md`. (completed 2026-09-21 01:28; structure contract green 4/4)
- [x] 1.4 DEF-16: extract the readiness timeout helper into a shared module, bound the `/health` database and cache checks, and add a database pool error/reconnect regression test. (completed 2026-09-21 01:30; added `src/lib/with-timeout.ts`, reused it in `ready.ts` and `health.ts`, added `tests/unit/lib/database-pool-reconnect.spec.test.ts`; focused 13/13 green)
- [x] 1.5 DEF-18: add `nextCursor`/`previousCursor` to the SDK pagination response types and make the `listAll` cursor loop advance on `nextCursor` with `cursor` retained as a compatibility alias. (completed 2026-09-21 01:29; SDK pagination 15/15 green)
- [x] 1.6 Evidence refresh: run the detecting tests for DEF-4, DEF-9 and DEF-19 and record a named passing revision. (completed 2026-09-21 01:29; unit TOTP replay + session public identifiers 27/27, integration Redis atomic consume + TOTP replay 18/18)
- [x] 1.7 Reconcile: update `codeops/features/test-assurance/00-roadmap.md` rows with the verified states and create `codeops/features/test-assurance/00-remaining-work.md` for every open defect. (completed 2026-09-21 01:31; four defects marked resolved, two marked code-resolved with live refresh pending, DEF-13 partial, and every open item recorded in the backlog)
- [x] 1.8 Full verification: `yarn verify` and `yarn test:structure` pass for the affected workspaces. (completed 2026-09-21 02:15; structure 126/126; server verify pass — unit, integration 476, e2e 127, pentest 260, build; SDK verify 560; CLI verify 1430; root `yarn verify` 4/4 tasks successful after installing the declared `@jsvision/*` and `fs-ext-extra-prebuilt` dependencies the environment was missing.)

**Phase gate:** the three residuals are implemented behind green immutable specifications, the three
fixed defects carry named passing evidence, the roadmap no longer misreports verified defects as
blocked, and the remaining open defects are durably recorded.
