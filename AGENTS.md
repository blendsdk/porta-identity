# Project guidance

<!-- CODEOPS-PROJECT:START -->

## Project profile

- Porta is a Node.js 22+, TypeScript ESM identity platform built around Koa, `oidc-provider`, PostgreSQL, and Redis. Builds and typechecks use TypeScript 7; ESLint uses the official side-by-side TypeScript 6 API compatibility package.
- Yarn Classic 1.x and Turbo own the root workspace. The active packages are `@portaidentity/server`, `@portaidentity/sdk`, and `@portaidentity/cli`.
- `main` is the integration and production branch and is strictly off limits during migration. All migration work runs on `monorepo-migrate` in the separate `v6` worktree.
- Commits use Conventional Commit prefixes such as `feat`, `fix`, `refactor`, `docs`, `test`, `build`, and `chore`.

## Authoritative commands

Run commands from the repository root.

| Purpose             | Command                          | Validation                                                                                                                       |
| ------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Install             | `yarn install --frozen-lockfile` | Passed on 2026-08-08 in the migration worktree                                                                                   |
| Full verification   | `yarn verify`                    | Passed on 2026-08-08: 44 structure tests, 224 server files / 3,348 tests, 31 SDK files / 404 tests, and 29 CLI files / 355 tests |
| Structure tests     | `yarn test:structure`            | Node repository-contract tests; no services required                                                                             |
| Unit tests          | `yarn test:unit`                 | Runs the server unit project                                                                                                     |
| Integration tests   | `yarn test:integration`          | Requires PostgreSQL, Redis, and MailHog                                                                                          |
| End-to-end tests    | `yarn test:e2e`                  | Requires PostgreSQL, Redis, and MailHog                                                                                          |
| Penetration tests   | `yarn test:pentest`              | Requires PostgreSQL, Redis, and MailHog                                                                                          |
| Browser tests       | `yarn test:ui`                   | Requires Playwright Chromium and test infrastructure                                                                             |
| OIDC harness        | `yarn harness:test`              | Retained SPA/BFF black-box suite; owns and cleans up its Docker services                                                         |
| Documentation build | `yarn docs:build`                | Declared by root package scripts                                                                                                 |
| Dependency check    | `yarn deps:check`                | Checks root and active workspaces while excluding internal workspace packages                                                    |

`yarn verify` runs the root structure tests and Turbo verification for server, SDK, and CLI. Browser tests and the retained OIDC harness remain separate commands.

## Repository structure

- `packages/server/`: public identity-server package, including source, behavioral tests, migrations, templates, locales, and package-local tool configuration.
- `packages/sdk/`: public TypeScript SDK.
- `packages/cli/`: public administrative CLI. Its optional `porta gui` command is intentionally retained while non-blocking; the former GUI workspace is removed.
- `repo-tests/monorepo/`: fast repository-structure specifications and implementation diagnostics.
- `test-harness/`: retained external black-box SPA/BFF harness and Playwright tests.
- `docker/`: development and production container assets.
- `packages/server/migrations/`: ordered PostgreSQL migration files; do not rewrite applied migrations.
- `docs/`: public VitePress documentation for operators, users, API, SDK, and CLI consumers.
- `techdocs/`: unpublished maintainer and architecture documentation.
- `playground/` and `playground-bff/`: independent development playgrounds.
- `codeops/`: nested CodeOps policy, roadmap, requirements, plans, and execution evidence.

## Generated and sensitive files

- Do not edit or commit `dist/`, `coverage/`, `test-results/`, `playwright-report/`, VitePress caches, generated playground configuration, or generated TLS certificates.
- `.env` is local and must never be committed. Treat connection strings, signing keys, cookie keys, npm tokens, and release-provider keys as secrets.
- Release-derived version constants and changelogs must be changed through the repository's release tooling once that tooling exists; do not hand-edit them during ordinary feature work.

The read-only `.github/workflows/build-and-test.yml` branch gate verifies the monorepo, UI, OIDC harness, public docs, production Docker build, and production dependency audit. Publishing and deployment workflow repair is deferred to a separate post-migration plan.

## Active migration constraint

The monorepo migration is structural. Preserve supported application, API, OIDC, CLI, SDK, database, configuration, and deployment behavior. Do not combine product features, enhancements, or unrelated bug fixes with structural work. Record discovered product defects for later instead of fixing them during the migration.

<!-- CODEOPS-PROJECT:END -->
