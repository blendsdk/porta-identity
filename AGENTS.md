# Project guidance

<!-- CODEOPS-PROJECT:START -->

## Project profile

- Porta is a TypeScript ESM identity platform requiring Node.js 22.22.2+; active feature verification uses Node.js 24. The server is built around Koa, `oidc-provider`, PostgreSQL, and Redis. Builds and typechecks use TypeScript 7; ESLint uses the official side-by-side TypeScript 6 API compatibility package.
- Yarn Classic 1.x and Turbo own the root workspace. The active packages are `@portaidentity/server`, `@portaidentity/sdk`, and `@portaidentity/cli`.
- `main` is the production branch and remains strictly off limits. Integrate feature work through `develop`; preserve the verified migration and assurance histories. Do not assume historical integration branches or worktrees are still active.
- Commits use Conventional Commit prefixes such as `feat`, `fix`, `refactor`, `docs`, `test`, `build`, and `chore`.

## Authoritative commands

Run commands from the repository root.

| Purpose             | Command                                    | Validation                                                                                                               |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Install             | `yarn install --frozen-lockfile`           | Passed on 2026-08-08 in the migration worktree                                                                           |
| Full verification   | `yarn verify`                              | Passed on 2026-09-17; counts below                                                                                      |
| CLI verification    | `yarn workspace @portaidentity/cli verify` | Passed on 2026-09-17: lint, typecheck, 1,419 tests and build                                                             |
| Structure tests     | `yarn test:structure`                      | Passed on 2026-09-17: 122 contracts; some spawn builds/CLI commands; no services required                                |
| Unit tests          | `yarn test:unit`                           | Runs the server unit project                                                                                             |
| Integration tests   | `yarn test:integration`                    | Requires PostgreSQL, Redis, and MailHog                                                                                  |
| End-to-end tests    | `yarn test:e2e`                            | Requires PostgreSQL, Redis, and MailHog                                                                                  |
| Penetration tests   | `yarn test:pentest`                        | Requires PostgreSQL, Redis, and MailHog                                                                                  |
| Browser tests       | `yarn test:ui`                             | Passed on 2026-09-17: 133; requires Playwright Chromium and test infrastructure                                           |
| OIDC harness        | `yarn harness:test`                        | Retained SPA/BFF black-box suite; owns and cleans up its Docker services                                                 |
| Documentation build | `yarn docs:build`                          | Passed on 2026-09-17                                                                                                    |
| Dependency check    | `yarn deps:check`                          | Checks root and active workspaces while excluding internal workspace packages                                            |
| Release tooling     | `yarn release:prepare`, `yarn release:preflight`, `yarn release:publish` | Declared by root scripts; not executed during this guidance refresh                                  |

`yarn verify` runs the root structure tests and Turbo verification for server, SDK, and CLI. Browser tests and the retained OIDC harness remain separate commands.

Latest full verification (2026-09-17): structure 122; server unit 3,635, integration 476, E2E 127,
pentest 260; SDK 558; CLI 1,419. Lint, typechecks and builds pass. These are dated evidence,
not fixed test-count requirements.

The registered `yarn assurance:harness --project security --profile production-security` run on
2026-09-17 passed its 7 human-authentication, 4 second-factor and 17 tenant/admin tests; exposure
checks recorded 8 passes and no product/execution failures. Exactly three previously accepted
forwarding-context observer gaps remain incomplete, with exit 40 preserved. Cleanup passed. Do not
call this fully passed or treat the acceptance as permission to ignore new gaps or failed assertions.
Evidence: `codeops/features/production-readiness/plans/postgresql-backed-global-configuration/00-phase5-quality-review.md`.

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

## Admin UI operating model

- The embedded `porta admin` terminal application is a single-operator application. Assume only one
  administrator uses this UI at a time.
- Do not add concurrent-editor scenarios, optimistic concurrency, ETag workflows, merge handling,
  UI locks, polling, or multi-administrator coordination to the Admin UI.
- Keep Admin UI mutations direct and concise. After a partial or unknown failure, reload the
  displayed state when needed; never add automatic mutation retries.
- Existing server API concurrency safeguards may remain for other API or SDK consumers, but the
  Admin UI does not need to use or extend them.

## Global configuration boundaries

- The editable deployment-global catalog contains exactly 18 settings with native JSONB values.
  `packages/server/src/lib/system-config-catalog.ts` owns types, bounds, defaults and metadata.
  Preserve exact `admin:config:read`/`admin:config:update` authorization; global configuration does
  not make tenant-owned data global. Internal bootstrap identities and infrastructure/root secrets
  are not exposed or editable through this API.
- Validate the complete single/batch update before changing existing rows in one transaction.
  Record one `admin.config.updated` audit containing keys and restart status, never values. Clear
  the local runtime cache only after commit; authoritative API reads must not substitute fallback
  defaults for missing or corrupt storage.
- Runtime reads use the existing 60-second, read-driven cache: local post-save visibility is
  immediate, and healthy peers observe changes on their next read after cache expiry. The five
  provider-startup TTL settings require restarting every server instance. Never rewrite existing
  artifact or Redis-counter expiries when saving configuration.
- SDK, CLI and Admin UI use API metadata. Do not add a shared catalog package, generator,
  distributed invalidation, polling, worker or generalized settings framework.

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
- `codeops/`: nested CodeOps artifacts; `codeops/codeops.json` owns layout and quality policy. Each feature has its own roadmap, requirements, plans and execution evidence.

## Generated and sensitive files

- Do not edit or commit `dist/`, `coverage/`, `test-results/`, `playwright-report/`, VitePress caches, generated playground configuration, or generated TLS certificates.
- `.env` is local and must never be committed. Treat connection strings, signing keys, cookie keys, npm tokens, and release-provider keys as secrets.
- Lockstep owns coordinated manifest versions, internal dependency ranges and changelogs. Use `yarn release:prepare` and `scripts/sync-versions.js` for release-derived source constants; do not hand-edit them during ordinary feature work. Release preparation and publication require explicit authorization, not an ordinary verification run.

## CI-only loopback DNS

- The public wildcard `*.ci.portaidentity.com` is reserved for test infrastructure and resolves arbitrary subdomains to IPv4 loopback `127.0.0.1`. It exposes no remote service: each client connects back to its own machine or CI runner.
- Use descriptive, harness-specific names such as `porta-harness.ci.portaidentity.com` and `app-harness.ci.portaidentity.com`. Add a resolver preflight to tests that depend on these names so DNS drift fails quickly and clearly.
- Never use this namespace in production configuration, published examples, real credentials, persistent cookies, or trust decisions. Keep test cookies host-only; do not set `Domain=.ci.portaidentity.com`.
- Subdomains beneath `ci.portaidentity.com` are different origins but the same browser site. Tests that specifically require cross-site behavior must use different registrable domains instead.
- Do not add an `AAAA` record unless every participating test service is intentionally bound to IPv6 loopback as well.

The read-only `.github/workflows/build-and-test.yml` branch gate verifies the monorepo, UI, OIDC harness, public docs, production Docker build, and production dependency audit. Separate release workflows publish the tested `main` revision and release-tagged Docker images. Do not run release, publishing or deployment workflows as ordinary feature verification.

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

## Technical documentation automation

- The `techdocs: true` frontmatter in `techdocs/index.md` is this repository's opt-in marker for
  automatic CodeOps technical-documentation updates after completed requirements, plan phases, and
  plans.
- Keep maintainer architecture documentation under `techdocs/`. Do not add the marker to the public
  `docs/index.md` or mix maintainer architecture content into the published documentation tree.
