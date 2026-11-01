# Current State: Porta Roadmap Closeout

> **Parent**: [Index](00-index.md)
> **Observed**: 2026-10-31; updated 2026-11-01
> **CodeOps Artifact Schema**: 1

## Repository Baseline

The repository is a TypeScript ESM monorepo, pnpm 12.15.0, Node 22.22.2 minimum, with server,
SDK and CLI workspaces (`package.json:7-13,114`). PostgreSQL, Redis and MailHog support the
existing integration/assurance lifecycles. `codeops/.codeops.yml` selects nested layout and
develop as integration branch. Current `origin/develop` is `c73cc744`; local `develop` is
`6c2c6aa0` and 22 commits behind, so fetch and branch from `origin/develop`. The local session is
still on the merged #196 feature branch; do not resume new work on that branch (AR-5/6/11).

## Source Owners

Paths below are repository-relative. A short owner name used elsewhere refers to this table.

| Owner | Files / exact task | Observed state |
| --- | --- | --- |
| Automated release | `codeops/features/monorepo-migration/plans/automated-release/{00-index,99-execution-plan}.md`, tasks 4.1.1/4.1.2 | Checkboxes open at execution-plan lines 101–102; 4.1.3 records successful v1.9.0 publication. Header says 8/11 although the parser sees 9 verified tasks. |
| Maintenance roadmap / T-06 | `codeops/features/_maintenance/00-roadmap.md`, T-06 | T-06 says “not released”; PR #206 merge `43cdddc2` is an ancestor of v1.15.0, so the row is stale. |
| Deferred invitations | `codeops/features/user-invitations/plans/deferred-invitation-creation/{00-index,99-execution-plan}.md`, tasks 7.1.4–7.1.6 | 65/68; all implementation complete; historical rollout tasks open at lines 260–262; index still says `Status: Planning Complete`. |
| Later invitations | `codeops/features/user-invitations/plans/{invitation-localization,tenant-invitation-revocation}/{00-index,99-execution-plan}.md` | 40/40 and 30/30; update only current integration status where stale, not the historical authority recorded at execution time. |
| Tenant management | `codeops/features/tenant-user-management/plans/tenant-m2m-user-management/{00-index,08-handoff,99-execution-plan}.md`, task 5.1.3 | 55/56; exact blocked recovery case at execution-plan line 230. |
| Assurance umbrella | `codeops/features/test-assurance/plans/test-assurance-program/{00-index,99-execution-plan}.md`, tasks 8.4/8.7c/9.6b/9.6c | Recorded 119/123; four blockers at execution-plan lines 882,943,1078,1082; compare successors before changing any checkbox. |
| Assurance successors | `codeops/features/test-assurance/plans/{def-8-sequential-use-evidence,st46-delivered-artifact-correction,def-13-admin-denial-digest,def-13-live-boundary}/` | Completed plans provide narrower evidence; DEF-13 phase-4 review retains M2. Read-only context unless a narrow status cross-reference is needed. |
| pnpm migration | `codeops/features/_maintenance/plans/pnpm-migration/99-execution-plan.md`, tasks 4.6/6.4 | 42/44; open tasks at lines 192/214; 4.6 material at 192/195/255 (bare `assurance:compat` and known drift) and 6.4 remote-gate notes at 214/235; correct each in its owning phase. |
| Feature summaries | `codeops/features/{_maintenance,monorepo-migration,user-invitations,tenant-user-management,test-assurance}/00-roadmap.md` | Several summaries lag their plans and subsequent merges. |
| Assurance remaining work | `codeops/features/test-assurance/00-remaining-work.md` | Named campaigns and timing decision at 17–24; M2 limitation at line 10. |
| Portfolio | `codeops/00-roadmap.md` | Dated 2026-10-27; several old stage summaries and a recorded `0 / 0` header. Update only on integration branch. |

Admin UI's 7/10 requirement progress and its backlog are outside implementation scope. The
production-readiness and SDK-contract-drift plans are already complete; do not reopen them.

## Candidate Historical Evidence

| Obligation | Observed candidate | Limits |
| --- | --- | --- |
| Automated release into develop/main | PR #130: merge `0b796e7b`; PR #131: merge `fb11f971` | Confirm associated CI and final workflow lineage, not only merge state. |
| First automated release | Run `36137558382`, successful manual Release on `f70c010c`; original 4.1.3 records v1.9.0 provenance, image and sync | Preserve actual failure/fix history preceding this successful run. |
| Deferred invitations on main | PR #140: merge `0c820650`; main Build and Test `36353238808` successful; main Release `36353633426` failed at package verification; successful Release `36357391953` was dispatched on develop at `bfaf61db` (workflow checks out `main`); later main dispatch `36382460551` was a no-op | This proves historical integration, not every publication artifact. Task 7.1.5 closes only under the AR-14 equivalence; preserve the failed attempt. |
| Deferred invitations published | Published GitHub Release v1.11.0 (`f30986bd`); feature merge `27a31452` is an ancestor of that tag | Inspect release logs/package provenance/image/sync proof to close 7.1.6. Tag ancestry alone is insufficient. |
| Current main release | `main` `4e305086`; v1.15.0 published 2026-10-30; T-06 PR #206 merge `43cdddc2` is an ancestor of v1.15.0 | Confirms the automated-release path; T-06's “not released” row and the user-invitations portfolio cell are stale. |
| Remote dependency state | Dependabot alerts disabled (403); dependency-graph SBOM 404; GraphQL `dependencyGraphManifests` 0; version-update PRs 84 base `main`, 1 base `develop` | Requires AR-12 settings change and re-observation; access/disabled state is not success. |
| Harness cache state | 874 GitHub Actions caches, zero keys matching `harness`; `porta-ci` keys present; harness build output buffered | Requires the AR-13 bounded repair/re-observation; timing is not proof. |
| Latest invitations integrated | PR #212: develop merge `c73cc744`; CI `41242822065` all six jobs successful | No current main promotion or release of #196. |
| Later tenant/security evidence | Revocation review records clean checkpoint `a7598e3c`, production-security run `1908ceb0-ab5f-456d-b97a-73b4ad891865`, compat `aa6bbc5c-05ea-4100-b460-70cfb602f371` | Aggregate summaries remain, raw owned reports were deleted. They alone cannot establish the exact old failed probe. |

