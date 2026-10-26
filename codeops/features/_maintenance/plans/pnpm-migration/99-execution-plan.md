# Task T-04: Migrate the Porta monorepo from Yarn Classic to pnpm

> **Type**: Task (non-trivial, cross-cutting build migration) · **Feature**: _maintenance · **CodeOps Artifact Schema**: 1
> **Progress**: 4/44 tasks (9%)
> **Reasoning**: high — this changes installs, CI, the Docker runtime, release publishing, assurance provenance, and the structural test oracle. Product behavior must not change.
> **Effort**: 12–16 engineer-days, including release and assurance evidence.
> **Branch**: `build/pnpm-migration`, created from `develop` at `v1.14.0` (`6ac10d75`).
> **Integration target**: `develop`. `main` remains off limits.
> **Preflight**: ✅ Passed with notes — 12 findings resolved, 3 observations accepted. See `00-preflight-report.md`.

## Objective

Replace Yarn Classic 1.22.22 with pnpm 12.15.0 for local development, CI, Docker image builds, release tooling, and the assurance harness. Keep the structural test suite, rewrite its Yarn-specific assertions, and preserve every current product, security, release, and documentation invariant.

## Resolved decisions

| ID | Decision | Outcome | Authority |
| --- | --- | --- | --- |
| AR-1 | `node_modules` strategy | `nodeLinker: hoisted` first; isolated storage is a separate future change | User |
| AR-2 | Migration scope | Full migration in one branch: manifests, scripts, CI, Docker, release, assurance, tests, docs | User |
| AR-3 | Structural tests | Rewrite Yarn assertions; keep the suite and its release/security/Docker/docs invariants | User |
| AR-4 | `minimumReleaseAge` | `0` for parity with Yarn; enable a release-age policy later as a separate hardening decision | User |
| AR-5 | Release publisher | `pnpm publish` with the git-check override scoped to the release command (`pnpm_config_git_checks=false`), plus explicit release preflight invariants; pack expected artifacts with pnpm | User |
| AR-6 | Packed-consumer compatibility | Switch from Yarn to npm; npm produces ordinary installed directories and is already used by the admin playground journey | User |
| AR-7 | pnpm version | Pin `pnpm@12.15.0` via `packageManager`; the exact patch may be raised only with a lockfile refresh | Technical baseline |
| AR-8 | `autoInstallPeers` | Set `false`; the POC showed peer auto-installation creates a TypeScript 7 peer variant that breaks `typescript-eslint` | POC evidence |
| AR-9 | `workspaces` field | Keep it in `package.json`, identical to `pnpm-workspace.yaml` | Technical baseline |
| AR-10 | `jwt-decode` hoisting | Resolved: `jwt-decode@4.0.0` is present at the hoisted root; no direct dependency change is required | POC evidence |
| AR-11 | Node support | Keep the `>=22.22.2` floor; CI uses Node 22, and verification also covers Node 24 | Project fact |
| AR-12 | Plan location | `codeops/features/_maintenance/plans/pnpm-migration/`, registered as task T-04 on the maintenance roadmap | User |
| AR-13 | No product behavior change | No API, OIDC, tenancy, crypto, session, or CLI behavior changes. This is a build-system migration only | Scope |
| AR-14 | Independent review | Release and assurance changes receive the repository’s required independent review before merge | `codeops/codeops.json` |
| AR-15 | CI Docker caching | Add Buildx + GitHub Actions cache for the production image and cache/reuse the harness image; this is a user-requested performance addition | User |
| AR-16 | Package-local Docker dependencies | Resolved: the production-only pnpm tree hoists all 25 server runtime dependencies to the root and satisfies every range. Remove the package-local Docker COPY and add a production dependency-range check plus runtime import smoke | POC evidence |
| AR-17 | Registry pinning | Use `pnpm_config_registry` (or `--registry`) and assert the effective registry in release preflight; do not rely on `npm_config_registry` | User accepted PF-004 |
| AR-18 | Dependency graph | Verify GitHub’s dependency graph and Dependabot alerts, not only Dependabot PR creation, before accepting the two-document pnpm 12 lockfile | User accepted PF-006 |
| AR-19 | Root TypeScript compatibility | Add `typescript: npm:@typescript/typescript6@^6.0.2` to root devDependencies; without it, pnpm creates a nested TypeScript 7 peer variant and `typescript-eslint` fails | POC evidence |
| AR-20 | Agent skills | Set `skills.dirs: []` in `pnpm-workspace.yaml`; pnpm 12 otherwise offers to link package-shipped agent skills such as `dotenv` | POC evidence |

