# Preflight Report: Porta Monorepo Migration

> **Status**: ✅ PASSED WITH NOTES — 5 resolved, 7 explicitly deferred outside migration scope
> **Iteration**: 2 (bounded re-scan after user rulings and plan corrections)
> **Artifact**: Full implementation plan at `codeops/features/monorepo-migration/plans/monorepo-migration/`
> **Artifact Hash**: `a39db1f17185b7a6ad11b28967328160ff888b6ac8f95138ca51a4f59667fa09`
> **Codebase Grounded**: 10 plan documents; 100+ repository references checked across manifests, source, tests, Docker, docs, workflows, and local Lockstep/JSVision references
> **Last Updated**: 2026-08-08 15:07

> ⚠️ **SAME-SESSION REVIEW:** This plan was created in the current session. Five independent dimension-cluster audits and one independent recommendation challenger were used to reduce same-agent bias. Human review remains appropriate because release automation is externally mutating.

## Audit Scope

- **Target:** all plan documents in this directory.
- **Context:** repository `AGENTS.md`, current Porta code/config/tests, local `@blendsdk/lockstep` source, and JSVision release reference.
- **Product scope:** strict structural migration; no optional product work was admitted.
- **Modification set:** none until the user accepts findings and explicitly requests plan corrections.

## Codebase Context Summary

**Tech stack:** Node 22, TypeScript ESM, Koa, `oidc-provider`, PostgreSQL, Redis, Yarn Classic, Vitest/Playwright, Docker, VitePress, GitHub Actions.
**Architecture:** server currently lives at repository root; SDK, CLI, and admin GUI are workspaces; Docker ships the server; VitePress mixes public and technical docs; Semantic Release publishes after successful `main` CI.
**Key evidence:** `package.json`, workspace manifests/configs, `src/cli`, runtime asset consumers, `docker/`, `test-harness/`, docs config/tree, all workflows, release scripts, and Lockstep version/publish implementation.

## Summary by Dimension

| # | Dimension | Findings | Highest severity |
|---|---|---:|---|
| 1 | Ambiguities | 1 | 🟡 Minor |
| 2 | Implicit Assumptions | 4 | 🔴 Critical |
| 3 | Logical Contradictions | 2 | 🔴 Critical |
| 4 | Completeness Gaps | 6 | 🟠 Major |
| 5 | Dependency Issues | 4 | 🟠 Major |
| 6 | Feasibility Concerns | 3 | 🟠 Major |
| 7 | Testability | 3 | 🟠 Major |
| 8 | Security Blind Spots | 2 | 🟠 Major |
| 9 | Edge Cases | 2 | 🟠 Major |
| 10 | Scope Creep Indicators | 1 | 🟡 Minor |
| 11 | Ordering & Sequencing | 4 | 🔴 Critical |
| 12 | Consistency | 3 | 🟠 Major |
| 13 | Codebase Alignment | 8 | 🔴 Critical |

Counts by dimension overlap because one root cause may affect multiple dimensions.

## Summary by Severity

| Severity | Count | Status |
|---|---:|---|
| 🔴 Critical | 2 | Deferred outside current plan by AR-33 |
| 🟠 Major | 7 | 5 resolved or narrowed; 2 deferred by AR-33/AR-34 |
| 🟡 Minor | 3 | 1 resolved; 2 deferred by AR-33 |
| 🔵 Observation | 0 | — |

## Findings

### PF-001: The planned first release cannot be 1.7.0 🔴 CRITICAL

**Dimension:** Logical Contradictions; Ordering; Codebase Alignment
**Location:** `03-04-release-and-ci.md` §Lockstep Model; ST-08/ST-19; Phase 5
**Codebase Evidence:** current public manifests and tag are `1.6.2`; Lockstep `version()` always applies a bump to the current public package version (`lockstep/src/lockstep.ts:479-495`).