These are evidence leads, not pre-awarded task completions (AR-8).

## Existing Verification Components

| File / location | Relevant contract |
| --- | --- |
| `package.json:23-35,52-64` | Narrow tests, structure, full CI verification and assurance aliases |
| `test-harness/assurance/README.md:18-63` | Registered selectors, failure taxonomy, cleanup and clean-source admission |
| `test-harness/assurance/scripts/run-command.ts:550-579,1280-1295` | Two coverage projects/profiles, fixed seed, mandatory compatibility selector |
| `test-harness/assurance/compat/command.ts:216-257` | Five selected compatibility branches; `compatibility` is foundation evidence, not an aggregate |
| `test-harness/assurance/ratchets/index.ts:34-79,203-245` | Reviewed baseline schema; governed coverage accepts security captures only and checks provenance |
| `test-harness/assurance/ratchet-baselines.json` | Prior local security baseline; monitored requirement, fixture, dependency and sentinel paths |
| `test-harness/assurance/tests/assurance-ratchets-requirements.ts:3-25` | Separate reviewed baseline/count and staleness-digest fixture |
| `test-harness/assurance/tests/assurance-ratchets.{spec,impl}.test.ts` | Existing immutable acceptance and implementation checks |
| `test-harness/assurance/tests/human-auth-recovery-case-requirements.ts` and `human-auth-recovery.spec.test.ts` | Retained password-reset throttling probe and required rejection event |
| `.github/workflows/build-and-test.yml` | Read-only branch gate; six jobs, existing Docker cache scopes |
| `.github/dependabot.yml` | npm ecosystem at `/`; version-update PRs target the default branch (`main`), not `develop` |
| `test-harness/docker-compose.ci.yml` and `test-harness/fixtures/lifecycle-runtime{,-command}.ts` | Harness cache overlay (`scope=porta-harness-ci`) and buffered child build output |
| `scripts/codeops_plan.py` and `codeops-roadmap-sync.sh` | Plan structure/`Implements`/task checks and roadmap counter checks; the plan helper does not validate Markdown links |
| `techdocs/index.md:1-3` | Architecture-documentation opt-in; update only if a bounded repair changes documented behavior |

## Status-Tool Limitation

The installed `codeops_plan.py --json` reports zero tasks for several completed plans with legacy
bold identifiers, and missing `00-index.md` for some lightweight task plans. That is not evidence
that their implementation is absent. The manual checklist must distinguish numbered tasks,
deliverable lists and repeated prose before counting. Preserve original IDs; do not invent tasks,
bulk-upgrade artifacts or modify the plugin under this plan (AR-8/11). The helper checks the
required documents, `Implements` mapping and task/blocked shape; it does **not** validate Markdown
links, so link checking is the manual checklist in `07-testing-strategy.md`.

The roadmap sync engine excludes T-* rows from RD counters and preserves hand-maintained totals.
Its earlier read-only check flagged the tenant roadmap's `0/1` versus computed `0/0`; it did not
declare the task-only invitation roadmap broken. Do not replace counters with guessed figures.
The tenant feature has one `T-01` row and zero `RD-*` rows; after 5.1.3 closes, use
`n/a (task-only)` or a documented task-count form, and keep the portfolio cell consistent. Do not
leave `0/1` or silently write `0/0`.

## Risk Summary

| Risk | Required response |
| --- | --- |
| Historical artifact expired or unavailable | Keep the affected acceptance unproved; seek equivalent provenance or a user ruling, never republish to manufacture evidence. |
| New passing aggregate omits old failed probe | Apply case-level comparison and fresh run under 03-01. |
| Baseline reset hides regression | Independent comparison and value-specific approval under 03-02. |
| Dependency graph/alerts disabled (known) | Apply AR-12: enable and re-observe, or keep 6.4 blocked; record the exact prior 403/404/0-manifest state. No silent settings change. |
| Harness cache never populated/observable | Apply the AR-13 bounded repair and re-observe both scopes; do not substitute timing, a cache export, or a warm pnpm store. |
| Dependabot update PRs target `main` | Record the limitation; do not reconfigure the dependency workflow without a separate ruling. |
| Concurrent infrastructure or worktree activity | Record ownership and serialize shared lifecycles under 03-03. |
| Stale numeric metadata | Correct only from a verified unique-task set and the existing roadmap arithmetic rules. |
