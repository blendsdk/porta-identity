# RD-10: Testing Strategy

> **Document**: RD-10-testing-strategy.md
> **Status**: Draft
> **Created**: 2026-04-08
> **Project**: Porta v5 — OIDC Provider
> **Depends On**: RD-01 (Project Scaffolding), All Domain RDs

---

## Feature Overview

Define and implement the comprehensive testing strategy for Porta v5. This covers unit tests, integration tests, and end-to-end (E2E) tests for all components of the OIDC provider. The testing infrastructure uses Vitest as the test runner, real PostgreSQL and Redis instances for integration tests (via Docker Compose or testcontainers), and HTTP-based E2E tests that exercise complete OIDC flows.

---

## Functional Requirements

### Must Have

- [ ] Vitest configured as the test framework (unit + integration + E2E)
- [ ] Test commands: `yarn test`, `yarn test:unit`, `yarn test:integration`, `yarn test:e2e`
- [ ] Unit tests for all service-layer business logic
- [ ] Integration tests for all database repositories (real PostgreSQL)
- [ ] Integration tests for Redis operations (real Redis)
- [ ] E2E tests for complete OIDC flows (Authorization Code + PKCE, Client Credentials, Refresh Token)
- [ ] E2E tests for all authentication workflows (password login, magic link, forgot/reset password)
- [ ] Test database setup/teardown (isolated per test suite)
- [ ] Test coverage reporting
- [ ] Tests run in CI (Docker-based for DB/Redis)

### Should Have

- [ ] Test coverage goals: 80%+ line coverage for service layer
- [ ] Snapshot tests for email templates (HTML output)
- [ ] Performance benchmarks for critical paths (token issuance, introspection)
- [ ] Test data factories/builders for consistent test data creation
- [ ] Parallel test execution where possible

### Won't Have (Out of Scope)

- Load/stress testing (separate tooling, later)
- Visual regression testing for login pages
- Browser-based E2E testing (Playwright/Cypress) — pages are simple server-rendered forms
- Mutation testing

---

## Technical Requirements

### Test Directory Structure

