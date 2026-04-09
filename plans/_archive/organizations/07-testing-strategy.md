# Testing Strategy: Organization Management

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

- Unit tests: 90%+ coverage for all new modules
- Every public function has multiple test cases (happy path + edge cases + errors)
- All tests are pure unit tests — no Docker/external services required

### Estimated Test Count

| Module                          | Tests | File                                            |
|---------------------------------|-------|-------------------------------------------------|
| Slug utilities                  | ~15   | `tests/unit/organizations/slugs.test.ts`        |
| Type mapping                    | ~5    | `tests/unit/organizations/types.test.ts`        |
| Repository                      | ~15   | `tests/unit/organizations/repository.test.ts`   |
| Cache                           | ~12   | `tests/unit/organizations/cache.test.ts`        |
| Audit log                       | ~6    | `tests/unit/lib/audit-log.test.ts`              |
| Service                         | ~25   | `tests/unit/organizations/service.test.ts`      |
| Super-admin middleware           | ~5    | `tests/unit/middleware/super-admin.test.ts`      |
| Tenant resolver (updated)       | ~10   | `tests/unit/middleware/tenant-resolver.test.ts`  |
| Route handlers                  | ~15   | `tests/unit/routes/organizations.test.ts`        |
| **Total**                       | **~108** |                                              |

## Test Categories

### Unit Tests

All tests use mocking for external dependencies (database, Redis) and test
business logic in isolation.

#### Slug Utilities (tests/unit/organizations/slugs.test.ts)

| Test                                          | Description                              | Priority |
|-----------------------------------------------|------------------------------------------|----------|
| generateSlug — normal name                    | "Acme Corp" → "acme-corp"               | High     |
| generateSlug — special characters             | "Café & Bar!!" → "caf-bar"              | High     |
| generateSlug — consecutive hyphens            | Collapses to single hyphen               | High     |
| generateSlug — leading/trailing hyphens       | Trimmed                                  | High     |
| generateSlug — unicode                        | Strips non-ascii                         | Medium   |
| generateSlug — very long name                 | Truncated to 100 chars                   | Medium   |
| generateSlug — empty string                   | Returns empty string                     | Medium   |
| validateSlug — valid slug                     | Returns `{ isValid: true }`              | High     |
| validateSlug — too short (<3)                 | Returns error                            | High     |
| validateSlug — too long (>100)                | Returns error                            | Medium   |
| validateSlug — reserved word "admin"          | Returns error                            | High     |
| validateSlug — reserved word "api"            | Returns error                            | High     |
| validateSlug — invalid chars (uppercase)      | Returns error                            | High     |
| validateSlug — leading hyphen                 | Returns error                            | Medium   |
| validateSlug — trailing hyphen                | Returns error                            | Medium   |
| RESERVED_SLUGS — contains expected words      | All key words present                    | Low      |

#### Type Mapping (tests/unit/organizations/types.test.ts)

| Test                                          | Description                              | Priority |
|-----------------------------------------------|------------------------------------------|----------|
| mapRowToOrganization — full row               | All fields correctly mapped              | High     |
| mapRowToOrganization — null branding fields   | Null preserved correctly                 | High     |
| mapRowToOrganization — status coercion        | String → OrganizationStatus              | Medium   |
| mapRowToOrganization — date types             | Date objects preserved                   | Medium   |
| mapRowToOrganization — super admin flag       | Boolean mapped correctly                 | Medium   |

#### Repository (tests/unit/organizations/repository.test.ts)

| Test                                          | Description                              | Priority |
|-----------------------------------------------|------------------------------------------|----------|
| insertOrganization — success                  | Correct INSERT SQL + params              | High     |
| insertOrganization — returns mapped org       | Row → Organization mapping               | High     |
| findOrganizationById — found                  | Returns mapped org                       | High     |
| findOrganizationById — not found              | Returns null                             | High     |
| findOrganizationBySlug — found                | Returns mapped org                       | High     |
| findOrganizationBySlug — not found            | Returns null                             | High     |
| findOrganizationBySlug — any status           | Does NOT filter by status                | High     |
| updateOrganization — partial update           | Builds correct dynamic SQL               | High     |
| updateOrganization — not found                | Throws error                             | High     |
| listOrganizations — pagination                | Correct LIMIT/OFFSET                     | High     |
| listOrganizations — status filter             | Adds WHERE clause                        | Medium   |
| listOrganizations — search filter             | Adds ILIKE clause                        | Medium   |
| listOrganizations — sort                      | Correct ORDER BY                         | Medium   |
| findSuperAdminOrganization — found            | Returns super-admin org                  | Medium   |
| slugExists — exists                           | Returns true                             | High     |
| slugExists — not exists                       | Returns false                            | High     |
| slugExists — with excludeId                   | Excludes given ID                        | Medium   |

