# Execution Plan: Testing Strategy (RD-10)

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-09 17:37
> **Progress**: 46/116 tasks (40%)

## Overview

Implements the comprehensive testing strategy for Porta v5: integration tests, E2E tests, invalid parameter tests, penetration tests, test data factories, and coverage thresholds.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
|-------|-------|----------|-----------|
| 1 | Test Infrastructure Foundation | 2 | 60 min |
| 2 | Test Data Factories & Fixtures | 2 | 60 min |
| 3 | Integration Test Infrastructure | 1 | 30 min |
| 4 | Integration Tests — Repositories | 3 | 90 min |
| 5 | Integration Tests — Adapters & Services | 2 | 60 min |
| 6 | E2E Test Infrastructure | 2 | 60 min |
| 7 | E2E Tests — OIDC Flows | 3 | 90 min |
| 8 | E2E Tests — Auth Workflows & Invalid Params | 3 | 90 min |
| 9 | E2E Tests — Multi-tenant & Security | 2 | 45 min |
| 10 | Pentest Infrastructure & OIDC Attacks | 3 | 90 min |
| 11 | Pentests — Auth Bypass, Injection, Crypto | 3 | 90 min |
| 12 | Pentests — Admin, Multi-tenant, Infrastructure | 3 | 90 min |
| 13 | Coverage & Final Verification | 1 | 30 min |

**Total: ~30 sessions, ~14-16 hours**

---

## Phase 1: Test Infrastructure Foundation

### Session 1.1: Vitest Workspace & Docker Test DB

**Reference**: [Test Infrastructure](03-test-infrastructure.md)
**Objective**: Configure Vitest workspace projects and create test database

**Tasks**:

| # | Task | File |
|---|------|------|
| 1.1.1 | Rewrite vitest.config.ts with 4 workspace projects (unit, integration, e2e, pentest) | `vitest.config.ts` |
| 1.1.2 | Create docker/init-test-db.sql (CREATE DATABASE porta_test) | `docker/init-test-db.sql` |
| 1.1.3 | Update docker-compose.yml to mount init-test-db.sql | `docker/docker-compose.yml` |
| 1.1.4 | Add test:pentest script to package.json, update test scripts to use --project flag | `package.json` |

**Deliverables**:
- [ ] vitest.config.ts has 4 projects with correct timeouts, globalSetup, singleThread
- [ ] Docker compose creates porta_test database on first startup
- [ ] `yarn test:unit` uses --project unit
- [ ] `yarn test:pentest` script exists
- [ ] All existing unit tests still pass

**Verify**: `clear && sleep 3 && yarn verify`

### Session 1.2: Test Environment & Shared Server Setup

**Reference**: [Test Infrastructure](03-test-infrastructure.md)
**Objective**: Add test environment variables and create shared server setup module

**Tasks**:

| # | Task | File |
|---|------|------|
| 1.2.1 | Add test environment variables to .env.example | `.env.example` |
| 1.2.2 | Create shared server setup module (used by E2E and pentest) | `tests/helpers/server-setup.ts` |
| 1.2.3 | Create shared test constants (URLs, credentials) | `tests/helpers/constants.ts` |

**Deliverables**:
- [ ] .env.example has TEST_DATABASE_URL, TEST_REDIS_URL, TEST_SMTP_HOST, TEST_SMTP_PORT, TEST_MAILHOG_URL
- [ ] Shared server setup module handles DB/Redis/migrations/OIDC/Koa lifecycle
- [ ] All existing tests still pass

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 2: Test Data Factories & Fixtures

### Session 2.1: Core Factories

**Reference**: [Factories & Fixtures](04-factories-fixtures.md)
**Objective**: Create test data factories for all domain entities

**Tasks**:

| # | Task | File |
|---|------|------|
| 2.1.1 | Create factories module with randomSuffix, org/app factories | `tests/integration/helpers/factories.ts` |
| 2.1.2 | Add client factory with secret generation (createTestClientWithSecret) | `tests/integration/helpers/factories.ts` |
| 2.1.3 | Add user factory with password hashing (createTestUserWithPassword) | `tests/integration/helpers/factories.ts` |
| 2.1.4 | Add role, permission, claim definition factories | `tests/integration/helpers/factories.ts` |
| 2.1.5 | Add composite createFullTestTenant factory and TestTenant type | `tests/integration/helpers/factories.ts` |

**Deliverables**:
- [ ] All entity factories produce valid data
- [ ] createFullTestTenant returns complete tenant with credentials
- [ ] All existing tests still pass

**Verify**: `clear && sleep 3 && yarn verify`

### Session 2.2: Static Fixtures

**Reference**: [Factories & Fixtures](04-factories-fixtures.md)
**Objective**: Create shared static fixture data

**Tasks**:

