# Project guidance

<!-- CODEOPS-PROJECT:START -->

## Project profile

- Porta is a Node.js 22+, TypeScript ESM identity platform built around Koa, `oidc-provider`, PostgreSQL, and Redis. Builds and typechecks use TypeScript 7; ESLint uses the official side-by-side TypeScript 6 API compatibility package.
- Yarn Classic 1.x and Turbo own the root workspace. The active packages are `@portaidentity/server`, `@portaidentity/sdk`, and `@portaidentity/cli`.
- `main` is the production branch and remains strictly off limits. `monorepo-migrate` is the verified migration checkpoint; conflict resolution for the pull request into `develop` runs on `monorepo-develop-integration` in the separate `v6` worktree.
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
- `techdocs/reference/retired-playgrounds.md`: recovery record for the unsupported v5 playground applications removed from the active tree.
- `codeops/`: nested CodeOps policy, roadmap, requirements, plans, and execution evidence.

## Generated and sensitive files

- Do not edit or commit `dist/`, `coverage/`, `test-results/`, `playwright-report/`, VitePress caches, generated playground configuration, or generated TLS certificates.
- `.env` is local and must never be committed. Treat connection strings, signing keys, cookie keys, npm tokens, and release-provider keys as secrets.
- Release-derived version constants and changelogs must be changed through the repository's release tooling once that tooling exists; do not hand-edit them during ordinary feature work.

The read-only `.github/workflows/build-and-test.yml` branch gate verifies the monorepo, UI, OIDC harness, public docs, production Docker build, and production dependency audit. Publishing and deployment workflow repair is deferred to a separate post-migration plan.

## Security invariants

Porta is an identity provider, so security takes precedence over convenience, deadlines, refactoring
simplicity, and performance. Refuse a requested implementation that would weaken these properties;
explain the concrete risk and propose a secure alternative.

- Preserve OIDC compliance, PKCE for public clients, login and consent integrity, and single-use,
  time-limited, unpredictable magic-link and password-reset tokens.
- Keep ES256 with ECDSA P-256 for token signing. Validate JWT signatures, issuers, audiences, and
  expiry, and preserve refresh-token rotation.
- Keep Argon2id for passwords and recovery codes, AES-256-GCM for two-factor secrets, encrypted
  signing keys at rest, and cryptographically secure randomness. Never store secrets in plaintext.
- Validate external API, CLI, and OIDC input with the established Zod schemas. Use parameterized SQL,
  exact redirect-URI matching, and injection-safe slug validation.
- Scope database access and cache keys to the resolved organization. Never permit cross-tenant data
  access through APIs, CLI operations, OIDC endpoints, sessions, or caches.
- Preserve authentication rate limits, failed-login tracking, account lockout, and throttling. Do not
  introduce bypasses based on headers, paths, or parameter variation.
- Keep admin authentication and RBAC middleware on protected routes. Authorization must verify both
  role assignment and organization membership.
- Preserve `Secure`, `HttpOnly`, and `SameSite` production cookies, session renewal at authentication,
  session expiry, and CSRF protection on state-changing requests.
- Enforce production HTTPS, restrictive authenticated CORS, CSP and other security headers, and
  minimal public errors. Never log or return passwords, tokens, client secrets, keys, stack traces,
  SQL errors, internal paths, infrastructure details, or product-version fingerprints.
- Preserve two-factor enforcement, encrypted TOTP secrets, rate-limited email OTP delivery, and
  single-use hashed recovery codes.
- Treat `packages/server/tests/pentest/` as a security baseline. Do not delete, skip, or weaken its
  assertions to make a change pass; new attack surfaces require corresponding security coverage.
- Assess authentication, authorization, cryptography, tenant isolation, validation, rate limiting,
  sessions, error handling, and information exposure before completing a security-relevant change.

## Active migration constraint

The monorepo migration is structural. Preserve supported application, API, OIDC, CLI, SDK, database, configuration, and deployment behavior. Do not combine product features, enhancements, or unrelated bug fixes with structural work. Record discovered product defects for later instead of fixing them during the migration.

<!-- CODEOPS-PROJECT:END -->
