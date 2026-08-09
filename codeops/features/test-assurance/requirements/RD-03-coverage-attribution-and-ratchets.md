# RD-03: Coverage Attribution and Ratchets

> **Document**: RD-03-coverage-attribution-and-ratchets.md
> **Status**: Complete
> **Created**: 2026-08-09
> **Project**: Porta Test Assurance
> **Depends On**: RD-01, RD-02
> **CodeOps Artifact Schema**: 1

---

## Feature Overview

Coverage becomes honest execution evidence rather than a vanity score. This requirement repairs
assembled-server attribution, preserves provenance across processes, establishes reproducible exact
baselines, and introduces staged no-regression ratchets only after measurement is trustworthy
(AR #13, AR #14).

## Functional Requirements

### Must Have

- [ ] **R3.1 (L)** Capture raw V8 coverage from the Dockerized Porta Node process used by the
      harness and persist it through a mounted harness-owned directory (AR #13).
- [ ] **R3.2 (L)** Stop the instrumented server cleanly so raw coverage is flushed; missing or
      truncated server coverage shall mark the report incomplete rather than zero-covered.
- [ ] **R3.3 (L)** Remap compiled `dist` ranges through matching source maps to repository source and
      bind the report to exact source commit, image digest, build command, Node version, and package
      lock revision.
- [ ] **R3.4 (M)** Keep Vitest worker, harness server, browser/client, SDK, and CLI coverage distinct
      until path normalization and matching-build merge equivalence is proven.
- [ ] **R3.5 (M)** Merge only reports built from identical source and compatible instrumentation;
      reject stale, foreign, or ambiguously mapped inputs.
- [ ] **R3.6 (M)** Every report shall include exact covered/total statement, branch, function, and
      line counts, exclusions, unmapped ranges, deferred processes, and collection failures.
- [ ] **R3.7 (M)** Establish a reproducible observation-only baseline before any new coverage gate;
      the existing 80/75 thresholds shall not become blocking while attribution is incomplete.
- [ ] **R3.8 (M)** After baseline acceptance, enforce exact no-regression counts and changed-surface
      evidence; rounded percentages alone shall not decide pass/fail (AR #14).
- [ ] **R3.9 (M)** Per-risk-slice floors may increase only when the slice meets RD-01 completion and
      RD-06 sensitivity evidence; coverage cannot close a claim by itself.
- [ ] **R3.10 (M)** Generated coverage output shall remain ignored, reproducible, and excluded from
      commits.

### Should Have

- [ ] **R3.11 (M)** Security-sensitive changed code should report changed lines and changed branches
      separately from the legacy global baseline.
- [ ] **R3.12 (S)** Reports should identify suspicious metric changes without corresponding source
      or test changes and mark them for review.

### Won't Have (Out of Scope)

- Immediate enforcement of the currently failing global thresholds (AR #14).
- Treating UI/client execution as server execution.
- Using coverage as proof of oracle correctness or exploit absence.

## Technical Requirements

### Coverage Evidence Model

| Report         | Process                              | Merge state                             |
| -------------- | ------------------------------------ | --------------------------------------- |
| Vitest         | Unit/integration/e2e/pentest workers | Existing source coverage                |
| Harness server | Dockerized compiled Porta process    | Remapped separately first               |
| Browser        | Chromium application/client code     | Separate and optional for server claims |
| Packed SDK/CLI | Consumer processes                   | Separate compatibility evidence         |

### Reproducibility Check

Two clean runs at the same commit and fixture selection shall produce identical total executable
counts and no material path-set difference. Covered counts may differ only when a documented
nondeterministic branch is identified and removed before gate promotion.

### Rollout

1. Observation-only artifact.
2. Stable exact baseline and exclusions.
3. Exact global no-regression ratchet.
4. Changed-line and changed-branch checks for sensitive modifications.
5. Per-slice floors that rise after audited closure.

Gate promotion is a separate repository-policy change and is not implicitly authorized by
producing a baseline (AR #14).

## Integration Points

- RD-02 owns server lifecycle, mounted paths, and clean shutdown.
- RD-01 records coverage provenance and incomplete areas.
- RD-05 identifies security-sensitive changed surfaces.
- RD-06 prevents high coverage from masking surviving faults.
- RD-07 owns staged CI execution and promotion evidence.

## Scope Decisions

| Decision           | Options Considered                        | Chosen                         | Rationale                                           | AR Ref |
| ------------------ | ----------------------------------------- | ------------------------------ | --------------------------------------------------- | ------ |
| Server attribution | Accept zeros / worker server / process V8 | Process V8 with source maps    | Preserves real Docker boundary                      | AR #13 |
| Enforcement        | Immediate threshold / advisory / ratchet  | Observation then exact ratchet | Prevent regression without blocking on invalid debt | AR #14 |
| Merge              | Always / never / proven compatible        | Proven matching-build only     | Avoid false combined metrics                        | AR #13 |

## Security Considerations

- **Data sensitivity**: Coverage paths may expose internal layout; CI artifacts follow repository
  access controls and contain no runtime request data.
- **Input validation**: Canonicalize artifact paths and reject traversal, absolute foreign roots,
  symlinks leaving the expected tree, and build-ID mismatches.
- **Authentication and authorization**: No runtime endpoint exposes coverage.
- **Injection risks**: Coverage conversion commands receive explicit arguments, never interpolated
  branch names or artifact text.
- **Encryption**: Existing CI artifact transport/storage protections apply.
- **Rate limiting**: Not applicable.
- **Infrastructure**: `NODE_V8_COVERAGE` is assurance-only container configuration and never enabled
  in production deployment assets.

## Acceptance Criteria

1. [ ] A harness run produces a non-empty raw server-process V8 dataset and a remapped report bound
       to the exact commit and image digest.
2. [ ] `src/server.ts` and OIDC/provider startup are attributed when exercised by the harness, or
       the report explicitly marks their ranges unmapped/incomplete instead of reporting false 0%.
3. [ ] A mismatched build/source-map input is rejected with a non-zero exit and identifies the
       mismatching build identity.
4. [ ] Two clean runs at one revision have identical total statement, branch, function, and line
       counts and identical normalized source-file sets.
5. [ ] The report lists every excluded source glob and every process not included in the metric.
6. [ ] The baseline phase changes no existing CI pass/fail result.
7. [ ] After ratchet implementation, reducing one covered branch without changing totals fails the
       ratchet even when the displayed rounded percentage is unchanged.
8. [ ] Coverage generation leaves the Git worktree unchanged apart from explicitly planned source
       or configuration changes.
