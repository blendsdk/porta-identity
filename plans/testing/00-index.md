# Testing Strategy Implementation Plan

> **Feature**: Comprehensive testing strategy — integration tests, E2E tests, invalid parameter tests, penetration tests, coverage thresholds
> **Status**: Planning Complete
> **Created**: 2026-04-09
> **Source**: [RD-10](../../requirements/RD-10-testing-strategy.md)

## Overview

This plan implements the complete testing strategy for Porta v5, a public-facing multi-tenant OIDC provider. It covers four major test categories beyond the existing 1,677 unit tests:

1. **Integration Tests** — Repository and service tests against real PostgreSQL and Redis instances via Docker Compose. Validates that all database operations, OIDC adapters, and Redis caching work correctly with real infrastructure.

2. **End-to-End Tests** — Full HTTP-based tests exercising complete OIDC flows (Authorization Code + PKCE, Client Credentials, refresh token rotation), authentication workflows (password login, magic link, password reset), multi-tenant isolation, and invalid parameter handling. Uses a real Koa server on a random port with real DB/Redis/MailHog.

3. **Penetration Tests** — Security-focused tests approaching Porta from the perspective of an expert pentester, white-hat hacker, and IT security officer. Covers OIDC protocol attacks, authentication bypass, injection attacks, cryptographic attacks, token security, multi-tenant exploitation, and more. Critical for a public-facing identity provider.

4. **Test Infrastructure** — Vitest workspace configuration, test data factories, shared fixtures, database/Redis helpers, OIDC test client, MailHog client, and coverage threshold enforcement.

The plan depends on all previous RDs (01–09) being complete, which they are. The existing test suite of 1,677 unit tests (92 files, zero failures) provides the foundation.

## Document Index

| #   | Document                                          | Description                                         |
| --- | ------------------------------------------------- | --------------------------------------------------- |
| 00  | [Index](00-index.md)                              | This document — overview and navigation             |
| 01  | [Requirements](01-requirements.md)                | Feature requirements, scope, acceptance criteria    |
| 02  | [Current State](02-current-state.md)              | Analysis of existing test infrastructure            |
| 03  | [Test Infrastructure](03-test-infrastructure.md)  | Vitest workspace, env vars, Docker test DB          |
| 04  | [Factories & Fixtures](04-factories-fixtures.md)  | Test data factories and shared fixtures             |
| 05  | [Integration Tests](05-integration-tests.md)      | Repository, adapter, and service integration specs  |
| 06  | [E2E Tests](06-e2e-tests.md)                      | OIDC flows, auth workflows, invalid params, multi-tenant |
| 07  | [Penetration Tests](07-penetration-tests.md)      | Security tests — OIDC attacks, auth bypass, injection |
| 08  | [Testing Strategy](08-testing-strategy.md)        | Coverage goals, CI integration, verification        |
| 99  | [Execution Plan](99-execution-plan.md)            | Phases, sessions, and task checklist                |

## Quick Reference

### Test Commands

```bash
# Run all tests
yarn test

# Run by category
yarn test:unit          # Unit tests only (no Docker needed)
yarn test:integration   # Integration tests (DB/Redis required)
yarn test:e2e           # E2E tests (full server + DB/Redis/MailHog)
yarn test:pentest       # Penetration tests (full server + DB/Redis/MailHog)

# Coverage
yarn test:coverage      # All tests with coverage report
```

### Key Decisions

| Decision                    | Outcome                                                    |
| --------------------------- | ---------------------------------------------------------- |
| Test framework              | Vitest with workspace/projects for unit/integration/e2e/pentest |
| Test database               | Separate `porta_test` DB via Docker init script            |
| Integration isolation       | Truncate tables between test suites                        |
| E2E approach                | Direct HTTP client, real Koa server on random port         |
| Email testing               | MailHog API client for delivery assertions                 |
| Pentest approach            | Automated security tests in Vitest, same E2E infrastructure |
| Coverage tool               | v8 via Vitest built-in                                     |
| Coverage thresholds         | 80% lines, 80% functions, 75% branches, 80% statements    |

## Related Files

### New Files (to be created)

