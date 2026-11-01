# Preflight Report: Porta Roadmap Closeout

> **Status**: ✅ PREFLIGHT PASSED — all 21 findings resolved (15 iteration-1, 6 iteration-2); 0 open
> **Iteration**: 2 (fix verification and bounded re-scan)
> **Artifact**: Implementation plan (9 staged Markdown documents) at `/home/gevik/.opencode/plan/porta-roadmap-closeout/`
> **Artifact content hash**: scan start `sha256:97a914492ffaea1369c9e492d2198114d3dda460a4527b4df6ce9b357a1a6e77`; iteration-2 verified `sha256:11cb83305717f8fccdce56496b707d5b022b236ff4153e6adbb5ac3f8254c1d5` (combined sorted SHA-256 of the 9 documents; excludes this report and `_preflight-notes.md`)
> **Codebase grounded**: repository `/home/gevik/workdir/github/porta/porta-identity`, `origin/develop` `c73cc744`, 6-job CI, live read-only GitHub API state
> **Last Updated**: 2026-11-01 01:30 CET

**SAME-SESSION REVIEW:** This plan was created in the current session. Same-agent bias risk is elevated. Mitigation used: five independent read-only preflight auditors (one per dimension cluster) and one independent design challenger over the major-finding batch; the lead then re-verified every high-stakes fact against the repository and live GitHub data. Consider a human domain-expert review before execution because the plan touches security evidence and dependency monitoring.

## Codebase Context Summary

**Tech Stack:** TypeScript ESM monorepo; pnpm 12.15.0; Node 22.22.2 minimum; Koa/oidc-provider server; PostgreSQL, Redis, MailHog; Vitest/Node test runner/Playwright; GitHub Actions.

**Architecture:** `packages/server`, `packages/sdk`, `packages/cli`; nested CodeOps artifacts under `codeops/`; `develop` is the integration branch; six branch CI jobs (`Verify Monorepo`, `UI Tests`, `OIDC Harness`, `Public Documentation`, `Production Docker Build`, `Production Dependency Audit`); assurance commands route through `test-harness/assurance/scripts/run-command.ts`.

**Key Files Examined:** `package.json`; `codeops/.codeops.yml`; `codeops/00-roadmap.md`; `codeops/features/_maintenance/00-roadmap.md`; the five source plan sets cited in `02-current-state.md`; `.github/workflows/build-and-test.yml`; `.github/dependabot.yml`; `test-harness/docker-compose.ci.yml`; `test-harness/assurance/README.md`; `commands.ts`; `scripts/run-command.ts`; `compat/command.ts`; `ratchets/index.ts`; `ratchet-baselines.json`; `tests/assurance-ratchets-*.ts`; `tests/human-auth-recovery*`; `repo-tests/monorepo/server-package.spec.test.mjs`; `scripts/codeops_plan.py`.

**Reference Verification:** all cited source-plan line references, task counts, commit hashes, release/CI run IDs, command aliases/selectors, the six CI job names, and both cache scopes were checked. The plan's factual claims are largely accurate. The findings below are gaps and known-state omissions, not wholesale misdescription.

## Summary by Dimension

| # | Dimension | Findings | Highest severity |
| --- | --- | --- | --- |
| 1 | Ambiguities | 1 | 🟠 MAJOR |
| 2 | Implicit Assumptions | 1 | 🟠 MAJOR |
| 3 | Logical Contradictions | 1 | 🟠 MAJOR |
| 4 | Completeness Gaps | 5 | 🟠 MAJOR |
| 5 | Dependency Issues | 1 | 🟡 MINOR |
| 6 | Feasibility Concerns | 1 | 🟠 MAJOR |
| 7 | Testability | 2 | 🟡 MINOR |
| 8 | Security Blind Spots | 1 | 🔵 OBSERVATION |
| 9 | Edge Cases | 1 | 🟡 MINOR |
| 10 | Scope Creep Indicators | 0 | — |
| 11 | Ordering & Sequencing | 1 | 🟠 MAJOR |
| 12 | Consistency | 2 | 🟡 MINOR |
| 13 | Codebase Alignment | 5 | 🟠 MAJOR |

Some findings cross dimensions; the table uses each finding's primary dimension. Scope-creep cluster was independently clean.

## Summary by Severity

| Severity | Count | Status |
| --- | ---: | --- |
| CRITICAL | 0 | 0 open |
| MAJOR | 5 | all resolved |
| MINOR | 12 | all resolved |
| OBSERVATION | 4 | all resolved |

The table totals both iterations: 15 iteration-1 findings plus 6 iteration-2 residual findings. The finding sections below record iteration 1; the Iteration 2 section records the residuals and their fixes.

---

## Findings

### PF-001: Remote dependency gate is blocked by disabled repository security features 🟠 MAJOR