**Problem:** the plan pre-seeds public packages at `1.7.0`, then asks Lockstep to version them, producing at least `1.7.1` and likely `1.8.0`.

**Options:**

| Option | Description | Trade-off |
|---|---|---|
| A | Keep root/public manifests at `1.6.2` during migration; at cutover run an explicit Lockstep minor bump and assert `1.7.0` before credentials are available | One normal Lockstep path; manifests show 1.7.0 only at release |
| B | Pre-seed 1.7.0 and special-case the first release to skip Lockstep versioning | Preserves pre-release display but creates a bootstrap-only release path |

**Recommendation:** A. It is deterministic and does not depend on squash-commit classification.
**Confidence:** High. **Hardening:** independent challenger confirmed critical severity and rejected the bootstrap-only path as unnecessary ceremony.
**User Decision:** Deferred by user — publication/versioning is a separate post-parity follow-on. Migration retains the existing synchronized baseline (AR-33).

### PF-002: Detached release checkout can strand published packages 🔴 CRITICAL

**Dimension:** Implicit Assumptions; Feasibility; Security; Codebase Alignment
**Location:** `03-04-release-and-ci.md` §Release Workflow; Phase 5 release task
**Codebase Evidence:** Lockstep publishes sequentially and then uses `git push --follow-tags` (`lockstep/src/lockstep.ts:633-692`); a raw-SHA checkout is detached.

**Problem:** npm publication can succeed before the release commit/tag push fails because no attached/upstream branch exists.

**Options:**

| Option | Description | Trade-off |
|---|---|---|
| A | Attach guarded local `main` at `workflow_run.head_sha`, set upstream, assert `origin/main` still matches, then use non-force branch/tag pushes | Small guarded Git setup; follows Lockstep's normal model |
| B | Stay detached and implement explicit guarded `HEAD:main` and tag pushes outside Lockstep | Viable but duplicates more Git behavior in workflow code |

**Recommendation:** A, while retaining an explicit tag push and recovery steps.
**Confidence:** High. **Hardening:** challenger confirmed; remote races remain fail-safe because pushes are non-force.
**User Decision:** Deferred by user — Git release topology is owned by the post-parity publishing follow-on (AR-33).

### PF-003: Structural specification tests have no stable path or initial runner 🟠 MAJOR

**Dimension:** Ordering; Testability; Consistency
**Location:** target tree, ST file table, Phase 1 tasks
**Codebase Evidence:** the plan creates `tests/monorepo`, later moves all `tests/`, and current Vitest config does not include root `.mjs` structure tests.

**Problem:** Phase 1 moves its own oracle and cannot execute the first red check as written.

**Options:**

| Option | Description | Trade-off |
|---|---|---|
| A | Put repository contracts in stable root `repo-tests/monorepo/` and run them with Node's test runner | Clear ownership; requires reference updates |
| B | Keep `tests/monorepo` and selectively move every pre-existing behavioral test child | Fewer reference updates; selective move is easier to miss |

**Recommendation:** A. It cleanly separates repository contracts from server behavior tests.
**Confidence:** High. **Hardening:** challenger preferred the stable root-only directory.
**User Decision:** Resolved — recommendation A applied; repository contracts moved to stable root `repo-tests/monorepo/` with a direct red runner.

### PF-004: Required release gates do not gate the observed workflow 🟠 MAJOR

**Dimension:** Completeness; Dependency Issues; Testability
**Location:** MR-15, CI Gates, Phase 6
**Codebase Evidence:** release observes only `Build and Test`; docs and Docker are independent workflows whose results cannot affect that conclusion.

**Problem:** the plan promises docs, Docker, package, and release-preflight success before eligibility without putting those non-publishing checks inside the observed CI workflow.

**Options:**

| Option | Description | Trade-off |
|---|---|---|
| A | Add non-publishing docs/Docker/package/release-preflight jobs and a workflow-contract spec to `Build and Test` | Preserves one release oracle and CI parallelism |
| B | Create an aggregate release-gate workflow and retarget release | Adds orchestration and more workflow coupling |

