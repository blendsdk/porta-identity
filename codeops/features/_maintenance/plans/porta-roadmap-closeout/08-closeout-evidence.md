# Closeout Evidence

> **Parent**: [Execution plan](99-execution-plan.md)
> **Scope**: `_maintenance/T-07` historical reconciliation and active verification
> **Created**: 2026-11-01
> **CodeOps Artifact Schema**: 1

This document records evidence, not another task-state graph. The execution plan remains the sole
task-progress authority. Each proposed original-task completion identifies the original obligation,
source identity, exact scope, expected/observed result, durable proof and review state, following
[03-01](03-01-evidence-and-reconciliation.md).

## Frozen Task Obligations

| Original task | Owner path | Acceptance clause | Initial observed state |
| --- | --- | --- | --- |
| 4.1.1 | `codeops/features/monorepo-migration/plans/automated-release/99-execution-plan.md` | Merge `feat/automated-release` into `develop` with green CI | Checkbox open; historical merge/CI exist |
| 4.1.2 | Same | Merge `develop` into `main`; new workflow deploys; no automatic release fires | Checkbox open; historical merge/CI exist; no Release run on the merge |
| 4.1.3 | Same | Trigger Release on `main` and verify all published artifacts | Already `[x]`; v1.9.0 run `36137558382` |
| 7.1.4 | `codeops/features/user-invitations/plans/deferred-invitation-creation/99-execution-plan.md` | Authorized `develop` → `main` integration with green `main` CI | Checkbox open; main merge/CI exist |
| 7.1.5 | Same | Authorized manual Release dispatch on `main` | Checkbox open; literal main dispatch failed; AR-14 equivalence selected |
| 7.1.6 | Same | Verify npm provenance, GitHub Release, Docker image and develop sync | Checkbox open; candidate artifacts identified |
| 5.1.3 | `codeops/features/tenant-user-management/plans/tenant-m2m-user-management/99-execution-plan.md` | Exact production-security run, observers, exit comparison and cleanup | Blocked; Phase 2 owns current proof |
| 4.6 | `codeops/features/_maintenance/plans/pnpm-migration/99-execution-plan.md` | Live compatibility, coverage capture and ratchet refresh | Open; Phase 3 owns |
| 6.4 | Same | Production/harness images, dependency graph/alerts and cache reuse | Open; Phase 4 owns under AR-12/13 |
| 8.4 | `codeops/features/test-assurance/plans/test-assurance-program/99-execution-plan.md` | DEF-23 timing study | Remains blocked and excluded (AR-10) |
| 8.7c | Same | DEF-8 transient MailHog/sequential use | Checkbox blocked; successor evidence to compare in Phase 2 |
| 9.6b | Same | DEF-13 live boundary and transport cases | Checkbox blocked; successor evidence to compare in Phase 2 |
| 9.6c | Same | DEF-13 admin-denial digest credit | Checkbox blocked; successor evidence to compare in Phase 2 |

Acceptance cases frozen for this phase: ST-1 (only the proved obligation leaves its original
checklist), ST-2 (unmatched historical evidence does not receive broader credit), ST-3 (merge, CI,
release and artifact closure use exact task-matched evidence), and ST-17 (each derived summary
agrees with its source tasks).

## Automated Release

### Task 4.1.1 — merge to develop

| Field | Evidence |
| --- | --- |
| Obligation | `feat/automated-release` merged into `develop` through a PR with green CI |
| Source identity | PR #130; merge commit `0b796e7b42d688f2fef8994d0e4534465334f8bf`; base `develop`; merged 2026-09-25T09:20:39Z |
| Scope | Historical merge and branch CI only; no new release |
| Observation | PR state `MERGED`; push Build and Test `36117901295` success; PR Build and Test `36117923695` success; all six named jobs completed successfully |
| Proof | GitHub PR #130 and the two run IDs above |
| Review | Phase 1 review completed; see [05-findings.md](05-findings.md) (RV-001–RV-005) |
| Cleanup | n/a — historical read-only review; no runner or owned resources |
| Consequence | 4.1.1 may close; no residual |