**Dimension:** Implicit Assumptions / Codebase Alignment
**Location:** `01-requirements.md:16` (R6); `02-current-state.md:83`; `03-02-verification-and-repairs.md:86-104`; `99-execution-plan.md:128,132,134`; `07-testing-strategy.md:35-36` (ST-13/ST-14).
**Codebase evidence (observed 2026-10-31/11-01):**
- `gh api repos/blendsdk/porta-identity` → `security_and_analysis.dependabot_security_updates.status = "disabled"`.
- `GET /repos/blendsdk/porta-identity/dependabot/alerts` → `403 "Dependabot alerts are disabled for this repository."`
- `GET /repos/blendsdk/porta-identity/dependency-graph/sbom` → `404`.
- GraphQL `dependencyGraphManifests` → `totalCount: 0`; dependency-graph compare → `403 "Dependency review is not supported on this repository"`.
- Dependabot version-update PRs do exist (84 base `main`, 1 base `develop`; latest 2026-10-26), so version-update processing is the one provable clause.

**The Problem:** R6/ST-14 require dependency-graph ingestion, Dependabot processing, and alert availability. The repository is already in a state where graph ingestion and alert availability cannot be proved without changing repository security settings. The plan treats this as a generic "API inaccessible or graph empty" risk and has only a conditional ruling hook. Execution will stop at 4.2.1 or be tempted to change settings without explicit authority. The completion boundary says an unresolved active remote gate prevents closeout, but the register claims all material decisions are resolved.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Add an explicit pre-execution user decision: authorize enabling the dependency graph and Dependabot alerts, then re-observe; otherwise accept 6.4 as blocked/narrowed and amend R6/acceptance criterion 1. | Resolves the known blocker before hours of runner work; keeps the security posture decision with the owner. | Requires a repository settings change or an openly incomplete closeout. |
| B | Leave the plan as written and stop at 4.2.1 during execution. | No plan edit. | Guaranteed mid-execution stop; the current state is knowingly incomplete. |
| C | Narrow 6.4 by ruling to Dependabot version-update processing plus cache reuse, recording graph/alerts as an accepted gap. | Closeout can finish honestly. | Changes an original task obligation; only the user can authorize; must not mark 6.4 Done. |

**Recommendation:** Option A, split into two sub-decisions: (i) enable graph/alerts and re-observe, or (ii) explicitly accept 6.4 as blocked/narrowed and update the completion claim. Record the exact 403/404/0-manifest state in `02-current-state.md` and `08-closeout-evidence.md`. Do not enable settings silently.

**User Decision:** Resolved — User selected “Enable and re-observe (Recommended)”. Authorizes enabling the repository dependency graph and Dependabot alerts at execution, then re-observing ingestion and alert availability. Record the exact observed state and the settings change; no silent change.

---

### PF-002: `porta-harness-ci` cache scope is never populated or observable 🟠 MAJOR

**Dimension:** Feasibility Concerns / Codebase Alignment
**Location:** `01-requirements.md:16` (R6); `03-02-verification-and-repairs.md:96-99`; `99-execution-plan.md:133` (4.2.2); `07-testing-strategy.md:36-37` (ST-14/ST-15).
**Codebase evidence:**
- `GET /repos/blendsdk/porta-identity/actions/caches` (paginated, 874 entries) → **zero** keys matching `harness`; `index-porta-ci-1-*` entries exist.
- `test-harness/docker-compose.ci.yml:7-9` configures `cache_from`/`cache_to` with `scope=porta-harness-ci`.
- `.github/workflows/build-and-test.yml:165` sets `HARNESS_BUILD_CACHE_FILE`.
- `test-harness/fixtures/lifecycle-runtime-command.ts:48-53` spawns child processes with piped stdout/stderr; the harness build progress is buffered, not streamed to the CI log.
- The OIDC Harness job in run `41242822065` completed in ~2m48s, but no build/cache evidence is available in the job log.

**The Problem:** ST-15 forbids substituting timing or a warm package store for observed layer reuse. With zero `porta-harness-ci` cache entries and no streamed build/cache log, the second scope cannot be proved. The plan assumes both "existing image-build scopes" are observable; the harness scope is configured but apparently dead or invisible. This is a real CI/test-harness defect, not just missing evidence. Combined with PF-001, the plan is guaranteed to terminate blocked at Phase 4.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Add a bounded diagnostic/repair task: confirm the compose overlay is applied, determine whether the GHA export fails silently, make build progress visible without weakening tests, then re-observe across two ordinary pushes. | Produces genuine proof; the defect is likely small and real. | Touches existing CI/test-harness paths; requires explicit authorization for those paths. |
| B | Keep 6.4 blocked with exact evidence (zero cache keys, buffered logs). | Truthful; no code change. | Closeout stays incomplete; original task not closed. |
| C | Drop the harness clause by ruling and accept only `porta-ci`. | Simple. | Silently weakens the original task; not recommended. |