```
tests/
├── unit/                                # Unit tests (no external dependencies)
│   ├── config/
│   │   └── schema.test.ts              # Config validation
│   ├── organizations/
│   │   └── organization.service.test.ts # Org business logic
│   ├── applications/
│   │   └── application.service.test.ts
│   ├── clients/
│   │   ├── client.service.test.ts
│   │   └── secret.service.test.ts
│   ├── users/
│   │   ├── user.service.test.ts
│   │   └── claims-builder.test.ts      # OIDC claims building
│   ├── auth/
│   │   ├── rate-limiter.test.ts
│   │   ├── token-generator.test.ts
│   │   └── password.test.ts            # Password hashing/verification
│   ├── rbac/
│   │   ├── role.service.test.ts
│   │   ├── permission.service.test.ts
│   │   └── user-role.service.test.ts
│   ├── i18n/
│   │   └── locale-resolver.test.ts
│   └── lib/
│       └── slug.test.ts                # Slug generation/validation
│
├── integration/                         # Integration tests (DB/Redis required)
│   ├── setup.ts                        # DB/Redis connection setup
│   ├── teardown.ts                     # Cleanup
│   ├── helpers/
│   │   ├── database.ts                 # Test DB helpers (truncate, seed)
│   │   ├── factories.ts                # Test data factories
│   │   └── redis.ts                    # Test Redis helpers
│   ├── repositories/
│   │   ├── organization.repo.test.ts
│   │   ├── application.repo.test.ts
│   │   ├── client.repo.test.ts
│   │   ├── user.repo.test.ts
│   │   ├── role.repo.test.ts
│   │   ├── permission.repo.test.ts
│   │   └── audit-log.repo.test.ts
│   ├── adapters/
│   │   ├── postgres-adapter.test.ts    # OIDC provider Postgres adapter
│   │   └── redis-adapter.test.ts       # OIDC provider Redis adapter
│   ├── services/
│   │   ├── config.service.test.ts      # System config (DB-backed)
│   │   ├── email.service.test.ts       # Email delivery (SMTP to MailHog)
│   │   └── signing-key.service.test.ts # Key management
│   └── middleware/
│       └── tenant-resolver.test.ts     # Tenant resolution with real DB
│
├── e2e/                                 # End-to-end tests (full HTTP flows)
│   ├── setup.ts                        # Start test server, seed data
│   ├── teardown.ts                     # Stop server, cleanup
│   ├── helpers/
│   │   ├── http-client.ts             # HTTP client for OIDC requests
│   │   ├── oidc-client.ts            # OIDC client helper (builds auth URLs, exchanges codes)
│   │   └── mailhog.ts                # MailHog API client (read emails)
│   ├── flows/
│   │   ├── authorization-code.test.ts  # Complete auth code + PKCE flow
│   │   ├── client-credentials.test.ts  # Client credentials flow
│   │   ├── refresh-token.test.ts       # Refresh token rotation
│   │   ├── token-introspection.test.ts # Token introspection
│   │   ├── token-revocation.test.ts    # Token revocation
│   │   └── discovery.test.ts           # OIDC discovery endpoint
│   ├── auth/
│   │   ├── password-login.test.ts      # Password login flow
│   │   ├── magic-link.test.ts          # Magic link login flow
│   │   ├── forgot-password.test.ts     # Forgot/reset password flow
│   │   └── consent.test.ts            # Consent flow
│   ├── multi-tenant/
│   │   ├── tenant-isolation.test.ts    # Users/clients isolated per org
│   │   ├── issuer-resolution.test.ts   # Per-org OIDC issuer
│   │   └── branding.test.ts           # Per-org branding on login pages
│   └── security/
│       ├── rate-limiting.test.ts       # Rate limit enforcement
│       ├── csrf.test.ts               # CSRF protection
│       └── user-enumeration.test.ts   # No user enumeration
│
└── fixtures/                            # Shared test fixtures
    ├── organizations.ts                # Test org data
    ├── applications.ts                 # Test app/module data
    ├── clients.ts                      # Test client data
    ├── users.ts                       # Test user data
    └── roles-permissions.ts           # Test RBAC data
```

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',

    // Test file patterns
    include: ['tests/**/*.test.ts'],

    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/cli/**',                   // CLI tested via integration
        'src/types/**',                 // Type definitions only
        'src/**/index.ts',              // Re-exports
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },

    // Timeouts
    testTimeout: 10000,                  // 10s for unit tests
    hookTimeout: 30000,                  // 30s for setup/teardown

    // Workspaces for different test types
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/integration/setup.ts'],
          testTimeout: 30000,
          poolOptions: { threads: { singleThread: true } }, // Sequential for DB
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/e2e/setup.ts'],
          testTimeout: 60000,
          poolOptions: { threads: { singleThread: true } }, // Sequential
        },
      },
    ],
  },
});
```

### Test Infrastructure

#### Test Database

```typescript
// tests/integration/helpers/database.ts

// Each integration test suite gets a clean database
export async function setupTestDatabase(): Promise<Pool> {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

  // Run all migrations
  await runMigrations(pool);

  return pool;
}

export async function truncateAllTables(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      audit_log, custom_claim_values, custom_claim_definitions,
      user_roles, role_permissions, permissions, roles,
      magic_link_tokens, password_reset_tokens,
      client_secrets, clients, users,
      application_modules, applications, organizations,
      oidc_payloads, signing_keys, system_config
    CASCADE
  `);
}

export async function seedTestData(pool: Pool): Promise<TestData> {
  // Insert base test data and return references
  const superAdminOrg = await insertOrg(pool, { name: 'Test Admin', slug: 'test-admin', isSuperAdmin: true });
  const testOrg = await insertOrg(pool, { name: 'Test Org', slug: 'test-org' });
  const testApp = await insertApp(pool, { name: 'Test App', slug: 'test-app' });
  // ... more seed data
  return { superAdminOrg, testOrg, testApp, /* ... */ };
}
```

#### Test Data Factories

```typescript
// tests/fixtures/factories.ts

export function buildOrganization(overrides?: Partial<CreateOrganizationInput>): CreateOrganizationInput {
  return {
    name: `Test Org ${randomSuffix()}`,
    slug: `test-org-${randomSuffix()}`,
    defaultLocale: 'en',
    ...overrides,
  };
}

export function buildUser(orgId: string, overrides?: Partial<CreateUserInput>): CreateUserInput {
  return {
    organizationId: orgId,
    email: `user-${randomSuffix()}@test.example.com`,
    givenName: 'Test',
    familyName: 'User',
    ...overrides,
  };
}

export function buildClient(orgId: string, appId: string, overrides?: Partial<CreateClientInput>): CreateClientInput {
  return {
    organizationId: orgId,
    applicationId: appId,
    clientName: `Test Client ${randomSuffix()}`,
    clientType: 'confidential',
    applicationType: 'web',
    redirectUris: ['http://localhost:3001/callback'],
    ...overrides,
  };
}
```

#### E2E Test Server

```typescript
// tests/e2e/setup.ts

export async function setup() {
  // 1. Start Docker services (if not already running)
  // 2. Set up test database
  // 3. Run migrations
  // 4. Seed base data
  // 5. Start Koa server on random port
  // 6. Export server URL for test use

  const port = await getRandomPort();
  const server = await startServer({ port, databaseUrl: testDbUrl, redisUrl: testRedisUrl });

  process.env.TEST_SERVER_URL = `http://localhost:${port}`;
  return server;
}

