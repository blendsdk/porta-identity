# Project guidance

## Prime directive — leave no test infrastructure behind

Clean up everything you create for a task before reporting the task complete.

- Tear down every container, compose project, network, volume, and image you started, and remove
  every test Porta installation you created. The machine must look as it did before the task.
- For repository-owned stacks use the owned lifecycle commands (`pnpm docker:down`,
  `pnpm harness:stop`, and the cleanup built into each `pnpm assurance:*` run) instead of ad-hoc
  `docker rm` / `docker compose down`. Remove task-created scratch stacks with their own compose
  project name (`docker compose -p <scratch> down -v`); never touch resources you did not create.
- Give scratch stacks their own compose project name and prefer `docker run --rm`, so cleanup
  cannot touch containers or data the developer already had running. Never remove resources you
  did not create, and never run global prune commands.
- Drop scratch test databases created inside a shared container as part of teardown.
- Before finishing, confirm with `docker ps -a`, `docker network ls`, and `docker volume ls` that
  nothing from the task remains. If cleanup cannot complete, report the exact recovery command.

## Prime directive — keep local test runs narrow

CI runs the full suite on every push and pull request. Do not run the full suite locally by
default. Start with `pnpm test:changed`; if it selects nothing or the change crosses a boundary,
run the smallest category that covers the change (`pnpm test:unit`, `pnpm test:integration`,
`pnpm test:e2e`, `pnpm test:pentest`, `pnpm test:ui`, or `pnpm test:structure`).

Run the full suite (`pnpm test` or `pnpm verify`) locally only when:

- the change touches test infrastructure, CI, Turbo, root scripts, or shared test setup;
- the change spans multiple workspaces or shared authentication, database, or middleware code
  where no narrower gate is credible;
- you are preparing a release or diagnosing a failure that only reproduces in the full run;
- the user explicitly asks for a full run.

This does not relax security testing. Authentication, OIDC/token, tenant isolation,
administrative authorization, sessions, recovery, cookies, CSRF, and CORS changes must still run
`pnpm test:pentest` and the applicable assurance harness.

A local run is a selection, not a waiver: a change is mergeable only after CI's full
`pnpm verify` passes.

<!-- CODEOPS-PROJECT:START -->

## Project profile

- Porta is a TypeScript ESM identity platform requiring Node.js 22.22.2+; active feature verification uses Node.js 24. The server is built around Koa, `oidc-provider`, PostgreSQL, and Redis. Builds and typechecks use TypeScript 7; ESLint uses the official side-by-side TypeScript 6 API compatibility package.
- pnpm 12.15 and Turbo own the root workspace. The active packages are `@portaidentity/server`, `@portaidentity/sdk`, and `@portaidentity/cli`.
- `main` is the production branch and remains strictly off limits. Integrate feature work through `develop`; preserve the verified migration and assurance histories. Do not assume historical integration branches or worktrees are still active.
- Commits use Conventional Commit prefixes such as `feat`, `fix`, `refactor`, `docs`, `test`, `build`, and `chore`.

## Authoritative commands

Run commands from the repository root.

| Purpose              | Command                                                                  | Scope          | Validation                                                                    |
| -------------------- | ------------------------------------------------------------------------ | -------------- | ----------------------------------------------------------------------------- |
| Install              | `pnpm install --frozen-lockfile`                                         | Local / CI     | Passed on 2026-08-08 in the migration worktree                                |
| Full product tests   | `pnpm test`                                                              | CI only        | Server unit, integration, E2E, and pentest; SDK; CLI                          |
| Full verification    | `pnpm verify`                                                            | CI only        | Structure contracts, lint, typecheck, all product tests, and builds           |
| Affected tests       | `pnpm test:changed`                                                      | Local default  | Structure contracts plus unit tests affected since `origin/develop`           |
| Unit tests           | `pnpm test:unit`                                                         | Local          | Server unit, SDK, and CLI; no services required                               |
| Watch unit tests     | `pnpm test:watch`                                                        | Local          | Server unit project only                                                      |
| Integration tests    | `pnpm test:integration`                                                  | Local services | Requires PostgreSQL, Redis, and MailHog                                       |
| Affected integration | `pnpm test:changed:integration`                                          | Local services | Integration tests affected since `origin/develop`                             |
| Watch integration    | `pnpm test:watch:integration`                                            | Local services | Server integration project only                                               |
| End-to-end tests     | `pnpm test:e2e`                                                          | Local services | Requires PostgreSQL, Redis, and MailHog                                       |
| Penetration tests    | `pnpm test:pentest`                                                      | Security gate  | Requires PostgreSQL, Redis, and MailHog                                       |
| Browser tests        | `pnpm test:ui`                                                           | Browser gate   | Requires Playwright Chromium and test infrastructure                          |
| Structure tests      | `pnpm test:structure`                                                    | Local / CI     | 142 contracts; some spawn builds/CLI commands; no services required           |
| OIDC harness         | `pnpm harness:test`                                                      | On demand      | Retained SPA/BFF black-box suite; owns and cleans up its Docker services      |
| Documentation build  | `pnpm docs:build`                                                        | Docs changes   | Passed on 2026-09-17                                                          |
| Dependency check     | `pnpm deps:check`                                                        | On demand      | Checks root and active workspaces while excluding internal workspace packages |
| Release tooling      | `pnpm release:prepare`, `pnpm release:preflight`, `pnpm release:publish` | Manual release | Declared by root scripts; not executed during ordinary feature work           |

