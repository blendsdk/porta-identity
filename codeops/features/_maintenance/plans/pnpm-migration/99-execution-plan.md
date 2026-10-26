# Task T-04: Migrate the Porta monorepo from Yarn Classic to pnpm

> **Type**: Task (non-trivial, cross-cutting build migration) · **Feature**: _maintenance · **CodeOps Artifact Schema**: 1
> **Progress**: 36/44 tasks (82%)
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

- [x] **1.1** Add `repo-tests/monorepo/package-manager.spec.test.mjs` covering: pnpm `packageManager`, `pnpm-workspace.yaml` selecting `packages/*`, root `pnpm-lock.yaml` with no nested lockfiles, `nodeLinker: hoisted`, `linkWorkspacePackages: true`, `minimumReleaseAge: 0`, `allowBuilds` for the four native packages, and the three overrides. The red run failed all four cases; the green run passes all four.
- [x] **1.2** Update `repo-tests/monorepo/toolchain.spec.test.mjs` to read the last document of `pnpm-lock.yaml` with the existing `yaml` dependency; keep the TypeScript 7/6 alias-consistency assertion and the `deps:check` intent. The missing-lockfile red was not treated as behavioral; the spec is green after the lockfile existed.

### Session 1B — implementation

- [x] **1.3** Update `package.json`: `packageManager` to `pnpm@12.15.0`, `engines` to Node + pnpm, remove `engines.yarn` and `resolutions`, keep `workspaces` (AR-9), and add the root `typescript: npm:@typescript/typescript6@^6.0.2` devDependency (AR-19). Added `pnpm-workspace.yaml` with `packages`, `nodeLinker`, `linkWorkspacePackages`, `minimumReleaseAge`, `strictDepBuilds`, `engineStrict`, `savePrefix: ''`, `autoInstallPeers: false`, `skills.dirs: []`, `allowBuilds`, and `overrides` (AR-1, AR-4, AR-8, AR-20).
- [x] **1.4** Removed the existing Yarn install tree (root and `packages/*/node_modules`, plus `.yarn-integrity`), generated `pnpm-lock.yaml` with `pnpm import` + `pnpm install`, and removed `yarn.lock`. The three overrides, local workspace links, and expected versions are present; `jwt-decode@4.0.0` is already hoisted (AR-10).
- [x] **1.5** Converted the root scripts (`test:all`, `test:unit`, `test:integration`, `test:e2e`, `test:pentest`, `test:ui`, `test:ui:debug`, `test:watch`, `test:coverage`, `verify`, `deps:update`, `release:publish`) and package scripts (`verify`, `test:all`) to `pnpm --filter` / `pnpm run`; the four server suites still run in separate processes.

### Session 1C — implementation tests and hardening

