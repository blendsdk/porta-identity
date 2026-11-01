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
| 8.7c | DEF-8 transient MailHog acquisition and exact sequential-use journeys for magic link, password reset and invitation: recipient/tenant, lifetime, second-use, protected-state nonmutation, exposure redaction | `def-8-sequential-use-evidence` 23/23; `st46-delivered-artifact-correction` 17/17; production-security run `14c4cf25-df3c-464f-8400-fe78241bd295` exit 0 (production-exposure 11/0/0/0; functional 7/0; second-factor 4/0; tenant-admin 17/0; recovery 5/0) with ST-46 passing | No M2 dependency in ST-46; successor-plan ambiguity decisions 29/30 corrected | **Closed** in 2.2.2 |
| 9.6b | DEF-13 transport-level malformed headers and parser/Zod 400/413 cases need one correlated log/completion observation; raw cases retain no log credit | `def-13-live-boundary` 15/15; P1 live suite passes 15 raw + 18 admin cases; raw adapter correlates a decision or completion record by request ID and projects every required log field (`test-harness/assurance/p1/live-adapter.ts:222-257,276-311,470-488`); run `729dfdb8-88b5-48c2-808b-b7da6ebfcc67` P1 1/1, production-exposure passed=3 incomplete=3 exit 40 | M2 (control `requiredObservations`/`reachabilityObservations`) remains an oracle-level gap (`def-13-live-boundary/phase-4-review.md:30,62`). The production-exposure `correlatedLogCredit` field remains false (`production-exposure/evidence.ts:39`) and is **not** used as credit. | **Closed narrow** in 2.2.2; only the log obligation |
| 9.6c | DEF-13 administrative permission denials need one correlated audit/structured log with correlation ID, actor, action, target digest and result | `def-13-admin-denial-digest` 5/5; focused unit spec 11/11; product emits the protected target digest; P1 admin lane observes 18 cases with required log fields; run `729dfdb8…` P1 1/1 | M2 is separate and remains open | **Closed** in 2.2.2 |

### Assurance closure record

- **8.7c closed**: successor `def-8` plus `st46` correction, production-security run `14c4cf25` exit 0 with ST-46 passing.
- **9.6b closed narrow**: P1 raw lane proves correlated log/completion observation for the 15 raw cases; run `729dfdb8`; only the log obligation is credited. M2 stays open and `correlatedLogCredit` remains false.
- **9.6c closed**: administrative denial digest product event plus P1 admin lane log fields; run `729dfdb8`; M2 stays separate.
- **8.4 remains blocked**: DEF-23 has no approved timing hypothesis/effect-size/power/noise contract. Do not collect samples or infer a threshold.
- **M2 remains open**: control `requiredObservations`/`reachabilityObservations` are still unasserted at the oracle. No control-observation credit is transferred.
- **Legacy helper note**: the test-assurance plan uses two-part/letter-suffixed task IDs (`8.4`, `8.7c`, `9.6b`, `9.6c`), so the installed plan helper reports zero tasks. The manual count is 122/123 with exactly one `[!]` (8.4); do not rewrite IDs or invent a parser.

### ST-4–8 pre-run snapshot

| Case | Frozen expectation | Assessment at this snapshot |
| --- | --- | --- |
| ST-4 | Aggregate tenant success without a retained case-level result does not close 5.1.3 | Satisfied: aggregate-only evidence was rejected and a fresh exact run was used |
| ST-5 | Exact tenant case, rejection observation, controls and unchanged/applicably approved case set may close after independent comparison | Satisfied by `069b36ff` (see final disposition below) |
| ST-6 | Missing probe, weakened assertion or unexplained observer disappearance rejects closure | Satisfied: identical case sets across red/green runs; no missing probe, weakened assertion or observer disappearance |
| ST-7 | Completed successor plus an original task with an unproved M2 control requirement stays incomplete; no blanket credit | 9.6b closes only its log obligation; M2 remains open; 8.4 stays blocked |
| ST-8 | Successful current checks do not close DEF-23 or a named campaign | DEF-23, DEF-3/6/22, DEF-5/11/17 and the consent follow-ups remain open |

### Pre-run conclusion (superseded)

At this snapshot the tenant gate still required a fresh exact run. The assurance umbrella had two
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

