# Preflight Report: pnpm Migration Plan

> **Status**: ✅ PREFLIGHT PASSED WITH NOTES — 12 findings resolved, 3 observations accepted
> **Iteration**: 2 (re-scan after accepted fixes)
> **Artifact**: Non-trivial task mini-plan at `codeops/features/_maintenance/plans/pnpm-migration/99-execution-plan.md`
> **Artifact SHA-256**: `330313a5a5ffbb34e947915bc67667b662200f0f3c06975a2fbf121fbe33307f`
> **Codebase Grounded**: 32 repository files examined; 24 plan references verified against `build/pnpm-migration` (based on `develop` `v1.14.0`)
> **Last Updated**: 2026-10-26 12:37
> **⚠️ SAME-SESSION REVIEW**: The plan was written in this session. A fresh-session review is advisable before execution to reduce framing bias. One independent challenger was run over the MAJOR findings; its verdicts are reflected below.

## Codebase Context Summary

**Tech Stack:** TypeScript ESM; Node.js `>=22.22.2`; Koa, `oidc-provider`, PostgreSQL, Redis; Yarn Classic 1.22.22; Turbo 2; Vitest and Playwright; Docker and Docker Compose.

**Architecture:** Three public packages (`@portaidentity/server`, `sdk`, `cli`) under `packages/*`, with the root acting as a private coordinator. `test-harness/` is deliberately not a workspace and imports root-owned tooling. `repo-tests/monorepo/` is a 26-file structural contract suite. The assurance harness proves release, coverage, security, and compatibility claims from the same root install graph.

**Key files examined:** `package.json`, `packages/*/package.json`, `docker/Dockerfile`, `test-harness/Dockerfile`, `.dockerignore`, `.npmrc`, `.gitignore`, `.github/workflows/{build-and-test,docs,release,docker}.yml`, `repo-tests/monorepo/*.test.mjs`, `test-harness/assurance/**`, `test-harness/fixtures/lifecycle-runtime.ts`, `scripts/release-preflight.js`, `node_modules/@blendsdk/lockstep/dist/{lockstep,provenance}.js`, `codeops/codeops.json`, `AGENTS.md`.

**Key observations:**

- The current Yarn install uses package-local dependency copies for real version conflicts: `packages/server/node_modules/chalk` is `6.0.0` while root is `5.6.2`; `packages/server/node_modules/yaml` is `2.9.0` while root is `2.9.1`. `packages/cli/node_modules/chalk` is also package-local.
- The production and harness Dockerfiles deliberately merge root and package-local `node_modules` (`docker/Dockerfile:47-48`, `test-harness/Dockerfile:46-47`). The plan removes this merge without proving the hoisted pnpm tree preserves those resolutions.
- Branch CI has six jobs; only the `docker` job builds the production image, and it uses plain `docker build` without cache. The harness job rebuilds the harness image with `docker compose up -d --build` on every run.
- pnpm 12 uses `pnpm_config_*` environment variables and `pnpm-workspace.yaml` settings; the plan still relies on `npm_config_registry` and `.npmrc` non-auth settings.
- The release workflow creates `release-artifacts/` before the second `release:preflight` invocation inside `release:publish`.

## Summary by Dimension

| # | Dimension | Findings | Highest severity |
|---|-----------|----------|------------------|
| 1 | Ambiguities | 1 | 🟡 MINOR |
| 2 | Implicit Assumptions | 2 | 🟠 MAJOR |
| 3 | Logical Contradictions | 1 | 🟠 MAJOR |
| 4 | Completeness Gaps | 3 | 🟠 MAJOR |
| 5 | Dependency Issues | 0 | — |
| 6 | Feasibility Concerns | 1 observation | 🔵 OBSERVATION |
| 7 | Testability | 2 | 🟡 MINOR |
| 8 | Security Blind Spots | 3 | 🟠 MAJOR |
| 9 | Edge Cases | 1 observation | 🔵 OBSERVATION |
| 10 | Scope Creep Indicators | 0 | — |
| 11 | Ordering & Sequencing | 2 | 🟠 MAJOR |
| 12 | Consistency | 1 | 🟡 MINOR |
| 13 | Codebase Alignment | 2 | 🟠 MAJOR |

## Summary by Severity

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0 | — |
| MAJOR | 6 | All resolved in iteration 2 |
| MINOR | 6 | All resolved in iteration 2 |
| OBSERVATION | 3 | Accepted (optional) |