## Scope

### In scope

- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc`, `.gitignore`
- Root and package scripts that invoke Yarn
- `.github/workflows/build-and-test.yml`, `docs.yml`, `release.yml`
- `docker/Dockerfile`, `test-harness/Dockerfile`, `.dockerignore`
- Release tooling: `scripts/release-preflight.js`, `release:prepare`, `release:publish`, lockstep integration
- Assurance harness: lockfile digests, command metadata, worktree builds, coverage inventory, compat consumer
- `repo-tests/monorepo/*.test.mjs` Yarn assertions and the new package-manager contract
- Repository-development docs, techdocs, `AGENTS.md`, roadmap entry

### Out of scope

- Product source behavior, APIs, OIDC flows, database migrations, tenancy, security logic
- Moving to pnpm’s isolated linker or `pnpm deploy`
- Performing a real release, tag, or publish
- Rewriting historical assurance evidence or historical CodeOps plans
- Removing Yarn `yarn add` examples that document SDK usage for consumers
- Adding a new package, service, abstraction, or release framework

## Smallest viable design

- pnpm 12.15.0; `nodeLinker: hoisted`; `linkWorkspacePackages: true`; `minimumReleaseAge: 0`; `strictDepBuilds: true`; `autoInstallPeers: false`; `skills.dirs: []`.
- `allowBuilds`: `argon2`, `esbuild`, `fs-ext-extra-prebuilt`, `fsevents`.
- Overrides: `co-body>qs: 6.16.0`, `minimatch>brace-expansion: 5.0.12`, `fast-copy: 4.2.0`.
- Root devDependency `typescript: npm:@typescript/typescript6@^6.0.2` to prevent a TS7 peer variant from breaking `typescript-eslint` (AR-19).
- Keep the `workspaces` field and the flat runtime layout:
  `/app/dist`, `/app/node_modules`, `/app/package.json`, `/app/migrations`, `/app/templates`, `/app/locales`.
- Remove the `packages/server/node_modules` COPY. The POC production-only tree hoists and satisfies all 25 server runtime dependencies; add a dependency-range check and a `chalk`/`yaml` import smoke to prevent regression (AR-16).
- Release: `pnpm publish` with a release-scoped `pnpm_config_git_checks=false` override, explicit preflight invariants, `pnpm_config_registry`, `pnpm install --lockfile-only` after the version bump, and `pnpm pack` for expected artifact integrity. Pack expected artifacts outside the repository.
- CI Docker performance: Buildx + GitHub Actions cache for the production image; cache or prebuild the harness image instead of rebuilding it on every run (AR-15).
- Move `engineStrict` and exact-save policy (`savePrefix: ''`) to `pnpm-workspace.yaml`; keep `.npmrc` for auth/registry settings.
- Compatibility suite: npm for consumer installation and packing; ordinary directories, `package-lock.json`.
- One new structural file, `repo-tests/monorepo/package-manager.spec.test.mjs`, owns the pnpm contract; the other 13 Yarn-coupled files keep their non-Yarn invariants. The remaining rewrites are an oracle migration, not a spec-first feature change, and must be called out as such.

## Baseline evidence (latest `develop`)

| Area | Evidence |
| --- | --- |
| Root package manager | `package.json:7-13`, `package.json:110`; Yarn 1.22.22 and `workspaces: ["packages/*"]` |
| Yarn overrides | `package.json:111-115` |
| Script coupling | `package.json:22-32`, `package.json:66`, `package.json:69`; 4 manifests, 18 Yarn references |
| Docker runtime | `docker/Dockerfile:12-16`, `docker/Dockerfile:27-31`, `docker/Dockerfile:47-48`; `test-harness/Dockerfile:9-13`, `:24-28`, `:45-47` |
| Package-local conflicts | `packages/server/node_modules/chalk` 6.0.0 vs root 5.6.2; `packages/server/node_modules/yaml` 2.9.0 vs root 2.9.1; `packages/cli/node_modules/chalk` |
| Release | `.github/workflows/release.yml:43-50`, `:110-115`, `:160-166`, `:242-262`; `node_modules/@blendsdk/lockstep/dist/lockstep.js:420-423`, `:468-515`; `provenance.js:112-130` |
| Coverage inventory | `test-harness/assurance/coverage/capture.ts:51-62`, `:570`; walks `/app/node_modules` and skips symlinks |
| Assurance worktrees | `test-harness/assurance/mutation/runner.ts:110-117`; `control-sensitivity/local-runtime.ts:238-252`; `compat/consumer.ts:119-123` |
| Hoisting assumption | `test-harness/fixtures/lifecycle-runtime.ts:596-604` copies `jwt-decode` from root `node_modules` |
| Structural suite | 26 files, 13 contain Yarn references; `repo-tests/monorepo/toolchain.spec.test.mjs:147-215`, `workspace-layout.spec.test.mjs:124-127`, `ci.spec.test.mjs:88-116`, `root-scripts.spec.test.mjs:177-309`, `server-package.spec.test.mjs:250-255` |
| CI jobs | `.github/workflows/build-and-test.yml` has six jobs: `verify`, `ui`, `harness`, `docs`, `docker`, `audit`; the audit job still uses Yarn |
| Repo policy | `codeops/codeops.json` requires independent review; `AGENTS.md` requires structure tests before commits |

## POC evidence (2026-10-26)

| Check | Result |
| --- | --- |
| Baseline | Node 22.23.1, Yarn 1.22.22, structure 138/138, build/lint/typecheck pass, audit 0 vulnerabilities (281 packages), release preflight passes |
| pnpm import | `pnpm@12.15.0`; lockfile generated; three overrides resolve (`qs` 6.16.0, `brace-expansion` 5.0.12, `fast-copy` 4.2.0); local SDK/CLI/server links resolve |
| Install | 829 resolved / 840 added; install succeeds with `argon2`, `esbuild`, `fs-ext-extra-prebuilt` build scripts approved; `fsevents` pending macOS check |
| Agent skills | `skills.dirs: []` suppresses the `dotenv` skill approval prompt |
| Peer resolution | `autoInstallPeers: false` plus root `typescript` TS6 alias; without the root alias, ESLint fails with `typescript-eslint does not support TS 7.0` |
| Build | `pnpm build` passes; narrow server unit test passes |
| Production tree | `pnpm install --prod` hoists all 25 server runtime dependencies to root; every range is satisfied; no package-local server production directory is required |
| Docker | Production POC image 219 MB vs Yarn baseline 225 MB; harness POC image 219 MB; both build; `chalk`/`yaml` runtime imports pass |
| Hoisting fixture | `jwt-decode@4.0.0` is present at the hoisted root; AR-10 does not require a dependency change |
| Timing | Yarn baseline Docker build install ≈96 s; pnpm POC builder install ≈7.5 s and production install ≈3.1 s (network/cache conditions differ; directional only) |

## Phase 0 — Baseline and POC

- [x] **0.1** Record the baseline on `develop`: Node 22.23.1, Yarn 1.22.22, `yarn test:structure` 138/138, `yarn build`, `yarn lint`, `yarn typecheck`, `yarn audit --groups dependencies --level high` (0 vulnerabilities), production image size (225 MB), and `yarn release:preflight`.
- [x] **0.2** In a scratch copy outside the repository, draft `pnpm-workspace.yaml` (AR-1, AR-4, AR-8, AR-9, AR-19, AR-20, plus `engineStrict` and `savePrefix: ''`) and `packageManager: pnpm@12.15.0`; run `pnpm import` then `pnpm install`. Resolved overrides, workspace links, build scripts, `jwt-decode` presence, and native build results are recorded above.
- [x] **0.3** In the scratch copy, inspect the production tree for package-local server dependencies (`packages/server/node_modules`), build `@portaidentity/server`, run a narrow unit selector, build both Dockerfiles, and run a server import smoke that loads `chalk` and `yaml` from the final runtime tree. Results are recorded above.
- [x] **0.4** Resolve AR-8, AR-10, and AR-16 from the POC evidence; confirm `engineStrict`/`savePrefix: ''` are effective (`pnpm config get engine-strict` = true, `save-prefix` = empty, `auto-install-peers` = false). The POC scratch copy and task-created Docker images were removed after recording this evidence.

**Verify:** the POC reproduces the current dependency versions and the server build; no production source files are changed in the repository.

## Phase 1 — Package-manager foundation

### Session 1A — specification tests first

- [ ] **1.1** Add `repo-tests/monorepo/package-manager.spec.test.mjs` covering: pnpm `packageManager`, `pnpm-workspace.yaml` selecting `packages/*`, root `pnpm-lock.yaml` with no nested lockfiles, `nodeLinker: hoisted`, `linkWorkspacePackages: true`, `minimumReleaseAge: 0`, `allowBuilds` for the four native packages, and the three overrides. Run it against the current Yarn state and confirm the expected red result.
- [ ] **1.2** Update `repo-tests/monorepo/toolchain.spec.test.mjs` to read the last document of `pnpm-lock.yaml` with the existing `yaml` dependency; keep the TypeScript 7/6 alias-consistency assertion and the `deps:check` intent. Do not treat the missing-lockfile failure as a behavioral red; the lockfile is generated in 1.4 and this spec is made green in 1.7.

### Session 1B — implementation

- [ ] **1.3** Update `package.json`: `packageManager` to `pnpm@12.15.0` (optionally with the Corepack-compatible integrity hash), `engines` to Node + pnpm, remove `engines.yarn` and `resolutions`, keep `workspaces` (AR-9), and add the root `typescript: npm:@typescript/typescript6@^6.0.2` devDependency (AR-19). Add `pnpm-workspace.yaml` with `packages`, `nodeLinker`, `linkWorkspacePackages`, `minimumReleaseAge`, `strictDepBuilds`, `engineStrict`, `savePrefix: ''`, `autoInstallPeers: false`, `skills.dirs: []`, `allowBuilds`, and `overrides` (AR-1, AR-4, AR-8, AR-20). Keep `.npmrc` for auth/registry settings only.
- [ ] **1.4** Remove the existing Yarn install tree (root and `packages/*/node_modules`, plus `.yarn-integrity`) before the first pnpm install. Generate and review `pnpm-lock.yaml` with `pnpm import` + `pnpm install`; remove `yarn.lock`; confirm the three overrides, local workspace links, and no unexpected version drift. Add `jwt-decode` to root devDependencies only if AR-10 requires it.
- [ ] **1.5** Convert root scripts (`test:all`, `test:unit`, `test:integration`, `test:e2e`, `test:pentest`, `test:ui`, `test:ui:debug`, `test:watch`, `test:coverage`, `verify`, `deps:update`, `release:publish`) and package scripts (`verify`, `test:all`) to `pnpm --filter` / `pnpm run`. Keep the separate-process ordering of the four server suites.

### Session 1C — implementation tests and hardening

- [ ] **1.6** From the cleaned tree, run `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, and a narrow server unit selector. Fix layout or script issues; do not weaken tests.
- [ ] **1.7** Run the package-manager and toolchain structural tests green, then run the rest of `pnpm test:structure` and record the remaining expected red files for phase 5.