### Tenant green run `069b36ff`

| Field | Evidence |
| --- | --- |
| Obligation | Exact current production-security proof for tenant task 5.1.3 |
| Source identity | Clean checkpoint `7f0ba27d`; run `069b36ff-c09e-47a3-b48a-af445540b8ee`; profile `production-security` |
| Scope | Full security harness: production exposure, functional, second-factor, tenant/admin and the ST-46 delivered-artifact block |
| Observer/case set | 11 production-exposure cases: `st53-untrusted-forwarded-host`, `st53-untrusted-forwarded-proto`, `st53-untrusted-forwarded-client-ip`, `st55-unconfigured-cors-origin`, `st55-unconfigured-cors-method-and-header`, `st55-production-response-policy`, `st55-production-html-csp-policy`, `st55-production-session-cookie-policy`, `st56-production-security-database-error-exposure`, `st56-production-security-cache-error-exposure`, `st56-production-security-mail-error-exposure`; 17 tenant/admin observers; the 5/5 ST-46 recovery specification covering the 18-step (6 controls + 12 probes) delivered-artifact case |
| Observation | Exit 0. Production exposure passed 11, product failures 0, incomplete 0, execution failures 0. Functional 7/7, second-factor 4/4, tenant/admin 17/17, human-auth recovery 5/5. The ST-46 live specification passed every probe, including `magic-link-throttled-request`, `password-reset-throttled-request` and `password-reset-wrong-tenant`; each required `delivered-authentication-artifact-rejection`. No case was missing and no assertion failed. |
| Proof | Run log `/tmp/opencode/assurance-tenant-20261101-104136.log`; run artifact `test-harness/.assurance-results/069b36ff-c09e-47a3-b48a-af445540b8ee/production-exposure/production-security/observation.json`; TAP `ok 5 - executes the delivered-artifact case...`, tests 5, pass 5, fail 0 |
| Baseline comparison | Original failures `31bfd677` and `e99a0d4c` failed `password-reset-throttled-request`; current follow-up failures `b89ea7a6` and `26887eb3` are preserved. All 11 production-exposure case IDs are identical across `c9716d5b`, `ec140d4f`, `bb4eb111`, `b89ea7a6`, `26887eb3`, `069b36ff` and `14c4cf25`. The three `st53-untrusted-forwarded-*` cases no longer report unobserved state/prohibited effects (DEF-14 origin/cookie policy and DEF-25 rate-limit identity), which is why the exit changed from the old expected 40 to 0. The case set was not reduced. |
| Cleanup | No containers or networks matching run `069b36ff` remain. The two run images created today (`porta-069b36ff…-porta` and `porta-26887eb3…-porta`) were removed; older run images from earlier sessions were left untouched. The run directory is retained for the Phase 2 review and removed at the 2.3.2 checkpoint. |
| Review | Independent Phase 2 review completed; see `05-findings.md` (RV-011–RV-018) |
| Consequence | 5.1.3 may close after 2.2.1 and review; the run is not described as a full security certification |

**Final ST-4–8 disposition (after `069b36ff`):**

- ST-4 satisfied: aggregate-only evidence was rejected; the fresh exact run supplies the case-level proof.
- ST-5 satisfied: `069b36ff` includes the exact `password-reset-throttled-request`, `magic-link-throttled-request` and wrong-tenant probes with the required rejection event, the unchanged 11-case production-exposure set, 17 tenant/admin observers and 5/5 ST-46 recovery; cleanup passed and no assertion failed.
- ST-6 satisfied: the case set is identical across the red/green runs; no probe was removed, no assertion weakened and no observer disappeared.
- ST-7 satisfied narrowly: 9.6b closes only its log obligation; M2 remains open; 8.4/DEF-23 stays blocked.
- ST-8 satisfied: DEF-23, DEF-3/6/22, DEF-5/11/17 and the consent follow-ups remain open with their owners.

## Phase 2 Checkpoint

- `pnpm test:changed` passed; focused route tests 60/60, server typecheck/lint, assurance
  typecheck/lint, `human-auth-recovery-specs` (4 pass, 1 live skip) and structure passed.
- Document validation: 44 unique tasks with phase totals 7/8/11/6/5/7; links resolve; AR and ST
  references are valid; the legacy test-assurance helper zero-task result is recorded, not fixed
  by rewriting IDs.