#### Cache (tests/unit/organizations/cache.test.ts)

| Test                                          | Description                              | Priority |
|-----------------------------------------------|------------------------------------------|----------|
| getCachedOrganizationBySlug — hit             | Returns deserialized org                 | High     |
| getCachedOrganizationBySlug — miss            | Returns null                             | High     |
| getCachedOrganizationBySlug — invalid JSON    | Returns null, logs warning               | Medium   |
| getCachedOrganizationById — hit               | Returns deserialized org                 | High     |
| getCachedOrganizationById — miss              | Returns null                             | High     |
| cacheOrganization — stores both keys          | Sets slug + id keys                      | High     |
| cacheOrganization — correct TTL               | 300 second expiry                        | High     |
| cacheOrganization — Date serialization        | Dates → ISO strings → Dates             | High     |
| invalidateOrganizationCache — deletes keys    | Removes slug + id keys                   | High     |
| Redis error on get — returns null             | Graceful degradation                     | High     |
| Redis error on set — does not throw           | Graceful degradation                     | Medium   |
| Redis error on delete — does not throw        | Graceful degradation                     | Medium   |

#### Audit Log (tests/unit/lib/audit-log.test.ts)

| Test                                          | Description                              | Priority |
|-----------------------------------------------|------------------------------------------|----------|
| writeAuditLog — success all fields            | Correct INSERT SQL + all params          | High     |
| writeAuditLog — minimal fields                | Only required fields                     | High     |
| writeAuditLog — metadata as JSONB             | JSON serialized correctly                | Medium   |
| writeAuditLog — null optional fields          | Null for missing user/actor/IP           | Medium   |
| writeAuditLog — DB error                      | Logs warning, does NOT throw             | High     |
| writeAuditLog — returns void                  | No return value                          | Low      |

#### Service (tests/unit/organizations/service.test.ts)

| Test                                          | Description                              | Priority |
|-----------------------------------------------|------------------------------------------|----------|
| createOrganization — auto-slug                | Generates slug from name                 | High     |
| createOrganization — custom slug              | Uses provided slug                       | High     |
| createOrganization — invalid slug             | Throws validation error                  | High     |
| createOrganization — slug taken               | Throws error                             | High     |
| createOrganization — caches result            | Calls cacheOrganization                  | Medium   |
| createOrganization — writes audit log         | Calls writeAuditLog with org.created     | Medium   |
| getOrganizationById — cache hit               | Returns cached, no DB query              | High     |
| getOrganizationById — cache miss              | Queries DB, caches result                | High     |
| getOrganizationById — not found               | Returns null                             | High     |
| getOrganizationBySlug — cache hit             | Returns cached                           | High     |
| getOrganizationBySlug — cache miss            | Queries DB, caches result                | High     |
| updateOrganization — success                  | Updates via repo, invalidates cache      | High     |
| updateOrganization — not found                | Throws error                             | High     |
| updateOrganization — writes audit log         | Calls writeAuditLog with org.updated     | Medium   |
| updateBranding — success                      | Updates branding fields                  | High     |
| updateBranding — writes audit log             | Calls with org.branding.updated          | Medium   |
| suspendOrganization — success                 | Status → suspended, audit logged         | High     |
| suspendOrganization — super-admin rejected    | Throws error                             | High     |
| suspendOrganization — already suspended       | Throws error                             | Medium   |
| activateOrganization — success                | Status → active, audit logged            | High     |
| activateOrganization — not suspended          | Throws error                             | Medium   |
| archiveOrganization — success                 | Status → archived, audit logged          | High     |
| archiveOrganization — super-admin rejected    | Throws error                             | High     |
| restoreOrganization — success                 | Status → active, audit logged            | High     |
| restoreOrganization — not archived            | Throws error                             | Medium   |
| listOrganizations — delegates to repo         | Passes options through                   | Medium   |
| validateSlugAvailability — valid + available  | Returns `{ isValid: true }`              | High     |
| validateSlugAvailability — invalid format     | Returns error                            | High     |
| validateSlugAvailability — taken              | Returns error                            | High     |