export async function teardown(server: Server) {
  await server.close();
  await truncateAllTables(pool);
  await pool.end();
}
```

#### OIDC Test Helper

```typescript
// tests/e2e/helpers/oidc-client.ts

export class OidcTestClient {
  constructor(
    private baseUrl: string,
    private orgSlug: string,
    private clientId: string,
    private clientSecret?: string,
  ) {}

  // Build authorization URL with PKCE
  buildAuthorizationUrl(options?: { scope?: string; state?: string }): {
    url: string;
    codeVerifier: string;
    codeChallenge: string;
    state: string;
    nonce: string;
  } { /* ... */ }

  // Exchange authorization code for tokens
  async exchangeCode(code: string, codeVerifier: string): Promise<TokenSet> { /* ... */ }

  // Refresh tokens
  async refreshToken(refreshToken: string): Promise<TokenSet> { /* ... */ }

  // Introspect token
  async introspect(token: string): Promise<IntrospectionResult> { /* ... */ }

  // Revoke token
  async revoke(token: string): Promise<void> { /* ... */ }

  // Client credentials
  async clientCredentials(scope?: string): Promise<TokenSet> { /* ... */ }

  // Get discovery document
  async discovery(): Promise<DiscoveryDocument> { /* ... */ }
}
```

#### MailHog Test Helper

```typescript
// tests/e2e/helpers/mailhog.ts

export class MailHogClient {
  constructor(private baseUrl: string = 'http://localhost:8025') {}

  // Get all messages
  async getMessages(): Promise<MailHogMessage[]> { /* ... */ }

  // Get latest message for a recipient
  async getLatestFor(email: string): Promise<MailHogMessage | null> { /* ... */ }

  // Extract link from email body (magic link, reset link)
  extractLink(message: MailHogMessage, pattern: RegExp): string | null { /* ... */ }

