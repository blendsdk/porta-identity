# Testing Strategy: Automated Release

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

The release path has no product behavior to unit-test; its correctness is the workflow topology,
the script contracts, and two live rehearsals (a safe `dry_run` and one real release). Structural
assertions live in `repo-tests/monorepo/` and run under `yarn test:structure`.

### Coverage Goals

| Code type | Target |
| --- | --- |
| Release workflow topology | Exact structural assertions |
| Script contracts | Exact |
| Live release | One `dry_run` rehearsal + one real release |

## 🚨 Specification Test Cases (MANDATORY — NON-NEGOTIABLE)

Expectations derive from [01-requirements.md](01-requirements.md),
[03-01](03-01-release-workflow.md), and [03-02](03-02-develop-sync.md).

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-1 | Parse `.github/workflows/release.yml` | Only `workflow_dispatch` is defined (no `workflow_run`); inputs `bump` (choice auto/patch/minor/major, default auto) and `dry_run` (boolean) | Req R1 / AR-2, AR-3 |
| ST-2 | Read workflow permissions and publish env | `contents: write`, `id-token: write`, `actions: write`; no `NPM_TOKEN`/`NODE_AUTH_TOKEN`; `release:publish` keeps `--provenance`; published-state and integrity checks retained | Req Sec / AR-10 |
| ST-3 | Read the workflow steps | Contains `lockstep version`, `yarn release:preflight`, `lockstep publish`, an explicit `git push` of the commit and `refs/tags/`, `gh release create --verify-tag --notes-file RELEASE_NOTES.md`, and a `docker.yml` dispatch | Req R3/R4/R5 / AR-6 |
| ST-4 | Read the gate step | Requires a successful `Build and Test` run for `main` HEAD before any mutation; skipped only when HEAD is an already-tagged release | Req R2 / AR-4 |
| ST-5 | Read the develop sync step | No `--force`/`--force-with-lease`; uses fast-forward else cherry-pick; aborts and opens an issue on conflict | Req R6 / AR-8 |
| ST-6 | Read the dry-run path | Uses `--no-git-commit` and `publish --dry`; contains no push, tag, GitHub Release, Docker dispatch, or develop change | Req R7 / AR-9 |
| ST-7 | Read `package.json` | `release:prepare`, `release:preflight`, `release:publish` present; `release:publish` has `--provenance` and no `--git-push` | Req Compatibility / AR-11 |

## Test Categories

### Specification Tests

| Test File | ST Cases Covered | Component |
| --- | --- | --- |
| `repo-tests/monorepo/release.spec.test.mjs` | ST-1, ST-2, ST-3, ST-6, ST-7 | Release workflow + scripts |
| `repo-tests/monorepo/release-hardening.spec.test.mjs` | ST-4, ST-5 | Gate + sync safety |

### Integration / End-to-End Tests

| Scenario | Steps | Expected Result |
| --- | --- | --- |
| Dry-run rehearsal | `gh workflow run release.yml --ref <branch> -f dry_run=true` | Reports the prospective version; no external change |
| Real release | Trigger `Release` on `main` with `bump=auto` | Version bumped, notes written, tag pushed, npm published with provenance, GitHub Release created, Docker dispatched, `develop` synced |

## Test Data

No fixtures or mocks. The contract tests read repository files; the rehearsals use the real release
tooling and GitHub Actions.

## Verification Checklist

- [ ] All ST cases defined with concrete expectations
- [ ] Contract specs rewritten first and observed red
- [ ] Contract specs green after the workflow rebuild
- [ ] `yarn test:structure` passes
- [ ] `dry_run` rehearsal performs no external change
- [ ] One real release completes end to end and `develop` receives the bump
- [ ] `yarn verify` passes
