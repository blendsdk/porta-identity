# Execution Plan: Porta Monorepo Migration

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-08-08 21:07
> **Progress**: 51/59 tasks (86%)
> **CodeOps Artifact Schema**: 1

## Overview

Execute the structural migration on `monorepo-migrate`, prove behavioral parity, and then upgrade the toolchain. Every migration commit builds and tests only. Publishing, release automation, version 1.7.0, changelogs, tags, npm deprecation, and deployment cutover are explicitly deferred to a separate post-parity plan. (AR-33)

**🚨 Update this document after EACH completed task!**

## Implementation Phases

| Phase | Title | Tasks |
|---|---|---:|
| 1 | Workspace topology | 15 |
| 2 | Server package and structural parity | 20 |
| 3 | Documentation separation | 8 |
| 4 | Toolchain and dependency upgrade | 8 |
| 5 | Branch CI and final parity | 8 |

**Total: 59 tasks across 5 phases**

> **⚠️ EXECUTION RULE — APPLIES TO EVERY AGENT EXECUTING THIS PLAN:**
>
> The task checkboxes below are the single source of truth. Mark a task `[~]` with an actual implementation timestamp, promote it to `[x]` only after its verification passes, and update this header after every task. Resume the first `[~]`, otherwise the first `[ ]`. Mark a blocker `[!]` with its reason. Timestamps come from `date '+%Y-%m-%d %H:%M'`.

## Phase 1: Workspace Topology

> **Phase baseline tree**: `231a65a4207628ffae3735186c6c8b915388e6bd`
> **Scope mode**: strict
> **Expected modification set**: `repo-tests/monorepo/`, root/package manifests and configs, `turbo.json`, `yarn.lock`, `packages/server`, renamed SDK/CLI paths, removed admin-GUI workspace, and this execution plan
> **Lenses**: correctness · maintainability · standards · migration compatibility · API surface

### Step 1.1: Specify the repository shape

**Reference**: [Workspace Layout](03-01-workspace-layout.md) · ST-01–ST-08 · AR-05–AR-12, AR-17, AR-34

- [x] 1.1.1 [spec-author] Write workspace-layout cases ST-01–ST-06 — `repo-tests/monorepo/workspace-layout.spec.test.mjs` ✅ (completed: 2026-08-08 16:15)
- [x] 1.1.2 [spec-author] Write server-tree/package cases ST-07–ST-08 — `repo-tests/monorepo/server-package.spec.test.mjs` ✅ (completed: 2026-08-08 16:36)
- [x] 1.1.3 Run the root Node specification files directly and record the expected red result — `node --test repo-tests/monorepo/*.spec.test.mjs` ✅ (completed: 2026-08-08 16:45; expected red: 7 failed, 1 passed)

### Step 1.2: Create the package topology