## Iteration 2 verification

All 12 findings were resolved in the plan. Iteration 1 line numbers refer to the pre-fix version; task IDs and finding IDs are stable.

| Finding | Resolution in the plan |
|---------|-----------------------|
| PF-001 | AR-16; phase 0 inspects package-local server dependencies and runs a `chalk`/`yaml` import smoke; phase 2 keeps a conditional merge and updates the Dockerfile spec accordingly. |
| PF-002 | AR-5; `gitChecks` stays enabled, the override is release-scoped, and preflight checks that the release commit descends from the tested `origin/main` revision. |
| PF-003 | Expected artifacts move to `$RUNNER_TEMP/release-artifacts`; the rehearsal commits/tags in a scratch clone and uses an explicit rehearsal mode. |
| PF-004 | AR-17; `pnpm_config_registry` replaces `npm_config_registry`, with an effective-registry assertion in preflight. |
| PF-005 | Phase 2.3 enumerates all six CI jobs, including the audit job and the Playwright install command. |
| PF-006 | AR-18; phase 6.4 checks Dependabot PR creation plus the GitHub dependency graph/alerts, with a stop condition and fallback. |
| PF-007 | Phase 1.4 removes the Yarn install tree and `.yarn-integrity` before the first pnpm install. |
| PF-008 | Phase 1.3/5.5 use `engineStrict` and `savePrefix: ''` (not `saveExact`, which is not the pnpm 12 setting) and verify both in the POC. |
| PF-009 | Phase 1.2 no longer treats the missing lockfile as a behavioral red; phase 5.1 documents the oracle-migration red/green check. |
| PF-010 | Phase 0.1 records the Yarn audit baseline; phase 6.3 compares the pnpm audit result. |
| PF-011 | Phase 2.6 lists all five compose files; phase 2.7 uses an explicit multi-arch output; phase 2.4 uses `--frozen-lockfile`; the matrix is corrected. |
| PF-012 | The plan moved into `codeops/features/_maintenance/plans/pnpm-migration/`; T-04 was added to the roadmap; `packages/sdk/README.md` and `scripts/setup-certs.sh` are in phase 5.4; AR-12 is updated. |

**Iteration 2 correction:** the initial PF-008 recommendation said `saveExact: true`. Verification against the pnpm 12 settings reference showed that the correct exact-save setting is `savePrefix: ''`; the plan and this report now use that spelling.

---

## MAJOR Findings

### PF-001: Docker package-local dependency removal is unproven 🟠 MAJOR

**Dimension:** 13 — Codebase Alignment / 4 — Completeness
**Location:** Plan phase 2.4 and the "Smallest viable design" section (`99-execution-plan.md:59-65`, `:121-122`)
**Codebase Evidence:** `packages/server/node_modules/chalk` (6.0.0) vs root `node_modules/chalk` (5.6.2); `packages/server/node_modules/yaml` (2.9.0) vs root (2.9.1); `docker/Dockerfile:47-48`; `test-harness/Dockerfile:46-47`; `repo-tests/monorepo/server-package.spec.test.mjs:250-269`.

**The Problem:** The plan removes the package-local `node_modules` COPY because “the hoisted root node_modules is the runtime dependency tree.” That is not proven. The current Yarn install already has server-specific `chalk` and `yaml` versions, and the Dockerfile deliberately merges them into `/app/node_modules`. pnpm’s hoisted linker may also create package-local conflict directories. Removing the merge can silently change the production identity image to root versions (`chalk` 5.6.2 instead of 6.0.0), or fail if a dependency is only reachable through the package-local tree. A `/health` smoke test does not exercise `chalk` or `yaml` imports.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Prove the production tree in phase 0/2: inspect the `pnpm install --prod` tree, assert every server runtime dependency resolves to a satisfying version, then decide. Keep a layout-aware merge if package-local production deps exist. | Preserves current runtime behavior; evidence-based | Requires a real server import smoke, not just `/health` |
| B | Force alignment with root overrides so every server dependency is hoisted to the root tree, then remove the package-local COPY. | Simplifies the runtime layout | Risks forcing incompatible versions across packages |
| C | Use `pnpm deploy --prod` for a self-contained server runtime. | Portable, no manual merge | Changes runtime layout and coverage inventory; outside the hoisted scope |