`pnpm test` runs every product test project. `pnpm verify` adds structure contracts, lint, typecheck,
and builds, and is the CI gate. Browser tests and the retained OIDC harness remain separate CI jobs.
Use the narrow category scripts locally; CI covers the full surface on every push and pull request.

Latest CI full verification (2026-09-17): structure 122; server unit 3,635, integration 476, E2E 127,
pentest 260; SDK 558; CLI 1,419. Lint, typechecks and builds pass. These are dated CI evidence,
not fixed test-count requirements and not a local default.

The registered `pnpm assurance:harness --project security --profile production-security` run on
2026-09-17 passed its 7 human-authentication, 4 second-factor and 17 tenant/admin tests; exposure
checks recorded 8 passes and no product/execution failures. Exactly three previously accepted
forwarding-context observer gaps remain incomplete, with exit 40 preserved. Cleanup passed. Do not
call this fully passed or treat the acceptance as permission to ignore new gaps or failed assertions.
Evidence: `codeops/features/production-readiness/plans/postgresql-backed-global-configuration/00-phase5-quality-review.md`.

## Feature verification workflow

- Before implementation, identify the affected public and security boundaries and write or update
  immutable specification tests first. During implementation, run the narrow unit, integration,
  E2E, UI, or harness selector that gives the fastest relevant feedback.
- Start local verification with `pnpm test:changed`. If it selects nothing or the change crosses a
  boundary, run the smallest category that covers it. Before every commit, run the affected
  workspace checks plus `pnpm test:structure`. Do not run `pnpm verify` locally unless the
  local-test prime directive exception applies. Never delete, skip, weaken, or retry-away a failing
  security assertion.
- Before opening or merging a PR, confirm CI's full `pnpm verify` is green. CI is the authoritative
  full-suite gate; a local category run is a selection, not a waiver.
- For browser-facing behavior, also run `pnpm test:ui`. For retained SPA/BFF behavior, run
  `pnpm harness:test`; both remain outside `pnpm verify`.
- For authentication, OIDC/token, tenant isolation, administrative authorization, sessions,
  recovery, cookies, CSRF, CORS, or other security-sensitive behavior, also run the relevant
  `pnpm assurance:harness` command with a registered `protocol` or `security` project and the
  applicable profile. Use `production-security` whenever the claim depends on production cookie,
  TLS, CORS, CSP, or security-profile behavior.
- For SDK or CLI contract changes, run the relevant registered `pnpm assurance:compat` selector
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
- Lockstep owns coordinated manifest versions, internal dependency ranges and changelogs. A release is a manual dispatch of the `Release` workflow on `main`: it bumps, writes the changelogs and release notes, commits and tags, publishes with provenance, creates the GitHub Release, dispatches Docker, and syncs `develop`. `pnpm release:prepare` and `scripts/sync-versions.js` remain for local preparation; do not hand-edit version-derived constants during ordinary feature work. Triggering the release workflow is the explicit publication authorization, not an ordinary verification run.

## CI-only loopback DNS

- The public wildcard `*.ci.portaidentity.com` is reserved for test infrastructure and resolves arbitrary subdomains to IPv4 loopback `127.0.0.1`. It exposes no remote service: each client connects back to its own machine or CI runner.
- Use descriptive, harness-specific names such as `porta-harness.ci.portaidentity.com` and `app-harness.ci.portaidentity.com`. Add a resolver preflight to tests that depend on these names so DNS drift fails quickly and clearly.
- Never use this namespace in production configuration, published examples, real credentials, persistent cookies, or trust decisions. Keep test cookies host-only; do not set `Domain=.ci.portaidentity.com`.
- Subdomains beneath `ci.portaidentity.com` are different origins but the same browser site. Tests that specifically require cross-site behavior must use different registrable domains instead.
- Do not add an `AAAA` record unless every participating test service is intentionally bound to IPv6 loopback as well.

The read-only `.github/workflows/build-and-test.yml` branch gate verifies the monorepo, UI, OIDC harness, public docs, production Docker build, and production dependency audit. The `Release` workflow is manual (`workflow_dispatch` on `main`) and publishes a verified `main` revision, its GitHub Release, and the release-tagged Docker image. Do not run release, publishing or deployment workflows as ordinary feature verification.

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
  SQL errors, internal paths, or infrastructure details. Do not return product-version fingerprints
  in public or unauthenticated responses or headers.
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
