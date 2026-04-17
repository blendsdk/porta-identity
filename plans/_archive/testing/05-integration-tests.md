# Integration Tests: Testing Strategy

> **Document**: 05-integration-tests.md
> **Parent**: [Index](00-index.md)

## Overview

Integration tests verify that Porta's modules work correctly with real PostgreSQL and Redis instances. Unlike unit tests (which mock repositories and cache), integration tests execute actual SQL queries and Redis commands against Docker-managed services. This validates that SQL is correct, constraints work, indexes are used, and cache operations behave as expected.

## Architecture

### Test Structure

```
tests/integration/
├── setup.ts                        # Global setup (DB connect, migrate)
├── teardown.ts                     # Global teardown (cleanup)
├── helpers/
│   ├── database.ts                 # truncateAllTables, seedBaseData
│   ├── factories.ts                # Test data factories (see 04-factories-fixtures.md)
│   └── redis.ts                    # flushTestRedis
├── repositories/                   # Repository CRUD tests (real PostgreSQL)
│   ├── organization.repo.test.ts
│   ├── application.repo.test.ts
│   ├── client.repo.test.ts
│   ├── user.repo.test.ts
│   ├── role.repo.test.ts
│   ├── permission.repo.test.ts
│   └── audit-log.repo.test.ts
├── adapters/                       # OIDC provider adapter tests
│   ├── postgres-adapter.test.ts
│   └── redis-adapter.test.ts
├── services/                       # Service tests requiring infrastructure
│   ├── config.service.test.ts
│   ├── email.service.test.ts
│   └── signing-key.service.test.ts
└── middleware/
    └── tenant-resolver.test.ts
```

### Test Pattern

Every integration test file follows this pattern:

```typescript
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import { createTestOrganization, ... } from '../helpers/factories.js';

describe('Module Name (Integration)', () => {
  // Clean slate before each test to ensure isolation
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData(); // Re-insert system config, super-admin org
    await flushTestRedis();
  });

  it('should perform operation correctly', async () => {
    // Arrange: create test data via factories
    const org = await createTestOrganization();
    
    // Act: call real repository/service function
    const result = await findOrganizationById(org.id);
    
    // Assert: verify against real DB result
    expect(result).toBeDefined();
    expect(result!.name).toBe(org.name);
  });
});
```

---

## Implementation Details

### Repository Integration Tests

#### Organization Repository (`organization.repo.test.ts`)

| # | Test Case | What It Verifies |
|---|-----------|-----------------|
| 1 | Insert and retrieve by ID | Basic CRUD, UUID generation, field mapping |
| 2 | Insert and retrieve by slug | Slug lookup works correctly |
| 3 | Slug uniqueness constraint | Duplicate slug throws DB error |
| 4 | Super-admin uniqueness constraint | Only one super-admin org allowed |
| 5 | Update organization fields | Partial update (name, locale, branding) |
| 6 | Update status transitions | active → suspended → active, active → archived |
| 7 | List with pagination | Offset/limit, total count |
| 8 | List with status filter | Filter by active/suspended/archived |
| 9 | List with search | Full-text search on name/slug |
| 10 | List with sort | Sort by name, created_at (asc/desc) |
| 11 | slugExists check | Returns true/false, excludeId works |
| 12 | findSuperAdminOrganization | Returns the super-admin org from seed |

#### Application Repository (`application.repo.test.ts`)

| # | Test Case | What It Verifies |
|---|-----------|-----------------|
| 1 | Insert and retrieve by ID | Basic CRUD, org reference |
| 2 | Insert and retrieve by slug | Slug lookup |
| 3 | Slug uniqueness per org | Same slug in different orgs is OK, same org is not |
| 4 | Update application fields | Partial update (name, description) |
| 5 | List applications by org | Filtered by organization |
| 6 | List with pagination | Offset/limit, total count |
| 7 | Application modules CRUD | Add module, list modules, remove module |
| 8 | Cascade delete | Deleting org removes its applications |

#### Client Repository (`client.repo.test.ts`)

