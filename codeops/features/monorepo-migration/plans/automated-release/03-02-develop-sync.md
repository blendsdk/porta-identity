# Develop Sync: Automated Release

> **Document**: 03-02-develop-sync.md
> **Parent**: [Index](00-index.md)

## Overview

After the release commits the bump to `main` and pushes it, `develop` must receive the same bump
without its history being rewritten. `develop` is a shared, actively-developed integration branch
with many merge commits, so the sync must never force-push, rebase, or reset it (AR-8).

## Algorithm

```bash
set -euo pipefail

git fetch origin main develop
BUMP_SHA="$(git rev-parse HEAD)"          # the pushed release commit on main

if git merge-base --is-ancestor origin/develop "$BUMP_SHA"; then
  # develop has not advanced: a fast-forward is exact and safe.
  git push origin "$BUMP_SHA":refs/heads/develop
else
  # develop advanced: replay only the bump commit onto develop.
  git checkout -B sync/develop-release origin/develop
  if git cherry-pick "$BUMP_SHA"; then
    git push origin sync/develop-release:refs/heads/develop
  else
    git cherry-pick --abort                 # leave develop untouched
    gh issue create \
      --title "Release $RELEASE_TAG: develop sync needs a manual cherry-pick" \
      --body "The release bump commit $BUMP_SHA could not be cherry-picked onto develop automatically. Apply it manually: git checkout develop && git cherry-pick $BUMP_SHA. The release itself succeeded."
  fi
fi
```

## Guarantees

| Property | Guarantee |
| --- | --- |
| No history rewrite | Only fast-forward or a single additive cherry-pick |
| No force-push | `--force`/`--force-with-lease` are never used |
| Busy `develop` | If `develop` advances during the job, the non-force push is rejected and the job reports it rather than overwriting |
| Conflict handling | Aborts the cherry-pick and opens a tracking issue; `develop` is left unchanged |
| Release integrity | A failed sync never rolls back or invalidates the release |

## Relationship to `main`

After a normal release, `main` = (`develop` state at merge) + merge commit + bump commit. When
`develop` has not advanced, it is an ancestor of `main`, so the fast-forward is correct. When it has
advanced, the cherry-pick adds the one bump commit on top of `develop` without disturbing the new
work.

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| --- | --- | --- |
| `develop` advanced | Cherry-pick the bump onto `develop` | AR-8 |
| Cherry-pick conflict | Abort and open an issue; never force | AR-8 |
| Push rejected (concurrent advance) | Report; leave the sync for a follow-up run or manual cherry-pick | AR-8 |
| No `gh` issue permission | Fall back to a job warning with the exact cherry-pick command | AR-8 |

## Testing Requirements

- Contract assertion that the workflow contains no force-push and uses the FF/cherry-pick path
  (ST-5).
- A rehearsal confirming the FF path when `develop` is an ancestor.