**Reference**: [Workspace Layout §Target Tree](03-01-workspace-layout.md#target-tree) · MR-01–MR-06

- [x] 1.2.1 Rename SDK and CLI directories with history — `packages/porta-sdk`, `packages/porta-cli` → `packages/sdk`, `packages/cli` ✅ (completed: 2026-08-08 16:55)
- [x] 1.2.2 Remove the approved admin-GUI source workspace/tests/assets while preserving non-blocking `porta gui` CLI code — `packages/porta-admin-gui` ✅ (completed: 2026-08-08 16:55)
- [x] 1.2.3 Create the server package shell and move TypeScript/ESLint/Vitest configurations — `packages/server/package.json`, server configs ✅ (completed: 2026-08-08 16:55)
- [x] 1.2.4 Move server source and the pre-existing behavioral test directories/files — `src/` → `packages/server/src/`, existing `tests/` → `packages/server/tests/` ✅ (completed: 2026-08-08 16:55)
- [x] 1.2.5 Move migrations, templates, and locales without content edits — root asset directories → `packages/server/` ✅ (completed: 2026-08-08 16:55)
- [x] 1.2.6 Convert root manifest to coordinator workspaces/engines, fold harness dependencies into the root install, remove its nested manifest/lockfile, and add the minimal Turbo pipeline — `package.json`, `test-harness/package.json`, `test-harness/yarn.lock`, `turbo.json` ✅ (completed: 2026-08-08 16:55)
- [x] 1.2.7 Add stable root structure-test and active package command aliases — `package.json` ✅ (completed: 2026-08-08 16:55)
- [x] 1.2.8 Update renamed SDK/CLI manifests/config paths and exact SDK dependency edge — `packages/sdk`, `packages/cli` ✅ (completed: 2026-08-08 16:55)
- [x] 1.2.9 Reinstall with Yarn Classic and regenerate the active root lockfile — `yarn.lock` ✅ (completed: 2026-08-08 16:55)
- [x] 1.2.10 Run topology specifications to green — `repo-tests/monorepo/*.spec.test.mjs` ✅ (completed: 2026-08-08 16:55; 8 passed)
- [x] 1.2.11 Write workspace-policy implementation edge tests after green — `repo-tests/monorepo/workspace-layout.impl.test.mjs` ✅ (completed: 2026-08-08 16:55; 4 passed)
- [x] 1.2.12 Verify root workspace discovery, structure tests, and package builds — root and `packages/*` ✅ (completed: 2026-08-08 17:31; frozen install, 14 structure tests, 3 package builds, server 3,344 tests, SDK 404 tests, and CLI 355 tests passed)

**Verify**: `yarn test:structure && yarn build`

> **Phase boundary:** root dependency ownership and the single-lockfile contract are active. The retained OIDC harness is not a Phase 1 verification target; its install consumers, Dockerfile, and moved source paths remain unavailable until tasks 2.2.10–2.2.12 complete in the structural-parity phase.

### Phase 1 quality review

- Independent implementation review: no critical findings; root CI aliases and repository-root operational execution were corrected before the final gate.
- Independent strict-scope audit: no playground drift, secret additions, product behavior edits, or move-integrity loss; harness ownership bookkeeping and active guidance were corrected before the final gate.
- Parent review corrected stale type-only SDK source imports in three relocated server contract tests; targeted lint and 35 contract tests passed.
- Final gate: `yarn install --frozen-lockfile`, `yarn test:structure`, `yarn build`, `yarn test:unit`, and `yarn verify` passed.

## Phase 2: Server Package and Structural Parity

> **Phase baseline tree**: `f5b576ef177dc3ecd24483902faad78177af26bf`
> **Scope mode**: strict
> **Expected modification set**: `packages/server` runtime-path source/tests/manifest/README, root operational aliases, production Docker files, retained `test-harness` Docker/Compose/scripts/tests, provisioning smoke imports, and this execution plan
> **Lenses**: correctness · security · runtime compatibility · package contents · test parity

### Step 2.1: Specify installed runtime behavior

**Reference**: [Server Runtime](03-02-server-runtime.md) · ST-09–ST-12 · MR-03–MR-05, MR-15

- [x] 2.1.1 [spec-author] Write unrelated-cwd asset/seed resolution ST-09 — `packages/server/tests/unit/lib/runtime-paths.spec.test.ts` ✅ (completed: 2026-08-08 17:35)
- [x] 2.1.2 Extend server specifications for output, Docker, suite/harness inventory ST-10–ST-12 — `repo-tests/monorepo/server-package.spec.test.mjs` ✅ (completed: 2026-08-08 17:41)
- [x] 2.1.3 Run runtime/server specifications and record the expected red result — targeted spec files ✅ (completed: 2026-08-08 17:42; runtime module missing; server package 4 failed, 4 passed)

### Step 2.2: Make the server and retained tests self-contained

**Reference**: [Server Runtime §Runtime Asset Resolution](03-02-server-runtime.md#runtime-asset-resolution) · AR-08, AR-09, AR-15, AR-16, AR-34

- [x] 2.2.1 Add package-root/runtime-asset resolver — `packages/server/src/lib/runtime-paths.ts` ✅ (completed: 2026-08-08 17:42; unrelated-cwd specification passed)
- [x] 2.2.2 Route database migration lookup through the resolver — `packages/server/src/lib/migrator.ts` ✅ (completed: 2026-08-08 17:42)
- [x] 2.2.3 Route seed SQL lookup through the resolver — `packages/server/src/cli/commands/seed.ts` ✅ (completed: 2026-08-08 17:42)
- [x] 2.2.4 Route locale initialization through the resolver — `packages/server/src/auth/i18n.ts` ✅ (completed: 2026-08-08 17:42)
- [x] 2.2.5 Route page and email template lookup through the resolver — template engine/renderers ✅ (completed: 2026-08-08 17:44; 44 targeted tests passed)
- [x] 2.2.6 Update server scripts, files/bin metadata, and package README — `packages/server/package.json`, `packages/server/README.md` ✅ (completed: 2026-08-08 17:44; package contents and build-output specifications passed)
- [x] 2.2.7 Update root operational aliases and moved Playwright/Vitest paths — root/server configs ✅ (completed: 2026-08-08 17:46; server typecheck passed)
- [x] 2.2.8 Rewrite production Docker build stages for the server workspace and retained `/app` layout — `docker/Dockerfile` ✅ (completed: 2026-08-08 17:47; Docker build check passed)
- [x] 2.2.9 Update Docker/Compose runtime references only where moved paths require it — `docker/entrypoint.sh`, Compose files ✅ (completed: 2026-08-08 17:47; no content update required because `/app` layout is retained)
- [x] 2.2.10 Update retained OIDC harness dependency consumers to use the root install — harness scripts and SPA asset paths ✅ (completed: 2026-08-08 17:47)
- [x] 2.2.11 Remove obsolete admin-GUI harness stages and update the server build paths — `test-harness/Dockerfile` ✅ (completed: 2026-08-08 17:48; Docker build check passed)
- [x] 2.2.12 Update harness seed/start paths and provisioning smoke imports — `test-harness/scripts/seed.ts`, harness scripts, `scripts/provision-smoke-test.ts` ✅ (completed: 2026-08-08 17:49)
- [x] 2.2.13 Run ST-09–ST-12 to green — runtime/server specification files ✅ (completed: 2026-08-08 17:49; runtime-path 1 passed and server-package 8 passed)
- [x] 2.2.14 Write runtime-path implementation edge tests after green — `packages/server/tests/unit/lib/runtime-paths.impl.test.ts` ✅ (completed: 2026-08-08 17:50; 3 implementation cases passed)
- [x] 2.2.15 Run lint/typecheck/build and the existing unit suite from new paths — active packages ✅ (completed: 2026-08-08 17:51; lint, typecheck, 3 builds, 143 unit files, and 2,721 unit tests passed)
- [x] 2.2.16 Run integration, E2E, pentest, UI, SDK, CLI, and OIDC harness suites; audit provisioning smoke against its baseline — retained test systems ✅ (completed: 2026-08-08 18:23; integration 275, E2E 128, pentest 224, UI 134, SDK 404, CLI 355, and harness 6 passed; provisioning smoke reproduced its baseline missing-module failure and is an explicit parity-gate exclusion)
- [x] 2.2.17 Record structural-parity evidence and compare inventory to the baseline, excluding only removed GUI tests — `99-execution-plan.md` ✅ (completed: 2026-08-08 18:12; 4,103 baseline non-GUI tests retained plus 4 runtime-path tests; 223 baseline behavioral files retained plus 2 runtime-path files; 75 removed GUI tests remain excluded)

### Phase 2 parity evidence

- The retained unit/integration/E2E/pentest/SDK/CLI matrix increased from 4,103 to 4,107 tests only through the four new runtime-path assertions; no baseline test was removed.
- Browser coverage remains 134 server UI tests and 6 OIDC harness flows. The harness now uses the root dependency graph, supports isolated host ports, and scopes cleanup to its own services.
- Both Dockerfiles build the server workspace and include Yarn 1's hoisted and package-local production dependency directories. The production image runs as `porta`, exposes its health check, and passes an embedded CLI smoke test.
- `scripts/provision-smoke-test.ts` was already non-runnable at the phase baseline because it imports a removed `src/cli/commands/provision.js` module. Its remaining source imports were relocated structurally; repairing the missing provisioning module is explicitly deferred because it would change product/module behavior.
- **Baseline-parity exception:** the user's strict no-product-fix rule authorizes reproduction and documentation of this pre-existing provisioning-smoke failure instead of repair. It is not a green migration gate; a follow-on product task must restore it after structural parity.

**Verify**: `yarn verify && yarn harness:test`; separately reproduce and record the known `yarn provision:smoke` baseline failure

## Phase 3: Documentation Separation

> **Phase baseline tree**: `df55f0dd3387f865499900da3701310492e85ffd`
> **Scope mode**: strict
> **Expected modification set**: `repo-tests/monorepo/docs-boundary.*.test.mjs`, `docs/`, top-level `techdocs/`, this execution plan, and the feature roadmap
> **Lenses**: correctness · documentation boundary · link integrity · migration compatibility

### Step 3.1: Specify and implement the audience boundary

**Reference**: [Documentation Boundary](03-03-documentation.md) · ST-13–ST-16 · MR-07 · AR-34

- [x] 3.1.1 [spec-author] Write documentation-boundary cases ST-13–ST-16 — `repo-tests/monorepo/docs-boundary.spec.test.mjs` ✅ (completed: 2026-08-08 18:44)
- [x] 3.1.2 Run the documentation specification and record the expected red result — docs specification ✅ (completed: 2026-08-08 18:44; expected red: 4 failed, 1 passed)
- [x] 3.1.3 Move technical Markdown out of the VitePress source tree — `docs/implementation-details/` → `techdocs/` ✅ (completed: 2026-08-08 18:45; 12 files preserved as exact renames)
- [x] 3.1.4 Remove technical-doc navigation/sidebar entries and fix public links — VitePress config, public Markdown ✅ (completed: 2026-08-08 18:45; boundary specification passed)
- [x] 3.1.5 Update public server/SDK/CLI package and monorepo path references without redesigning `porta gui` docs — affected public docs ✅ (completed: 2026-08-08 18:48; 2 targeted specification cases passed)
- [x] 3.1.6 Convert moved technical-doc links/paths and remove claims that the deleted GUI workspace is current repository architecture — `techdocs/**/*.md` ✅ (completed: 2026-08-08 18:54; technical docs and local links verified)
- [x] 3.1.7 Run ST-13–ST-16 to green and build VitePress — docs specification and `docs/` ✅ (completed: 2026-08-08 18:55; documentation specifications passed and VitePress built)
- [x] 3.1.8 Write technical-link traversal implementation tests and run docs verification — `repo-tests/monorepo/docs-boundary.impl.test.mjs` ✅ (completed: 2026-08-08 18:58; 3 implementation cases, 30 structure tests, and VitePress build passed)

**Verify**: `yarn test:structure && yarn docs:build`

### Phase 3 quality review

- The docs-only policy ran one independent correctness reviewer; security and performance auditors were intentionally skipped.
- The initial review found three major boundary defects: a public maintainer migration plan, stale current-GUI claims, and a broken GUI-migration sidebar route. The user accepted the narrowed remediation batch.
- The remediation moved the SDK/CLI migration record to technical docs, removed maintainer-only public content, confined GUI language to factual compatibility guidance, and added literal VitePress route validation.
- The single focused re-review found no remaining critical or major findings and declared the phase safe to commit.
- Final phase gate: 30 structure tests and the VitePress build passed.

## Phase 4: Toolchain and Dependency Upgrade

> **Phase baseline tree**: `8365349e0b6924351f408e6f2eb1386be7ffe9fb`
> **Scope mode**: strict
> **Expected modification set**: `repo-tests/monorepo/toolchain.spec.test.mjs`, root and active-package manifests/config/source compatibility edits, `yarn.lock`, this execution plan, and the feature roadmap
> **Lenses**: correctness · dependency compatibility · TypeScript migration · behavioral parity · supply-chain risk

### Step 4.1: Upgrade only after parity

**Reference**: [Toolchain and CI §Dependency and TypeScript Upgrade](03-04-release-and-ci.md#dependency-and-typescript-upgrade) · ST-17 · MR-09–MR-10

- [x] 4.1.1 Confirm Phase 2 structural-parity evidence before any manifest update — `99-execution-plan.md` ✅ (completed: 2026-08-08 20:22; parity evidence present and manifests unchanged)
- [x] 4.1.2 [spec-author] Write toolchain/dependency specification ST-17 — `repo-tests/monorepo/toolchain.spec.test.mjs` ✅ (completed: 2026-08-08 20:25)
- [x] 4.1.3 Run the toolchain specification and record the expected red result — toolchain specification ✅ (completed: 2026-08-08 20:26; expected red: TypeScript contract 1 failed, 3 passed)
- [x] 4.1.4 Add approved workspace ncu scripts and update root tooling to latest selected releases — `package.json` ✅ (completed: 2026-08-08 20:26; root ncu selection reports current)
- [x] 4.1.5 Update server dependencies and TypeScript 7 compatibility — server manifest/config/source only as required ✅ (completed: 2026-08-08 20:29; manifest selects latest dependencies and stable TypeScript 7.0.2)
- [x] 4.1.6 Update SDK and CLI dependencies and TypeScript 7 compatibility — SDK/CLI manifests/config/source only as required ✅ (completed: 2026-08-08 20:31; both manifests select latest dependencies and stable TypeScript 7.0.2)
- [x] 4.1.7 Regenerate `yarn.lock`, run ST-17 to green, and confirm ncu reports no eligible updates — root lockfile ✅ (completed: 2026-08-08 21:07; ST-17 passed 4/4, ncu reports all manifests current, frozen install passed, and the refreshed production graph audits at zero vulnerabilities)
- [x] 4.1.8 Run full parity; stop on an incompatible latest dependency rather than silently pinning — all active packages/tests ✅ (completed: 2026-08-08 21:07; repeated 34 structure tests, server 3,348, SDK 404, CLI 355, all TypeScript 7 builds, and isolated-port harness 6/6 passed)

**Verify**: `yarn deps:check && yarn verify && yarn harness:test`

## Phase 5: Branch CI and Final Parity

### Step 5.1: Make migration commits build and test cleanly

**Reference**: [Toolchain and CI §Build and Test Workflow](03-04-release-and-ci.md#build-and-test-workflow) · ST-18 · MR-11–MR-15 · AR-33

- [ ] 5.1.1 [spec-author] Write branch build/test and no-publication specification ST-18 — `repo-tests/monorepo/ci.spec.test.mjs`
- [ ] 5.1.2 Run the CI specification and record the expected red result — CI specification
- [ ] 5.1.3 Update `Build and Test` jobs to root Turbo/workspace commands and retained suites, with no publishing steps — `.github/workflows/build-and-test.yml`
- [ ] 5.1.4 Run ST-18 to green — CI specification
- [ ] 5.1.5 Write CI-contract implementation diagnostics after green — `repo-tests/monorepo/ci.impl.test.mjs`
- [ ] 5.1.6 Run frozen install, full verify, OIDC harness, and CI-contract tests; confirm the documented provisioning-smoke baseline exclusion — whole repository
- [ ] 5.1.7 Build VitePress and smoke the production Docker image, including health and embedded `porta` CLI — `docs/`, `docker/`
- [ ] 5.1.8 Confirm the diff contains no playground compatibility edits, product changes, publishing/release/version activity, npm deprecation, or `main` mutation; refresh CodeOps analysis and complete the plan — whole repository

**Verify**: `yarn verify && yarn harness:test && yarn docs:build` plus production Docker smoke and reproduction of the documented provisioning-smoke baseline exclusion

## Dependencies

```text
Phase 1 workspace topology
    ↓
Phase 2 server package + structural parity
    ├──→ Phase 3 docs boundary
    ↓
Phase 4 toolchain/dependencies
    ↓
Phase 5 branch CI + final parity
    ↓
Separate publishing/release cutover plan (not part of this execution)
```

## Success Criteria

The migration is complete when all 59 tasks and AC-01–AC-06 pass and the branch is ready for the separate publishing-cutover follow-on. No task in this plan authorizes publication or a merge to production `main`.