The original checkbox is stale bookkeeping. The merge and branch CI obligation is proved.

### Task 4.1.2 — promotion to main

| Field | Evidence |
| --- | --- |
| Obligation | `develop` merged into `main`; the new workflow is present; no automatic release fires |
| Source identity | PR #131; merge commit `fb11f971d2a1331e5418ce8e59ab638c4cac51ed`; base `main`; merged 2026-09-25T09:28:10Z |
| Scope | Historical main merge, main CI and absence of a Release trigger on that merge |
| Observation | PR state `MERGED`; push Build and Test `36118605247` success; docs deployment `36118605283` success; `gh run list --commit fb11f971…` returns no Release workflow run. At `fb11f971`, `.github/workflows/release.yml` is present and its only trigger is `workflow_dispatch`; the `workflow_run` token inside the workflow is part of a jq string, not a trigger. |
| Proof | GitHub PR #131, the two run IDs, the commit-scoped Release query, and `git show fb11f971:.github/workflows/release.yml` |
| Review | Phase 1 review completed; see [05-findings.md](05-findings.md) (RV-001–RV-005) |
| Cleanup | n/a — historical read-only review; no runner or owned resources |
| Consequence | 4.1.2 may close; no residual |

The literal obligation is proved. The previous release (`4.1.3`, run `36137558382`, v1.9.0) remains
the first automated release and is not re-credited.

### Task 4.1.3 — first automated release

Already verified in the source plan: Release run `36137558382` succeeded, v1.9.0 was tagged
(`06b22238`), npm published with provenance, the GitHub Release was created, Docker tags were
published, and `develop` was synced. This closeout reuses the existing record and does not trigger
a new release.

## Deferred Invitations

### Task 7.1.4 — integrate develop into main

| Field | Evidence |
| --- | --- |
| Obligation | Authorized `develop` → `main` integration with green `main` CI |
| Source identity | PR #140; merge commit `0c820650c4b7345fca114257f9203a6611f02a83`; base `main`; merged 2026-09-27T21:51:23Z |
| Scope | Historical main merge and the exact main branch gate |
| Observation | PR state `MERGED`; Build and Test `36353238808` success |
| Proof | GitHub PR #140 and main CI run `36353238808` |
| Review | Phase 1 review completed; see [05-findings.md](05-findings.md) (RV-001–RV-005) |
| Cleanup | n/a — historical read-only review; no runner or owned resources |
| Consequence | 7.1.4 may close; no residual |

### Task 7.1.5 — manual Release dispatch on main

| Field | Evidence |
| --- | --- |
| Obligation | Authorized manual Release dispatch on `main` |
| Source identity | Main dispatch `36353633426` on `0c820650` (two attempts: attempt 1 published, attempt 2 retried); develop-dispatched `36357391953` on `bfaf61db`; later main no-op `36382460551` on `f30986bd`; tag `v1.11.0` = `f30986bd` |
| Scope | Exact historical release chronology, both attempts, and AR-14 operational equivalence |
| Observation | Main run `36353633426` had two attempts. Attempt 1 (2026-09-27T21:58:35Z–22:06:29Z) published all three npm packages with provenance, then failed at “Verify published packages” because the registry had not settled; tag, GitHub Release, Docker dispatch and develop sync were skipped. Attempt 2 (22:28:07Z–22:36:10Z) skipped publish and failed the same verification; its failure was a repack-integrity mismatch rather than registry lag (`release-verify-resilience` T-03.5). Develop-dispatched run `36357391953` (23:03:31Z) succeeded: bump, detect completed release, pack, check published, publish skipped because already published, verify published packages, push tag, create GitHub Release, dispatch Docker and sync develop. The workflow checks out `ref: main`. Later main run `36382460551` succeeded as an idempotent no-op. |
| Proof | GitHub Actions run/attempt records above; PR #140; `release.yml:37-41` |
| Review | User approved AR-14 in preflight PF-004; Phase 1 RV-001 corrected the publish chronology. 7.1.5 closes on the recorded equivalence. |
| Cleanup | n/a — historical read-only review; no runner or owned resources |
| Consequence | 7.1.5 may close under AR-14; the failed main attempt is preserved and no replacement release is dispatched |