**Recommendation:** Option A if the user authorizes the bounded CI/test-harness repair; otherwise Option B. Do not treat a cache export, a fast run, or a warm pnpm store as proof. Do not silently drop the second scope.

**User Decision:** Resolved — User selected “Authorize bounded repair (Recommended)”. Authorizes adding a bounded diagnostic/repair task for the existing compose cache wiring and build-log visibility, then re-observing across two ordinary pushes.

---

### PF-003: Bounded-repair authority boundary is ambiguous 🟠 MAJOR

**Dimension:** Ambiguities
**Location:** `00-ambiguity-register.md:22` (AR-4), `:29` (AR-11); `03-02-verification-and-repairs.md:116-117`; `99-execution-plan.md:22-24`; `01-requirements.md:17` (R7); `07-testing-strategy.md:38` (ST-16).
**Codebase evidence:** The repository's security oracle is the immutable specification file, e.g. `test-harness/assurance/tests/human-auth-recovery.spec.test.ts:118-121` (`sentinelId: 'ST-46'`, `requiredLogEvent`), and the closed reviewed schema in `test-harness/assurance/ratchets/index.ts:34-79`. AR-11 lists plans/indexes/roadmaps, plan-local evidence, and the baseline JSON/fixture, but not general source/test paths; it then says bounded repairs must name their exact existing source/test paths.

**The Problem:** Two readings are available. Narrow: only a change to an immutable oracle/expectation needs a ruling, so a bounded repair proceeds under AR-4/R7. Broad: any source repair is "outside AR-11's concrete modification set" and "requires a security expectation", so every repair needs a fresh ruling. The broad reading contradicts the user's approved "Repair defects" decision and R7's "pause only when the repair exceeds the approved component/authority boundary". It can either stall a security-sensitive repair or, worse, let an oracle change proceed without the reserved ruling. The plan also edits `codeops/features/test-assurance/00-remaining-work.md`, which AR-11 does not list.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Clarify in AR-11/03-02: bounded repairs in named existing source/test paths are authorized by AR-4/R7; a ruling is required only for an immutable oracle/expectation, reviewed baseline, dependency policy, workflow/configuration, or material support-surface change. Add `00-remaining-work.md` and `08-closeout-evidence.md` to the modification set. | Removes the ambiguity; preserves the user's repair decision and the reserved security gates. | One wording change. |
| B | Require a ruling for every repair. | Maximum conservatism. | Contradicts AR-4; adds friction to the approved path. |

**Recommendation:** Option A. Define "security expectation" narrowly as the immutable oracle/expectation, not every test assertion. Keep AR-4 as the authority for what kind of change needs a ruling and AR-11 only for naming touched paths.

**User Decision:** Resolved — User selected “Clarify narrow boundary (Recommended)”. Bounded repairs in named existing source/test paths are authorized; a ruling remains required for immutable oracle/expectation, reviewed baseline, dependency policy, workflow/configuration, or material support-surface changes.

---

### PF-004: Deferred-invitation 7.1.5 closure does not match the historical release evidence 🟠 MAJOR

**Dimension:** Completeness Gaps / Dependency Issues
**Location:** `02-current-state.md:41-42`; `00-ambiguity-register.md:38`; `03-01-evidence-and-reconciliation.md:50-53`; `99-execution-plan.md:57` (1.2.2); `07-testing-strategy.md:23-25` (ST-1–3).
**Codebase evidence (read-only GitHub):**
- Main Release run `36353633426` on `0c820650` (2026-09-27): **failed** at "Verify published packages"; "Publish with npm Trusted Publishing", "Push release commit and tag", "Create GitHub Release", "Dispatch tested Docker release", and "Sync develop" were skipped.
- Successful Release run `36357391953` was dispatched on **develop** at `bfaf61db` (2026-09-27); the release workflow checks out `ref: main`.
- Later main dispatch `36382460551` on `f30986bd` succeeded but all publication steps were skipped (no-op).
- Tag `v1.11.0` is `f30986bd`; feature merge `27a31452` is an ancestor.

**The Problem:** Task 7.1.5 says "dispatch the manual Release workflow **on main**". The actual publishing run was dispatched on develop (although the workflow checks out main), and the main dispatch failed before publication. The plan's candidate row presents a clean v1.11.0 publication and omits the failed run. The executor cannot truthfully mark 7.1.5 without a ruling on whether the develop-dispatched run satisfies "on main"; 7.1.6 artifacts may still be provable. The plan's own failure-preservation rule requires recording the failed attempt.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Record the failed main run and the develop-dispatched successful run; treat the develop run (which checked out main) plus the later main no-op as satisfying 7.1.5, with a user-approved interpretation. Close 7.1.6 on the verified artifacts. | Truthful chronology; matches the published main lineage; no re-release. | Literal "dispatch on main" mismatch; needs a recorded exception. |
| B | Keep 7.1.5 blocked; close only 7.1.4 and, if artifacts prove publication, 7.1.6. | Strict task matching; no invented authorization. | Deferred-invitation feature remains incomplete despite the release. |
| C | Re-release. | Would create a literal main dispatch. | Excluded by AR-1; unnecessary and potentially harmful. |

