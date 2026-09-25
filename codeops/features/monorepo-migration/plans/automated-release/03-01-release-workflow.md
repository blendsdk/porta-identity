# Release Workflow: Automated Release

> **Document**: 03-01-release-workflow.md
> **Parent**: [Index](00-index.md)

## Overview

Replace the `workflow_run`-triggered publish-only job with a manual `workflow_dispatch` job that
bumps, publishes, tags, and synchronizes. The job keeps the existing tokenless publishing and
idempotency/integrity checks.

## Trigger and Inputs

```yaml
on:
  workflow_dispatch:
    inputs:
      bump:
        description: Version bump
        type: choice
        options: [auto, patch, minor, major]
        default: auto
      dry_run:
        description: Rehearse without publishing, pushing, or tagging
        type: boolean
        default: false
```

`workflow_run` is removed. The manual dispatch on `main` is the release authorization (AR-2).

## Permissions and Concurrency

```yaml
permissions:
  contents: write    # push bump commit + tag, create GitHub Release, dispatch Docker
  id-token: write    # npm Trusted Publishing provenance
  actions: write     # dispatch docker.yml
concurrency:
  group: npm-release
  cancel-in-progress: false
```

Keeps tokenless publishing: no `NPM_TOKEN`/`NODE_AUTH_TOKEN` (AR-10).

## Job Steps

1. **Checkout** `ref: main`, `fetch-depth: 0`, `persist-credentials: false` (AR-7).
2. **Setup** Node 22.22.2 with `registry-url: https://registry.npmjs.org`; `yarn install
   --frozen-lockfile`.
3. **Resolve mode.** `HEAD_TAGGED=$(git describe --tags --exact-match HEAD 2>/dev/null || true)`.
   `main` HEAD is a release commit when `HEAD_TAGGED` is non-empty (re-run resume).
4. **Fast verification gate** (skipped when `HEAD_TAGGED` is non-empty):
   the latest `Build and Test` run on `main` must be `conclusion=success` with
   `headSha == $(git rev-parse HEAD)`; otherwise fail closed (AR-4).
5. **Push credential handling.** Do not persist the token in `.git/config`. Inject it per push
   command as `https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git`
   (PF-003). `GH_TOKEN` is set for the `gh` steps (PF-005).
6. **Bump.** Assert a clean worktree (`git status --porcelain` empty), then run
   `lockstep version --type <bump> --ci` with `OPENAI_API_KEY` scoped to this step only (PF-002).
   Lockstep applies the bump, writes `CHANGELOG.md` files and `RELEASE_NOTES.md`, and commits
   `chore(release): vX.Y.Z [skip ci]` and tags `vX.Y.Z`. It self-skips when there are no changes
   since the last tag. Read `VERSION` from `package.json` and set `RELEASE_TAG=v$VERSION`
   (AR-3, AR-5). Running the bump before any build keeps the `git add .` commit clean (PF-004).
7. **Dry-run path** (when `dry_run`): run
   `lockstep version --type <bump> --no-git-commit --no-changelog` and
   `lockstep publish --tag latest --dry`, print the prospective version, then stop. No push, tag,
   publish, GitHub Release, Docker dispatch, or `develop` change (AR-9).
8. **Build.** `yarn build`.
9. **Validate.** `yarn release:preflight`.
10. **Publish.** `lockstep publish --tag latest --provenance`. Keep the existing published-state
    check so a partial publish resumes without a duplicate version (AR-10).
11. **Push commit and tag.** Push with the injected credential:
    `git push "<cred>" HEAD:refs/heads/main` and `git push "<cred>" refs/tags/$RELEASE_TAG` (AR-6).
12. **GitHub Release.** `gh release create "$RELEASE_TAG" --verify-tag --title "$RELEASE_TAG"
    --notes-file RELEASE_NOTES.md` (with `GH_TOKEN`; skip when it already exists).
13. **Docker dispatch.** `gh workflow run docker.yml --ref main -f tag="$RELEASE_TAG"
    -f sha="$(git rev-parse HEAD)"` (with `GH_TOKEN`; skip when the image already exists).
14. **Develop sync.** Run the [Develop Sync](03-02-develop-sync.md) algorithm, pushing with the
    injected credential.

## Idempotency

| Situation | Behavior |
| --- | --- |
| Re-run after success (`HEAD_TAGGED` set) | Gate and bump skipped; publish no-op via published-state; release/docker/sync resume |
| No releasable commits | `lockstep version` self-skips; the job stops before publish |
| Partial npm publish | Published-state check publishes only missing packages |
| Bump pushed, GitHub Release missing | Re-run resumes at `gh release create` |
| Tag already on remote | `git push origin refs/tags/...` is a no-op success |

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| --- | --- | --- |
| No green `Build and Test` for `main` HEAD | Fail closed before any mutation | AR-4 |
| Changelog/AI failure | Lockstep degrades to fallback notes; never blocks | AR-5 |
| Lightweight tag not pushed by `--follow-tags` | Explicit tag push | AR-6 |
| Publish integrity mismatch | Existing verification fails the job | AR-10 |
| `develop` sync conflict | Abort + open issue; never force | AR-8 |

## Testing Requirements

- Contract assertions in [07-testing-strategy.md](07-testing-strategy.md) (ST-1..ST-6).
- A `dry_run` dispatch rehearsal and one real release.
