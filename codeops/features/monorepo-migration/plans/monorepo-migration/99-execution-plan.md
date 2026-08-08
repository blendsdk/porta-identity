# Execution Plan: Porta Monorepo Migration

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-08-08 16:36
> **Progress**: 2/59 tasks (3%)
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
- [ ] 1.1.3 Run the root Node specification files directly and record the expected red result — `node --test repo-tests/monorepo/*.spec.test.mjs`

### Step 1.2: Create the package topology

**Reference**: [Workspace Layout §Target Tree](03-01-workspace-layout.md#target-tree) · MR-01–MR-06

- [ ] 1.2.1 Rename SDK and CLI directories with history — `packages/porta-sdk`, `packages/porta-cli` → `packages/sdk`, `packages/cli`
- [ ] 1.2.2 Remove the approved admin-GUI source workspace/tests/assets while preserving non-blocking `porta gui` CLI code — `packages/porta-admin-gui`
- [ ] 1.2.3 Create the server package shell and move TypeScript/ESLint/Vitest configurations — `packages/server/package.json`, server configs
- [ ] 1.2.4 Move server source and the pre-existing behavioral test directories/files — `src/` → `packages/server/src/`, existing `tests/` → `packages/server/tests/`
- [ ] 1.2.5 Move migrations, templates, and locales without content edits — root asset directories → `packages/server/`
- [ ] 1.2.6 Convert root manifest to coordinator workspaces/engines and add the minimal Turbo pipeline — `package.json`, `turbo.json`
- [ ] 1.2.7 Add stable root structure-test and active package command aliases — `package.json`
- [ ] 1.2.8 Update renamed SDK/CLI manifests/config paths and exact SDK dependency edge — `packages/sdk`, `packages/cli`
- [ ] 1.2.9 Reinstall with Yarn Classic and regenerate the active root lockfile — `yarn.lock`
- [ ] 1.2.10 Run topology specifications to green — `repo-tests/monorepo/*.spec.test.mjs`
- [ ] 1.2.11 Write workspace-policy implementation edge tests after green — `repo-tests/monorepo/workspace-layout.impl.test.mjs`
- [ ] 1.2.12 Verify root workspace discovery, structure tests, and package builds — root and `packages/*`

**Verify**: `yarn test:structure && yarn build`

## Phase 2: Server Package and Structural Parity

### Step 2.1: Specify installed runtime behavior

**Reference**: [Server Runtime](03-02-server-runtime.md) · ST-09–ST-12 · MR-03–MR-05, MR-15

- [ ] 2.1.1 [spec-author] Write unrelated-cwd asset/seed resolution ST-09 — `packages/server/tests/unit/lib/runtime-paths.spec.test.ts`
- [ ] 2.1.2 Extend server specifications for output, Docker, suite/harness inventory ST-10–ST-12 — `repo-tests/monorepo/server-package.spec.test.mjs`
- [ ] 2.1.3 Run runtime/server specifications and record the expected red result — targeted spec files

### Step 2.2: Make the server and retained tests self-contained

**Reference**: [Server Runtime §Runtime Asset Resolution](03-02-server-runtime.md#runtime-asset-resolution) · AR-08, AR-09, AR-15, AR-16, AR-34

- [ ] 2.2.1 Add package-root/runtime-asset resolver — `packages/server/src/lib/runtime-paths.ts`
- [ ] 2.2.2 Route database migration lookup through the resolver — `packages/server/src/lib/migrator.ts`
- [ ] 2.2.3 Route seed SQL lookup through the resolver — `packages/server/src/cli/commands/seed.ts`
- [ ] 2.2.4 Route locale initialization through the resolver — `packages/server/src/auth/i18n.ts`
- [ ] 2.2.5 Route page and email template lookup through the resolver — template engine/renderers
- [ ] 2.2.6 Update server scripts, files/bin metadata, and package README — `packages/server/package.json`, `packages/server/README.md`
- [ ] 2.2.7 Update root operational aliases and moved Playwright/Vitest paths — root/server configs
- [ ] 2.2.8 Rewrite production Docker build stages for the server workspace and retained `/app` layout — `docker/Dockerfile`
- [ ] 2.2.9 Update Docker/Compose runtime references only where moved paths require it — `docker/entrypoint.sh`, Compose files
- [ ] 2.2.10 Fold retained OIDC harness dependencies into the root install and remove its secondary active manifest/lockfile — root manifest, `test-harness/package.json`, `test-harness/yarn.lock`
- [ ] 2.2.11 Remove obsolete admin-GUI harness stages and update server/SDK build paths — `test-harness/Dockerfile`
- [ ] 2.2.12 Update harness seed/start paths and provisioning smoke imports — `test-harness/scripts/seed.ts`, harness scripts, `scripts/provision-smoke-test.ts`
- [ ] 2.2.13 Run ST-09–ST-12 to green — runtime/server specification files
- [ ] 2.2.14 Write runtime-path implementation edge tests after green — `packages/server/tests/unit/lib/runtime-paths.impl.test.ts`
- [ ] 2.2.15 Run lint/typecheck/build and the existing unit suite from new paths — active packages
- [ ] 2.2.16 Run integration, E2E, pentest, UI, SDK, CLI, OIDC harness, and provisioning-smoke suites — retained test systems
- [ ] 2.2.17 Record structural-parity evidence and compare inventory to the baseline, excluding only removed GUI tests — `99-execution-plan.md`

**Verify**: `yarn verify && yarn harness:test && yarn provision:smoke`

## Phase 3: Documentation Separation

### Step 3.1: Specify and implement the audience boundary

**Reference**: [Documentation Boundary](03-03-documentation.md) · ST-13–ST-16 · MR-07 · AR-34

- [ ] 3.1.1 [spec-author] Write documentation-boundary cases ST-13–ST-16 — `repo-tests/monorepo/docs-boundary.spec.test.mjs`
- [ ] 3.1.2 Run the documentation specification and record the expected red result — docs specification
- [ ] 3.1.3 Move technical Markdown out of the VitePress source tree — `docs/implementation-details/` → `techdocs/`
- [ ] 3.1.4 Remove technical-doc navigation/sidebar entries and fix public links — VitePress config, public Markdown
- [ ] 3.1.5 Update public server/SDK/CLI package and monorepo path references without redesigning `porta gui` docs — affected public docs
- [ ] 3.1.6 Convert moved technical-doc links/paths and remove claims that the deleted GUI workspace is current repository architecture — `techdocs/**/*.md`
- [ ] 3.1.7 Run ST-13–ST-16 to green and build VitePress — docs specification and `docs/`
- [ ] 3.1.8 Write technical-link traversal implementation tests and run docs verification — `repo-tests/monorepo/docs-boundary.impl.test.mjs`

**Verify**: `yarn test:structure && yarn docs:build`

## Phase 4: Toolchain and Dependency Upgrade

### Step 4.1: Upgrade only after parity

**Reference**: [Toolchain and CI §Dependency and TypeScript Upgrade](03-04-release-and-ci.md#dependency-and-typescript-upgrade) · ST-17 · MR-09–MR-10

- [ ] 4.1.1 Confirm Phase 2 structural-parity evidence before any manifest update — `99-execution-plan.md`
- [ ] 4.1.2 [spec-author] Write toolchain/dependency specification ST-17 — `repo-tests/monorepo/toolchain.spec.test.mjs`
- [ ] 4.1.3 Run the toolchain specification and record the expected red result — toolchain specification
- [ ] 4.1.4 Add approved workspace ncu scripts and update root tooling to latest selected releases — `package.json`
- [ ] 4.1.5 Update server dependencies and TypeScript 7 compatibility — server manifest/config/source only as required
- [ ] 4.1.6 Update SDK and CLI dependencies and TypeScript 7 compatibility — SDK/CLI manifests/config/source only as required
- [ ] 4.1.7 Regenerate `yarn.lock`, run ST-17 to green, and confirm ncu reports no eligible updates — root lockfile
- [ ] 4.1.8 Run full parity; stop on an incompatible latest dependency rather than silently pinning — all active packages/tests

**Verify**: `yarn deps:check && yarn verify && yarn harness:test`

## Phase 5: Branch CI and Final Parity

### Step 5.1: Make migration commits build and test cleanly

**Reference**: [Toolchain and CI §Build and Test Workflow](03-04-release-and-ci.md#build-and-test-workflow) · ST-18 · MR-11–MR-15 · AR-33

- [ ] 5.1.1 [spec-author] Write branch build/test and no-publication specification ST-18 — `repo-tests/monorepo/ci.spec.test.mjs`
- [ ] 5.1.2 Run the CI specification and record the expected red result — CI specification
- [ ] 5.1.3 Update `Build and Test` jobs to root Turbo/workspace commands and retained suites, with no publishing steps — `.github/workflows/build-and-test.yml`
- [ ] 5.1.4 Run ST-18 to green — CI specification
- [ ] 5.1.5 Write CI-contract implementation diagnostics after green — `repo-tests/monorepo/ci.impl.test.mjs`
- [ ] 5.1.6 Run frozen install, full verify, OIDC harness, provisioning smoke, and CI-contract tests — whole repository
- [ ] 5.1.7 Build VitePress and smoke the production Docker image, including health and embedded `porta` CLI — `docs/`, `docker/`
- [ ] 5.1.8 Confirm the diff contains no playground compatibility edits, product changes, publishing/release/version activity, npm deprecation, or `main` mutation; refresh CodeOps analysis and complete the plan — whole repository

**Verify**: `yarn verify && yarn harness:test && yarn provision:smoke && yarn docs:build` plus production Docker smoke

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