**Recommendation:** Option A — prove the tree first. Add a phase 0 check for package-local production dependencies and a server import smoke that loads `chalk` and `yaml`. Only remove the COPY if the hoisted root tree satisfies the server manifest exactly. If not, keep a conditional merge and update the structural spec with that evidence.

**User Decision:** Resolved — User accepted the recommendation on 2026-10-26.

---

### PF-002: Global `gitChecks: false` disables publish safety everywhere 🟠 MAJOR

**Dimension:** 8 — Security Blind Spots / 12 — Consistency
**Location:** Plan phase 3.2 (`99-execution-plan.md:62`, `:138`)
**Codebase Evidence:** `package.json:69`; `.github/workflows/release.yml:110-115`, `:189-191`; pnpm publish docs (`gitChecks`, `--no-git-checks`); user decision AR-5.

**The Problem:** The plan commits `gitChecks: false` to `pnpm-workspace.yaml`. That disables pnpm’s branch, clean-tree, and up-to-date checks for every `pnpm publish`, not only the release job. A developer running a local publish would lose the safeguards, and the compensating preflight invariants are only invoked through `release:publish`. The user approved “pnpm publish + gitChecks false,” but the placement is broader than necessary.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Keep `gitChecks: true` in the workspace; set `pnpm_config_git_checks=false` (verify the exact pnpm 12 env name) or `--config.git-checks=false` only on the release publish command. Add “up to date with origin/main” to release preflight. | Least privilege; local publishes stay protected | Requires verifying the env/CLI propagation through lockstep |
| B | Keep the global `gitChecks: false` and rely on release preflight. | Simple | Weakens all local publishes; preflight not on the local path |
| C | Keep git checks enabled and push the bump commit/tag before publishing. | Strongest checks | Changes release ordering; more failure modes |

**Recommendation:** Option A — scope the override to the release command and add the missing up-to-date check to `scripts/release-preflight.js`.

**User Decision:** Resolved — User accepted the recommendation on 2026-10-26.

---

### PF-003: Clean-tree preflight contradicts `release-artifacts/` and the rehearsal 🟠 MAJOR

**Dimension:** 3 — Logical Contradictions / 11 — Ordering & Sequencing
**Location:** Plan phase 3.2 and 3.6 (`99-execution-plan.md:138`, `:145`)
**Codebase Evidence:** `.github/workflows/release.yml:160-166` creates untracked `release-artifacts/`; `:191` runs `pnpm release:publish`; `package.json:69` runs `release:preflight` again; `.gitignore` does not contain `release-artifacts`.

**The Problem:** The plan adds a clean-working-tree invariant to `release:preflight`. The workflow packs expected artifacts into `release-artifacts/` before calling `release:publish`, which runs preflight a second time. The clean check will reject the untracked artifacts. The rehearsal in 3.6 also runs preflight from a bumped, tagged, likely non-main scratch tree, so the new “main branch” and “clean tree” invariants fail there unless the rehearsal has an explicit mode.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Pack to `$RUNNER_TEMP/release-artifacts` and update verification paths; keep the strict clean-tree check. Define a rehearsal mode that allows a scratch branch/tag or performs the rehearsal on a committed candidate. | Keeps the guard strong; no repo artifacts | Requires path updates and a rehearsal switch |
| B | Add `/release-artifacts/` to `.gitignore` and make the clean check ignore ignored files. | Simple | Artifacts remain in the repo; clean check is weaker |
| C | Remove the duplicate preflight inside `release:publish`; run preflight only before packing. | Removes contradiction | Weaker publish guard |

**Recommendation:** Option A — use `$RUNNER_TEMP`, keep the clean check, and make the rehearsal explicit about its branch/clean-state mode.

**User Decision:** Resolved — User accepted the recommendation on 2026-10-26.

---

### PF-004: `npm_config_registry` no longer pins the pnpm publish registry 🟠 MAJOR

**Dimension:** 8 — Security Blind Spots / 13 — Codebase Alignment
**Location:** Plan phase 3.5 (`99-execution-plan.md:142`); root script at `package.json:69`
**Codebase Evidence:** `package.json:69`; pnpm 12 docs show `pnpm_config_*` and `pnpm-workspace.yaml` settings; `techdocs/guides/releasing.md:82-85`.