- [x] **1.6** From the cleaned tree, `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, and the narrow `cursor-total` unit test pass.
- [x] **1.7** The package-manager and toolchain specs are green. The remaining 10 structural failures are the planned Yarn assertions in `assurance-root-contract`, `ci`, `root-scripts`, `server-package`, and `workspace-layout`; they are scheduled for phases 2 and 5.

**Verify:** clean `pnpm install --frozen-lockfile`; `pnpm build`, `pnpm lint`, and `pnpm typecheck` pass; package-manager and toolchain specs are green.

## Phase 2 — CI and Docker

### Session 2A — specification tests first

- [x] **2.1** Updated `ci.spec.test.mjs` and `ci.impl.test.mjs` for pnpm setup/cache, six jobs, exact commands, the Docker build action, and the high-severity production audit; all CI contract tests pass.
- [x] **2.2** Updated the Dockerfile assertions in `server-package.spec.test.mjs`: pnpm install/build, no package-local server COPY, dependency-range check, runtime import smoke, and lockfile/workspace copy. The Docker tests pass.

### Session 2B — implementation

- [x] **2.3** Updated all six jobs in `.github/workflows/build-and-test.yml` (`verify`, `ui`, `harness`, `docs`, `docker`, `audit`) and `.github/workflows/docs.yml`: pnpm setup before `setup-node`, pnpm cache, frozen installs, Playwright through pnpm, production audit, and the Docker action.
- [x] **2.4** Updated `docker/Dockerfile` and `test-harness/Dockerfile`: pnpm 12.15.0, lockfile/workspace copies, frozen installs, filtered server build, production install, dependency-range check, runtime import smoke, and no package-local `node_modules` COPY. `.dockerignore` now keeps `.npmrc` excluded, drops pnpm metadata, and trims planning, docs, tests, reports, and harness runtime state.
- [x] **2.5** Preserved the runtime contract: `/app/dist`, `/app/node_modules`, `/app/package.json`, migrations, templates, locales, entrypoint, healthcheck, and `/app/.v8-coverage` in the harness image.

### Session 2C — implementation tests

- [x] **2.6** Built both images; rendered all five compose files (the harness files with required validation variables); started the production image against temporary PostgreSQL and Redis and received `{"status":"healthy","checks":{"server":"ok","database":"ok","redis":"ok"}}`; runtime `chalk`/`yaml` imports pass.
- [ ] **2.7** The amd64 production image builds through the same Dockerfile path; arm64/QEMU validation is deferred to CI because the local Docker builder has no arm64 QEMU support. The release workflow already installs QEMU.
- [x] **2.8** Added Buildx + GHA cache to the branch CI production-image job with `scope=porta-ci`; the cache-hit verification requires the branch CI run.
- [x] **2.9** Added `test-harness/docker-compose.ci.yml` with `scope=porta-harness-ci`; the harness job now sets up Buildx and sets `HARNESS_BUILD_CACHE_FILE`; the compose overlay renders correctly. The cache-hit verification requires the branch CI run.

**Verify:** branch CI workflow contracts pass; both images build locally; all five compose files render; the live health smoke passes. Arm64 and GHA cache-hit verification remain CI-only checks.

## Phase 3 — Release tooling

### Session 3A — specification tests first

- [x] **3.1** Updated `release.spec.test.mjs` and `release-hardening.spec.test.mjs` for pnpm publish/pack, lockfile refresh, release-scoped git checks, the registry pin, and preflight invariants; all release contract tests pass.

### Session 3B — implementation

- [x] **3.2** Kept global git checks enabled; scoped `pnpm_config_git_checks=false` to the publish command and workflow step. `release-preflight.js` now checks the clean tree, `main`, the release tag at HEAD, descent from `origin/main`, the effective pnpm registry, and a frozen lockfile-only refresh.
- [x] **3.3** Added `pnpm install --lockfile-only` after `lockstep version` + `sync-versions` in `release:prepare` and the workflow bump step; preflight verifies the frozen lockfile. The rehearsal diff changed only the CLI SDK specifier.
- [x] **3.4** Pack expected artifacts with `pnpm --filter ... pack` into `${RUNNER_TEMP}/release-artifacts`; updated integrity paths. The SDK pack tarball matched `pnpm publish --dry-run` exactly on SHA-512 and SHA-1.
- [x] **3.5** Updated the release workflow to pnpm setup/install/build/publish; preserved `node_modules/.bin/lockstep` and `node_modules/.bin/npm`; replaced `npm_config_registry` with `pnpm_config_registry`.

### Session 3C — rehearsal and hardening

- [x] **3.6** Scratch-clone rehearsal passed: bump to 1.14.1, derived version sync, lockfile-only refresh, commit/tag, rehearsal preflight, built artifacts (all contain `dist`), pnpm pack, and `lockstep publish --dry` through pnpm with the npmjs registry. No real tag or publish occurred in this repository.
- [x] **3.7** No fallback needed: pnpm publish dry-run passed its git checks with the scoped override and produced the same tarball integrity as pnpm pack.

**Verify:** release preflight passes on the rehearsed candidate; the expected tarball integrity matches the pnpm-produced artifact; the effective registry is correct; no real publish occurs.

## Phase 4 — Assurance harness

### Session 4A — specification tests first

- [x] **4.1** Updated assurance lockfile paths and provenance across `source-provenance.ts`, `foundation-artifacts.ts`, `validate-assurance.ts`, `coverage/capture.ts`, `stability/campaign.ts`, `control-sensitivity/local-runtime.ts`, `mutation/runner.ts`, `ratchet-baselines.json`, and `red-signatures.json`; owned inputs now include `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and `.npmrc`.
- [x] **4.2** Updated assurance command metadata, usage text, recovery commands, and test fixtures from Yarn to pnpm; `pnpm assurance:test` passes all 57 governance tests. Historical evidence was not rewritten.