**Recommendation:** Record the failed run and the successful develop-dispatched run in `02-current-state.md`/`03-01`, then ask the user to choose A or B. My recommendation is A if the user accepts the workflow's fixed `ref: main` semantics; otherwise B. Do not silently mark 7.1.5 Done from tag ancestry.

**User Decision:** Resolved — User selected “Accept develop-dispatched run (Recommended)”. Record the failed main run, the successful develop-dispatched run that checked out main, and the later main no-op; treat 7.1.5 as satisfied by that recorded operational equivalence, then close 7.1.6 on verified artifacts.

---

### PF-005: Terminal task 6.3.2 creates a final-head/verification contradiction 🟠 MAJOR

**Dimension:** Logical Contradictions / Ordering & Sequencing
**Location:** `99-execution-plan.md:184-185` (6.3.1/6.3.2), `:16-18` (mark `[x]` only after verification); `03-03-integration-and-cleanup.md:42-55`; `01-requirements.md:73-74` (acceptance criterion 4).
**Codebase evidence:** `99-execution-plan.md` is declared the sole mutable task-progress authority (`:12-14`). 6.3.2 says "Confirm CI on the final published develop head; … finish the factual handoff and task progress." Marking 6.3.2 requires a commit after that confirmation, creating a new develop head whose CI is unconfirmed. Marking it in 6.3.1's commit marks it before verification. `03-03:52-55` forbids an endless chain of self-referential evidence commits but does not define which head is final.

**The Problem:** The plan's own rules cannot be satisfied simultaneously for the terminal task. "Mark `[x]` only after verification" and "confirm CI on the final head" conflict when the mark itself changes the final head. Acceptance criterion 4 requires the final develop revision's full CI to pass, but the final revision is defined circularly.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Split 6.3.2: the final metadata commit contains the handoff/evidence and the `[x]` mark; observe CI on that exact commit as an external handoff record, not another checkbox. Define this as the terminal exception in 03-03. | Finite sequence; satisfies final-head CI; no self-referential chain. | The mark is written before CI by design; needs an explicit rule. |
| B | Leave 6.3.2 unmarked and report its verification only in the handoff. | No preclaim. | Plan remains 41/42; contradicts the completion claim. |
| C | Add 6.3.3 to confirm 6.3.2's commit. | None. | Infinite regress; not viable. |

**Recommendation:** Option A, preferably as a split: 6.3.2 = publish the final metadata/handoff; a non-checkbox final handoff record captures the CI result for that exact commit. Amend `03-03:52-55` to define the terminal head and no-later-commit rule.

**User Decision:** Resolved — User selected “Split terminal task (Recommended)”. 6.3.2 publishes the final metadata/handoff and is marked then; the final CI result is recorded in the handoff as an external observation, with no further checkbox or commit.

---

### PF-006: Source-metadata reconciliation set is incomplete 🟡 MINOR

**Dimension:** Consistency / Completeness Gaps
**Location:** `02-current-state.md:7-13,30,39-44`; `99-execution-plan.md:56-58,115,134`; `03-03-integration-and-cleanup.md:26-29`.
**Codebase evidence:**
- `main` is at `4e305086` (`chore(release): v1.15.0 [skip ci]`, 2026-10-30); release `v1.15.0` published 2026-10-30T10:21:05Z. T-06's PR #206 merge `43cdddc2` is an ancestor of v1.15.0 (`compare 43cdddc2...v1.15.0` → ahead 26, behind 0), yet `codeops/features/_maintenance/00-roadmap.md:23` still says "not released".
- `codeops/00-roadmap.md:23` still says user-invitations "gated release pending", although deferred invitation creation was released in v1.11.0.
- `codeops/features/user-invitations/plans/deferred-invitation-creation/00-index.md:4` still says `Status: Planning Complete` although the plan is 65/68 and 7.1.4–7.1.6 are being reconciled.
- `codeops/features/_maintenance/plans/pnpm-migration/99-execution-plan.md:192,255` still names a bare `pnpm assurance:compat` (which now exits 30) and `:195,235` retain known-drift/remote-gate text that 4.6/6.4 closure resolves.

**The Problem:** R8 requires truthful metadata refresh, but the plan's source-owner inventory omits these rows. An executor can close the named tasks and leave false "not released"/"gated release pending"/"Planning Complete" statements. The pnpm owner plan's completed record would still point at an invalid command.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Add these exact targets to 1.2.2/1.2.3/2.2.2/3.3.3/4.2.3 and the final audit: T-06 row, portfolio user-invitations cell, deferred-invitation index status, pnpm owner lines 192/255 and drift/remote notes. | Truthful records; no new machinery. | A few extra doc edits. |
| B | Rely on the final "document validation" task. | No task change. | The final task checks counts/links, not prose status; easy to miss. |