The failed main attempt is preserved, including the successful publish in attempt 1. The
develop-dispatched run verified the packages and completed the tag, GitHub Release, Docker dispatch
and develop sync. No replacement release is dispatched.

### Task 7.1.6 — verify published artifacts

| Field | Evidence |
| --- | --- |
| Obligation | npm packages with provenance, GitHub Release, Docker image and `develop` sync |
| Source identity | Version 1.11.0 at tag `f30986bd`; package publish times from the npm registry; Docker exact tag `1.11.0`; release run `36357391953`; cancelled Docker run `36357469306`; successful Docker run `36382704347` |
| Scope | Published artifacts only; no rebuild or re-release |
| Observation | `@portaidentity/server@1.11.0` published 2026-09-27T22:09:47Z; SDK 22:00:26Z; CLI 22:01:18Z. All three expose `dist.attestations.provenance.predicateType = https://slsa.dev/provenance/v1`. GitHub Release v1.11.0 published 2026-09-27T23:04:47Z. The release-dispatched Docker run `36357469306` on the same revision was cancelled; run `36382704347` re-dispatched the same revision and succeeded. Docker Hub exact tag `1.11.0` digest `sha256:35cab1cf232a2c640bbd9887377b20a6e3779c8fdab060a35613481405bf6779` (amd64 `sha256:cdbfc5e…`, arm64 `sha256:e30fe27…`), last updated 2026-09-28T05:44:02Z. The successful release run's “Sync develop” step succeeded, and `f30986bd` is an ancestor of `origin/develop`. |
| Proof | npm registry times/attestations; GitHub Release v1.11.0; Docker Hub tag record; runs `36357391953`/`36357469306`/`36382704347`; `git merge-base --is-ancestor f30986bd origin/develop` |
| Review | Phase 1 review completed; see [05-findings.md](05-findings.md) (RV-001–RV-005) |
| Cleanup | n/a — historical read-only review; no runner or owned resources |
| Consequence | 7.1.6 may close; the exact `1.11.0` tag preserves the release identity |

Floating Docker tags `1.11`, `1` and `latest` have since moved to later releases; the exact
`1.11.0` tag preserves this release identity.

Adjacent record: `_maintenance/plans/release-verify-resilience/99-execution-plan.md` T-03.5 still
names cancelled Docker run `36357469306` as the delivered dispatch. This closeout records both the
cancelled attempt and the successful same-revision re-dispatch `36382704347`; the adjacent completed
task is left unchanged under strict scope.

## Initial Stale-Status and Missing-Proof Findings

| Finding | Evidence | Disposition |
| --- | --- | --- |
| Automated-release header says 8/11 while the parser sees 9 verified tasks; 4.1.1/4.1.2 are open despite proved merges | Source plan header and lines 101–102; evidence above | Correct in 1.2.1 |
| Deferred plan is 65/68 with 7.1.4–7.1.6 open; index says `Status: Planning Complete` | Source plan header/index; evidence above | Correct in 1.2.2 |
| Portfolio says user-invitations “gated release pending” although v1.11.0 was published | `codeops/00-roadmap.md` row | Correct in 1.2.3 |
| T-06 says “not released” although PR #206 (`43cdddc2`) is an ancestor of v1.15.0 | Maintenance roadmap and `compare 43cdddc2...v1.15.0` | Correct in 1.2.3 |
| pnpm owner retains bare `assurance:compat` lines and stale remote/drift notes | pnpm plan lines 192/195/255 and 214/235 | Correct in 3.3.3/4.2.3 |
| Tenant roadmap `0/1` conflicts with engine-computed `0/0` | Tenant roadmap; sync `--check` output | Apply the chosen counter rule in Phase 2/5 |
| No selected historical task has a missing proof at this point, except the literal 7.1.5 dispatch nuance | Evidence above | 7.1.5 uses AR-14; others proceed to source-record correction |