| # | Task | File |
|---|------|------|
| 2.2.1 | Create organization fixtures (SUPER_ADMIN_ORG, ACTIVE_ORG, SUSPENDED_ORG) | `tests/fixtures/organizations.ts` |
| 2.2.2 | Create user fixtures (ACTIVE_USER, SUSPENDED_USER, LOCKED_USER) | `tests/fixtures/users.ts` |
| 2.2.3 | Create client fixtures (WEB_CLIENT, SPA_CLIENT, M2M_CLIENT) | `tests/fixtures/clients.ts` |
| 2.2.4 | Create application fixtures | `tests/fixtures/applications.ts` |
| 2.2.5 | Create RBAC fixtures (ADMIN_ROLE, VIEWER_ROLE, permissions) | `tests/fixtures/roles-permissions.ts` |

**Deliverables**:
- [ ] All fixture files export typed constants
- [ ] Fixtures cover common test scenarios (active, suspended, locked, etc.)

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 3: Integration Test Infrastructure

### Session 3.1: Setup, Teardown & Helpers

**Reference**: [Test Infrastructure](03-test-infrastructure.md), [Integration Tests](05-integration-tests.md)
**Objective**: Create integration test global setup, DB/Redis helpers

**Tasks**:

| # | Task | File |
|---|------|------|
| 3.1.1 | Create integration global setup (connect DB/Redis, run migrations) | `tests/integration/setup.ts` |
| 3.1.2 | Create database helpers (truncateAllTables, seedBaseData) | `tests/integration/helpers/database.ts` |
| 3.1.3 | Create Redis helpers (flushTestRedis) | `tests/integration/helpers/redis.ts` |
| 3.1.4 | Refactor existing migrations.test.ts to use new infrastructure | `tests/integration/migrations.test.ts` |

**Deliverables**:
- [ ] `yarn test:integration` connects to porta_test DB
- [ ] truncateAllTables works correctly
- [ ] Existing 33 migration tests still pass
- [ ] All existing tests still pass

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 4: Integration Tests — Repositories

### Session 4.1: Organization & Application Repos

**Reference**: [Integration Tests](05-integration-tests.md)
**Objective**: Integration tests for org and app repositories

**Tasks**:

| # | Task | File |
|---|------|------|
| 4.1.1 | Organization repository integration tests (12 test cases) | `tests/integration/repositories/organization.repo.test.ts` |
| 4.1.2 | Application repository integration tests (8 test cases) | `tests/integration/repositories/application.repo.test.ts` |

**Deliverables**:
- [ ] Org repo tests pass: CRUD, slug uniqueness, super-admin constraint, pagination, search
- [ ] App repo tests pass: CRUD, slug uniqueness, modules, cascade delete

**Verify**: `clear && sleep 3 && yarn test:integration`

### Session 4.2: Client & User Repos

**Reference**: [Integration Tests](05-integration-tests.md)
**Objective**: Integration tests for client and user repositories

**Tasks**:

| # | Task | File |
|---|------|------|
| 4.2.1 | Client repository integration tests (10 test cases) | `tests/integration/repositories/client.repo.test.ts` |
| 4.2.2 | User repository integration tests (12 test cases) | `tests/integration/repositories/user.repo.test.ts` |

**Deliverables**:
- [ ] Client repo tests pass: CRUD, client_id uniqueness, secrets, cascade
- [ ] User repo tests pass: CRUD, email uniqueness, CITEXT, status transitions, login tracking

**Verify**: `clear && sleep 3 && yarn test:integration`

### Session 4.3: RBAC & Audit Log Repos

**Reference**: [Integration Tests](05-integration-tests.md)
**Objective**: Integration tests for role, permission, and audit log repositories

**Tasks**:

| # | Task | File |
|---|------|------|
| 4.3.1 | Role repository integration tests (8 test cases) | `tests/integration/repositories/role.repo.test.ts` |
| 4.3.2 | Permission repository integration tests (5 test cases) | `tests/integration/repositories/permission.repo.test.ts` |
| 4.3.3 | Audit log repository integration tests (7 test cases) | `tests/integration/repositories/audit-log.repo.test.ts` |

**Deliverables**:
- [ ] Role tests pass: CRUD, mappings, user-role assignments, cascades
- [ ] Permission tests pass: CRUD, usage check, cascades
- [ ] Audit log tests pass: insert, query with filters, pagination, SET NULL

**Verify**: `clear && sleep 3 && yarn test:integration`

---

## Phase 5: Integration Tests — Adapters & Services

### Session 5.1: OIDC Adapters

**Reference**: [Integration Tests](05-integration-tests.md)
**Objective**: Integration tests for PostgreSQL and Redis OIDC adapters

**Tasks**:

| # | Task | File |
|---|------|------|
| 5.1.1 | PostgreSQL adapter integration tests (8 test cases) | `tests/integration/adapters/postgres-adapter.test.ts` |
| 5.1.2 | Redis adapter integration tests (8 test cases) | `tests/integration/adapters/redis-adapter.test.ts` |

**Deliverables**:
- [ ] Postgres adapter: upsert, find, consume, destroy, revokeByGrantId with real DB
- [ ] Redis adapter: upsert, find, consume, destroy, TTL expiration with real Redis

**Verify**: `clear && sleep 3 && yarn test:integration`

### Session 5.2: Services & Middleware

