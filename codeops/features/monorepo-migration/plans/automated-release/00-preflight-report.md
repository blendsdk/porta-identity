# Preflight Report: Automated Release

> **Status**: ✅ PREFLIGHT PASSED WITH NOTES — 0 critical, 0 major; 3 minor + 2 observations accepted
> **Iteration**: 1 (first scan)
> **Artifact**: Implementation plan at `codeops/features/monorepo-migration/plans/automated-release/` (8 docs)
> **Artifact Hash**: (uncommitted; recorded at execution time)
> **Codebase Grounded**: 12 files examined (`release.yml`, `docker.yml`, `build-and-test.yml`, `package.json`, `scripts/*`, `repo-tests/monorepo/release*.mjs`, `.gitignore`, lockstep `dist/*`)
> **Last Updated**: 2026-09-25 10:28

> **⚠️ SAME-SESSION REVIEW:** This plan was created in the current session. Same-agent bias risk is
> elevated; consider a fresh-session audit before rollout.

### Codebase Context Summary

**Tech Stack:** GitHub Actions, `@blendsdk/lockstep@1.3.0`, npm 11.15.0, Yarn 1, Node 22.22.2.
**Architecture:** `build-and-test.yml` verifies every push/PR; `release.yml` publishes a verified
`main` revision; `docker.yml` publishes image aliases from a dispatched tag.
**Reference Verification:** 18 references mapped — all verified.

### Summary by Dimension

| # | Dimension | Findings |
| --- | --- | --- |
| 4 | Completeness Gaps | 1 minor (PF-005) |
| 8 | Security Blind Spots | 2 minor (PF-002, PF-003) |
| 12 | Consistency | 1 minor (PF-001) |
| 13 | Codebase Alignment | 1 observation (PF-004) |

### Summary by Severity

| Severity | Count | Status |
| --- | --- | --- |
| CRITICAL | 0 | — |
| MAJOR | 0 | — |
| MINOR | 3 | accepted |
| OBSERVATION | 2 | accepted |

---

### PF-001: Rollout note says the old release "no-ops"; it actually will not fire 🟡 MINOR

**Dimension:** 12 Consistency
**Location:** `99-execution-plan.md` task 4.1.2; `03-01-release-workflow.md`
**Codebase Evidence:** `workflow_run` triggers are matched against the workflow file on the default
branch; once the rebuilt `release.yml` (no `workflow_run`) is on `main`, the listener no longer
exists.
**The Problem:** The rollout text implies the former automatic release will run once and no-op. In
fact no automatic release fires after the deploy merge.
**Recommendation:** Reword to "no automatic release fires because the workflow no longer declares
`workflow_run`."
**User Decision:** Accepted — reword during execution.

---

### PF-002: `OPENAI_API_KEY` exposed to every step 🟡 MINOR

**Dimension:** 8 Security
**Location:** `03-01-release-workflow.md` job steps
**The Problem:** Placing `OPENAI_API_KEY` at job-level `env` exposes the key to checkout, install,
and unrelated steps. Only the Lockstep changelog steps need it.
**Recommendation:** Scope `OPENAI_API_KEY` to the `lockstep version`/`publish` steps only.
**User Decision:** Accepted.

---

### PF-003: Push token persisted in git config 🟡 MINOR

**Dimension:** 8 Security
**Location:** `03-01-release-workflow.md` step 5 (scoped push credentials)
**The Problem:** Setting the `origin` remote URL with the token writes it into `.git/config`, where
later steps and potentially logs can read it.
**Recommendation:** Do not persist the token; inject it per push command, e.g.
`git push "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" HEAD:refs/heads/main`
and the same for the tag and the `develop` sync.
**User Decision:** Accepted.

---

### PF-004: Bump runs `git add .` on the working tree 🔵 OBSERVATION

**Dimension:** 13 Codebase Alignment
**Location:** `03-01-release-workflow.md` step 8
**Codebase Evidence:** `lockstep.js:457` runs `git add .` before committing; `.gitignore:1-2`
ignores `node_modules/` and `dist/`.
**The Problem:** If any generated file is not ignored, it would be committed into the release.
**Recommendation:** Keep the bump before `yarn build` and assert a clean tree (`git status
--porcelain`) immediately before bumping.
**User Decision:** Accepted.

---

### PF-005: `GH_TOKEN` not specified for release/Docker steps 🔵 OBSERVATION

**Dimension:** 4 Completeness Gaps
**Location:** `03-01-release-workflow.md` steps 12-13
**The Problem:** `gh release create` and `gh workflow run` need `GH_TOKEN` (or `GH_TOKEN` in env)
to authenticate.
**Recommendation:** Set `GH_TOKEN: ${{ github.token }}` on those steps (as the current
`release.yml` does).
**User Decision:** Accepted.

---

## Verdict

All findings are minor/observation and accepted. No open 🔴/🟠. The plan proceeds to execution with
these refinements folded into `03-01` during Phase 2.
