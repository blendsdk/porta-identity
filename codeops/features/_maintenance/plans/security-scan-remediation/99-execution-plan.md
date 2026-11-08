# Task T-08: Remediate security scan findings #227–#237

> **Type**: Task (security remediation) · **Feature**: _maintenance
> **Implements**: _maintenance/T-08
> **CodeOps Artifact Schema**: 1
> **Status**: Done — all 11 issues closed; PR #238 merged; post-merge CI green
> **Last Updated**: 2026-11-08

## Objective

Address the eleven source-only findings in the completed Codex Security scan without changing the
repository's security posture, weakening tenant isolation, or exposing operator data. Each fix must
have a regression test, preserve the documented single-operator Admin UI model, and avoid new
generalized security frameworks.

## Smallest viable design

Reuse existing validation, RBAC, transaction, revocation, session-tracking, cache, template and
installer patterns. Add only one small shared authority-ceiling module and one interactive-export
sanitizer. Keep machine-authentication, bootstrap, same-tenant SSO and ordinary delegated
administration working. The detailed decisions and bounded recommendations live in
`00-ambiguity-register.md`; the retrospective design gate is in `00-preflight-report.md`.

## Tasks

- [x] **T-08.1** Reject HTML tag openers in branding CSS and suppress unsafe stored values
      (`organizations/validators.ts`, `auth/effective-branding.ts`, template). Regression tests:
      `organizations/validators.spec.test.ts`, `auth/effective-branding.spec.test.ts`.
- [x] **T-08.2** Require the Admin API token's issuing client to be an active canonical Admin
      client; reserve control-plane client creation/update for full Super Admin
      (`middleware/admin-auth.ts`, `clients/service.ts`, `routes/clients.ts`). Regression tests:
      `middleware/admin-auth.test.ts`, `clients/service.test.ts`.
- [x] **T-08.3** Enforce an actor-versus-target canonical permission ceiling for password, email
      verification and factor recovery (`rbac/admin-authority-ceiling.ts`, `users/service.ts`,
      `routes/users.ts`, `routes/two-factor-admin.ts`). Regression tests:
      `rbac/admin-authority-ceiling.spec.test.ts`, users routes.
- [x] **T-08.4** Reject protected bootstrap users and the control-plane organization inside bulk
      item transactions; align suspension permission and invalidate caches after commit
      (`lib/bulk-operations.ts`, `routes/bulk.ts`). Regression tests:
      `lib/bulk-protected.spec.test.ts`, existing bulk suites.
- [x] **T-08.5** Bind SSO account, client and issuer organizations; refuse consent-grant creation
      for a foreign session; include pending-factor identity in cached authority checks
      (`oidc/account-finder.ts`, `routes/interactions.ts`, `oidc/adapter-factory.ts`). Regression
      tests: account-finder, RBAC claim and interactions suites.
- [x] **T-08.6** Separate enrollment, challenge and verified-factor migration; enforce current
      policy at setup reveal/commit; remove abandoned TOTP on email enrollment
      (`routes/two-factor.ts`, `two-factor/service.ts`, setup template). Regression tests:
      two-factor service/route/login-boundary suites.
- [x] **T-08.7** Make password recovery atomic: consume the token conditionally, replace the
      password, retire other reset links, revoke prior authority and audit in one transaction
      (`routes/password-reset.ts`, `auth/token-repository.ts`). Regression tests:
      `routes/password-reset.test.ts`.
- [x] **T-08.8** Sanitize interactive export output without changing file or pipeline bytes
      (`cli/src/terminal-export.ts`, `cli/src/commands/exports.ts`). Regression tests:
      `cli/tests/commands/exports-terminal.spec.test.ts`.
- [x] **T-08.9** Write installer configuration through a private temporary file and atomic rename;
      reject linked destinations; default new installations to loopback and warn on public binding
      (`install-porta.sh`, deployment docs). Regression tests written in
      `repo-tests/monorepo/install-script.spec.test.mjs`.
- [x] **T-08.10** Unit/static verification: server unit 4,490 passed; CLI 1,864 passed; SDK 670
      passed; server and CLI lint/typecheck/build passed; 170 non-installer structure contracts passed.
- [x] **T-08.11** Affected integration suites (221 tests), full E2E (139) and full pentest (331)
      passed against isolated PostgreSQL, Redis and MailHog. The complete integration category is
      deferred to CI because this host runs it sequentially.
- [x] **T-08.12** Installer fixture verification ran with the approved private root; all 9 installer
      tests passed. Full structure suite: 179/179 passed.
- [x] **T-08.13** Independent final review completed; first pass blocked and B1–B4 were fixed;
      re-review returned PASS WITH NOTES with no blocking findings.
- [x] **T-08.14** All 11 issues closed and merged via PR #238; post-merge CI green. No release or
      deployment was requested.

## Verification

Affected server unit, CLI and SDK suites pass. Integration, E2E, pentest, structure, lint, typecheck
and builds must pass before completion. CI's full `pnpm verify` remains the integration gate. No
test failure may be skipped, weakened, or retried away. Installer tests remain blocked on the
protected-fixture approval recorded in AR-08.