**The Problem:** The root `release:publish` script keeps `npm_config_registry=https://registry.npmjs.org`. pnpm 12 uses `pnpm_config_*` environment variables, not npm’s. The explicit registry pin may be silently ignored, allowing a user-level `.npmrc` or mirror to redirect a publish. CI’s `actions/setup-node registry-url` may mask it, so the failure can escape CI and hit a local release.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Replace it with `pnpm_config_registry=https://registry.npmjs.org` (or pass `--registry`) and add a preflight assertion on `pnpm config get registry`. | Explicit, testable | Requires verifying lockstep command propagation |
| B | Set `registries.default: https://registry.npmjs.org/` in `pnpm-workspace.yaml` and remove the env prefix. | Central, visible | Applies to all installs, not just publish |
| C | Keep `npm_config_registry` and prove pnpm 12 honors it; document if it does. | No change | Unverified; contradicts pnpm 12 docs |

**Recommendation:** Option A — use the pnpm-native variable and assert the registry in release preflight. Update `techdocs/guides/releasing.md`.

**User Decision:** Resolved — User accepted the recommendation on 2026-10-26.

---

### PF-005: CI migration covers “four jobs” but the workflow has six 🟠 MAJOR

**Dimension:** 4 — Completeness Gaps
**Location:** Plan phase 2.3 (`99-execution-plan.md:119`)
**Codebase Evidence:** `.github/workflows/build-and-test.yml` has `verify`, `ui`, `harness`, `docs`, `docker`, and `audit` jobs (lines 19, 74, 133, 151, 167, 177); the audit job still runs `yarn install` and `yarn audit` (lines 187-191).

**The Problem:** The plan says “all four jobs” and replaces Yarn commands broadly. The audit job is a sixth job with its own install and audit commands. If the implementation follows “four jobs,” the audit job will run Yarn after `yarn.lock` is deleted, and CI fails. The plan also does not explicitly name the Playwright install command for the UI/harness jobs.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Rewrite 2.3 to enumerate all six jobs and their exact pnpm commands, including the audit job and `pnpm exec playwright install --with-deps chromium`. | Complete and testable | Slightly longer plan |
| B | Keep the broad instruction and rely on CI to catch the audit job. | Less text | Predictable failure; avoidable |

**Recommendation:** Option A — enumerate all six jobs and exact commands.

**User Decision:** Resolved — User accepted the recommendation on 2026-10-26.

---

### PF-006: pnpm 12’s two-document lockfile may break the GitHub dependency graph and alerts 🟠 MAJOR

**Dimension:** 8 — Security Blind Spots / 13 — Codebase Alignment
**Location:** Plan phase 6.4 (`99-execution-plan.md:185`)
**Codebase Evidence:** pnpm 12 writes a boot document plus a project document when `packageManager` pins pnpm 12; pnpm’s lockfile docs warn that single-document readers can report zero dependencies. The plan tests a Dependabot PR but not GitHub’s dependency graph or Dependabot alerts.

**The Problem:** Dependabot PR generation and the GitHub dependency graph are separate consumers. A two-document `pnpm-lock.yaml` can be read correctly by pnpm and incorrectly by a graph/alert scanner. For an identity provider, losing dependency alerts silently is a security regression. The plan tests only one of the two consumers.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Add a dependency-graph/alerts check after the Dependabot PR. If the graph is empty or wrong, use `pmOnFail: ignore` to suppress the boot document, or pin pnpm 11, with an explicit user decision. | Covers the security monitoring path | Requires a GitHub-side check and a fallback decision |
| B | Accept the risk; rely on `pnpm audit` in CI. | No extra work | CI audit does not replace repository alerts; silent loss |
| C | Use pnpm 11 from the start to keep a single-document lockfile. | Avoids the issue | Older package manager; different feature set |

**Recommendation:** Option A — verify both Dependabot PR creation and the dependency graph/alerts, with a named fallback.

**User Decision:** Resolved — User accepted the recommendation on 2026-10-26.

---

## MINOR Findings

### PF-007: Existing Yarn `node_modules` is not removed before the first pnpm install 🟡 MINOR

**Dimension:** 4 — Completeness Gaps / 11 — Ordering
**Location:** Plan phase 1.4/1.6 (`99-execution-plan.md:100`, `:105`)
**Codebase Evidence:** Current `node_modules` is 729 MB with `node_modules/.yarn-integrity`; `packages/server/node_modules` and `packages/cli/node_modules` contain Yarn package-local copies.