#### Super-Admin Middleware (tests/unit/middleware/super-admin.test.ts)

| Test                                          | Description                              | Priority |
|-----------------------------------------------|------------------------------------------|----------|
| Allows super-admin org                        | Calls next()                             | High     |
| Rejects non-super-admin org                   | Throws 403                               | High     |
| Rejects missing organization                  | Throws 403                               | High     |
| Rejects null isSuperAdmin                     | Throws 403                               | Medium   |
| Next called exactly once                      | No double-call                           | Medium   |

#### Enhanced Tenant Resolver (tests/unit/middleware/tenant-resolver.test.ts)

Updated tests to cover the new caching and status differentiation:

| Test                                          | Description                              | Priority |
|-----------------------------------------------|------------------------------------------|----------|
| Active org — cache hit                        | Returns cached org, no DB query          | High     |
| Active org — cache miss                       | Queries DB, caches result, returns org   | High     |
| Suspended org — returns 403                   | "Organization is suspended"              | High     |
| Archived org — returns 404                    | "Organization not found"                 | High     |
| Not found — returns 404                       | No org in DB or cache                    | High     |
| Missing orgSlug — returns 404                 | No slug in params                        | High     |
| Sets full Organization on ctx.state           | All fields present                       | High     |
| Sets issuer on ctx.state                      | Correct URL format                       | High     |
| Redis error — falls back to DB                | Graceful degradation                     | High     |
| Calls next() on success                       | Middleware chain continues               | Medium   |

#### Route Handlers (tests/unit/routes/organizations.test.ts)

| Test                                          | Description                              | Priority |
|-----------------------------------------------|------------------------------------------|----------|
| POST / — valid input → 201                    | Creates org, returns data                | High     |
| POST / — invalid input → 400                  | Zod validation error                     | High     |
| POST / — slug taken → 400                     | Service throws validation error          | High     |
| GET / — pagination defaults                   | Returns paginated list                   | High     |
| GET / — with status filter                    | Filters by status                        | Medium   |
| GET /:id — found → 200                        | Returns org data                         | High     |
| GET /:id — not found → 404                    | Returns error                            | High     |
| PUT /:id — valid → 200                        | Updates and returns org                  | High     |
| PUT /:id — not found → 404                    | Service throws not found                 | Medium   |
| PUT /:id/branding — valid → 200               | Updates branding                         | High     |
| POST /:id/suspend → 204                       | Suspends org                             | High     |
| POST /:id/activate → 204                      | Activates org                            | High     |
| POST /:id/archive → 204                       | Archives org                             | High     |
| POST /:id/restore → 204                       | Restores org                             | High     |
| GET /validate-slug — valid slug               | Returns `{ isValid: true }`              | High     |

## Test Data

### Fixtures Needed

```typescript
// Standard test organization
const testOrg: Organization = {
  id: 'org-uuid-1',
  name: 'Acme Corporation',
  slug: 'acme-corporation',
  status: 'active',
  isSuperAdmin: false,
  brandingLogoUrl: null,
  brandingFaviconUrl: null,
  brandingPrimaryColor: '#3B82F6',
  brandingCompanyName: 'Acme Corp',
  brandingCustomCss: null,
  defaultLocale: 'en',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

// Super-admin organization (from seed)
const superAdminOrg: Organization = {
  id: 'super-uuid',
  name: 'Porta Admin',
  slug: 'porta-admin',
  status: 'active',
  isSuperAdmin: true,
  brandingLogoUrl: null,
  brandingFaviconUrl: null,
  brandingPrimaryColor: null,
  brandingCompanyName: 'Porta',
  brandingCustomCss: null,
  defaultLocale: 'en',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};
```

### Mock Requirements

- `getPool()` — Mock PostgreSQL pool with `query()` method (existing pattern)
- `getRedis()` — Mock Redis client with `get()`, `set()`, `del()` methods
- `writeAuditLog()` — Mock in service tests to verify audit calls
- Organization cache functions — Mock in service tests
- Organization repository functions — Mock in service tests
- Organization service functions — Mock in route tests

## Verification Checklist

- [ ] All unit tests pass (`yarn test:unit`)
- [ ] No regressions in existing tests (227 tests still pass)
- [ ] Full verify passes (`yarn verify` — lint + build + all tests)
- [ ] New test count: ~108 additional tests (total ~335)
- [ ] All public functions have doc comments
- [ ] All complex logic has explanatory comments