- Cleanup: run directories `069b36ff`, `26887eb3` and `b89ea7a6` were removed; no containers,
  networks or volumes remain for those run IDs. The two images created at 10:16
  (`porta-069b36ff…`, `porta-26887eb3…`) were removed; older run images were left untouched.
  The green run log is retained under `/tmp/opencode` for the final handoff and will be removed at
  session cleanup after its sanitized facts are recorded here.
- Docker cleanup did not touch pre-existing unrelated stacks or the older tenant-run images.

## Phase 3 — pnpm Compatibility, Coverage and Baseline

### Frozen acceptance cases

| Case | Frozen expectation |
| --- | --- |
| ST-9 | Protocol/operational coverage cannot substitute for the security ratchet baseline; a security/production-security capture with `coverage-baseline` is required. |
| ST-10 | Any old/current baseline input or count difference is recorded and fails the current-input gate until an approved proposal exists; no silent regeneration. |
| ST-11 | Approved baseline JSON and reviewed fixture must match the capture identities; enforcement stays `local-observation-only` and both promotion flags remain false. |
| ST-12 | The bare compatibility command or only the foundation selector is insufficient; all five approved selectors must run, each with package/source/image/fixture/cleanup proof. |

### Monitored inputs and selectors

| Item | Frozen value / command |
| --- | --- |
| Baseline source | `ratchet-baselines.json` references sourceRevision `16dae6b8412577a1c98e3f1f2ae07e20a69eee95` and run `53ff6f24-219a-485b-a87f-93343612aa91`; the reviewed fixture carries the same counts/paths |
| Monitored inputs | `requirement-r5` = `codeops/features/test-assurance/requirements/RD-05-security-risk-slice-assurance.md`; `fixture`; `dependency` = `pnpm-lock.yaml`; `sentinel` |
| Current staleness | `requirement-r5`, `fixture` and `dependency` differ from the reviewed fixture; `sentinel` matches. No expectation was changed before the capture. |
| Compatibility selectors | `compatibility`, `tenant-admin`, `admin-data`, `p1-admin`, `protocol`, each via `pnpm assurance:compat --select <selector>` from a clean checkpoint |
| Compatibility environment | Isolated `HOME=/tmp/opencode/compat-home`; the real `~/.porta/credentials.json` is never read. The runner's caller-credential fingerprint checks the isolated home, and all CLI homes remain under the run-owned consumer path. |
| Coverage captures | `pnpm assurance:coverage --project protocol --profile operational --seed coverage-baseline` and `pnpm assurance:coverage --project security --profile production-security --seed coverage-baseline` |
| Baseline admission | Security capture only; `local-observation-only`; `promotionAuthorized: false` in both coverage and review records |

All expectations above are frozen for Phase 3; only the exact approved values may change in 3.2.5.

### 3.1.2 Old-baseline ratchet observation

| Field | Evidence |
| --- | --- |
| Command | `pnpm assurance:test --select assurance-ratchets` on clean checkpoint `c611a77d` |
| Outcome | Exit 21; 10 tests, 8 passed, 2 failed |
| Digest failure | `requirement-r5`: expected `sha256:f17005ca28d271dbf6e14ff2b0a606fe06c7a5af654bc252c2a55b3f85ffc569`, actual `sha256:06c509c014c98fc03aba7ea38ef0db42ea886267a959657d977a4ca18fb2ef18` |
| Staleness failure | `changedInputs: ['requirement-r5','fixture','dependency']`; `reportAllowed: false`; 80 stale claims; `sentinel` is current |
| Interpretation | This is the expected stale-input red, not a product regression. No expectation was edited. The baseline/fixture proposal and value-specific approval are 3.2.4/3.2.5 work. |
| Proof | `/tmp/opencode/verify-3.1.2-ratchets.log`, TAP tests 2 and 3 |
### 3.2.1 Compatibility matrix

All runs used clean source revision `e78f6bc2e97a603b955527b567c2c5d6a637cda6`, fixture
`sha256:650429e5d28dad73b5ff12ca767fab378678e1ea82fca76aeea04a10b6b219da`, and the same
packed SDK/CLI archives (`adf5876a…` and `ac227222…`).