**Recommendation:** Option A. Use the verified v1.15.0 ancestry and v1.11.0 release as evidence, not guesses.

**User Decision:** Resolved — User accepted the recommendation (Option A). Add the exact metadata targets to the reconciliation tasks.

---

### PF-007: Tenant roadmap counter has no defined post-closure value 🟡 MINOR

**Dimension:** Completeness Gaps
**Location:** `02-current-state.md:72-74`; `99-execution-plan.md:80` (2.2.1), `:152` (5.1.2), `:180` (6.2.3); `01-requirements.md:71-72`.
**Codebase evidence:** `codeops/features/tenant-user-management/00-roadmap.md:6` has `Progress: 0 / 1 (0%)`; the feature has one `T-01` row and zero `RD-*` rows. The existing sync engine counts only top-level `RD-*` rows and excludes `T-*`; the plan itself records the engine's `0/1` vs computed `0/0` drift.

**The Problem:** After 5.1.3 closes, the truthful feature header is either `n/a (task-only)` or a hand-maintained task count, not `0/1` and not the engine's `0/0`. The plan says "preserve hand-maintained counter semantics" but never says which value wins. Applying the existing workflow can leave the feature at `0/0` and the portfolio at `0/1` in the same commit, violating acceptance criterion 3's "agree".

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Set the tenant header to `n/a (task-only)`, matching the maintenance roadmap and task-only invitation roadmap; keep the portfolio cell consistent. | Engine preserves `n/a`; truthful; no fake RD count. | Loses the one-task count. |
| B | Set a hand-maintained task count (e.g. `1/1 tasks (100%)`) with an annotation. | Shows progress. | Engine may flag it; needs a documented convention. |
| C | Leave `0/1` and document it as legacy. | No edit. | False after closure; portfolio/feature disagree. |

**Recommendation:** Option A, decided before 6.2.3 and recorded in 2.2.1/5.1.2. If the repository wants task counts, use B with an explicit annotation; do not leave `0/1` or silently replace it with `0/0`.

**User Decision:** Resolved — User accepted the recommendation (Option A). Set the tenant roadmap to `n/a (task-only)` or a documented task count before the portfolio cascade; record the rule.

---

### PF-008: Evidence/validation procedure is under-specified and overstates the helper 🟡 MINOR

**Dimension:** Testability
**Location:** `07-testing-strategy.md:59-109`; `99-execution-plan.md:63,86,139,161,184`; `03-03-integration-and-cleanup.md:27-29,41`; `00-ambiguity-register.md:25`.
**Codebase evidence:** The installed `codeops_plan.py` `inspect_plan` checks required files, `Implements`, task presence and blocked-reason text (`scripts/codeops_plan.py:194-213`); it does not validate Markdown links. `grep` for `codeops/` link checks in `repo-tests/monorepo/*.mjs` returns nothing. `codeops-roadmap-sync.sh` has `--check`/`--dry-run` for counters. The plan's command table has rows for GitHub graph/Dependabot and Docker cache, but no named commands for PR/CI/release/npm/Docker/git evidence.

**The Problem:** Five phase checkpoints require "document validation" without a command or recorded checklist. The plan attributes link checking to "the existing helper", which cannot do it. Historical and remote evidence closures (release, PR/CI, npm provenance, Docker image, develop ancestry) have no named read-only commands or expected observations, so closure depends on the executor's narrative.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Record a compact manual/read-only checklist in `08-closeout-evidence.md` at each checkpoint: links resolve; AR/R/ST references exist; 42 IDs unique; phase totals match; `codeops_plan.py --json` reports no problems; `codeops-roadmap-sync.sh --check` for counters. Add a read-only evidence command table (`gh pr view`, `gh run view`, `gh release view`, `npm view … dist.attestations`, `docker manifest inspect`, `git merge-base --is-ancestor`). | Repeatable; uses existing tools; no new machinery. | Manual; a few documentation lines. |
| B | Keep the narrative and rely on reviewer inspection. | No plan change. | Inconsistent; the named helper cannot perform the check. |

**Recommendation:** Option A. Correct `07:105-106` to say the helper validates `Implements`/task structure, not links; make link checking an explicit manual step.

**User Decision:** Resolved — User accepted the recommendation (Option A). Add the checklist and read-only evidence command table; correct the helper claim.

---

### PF-009: Baseline/fixture cross-check and final ratchet gate are missing 🟡 MINOR

