# Findings: Porta Roadmap Closeout

> **Parent**: [Execution plan](99-execution-plan.md)
> **CodeOps Artifact Schema**: 1

| Finding | Phase | Severity | Area | Ruling |
| --- | --- | --- | --- | --- |
| RV-001 | 1 | MAJOR | historical-evidence | fixed |
| RV-002 | 1 | MINOR | docker-chronology | fixed |
| RV-003 | 1 | MINOR | workflow-evidence | fixed |
| RV-004 | 1 | MINOR | evidence-contract | fixed |
| RV-005 | 1 | OBSERVATION | roadmap-scope | fixed |
| RV-006 | 1 | MINOR | preflight-correction | fixed |
| RV-007 | 1 | MINOR | findings-link | fixed |
| RV-008 | 1 | OBSERVATION | failure-cause | fixed |
| RV-009 | 1 | OBSERVATION | adjacent-record | accepted |
| RV-010 | 2 | MAJOR | audit-visibility | fixed |
| RV-011 | 2 | MINOR | evidence-st-verdict | fixed |
| RV-012 | 2 | MINOR | case-size | fixed |
| RV-013 | 2 | MINOR | tenant-derived-state | fixed |
| RV-014 | 2 | MINOR | portfolio-deviation | fixed |
| RV-015 | 2 | MINOR | image-cleanup | fixed |
| RV-016 | 2 | MINOR | adapter-documentation | fixed |
| RV-017 | 2 | MINOR | audit-order-regression | fixed |
| RV-018 | 2 | MINOR | observer-comparison | fixed |
| RV-019 | 3 | MINOR | baseline-review-reason | fixed |
| RV-020 | 3 | MINOR | digest-formulas | fixed |
| RV-021 | 4 | MINOR | graph-status | fixed |
| RV-022 | 4 | MINOR | cache-reuse-wording | fixed |
| RV-023 | 4 | MINOR | cache-evidence-contract | fixed |
| RV-024 | 5 | MINOR | dev-dependency-advisory | fixed |
| RV-025 | 5 | MINOR | digest-delta-attribution | fixed |
| RV-026 | 5 | MINOR | stale-ratchet-claim | fixed |

RV-001 user ruling: correct the publish chronology and retain the AR-14 closure. No re-release or
new publication was authorized. The rejected alternative was reopening task 7.1.5.

Phase 2 review: no CRITICAL or MAJOR finding. RV-011–RV-018 are minor/observational corrections,
all fixed in the same phase. RV-014 records the exact-row portfolio deviation and amends the
defer-all wording; RV-017 adds ordering assertions to the two existing route test files.

Baseline proposal review: **APPROVE** with no blocking finding; RV-019 (review reason must name the
RD-05 content refresh) and RV-020 (record the two digest formulas) were documentation-only and are
fixed. No covered-count floor is lowered.

Baseline user approval: **2026-11-01 13:23**, exact values in 3.2.4; no promotion authorized.

Phase 4 independent review: **REMOTE EVIDENCE CONSISTENT** after three minor corrections. RV-021
records the current SBOM 200/direct-package state while keeping the project/transitive graph absent;
RV-022 distinguishes the GHA import from local compose layer reuse and key `#2` as the run's own
export; RV-023 adds exact job IDs and the terminal miss rule. No blocker or major finding was raised.
**pnpm 6.4 must remain blocked**; zero alerts and the boot-document manifest are not project graph
ingestion.

Closeout stop ruling: on **2026-11-01 14:47** the user selected **Stop at blocked gate**. Phases 5–6
were not started; no PR, merge, release, or `main` change was made. T-07 remains Blocked and pnpm
6.4 remains `[!]`. A separate dependency-policy plan is required before retrying the graph gate.

Fix and resume ruling: on **2026-11-01** the user asked to fix the graph problem. The accepted fix is
`pmOnFail: ignore` plus a single-document lockfile; the `packageManager` pin and the explicit pnpm
12.15.0 installs in CI and Docker remain. PR #213 merged to `develop` as `c4c30711`; the structure
contract now rejects a restored boot document. `dependency-graph/compare/main...develop` shows 936
project packages added and exactly 15 boot-document entries removed. pnpm `6.4` is complete at 44/44
and the closeout resumed at Phase 5. The default branch updates on the next release; no release or
`main` change was made.

Phase 5.1.1 audit: two moderate Vitest alerts appeared after Dependabot alerts were enabled. The
advisory is a dev-server path-traversal issue, patched in 4.1.11. Root, server, SDK and CLI were
updated with `@vitest/coverage-v8` 4.1.11; unit 6,259/6,259, structure 158/158 and a frozen install
pass. The default-branch alerts close on the next release; no active unproved claim remains.

Dependency-digest review: the current `dependency` digest is `sha256:7735f69b…`, not the approved
`sha256:c12dad3a…`. The delta covers both the PR #213 lockfile normalization and the Vitest 4.1.11
patch; it is not Vitest-only. Only the dependency input changed; coverage counts, paths, enforcement
and promotion flags are unchanged. The 5.1.1 table's "ratchet 10/10" was a baseline-checkpoint fact,
not a current result; it is corrected to pending refresh. The user approved the new digest on
2026-11-01 16:54; both baseline authorities now use `sha256:7735f69b…`, the review reason names both
changes, and the ratchet suite passes 10/10. RV-025 and RV-026 are fixed.
