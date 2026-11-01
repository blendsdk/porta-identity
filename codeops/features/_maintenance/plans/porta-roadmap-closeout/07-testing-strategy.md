# Testing Strategy: Porta Roadmap Closeout

> **Parent**: [Index](00-index.md)
> **Authority**: AR-7–15
> **CodeOps Artifact Schema**: 1

## Approach

This is an evidence/maintenance plan, not a new application feature. Most specifications are
artifact acceptance cases evaluated against existing records and commands. Do not create a new
runner or automated test suite for reversible Markdown corrections. Existing security and
ratchet specifications remain the oracles (R1–8).

Plan-local cases are **ST-1–19**. Repository assurance requirements use their own IDs
(`ST-42…ST-73`, e.g. `ST-46`) and are not part of this table; a reference such as “ST-46” in
`03-01` means the repository requirement, not a local acceptance case.

Every behavioral repair follows a distinct specification → observed red → implementation →
green → meaningful implementation-check sequence before broader verification. If an existing
spec already supplies the repro, reuse it. Add a regression only for a demonstrated uncovered
behavior; record its exact path before implementation under 03-02 (R7).

## Specification Test Cases

| ID | Input / scenario | Expected outcome | Source |
| --- | --- | --- | --- |
| ST-1 | Open rollout task plus matching merged PR and successful exact-revision CI | Only the proved integration obligation is eligible for completion; publication remains separately assessed. | R1/R2; 03-01 Admissibility |
| ST-2 | Published tag/GitHub Release exists, but package provenance, image or develop-sync proof is absent | Composite artifact task remains unproved; no replacement release is dispatched. | R2; AR-1/8 |
| ST-3 | Historical failed run followed by a diagnosed fix and exact matching successful evidence | Preserve the failed run and resolution; add the new proof without rewriting history. | R1/R10; AR-8 |
| ST-4 | Aggregate tenant harness success with no retained case-level result | Original failed probe is not closed; use a fresh registered run when equivalent proof is absent. | R3; 03-01 Tenant-Management Blocker |
| ST-5 | Current production-security run includes password-reset-throttled-request, required rejection observation, controls and unchanged/applicably approved case set; cleanup passes | Tenant task may close after independent comparison of source, cases and old exit-40 baseline. | R3; AR-8 |
| ST-6 | Exit 0 accompanied by a missing probe, weakened assertion or unexplained observer disappearance | Reject the closure claim; retain a blocker and investigate. | R3/R10; AR-8/10 |
| ST-7 | Completed DEF-8/DEF-13 successor plus an original task containing an unproved M2 control requirement | Record narrow supersession and keep that original obligation incomplete; no blanket assurance credit. | R4; 03-01 Assurance Umbrella and Residuals |
| ST-8 | Successful current checks while DEF-23 or a named campaign is excluded | Exclusion stays open with owner/revisit trigger; no timing threshold, campaign implementation or “fully production ready” claim. | R4; AR-10 |
| ST-9 | Protocol/operational capture offered as the security ratchet baseline | Reject substitution; require a separate security/production-security capture with fixed registered seed. | R5; AR-9 |
| ST-10 | Old/current baseline inputs or coverage counts differ without an approved proposal | Record differences and fail the applicable current-input gate; do not silently regenerate reviewed values. | R5; 03-02 Reviewed Baseline Update |
| ST-11 | Exact reviewed proposal is approved and its baseline JSON/fixture values match capture identities | Existing ratchet checks and current validation pass; enforcement stays local-observation-only and both promotion flags stay false. | R5; AR-9 |
| ST-12 | Bare compat command or only the foundation selector passes | Insufficient evidence for the matrix; run all five explicit approved selectors and retain each result/provenance/cleanup. | R5; 03-02 Compatibility Matrix |
| ST-13 | Dependabot has no alerts but current lockfile ingestion is absent, stale or unverifiable | Remote gate stays open; zero alerts is not a processing-success signal. | R6; 03-02 GitHub Dependency and Cache Evidence |
| ST-14 | Expected current graph/lockfile identities and processing are verified, alerts are accessible, and both image scopes show real cache restoration/reuse | pnpm remote obligation may close with exact job/run evidence. | R6; AR-7/8 |
| ST-15 | Build is fast or exports a cache but no actual eligible cached layers/import are observed | Cache gate stays unproved; do not use timing alone or a warm package store as substitute. | R6; AR-8 |
| ST-16 | Required check finds a bounded defect in an approved existing component | Preserve failure; specification/red precedes repair; green and relevant regression/security checks follow. Reviewed-baseline, immutable-oracle/expectation, dependency-policy, workflow/configuration or material-support-surface changes still require their ruling. | R7; AR-4/11 |
| ST-17 | Legacy helper reports zero tasks while the document has verified numbered tasks | Inspect unique original tasks and separate deliverables/examples; do not reset feature status or invent a parser. | R8; 03-01 Legacy Counters and Metadata |
| ST-18 | Feature branch has updated source task states but portfolio is stale | Sync feature rows immediately; defer portfolio write until develop, then publish and verify its permitted integration checkpoint. | R8/R9; 03-03 |
| ST-19 | Source or PR head changes after verification, or cleanup fails | Reassess affected proof; exact final-head CI and owned cleanup are mandatory before handoff. No force push or removal of unowned resources. | R9/R10; 03-03 |