| Selector | Result run | Node | Server image digest | Cleanup / residue |
| --- | --- | --- | --- | --- |
| `compatibility` | `2dbdf711-8a6d-4714-bfae-5faf29836814` | v22.23.1 | `sha256:a4638676e9e7f6eb5dcdbcd9b6d3edf05886889f6e90bff7eaec6e8392e950d7` | `ownedConsumerResidue: []`; primary tree unchanged |
| `tenant-admin` | `abf11a16-468f-4977-872a-ef241aafd3f1` | v22.23.1 | `sha256:b46941aa08e21860c76e9c8003108b406fe01bcdd7504d260bfea88f09f98200` | `ownedConsumerResidue: []`; primary tree unchanged |
| `admin-data` | `d5b39ef9-b631-4e7c-9334-2277533e9d60` | v22.23.1 | `sha256:8ca8e05d833f465c72b0c0d25a406f035f694a7460d69f745084767e94e32ec2` | Cleanup success; temporary homes removed, credentials unchanged, residue `[]` |
| `p1-admin` | `b6de7aec-ac3c-4df7-a8e5-62a75e7ddc20` | v24.20.0 | `sha256:71891ec470f15a98dd95849add7c9b07b5a0c90c44b4e2f2cfababbaa54297e0` | Cleanup success; six journeys passed; residue `[]` |
| `protocol` | `8b3ae45e-347d-41ed-9da4-bb790e4a666e` | v24.20.0 | `sha256:a6a4b80773596e6ef20835d31fde196d407232dd71358884b2afc0e52676501c` | `ownedConsumerResidue: []`; primary tree unchanged |

Failures preserved:

- `p1-admin` runs `7d07bdba-c6b3-43b8-83fa-7fd6183ce244` and
  `15a06ba0-8bcf-43e8-bab4-6fe5fc5ca17f` on Node v22.23.1 exited 30 at the `surfaces` stage. Its
  evidence schema requires Node `v24`; the Node v24 retry `b6de7aec` passed. This is a runtime
  requirement, not a product failure.
- `protocol` run `1eeccd21-9c32-4c89-9c26-d096552a8654` on Node v24.20.0 exited 30 at
  `protocol-cli-browser` because the isolated HOME hid Playwright's browser cache. The retry with
  `PLAYWRIGHT_BROWSERS_PATH=/home/gevik/.cache/ms-playwright` and the same isolated HOME passed
  (`8b3ae45e`). No credential file was read.

Runtime note: the matrix used Node v22.23.1 for the three non-P1 selectors and Node v24.20.0 for
`p1-admin` and `protocol`; the latter is the active verification runtime and the P1 schema requires
it. All five selectors are proved; no selector was skipped or replaced by the foundation alone.

Cleanup: all eight run-scoped images (five passing and three failed/retried harness runs) were
removed after the evidence was recorded; no containers, networks or volumes remain for those run
IDs. The small result JSON directories are retained for the Phase 3 review and removed at 3.3.3.

### 3.2.2 Protocol/operational coverage

| Field | Evidence |
| --- | --- |
| Command | `pnpm assurance:coverage --project protocol --profile operational --seed coverage-baseline` |
| Run | `31c42876-d9fa-4427-9584-8f34cc7303a0`; clean source revision `61cc3da92edecc541f2c74d94cf47f7658bf1779`; Node v22.23.2 |
| Source/dependency identity | sourceTreeDigest `sha256:c41423d912864196dc6d8ce65295fc9380bc5e39ddea77a969e12c50b1a2d44b`; dependencyLockDigest `sha256:b4518f55e60342105afc3145caecace0b89e04995aaf4d5eb1a4fb6c1cf97fe9`; image `sha256:01a5a7976b1a6ce93c7cc25c0bf9bd0dcd299b2c1bbfb94dcb0c4ecf258351e1`; fixture `sha256:14ffd80f869e135635f838a7d64f7035c07906fc0858f769cb927fdcb277f17f` |
| Inventory/flush | 276 runtime dependencies; `flushStatus: complete`; one raw file; compiled output digest `sha256:82f6cef6…` |
| Source mapping/report | 188 normalized paths; 0 unmapped; 0 collection failures; HTML and JSON produced; merger `@bcoe/v8-coverage`; totals: statements 1,276/9,613, branches 214/5,179, functions 186/1,550, lines 1,257/9,034 |
| Cleanup | The run-scoped image was removed; no containers, networks or volumes remain for the run IDs. The capture/report directory is retained for the security comparison and removed at 3.3.3. |
| Interpretation | This is the protocol/operational dependency and source-mapping proof. It is **not** the security ratchet baseline (ST-9); the separate security capture is 3.2.3. |

