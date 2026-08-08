# Testing Strategy: Porta Monorepo Migration

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

The migration uses fast repository-contract tests before each structural component, then retains the existing behavioral suites as the compatibility oracle. Coverage percentages are not changed because product logic is not being developed; the goal is preservation of the current thresholds and non-GUI suite inventory. (MR-04, AR-01, AR-23)

## 🚨 Specification Test Cases

### Workspace and package topology

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-01 | Parse root `package.json` | name is `@portaidentity/monorepo`, private is true, package manager is Yarn 1.22.22, and Node floor is `>=22.22.2` | MR-01, MR-10 |
| ST-02 | Enumerate public package manifests and active install graph | exactly `@portaidentity/server`, `@portaidentity/sdk`, and `@portaidentity/cli` exist below `packages/`; retained harness dependencies use the root install | MR-01, MR-02 |
| ST-03 | Search Phase-1 workspace and root build-script topology for admin GUI | no GUI source workspace or root GUI build/test/dev/verify workspace command exists; retained `porta gui` CLI surface and deferred publishing files are exempt | MR-05, AR-33, AR-34 |
| ST-04 | Parse `turbo.json` | build outputs `dist/**`; stateful test/verify/dev tasks are uncached; no remote-cache configuration exists | MR-08 |
| ST-05 | Read `deps:check` and `deps:update` scripts | both address root/workspaces and exclude `@portaidentity/*`; update reinstalls and runs `yarn verify` | MR-09 |
| ST-06 | Evaluate workspace globs against preserved playground paths | no playground path is a workspace or Turbo package | MR-06 |

### Server package and deployment

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-07 | Inspect `packages/server` package tree | `src`, server behavioral `tests`, `migrations`, `templates`, and `locales` exist below the package and their old root paths do not; repository contracts remain at root | MR-03 |
| ST-08 | Parse server manifest and build output declaration | package is `@portaidentity/server` at the synchronized migration baseline, `porta-server` targets `dist/cli/index.js`, and `start` targets `dist/index.js` | MR-02, MR-04, AR-33 |
| ST-09 | Resolve migrations/seed SQL/templates/locales while process cwd is an unrelated temporary directory | every default path resolves inside the server package and exists | MR-03, MR-04 |
| ST-10 | Build the server workspace and inspect its output/assets | compiled server and CLI exist and required migrations/templates/locales remain present without `.env` or secrets | MR-03, MR-13, MR-15 |
| ST-11 | Inspect/build Docker image and invoke its commands | no admin-GUI image dependency remains; image runs as non-root, health check/port remain, `porta --help` invokes infrastructure CLI, and entrypoint starts server after optional migration | MR-04, MR-05, MR-15 |
| ST-12 | Run migrated non-GUI test matrix against required services | former server/SDK/CLI suites plus retained OIDC harness and provisioning smoke pass; only the 75 removed GUI tests are intentionally absent | MR-04, MR-05, MR-15 |

### Documentation boundary

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-13 | Enumerate public and technical documentation roots | `docs/implementation-details` is absent and top-level `techdocs/` contains the moved technical set | MR-07 |
| ST-14 | Parse VitePress config and public Markdown links | no navigation, sidebar, or public link targets `implementation-details` or `techdocs` | MR-07 |
| ST-15 | Search active public docs for package/install references | current server/SDK/CLI examples use approved package names; retained `porta gui` docs do not invent future behavior | MR-02, MR-05, MR-07, AR-34 |
| ST-16 | Build public docs and inspect output | VitePress build succeeds and emits no technical-doc route | MR-07, MR-15 |

### Toolchain and branch CI

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-17 | Inspect manifests after approved upgrade and run `deps:check` | TypeScript is stable 7.x and ncu reports no eligible third-party updates | MR-09, MR-10 |
| ST-18 | Inspect `Build and Test` after migration | it installs/builds/typechecks/lints/tests active workspaces and retained suites, and contains no publish/version/tag/release/deploy command or registry credential | MR-11–MR-13, AR-33 |

## Test Categories

### Specification Tests

| Test file | ST cases |
|---|---|
| `repo-tests/monorepo/workspace-layout.spec.test.mjs` | ST-01–ST-06 |
| `packages/server/tests/unit/lib/runtime-paths.spec.test.ts` | ST-09 |
| `repo-tests/monorepo/server-package.spec.test.mjs` | ST-07, ST-08, ST-10–ST-12 |
| `repo-tests/monorepo/docs-boundary.spec.test.mjs` | ST-13–ST-16 |
| `repo-tests/monorepo/toolchain.spec.test.mjs` | ST-17 |
| `repo-tests/monorepo/ci.spec.test.mjs` | ST-18 |

### Implementation Tests

| Test file | Description | Priority |
|---|---|---|
| `repo-tests/monorepo/workspace-layout.impl.test.mjs` | malformed/extra workspace and cache-policy diagnostics | High |
| `packages/server/tests/unit/lib/runtime-paths.impl.test.ts` | module-relative root derivation and missing-asset diagnostics | High |
| `repo-tests/monorepo/docs-boundary.impl.test.mjs` | relative technical-doc link traversal and broken-link reporting | Medium |
| `repo-tests/monorepo/ci.impl.test.mjs` | missing active suite and forbidden publish-step diagnostics | High |

### Integration and End-to-End

| Test | Components | Expected result |
|---|---|---|
| Structural parity | all workspaces + PostgreSQL/Redis/MailHog | migrated non-GUI suites pass before upgrades |
| Final parity | upgraded workspaces + services | same suite behavior passes after upgrades |
| Docker smoke | server image + infrastructure | startup, health, migrations, and embedded CLI remain operational |
| Docs build | VitePress public site | build/link checks pass without techdocs |
| OIDC harness | retained SPA/BFF harness | black-box password/magic-link/refresh flows remain operational |

## Test Data

- Existing server fixtures, database setup, Redis DB 1 isolation, and MailHog remain authoritative.
- Repository-contract tests use temporary directories and copied manifests; they never edit the working tree.
- CI contract tests parse local workflow files and require no GitHub credentials.

## Verification Checklist

- [ ] ST-01–ST-18 exist and are written before their implementation component.
- [ ] Each new specification test is observed failing for its intended unmet contract.
- [ ] All new specification and implementation tests pass after the governing component.
- [ ] Structural parity passes before toolchain upgrades.
- [ ] Final full verification, retained harness/provision smoke, docs, and Docker pass.
- [ ] No product expectation or existing security test is weakened to make migration pass.