**Verify:** clean `pnpm install --frozen-lockfile`; `pnpm build`, `pnpm lint`, and `pnpm typecheck` pass; package-manager and toolchain specs are green.

## Phase 2 — CI and Docker

### Session 2A — specification tests first

- [ ] **2.1** Update `repo-tests/monorepo/ci.spec.test.mjs` and `ci.impl.test.mjs` to assert pnpm setup, pnpm cache, `pnpm install --frozen-lockfile`, `pnpm verify`, `pnpm test:ui`, `pnpm harness:test`, `pnpm docs:build`, and a high-severity production audit. Keep every existing security and service-coverage assertion.
- [ ] **2.2** Update the Dockerfile assertions in `repo-tests/monorepo/server-package.spec.test.mjs`: root `node_modules` plus pnpm, no package-local server COPY, a production dependency-range check, and lockfile/workspace config copied before install (AR-16). Confirm expected red.

### Session 2B — implementation

- [ ] **2.3** Update all six jobs in `.github/workflows/build-and-test.yml` (`verify`, `ui`, `harness`, `docs`, `docker`, `audit`) and `.github/workflows/docs.yml`: install pnpm before `setup-node` with pnpm cache, use `pnpm install --frozen-lockfile`, replace Yarn commands, use `pnpm exec playwright install --with-deps chromium` for the UI/harness jobs, and replace `yarn audit --groups dependencies --level high` with `pnpm audit --prod --audit-level high` in the audit job.
- [ ] **2.4** Update `docker/Dockerfile` and `test-harness/Dockerfile`: pin pnpm (for example `npm install -g pnpm@12.15.0` or the official pnpm Alpine image), copy `pnpm-lock.yaml` + `pnpm-workspace.yaml` before install, run `pnpm install --frozen-lockfile`, build with `pnpm --filter @portaidentity/server build`, install production dependencies with `pnpm install --prod --frozen-lockfile`, add the production dependency-range check, and remove the package-local `node_modules` COPY (AR-16). Keep `.npmrc` excluded from the Docker context because a developer copy may contain auth tokens; move required non-auth settings to `pnpm-workspace.yaml`. Add `.pnpm-store` and unnecessary context directories (`codeops/`, `techdocs/`, `repo-tests/`, package tests, `.turbo/`, coverage/report output, assurance runtime dirs) to `.dockerignore` while preserving `test-harness/Dockerfile` and `docker/entrypoint.sh` (AR-1, AR-15).
- [ ] **2.5** Keep the runtime contract unchanged: `/app/dist`, `/app/node_modules`, `/app/package.json`, migrations, templates, locales, entrypoint, healthcheck, and `/app/.v8-coverage` in the harness image.

