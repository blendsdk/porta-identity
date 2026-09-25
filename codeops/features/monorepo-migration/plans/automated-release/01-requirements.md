# Requirements: Automated Release

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)

## Feature Overview

A single manual `Release` workflow dispatch must produce a complete release with no manual bump,
notes, tag, or publish work, and must keep `develop` synchronized with the version bump created on
`main`.

## Functional Requirements

### Must Have

- The `Release` workflow is triggered only by `workflow_dispatch` and accepts two inputs: `bump`
  (`auto` default, or `patch`/`minor`/`major`) and `dry_run` (boolean).
- Before any mutation, the workflow requires a successful `Build and Test` run for the current
  `main` HEAD, except when HEAD is already a tagged release (re-run).
- On a normal run the workflow bumps all coordinated packages, generates per-package `CHANGELOG.md`
  and root `RELEASE_NOTES.md`, commits `chore(release): vX.Y.Z [skip ci]`, and tags `vX.Y.Z`.
- The workflow publishes `@portaidentity/server`, `@portaidentity/sdk`, and
  `@portaidentity/cli` with npm provenance, then pushes the bump commit and the tag to `main`.
- The workflow creates the GitHub Release `vX.Y.Z` from `RELEASE_NOTES.md` and dispatches the Docker
  release with the tag and bump SHA.
- The workflow synchronizes `develop` with the bump commit without ever rewriting or force-pushing
  `develop`.
- The workflow is idempotent: a re-run after success resumes without creating a second version.
- `dry_run` performs no push, tag, publish, GitHub Release, Docker dispatch, or `develop` change.

### Won't Have (Out of Scope)

- Notifications (Slack/email/webhook).
- Releases from any ref other than `main`.
- Branch-protection provisioning or a long-lived release token.
- Any change to `.github/workflows/docker.yml`.
- Product source changes.

## Technical Requirements

### Security

- Keep tokenless npm Trusted Publishing (`id-token: write`, no `NPM_TOKEN`/`NODE_AUTH_TOKEN`).
- Keep the published-state and tarball-integrity verification.
- Grant the minimum GitHub permissions: `contents: write`, `id-token: write`, `actions: write`.
- The `develop` sync must never use `--force` and must abort on conflict.

### Compatibility

- Keep `yarn release:prepare`, `release:preflight`, and `release:publish` available.
- Keep `@blendsdk/lockstep` pinned and the derived SDK/CLI version constants in lockstep.

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
| --- | --- | --- | --- | --- |
| Trigger | manual vs automatic vs both | manual `workflow_dispatch` | User preference; the press is the release authorization | AR-2 |
| Bump selection | auto only vs auto + override | auto + override | Escape hatch without per-release work | AR-3 |
| Verification gate | fast status check vs full verify | fast status check | User chose fast; the bump changes only version files | AR-4 |
| Notes generation | AI (OpenAI) vs manual | AI + fallback | `OPENAI_API_KEY` configured; non-blocking fallback | AR-5 |
| Develop sync | FF / cherry-pick / merge / rebase | FF, else cherry-pick, else abort + issue | `develop` is shared, busy, and must never be rewritten | AR-8 |

## Acceptance Criteria

1. [ ] `Release` is `workflow_dispatch` only with `bump` and `dry_run`; no `workflow_run` trigger.
2. [ ] One manual run bumps, writes notes, commits, tags, publishes with provenance, creates the
       GitHub Release, dispatches Docker, and syncs `develop`, with no manual bump work.
3. [ ] `dry_run` changes nothing external.
4. [ ] Re-runs are idempotent and never create a duplicate version.
5. [ ] `develop` is never force-pushed or rewritten; a sync conflict aborts and opens an issue.
6. [ ] The rewritten release contract tests and `yarn verify` pass.
