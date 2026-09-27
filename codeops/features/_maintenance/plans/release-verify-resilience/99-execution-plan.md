# Task T-03: Make release verification resilient to registry lag and re-runs

> **Type**: Task (lightweight) · **Feature**: _maintenance · **CodeOps Artifact Schema**: 1
> **Progress**: 3/5 tasks (60%)
> **Phase baseline tree**: `9fbaaaccd7446735dffa77d67bb34bcda93911ea` · scope: strict · expected
> paths: `.github/workflows/release.yml`, `repo-tests/monorepo/release.spec.test.mjs`
> **Evidence**: Release run
> [#36353633426](https://github.com/blendsdk/porta-identity/actions/runs/36353633426) failed twice
> after a successful publish: attempt 1 exceeded the 400s registry-visibility window for
> `@portaidentity/server@1.11.0`; attempt 2 failed because the freshly repacked tarball differs
> from the published one (`CHANGELOG.md` is regenerated non-deterministically), so the integrity
> comparison could never pass.

## Objective

Make the `Release` workflow complete an already-published release on re-run without weakening the
normal path: the run that performs the publish keeps the exact same-run integrity + provenance
verification; a run that finds every package already published verifies `version` + `provenance`
only, because a repack is not byte-identical. Also widen the registry-visibility window so a slow
npm propagation cannot fail a release whose packages are live.

## Scope

**In scope:** `.github/workflows/release.yml` verify step (window + already-published gating) and
the `release.spec.test.mjs` pins for that step.

**Out of scope:** publishing/unpublishing packages; changing npm trusted publishing;
upload/download of release artifacts across runs (larger machinery, not required); the Docker and
release-notes steps; product code.

## Confirmed decisions

| #   | Decision                                                                                                                                                                        | Source                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| D-1 | Widen the per-package window from 40×10s to 60×15s (15 min)                                                                                                                     | Server became visible ~7–10 min after publish                                      |
| D-2 | Compare integrity only when this run published (`all_published != true`); otherwise require version + provenance and bind the provenance workflow repository to this repository | `CHANGELOG.md` regenerates per run; repack differs, substitution must stay blocked |
| D-3 | Keep the same-run integrity comparison unchanged                                                                                                                                | Preserves the existing release guarantee                                           |
| D-4 | Verify with `yarn test:structure` (release contract tests parse and pin the workflow)                                                                                           | Config-only change; no product workspace affected                                  |

## Smallest viable design

Two edits inside the existing verify step: the loop bounds, and an `ALL_PUBLISHED` env value
(from `steps.published.outputs.all_published`) that, when `true`, replaces the integrity equality
with a provenance-only check. One structure-test update pins the new bounds and the gating so a
later edit cannot silently weaken either behavior.

## Tasks

- [x] T-03.1 **Spec first (red).** In `repo-tests/monorepo/release.spec.test.mjs`, change the loop
      pins to `seq 1 60` / `sleep 15` and add an assertion that the verify step references
      `all_published` to gate the integrity comparison. Run `yarn test:structure` and confirm it
      fails.
- [x] T-03.2 **Implement.** In the `Verify published packages` step of
      `.github/workflows/release.yml`: widen the loop to 60×15s; add a `provenance_repository`
      helper that reads the package's SLSA provenance from the registry attestations API and prints
      its workflow repository; set `ALL_PUBLISHED: ${{ steps.published.outputs.all_published }}`;
      require `published_integrity = expected_integrity` or, when `ALL_PUBLISHED = 'true'`, accept
      only a provenance repository equal to `https://github.com/$GITHUB_REPOSITORY`; always
      require `provenance = https://slsa.dev/provenance/v1`. Run `yarn test:structure` and confirm
      green.
- [x] T-03.3 **Verify.** `yarn test:structure` passes and the workflow parses via the structure
      test's YAML loader (`readWorkflow`); record the result.
- [ ] T-03.4 **Review.** Correctness + security review of the diff; apply findings.
- [ ] T-03.5 **Deliver and recover.** Commit, push, open and merge the PR to `develop`; then
      dispatch `Release` with `--ref develop -f bump=auto` and confirm completion: `main` bumped,
      `v1.11.0` tag and GitHub Release created, Docker image dispatched, `develop` synced.

**Verify**: `yarn test:structure` plus the completed release run's tag, release, Docker, and
develop-sync evidence.

## References

- `.github/workflows/release.yml` — `Check published state` and `Verify published packages`.
- `repo-tests/monorepo/release.spec.test.mjs:152-162` — loop and idempotency pins.
- Failed runs: <https://github.com/blendsdk/porta-identity/actions/runs/36353633426>