**Recommendation:** A. Deployment/publication workflows remain separate.
**Confidence:** High. **Hardening:** challenger confirmed the aggregate workflow is overengineered.
**User Decision:** Resolved by scope narrowing — migration CI builds/tests only; release-gate aggregation is deferred with all publishing workflows (AR-33).

### PF-005: Runtime asset migration omits server seed SQL 🟠 MAJOR

**Dimension:** Completeness; Codebase Alignment
**Location:** runtime asset consumer inventory and Phase 2 tasks
**Codebase Evidence:** `src/cli/commands/seed.ts:25-26,75-76` independently reads `process.cwd()/migrations/011_seed.sql`.

**Problem:** installed `porta-server seed` fails from an unrelated working directory even after the four listed asset consumers are fixed.

**Recommendation:** route seed SQL through the same package-root resolver and add an unrelated-cwd seed/resolver specification. Retaining cwd resolution is not compatible with the approved public package.
**Confidence:** High. **Hardening:** challenger confirmed this is required packaging compatibility, not product work.
**User Decision:** Resolved — accepted runtime-path correction now includes seed SQL and unrelated-cwd coverage.

### PF-006: Admin GUI removal leaves a dead public CLI command 🟠 MAJOR

**Dimension:** Completeness; Codebase Alignment
**Location:** MR-05, ST-03/ST-15, Phase 1/3
**Codebase Evidence:** `packages/porta-cli/src/index.ts:51,115-116` registers `guiCommand`; `packages/porta-cli/src/commands/gui.ts` imports and advertises `@portaidentity/admin-gui`.

**Problem:** deleting the GUI workspace still leaves `porta gui` as a broken advertised command.

**Recommendation:** remove the command module/import/registration and cover CLI help, active source, and public docs in the no-GUI contract. A tombstone command contradicts the accepted complete discard.
**Confidence:** High. **Hardening:** challenger confirmed.
**User Decision:** Deferred by user — preserve `porta gui` if CLI build/tests pass; remove it only as a migration blocker. Product direction revisited after migration (AR-34).

### PF-007: Active non-playground test infrastructure is omitted 🟠 MAJOR

**Dimension:** Completeness; Dependency Issues; Codebase Alignment
**Location:** package topology, structural parity, and final CI phases
**Codebase Evidence:** root scripts expose `test-harness`; its Dockerfile builds old server/SDK/admin-GUI paths, its seed imports root `src`, and `scripts/provision-smoke-test.ts:158-162` also imports root server source.

**Options:**

| Option | Description | Trade-off |
|---|---|---|
| A | Retain/migrate the harness as test infrastructure: root-owned deps/lockfile, updated paths, no GUI stage, plus harness/provision smoke parity | More structural work, preserves tests and single active lockfile |
| B | Explicitly defer/discard the harness alongside playgrounds and exclude it from coverage claims/scans | Faster, but requires a new scope decision and loses active OIDC harness coverage |

**Recommendation:** A. The harness is explicitly exposed as a test facility, not a playground. Actual playground scripts/lockfiles remain untouched.
**Confidence:** Medium. **Hardening:** challenger confirmed A; the classification is the only user-dependent aspect.
**User Decision:** Resolved — retain and structurally migrate the OIDC harness and provisioning smoke test as parity assets; playgrounds remain deferred.

### PF-008: Release write credentials are available too broadly unless current protection is retained 🟠 MAJOR

**Dimension:** Security Blind Spots
**Location:** release workflow design and ST-23
**Codebase Evidence:** current workflow explicitly sets `persist-credentials: false`; the plan does not preserve or test it.

**Problem:** default checkout authentication would expose repository write authority while third-party install/build/version tooling executes.