### Session 2C — implementation tests

- [ ] **2.6** Build both images, run `docker compose config` for all five compose files (`docker/docker-compose.yml`, `docker/docker-compose.prod.yml`, `docker/admin-playground/compose.yml`, `test-harness/docker-compose.yml`, `test-harness/docker-compose.production-security.yml`), start the server image long enough to check `/health` and the entrypoint, and run the server import smoke for `chalk` and `yaml` (AR-16).
- [ ] **2.7** Build `linux/amd64` and `linux/arm64` images or run the registered multi-arch equivalent with an explicit output (`--push` or `--output type=oci`); record image sizes and native-module results.
- [ ] **2.8** Add Buildx + GitHub Actions cache to the branch CI production-image job: `docker/setup-buildx-action`, `docker/build-push-action`, `cache-from: type=gha,scope=porta-ci`, `cache-to: type=gha,mode=max,scope=porta-ci` (AR-15). Verify the second run restores the dependency/build layers.
- [ ] **2.9** Cache or prebuild the harness image: either add compose `cache_from`/`cache_to` with a dedicated GHA scope, or prebuild with Buildx/GHA cache and change the lifecycle to reuse the prebuilt image instead of `docker compose up -d --build` (AR-15). Verify the harness job no longer performs a cold rebuild on every run.