**Reference**: [Integration Tests](05-integration-tests.md)
**Objective**: Integration tests for config, email, signing key services and tenant resolver

**Tasks**:

| # | Task | File |
|---|------|------|
| 5.2.1 | System config service integration tests (5 test cases) | `tests/integration/services/config.service.test.ts` |
| 5.2.2 | Email service integration tests with MailHog (6 test cases) | `tests/integration/services/email.service.test.ts` |
| 5.2.3 | Signing key service integration tests (4 test cases) | `tests/integration/services/signing-key.service.test.ts` |
| 5.2.4 | Tenant resolver middleware integration tests (6 test cases) | `tests/integration/middleware/tenant-resolver.test.ts` |

**Deliverables**:
- [ ] Config service: get/set from real DB, fallback defaults
- [ ] Email service: emails received in MailHog, correct content
- [ ] Signing keys: generate, rotate, load from real DB
- [ ] Tenant resolver: real DB lookup, Redis caching, status checks

**Verify**: `clear && sleep 3 && yarn test:integration`

---

## Phase 6: E2E Test Infrastructure

### Session 6.1: Server Setup & HTTP Client

**Reference**: [E2E Tests](06-e2e-tests.md)
**Objective**: Create E2E global setup/teardown and HTTP test client

**Tasks**:

| # | Task | File |
|---|------|------|
| 6.1.1 | Create E2E global setup (start real Koa server with OIDC) | `tests/e2e/setup.ts` |
| 6.1.2 | Create HTTP test client (cookie jar, redirects, CSRF) | `tests/e2e/helpers/http-client.ts` |
| 6.1.3 | Create MailHog client (getMessages, getLatestFor, waitForMessage, extractLink, clearAll) | `tests/e2e/helpers/mailhog.ts` |

**Deliverables**:
- [ ] E2E setup starts server on random port, runs migrations, seeds data
- [ ] HTTP client handles cookies, follows redirects, extracts CSRF
- [ ] MailHog client reads and verifies emails

**Verify**: `clear && sleep 3 && yarn test:e2e` (empty suite passes)

### Session 6.2: OIDC Test Client

**Reference**: [E2E Tests](06-e2e-tests.md)
**Objective**: Create OIDC test client helper

**Tasks**:

| # | Task | File |
|---|------|------|
| 6.2.1 | Create OidcTestClient class (auth URLs, PKCE, code exchange) | `tests/e2e/helpers/oidc-client.ts` |
| 6.2.2 | Add token operations (refresh, introspect, revoke, clientCredentials) | `tests/e2e/helpers/oidc-client.ts` |
| 6.2.3 | Add discovery and JWKS methods | `tests/e2e/helpers/oidc-client.ts` |

**Deliverables**:
- [ ] OidcTestClient builds auth URLs with PKCE
- [ ] Code exchange, refresh, introspect, revoke all work
- [ ] Discovery and JWKS methods work

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 7: E2E Tests — OIDC Flows

### Session 7.1: Discovery & Authorization Code Flow

**Reference**: [E2E Tests](06-e2e-tests.md)
**Objective**: Test discovery endpoint and complete auth code + PKCE flow

**Tasks**:

| # | Task | File |
|---|------|------|
| 7.1.1 | Discovery endpoint tests (7 test cases) | `tests/e2e/flows/discovery.test.ts` |
| 7.1.2 | Authorization code + PKCE flow tests (8 test cases) | `tests/e2e/flows/authorization-code.test.ts` |

**Deliverables**:
- [ ] Discovery returns valid OIDC configuration per org
- [ ] Full auth code flow: auth → login → consent → code → tokens

**Verify**: `clear && sleep 3 && yarn test:e2e`

### Session 7.2: Client Credentials & Refresh Token

**Reference**: [E2E Tests](06-e2e-tests.md)
**Objective**: Test client credentials and refresh token rotation flows

**Tasks**:

| # | Task | File |
|---|------|------|
| 7.2.1 | Client credentials flow tests (7 test cases) | `tests/e2e/flows/client-credentials.test.ts` |
| 7.2.2 | Refresh token rotation tests (5 test cases) | `tests/e2e/flows/refresh-token.test.ts` |

**Deliverables**:
- [ ] Client credentials: token issuance, scope restriction, invalid secret
- [ ] Refresh: rotation, old token rejected, sequential refreshes

**Verify**: `clear && sleep 3 && yarn test:e2e`

### Session 7.3: Introspection & Revocation

**Reference**: [E2E Tests](06-e2e-tests.md)
**Objective**: Test token introspection and revocation

**Tasks**:

| # | Task | File |
|---|------|------|
| 7.3.1 | Token introspection tests (5 test cases) | `tests/e2e/flows/token-introspection.test.ts` |
| 7.3.2 | Token revocation tests (4 test cases) | `tests/e2e/flows/token-revocation.test.ts` |

**Deliverables**:
- [ ] Introspection: active, expired, revoked, invalid tokens
- [ ] Revocation: access token, refresh token, idempotent

**Verify**: `clear && sleep 3 && yarn test:e2e`

---