**Dimension:** Testability / Ordering & Sequencing
**Location:** `03-02-verification-and-repairs.md:55-84` (Reviewed Baseline Update); `07-testing-strategy.md:33` (ST-11); `99-execution-plan.md:107-108,114,161`.
**Codebase evidence:**
- `test-harness/assurance/tests/assurance-ratchets.impl.test.ts:24-32` checks monitored digests; `assurance-ratchets.spec.test.ts:14-103` uses `reviewedCoverageBaseline` as a hypothetical input. No test compares `ratchet-baselines.json.coverage` with `reviewedCoverageBaseline` in `assurance-ratchets-requirements.ts`.
- `pnpm verify` (`package.json:35`) does not run assurance tests, so CI will not catch a baseline/fixture mismatch or a post-approval digest drift.
- Current state (verified): `requirement-r5`, `fixture`, and `dependency` monitored digests are stale; `sentinel` is current. The plan's 3.1.2 correctly says not to assume only the two historically mentioned digests changed, but the final gate is not explicit.
- Phase 4/5 can change dependency policy or fixtures after the Phase 3 approval; no task requires a final ratchet run on the PR head and merge commit.

**The Problem:** The plan requires both the baseline JSON and the reviewed fixture to match, and ST-11 says existing checks pass. A transcription mismatch or a later monitored-input change can stay green because no check binds the two files and CI does not run the assurance suite. The R5 closure claim would then be false at the integration head.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Require the baseline proposal to show the JSON block and fixture block side by side; the independent reviewer records exact equality and the two digest formulas. Add an explicit final ratchet run on the PR head and merge commit; any monitored digest change reopens 3.2.4. | No new test machinery; closes the gap with the plan's own rules. | Manual review; one extra run. |
| B | Add one assertion to the existing impl test comparing `loadAssuranceRatchetBaseline().coverage` to `reviewedCoverageBaseline`. | Executable; catches transcription drift. | Adds a test not tied to a product failure; may exceed the plan's "impl tests only for a demonstrated failure" rule. |

**Recommendation:** Option A as the required control; Option B only with a separate bounded-test approval. Do not rely on `pnpm verify` for the assurance ratchet.

**User Decision:** Resolved — User accepted the recommendation (Option A). Require side-by-side baseline/fixture review and a final ratchet run on the PR head and merge commit; reopen 3.2.4 on any digest change.

---

### PF-010: Bounded repair can break exact test-inventory counts 🟡 MINOR

**Dimension:** Completeness Gaps / Codebase Alignment
**Location:** `03-02-verification-and-repairs.md:118-121`; `99-execution-plan.md:22-24`; `07-testing-strategy.md:66`.
**Codebase evidence:** `repo-tests/monorepo/server-package.spec.test.mjs:410-450` asserts exact physical file counts: 386 server unit/integration/E2E/pentest, 26 UI, 57 SDK, 104 CLI, 6 harness. A new `packages/server/tests/**/*.spec.test.ts` or `.impl.test.ts` changes the first count and fails `pnpm test:structure`. Assurance test files may also require updating `test-harness/assurance/test-inventory.json` if the inventory covers them.

**The Problem:** The repair procedure says to add `.spec.test.ts` and `.impl.test.ts` files beside existing tests, but does not say to update the physical inventory counts (or reuse an existing file). A conditional repair can create a structure failure unrelated to the defect, and the executor may be tempted to remove or weaken the new test.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Add a repair step: when a new test file is added, update the exact `server-package.spec.test.mjs` counts (and assurance inventory if applicable), then run structure. | Correct; keeps the gate meaningful. | One more bounded edit. |
| B | Prefer adding cases to an existing test file. | No count change. | Not always possible or appropriate. |

**Recommendation:** Option A, plus Option B where practical. Name the exact paths in 03-02.

**User Decision:** Resolved — User accepted the recommendation (Option A, with Option B where practical). Update exact inventory counts when adding test files; prefer reusing existing files.

---

### PF-011: Base revision and post-merge publication mechanism are undefined 🟡 MINOR

**Dimension:** Dependency Issues / Edge Cases
**Location:** `99-execution-plan.md:51` (1.1.1); `03-03-integration-and-cleanup.md:10-13,26-34`; `00-index.md:52`.
**Codebase evidence:**
- Local `develop` is `6c2c6aa0`; `origin/develop` is `c73cc744`; `develop` is 22 commits behind `origin/develop`.
- `gh api repos/blendsdk/porta-identity/branches/develop/protection` → `404 Branch not protected`; `rulesets` → `[]`.
- The plan says "verify current develop" without an expected hash/fetch instruction, and says "use the repository's permitted integration flow" / "if develop protection prevents" without defining the mechanism. The protection contingency cannot fire today.