No fabricated code-test red was produced. This task is artifact validation and historical evidence
collection.

## Phase 1 Review

An independent review rechecked every merge, run, release, registry, image and ancestry claim, the
task arithmetic, links and the phase diff. It verified the closure arithmetic and found one major
evidence correction plus three minor gaps and one roadmap-scope observation. All are fixed; no task
verdict changed.

| ID | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| RV-001 | MAJOR | The failed main Release run had two attempts; attempt 1 actually published the packages, contrary to the first evidence text. | Corrected the chronology; AR-14 closure retained by user ruling; failed attempts preserved |
| RV-002 | MINOR | The cancelled Docker Release attempt `36357469306` was omitted. | Added to the 7.1.6 chronology and proof |
| RV-003 | MINOR | Task 4.1.2's “workflow present” clause was not evidenced. | Added the `fb11f971` workflow/trigger observation |
| RV-004 | MINOR | The evidence tables omitted the `Cleanup` and `Consequence` contract fields. | Added both to every per-task table |
| RV-005 | OBSERVATION | The feature notes read as a feature-wide exclusion of revocation beside completed T-03. | Scoped the sentence to the deferred-creation plan |
| RV-006 | MINOR | PF-004's problem statement still said the main dispatch failed before publication. | Corrected to the two-attempt chronology |
| RV-007 | MINOR | The new findings ledger was not linked from the index or evidence. | Added the index row and Markdown links |
| RV-008 | OBSERVATION | Attempt 2's failure cause was unstated and could be misread as registry lag. | Recorded the repack-integrity cause |
| RV-009 | OBSERVATION | An adjacent completed plan still names the cancelled Docker run as delivered. | Recorded the discrepancy here; left the adjacent task unchanged under strict scope |

The source-record corrections are accepted. The Phase 1 review did not broaden any original-task
claim, and no failed attempt was removed. The detailed ruling ledger is [05-findings.md](05-findings.md).

## Phase 1 Checkpoint

- `pnpm test:changed` passed on 2026-11-01; structure and the affected workspace selection completed.
- Document checklist: 12 plan documents; all relative links resolve; AR-1–15 references are valid;
  local ST-1–19 and repository ST-42–73 are distinct; 42 unique tasks with phase totals
  7/6/11/6/5/7; the plan helper reports no structural problem; the roadmap sync shows only the
  expected tenant counter drift.
- Phase 1 changed documentation and evidence only; no product source, workflow, credential or
  generated artifact is part of the checkpoint.

## Phase 2 — Tenant and Assurance Evidence

### Tenant task 5.1.3

| Field | Frozen obligation / evidence |
| --- | --- |
| Obligation | Run the existing `pnpm assurance:harness --project security --profile production-security`; record run ID, observer IDs, exit, the exact `password-reset-throttled-request` case and its required normalized `delivered-authentication-artifact-rejection` event; compare the applicable observer/case set with the accepted incomplete-observer baseline; require no new gap or failed assertion; never call the run fully passed. |
| Original failure | Retained runs `31bfd677-43b9-4e95-b9ba-e76d8d4b09b6` and `e99a0d4c-bc51-4a69-a8fe-5a0c1a9d3eb7` failed the tenant gate because `password-reset-throttled-request` lacked the normalized rejection event. |
| Aggregate-only evidence | Later run `1908ceb0-ab5f-456d-b97a-73b4ad891865` exited 0 with production exposure 11/11, but an aggregate pass does not prove the missing case-level observation. |
| Current requirement | Fresh clean-checkpoint production-security run with exact case/observer proof. If the case still fails or an observer disappears, keep 5.1.3 blocked and apply the bounded-repair procedure. |
| Acceptance | ST-4 rejects aggregate-only closure; ST-5 permits closure only with the exact case, required rejection observation, controls and applicable observer set; ST-6 rejects missing probes or unexplained observer changes. |

