# Project guidance

<!-- CODEOPS-PROJECT:START -->

## Project profile

- Porta is a Node.js 22+ TypeScript ESM identity platform; active feature development uses the current Node.js 24 LTS release. The server is built around Koa, `oidc-provider`, PostgreSQL, and Redis. Builds and typechecks use TypeScript 7; ESLint uses the official side-by-side TypeScript 6 API compatibility package.
- Yarn Classic 1.x and Turbo own the root workspace. The active packages are `@portaidentity/server`, `@portaidentity/sdk`, and `@portaidentity/cli`.
- `main` is the production branch and remains strictly off limits. `monorepo-migrate` is the verified migration checkpoint; conflict resolution for the pull request into `develop` runs on `monorepo-develop-integration` in the separate `v6` worktree.
- Commits use Conventional Commit prefixes such as `feat`, `fix`, `refactor`, `docs`, `test`, `build`, and `chore`.

## Authoritative commands

Run commands from the repository root.

| Purpose             | Command                                    | Validation                                                                                                               |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Install             | `yarn install --frozen-lockfile`           | Passed on 2026-08-08 in the migration worktree                                                                           |
| Full verification   | `yarn verify`                              | Passed on 2026-08-23: 70 structure; server unit 2,861, integration 363, E2E 129, and pentest 224; SDK 404; CLI 356 tests |
| CLI verification    | `yarn workspace @portaidentity/cli verify` | Runs CLI lint, typecheck, tests, and build without server suites                                                         |
| Structure tests     | `yarn test:structure`                      | Node repository-contract tests; no services required                                                                     |
| Unit tests          | `yarn test:unit`                           | Runs the server unit project                                                                                             |
| Integration tests   | `yarn test:integration`                    | Requires PostgreSQL, Redis, and MailHog                                                                                  |
| End-to-end tests    | `yarn test:e2e`                            | Requires PostgreSQL, Redis, and MailHog                                                                                  |
| Penetration tests   | `yarn test:pentest`                        | Requires PostgreSQL, Redis, and MailHog                                                                                  |
| Browser tests       | `yarn test:ui`                             | Requires Playwright Chromium and test infrastructure                                                                     |
| OIDC harness        | `yarn harness:test`                        | Retained SPA/BFF black-box suite; owns and cleans up its Docker services                                                 |
| Documentation build | `yarn docs:build`                          | Declared by root package scripts                                                                                         |
| Dependency check    | `yarn deps:check`                          | Checks root and active workspaces while excluding internal workspace packages                                            |

`yarn verify` runs the root structure tests and Turbo verification for server, SDK, and CLI. Browser tests and the retained OIDC harness remain separate commands.

## Feature verification workflow

- Before implementation, identify the affected public and security boundaries and write or update
  immutable specification tests first. During implementation, run the narrow unit, integration,
  E2E, UI, or harness selector that gives the fastest relevant feedback.
- Before every commit, run verification for every affected workspace plus `yarn test:structure`.
  Use `yarn verify` when server behavior or multiple product workspaces change. Never delete, skip,
  weaken, or retry-away a failing security assertion.
- For browser-facing behavior, also run `yarn test:ui`. For retained SPA/BFF behavior, run
  `yarn harness:test`; both remain outside `yarn verify`.
- For authentication, OIDC/token, tenant isolation, administrative authorization, sessions,
  recovery, cookies, CSRF, CORS, or other security-sensitive behavior, also run the relevant
  `yarn assurance:harness` command with a registered `protocol` or `security` project and the
  applicable profile. Use `production-security` whenever the claim depends on production cookie,
  TLS, CORS, CSP, or security-profile behavior.
- For SDK or CLI contract changes, run the relevant registered `yarn assurance:compat` selector
  from a clean committed revision so package and source provenance can be verified.
- Coverage, fault, mutation, control-check, stability, report, and `assurance:all` commands are
  specialized plan/evidence tools, not routine feature gates. Run them only when the governing
  plan or affected assurance code requires them. `assurance:all` can retain registered blocked or
  unqualified outcomes, so review its artifact and exit taxonomy instead of treating every nonzero
  result as an ordinary test failure.

## Repository structure

- `packages/server/`: public identity-server package, including source, behavioral tests, migrations, templates, locales, and package-local tool configuration.
- `packages/sdk/`: public TypeScript SDK.
- `packages/cli/`: public administrative CLI. The embedded `porta admin` terminal application lives here; the former GUI workspace and optional GUI loader are retired.
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

## CI-only loopback DNS

- The public wildcard `*.ci.portaidentity.com` is reserved for test infrastructure and resolves arbitrary subdomains to IPv4 loopback `127.0.0.1`. It exposes no remote service: each client connects back to its own machine or CI runner.
- Use descriptive, harness-specific names such as `porta-harness.ci.portaidentity.com` and `app-harness.ci.portaidentity.com`. Add a resolver preflight to tests that depend on these names so DNS drift fails quickly and clearly.
- Never use this namespace in production configuration, published examples, real credentials, persistent cookies, or trust decisions. Keep test cookies host-only; do not set `Domain=.ci.portaidentity.com`.
- Subdomains beneath `ci.portaidentity.com` are different origins but the same browser site. Tests that specifically require cross-site behavior must use different registrable domains instead.
- Do not add an `AAAA` record unless every participating test service is intentionally bound to IPv6 loopback as well.

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

## Branch and feature isolation

The monorepo migration and assurance remediation are complete checkpoints. Start new Porta product
features on separate feature branches and sessions; do not add unrelated feature work to migration
or assurance-remediation branches. Keep `main` off limits and preserve the verified migration and
assurance histories when integrating through the repository's designated integration flow.

<!-- CODEOPS-PROJECT:END -->