### 3.2.3 Security/production-security coverage

| Field | Evidence |
| --- | --- |
| Command | `pnpm assurance:coverage --project security --profile production-security --seed coverage-baseline` |
| Run | `83acea43-3440-48c9-80da-5114767148a3`; clean source revision `604c2a0fdd9d62a6fbfb8dd5a78ee168a82e9da7`; Node v22.23.2 |
| Source/dependency identity | sourceTreeDigest `sha256:9736483dd46de578726f31163e9a5f844caac2420f23d06bc7cbbda9aac580c3`; dependencyLockDigest `sha256:b4518f55e60342105afc3145caecace0b89e04995aaf4d5eb1a4fb6c1cf97fe9`; image `sha256:9431eaa786cd7eb47db099c72cb056b1605b46cc3d1bdce413f93cf3b8eef889`; fixture `sha256:01777da74d34e6248b13ac857d531186f1144c265b182f12eb25f8adba2b5147` |
| Inventory/flush | 276 runtime dependencies; `flushStatus: complete`; one raw file |
| Paths/report | 188 normalized paths; 0 unmapped; 0 collection failures; report observation `coverage-observation.json`; summary digest `sha256:b3d31684ee9a79fc357ae52895e33cfc26c2b911f5d4a745b20a047c396ab10b`; normalized-path digest `sha256:86a8366b408dfaca021a8b190d2c2b148114b6d5ab1efe8ae5a014036586df94` |
| Current counts | statements 2,114/9,613; branches 691/5,179; functions 363/1,550; lines 2,074/9,034 |
| Reviewed baseline counts | statements 1,838/7,630; branches 580/3,919; functions 317/1,177; lines 1,806/7,296; paths 150; digest `sha256:fd7fc28f…`; sourceRevision `16dae6b8…`; run `53ff6f24…` |
| Difference | Covered counts increased by +276 statements, +111 branches, +46 functions and +268 lines. Totals increased by +1,983 / +1,260 / +373 / +1,738, so percentage coverage is lower (statements 24.1% → 22.0%) despite more absolute coverage. Paths increased 150 → 188. The old capture directory is absent, so a path-by-path removal comparison is unavailable; the increased count and zero unmapped paths show no evidence of removed source coverage. |
| Monitored inputs | `requirement-r5` now `sha256:06c509c014c98fc03aba7ea38ef0db42ea886267a959657d977a4ca18fb2ef18` (baseline `f17005ca…`); `fixture` now `sha256:3524d67b9c53cbe6a4599fc31994808ae3098b9a9fe7ac00d69dfde78a06cbf0` (baseline `08c5e963…`); `dependency` now `sha256:c12dad3a036533a76cd63de08c41906a12952b5f10b1b91123ef1a54e1e05d6e` (baseline `cee6c411…`); `sentinel` unchanged `sha256:6726cac4bad02ab2849ef4487e241b52ff11f84c14d237f632e5c07a3894d74c` |
| Cleanup | The run-scoped image was removed; no containers, networks or volumes remain. The capture/report directory is retained for the 3.2.4 proposal and removed at 3.3.3. |
| Interpretation | The security capture is the only admissible ratchet input. No baseline or reviewed fixture value was changed in this task; the exact proposal and user approval are 3.2.4/3.2.5. |

### 3.2.4 Baseline/fixture proposal (pending approval)

No file has been changed yet. The exact proposed values are:

