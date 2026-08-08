# Project guidance

<!-- CODEOPS-PROJECT:START -->
## Project profile

- Porta is a Node.js 22+, TypeScript ESM identity platform built around Koa, `oidc-provider`, PostgreSQL, and Redis.
- Yarn Classic 1.x owns the root workspace. The current checkout contains the root identity server plus `@portaidentity/sdk`, `@portaidentity/cli`, and `@portaidentity/admin-gui` workspaces.
- `main` is the integration and production branch. Feature work must use a separate branch or worktree.
- Commits use Conventional Commit prefixes such as `feat`, `fix`, `refactor`, `docs`, `test`, `build`, and `chore`.

## Authoritative commands

Run commands from the repository root.

| Purpose | Command | Validation |
|---|---|---|
| Install | `yarn install --frozen-lockfile` | Passed on 2026-08-08 in the migration worktree |
| Full verification | `yarn verify` | Passed on 2026-08-08: 222 root files / 3,344 tests, 31 SDK files / 404 tests, 29 CLI files / 355 tests, and 9 admin-GUI files / 75 tests |
| Unit tests | `yarn test:unit` | Declared by root package scripts |
| Integration tests | `yarn test:integration` | Requires PostgreSQL, Redis, and MailHog |
| End-to-end tests | `yarn test:e2e` | Requires PostgreSQL, Redis, and MailHog |
| Penetration tests | `yarn test:pentest` | Requires PostgreSQL, Redis, and MailHog |
| Browser tests | `yarn test:ui` | Requires Playwright Chromium and test infrastructure |
| Documentation build | `yarn docs:build` | Declared by root package scripts |

`yarn verify` runs lint, the root TypeScript build, all Vitest projects, and SDK/CLI/admin-GUI verification. Browser tests are a separate command even though CI runs them.

## Repository structure

- `src/`: identity-server source, including OIDC, admin APIs, CLI compatibility code, domain services, middleware, and configuration.
- `packages/porta-sdk/`: public TypeScript SDK.
- `packages/porta-cli/`: public administrative CLI.
- `packages/porta-admin-gui/`: standalone React/Koa admin GUI.
- `tests/`: root unit, integration, end-to-end, penetration, and browser suites.
- `test-harness/`: external black-box SPA/BFF harness and Playwright tests.
- `docker/`: development and production container assets.
- `migrations/`: ordered PostgreSQL migration files; do not rewrite applied migrations.
- `docs/`: current VitePress documentation source.
- `playground/` and `playground-bff/`: independent development playgrounds.
- `codeops/`: nested CodeOps policy, roadmap, requirements, plans, and execution evidence.

## Generated and sensitive files

- Do not edit or commit `dist/`, `coverage/`, `test-results/`, `playwright-report/`, VitePress caches, generated playground configuration, or generated TLS certificates.
- `.env` is local and must never be committed. Treat connection strings, signing keys, cookie keys, npm tokens, and release-provider keys as secrets.
- Release-derived version constants and changelogs must be changed through the repository's release tooling once that tooling exists; do not hand-edit them during ordinary feature work.

## Active migration constraint

The monorepo migration is structural. Preserve supported application, API, OIDC, CLI, SDK, database, configuration, and deployment behavior. Do not combine product features, enhancements, or unrelated bug fixes with structural work. Record discovered product defects for later instead of fixing them during the migration.
<!-- CODEOPS-PROJECT:END -->