**Verify:** branch CI workflow syntax is valid; both images build; all five compose files render unchanged; multi-arch build passes; the second CI Docker run reports a cache hit for both images.

## Phase 3 — Release tooling

### Session 3A — specification tests first

- [ ] **3.1** Update `repo-tests/monorepo/release.spec.test.mjs` to assert pnpm publish, pnpm pack, lockfile refresh after versioning, the release-scoped git-check override, the pnpm registry pin, explicit release preflight invariants, and the unchanged tested-revision/provenance/develop-sync guarantees. Update `release-hardening.spec.test.mjs` only where its existing commands change; do not weaken its non-Yarn invariants. Confirm expected red.

### Session 3B — implementation

- [ ] **3.2** Keep `gitChecks: true` in `pnpm-workspace.yaml`; set `pnpm_config_git_checks=false` (verify the exact pnpm 12 variable) or pass `--config.git-checks=false` only on the release publish command (AR-5). Add explicit invariants to `scripts/release-preflight.js`: `main` branch, clean tree, expected tag, release commit descends from the tested `origin/main` revision with no unrelated divergence, effective registry equals `https://registry.npmjs.org`, and no real publish without the tested revision.
- [ ] **3.3** Add `pnpm install --lockfile-only` after `lockstep version` + `scripts/sync-versions.js` in `release:prepare` and in the workflow bump step; ensure the lockfile is part of the bump commit. Add a lockfile-freshness check to preflight.
- [ ] **3.4** Switch expected artifact packing from `npm pack --workspace` to `pnpm pack` (per package) into `$RUNNER_TEMP/release-artifacts`, and adjust the expected filenames and integrity comparison in `.github/workflows/release.yml`. Keep `npm view` for registry reads and keep the existing SLSA provenance verification.
- [ ] **3.5** Update the release workflow setup/install/build/publish commands to pnpm while preserving `node_modules/.bin/lockstep` and `node_modules/.bin/npm` tool access. Replace `npm_config_registry` with `pnpm_config_registry=https://registry.npmjs.org` (or `--registry`) in the publish path (AR-17).

