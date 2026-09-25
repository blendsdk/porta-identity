# Ambiguity Register: Automated Release

> **Status**: ✅ GATE PASSED — all 13 items resolved
> **Last Updated**: 2026-09-25 10:30

This register gates the plan that replaces the manual `release:prepare` step with a
manual-triggered, otherwise fully automated release: one `workflow_dispatch` press performs the
version bump, changelog/release notes, commit and tag, npm publish, GitHub Release, Docker
dispatch, and a safe `develop` sync. Decisions are pre-resolved from the planning conversation
unless marked for confirmation.

| # | Category | Ambiguity / Gap | Options Presented | User Decision | Status |
| --- | --- | --- | --- | --- | --- |
| AR-1 | Naming / Scope | Plan home and slug | (A) `codeops/features/monorepo-migration/plans/automated-release/` (release tooling is owned by this feature's T-02 publishing cutover); (B) a new `release-automation` feature | (A) monorepo-migration/plans/automated-release — user confirmed | ✅ Resolved |
| AR-2 | Behavioral | Release trigger | (A) manual `workflow_dispatch` only; (B) automatic `workflow_run` plus manual | (A) — user: "I want to trigger the release manually" | ✅ Resolved |
| AR-3 | Behavioral | Version bump selection | (A) `auto` default with optional `patch`/`minor`/`major` override; (B) `auto` only | (A) — user: "auto + optional" | ✅ Resolved |
| AR-4 | Technical | Verification gate before release | (A) require a successful `Build and Test` for `main` HEAD (fast API check), skip the gate when HEAD is already a tagged release (re-run); (B) run the full `yarn verify` inside the release | (A) — user: "fast" | ✅ Resolved |
| AR-5 | Behavioral | Release notes source | (A) Lockstep AI changelog/release notes from `OPENAI_API_KEY`, with the built-in deterministic fallback; (B) hand-written notes | (A) — user: `OPENAI_API_KEY` is configured | ✅ Resolved |
| AR-6 | Technical | Tag push mechanism | Lockstep creates a lightweight tag (`git tag vX.Y.Z`), and `git push --follow-tags` does **not** push lightweight tags; the workflow must push the tag explicitly | Derived from Lockstep source (`lockstep.js:459`, `:615`) and the current `release.yml` explicit tag creation | ✅ Resolved |
| AR-7 | Technical | Checkout ref for re-run idempotency | (A) check out `ref: main` so Lockstep's "No changes since last tag" self-skip works on re-run; (B) check out the pinned tested SHA (detached, breaks the self-skip and `--git-push`) | (A) — derived | ✅ Resolved |
| AR-8 | Behavioral | `develop` sync after the bump | (A) fast-forward if possible, else cherry-pick the bump commit, else abort and open a tracking issue — never force or rewrite; (B) merge-back commit; (C) `pull --rebase` | (A) — user accepted the recommendation (rebase rejected: shared branch, 73 merge commits, force-push risk) | ✅ Resolved |
| AR-9 | Behavioral | Dry-run behavior | Runs only in the ephemeral runner with `--no-git-commit` and `lockstep publish --dry`; performs no push, tag, publish, GitHub Release, Docker dispatch, or `develop` change | User: "only if safe" — verified safe | ✅ Resolved |
| AR-10 | Technical | Which workflow file | Replace `.github/workflows/release.yml`; preserve its existing published-state and integrity-verification idempotency checks; `docker.yml` unchanged | Derived | ✅ Resolved |
| AR-11 | Technical | Release scripts | Keep `release:prepare` for local/emergency use; `release:publish` keeps `--provenance` and drops `--git-push` in favor of explicit commit and tag pushes | Derived | ✅ Resolved |
| AR-12 | Integration | Release contract oracle | Rewrite `repo-tests/monorepo/release.spec.test.mjs` and `release-hardening.spec.test.mjs` spec-first; keep the three `release:*` commands asserted by `root-scripts.spec.test.mjs` | Derived from the contract tests | ✅ Resolved |
| AR-13 | Scope | Out of scope | Notifications (Slack/email), releases from non-`main` refs, branch-protection provisioning, and any `docker.yml` change | Derived | ✅ Resolved |

## Resolution Notes

**AR-4 / AR-7:** On a re-run after a successful release, `main` HEAD is the release commit (tagged,
`[skip ci]`). The gate is skipped because Lockstep's `changedSinceLastTag()` finds the tag and
self-skips the bump, so the job resumes at the release/Docker/sync steps.

**AR-6:** Because Lockstep's tags are lightweight, the workflow pushes `refs/tags/vX.Y.Z`
explicitly before `gh release create --verify-tag`, mirroring the current workflow.

**AR-8:** `develop` currently carries 73 merge commits and is worked on constantly, so the sync
must never rewrite history. The FF path applies when `develop` has not advanced; otherwise a
cherry-pick of the single bump commit is applied; on conflict the job aborts and opens an issue,
leaving `develop` untouched.