**The Problem:** Removing `yarn.lock` does not remove the existing Yarn install tree. A hoisted pnpm install over that tree can leave stale packages that mask missing pnpm dependencies during local phases. CI, Docker, and the clean-clone gate hide the problem later, but local verification may be misleading.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Add an explicit cleanup step: remove root and `packages/*/node_modules` plus `.yarn-integrity` before the first pnpm install. | Clean, reproducible local tree | One extra destructive local step |
| B | Run `pnpm install --force` over the existing tree. | No manual delete | May not remove all stale Yarn layout |
| C | Rely on the clean-clone phase 6.1. | No local cleanup | Local phases can pass/fail for the wrong reason |

**Recommendation:** Option A — add the cleanup to phase 1 and keep the clean-clone gate as the final oracle.

**User Decision:** Resolved — User accepted the recommendation on 2026-10-26.

---

### PF-008: `.npmrc` non-auth settings are not moved to pnpm 12 configuration 🟡 MINOR

**Dimension:** 13 — Codebase Alignment
**Location:** Plan phase 1.3 (`99-execution-plan.md:99`)
**Codebase Evidence:** `.npmrc:1-2` (`engine-strict=true`, `save-exact=true`); pnpm 12 settings live in `pnpm-workspace.yaml` (`engineStrict`, `savePrefix: ''`); pnpm’s npmrc docs cover auth and certificates, not these flags.

**The Problem:** pnpm 12 does not read all npm-style settings from `.npmrc`. `engine-strict` and `save-exact` may silently stop applying. pnpm already fails an incompatible root `engines.node`, so the Node-floor risk is limited, but `save-exact` is a repository policy and the plan’s docs would be wrong.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Add `engineStrict: true` and `savePrefix: ''` to `pnpm-workspace.yaml`; keep `.npmrc` for auth/registry only; update docs. | Explicit pnpm 12 configuration | Small plan addition |
| B | Verify pnpm 12 still reads both from `.npmrc`; if yes, document the exception. | No config move | Contradicts current pnpm docs; fragile |
| C | Drop both settings. | Simplest | Changes dependency-save policy |

**Recommendation:** Option A.

**User Decision:** Resolved — User accepted the recommendation on 2026-10-26.

---

### PF-009: Spec-first ordering is invalid for the toolchain spec and phase 5 🟡 MINOR

**Dimension:** 11 — Ordering / 7 — Testability
**Location:** Plan phases 1.2, 1.7, and 5.1–5.3 (`99-execution-plan.md:95`, `:106`, `:172-178`)
**Codebase Evidence:** `repo-tests/monorepo/toolchain.spec.test.mjs` reads the lockfile; `pnpm-lock.yaml` is generated in 1.4, after 1.2.

**The Problem:** Task 1.2 asks to update the toolchain spec to read `pnpm-lock.yaml` and confirm red before the lockfile exists. The red is a missing-file error, not a meaningful contract failure. Phase 5 then rewrites the remaining structural specs after implementation, which is oracle migration rather than spec-first delivery.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Sequence: new package-manager spec red → generate lockfile → toolchain spec green; document phase 5 as oracle migration with a red/green check per rewritten file. | Honest, workable | Slightly more explicit |
| B | Move all 13 spec rewrites into phase 1 before implementation. | Strict spec-first | Large, blocks early feedback |
| C | Accept post-implementation rewrites with a written exception. | Least work | Weakens the CodeOps claim |

**Recommendation:** Option A.

**User Decision:** Resolved — User accepted the recommendation on 2026-10-26.

---

### PF-010: No dependency-audit baseline before switching tools 🟡 MINOR

**Dimension:** 7 — Testability
**Location:** Plan phase 0.1 and 6.3 (`99-execution-plan.md:83`, `:183`)
**Codebase Evidence:** `.github/workflows/build-and-test.yml:187-191` runs Yarn audit; the plan records build/lint/typecheck/structure but not audit.

**The Problem:** `pnpm audit` can resolve a different advisory set. Without a Yarn baseline, a failure at phase 6.3 has no comparison point and no decision path.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Record `yarn audit --groups dependencies --level high` in phase 0; compare with `pnpm audit --prod --audit-level high` in phase 6. | Clear baseline | One extra network command |
| B | Use `pnpm audit` as the only gate. | Less work | No attribution for new findings |

**Recommendation:** Option A.

**User Decision:** Resolved — User accepted the recommendation on 2026-10-26.

---

### PF-011: Verification commands contain counting and runner inaccuracies 🟡 MINOR