| Field | Reviewed baseline | Current security capture |
| --- | --- | --- |
| `sourceRevision` | `16dae6b8412577a1c98e3f1f2ae07e20a69eee95` | `604c2a0fdd9d62a6fbfb8dd5a78ee168a82e9da7` |
| `sourceRunId` | `53ff6f24-219a-485b-a87f-93343612aa91` | `83acea43-3440-48c9-80da-5114767148a3` |
| `summaryDigest` | `sha256:7b48038ecc8ce95ecb59770f6dcbc1fadfda1461c99b641a07a3a2fd218c66a9` | `sha256:b3d31684ee9a79fc357ae52895e33cfc26c2b911f5d4a745b20a047c396ab10b` |
| `normalizedPathCount` | 150 | 188 |
| `normalizedPathDigest` | `sha256:fd7fc28f6149f51ca71b8ca6266dc140706bf2c225b877aa40252ed3b0a94e63` | `sha256:86a8366b408dfaca021a8b190d2c2b148114b6d5ab1efe8ae5a014036586df94` |
| statements | 1,838 / 7,630 | 2,114 / 9,613 |
| branches | 580 / 3,919 | 691 / 5,179 |
| functions | 317 / 1,177 | 363 / 1,550 |
| lines | 1,806 / 7,296 | 2,074 / 9,034 |
| enforcement | `local-observation-only` | `local-observation-only` (unchanged) |
| `promotionAuthorized` | `false` | `false` (unchanged) |

Proposed review metadata:

- `reviewId`: `local-observation-baseline-closeout-2026-11-01`
- `reviewedAt`: `2026-11-01T13:23:05+01:00`
- `reviewedBy`: `authorized-closeout-execution`
- `reason`: refresh the reviewed local security coverage observation after the pnpm migration, the
  RD-05 R5 requirement/content refresh, and current source expansion; covered counts increased,
  totals expanded, no promotion.
- `sourceArtifact`: `test-harness/.assurance-results/83acea43-3440-48c9-80da-5114767148a3/coverage/security/production-security/report/coverage-summary.json`
- `promotionAuthorized`: `false`

Proposed monitored-input digests:

| Input | Current reviewed value | Proposed value |
| --- | --- | --- |
| `requirement-r5` | `sha256:f17005ca…` | `sha256:06c509c014c98fc03aba7ea38ef0db42ea886267a959657d977a4ca18fb2ef18` |
| `fixture` | `sha256:08c5e963…` | `sha256:3524d67b9c53cbe6a4599fc31994808ae3098b9a9fe7ac00d69dfde78a06cbf0` |
| `dependency` | `sha256:cee6c411…` | `sha256:c12dad3a036533a76cd63de08c41906a12952b5f10b1b91123ef1a54e1e05d6e` |
| `sentinel` | `sha256:6726cac4…` | unchanged `sha256:6726cac4bad02ab2849ef4487e241b52ff11f84c14d237f632e5c07a3894d74c` |

The proposal updates both `ratchet-baselines.json` and `reviewedCoverageBaseline` /
`reviewedStalenessDigests` in `assurance-ratchets-requirements.ts` with identical values. It does not
change the monitored path lists, enforcement, promotion flags or CI policy.

Digest formulas:

- `summaryDigest` = SHA-256 over the exact bytes of
  `.../coverage/security/production-security/report/coverage-observation.json`.
- `normalizedPathDigest` = SHA-256 over `porta-assurance-normalized-paths-v1\0`, followed by each
  canonical, strictly ordered normalized path and a `\0` separator.

The absolute covered counts are higher for every metric. The percentage is lower because the total
instrumented surface grew faster: statements 24.1% → 22.0%, branches 14.8% → 13.3%, functions
26.9% → 23.4%, lines 24.8% → 23.0%. The reviewed baseline is a floor on covered counts; the proposal
raises that floor. The old capture directory is absent, so a path-by-path removal list cannot be
produced; the count rose 150 → 188 and all 188 paths map, so there is no evidence of removed
coverage.

Status: **approved by the user on 2026-11-01 13:23** after independent review approved the exact
values. The reviewer recomputed all digests/counts, found no lowered covered floor or hidden path
change, and identified only the two documentation clarifications above (now applied). The user
approved applying the same values to both `ratchet-baselines.json` and the reviewed fixture, with
`local-observation-only` and both promotion flags false. No file was changed before this approval.

Applied in 3.2.5: both files now hold exactly these values; the JSON/fixture coverage blocks and all
four monitored digests compare equal, and `pnpm assurance:test --select assurance-ratchets` passes
10/10.

### 3.3.1 Post-baseline checks