```
docker/
  init-test-db.sql              # Creates porta_test database
tests/
  fixtures/                     # Shared test fixtures
    organizations.ts
    applications.ts
    clients.ts
    users.ts
    roles-permissions.ts
  integration/
    setup.ts                    # Global setup (DB connect, migrate)
    teardown.ts                 # Global teardown (cleanup)
    helpers/
      database.ts               # Test DB helpers (truncate, seed)
      factories.ts              # Test data factories
      redis.ts                  # Test Redis helpers
    repositories/               # Repository integration tests
      organization.repo.test.ts
      application.repo.test.ts
      client.repo.test.ts
      user.repo.test.ts
      role.repo.test.ts
      permission.repo.test.ts
      audit-log.repo.test.ts
    adapters/                   # OIDC adapter tests
      postgres-adapter.test.ts
      redis-adapter.test.ts
    services/                   # Service integration tests
      config.service.test.ts
      email.service.test.ts
      signing-key.service.test.ts
    middleware/
      tenant-resolver.test.ts
  e2e/
    setup.ts                    # Start test server, seed data
    teardown.ts                 # Stop server, cleanup
    helpers/
      http-client.ts            # HTTP client for OIDC requests
      oidc-client.ts            # OIDC test client (auth URLs, code exchange)
      mailhog.ts                # MailHog API client
    flows/                      # OIDC flow E2E tests
      authorization-code.test.ts
      client-credentials.test.ts
      refresh-token.test.ts
      token-introspection.test.ts
      token-revocation.test.ts
      discovery.test.ts
    auth/                       # Auth workflow E2E tests
      password-login.test.ts
      magic-link.test.ts
      forgot-password.test.ts
      consent.test.ts
    invalid-params/             # Invalid parameter tests
      authorization.test.ts
      token-exchange.test.ts
      consent-interaction.test.ts
      login-form.test.ts
      introspection-revocation.test.ts
    multi-tenant/
      tenant-isolation.test.ts
      issuer-resolution.test.ts
    security/
      rate-limiting.test.ts
      csrf.test.ts
      user-enumeration.test.ts
  pentest/
    setup.ts                    # Pentest global setup (reuses E2E infra)
    teardown.ts                 # Pentest global teardown
    helpers/
      attack-client.ts          # HTTP client with attack utilities
    oidc-attacks/               # OIDC protocol attacks
      pkce-bypass.test.ts
      redirect-uri-manipulation.test.ts
      code-injection.test.ts
      token-substitution.test.ts
      scope-escalation.test.ts
      refresh-token-replay.test.ts
    auth-bypass/                # Authentication bypass attacks
      sql-injection.test.ts
      brute-force.test.ts
      timing-attacks.test.ts
      session-attacks.test.ts
    magic-link-attacks/         # Magic link & password reset attacks
      token-prediction.test.ts
      token-replay.test.ts
      host-header-injection.test.ts
      email-enumeration.test.ts
    admin-security/             # Admin API security
      unauthorized-access.test.ts
      privilege-escalation.test.ts
      idor.test.ts
      mass-assignment.test.ts
    injection/                  # Injection attacks
      sql-injection-comprehensive.test.ts
      xss.test.ts
      header-injection.test.ts
      template-injection.test.ts
    crypto-attacks/             # Cryptographic attacks
      jwt-algorithm-confusion.test.ts
      jwt-manipulation.test.ts
      key-confusion.test.ts
    multi-tenant-attacks/       # Multi-tenant exploitation
      cross-tenant-auth.test.ts
      tenant-enumeration.test.ts
      slug-injection.test.ts
    infrastructure/             # Infrastructure-level attacks
      http-security-headers.test.ts
      cors-misconfiguration.test.ts
      method-tampering.test.ts
      information-disclosure.test.ts
```

### Modified Files

| File                        | Changes                                              |
| --------------------------- | ---------------------------------------------------- |
| `vitest.config.ts`          | Add workspace/projects for integration/e2e/pentest   |
| `package.json`              | Add `test:pentest` script, update test configs       |
| `docker/docker-compose.yml` | Add test DB init script volume mount                 |
| `.env.example`              | Add test environment variables                       |