| # | Test Case | What It Verifies |
|---|-----------|-----------------|
| 1 | Insert and retrieve by ID | Basic CRUD, all fields |
| 2 | Insert and retrieve by clientId | client_id lookup (used by OIDC) |
| 3 | client_id uniqueness | Duplicate client_id throws error |
| 4 | Update client fields | Partial update (name, redirectUris, status) |
| 5 | List clients by org | Filtered by organization |
| 6 | List clients by app | Filtered by application |
| 7 | Client secret CRUD | Insert secret hash, list secrets, revoke secret |
| 8 | Secret verification | Argon2 verify against stored hash |
| 9 | Cascade delete | Deleting org removes clients and secrets |
| 10 | Revoked client not findable | Revoked status filtering |

#### User Repository (`user.repo.test.ts`)

| # | Test Case | What It Verifies |
|---|-----------|-----------------|
| 1 | Insert and retrieve by ID | Basic CRUD, UUID generation |
| 2 | Insert and retrieve by email | Case-insensitive email lookup (CITEXT) |
| 3 | Email uniqueness per org | Same email in different orgs is OK |
| 4 | Email case insensitivity | `User@Test.com` matches `user@test.com` |
| 5 | Update user fields | Partial update (name, status, emailVerified) |
| 6 | Update password hash | Password update, verify old hash cleared |
| 7 | List users by org | Filtered, paginated |
| 8 | List with search | Search by name/email |
| 9 | List with status filter | Filter by active/suspended/locked/archived |
| 10 | Login tracking | Update lastLoginAt, increment loginCount |
| 11 | Status transitions | All 6 valid transitions work, invalid ones don't |
| 12 | Cascade delete | Deleting org removes users |

#### Role Repository (`role.repo.test.ts`)

| # | Test Case | What It Verifies |
|---|-----------|-----------------|
| 1 | Insert and retrieve by ID | Basic CRUD |
| 2 | Slug uniqueness per app | Same slug in different apps is OK |
| 3 | List roles by app | Filtered, paginated |
| 4 | Role-permission mapping | Assign permission to role, verify mapping |
| 5 | Remove role-permission | Unassign permission |
| 6 | User-role assignment | Assign role to user in org context |
| 7 | List user roles | Get all roles for a user in an org |
| 8 | Cascade: delete role removes mappings | FK cascade |

#### Permission Repository (`permission.repo.test.ts`)

| # | Test Case | What It Verifies |
|---|-----------|-----------------|
| 1 | Insert and retrieve by ID | Basic CRUD |
| 2 | Slug uniqueness per app | Constraint enforcement |
| 3 | List permissions by app | Filtered, paginated |
| 4 | Check permission in use | Returns true if assigned to any role |
| 5 | Cascade: delete app removes permissions | FK cascade |

#### Audit Log Repository (`audit-log.repo.test.ts`)

| # | Test Case | What It Verifies |
|---|-----------|-----------------|
| 1 | Insert audit log entry | Basic insert, auto-generated ID and timestamp |
| 2 | Query by entity type | Filter audit logs by entity |
| 3 | Query by entity ID | Filter by specific entity |
| 4 | Query by action | Filter by create/update/delete |
| 5 | Query with date range | Filter by timestamp range |
| 6 | Pagination | Offset/limit, total count |
| 7 | User deletion sets null | ON DELETE SET NULL on user_id |

---

### OIDC Adapter Integration Tests

#### PostgreSQL Adapter (`postgres-adapter.test.ts`)

Tests the OIDC PostgreSQL adapter against real PostgreSQL. This adapter handles long-lived OIDC artifacts (AccessToken, RefreshToken, Grant).

| # | Test Case | What It Verifies |
|---|-----------|-----------------|
| 1 | Upsert and find (AccessToken) | Insert + retrieve by ID |
| 2 | Upsert and find (RefreshToken) | Insert + retrieve by ID |
| 3 | Upsert and find (Grant) | Insert + retrieve by ID |
| 4 | Consume token | Sets consumedAt, subsequent find shows consumed |
| 5 | Destroy by ID | Deletes record, find returns undefined |
| 6 | Revoke by grantId | All tokens for a grant are removed |
| 7 | Find non-existent | Returns undefined |
| 8 | Upsert replaces existing | Second upsert overwrites payload |

#### Redis Adapter (`redis-adapter.test.ts`)

Tests the OIDC Redis adapter against real Redis. This adapter handles short-lived artifacts (Session, Interaction, AuthorizationCode, etc.).