### Session 4B — implementation

- [x] **4.3** Updated the worktree flows. pnpm refuses a symlinked `node_modules` for task run state, so isolated worktrees execute the existing package build scripts through the pinned npm CLI. The packed-consumer test builds, packs, installs, verifies, and cleans up successfully.
- [x] **4.4** Switched the packed-consumer compatibility flow to npm: npm install flags, `package-lock.json` assertions, cache directory, and deterministic archive/content checks. The npm-produced archives are packed twice and compared; the installed tree is verified as ordinary directories.
- [x] **4.5** Verified the coverage dependency inventory against the hoisted harness image: 276 packages, including `koa`, `yaml` 2.9.0, `chalk` 6.0.0, and `oidc-provider` at `/app/node_modules/*`.
- [ ] **4.6** `pnpm assurance:validate` passed and the packed-consumer/gonvernance suites pass. The live `pnpm assurance:compat`, coverage capture, and ratchet refresh remain pending; see the known pre-existing drift below.
- [ ] **4.7** Run `pnpm assurance:harness --project security --profile production-security` and record the new evidence. Do not rewrite or re-sign historical manifests from Yarn revisions.

**Known pre-existing drift:** `assurance-ratchets.impl.test.ts` reports stale reviewed digests for `requirement-r5` and `fixture`. Those files changed after the 2026-08-22 local baseline and are unrelated to pnpm. The migration updated only the dependency digest. A separate baseline review is required before the ratchet suite can pass.

**Verify:** assurance validation passes; packed-consumer compat uses npm; coverage inventory is non-empty; the registered production-security harness remains pending.

## Phase 5 — Structural specifications and documentation

- [x] **5.1** Rewrote `workspace-layout.spec.test.mjs` and `workspace-layout.impl.test.mjs` for pnpm while keeping topology, exact internal versions, acyclicity, Turbo wiring, root execution, and no-nested-lockfile invariants.
- [x] **5.2** Rewrote `root-scripts.spec.test.mjs` and `root-scripts.impl.test.mjs` as semantic pnpm assertions while keeping the supported script surface, duplicate prevention, documentation-command resolution, Docker/CLI boundary, and dependency-maintenance ordering.
- [x] **5.3** Rewrote the remaining assertions in `assurance-root-contract`, `assurance-boundary`, `docs-boundary`, `admin-ui-docs`, `server-package`, and `release`; all release, security, Docker, and documentation invariants remain covered.
- [x] **5.4** Updated `README.md`, `packages/server/README.md`, `packages/sdk/README.md` repository commands, `docs/guide/setup-alternatives.md`, `docs/database/migrations.md`, `docs/cli/overview.md`, `docs/cli/organizations.md`, `docs/guide/environment.md`, and the command hints in `scripts/setup-certs.sh`. Consumer `yarn add @portaidentity/sdk` examples remain as valid consumer alternatives.
- [x] **5.5** Updated techdocs command names, the `.npmrc`/`engineStrict`/`savePrefix` explanation, and the test inventory; refreshed `AGENTS.md`; updated the T-04 roadmap row. `pnpm test:structure` passes 142/142.

**Verify:** `pnpm test:structure` passes 142/142; current repository-development guidance uses pnpm; release/security/docs invariants remain covered.

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