## Phase 8: E2E Tests — Auth Workflows & Invalid Params

### Session 8.1: Password Login & Magic Link

**Reference**: [E2E Tests](06-e2e-tests.md)
**Objective**: Test password login and magic link flows

**Tasks**:

| # | Task | File |
|---|------|------|
| 8.1.1 | Password login flow tests (7 test cases) | `tests/e2e/auth/password-login.test.ts` |
| 8.1.2 | Magic link flow tests (6 test cases) | `tests/e2e/auth/magic-link.test.ts` |

**Deliverables**:
- [ ] Password login: success, invalid password, locked, suspended, CSRF
- [ ] Magic link: email sent via MailHog, click → auth, single-use, expired

**Verify**: `clear && sleep 3 && yarn test:e2e`

### Session 8.2: Forgot Password & Consent

**Reference**: [E2E Tests](06-e2e-tests.md)
**Objective**: Test forgot/reset password and consent flows

**Tasks**:

| # | Task | File |
|---|------|------|
| 8.2.1 | Forgot/reset password flow tests (6 test cases) | `tests/e2e/auth/forgot-password.test.ts` |
| 8.2.2 | Consent flow tests (5 test cases) | `tests/e2e/auth/consent.test.ts` |

**Deliverables**:
- [ ] Reset: email sent, link works, old password invalid, single-use
- [ ] Consent: auto-consent first-party, show for third-party, deny

**Verify**: `clear && sleep 3 && yarn test:e2e`

### Session 8.3: Invalid Parameter Tests

**Reference**: [E2E Tests](06-e2e-tests.md)
**Objective**: Test all invalid parameter / negative path scenarios

**Tasks**:

| # | Task | File |
|---|------|------|
| 8.3.1 | Authorization endpoint invalid params tests (14 test cases) | `tests/e2e/invalid-params/authorization.test.ts` |
| 8.3.2 | Token endpoint invalid params tests (14 test cases) | `tests/e2e/invalid-params/token-exchange.test.ts` |
| 8.3.3 | Consent/interaction invalid params tests (4 test cases) | `tests/e2e/invalid-params/consent-interaction.test.ts` |
| 8.3.4 | Login form invalid params tests (6 test cases) | `tests/e2e/invalid-params/login-form.test.ts` |
| 8.3.5 | Introspection/revocation invalid params tests (5 test cases) | `tests/e2e/invalid-params/introspection-revocation.test.ts` |

**Deliverables**:
- [ ] All invalid parameters return correct OIDC error codes
- [ ] All HTTP status codes match spec requirements

**Verify**: `clear && sleep 3 && yarn test:e2e`

---

## Phase 9: E2E Tests — Multi-tenant & Security

### Session 9.1: Multi-tenant Tests

**Reference**: [E2E Tests](06-e2e-tests.md)
**Objective**: Test multi-tenant isolation and issuer resolution

**Tasks**:

| # | Task | File |
|---|------|------|
| 9.1.1 | Tenant isolation tests (6 test cases) | `tests/e2e/multi-tenant/tenant-isolation.test.ts` |
| 9.1.2 | Issuer resolution tests (4 test cases) | `tests/e2e/multi-tenant/issuer-resolution.test.ts` |

**Deliverables**:
- [ ] Users/clients isolated per org, cross-org auth fails
- [ ] Per-org issuers, different discovery docs, shared JWKS

**Verify**: `clear && sleep 3 && yarn test:e2e`

### Session 9.2: Security E2E Tests

**Reference**: [E2E Tests](06-e2e-tests.md)
**Objective**: Test rate limiting, CSRF, user enumeration prevention

**Tasks**:

| # | Task | File |
|---|------|------|
| 9.2.1 | Rate limiting tests (3 test cases) | `tests/e2e/security/rate-limiting.test.ts` |
| 9.2.2 | CSRF protection tests (4 test cases) | `tests/e2e/security/csrf.test.ts` |
| 9.2.3 | User enumeration prevention tests (3 test cases) | `tests/e2e/security/user-enumeration.test.ts` |

**Deliverables**:
- [ ] Rate limiting enforced on login, magic link, reset
- [ ] CSRF required on all form POSTs
- [ ] Same response for existing/non-existing emails

**Verify**: `clear && sleep 3 && yarn test:e2e`

---

## Phase 10: Pentest Infrastructure & OIDC Attacks

### Session 10.1: Pentest Infrastructure

**Reference**: [Penetration Tests](07-penetration-tests.md)
**Objective**: Create pentest setup/teardown and attack client

**Tasks**:

| # | Task | File |
|---|------|------|
| 10.1.1 | Create pentest global setup (reuse shared server setup) | `tests/pentest/setup.ts` |
| 10.1.2 | Create AttackClient (raw requests, timed requests, concurrent, craftJwt) | `tests/pentest/helpers/attack-client.ts` |

**Deliverables**:
- [ ] `yarn test:pentest` starts server and runs pentest suite
- [ ] AttackClient supports all attack methods

**Verify**: `clear && sleep 3 && yarn test:pentest` (empty suite passes)