## Existing Test Bindings

| Concern | Existing oracle/check |
| --- | --- |
| Tenant failed probe | `test-harness/assurance/tests/human-auth-recovery.spec.test.ts` and its case requirements; production-security live adapter |
| Ratchet acceptance / fixture consistency | `test-harness/assurance/tests/assurance-ratchets.spec.test.ts`, `assurance-ratchets.impl.test.ts`, `assurance-ratchets-requirements.ts` |
| Coverage identity and policy | `coverage-envelope-and-provenance.spec.test.ts`, `coverage-observation-policy.spec.test.ts`, `coverage-mapping-and-reproducibility.spec.test.ts` in the same tests directory |
| Coverage internals, if a repair touches them | Existing `coverage-capture.impl.test.ts`, `coverage-dependencies.impl.test.ts`, `coverage-orchestration.impl.test.ts` |
| Packed-client boundaries | Existing compatibility command's selected foundation/live journey checks |
| Artifact/status/link correctness | Direct read-only checks against ST-1–8/ST-17–19 and the original task owners; no new mirrored tests |

Use independent spec-author packets for any new regression: supply the violated behavior and
acceptance case, not a proposed implementation. Add only the necessary `.spec.test.ts` and
`.impl.test.ts` files beside the affected tests. Ordinary baseline fixture updates require the
AR-9 ruling and retain all existing invariants; they are not permission to redefine an oracle.

## Verification Commands

Run from repository root during execution, not during planning or preflight.

| Gate | Command / observation | Acceptance |
| --- | --- | --- |
| First local selection | `pnpm test:changed` | Pass; if nothing relevant is selected, use the smallest applicable category |
| Every commit | `pnpm test:structure` plus affected workspace checks | Pass |
| Ratchets | `pnpm assurance:test --select assurance-ratchets` | Preserve initial failures; require post-ruling green on the PR head and merge commit; any changed digest reopens 3.2.4 |
| Repository settings | Read-only prior-state capture, then the AR-12 settings change and re-observation | Alerts/graph enabled; ingestion and alert availability proved; prior 403/404/0-manifest state recorded |
| Harness cache | AR-13 diagnosis/repair, then two ordinary pushes per scope | First run exports, next run imports/reuses; exact job URLs and cache keys recorded; no timing substitute |
| Foundation compatibility | `pnpm assurance:compat --select compatibility` | Exit 0 with required provenance and cleanup |
| Tenant compatibility | `pnpm assurance:compat --select tenant-admin` | Same, plus its live journey obligations |
| Admin-data compatibility | `pnpm assurance:compat --select admin-data` | Same, plus its live journey obligations |
| P1 compatibility | `pnpm assurance:compat --select p1-admin` | Same, plus its live journey obligations |
| Protocol compatibility | `pnpm assurance:compat --select protocol` | Same, plus its live journey obligations |
| Migration coverage | `pnpm assurance:coverage --project protocol --profile operational --seed coverage-baseline` | Valid nonempty capture with complete flush, mapping and cleanup |
| Security baseline coverage | `pnpm assurance:coverage --project security --profile production-security --seed coverage-baseline` | Matching security capture; capture alone does not authorize baseline acceptance |
| Current validation | `pnpm assurance:validate` | Exit 0, source-bound validated evidence on a clean checkpoint |
| Tenant security closure | `pnpm assurance:harness --project security --profile production-security` | Exact retained-case/observer proof; no new gaps or failures |
| GitHub graph / Dependabot | Read-only prior-state capture, AR-12 settings change and re-observation | ST-13/14; ingestion and alert availability proved; disabled/inaccessible is unverified |
| Docker cache | AR-13 diagnosis/repair, then first-export and next-import logs for both scopes | ST-14/15; actual reuse for both scopes; no timing substitute |
| Product/security repair | Narrow affected workspace tests, lint/typecheck/build; `pnpm test:pentest` and applicable assurance gate for security behavior | All affected obligations pass; no assertion weakening |
| New test file | Update exact physical inventory counts in `repo-tests/monorepo/server-package.spec.test.mjs` (and `test-harness/assurance/test-inventory.json` if applicable), then run structure | Counts match; test is not removed or weakened |
| Browser / retained SPA-BFF repair | `pnpm test:ui` / `pnpm harness:test` when the respective boundary changes | Pass; no redundant new browser harness |
| Public docs repair | `pnpm docs:build` if public documentation changes | Pass; maintainer/plan docs get link/content validation |
| CI authoritative gate | CI's `pnpm verify` plus UI, OIDC, docs, production Docker build and dependency audit jobs | All six jobs pass on exact PR and integration heads |