| Check | Result |
| --- | --- |
| Ratchet selector | 10/10 passed after the applied values (3.2.6) |
| Coverage pipeline, first run | 34/35 passed; `coverage-flush-container.impl.test.ts` hit a Docker start/stop timing deadline (`RuntimeTimeoutError`) instead of the expected non-clean-exit error |
| Isolated flush test | 1/1 passed in 0.5s |
| Coverage pipeline, retry | 35/35 passed; the first failure is preserved and classified as host timing, not a source regression |
| Assurance typecheck/lint | Passed |
| Structure | Passed |
| Applied-baseline review | Independent reviewer confirmed `APPLIED MATCHES APPROVED`; no extra value, path, enforcement or policy change |

### 3.3.2 Clean validation

| Field | Evidence |
| --- | --- |
| Clean checkpoint | `bc065c6b` (the `[~]` mark; baseline values in `25e08af8`) |
| Command | `pnpm assurance:validate` and `pnpm assurance:test --select assurance-ratchets` |
| Result | Validation run `6367accb-8d50-4edb-8c83-5afd7a69d1b0` exit 0; ratchet selector 10/10; worktree remained clean |
| Proof | `test-harness/.assurance-results/6367accb-8d50-4edb-8c83-5afd7a69d1b0/validation/result.json` and `manifest.json`; logs under `/tmp/opencode/verify-3.3.2-*.log` |
| Cleanup | Validation owns no services; its ignored run directory is removed at 3.3.3. No worktree change was made during validation. |

### 3.3.3 pnpm 4.6 closeout

- pnpm task 4.6 is marked complete: all five selectors, both coverage captures, the approved
  baseline refresh, `assurance:validate` run `6367accb` (exit 0) and the 10/10 ratchet suite passed.
  The owner plan header is 43/44; task 6.4 remains for Phase 4.
- The owner plan now names the selector matrix, records the resolved drift, and no longer claims a
  bare `assurance:compat` command. Lines 214/235 (6.4 remote gates) were left for Phase 4.
- Generated Phase 3 run directories were removed after their sanitized facts were recorded:
  compatibility results (five passing plus three failed/retried), protocol and security coverage,
  and the validation run. The baseline's `sourceArtifact` path now points to a removed generated
  artifact; its approved counts/digests are retained in this evidence document.
- No task-owned containers, networks, volumes or images remain for the Phase 3 run IDs. The
  coverage-pipeline timing failure is preserved in 3.3.1; the isolated and retry runs passed.
- The pnpm task is a legacy mini-plan with two-part task IDs and no `00-index.md`; the plan helper
  reports zero tasks. Manual verification is 43/44 with exactly one open task, 6.4, and no missing
  evidence for 4.6.

## Phase 4 — Remote Dependency and Cache Gates

### Frozen acceptance cases

| Case | Frozen expectation |
| --- | --- |
| ST-13 | Zero alerts with absent/stale/unverifiable current-lockfile ingestion is not success; the remote gate stays open. |
| ST-14 | Expected graph/lockfile identities, Dependabot processing, alert availability and actual cache restoration/reuse in both image scopes are required. |
| ST-15 | A fast build, cache export or warm package store without observed eligible layer import/reuse is not proof. |

### Known state before any change

| Item | Observed state |
| --- | --- |
| Dependabot alerts | Disabled: API returns 403 “Dependabot alerts are disabled for this repository” |
| Dependency graph | SBOM API returns 404; GraphQL `dependencyGraphManifests` count 0 |
| Dependabot updates | Version-update PRs exist: 84 target `main`, 1 targets `develop` |
| Harness cache | 874 GHA caches, zero keys matching `harness`; `porta-ci` keys exist; harness child output is buffered |
| Lockfile | pnpm 12 two-document `pnpm-lock.yaml`; current `packageManager` 12.15.0 |

### Authorized change set

- **AR-12:** enable the repository dependency graph and Dependabot alerts, then re-observe. Record
  the exact prior state and the settings change; no silent or unrelated security-setting change.
- **AR-13:** bounded repair of the existing harness cache/log path, with exact files named before
  editing. Exact files: `.github/workflows/build-and-test.yml`,
  `test-harness/fixtures/lifecycle-runtime-command.ts`, `test-harness/scripts/lifecycle.ts`,
  `test-harness/docker-compose.ci.yml`. No new workflow.