### Session 10.2: OIDC Protocol Attacks — Part 1

**Reference**: [Penetration Tests](07-penetration-tests.md)
**Objective**: PKCE bypass and redirect URI manipulation pentests

**Tasks**:

| # | Task | File |
|---|------|------|
| 10.2.1 | PKCE bypass attack tests (7 test cases) | `tests/pentest/oidc-attacks/pkce-bypass.test.ts` |
| 10.2.2 | Redirect URI manipulation tests (10 test cases) | `tests/pentest/oidc-attacks/redirect-uri-manipulation.test.ts` |

**Deliverables**:
- [ ] All PKCE bypass attempts REJECTED
- [ ] All redirect URI manipulation attempts REJECTED

**Verify**: `clear && sleep 3 && yarn test:pentest`

### Session 10.3: OIDC Protocol Attacks — Part 2

**Reference**: [Penetration Tests](07-penetration-tests.md)
**Objective**: Code injection, token substitution, scope escalation, refresh replay

**Tasks**:

| # | Task | File |
|---|------|------|
| 10.3.1 | Authorization code injection tests (5 test cases) | `tests/pentest/oidc-attacks/code-injection.test.ts` |
| 10.3.2 | Token substitution tests (4 test cases) | `tests/pentest/oidc-attacks/token-substitution.test.ts` |
| 10.3.3 | Scope escalation tests (4 test cases) | `tests/pentest/oidc-attacks/scope-escalation.test.ts` |
| 10.3.4 | Refresh token replay tests (4 test cases) | `tests/pentest/oidc-attacks/refresh-token-replay.test.ts` |

**Deliverables**:
- [ ] All code injection attempts REJECTED
- [ ] All token substitution attempts REJECTED
- [ ] All scope escalation attempts REJECTED
- [ ] All refresh replay/race conditions handled safely

**Verify**: `clear && sleep 3 && yarn test:pentest`

---

## Phase 11: Pentests — Auth Bypass, Injection, Crypto

### Session 11.1: Authentication Bypass

**Reference**: [Penetration Tests](07-penetration-tests.md)
**Objective**: SQL injection in auth, brute force, timing attacks, session attacks

**Tasks**:

| # | Task | File |
|---|------|------|
| 11.1.1 | SQL injection in auth flows tests (10 test cases) | `tests/pentest/auth-bypass/sql-injection.test.ts` |
| 11.1.2 | Brute force tests (6 test cases) | `tests/pentest/auth-bypass/brute-force.test.ts` |
| 11.1.3 | Timing attack tests (5 test cases) | `tests/pentest/auth-bypass/timing-attacks.test.ts` |
| 11.1.4 | Session attack tests (4 test cases) | `tests/pentest/auth-bypass/session-attacks.test.ts` |

**Deliverables**:
- [ ] All SQL injection attempts REJECTED (parameterized queries)
- [ ] Brute force rate limited, accounts lock
- [ ] No timing-based information leaks (±20% threshold)
- [ ] Session fixation prevented, cookie flags correct

**Verify**: `clear && sleep 3 && yarn test:pentest`

### Session 11.2: Magic Link Attacks & Injection

**Reference**: [Penetration Tests](07-penetration-tests.md)
**Objective**: Magic link/reset attacks, comprehensive injection tests

**Tasks**:

| # | Task | File |
|---|------|------|
| 11.2.1 | Token prediction tests (4 test cases) | `tests/pentest/magic-link-attacks/token-prediction.test.ts` |
| 11.2.2 | Token replay tests (4 test cases) | `tests/pentest/magic-link-attacks/token-replay.test.ts` |
| 11.2.3 | Host header injection tests (5 test cases) | `tests/pentest/magic-link-attacks/host-header-injection.test.ts` |
| 11.2.4 | Email enumeration tests (6 test cases) | `tests/pentest/magic-link-attacks/email-enumeration.test.ts` |

**Deliverables**:
- [ ] Tokens are cryptographically random, unpredictable
- [ ] Token replay prevented
- [ ] Host header injection doesn't poison URLs
- [ ] No email enumeration possible

**Verify**: `clear && sleep 3 && yarn test:pentest`

### Session 11.3: Injection & Cryptographic Attacks

**Reference**: [Penetration Tests](07-penetration-tests.md)
**Objective**: Comprehensive SQL injection, XSS, header injection, JWT attacks

**Tasks**:

| # | Task | File |
|---|------|------|
| 11.3.1 | Comprehensive SQL injection tests across all inputs (10 test cases) | `tests/pentest/injection/sql-injection-comprehensive.test.ts` |
| 11.3.2 | XSS tests (7 test cases) | `tests/pentest/injection/xss.test.ts` |
| 11.3.3 | Header injection tests (4 test cases) | `tests/pentest/injection/header-injection.test.ts` |
| 11.3.4 | Template injection tests (3 test cases) | `tests/pentest/injection/template-injection.test.ts` |
| 11.3.5 | JWT algorithm confusion tests (5 test cases) | `tests/pentest/crypto-attacks/jwt-algorithm-confusion.test.ts` |
| 11.3.6 | JWT manipulation tests (8 test cases) | `tests/pentest/crypto-attacks/jwt-manipulation.test.ts` |
| 11.3.7 | Key confusion tests (5 test cases) | `tests/pentest/crypto-attacks/key-confusion.test.ts` |