The project's local-full-suite exceptions remain applicable if a repair genuinely changes shared
test infrastructure; do not expand local testing merely because the closeout touches many Markdown
owners. Repeating a failed security run requires a diagnosed correction or demonstrated execution
cause, not a search for a lucky pass (AR-7/8).

## Exit and Evidence Interpretation

Use the taxonomy in `test-harness/assurance/README.md`: 0 success; 20 product failure; 21 test
failure; 30 setup; 40 incomplete coverage; 50 invalid assurance; 60 cleanup; 70 timeout;
130/143 interruption. Record the actual class. A prior accepted exit 40 applies only to its exact
named observations; it never authorizes a new incomplete active gate. Do not call any nonzero
outcome fully passed (AR-7/8/10).

Coverage goals are provenance-correct observations and no unexplained regression against the
explicitly reviewed baseline, not a new percentage target. Current governed reporting, if required,
must use its existing same-revision admission contract (AR-9).

## Read-only Evidence Commands

Record the exact output/URL, not only a conclusion. These are inspection commands; they do not
authorize publication, deployment, or a settings change.

| Evidence | Command | Expected observation |
| --- | --- | --- |
| PR merge | `gh pr view <n> --json state,mergeCommit,mergedAt,baseRefName` | `MERGED`, expected base and merge commit |
| CI run | `gh run view <id> --json conclusion,headSha,jobs` | Success on the expected head; the six named jobs |
| Release | `gh release view <tag> --json tagName,publishedAt,isDraft` | Published, expected tag/time |
| npm provenance | `npm view @portaidentity/server@<version> dist.attestations --json` | Provenance present |
| Docker image | `docker manifest inspect <image>:<tag>` | Expected tag/digest |
| Ancestry | `git merge-base --is-ancestor <commit> <tag>` | Exit 0 |
| Dependency graph | `gh api repos/<owner>/<repo>/dependency-graph/sbom` | 200 with expected packages after AR-12 |
| Dependabot alerts | `gh api repos/<owner>/<repo>/dependabot/alerts` | 200 after AR-12; disabled/inaccessible is unverified |
| Cache keys | `gh api 'repos/<owner>/<repo>/actions/caches?per_page=100' --paginate` | Keys for both scopes; correlate with run logs |
| Build cache use | Buildx log lines `importing cache manifest` / `CACHED` | Actual import/reuse for each scope |

## Plan and Documentation Validation

During planning, validate all local Markdown links, required documents, AR/R/ST references,
unique execution IDs, phase totals and specification-first ordering without running services or
repository-writing checks. During execution, run this checklist at each "document validation"
checkpoint and record the result in `08-closeout-evidence.md`:

1. Required documents exist; `Implements` maps to `_maintenance/T-07`.
2. Every relative Markdown link resolves; anchors and file names are current.
3. Every AR/R/ST reference exists; local ST-1–19 are distinct from repository ST-42–73.
4. Exactly 44 unique task IDs; phase totals are 7/8/11/6/5/7 (or the amended total after an
   authorized repair).
5. `python3 "${CODEOPS_PLUGIN_ROOT}/scripts/codeops_plan.py" --root . --json` reports no structural
   problem for this plan; legacy zero-task reports for other plans are noted, not “fixed” by
   inventing tasks.
6. `${CODEOPS_PLUGIN_ROOT}/scripts/codeops-roadmap-sync.sh --check` shows only expected tenant
   counter drift; no fabricated counters.

The helper checks required documents, `Implements` and task/blocked shape. It does **not** check
Markdown links; step 2 is a manual review. Do not introduce tests for the fact that a particular
Markdown line was edited. ST-1–19 are reviewable acceptance cases, with executable coverage
supplied by the existing boundaries above.