- Changes below were applied under these approvals; no product source changed.

### 4.2.1 AR-12 result

| Field | Evidence |
| --- | --- |
| Prior state | Dependabot alerts disabled (403); GraphQL `dependencyGraphManifests` 0; SBOM endpoint 404; 84 version-update PRs target `main`, 1 targets `develop` |
| Alerts change | `PUT /repos/blendsdk/porta-identity/vulnerability-alerts` → 204; `GET /dependabot/alerts` → 200 (0 open). `security_and_analysis.dependabot_security_updates` remains disabled; that separate feature was not authorized. |
| Graph observation | GraphQL now reports 9 dependency-graph manifests, including `pnpm-lock.yaml` with `parseable: true`; however, its dependencies are only `@pnpm/exe.android-arm64`, `@pnpm/exe.android-x64`, `@pnpm/exe.darwin-arm64`, `@pnpm/exe.darwin-x64`, `@pnpm/exe.freebsd-x64` — the pnpm **boot document**. The project dependency graph is absent. The REST SBOM endpoint remains 404. |
| Dependabot processing | Version-update PRs prove Dependabot parses package manifests; the `main`-targeting limitation remains: 84 base `main`, 1 base `develop`. |
| Conclusion | Alert availability is fixed, but project lockfile ingestion is not proved. pnpm 6.4 remains blocked on the two-document lockfile boot document. No dependency-policy change (pin pnpm 11 or `pmOnFail: ignore`) was made; that requires a separate ruling. |

### 4.2.2 Harness cache diagnosis and repair

- Successful OIDC Harness job in run `41306784075` (harness run `ee0ba13a-7d14-40d0-9b58-217afc55d36c`) completed with six passing tests, yet GitHub Actions still has **zero** `porta-harness-ci` cache keys (869 total caches). The compose overlay is included via `HARNESS_BUILD_CACHE_FILE`, but the build output is buffered and Compose is not forcing the Bake/cache exporter.
- Authorized bounded repair: set `COMPOSE_BAKE=true` for the harness build, stream the supervisor
  and build output, and add a streamed-output switch to the existing runtime command wrapper.
  Because Compose Bake and a raw shell Buildx step did not receive the GitHub cache credentials,
  the bounded repair uses the existing `docker/build-push-action@v7` for the same harness
  Dockerfile and `porta-harness-ci` scope. Exact files: `.github/workflows/build-and-test.yml`,
  `test-harness/fixtures/lifecycle-runtime-command.ts`, `test-harness/scripts/lifecycle.ts`,
  `test-harness/docker-compose.ci.yml`. No product source or new workflow.
- The next ordinary push supplies the first export run; a subsequent ordinary push supplies the import run.

Export result: run `41310058279` on `8eec1048` used the existing
`docker/build-push-action@v7` for the harness Dockerfile. GitHub now holds
`index-porta-harness-ci-1-39e3fcdd#1` (ref `refs/heads/chore/roadmap-closeout`, 15,204 bytes,
last accessed 2026-11-01T13:13:44Z). The same run's production Docker job shows
`importing cache manifest from gha:…`, repeated `CACHED` layers, and `sending cache export` for
`porta-ci`, proving the existing production scope. The earlier Bake/raw-shell attempts exported
nothing and remain preserved as failed attempts.

Import/reuse result: the ordinary follow-up run `41310659699` on `32b1d40a` shows
`#7 importing cache manifest from gha:11156821657715627676`, `CACHED` layers `#8`–`#31`, and
`sending cache export`; the harness cache keys `#1` and `#2` were accessed during the run. The
harness composition also reused the loaded image (`CACHED` layers in the `Run OIDC harness` step).
Both `porta-ci` and `porta-harness-ci` now have real export/import/reuse evidence; no timing-only
substitution is used.

### 4.2.3 pnpm 6.4 reconciliation

- Task 6.4 remains `[!]`: alerts and both cache scopes are green, but the project dependency graph
  is not ingested. The pnpm owner plan now states the exact blocker, the alert/cache evidence and
  the two run IDs; the 4.6 drift/compat text remains complete.
- The maintenance `T-04` row and portfolio summary now say 4.6 complete, 6.4 blocked on the
  dependency-graph boot document, cache scopes green. No task or release is marked complete.