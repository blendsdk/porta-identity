# Current State: Automated Release

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

The release path is split between a local preparation step and an automated publish step:

- `package.json` scripts:
  - `release:prepare` = `lockstep version --type auto --no-git-commit && node scripts/sync-versions.js`
  - `release:preflight` = `node scripts/release-preflight.js && node scripts/sync-versions.js --check`
  - `release:publish` = `yarn release:preflight && npm_config_registry=https://registry.npmjs.org lockstep publish --tag latest --provenance`
- `.github/workflows/build-and-test.yml` runs `yarn verify` on every push and pull request.
- `.github/workflows/release.yml` triggers on a successful `Build and Test` for `main`, checks out
  the tested SHA, runs `release:preflight`, publishes the committed version tokenlessly, creates the
  tag and GitHub Release, and dispatches `docker.yml`.
- `.github/workflows/docker.yml` accepts a tag and tested SHA and publishes the image aliases.
- `@blendsdk/lockstep@1.3.0` owns versioning. `version` bumps all packages, generates per-package
  `CHANGELOG.md` and root `RELEASE_NOTES.md`, and commits `chore(release): vX.Y.Z [skip ci]` and
  tags `vX.Y.Z` unless `--no-git-commit` is passed (`node_modules/@blendsdk/lockstep/dist/lockstep.js:457-459`).
  `publish --git-push` runs `git push --follow-tags` (`:615`). `version` self-skips with "No changes
  since last tag" (`dist/cli.js:147-149`).
- Contract tests: `repo-tests/monorepo/release.spec.test.mjs`,
  `release-hardening.spec.test.mjs`, and `root-scripts.spec.test.mjs`.

### Relevant Files

| File | Purpose | Changes Needed |
| --- | --- | --- |
| `.github/workflows/release.yml` | Publishes the committed version | Rebuild with manual trigger, bump, push, sync |
| `package.json` | Release scripts | `release:publish` drops `--git-push` |
| `repo-tests/monorepo/release.spec.test.mjs` | Release contract oracle | Rewrite for the new topology |
| `repo-tests/monorepo/release-hardening.spec.test.mjs` | Safety oracle | Replace the no-`git push` assertion with safe-push assertions |
| `root-scripts.spec.test.mjs` | Asserts the three scripts | Keep |
| `techdocs/guides/releasing.md`, `AGENTS.md` | Release guidance | Update to the manual-release flow |

## Gaps Identified

### Gap 1: The version bump is manual

**Current Behavior:** A human must run `release:prepare`, review and commit the bump, then the
workflow publishes it. `release:publish` never changes package bytes.
**Required Behavior:** The workflow performs the bump as part of the manual release run.
**Fix Required:** Add `lockstep version` and push steps to the workflow (AR-2, AR-3, AR-10).

### Gap 2: The workflow cannot push to git

**Current Behavior:** `release.yml` uses `persist-credentials: false` and the contract test forbids
`git push origin`.
**Required Behavior:** The workflow pushes the bump commit and tag to `main`, and syncs `develop`.
**Fix Required:** Scoped push credentials and a rewritten safety oracle (AR-6, AR-10, AR-12).

### Gap 3: No `develop` synchronization

**Current Behavior:** The bump exists only on `main`; `develop` drifts.
**Required Behavior:** `develop` receives the bump without history rewrite.
**Fix Required:** The safe sync component (AR-8).

### Gap 4: Lightweight tags are not pushed by `--follow-tags`

**Current Behavior:** Lockstep creates a lightweight tag; `git push --follow-tags` does not push
lightweight tags.
**Required Behavior:** The workflow pushes `refs/tags/vX.Y.Z` explicitly.
**Fix Required:** Explicit tag push before `gh release create --verify-tag` (AR-6).

## Dependencies

### Internal Dependencies

- `@blendsdk/lockstep@1.3.0` (pinned) provides bump/changelog/publish.
- The GitHub Actions secret `OPENAI_API_KEY` (confirmed present) enables AI release notes.
- `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` are already used by `docker.yml`.

### External Dependencies

- None new.

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Lightweight tag not pushed | High if unhandled | Missing tag/GitHub Release | Explicit `git push origin refs/tags/vX.Y.Z` |
| Detached checkout breaks re-run idempotency | Medium | Duplicate version | Check out `ref: main` |
| `develop` conflict during sync | Medium | Stuck sync | Abort + open issue; never force |
| `main` later protected | Low now | Push rejected | Document a bypass/PAT requirement |
| AI notes fail | Low | Generic notes | Lockstep deterministic fallback |
