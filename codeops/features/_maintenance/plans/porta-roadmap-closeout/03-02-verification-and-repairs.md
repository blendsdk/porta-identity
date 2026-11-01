# Active Verification and Bounded Repairs

> **Parent**: [Index](00-index.md)
> **Requirements**: R3, R5–7, R10
> **Authority**: AR-4/7/8/9/11/12/13
> **CodeOps Artifact Schema**: 1

## Prerequisites

Use an up-to-date develop-derived feature branch and a clean verified checkpoint; fetch and branch
from `origin/develop` (`c73cc744` at planning), not the stale local `develop`. Confirm the
installed tool versions and available registered selectors from source/help. Do not use the old
bare `assurance:compat` command: the dispatcher requires `--select` (AR-7/9/11).

The user approved AR-12 (enable the dependency graph and Dependabot alerts, then re-observe) and
AR-13 (bounded repair of the existing harness cache/log path). Before either change, record the
exact prior state and name the exact repository setting or existing source/test paths; do not
change unrelated security settings, workflow gates or infrastructure.

Before a runner touches any protected path, obtain explicit current-conversation approval for
that exact path and purpose. The existing tools may create/read local runtime credentials; their
approval in the #196 session is not inherited. Do not inspect credential stores to discover what
needs approval. Resolve required paths from non-secret runner code, then ask (AR-11).

Run existing commands serially where they share lifecycle ownership. Save transient logs under
the approved task temp root, with only sanitized results in durable evidence. Keep the working
tree unchanged until each provenance-bound run ends (AR-7/8).

## Compatibility Matrix

Run each of these registered selectors. Their common package loading does not make their distinct
journeys interchangeable (AR-9).

| Selector | Required evidence boundary |
| --- | --- |
| `compatibility` | Packed surfaces, dist-only loading, archive resolution and isolated credential outcomes |
| `tenant-admin` | Live packed tenant/admin journeys |
| `admin-data` | Live administrative-data journeys |
| `p1-admin` | Live packed P1 administrative read journeys |
| `protocol` | Live packed protocol SDK/CLI journeys |

For each run record the exact source, image and fixture identities, archive/content checks,
selector, result classification, primary-tree integrity and cleanup. A failure blocks pnpm 4.6;
do not substitute another selector or claim the foundation selector covers them all (AR-8/9).

## Coverage Captures

| Capture | Purpose |
| --- | --- |
| `protocol / operational / coverage-baseline` | The original pnpm migration's coverage path and dependency/source mapping check |
| `security / production-security / coverage-baseline` | Evidence compatible with the existing security-only ratchet admission and previous production-security baseline |

Require correct project/profile, complete flush, real instrumented runtime observations,
nonempty canonical source mapping and the runner's provenance/cleanup contract. Verify the
dependency inventory comes from the current pnpm-built image. Never substitute protocol totals
for a security baseline or merge incompatible profiles (AR-8/9).

Capture new evidence before changing baseline expectations. Existing registered checks may
already be green; document that honestly rather than manufacturing a red run (AR-7/8).

## Reviewed Baseline Update

1. Run the existing ratchet selector on the frozen old baseline and record each stale input or
   failed assertion. Inspect requirement, fixture, dependency and sentinel inputs separately;
   do not assume only the two historically mentioned digests changed (AR-8/9).
2. Compare old/new coverage counts, denominators, normalized source paths and content identities.
   Explain removed paths, lowered coverage and changed totals. A new capture is not permission to
   lower the baseline or disregard a regression (AR-4/9).
3. Build a value-specific proposal in `08-closeout-evidence.md`: old/new reviewed inputs, capture
   source/run, counts/path digests, comparison, semantic reason and exact file changes (AR-9).
4. Obtain independent security/provenance review and the user's explicit ruling on that proposal.
   Stop if declined or if unexplained differences remain. This plan's approval does not approve
   future values (AR-4/9).
5. Only after approval, update `test-harness/assurance/ratchet-baselines.json` and the corresponding
   reviewed values in `test-harness/assurance/tests/assurance-ratchets-requirements.ts`. Show the
   baseline coverage block and the reviewed fixture block side by side in the proposal; the
   independent reviewer records exact equality of source/run/digests/counts and the two digest
   formulas. Record real review authority/date. Preserve the monitored path scopes unless an
   additional exact ruling authorizes a change. Keep observation-only enforcement and both
   promotion flags false (AR-9/11).
6. Run the unchanged ratchet specification/implementation checks, relevant type/lint checks and
   structure contracts. Commit a clean checkpoint through the git-commit skill; run current
   `assurance:validate` and the ratchet selector against that committed state (AR-7/9).
7. Re-run the ratchet selector on the exact PR head and the merge commit, and record both results.
   A changed monitored digest (requirement, fixture, dependency or sentinel) reopens step 3 and
   requires a new value-specific ruling; `pnpm verify` does not run this suite, so it cannot be
   skipped. A lower baseline is never accepted merely because the current capture produced it.

Historical captures keep their original revision. Baseline-only and later evidence-only commits
do not retroactively change it. If a *current governed report* is required by a finding, it needs
matching validation and security coverage on the same current clean revision under the existing
report contract; do not reuse mismatched artifacts or broaden report scope to force a pass (AR-8).