| # | Test Case | What It Verifies |
|---|-----------|-----------------|
| 1 | Upsert and find (Session) | Insert + retrieve with TTL |
| 2 | Upsert and find (Interaction) | Insert + retrieve with TTL |
| 3 | Upsert and find (AuthorizationCode) | Insert + retrieve with TTL |
| 4 | Consume code | Sets consumedAt flag |
| 5 | Destroy by ID | Key removed from Redis |
| 6 | Revoke by grantId | All keys for grant removed |
| 7 | TTL expiration | Key expires after TTL (use short TTL in test) |
| 8 | Find non-existent | Returns undefined |

---

### Service Integration Tests

#### System Config Service (`config.service.test.ts`)

| # | Test Case | What It Verifies |
|---|-----------|-----------------|
| 1 | Get config value from DB | Read seeded config values |
| 2 | Set config value | Insert/update in DB, verify read-back |
| 3 | Get with default fallback | Missing key returns default |
| 4 | List all config values | Returns all key-value pairs |
| 5 | Cache invalidation | After set, cached value is updated |

#### Email Service (`email.service.test.ts`)

Tests email sending against real SMTP (MailHog). Verifies emails are actually delivered and have correct content.

| # | Test Case | What It Verifies |
|---|-----------|-----------------|
| 1 | Send magic link email | Email received in MailHog, contains magic link URL |
| 2 | Send password reset email | Email received, contains reset URL |
| 3 | Send invitation email | Email received, contains invitation URL |
| 4 | Email HTML rendering | Template rendered with correct variables |
| 5 | Email from address | Uses configured SMTP_FROM |
| 6 | Email to correct recipient | Delivered to specified email address |

**MailHog verification pattern:**
```typescript
import { MailHogClient } from '../../e2e/helpers/mailhog.js';

const mailhog = new MailHogClient();

it('should send magic link email', async () => {
  await mailhog.clearAll();
  await sendMagicLinkEmail('user@test.com', 'http://localhost/magic/token123');
  
  const message = await mailhog.getLatestFor('user@test.com');
  expect(message).toBeDefined();
  expect(message!.subject).toContain('Magic Link');
  expect(message!.body).toContain('http://localhost/magic/token123');
});
```

#### Signing Key Service (`signing-key.service.test.ts`)

| # | Test Case | What It Verifies |
|---|-----------|-----------------|
| 1 | Generate ES256 key pair | Key generated, stored in DB as PEM |
| 2 | Load active keys | Returns JWKS with active keys |
| 3 | Rotate keys | New key generated, old key still available |
| 4 | Key format | PEM ↔ JWK conversion works correctly |

---

### Middleware Integration Tests

#### Tenant Resolver (`tenant-resolver.test.ts`)

Tests tenant resolution with real database and Redis cache.

| # | Test Case | What It Verifies |
|---|-----------|-----------------|
| 1 | Resolve active org by slug | Returns org from DB, caches in Redis |
| 2 | Resolve from cache (second request) | Returns cached org without DB query |
| 3 | Suspended org returns 403 | Proper status-based rejection |
| 4 | Archived org returns 404 | Proper status-based rejection |
| 5 | Non-existent slug returns 404 | Proper error for unknown tenant |
| 6 | Cache invalidation on update | After org update, cache is refreshed |

---

### Refactoring Existing Migration Tests

The existing `tests/integration/migrations.test.ts` will be refactored to:
1. Remove its own DB connection logic (use the global setup instead)
2. Use `TEST_DATABASE_URL` instead of `DATABASE_URL`
3. Remove the `requireDb()` skip pattern (global setup handles availability check)
4. Keep all existing test cases (schema structure, constraints, cascades, triggers, seed data)

---

## Error Handling

| Error Case | Handling Strategy |
|------------|-------------------|
| Table doesn't exist (migration not run) | Global setup runs all migrations — should not occur |
| FK constraint violation in test data | Factories create entities in correct dependency order |
| Unique constraint violation | Factories use randomSuffix() — should not collide |
| Redis timeout | Test Redis uses same Docker service, 30s timeout |
| Pool exhaustion | Single-threaded execution prevents parallel pool access |

## Testing Requirements

- All repository functions tested with real PostgreSQL
- All OIDC adapter operations tested with real PostgreSQL and Redis
- Email delivery verified via MailHog API
- Tests isolated via truncation between suites
- No data leakage between tests
- Estimated: ~80-100 integration test cases