**The Problem:** An executor that switches to local `develop` starts 22 commits off the recorded base; every capture and merge is anchored to the wrong revision, and the evidence fields would not reveal it. Separately, the post-merge portfolio/evidence write has no named mechanism: direct docs-only commit on `develop` or a second evidence-only PR. The final deliverable and CI confirmation depend on that choice.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | State `origin/develop` @ `c73cc744` in 1.1.1 and require `git fetch origin` plus branching from `origin/develop`. For the portfolio, name a docs-only commit on `develop` after the merge-revision CI, with a note to re-check protection/rulesets; if a rule requires a PR, use a second evidence-only PR and record its head/CI. | Deterministic; removes the provenance error and the mechanism ambiguity. | Fixes today's protection state in prose; mitigated by the re-check. |
| B | Leave the prose and rely on the executor. | No edit. | Repeats the stale-base risk; undefined post-merge flow. |

**Recommendation:** Option A.

**User Decision:** Resolved — User accepted the recommendation (Option A). Pin `origin/develop` `c73cc744`, require `git fetch`, and name the post-merge docs-only commit or second PR.

---

### PF-012: `ST-` prefix identifies two different namespaces 🟡 MINOR

**Dimension:** Consistency
**Location:** `07-testing-strategy.md:21-41` (local ST-1–19); `03-01-evidence-and-reconciliation.md:64,83` (repository ST-46); `99-execution-plan.md:151`.
**Codebase evidence:** Repository assurance requirements occupy `ST-42…ST-73` (e.g. `human-auth-recovery.spec.test.ts:118-121` uses `ST-46`; the test-assurance plan uses ST-42–ST-49). The plan's local acceptance cases are ST-1–19.

**The Problem:** The same prefix denotes plan acceptance cases and repository assurance requirements in the same document set. A reviewer or evidence author can cite "ST-46" against the local table (which ends at 19) or confuse a local ST with a repository sentinel.

**Options:**

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Rename local cases (e.g. `CO-1…CO-19`). | No collision. | Rewrites 19 cases across four documents and every task reference. |
| B | Add one clarifying sentence in 07: plan-local cases are ST-1–19; repository assurance requirements use their own IDs (`ST-42…ST-73`, e.g. ST-46) and are not part of this table. | Zero churn. | None. |

**Recommendation:** Option B.

**User Decision:** Resolved — User accepted the recommendation (Option B). Add the clarifying sentence; keep local ST-1–19 and repository ST-46 distinct.

---

### PF-013: Dependabot's default target is `main`, which is off limits 🔵 OBSERVATION

**Dimension:** Security Blind Spots
**Location:** `03-02-verification-and-repairs.md:92-95`; `99-execution-plan.md:132`; `02-current-state.md:83`.
**Codebase evidence:** `.github/dependabot.yml` has no `target-branch`; default branch is `main`. Observed 84 Dependabot PRs base `main`, 1 base `develop`; all recent PRs are closed. AR-1 and repository guidance keep `main` off limits.

**The Problem:** "Dependabot processing of the current lockfile" is provable via version-update PR creation, but most PRs target a branch nobody may merge during this closeout. Recording "Dependabot processing verified" without that limitation reports a healthier dependency-update path than exists.

**Options:** (A) Record the `main`-targeting limitation in `08-closeout-evidence.md`; do not reconfigure. (B) Authorize `target-branch: develop` (a repository configuration change requiring its own ruling).

**Recommendation:** Option A. Keep the observation factual; do not expand scope to reconfigure the dependency workflow.

**User Decision:** Resolved — User accepted the recommendation (Option A). Record the `main`-targeting limitation in the evidence; do not reconfigure.

---

### PF-014: GitHub issue #196 remains open and is not named in the exclusion/handoff 🔵 OBSERVATION

**Dimension:** Completeness Gaps
**Location:** `01-requirements.md:36-46` (excluded/open table); `03-03-integration-and-cleanup.md:56-58` ("Do not close unrelated GitHub issues"); `00-index.md`.
**Codebase evidence:** Issue #196 was implemented and merged into `develop` as `c73cc744` (PR #212); the default branch is `main`; no main promotion or release is authorized. The issue remains open.

**The Problem:** The plan says not to close unrelated issues, but #196 is directly related to the work that landed. The handoff could imply it was forgotten. Closing it requires main/release or an explicit ruling, which AR-1 excludes.

**Options:** (A) Add #196 to the excluded/open table with "closure awaits main promotion/release or explicit ruling" and mention it in the final handoff. (B) Leave it out as unrelated issue triage.

**Recommendation:** Option A. It is a one-line truthful tracking note, not a new task.

**User Decision:** Resolved — User accepted the recommendation (Option A). Add #196 to the excluded/open table; closure awaits main/release or a ruling.

---

### PF-015: Plan index/promotion does not list the execution evidence or preflight report 🔵 OBSERVATION

**Dimension:** Consistency / Completeness Gaps
**Location:** `00-index.md:34-45` (document index); `00-index.md:25-27`; `99-execution-plan.md:51` (1.1.1 "promote this document set").
**Codebase evidence:** The index lists the 8 plan documents (including the Ambiguity Register) but not `08-closeout-evidence.md` or `00-preflight-report.md`. The execution plan creates `08-closeout-evidence.md` and the preflight report is saved alongside the artifact.