**Dimension:** 12 — Consistency
**Location:** Plan phase 2.6 and verification matrix (`99-execution-plan.md:127`, `:200-206`)
**Codebase Evidence:** Five compose files exist: `docker/docker-compose.yml`, `docker/docker-compose.prod.yml`, `docker/admin-playground/compose.yml`, `test-harness/docker-compose.yml`, `test-harness/docker-compose.production-security.yml`. `docker buildx build --platform linux/amd64,linux/arm64` without `--push`/`--output` may not produce a usable multi-arch artifact with the default driver. The Docker builder should use `pnpm install --frozen-lockfile`.

**The Problem:** The plan says “all four compose files” in the matrix while listing five in phase 2.6. The multi-arch command is ambiguous, and the builder install command should be frozen to match the migration contract.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Correct to five compose files; use `--output type=oci` or `--push` for multi-arch (and `--load` for single-arch); state `pnpm install --frozen-lockfile` in both Dockerfile stages. | Exact, executable | Small edits |
| B | Leave details to execution. | Less text | Predictable confusion |

**Recommendation:** Option A.

**User Decision:** Resolved — User accepted the recommendation on 2026-10-26.

---

### PF-012: Documentation and plan-placement coverage is incomplete 🟡 MINOR

**Dimension:** 4 — Completeness Gaps / 13 — Codebase Alignment
**Location:** Plan phase 5.4–5.5 and AR-12/Next steps (`99-execution-plan.md:28`, `:176-178`, `:232-236`)
**Codebase Evidence:** `packages/sdk/README.md:371-377` documents `yarn test`, `yarn typecheck`, `yarn verify`; `scripts/setup-certs.sh:113-114` prints `yarn docker:up` and `yarn dev`; there is no `codeops/features/toolchain` folder (existing features are `admin-ui`, `_maintenance`, `monorepo-migration`, `production-readiness`, `sdk-server-contract-drift`, `tenant-user-management`, `test-assurance`, `user-invitations`). AR-12 says the plan lives outside the repo because Plan mode restricts files; Plan mode is now over.

**The Problem:** Phase 5 claims “no current-guidance file invokes Yarn,” but two tracked guidance files still do. The plan also is not in the repository’s CodeOps layout, so exec-plan/roadmap traceability is undefined, and AR-12 is stale.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Add `packages/sdk/README.md` and `scripts/setup-certs.sh` to phase 5; move the plan into `codeops/features/_maintenance/plans/pnpm-migration/` (or create a `toolchain` feature after confirmation) and update AR-12/Next steps. | Complete traceability | Requires a repo plan move and a feature decision |
| B | Keep the plan outside the repo; update the two docs only. | Less process | Weak CodeOps traceability |
| C | Ignore both docs; claim only “selected” guidance. | Least work | The phase-5 verification claim is false |

**Recommendation:** Option A — move the plan into `_maintenance` unless you want a new `toolchain` feature, and add the two docs.

**User Decision:** Resolved — User accepted the recommendation on 2026-10-26.

---

## Observations (optional)

### PF-OBS-1: Effort estimate is likely optimistic 🔵 OBSERVATION
The plan has 42 tasks. At 2–4 hours each, the total is roughly 84–168 hours (10–21 engineer-days), not 8–12. Adjust to 12–16 days or merge tasks before execution.

### PF-OBS-2: CI Docker image builds have no cache 🔵 OBSERVATION — user-requested scope addition
Branch CI uses plain `docker build` (`build-and-test.yml:174-175`) and the harness job rebuilds via `docker compose up -d --build` (`test-harness/fixtures/lifecycle-runtime.ts:360`). The release Docker workflow already uses GHA cache (`docker.yml:94-95`). Recommended additions: buildx + GHA cache for both images, a shared pnpm store cache mount, and a trimmed `.dockerignore`. See the separate “CI Docker build-time options” section below.

### PF-OBS-3: Minor follow-ups 🔵 OBSERVATION
- macOS `fsevents` is in `allowBuilds` but no macOS install check is planned.
- The Dockerfile builder stage should use `pnpm install --frozen-lockfile`; the plan says “pnpm install” in one place.
- `release-hardening.spec.test.mjs` has no Yarn references; updating it in phase 3 may be unnecessary and risks weakening non-Yarn invariants. Clarify that it is only touched if its commands change.
- Phase 5.3 overlaps phase 2.2/3.1 for `server-package`/`release` specs; state that 5.3 only verifies residual Yarn references.