### Assurance umbrella mapping

| Original task | Original obligation | Successor evidence | M2 / residual | Candidate disposition |
| --- | --- | --- | --- | --- |
| 8.4 | DEF-23 timing enumeration hypothesis, effect-size bound, sample-size/power rule, environment/noise contract | None; no approved statistical authority | DEF-23 remains user-owned | **Remains blocked**; do not collect timing samples or infer a threshold |
| 8.7c | DEF-8 transient MailHog acquisition and exact sequential-use journeys for magic link, password reset and invitation: recipient/tenant, lifetime, second-use, protected-state nonmutation, exposure redaction | `def-8-sequential-use-evidence` 23/23; `st46-delivered-artifact-correction` 17/17; production-security run `14c4cf25-df3c-464f-8400-fe78241bd295` exit 0 (production-exposure 11/0/0/0; functional 7/0; second-factor 4/0; tenant-admin 17/0; recovery 5/0) with ST-46 passing | No M2 dependency in ST-46; AR-29/AR-30 corrections recorded | **Eligible to close** in 2.2.2 after review |
| 9.6b | DEF-13 transport-level malformed headers and parser/Zod 400/413 cases need one correlated log/completion observation; raw cases retain no log credit | `def-13-live-boundary` 15/15; P1 live suite passes 15 raw + 18 admin cases; raw adapter correlates a decision or completion record by request ID and projects every required log field (`test-harness/assurance/p1/live-adapter.ts:222-257,276-311,470-488`); run `729dfdb8-88b5-48c2-808b-b7da6ebfcc67` P1 1/1, production-exposure passed=3 incomplete=3 exit 40 | M2 (control `requiredObservations`/`reachabilityObservations`) remains an oracle-level gap (`def-13-live-boundary/phase-4-review.md:30,62`). The production-exposure `correlatedLogCredit` field remains false (`production-exposure/evidence.ts:39`) and is **not** used as credit. | **Eligible to close only the log obligation**; keep M2 explicitly open |
| 9.6c | DEF-13 administrative permission denials need one correlated audit/structured log with correlation ID, actor, action, target digest and result | `def-13-admin-denial-digest` 5/5; focused unit spec 11/11; product emits the protected target digest; P1 admin lane observes 18 cases with required log fields; run `729dfdb8…` P1 1/1 | M2 is separate and remains open | **Eligible to close** in 2.2.2 after review |

### ST-4–8 check

| Case | Frozen expectation | Current assessment |
| --- | --- | --- |
| ST-4 | Aggregate tenant success without a retained case-level result does not close 5.1.3 | Applies; run `1908ceb0…` alone is insufficient |
| ST-5 | Exact tenant case, rejection observation, controls and unchanged/applicably approved case set may close after independent comparison | Awaiting fresh run |
| ST-6 | Missing probe, weakened assertion or unexplained observer disappearance rejects closure | Applies to the fresh-run comparison |
| ST-7 | Completed successor plus an original task with an unproved M2 control requirement stays incomplete; no blanket credit | 9.6b closes only its log obligation; M2 remains open; 8.4 stays blocked |
| ST-8 | Successful current checks do not close DEF-23 or a named campaign | DEF-23, DEF-3/6/22, DEF-5/11/17 and the consent follow-ups remain open |

### Frozen conclusion

At this point the tenant gate still requires a fresh exact run. The assurance umbrella has two
candidate closures (8.7c and 9.6c), one narrow closure (9.6b log obligation only), and one
unchanged blocker (8.4/DEF-23). M2 remains an oracle-level gap owned by the user; no successor
credit may be described as a full assurance pass.

### Tenant gate run `b89ea7a6`