**Deliverables**:
- [ ] All injection attacks REJECTED
- [ ] All XSS attempts HTML-escaped
- [ ] JWT algorithm confusion REJECTED (only ES256)
- [ ] JWT manipulation detected via signature verification
- [ ] Key confusion attacks (jku, x5u, jwk injection) REJECTED

**Verify**: `clear && sleep 3 && yarn test:pentest`

---

## Phase 12: Pentests — Admin, Multi-tenant, Infrastructure

### Session 12.1: Admin API Security

**Reference**: [Penetration Tests](07-penetration-tests.md)
**Objective**: Admin unauthorized access, privilege escalation, IDOR, mass assignment

**Tasks**:

| # | Task | File |
|---|------|------|
| 12.1.1 | Unauthorized access tests (5 test cases) | `tests/pentest/admin-security/unauthorized-access.test.ts` |
| 12.1.2 | Privilege escalation tests (4 test cases) | `tests/pentest/admin-security/privilege-escalation.test.ts` |
| 12.1.3 | IDOR tests (5 test cases) | `tests/pentest/admin-security/idor.test.ts` |
| 12.1.4 | Mass assignment tests (4 test cases) | `tests/pentest/admin-security/mass-assignment.test.ts` |

**Deliverables**:
- [ ] All admin endpoints require authentication (401 without)
- [ ] Privilege escalation impossible
- [ ] IDOR prevented — cross-org access blocked
- [ ] Mass assignment ignored — extra fields stripped

**Verify**: `clear && sleep 3 && yarn test:pentest`

### Session 12.2: Multi-tenant Attacks

**Reference**: [Penetration Tests](07-penetration-tests.md)
**Objective**: Cross-tenant auth, tenant enumeration, slug injection

**Tasks**:

| # | Task | File |
|---|------|------|
| 12.2.1 | Cross-tenant authentication tests (6 test cases) | `tests/pentest/multi-tenant-attacks/cross-tenant-auth.test.ts` |
| 12.2.2 | Tenant enumeration tests (5 test cases) | `tests/pentest/multi-tenant-attacks/tenant-enumeration.test.ts` |
| 12.2.3 | Slug injection tests (6 test cases) | `tests/pentest/multi-tenant-attacks/slug-injection.test.ts` |

**Deliverables**:
- [ ] Cross-tenant authentication impossible
- [ ] Tenant enumeration prevented (no timing leaks)
- [ ] Slug injection (SQL, path traversal, unicode) all REJECTED

**Verify**: `clear && sleep 3 && yarn test:pentest`

### Session 12.3: Infrastructure Security

**Reference**: [Penetration Tests](07-penetration-tests.md)
**Objective**: HTTP headers, CORS, method tampering, information disclosure

**Tasks**:

| # | Task | File |
|---|------|------|
| 12.3.1 | HTTP security headers tests (10 test cases) | `tests/pentest/infrastructure/http-security-headers.test.ts` |
| 12.3.2 | CORS misconfiguration tests (7 test cases) | `tests/pentest/infrastructure/cors-misconfiguration.test.ts` |
| 12.3.3 | HTTP method tampering tests (6 test cases) | `tests/pentest/infrastructure/method-tampering.test.ts` |
| 12.3.4 | Information disclosure tests (8 test cases) | `tests/pentest/infrastructure/information-disclosure.test.ts` |

**Deliverables**:
- [ ] All security headers present and correct
- [ ] CORS properly configured, no wildcard with credentials
- [ ] Method tampering blocked, X-HTTP-Method-Override ignored
- [ ] No stack traces, file paths, or sensitive info in errors

**Verify**: `clear && sleep 3 && yarn test:pentest`

---

## Phase 13: Coverage & Final Verification

### Session 13.1: Coverage Enforcement & Acceptance

**Reference**: [Testing Strategy](08-testing-strategy.md)
**Objective**: Verify coverage thresholds and all acceptance criteria

**Tasks**:

| # | Task | File |
|---|------|------|
| 13.1.1 | Run full test suite with coverage, verify thresholds pass | N/A |
| 13.1.2 | Add email template snapshot tests | `tests/integration/services/email.service.test.ts` |
| 13.1.3 | Verify all 31 acceptance criteria from 01-requirements.md | N/A |
| 13.1.4 | Update .clinerules/project.md with new test structure | `.clinerules/project.md` |

**Deliverables**:
- [ ] Coverage: 80% lines, 80% functions, 75% branches, 80% statements
- [ ] Email template snapshots created
- [ ] All 31 acceptance criteria pass
- [ ] Project documentation updated

**Verify**: `clear && sleep 3 && yarn verify`

---

## Task Checklist (All Phases)