## CI Docker build-time options (user-requested)

| Option | Where | Expected win | Effort |
|--------|-------|--------------|--------|
| A | Branch CI: `docker/setup-buildx-action` + `docker/build-push-action` with `cache-from: type=gha,scope=porta-ci` and `cache-to: type=gha,mode=max,scope=porta-ci` for the production image. | High; dependency/build layers reused across runs | Low |
| B | Harness: prebuild the harness image with buildx/GHA cache and make the lifecycle use the prebuilt image, or add compose `cache_from`/`cache_to` with a dedicated scope. | High; the harness image is rebuilt every run | Medium |
| C | Share the duplicated builder/prod-deps stages between `docker/Dockerfile` and `test-harness/Dockerfile`, or build both with `docker buildx bake` and a shared cache scope. | Medium–high; removes duplicate install/build work | Medium |
| D | Add a pnpm store cache mount (`--mount=type=cache,id=pnpm-store,target=/pnpm/store`) to both install stages; use `pnpm fetch` for the lockfile-only layer. | Medium within a build; avoids the second install’s downloads | Low–medium |
| E | Trim `.dockerignore` (`codeops/`, `techdocs/`, `repo-tests/`, `packages/*/tests`, `.turbo/`, `coverage/`, `test-results/`, `playwright-report/`, `release-artifacts/`, assurance runtime dirs) and use `COPY --link`. | Low–medium; smaller context | Low |
| F | Use `provenance: false` and `sbom: false` for branch CI validation builds; keep provenance for release. | Low | Low |

**Recommendation:** Add A and B to this migration’s phase 2. A is the cheapest high-impact change. B removes a separate full image rebuild from the harness job. Treat C–F as optional hardening after A/B. If the user accepts, add a Phase 2 task and update the 42-task count.

## Post-preflight POC evidence

Phase 0 was executed after the preflight pass. It confirmed or refined four decisions:

| Item | POC result | Plan action |
| --- | --- | --- |
| AR-16 package-local Docker dependencies | The production-only pnpm tree hoists all 25 server runtime dependencies to the root and satisfies every range; package-local `yaml` only appears in the full dev install. | Removed the package-local COPY from the plan and added a production dependency-range check plus `chalk`/`yaml` runtime smoke. |
| AR-8 peer installation | `autoInstallPeers: true` created a TypeScript 7 peer variant; `autoInstallPeers: false` plus a root TS6 alias makes lint pass. | Set `autoInstallPeers: false` and added AR-19. |
| AR-19 TypeScript compatibility | Without a root `typescript: npm:@typescript/typescript6@^6.0.2` alias, `typescript-eslint` fails with “does not support TS 7.0”. | Added the root alias to Phase 1.3. |
| AR-20 agent skills | pnpm 12 offered to link `dotenv` agent skills. | Added `skills.dirs: []` to `pnpm-workspace.yaml`. |

Additional POC results: `pnpm import` + install succeeded (829 resolved, 840 added); build, typecheck, lint, and a narrow server unit test pass; production and harness POC images both built at 219 MB versus 225 MB for the Yarn baseline; `jwt-decode@4.0.0` is present at the hoisted root; task-created scratch files and images were removed.

## Verdict

**✅ PREFLIGHT PASSED WITH NOTES — 12 findings resolved, 3 observations accepted.**

The plan is structurally sound, the spec-first exceptions are explicitly justified, and the release, Docker, registry, CI, and dependency-graph risks now have evidence-backed resolutions. The highest-risk remaining items are POC gates, not unresolved plan ambiguities:

- AR-16: the pnpm production tree must prove the package-local server dependencies.
- AR-8/AR-10: `autoInstallPeers` and `jwt-decode` must be confirmed in the POC.
- AR-18: Dependabot and the GitHub dependency graph must prove the two-document lockfile.
- The release rehearsal must prove pnpm publish/pack integrity and the effective registry.

The 3 observations (effort estimate, CI Docker caching, minor follow-ups) are accepted; CI Docker caching is now in phase 2 as AR-15. A fresh-session review is still advisable because this plan was created and preflighted in the same session.

## Resolutions applied

All accepted resolutions are incorporated in `99-execution-plan.md`; T-04 is registered on `codeops/features/_maintenance/00-roadmap.md`. No product source has been modified. Execution can begin with phase 0.