| Field | Evidence |
| --- | --- |
| Obligation | Exact production-security proof for tenant task 5.1.3, including the normalized rejection observation for the previously blocked throttle case |
| Source identity | Clean checkpoint `052b1b76`; run `b89ea7a6-eb5d-4258-9763-ebcf35787edd`; profile `production-security` |
| Scope | Existing security harness; all live blocks, with exact case-level inspection of `magic-link-throttled-request` and `password-reset-throttled-request` |
| Observation | Production exposure passed 11/11, functional 7/7, second-factor 4/4, tenant/admin 17/17. Human-auth recovery passed 4/5. `magic-link-throttled-request` failed: the 429/throttle facts passed, but the normalized audit event was `undefined` instead of `delivered-authentication-artifact-rejection`. `password-reset-throttled-request` passed. Harness exit was 21 (test failure), not the accepted exit-40 incomplete-observer path. |
| Proof | Run log `/tmp/opencode/assurance-tenant-20261101-094841.log`; run artifact `test-harness/.assurance-results/b89ea7a6-eb5d-4258-9763-ebcf35787edd/production-exposure/production-security/observation.json`; TAP failure at `human-auth-recovery.spec.test.ts:104` |
| Root cause | Both rate-limit routes call the asynchronous `writeAuditLog` without awaiting it (`packages/server/src/routes/interactions.ts:1031`, `packages/server/src/routes/password-reset.ts:325`). The 429 response can therefore be observed before the audit insert completes; the live observer queries immediately. The password-reset case passed by timing, which is not a stable contract. This is a real audit-visibility defect, not a reason to weaken the immutable assertion. |
| Cleanup | The runner cleaned its owned stack; no containers or networks matching run `b89ea7a6` remain. Pre-existing unrelated containers were left untouched. |
| Review | Repair tasks 2.1.3/2.1.4 inserted; independent Phase 2 review remains 2.3.1 |
| Consequence | 2.1.2 remains `[~]` until the repair green run proves both throttle cases and the applicable observer set |

Repair checkpoint: both routes now await `writeAuditLog` before rendering the 429. Focused route
suites passed 58/58, server typecheck and lint passed, and structure passed. The live green run is
recorded under 2.1.4.

### Tenant follow-up run `26887eb3`

| Field | Evidence |
| --- | --- |
| Obligation | Same exact tenant gate after the rate-limit audit-write repair |
| Source identity | Clean checkpoint `97e372d6`; run `26887eb3-81e0-4fd0-acf8-106c8b13e813`; profile `production-security` |
| Scope | Exact production-security harness with the full human-auth recovery block |
| Observation | Production exposure 11/11, functional 7/7, second-factor 4/4, tenant/admin 17/17. Human-auth recovery 4/5. The failure moved to `password-reset-wrong-tenant`: the required `delivered-authentication-artifact-rejection` event was `undefined`. The prior run `b89ea7a6` failed at `magic-link-throttled-request` instead. |
| Proof | Run log `/tmp/opencode/assurance-tenant-20261101-101619.log`; run artifact `test-harness/.assurance-results/26887eb3-81e0-4fd0-acf8-106c8b13e813/production-exposure/production-security/observation.json`; TAP failure at `human-auth-recovery.spec.test.ts:104` |
| Diagnosis | The common defect is not one route: the adapter queries the audit API once immediately, while the product writes audit events asynchronously across several routes (`packages/server/src/routes/password-reset.ts:422,505`, `packages/server/src/routes/magic-link.ts:257`, and others). A different probe fails on each run. The immutable assertion must stay; the observer needs bounded polling, matching the existing mail observer. The two awaited rate-limit writes remain valid hardening. |
| Cleanup | No containers or networks matching run `26887eb3` remain; unrelated pre-existing containers were untouched. |
| Consequence | 2.1.2 stays `[~]`; 2.1.4 now repairs the observer and reruns the exact harness |

Observer repair checkpoint: `observeRejectionAudit` now polls the audit API for up to 20 seconds at
250 ms intervals. The immutable event/field assertions are unchanged. Assurance typecheck, harness
lint, `human-auth-recovery-specs` (4 pass, 1 live skip) and structure passed. The live green run is
pending.