**Recommendation:** require `persist-credentials: false`; expose npm credentials only to publish and GitHub write auth only to final explicit push/release steps; test the setting and token-bearing step allowlist.
**Confidence:** High. **Hardening:** challenger kept this separate from Git topology.
**User Decision:** Deferred by user — release credentials are owned by the post-parity publishing follow-on (AR-33).

### PF-009: Sequential npm publication has no partial-failure recovery 🟠 MAJOR

**Dimension:** Edge Cases; Feasibility
**Location:** Lockstep behavior, release error handling, ST-22
**Codebase Evidence:** Lockstep publishes packages one by one (`lockstep/src/lockstep.ts:669-686`); npm versions are immutable.

**Problem:** if a later package fails, a normal rerun stops at an already-published earlier version and can strand the release.

**Recommendation:** before live mutation verify auth/access, assert 1.7.0 absent, and pack/install/smoke all artifacts. Document concise publish-only-missing recovery in topological order; push tag/create GitHub Release only after all three versions are observable. Do not build a custom transactional publisher.
**Confidence:** High. **Hardening:** challenger confirmed this proportionate runbook and rejected a bespoke publisher.
**User Decision:** Deferred by user — npm publication and recovery are owned by the post-parity publishing follow-on (AR-33).

### PF-010: “Latest compatible” permits an unapproved dependency pin 🟡 MINOR

**Dimension:** Ambiguities; Consistency
**Location:** MR-10, ST-17, Phase 4
**Problem:** “latest compatible” could silently leave an eligible package behind while ST-17 requires ncu to report no updates.

**Recommendation:** latest means every dependency selected by the approved ncu command. If the latest release cannot be made behavior-compatible, stop for a user ruling; do not create a silent exclusion list.
**User Decision:** Resolved — latest means the complete approved ncu selection; incompatibility stops for a ruling rather than creating a silent pin.

### PF-011: Package validation contract is incomplete 🟡 MINOR

**Dimension:** Completeness; Testability
**Location:** ST-10, package ownership, final package smoke
**Problem:** the server tarball expects a license with no task supplying it, and generic “install/load” wording could imply the forbidden server JavaScript API.

**Recommendation:** copy the root MIT license into all three public packages and use package-specific smoke tests: server executable/assets/startup, SDK documented imports, CLI executable.
**User Decision:** Deferred by user — tarball/license/publication validation belongs to the publishing follow-on; migration validates build output, executables, assets, docs, Docker, and tests.

### PF-012: LLM secrecy requirement is stronger than the planned proof 🟡 MINOR

**Dimension:** Security; Testability
**Location:** MR-13, ST-23
**Codebase Evidence:** Lockstep sends commit subjects/bodies and changed paths, but no source content/diffs; commit metadata can itself contain accidentally committed text.

**Recommendation:** precisely guarantee that no source contents, diffs, or credential environment values are sent; scan the release commit metadata/path range before enabling model keys and fall back to deterministic notes on a secret match.
**User Decision:** Deferred by user — release-note providers and their metadata controls belong to the publishing follow-on (AR-33).

## Iteration 2 Verification

- The plan parser reports `Ready`, 59 tasks, and no structural problems.
- Repository-contract tests now have a stable root path and executable red command.
- Seed SQL, retained OIDC harness, and provisioning smoke are explicitly migrated and verified before the dependency upgrade.
- Latest dependency behavior is unambiguous and fail-closed.
- `porta gui` is preserved conditionally exactly as ruled in AR-34.
- No task configures, dry-runs, repairs, or executes publishing. All affected release findings are owned by the explicit AR-33 follow-on and must be re-audited there.
- The bounded scan found no new critical, major, or minor defect in the narrowed structural-migration plan.

## Verdict

✅ **PREFLIGHT PASSED WITH NOTES.** The structural migration plan may execute. Publishing remains mandatory follow-on work before merging to production `main`, but it does not block branch-local migration, build, or test work.