### Session 3C — rehearsal and hardening

- [ ] **3.6** In a scratch clone, rehearse the bump without publishing: `lockstep version --no-git-commit`, `sync-versions`, `pnpm install --lockfile-only`, commit/tag the rehearsal candidate in the scratch clone, run `pnpm release:preflight` in its explicit rehearsal mode (scratch branch allowed, clean tree required), pack into a temporary directory outside the repo, and run `lockstep publish --dry`. Do not tag or publish in the real repository.
- [ ] **3.7** If pnpm publish git checks or tarball integrity still fail after the pnpm-pack change, stop and ask the user whether to adopt the npm-publish wrapper fallback. Do not silently weaken integrity checks.

**Verify:** release preflight passes on the rehearsed candidate; the expected tarball integrity matches the pnpm-produced artifact; the effective registry is correct; no real publish occurs.

## Phase 4 — Assurance harness

### Session 4A — specification tests first

- [ ] **4.1** Update assurance lockfile paths and provenance: `source-provenance.ts`, `foundation-artifacts.ts`, `validate-assurance.ts`, `coverage/capture.ts`, `stability/campaign.ts`, `control-sensitivity/local-runtime.ts`, `mutation/runner.ts`, `ratchet-baselines.json`, and `red-signatures.json`. Include `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and `.npmrc` in the owned install-graph inputs.
- [ ] **4.2** Update assurance command metadata, usage text, recovery commands, and test fixtures from `yarn` to `pnpm`; keep historical evidence unchanged. Run the assurance schema/governance tests and confirm the expected red/green boundary.

### Session 4B — implementation

- [ ] **4.3** Update the three worktree-based flows (`mutation/runner.ts`, `control-sensitivity/local-runtime.ts`, `compat/consumer.ts`) to build with `pnpm --filter`. Prove whether pnpm treats the symlinked root `node_modules` as current; if it tries to install, disable dependency verification for those child runs or install into the worktree from the store.
- [ ] **4.4** Switch the packed-consumer compatibility flow to npm (AR-6): npm install flags, `package-lock.json` assertions, cache directory, and deterministic archive/content checks. Pack the compat archives with npm, the same toolchain the consumer uses; the release workflow uses pnpm pack independently.
- [ ] **4.5** Verify the coverage dependency inventory against the hoisted runtime image. If the flat-tree assumption fails, stop and revise the plan before changing the classifier.
- [ ] **4.6** Run `pnpm assurance:validate`, the targeted governance/coherence tests, `pnpm assurance:compat`, and `pnpm assurance:coverage` on the migration revision.

### Session 4C — evidence

- [ ] **4.7** Run `pnpm assurance:harness --project security --profile production-security` and record the new evidence. Do not rewrite or re-sign historical manifests from Yarn revisions.

**Verify:** assurance validation passes; packed-consumer compat uses npm; coverage inventory is non-empty; the registered production-security harness completes with the expected profile and cleanup.

## Phase 5 — Structural specifications and documentation

- [ ] **5.1** Rewrite `workspace-layout.spec.test.mjs` and `workspace-layout.impl.test.mjs` for pnpm: packageManager, pnpm workspace, lockfile path, and workspace linking. Keep package topology, exact internal versions, acyclicity, Turbo wiring, root execution, and no-nested-lockfile invariants. Treat this as oracle migration: run each rewritten file against the old Yarn state where practical, then green against the pnpm tree, and record the assertion diff.
- [ ] **5.2** Rewrite `root-scripts.spec.test.mjs` and `root-scripts.impl.test.mjs` as semantic pnpm assertions. Keep the supported script surface, no duplicate aliases, documentation-command resolution, Docker/CLI boundary, and dependency-maintenance ordering.
- [ ] **5.3** Rewrite only the remaining Yarn assertions in `assurance-root-contract.spec.test.mjs`, `assurance-boundary.spec.test.mjs`, `docs-boundary.spec.test.mjs`, `admin-ui-docs.spec.test.mjs`, `server-package.spec.test.mjs`, and `release.spec.test.mjs`; the phase 2/3 files should already be handled. Delete only tautological package-manager text; keep every release, security, Docker, and documentation invariant (AR-3).
- [ ] **5.4** Update repository-development documentation: `README.md`, `packages/server/README.md`, `packages/sdk/README.md`, `docs/guide/setup-alternatives.md`, `docs/database/migrations.md`, `docs/cli/overview.md`, `docs/cli/organizations.md`, `docs/guide/environment.md`, and the command hints in `scripts/setup-certs.sh`. Keep consumer `yarn add @portaidentity/sdk` examples and optionally add pnpm equivalents.
- [ ] **5.5** Update techdocs command names, the `.npmrc`/`engineStrict`/`savePrefix` explanation, and evidence counts (`getting-started`, `development`, `deployment`, `admin-playground`, `releasing`, `architecture/infrastructure`, `reference/current-test-inventory`, `reference/configuration`), refresh `AGENTS.md` with the `analyze-project` workflow, update the T-04 roadmap row, and run `pnpm test:structure` green.

**Verify:** `pnpm test:structure` passes; a repository-wide scan finds no current-guidance Yarn command for repository work; release/security/docs invariants remain covered.

## Phase 6 — Full verification and review

- [ ] **6.1** From a clean clone, run `pnpm install --frozen-lockfile` on Node 22.22.2 and Node 24. Record any engine or lockfile-version failure.
- [ ] **6.2** With PostgreSQL, Redis, and MailHog running through the owned lifecycle commands, run `pnpm verify` (structure + Turbo verify, including server unit/integration/E2E/pentest, SDK, and CLI).
- [ ] **6.3** Run `pnpm test:ui`, `pnpm harness:test`, `pnpm docs:build`, and `pnpm audit --prod --audit-level high`; compare the audit result with the phase 0 Yarn baseline and record any new advisory or resolution difference.
- [ ] **6.4** Build and smoke-test the production and harness images for amd64 and arm64; render all five compose files; remove task-created containers, networks, volumes, and images; confirm cleanup with `docker ps -a`, `docker network ls`, and `docker volume ls`. Open a Dependabot test PR and verify both the PR and the GitHub dependency graph/Dependabot alerts (AR-18). Verify the second CI Docker run restores the Buildx/GHA cache for the production and harness images. If Dependabot or the dependency graph cannot read the pnpm 12 two-document lockfile, stop and ask the user before applying `pmOnFail: ignore` or pinning pnpm 11.
- [ ] **6.5** Run the independent quality/release/security review required by `codeops/codeops.json`, update the roadmap and evidence, and commit through the `git-commit` skill. No real release or tag is created in this task.

**Verify:** every command in the matrix below passes on the final revision; review findings are resolved or explicitly accepted; the branch is release-safe but unpublished.

## Verification matrix

| Gate | Command |
| --- | --- |
| Frozen install | `pnpm install --frozen-lockfile` |
| Structure contracts | `pnpm test:structure` |
| Full verification | `pnpm verify` |
| Browser UI | `pnpm test:ui` |
| OIDC harness | `pnpm harness:test` |
| Public docs | `pnpm docs:build` |
| Dependency audit | `pnpm audit --prod --audit-level high` |
| Production image | `docker build --file docker/Dockerfile --tag porta-ci .` |
| Harness image | `docker build --file test-harness/Dockerfile --tag porta-harness-ci .` |
| Multi-arch | `docker buildx build --platform linux/amd64,linux/arm64 --output type=oci --file docker/Dockerfile .` (or `--push` in a registry-backed check) |
| Compose render | `docker compose -f <file> config` for all five compose files |
| CI Docker cache | Second branch-CI run restores the GHA cache for both images |
| Dependency graph | Dependabot PR plus GitHub dependency graph/alerts show the pnpm graph |
| Assurance validation | `pnpm assurance:validate` |
| Assurance compat | `pnpm assurance:compat` |
| Assurance coverage | `pnpm assurance:coverage --project protocol --profile operational --seed coverage-baseline` |
| Production security | `pnpm assurance:harness --project security --profile production-security` |
| Release rehearsal | Scratch-clone bump + `pnpm install --lockfile-only` + `pnpm release:preflight` + `lockstep publish --dry` |

## Stop conditions

| Condition | Action |
| --- | --- |
| POC shows dependency version drift or a missing workspace link | Stop; resolve before phase 1 |
| A future pnpm production tree cannot satisfy a server runtime dependency from the root | Stop; restore a layout-aware merge or revise the runtime layout (AR-16) |
| The effective pnpm publish registry is not `https://registry.npmjs.org` | Stop; fix the registry pin before any publish (AR-17) |
| `jwt-decode` is not reachable from the hoisted tree | Add the direct dependency or resolve it explicitly (AR-10) |
| Worktree assurance runs attempt to install or fail on symlinked `node_modules` | Prove, then disable dependency verification for those child runs or install in the worktree |
| pnpm publish tarball integrity differs from the pnpm-packed artifact | Stop; do not weaken verification. Ask whether to adopt the npm-publish wrapper |
| Dependabot or the GitHub dependency graph cannot process the pnpm 12 two-document lockfile | Stop; ask before `pmOnFail: ignore` or pnpm 11 (AR-18) |
| A release/security/docs structural invariant cannot be preserved | Stop; do not delete the invariant to make the migration green |
| Docker arm64 native build fails | Stop; fix the build toolchain or image source before merge |
| Any step requires a real publish, tag, or deployment | Out of scope; do not perform it |

## Rollback

The migration is isolated to `build/pnpm-migration`. Reverting the branch or its eventual merge commit restores the Yarn-based build. No production deployment or real publish occurs in this task. Historical `yarn.lock`, release evidence, and CodeOps history remain intact in Git history.

## Specialist check

**Release/security reviewer required** — the change touches publish integrity, provenance, credentials, Docker runtime contents, and assurance evidence. Use the repository’s existing independent review policy; no new standing specialist agent role is needed.

## Next steps

1. The accepted preflight resolutions are incorporated; run the iteration 2 re-scan and close the report.
2. Execute phase 0 in a scratch copy first; do not modify product source until the POC proves the dependency graph, package-local runtime dependencies, and Docker layout.
3. Use the `exec-plan` workflow against this file on the `build/pnpm-migration` branch.
4. Commit through the `git-commit` skill after each verified task; keep the T-04 roadmap row current.