  // Clear all messages
  async clearAll(): Promise<void> { /* ... */ }
}
```

### Test Categories & Coverage

#### Unit Tests

| Module | Key Test Cases | Priority |
|--------|---------------|----------|
| Config validation | Valid/invalid env vars, defaults, type coercion | High |
| Slug generation | Valid slugs, reserved words, uniqueness, edge cases | High |
| Password hashing | Hash + verify, wrong password, empty password | High |
| Token generation | Format, length, hash consistency | High |
| Claims builder | Scope-to-claims mapping, address structured, updated_at timestamp | High |
| Rate limiter logic | Window tracking, limit enforcement, reset | High |
| Locale resolver | Priority chain, fallbacks, invalid locales | Medium |
| Redirect URI validation | HTTPS enforcement, localhost exception, custom schemes | Medium |
| Permission slug format | Valid/invalid formats, reserved names | Medium |
| Claim type validation | String, number, boolean, JSON validation | Medium |

#### Integration Tests

| Module | Key Test Cases | Priority |
|--------|---------------|----------|
| Organization repo | CRUD, slug uniqueness, super-admin constraint, status transitions | High |
| User repo | CRUD, email uniqueness per org, case-insensitive email | High |
| Client repo | CRUD, client_id uniqueness, secret verification | High |
| OIDC Postgres adapter | Upsert, find, consume, destroy, revokeByGrantId | High |
| OIDC Redis adapter | Same operations with TTL | High |
| Config service | Get/set from DB, fallback to defaults | High |
| Signing key service | Generate, rotate, load active keys | Medium |
| Email service | Send via SMTP to MailHog, template rendering | Medium |
| Audit log repo | Insert, query with filters, pagination | Medium |
| Rate limiter (Redis) | Increment, window expiry, reset | Medium |

#### E2E Tests

| Flow | Key Test Cases | Priority |
|------|---------------|----------|
| Authorization Code + PKCE | Complete flow, invalid code_verifier, expired code | Critical |
| Client Credentials | Valid credentials, invalid secret, revoked client | Critical |
| Token Introspection | Active token, expired token, revoked token | Critical |
| Token Revocation | Access token, refresh token | High |
| Refresh Token Rotation | Valid refresh, old refresh rejected after rotation | High |
| Password Login | Success, invalid password, locked account, suspended account | High |
| Magic Link Login | Send link, click link, expired link, used link | High |
| Forgot/Reset Password | Request reset, use link, expired link, password updated | High |
| Discovery | Correct endpoints per org, different issuers | High |
| Tenant Isolation | User in org A can't auth via org B's issuer | High |
| Rate Limiting | Login rate limit, magic link rate limit | Medium |
| CSRF Protection | Form submission without token rejected | Medium |
| User Enumeration | Same response for existing/non-existing email | Medium |
| Custom Claims | Claims appear in ID token, access token, userinfo correctly | Medium |
| RBAC in Tokens | Roles and permissions appear in token claims | Medium |
| Consent Flow | First-party auto-consent, third-party shows consent page | Medium |

### Test Environment Variables

```
TEST_DATABASE_URL=postgresql://porta:porta_dev@localhost:5432/porta_test
TEST_REDIS_URL=redis://localhost:6379/1
TEST_SMTP_HOST=localhost
TEST_SMTP_PORT=1025
TEST_MAILHOG_URL=http://localhost:8025
```

### Docker Compose for Tests

The existing Docker Compose (RD-01) includes all services needed for testing. Integration and E2E tests use the same services with a separate test database:

```yaml
# Additional test database (added to docker-compose)
services:
  postgres:
    # ...existing config...
    # Test database created via init script
    volumes:
      - ./docker/init-test-db.sql:/docker-entrypoint-initdb.d/init-test-db.sql

# docker/init-test-db.sql
# CREATE DATABASE porta_test;
```

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Test framework | Jest, Vitest, Mocha | Vitest | Fast, TypeScript-native, compatible API |
| Test DB | In-memory mock, testcontainers, Docker Compose | Docker Compose (shared services) | Simple, already available, real PostgreSQL |
| Test isolation | Transactions, truncate, separate DBs | Truncate between suites | Simple, reliable, fast enough |
| E2E approach | Browser (Playwright), HTTP client, supertest | HTTP client (direct) | OIDC flows are HTTP-based, no browser needed for backend |
| Email testing | Mock, MailHog, Ethereal | MailHog (via Docker) | Real SMTP, web UI for debugging, API for assertions |
| Coverage tool | c8, v8, istanbul | v8 (via Vitest) | Built-in, fast, accurate |

---

## Acceptance Criteria

1. [ ] `yarn test` runs all tests and exits cleanly
2. [ ] `yarn test:unit` runs only unit tests (no DB/Redis needed)
3. [ ] `yarn test:integration` runs integration tests with real DB/Redis
4. [ ] `yarn test:e2e` runs E2E tests with full server
5. [ ] Test coverage report is generated
6. [ ] Coverage meets thresholds (80% lines, 80% functions)
7. [ ] E2E: Complete Authorization Code + PKCE flow passes
8. [ ] E2E: Complete Client Credentials flow passes
9. [ ] E2E: Complete password login flow passes
10. [ ] E2E: Complete magic link flow passes (email verified via MailHog)
11. [ ] E2E: Complete forgot/reset password flow passes
12. [ ] E2E: Token introspection and revocation work
13. [ ] E2E: Multi-tenant isolation verified
14. [ ] Integration: All repository tests pass with real PostgreSQL
15. [ ] Integration: OIDC adapter tests pass
16. [ ] Unit: All service-layer logic tested
17. [ ] Test data factories produce consistent, valid data
18. [ ] Tests are parallelizable where appropriate (unit tests)
19. [ ] Tests clean up after themselves (no leftover data)
