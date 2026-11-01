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