Retain sanitized facts/digests and the approval before removing owned generated reports. Note
that those original ephemeral paths are no longer available, rather than implying permanent raw
artifact retention. No raw coverage/runtime tree is committed (AR-7/8/11).

## GitHub Dependency and Cache Evidence

For pnpm 6.4, inspect existing GitHub data read-only first (AR-7/8/12/13):

- **Known remote state.** At planning, Dependabot alerts were disabled (403), the dependency-graph
  SBOM endpoint returned 404, GraphQL `dependencyGraphManifests` returned 0, and 84 Dependabot
  version-update PRs targeted `main` (1 targeted `develop`). Record this state before changing it.
- **Dependency graph and alerts.** Apply AR-12: enable the repository dependency graph and
  Dependabot alerts, then re-observe. Match dependency-graph/SBOM ingestion to the relevant
  default-branch revision and pnpm lockfile. Check expected direct workspace dependency
  names/versions and representative transitive entries; a nonzero graph or an old manifest-only
  graph is insufficient. Confirm alert availability after the setting change. If the setting
  change is declined or the graph still cannot process the lockfile, keep 6.4 blocked and stop for
  a dependency-policy ruling. Do not silently change pnpm version, lockfile format, ignore policy,
  repository security settings or CI (AR-4/11/12).
- **Dependabot processing.** Version-update PRs are evidence that Dependabot parsed the lockfile,
  but most target `main`, which is off limits during this closeout. Record that limitation; do not
  reconfigure the workflow without a separate ruling.
- **Harness cache.** At planning there were 874 GitHub Actions caches and **zero** keys matching
  `porta-harness-ci`; `porta-ci` keys existed, and the harness build output is buffered by
  `test-harness/fixtures/lifecycle-runtime-command.ts:48-53`. Apply the AR-13 bounded diagnostic:
  confirm the compose overlay is applied, determine whether the GHA export fails silently, and
  make build progress visible without weakening tests. Name the exact existing paths before
  editing; no new workflow. Then re-observe both scopes across two ordinary pushes: a first
  cache-producing run and a subsequent cache-importing run per scope. A cache export, a fast run,
  or a warm pnpm store alone does not prove Docker layer reuse (AR-8/13).
- **Window and terminal rule.** Inspect the first closeout push and the next push/PR run for each
  scope. If neither shows cache import/reuse, record the miss, keep 6.4 blocked, and stop with the
  exact job URLs; do not wait indefinitely or claim success from one ambiguous run.

Record exact run/job URLs and sanitized cache observations. Treat API permission failure as
unverified access, not as an empty safe result. The branch workflow remains read-only; a required
workflow/configuration repair needs explicit authorization for that path/scope before any edit.
Baseline permission does not grant this authority (AR-11/13).

## Bounded Repair Procedure

This is a conditional procedure, not a speculative implementation mandate (AR-4):

1. Preserve the original failure and identify the violated existing requirement, smallest cause
   and exact source/test paths. Record it in the owning plan and this register.
2. A bounded repair in a named existing source/test path is inside AR-11's boundary. Obtain a
   specific ruling first only when the repair changes an immutable oracle/expectation, the reviewed
   baseline, dependency policy, workflow/configuration, a protected file, or a material support
   surface (AR-4/11).
3. Before implementation, add numbered subtasks to the active execution phase for the exact
   repro/specification, distinct red verification, repair, green verification and meaningful
   implementation checks. Update its task total. Use `[feature].spec.test.ts` and
   `[feature].impl.test.ts` beside existing relevant tests; keep spec expectations independent.
   Reuse a sufficient existing test file where practical. When adding a physical test file under
   any counted tree, update the exact inventory counts in
   `repo-tests/monorepo/server-package.spec.test.mjs`: server unit/integration/E2E/pentest 386,
   UI 26, SDK 57, CLI 104, harness 6 (at planning). If an assurance test is added, update
   `test-harness/assurance/test-inventory.json` if that inventory covers it; then run structure.
4. Reuse a sufficient existing failing immutable specification rather than adding duplicate
   coverage. Never weaken its assertions, timeouts or test selection to obtain green.
5. Apply the smallest repair; verify the exact failure is gone and unrelated invariants still
   hold. Run the applicable security/category checks listed in 07; obtain independent review.
6. Commit the repaired source before re-running provenance-bound commands. Re-run any earlier
   evidence made stale by that source change, not every unrelated historical check.

Documentation-only corrections get direct artifact validation, not new test infrastructure.
If no defect exists, record the diagnostic outcome; do not create code merely to satisfy a plan
template. Accepted exclusions under AR-10 are not repair tasks. The AR-13 harness cache/log
diagnosis is a bounded repair in existing test-harness paths, not a material new support surface;
it still requires the exact paths to be named before editing.

## Command and Failure Ownership

The exact execution commands and expected outcomes are owned by [07](07-testing-strategy.md).
All nonzero results retain the repository taxonomy. A newly failed assertion or new incomplete
active claim blocks completion; an unrelated known excluded gap remains visible with its exact
scope and original classification. Never use the broad `assurance:all` aggregate as a shortcut.