**The Problem:** "Promote this document set" is ambiguous about whether the evidence document and audit trail are included. If omitted, the promoted plan loses its execution evidence and preflight history.

**Options:** (A) Add `08-closeout-evidence.md` (created at execution) and `00-preflight-report.md` (this report) to the index/promotion note as plan-local evidence/audit trail. (B) State explicitly that only the named 9 documents are promoted and evidence lives outside the plan folder. (C) Leave it implicit.

**Recommendation:** Option A. The report and evidence are part of the audit trail; keep them with the plan.

**User Decision:** Resolved — User accepted the recommendation (Option A). Add `08-closeout-evidence.md` and `00-preflight-report.md` to the index/promotion note.

---

## Iteration 2 — Fix Verification and Residual Findings

An independent read-only auditor verified the iteration-1 fixes against the repository. Eleven of
the fifteen were fully fixed. Four retained small gaps, and two further consistency issues were
found. All six residuals were corrected in the same authorized fix pass and re-validated.

| ID | Severity | Residual | Resolution |
| --- | --- | --- | --- |
| PA-V-001 | 🟡 MINOR | AR-11 omitted the tenant `08-handoff.md` and directly affected documentation. | AR-11 now names both, with exact paths required before editing. |
| PA-V-002 | 🟡 MINOR | pnpm 4.6/6.4 metadata targets were inverted; the deferred `Progress` header and final audit were incomplete. | 3.3.3 owns 4.6 lines 192/195/255; 4.2.3 owns 6.4 lines 214/235; 1.2.2/5.1.2 cover the deferred `Progress` and final audit. |
| PA-V-003 | 🟡 MINOR | Inventory-update trigger covered only `packages/server/tests`. | 03-02 now names all five counted trees and their exact counts. |
| PA-V-004 | 🟡 MINOR | Task 2.1.2 pointed repair subtasks at `03-02` instead of the execution plan. | Reworded to the current phase in `99`, following 03-02. |
| PA-V-005 | 🟡 MINOR | Terminal handoff medium and failed-final-CI disposition were ambiguous. | The handoff is the external execution report; a failed final CI is recorded there and stops completion; a corrective commit needs explicit user authorization. |
| PA-V-006 | 🔵 OBSERVATION | Roadmap-sync validation used a bare command name. | Corrected to `${CODEOPS_PLUGIN_ROOT}/scripts/codeops-roadmap-sync.sh --check`. |

Post-fix structural verification: 42 unique tasks, phase totals 7/6/11/6/5/7, all pending; all
relative links resolve; AR-1–15 and local/repository ST references valid; no raw mutating Git
commands; command/selector paths match the repository. Iteration-2 verified artifact hash:
`sha256:11cb83305717f8fccdce56496b707d5b022b236ff4153e6adbb5ac3f8254c1d5`.

## Verified Clean / Not Findings

| Area | Result |
| --- | --- |
| Task arithmetic | 42 unique tasks; phase counts 7/6/11/6/5/7; header and phase table agree. |
| Requirement/task traceability | R1–R10 and ST-1–19 each have task/verify anchors. |
| Source-plan line references | Automated release 101–102; deferred invitations 260–262; tenant 230; pnpm 192/214/195/235; assurance umbrella 882/943/1078/1082 — all exact. |
| Historical commits/tags | PR #130 `0b796e7b`, #131 `fb11f971`, #140 `0c820650`, feature `27a31452`; `v1.11.0` ancestry confirmed. |
| CI contract | Six named jobs on all-branch push/PR; both `porta-ci` and `porta-harness-ci` scopes are configured. |
| Commands/selectors | `assurance:test --select assurance-ratchets`; five compat selectors; both coverage project/profile pairs; only `coverage-baseline` seed; `assurance:validate` takes no options. |
| Ratchet schema | Security-only admission; `local-observation-only`; both `promotionAuthorized` false. |
| Scope creep | No new runner, parser, service, dependency, workflow gate or policy engine; five-selector/two-capture matrix is user-approved. |
| Release/merge ancestry | v1.11.0 release and develop sync exist; #196 CI run `41242822065` has six green jobs. |
| Branch protection | No protection/rulesets today; the plan's protection contingency is moot but not harmful if PF-011 is resolved. |

## Gate Handling

The artifact is **PASSED**. All iteration-1 and iteration-2 findings are resolved; no
critical/major/minor/observation remains open. No repository files were changed during preflight;
only the staged plan and its report were edited. This report is the durable audit trail;
`_preflight-notes.md` is session-only and is removed after the scan.

**Next:** promote the plan and execute with `exec-plan` from the iteration-2 verified hash. If the
artifact changes materially after this pass, re-check the changed sections before execution; do not
treat this pass as validating a later, different document set.