### Phase 1: Test Infrastructure Foundation
- [x] 1.1.1 Rewrite vitest.config.ts with 4 workspace projects ✅ (completed: 2026-04-09 15:50)
- [x] 1.1.2 Create docker/init-test-db.sql ✅ (completed: 2026-04-09 15:50)
- [x] 1.1.3 Update docker-compose.yml to mount init script ✅ (completed: 2026-04-09 15:50)
- [x] 1.1.4 Add test:pentest script, update test scripts ✅ (completed: 2026-04-09 15:50)
- [x] 1.2.1 Add test env vars to .env.example ✅ (completed: 2026-04-09 15:51)
- [x] 1.2.2 Create shared server setup module ✅ (completed: 2026-04-09 15:52)
- [x] 1.2.3 Create shared test constants ✅ (completed: 2026-04-09 15:51)

### Phase 2: Test Data Factories & Fixtures
- [x] 2.1.1 Create factories with randomSuffix, org/app factories ✅ (completed: 2026-04-09 15:53)
- [x] 2.1.2 Add client factory with secret generation ✅ (completed: 2026-04-09 15:53)
- [x] 2.1.3 Add user factory with password hashing ✅ (completed: 2026-04-09 15:53)
- [x] 2.1.4 Add role, permission, claim definition factories ✅ (completed: 2026-04-09 15:53)
- [x] 2.1.5 Add composite createFullTestTenant factory ✅ (completed: 2026-04-09 15:53)
- [x] 2.2.1 Create organization fixtures ✅ (completed: 2026-04-09 15:54)
- [x] 2.2.2 Create user fixtures ✅ (completed: 2026-04-09 15:54)
- [x] 2.2.3 Create client fixtures ✅ (completed: 2026-04-09 15:54)
- [x] 2.2.4 Create application fixtures ✅ (completed: 2026-04-09 15:54)
- [x] 2.2.5 Create RBAC fixtures ✅ (completed: 2026-04-09 15:54)

### Phase 3: Integration Test Infrastructure
- [x] 3.1.1 Create integration global setup ✅ (completed: 2026-04-09 16:15)
- [x] 3.1.2 Create database helpers ✅ (completed: 2026-04-09 16:15)
- [x] 3.1.3 Create Redis helpers ✅ (completed: 2026-04-09 16:15)
- [x] 3.1.4 Refactor existing migrations.test.ts ✅ (completed: 2026-04-09 16:30)

### Phase 4: Integration Tests — Repositories
- [x] 4.1.1 Organization repository integration tests (13 tests) ✅ (completed: 2026-04-09 16:20)
- [x] 4.1.2 Application repository integration tests (8 tests) ✅ (completed: 2026-04-09 16:20)
- [x] 4.2.1 Client repository integration tests (10 tests) ✅ (completed: 2026-04-09 16:20)
- [x] 4.2.2 User repository integration tests (13 tests) ✅ (completed: 2026-04-09 16:20)
- [x] 4.3.1 Role repository integration tests (8 tests) ✅ (completed: 2026-04-09 16:20)
- [x] 4.3.2 Permission repository integration tests (5 tests) ✅ (completed: 2026-04-09 16:20)
- [x] 4.3.3 Audit log repository integration tests (7 tests) ✅ (completed: 2026-04-09 16:20)

### Phase 5: Integration Tests — Adapters & Services
- [x] 5.1.1 PostgreSQL adapter integration tests (8 tests) ✅ (completed: 2026-04-09 17:37)
- [x] 5.1.2 Redis adapter integration tests (9 tests) ✅ (completed: 2026-04-09 17:37)
- [x] 5.2.1 System config service integration tests (6 tests) ✅ (completed: 2026-04-09 17:37)
- [x] 5.2.2 Email service integration tests with MailHog (6 tests) ✅ (completed: 2026-04-09 17:37)
- [x] 5.2.3 Signing key service integration tests (4 tests) ✅ (completed: 2026-04-09 17:37)
- [x] 5.2.4 Tenant resolver middleware integration tests (6 tests) ✅ (completed: 2026-04-09 17:37)

### Phase 6: E2E Test Infrastructure
- [x] 6.1.1 Create E2E global setup ✅ (completed: 2026-04-09 17:37)
- [x] 6.1.2 Create HTTP test client ✅ (completed: 2026-04-09 17:37)
- [x] 6.1.3 Create MailHog client ✅ (completed: 2026-04-09 17:37)
- [x] 6.2.1 Create OidcTestClient (auth URLs, PKCE, code exchange) ✅ (completed: 2026-04-09 17:37)
- [x] 6.2.2 Add token operations ✅ (completed: 2026-04-09 17:37)
- [x] 6.2.3 Add discovery and JWKS methods ✅ (completed: 2026-04-09 17:37)

### Phase 7: E2E Tests — OIDC Flows
- [x] 7.1.1 Discovery endpoint tests (7 tests) ✅ (completed: 2026-04-09 17:37)
- [x] 7.1.2 Authorization code + PKCE flow tests (8 tests) ✅ (completed: 2026-04-09 17:37)
- [x] 7.2.1 Client credentials flow tests (7 tests) ✅ (completed: 2026-04-09 17:37)
- [x] 7.2.2 Refresh token rotation tests (5 tests) ✅ (completed: 2026-04-09 17:37)
- [x] 7.3.1 Token introspection tests (5 tests) ✅ (completed: 2026-04-09 17:37)
- [x] 7.3.2 Token revocation tests (4 tests) ✅ (completed: 2026-04-09 17:37)

### Phase 8: E2E Tests — Auth Workflows & Invalid Params
- [ ] 8.1.1 Password login flow tests
- [ ] 8.1.2 Magic link flow tests
- [ ] 8.2.1 Forgot/reset password flow tests
- [ ] 8.2.2 Consent flow tests
- [ ] 8.3.1 Authorization endpoint invalid params tests
- [ ] 8.3.2 Token endpoint invalid params tests
- [ ] 8.3.3 Consent/interaction invalid params tests
- [ ] 8.3.4 Login form invalid params tests
- [ ] 8.3.5 Introspection/revocation invalid params tests

### Phase 9: E2E Tests — Multi-tenant & Security
- [ ] 9.1.1 Tenant isolation tests
- [ ] 9.1.2 Issuer resolution tests
- [ ] 9.2.1 Rate limiting tests
- [ ] 9.2.2 CSRF protection tests
- [ ] 9.2.3 User enumeration prevention tests

### Phase 10: Pentest Infrastructure & OIDC Attacks
- [ ] 10.1.1 Create pentest global setup
- [ ] 10.1.2 Create AttackClient
- [ ] 10.2.1 PKCE bypass attack tests
- [ ] 10.2.2 Redirect URI manipulation tests
- [ ] 10.3.1 Authorization code injection tests
- [ ] 10.3.2 Token substitution tests
- [ ] 10.3.3 Scope escalation tests
- [ ] 10.3.4 Refresh token replay tests

### Phase 11: Pentests — Auth Bypass, Injection, Crypto
- [ ] 11.1.1 SQL injection in auth flows tests
- [ ] 11.1.2 Brute force tests
- [ ] 11.1.3 Timing attack tests
- [ ] 11.1.4 Session attack tests
- [ ] 11.2.1 Token prediction tests
- [ ] 11.2.2 Token replay tests
- [ ] 11.2.3 Host header injection tests
- [ ] 11.2.4 Email enumeration tests
- [ ] 11.3.1 Comprehensive SQL injection tests
- [ ] 11.3.2 XSS tests
- [ ] 11.3.3 Header injection tests
- [ ] 11.3.4 Template injection tests
- [ ] 11.3.5 JWT algorithm confusion tests
- [ ] 11.3.6 JWT manipulation tests
- [ ] 11.3.7 Key confusion tests

### Phase 12: Pentests — Admin, Multi-tenant, Infrastructure
- [ ] 12.1.1 Unauthorized access tests
- [ ] 12.1.2 Privilege escalation tests
- [ ] 12.1.3 IDOR tests
- [ ] 12.1.4 Mass assignment tests
- [ ] 12.2.1 Cross-tenant authentication tests
- [ ] 12.2.2 Tenant enumeration tests
- [ ] 12.2.3 Slug injection tests
- [ ] 12.3.1 HTTP security headers tests
- [ ] 12.3.2 CORS misconfiguration tests
- [ ] 12.3.3 HTTP method tampering tests
- [ ] 12.3.4 Information disclosure tests

### Phase 13: Coverage & Final Verification
- [ ] 13.1.1 Run full test suite with coverage, verify thresholds
- [ ] 13.1.2 Add email template snapshot tests
- [ ] 13.1.3 Verify all 31 acceptance criteria
- [ ] 13.1.4 Update .clinerules/project.md

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/testing/99-execution-plan.md`"
2. Read the referenced technical spec document

### Ending a Session

1. Run `clear && sleep 3 && yarn verify`
2. Handle commit per the active commit mode
3. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan testing` to continue

---

## Dependencies

```
Phase 1 (Infrastructure Foundation)
    ↓
Phase 2 (Factories & Fixtures)
    ↓
Phase 3 (Integration Infrastructure)
    ↓
Phase 4 (Integration — Repos)  →  Phase 5 (Integration — Adapters & Services)
    ↓
Phase 6 (E2E Infrastructure)
    ↓
Phase 7 (E2E — OIDC Flows)  →  Phase 8 (E2E — Auth & Invalid Params)  →  Phase 9 (E2E — Multi-tenant & Security)
    ↓
Phase 10 (Pentest Infra & OIDC Attacks)  →  Phase 11 (Pentests — Auth/Injection/Crypto)  →  Phase 12 (Pentests — Admin/Tenant/Infra)
    ↓
Phase 13 (Coverage & Final Verification)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All 13 phases completed
2. ✅ All verification passing (`yarn verify`)
3. ✅ All 4 test suites pass independently (unit, integration, e2e, pentest)
4. ✅ Coverage thresholds met (80/80/75/80)
5. ✅ All 31 acceptance criteria verified
6. ✅ No warnings/errors
7. ✅ Documentation updated
8. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
