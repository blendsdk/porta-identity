# Testing Strategy: Application & Client Management

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

- Unit tests: 90%+ coverage for all new modules
- Integration tests: Deferred to RD-10 (Testing Strategy)
- E2E tests: Deferred to RD-10

### Baseline

- **Current test count**: 348 tests passing across 23 test files
- **Expected new tests**: ~170-185 tests across ~14 new test files
- **Expected total**: ~520-535 tests

### Test Patterns

All tests follow established patterns from the organization module:
- `vi.mock()` for module-level mocking
- `mockPool()` helper for PostgreSQL mocking
- `describe/it/expect` structure with `beforeEach` for mock reset
- Test descriptions: `"should [behavior] when [condition]"`

## Test Categories

### Application Module Tests

#### types.test.ts (~5 tests)

| Test | Description | Priority |
|------|-------------|----------|
| `mapRowToApplication` — maps all fields correctly | Converts snake_case row to camelCase object | High |
| `mapRowToApplication` — maps null description | Handles nullable description field | High |
| `mapRowToModule` — maps all fields correctly | Converts module row to camelCase object | High |
| `mapRowToModule` — maps null description | Handles nullable description field | Medium |
| `mapRowToModule` — casts status correctly | Status string to ModuleStatus type | Medium |

#### slugs.test.ts (~15 tests)

| Test | Description | Priority |
|------|-------------|----------|
| `generateSlug` — converts name to slug | "Business Suite" → "business-suite" | High |
| `generateSlug` — handles special characters | Strips non-alphanumeric chars | High |
| `generateSlug` — handles multiple spaces | Collapses consecutive hyphens | High |
| `generateSlug` — trims leading/trailing hyphens | Clean slug output | High |
| `generateSlug` — handles unicode | Handles accented characters | Medium |
| `generateSlug` — returns empty for empty input | Edge case | Medium |
| `validateSlug` — accepts valid slug | Returns isValid: true | High |
| `validateSlug` — rejects too short | Less than 3 chars | High |
| `validateSlug` — rejects too long | More than 100 chars | High |
| `validateSlug` — rejects uppercase | Must be lowercase | High |
| `validateSlug` — rejects spaces | Must use hyphens | High |
| `validateSlug` — rejects starting with hyphen | Invalid format | Medium |
| `validateSlug` — rejects ending with hyphen | Invalid format | Medium |
| `validateSlug` — rejects reserved words | admin, api, system, etc. | High |
| `validateSlug` — accepts non-reserved words | Normal slug | High |

#### repository.test.ts (~15 tests)

| Test | Description | Priority |
|------|-------------|----------|
| `insertApplication` — inserts and returns mapped | Correct SQL and mapping | High |
| `findApplicationById` — returns mapped application | Found by UUID | High |
| `findApplicationById` — returns null when not found | No rows | High |
| `findApplicationBySlug` — returns mapped application | Found by slug | High |
| `findApplicationBySlug` — returns null when not found | No rows | High |
| `updateApplication` — builds dynamic SET clause | Partial update | High |
| `updateApplication` — throws when not found | No rows returned | High |
| `updateApplication` — throws when no fields | Empty update data | Medium |
| `listApplications` — returns paginated results | Correct pagination | High |
| `listApplications` — filters by status | WHERE clause | High |
| `listApplications` — searches by name/slug | ILIKE clause | High |
| `slugExists` — returns true when exists | Slug taken | High |
| `slugExists` — returns false when not exists | Slug available | High |
| `insertModule` — inserts and returns mapped module | Correct SQL | High |
| `listModules` — returns all modules for app | Filtered by app ID | High |

#### cache.test.ts (~8 tests)

| Test | Description | Priority |
|------|-------------|----------|
| `getCachedApplicationBySlug` — returns cached value | Cache hit | High |
| `getCachedApplicationBySlug` — returns null on miss | Cache miss | High |
| `getCachedApplicationById` — returns cached value | Cache hit | High |
| `getCachedApplicationById` — returns null on miss | Cache miss | High |
| `cacheApplication` — stores under both keys | slug + id keys | High |
| `invalidateApplicationCache` — deletes both keys | Cleanup | High |
| Date deserialization — restores Date objects | createdAt, updatedAt | High |
| Redis error — returns null (graceful degradation) | Error handling | Medium |

#### service.test.ts (~25 tests)

| Test | Description | Priority |
|------|-------------|----------|
| `createApplication` — creates with generated slug | Happy path | High |
| `createApplication` — creates with provided slug | Custom slug | High |
| `createApplication` — throws on invalid slug | Validation error | High |
| `createApplication` — throws on taken slug | Uniqueness check | High |
| `createApplication` — caches after creation | Cache integration | High |
| `createApplication` — writes audit log | Audit integration | High |
| `getApplicationById` — returns from cache on hit | Cache-first | High |
| `getApplicationById` — falls back to DB on miss | DB fallback | High |
| `getApplicationBySlug` — returns from cache on hit | Cache-first | High |
| `getApplicationBySlug` — returns null when not found | Not found | High |
| `updateApplication` — updates and re-caches | Happy path | High |
| `updateApplication` — throws on not found | Error handling | High |
| `updateApplication` — writes audit log | Audit integration | High |
| `archiveApplication` — archives active app | Status transition | High |
| `archiveApplication` — throws on already archived | Invalid transition | High |
| `activateApplication` — activates inactive app | Status transition | High |
| `activateApplication` — throws if not inactive | Invalid transition | High |
| `deactivateApplication` — deactivates active app | Status transition | High |
| `deactivateApplication` — throws if not active | Invalid transition | High |
| `listApplications` — delegates to repository | Passthrough | Medium |
| `createModule` — validates app exists | Dependency check | High |
| `createModule` — validates slug unique within app | Namespaced check | High |
| `createModule` — writes audit log | Audit integration | High |
| `updateModule` — updates and writes audit | Happy path | High |
| `deactivateModule` — deactivates and writes audit | Status change | High |

### Client Module Tests

#### types.test.ts (~6 tests)

| Test | Description | Priority |
|------|-------------|----------|
| `mapRowToClient` — maps all fields correctly | Full client mapping | High |
| `mapRowToClient` — handles TEXT[] arrays | redirect_uris, grant_types | High |
| `mapRowToClient` — handles null allowed_origins | Nullable arrays | Medium |
| `mapRowToClientSecret` — maps all fields | Full secret mapping | High |
| `mapRowToClientSecret` — handles null dates | expires_at, last_used_at | High |
| `mapRowToClientSecret` — never includes hash | Security check | High |

#### crypto.test.ts (~10 tests)

| Test | Description | Priority |
|------|-------------|----------|
| `generateClientId` — returns base64url string | Format check | High |
| `generateClientId` — returns ~43 char string | Length check (32 bytes) | High |
| `generateClientId` — returns unique values | No duplicates | High |
| `generateSecret` — returns base64url string | Format check | High |
| `generateSecret` — returns ~64 char string | Length check (48 bytes) | High |
| `generateSecret` — returns unique values | No duplicates | High |
| `hashSecret` — returns argon2id hash string | Starts with $argon2id$ | High |
| `hashSecret` — produces different hashes for same input | Salt uniqueness | High |
| `verifySecretHash` — returns true for matching | Correct verification | High |
| `verifySecretHash` — returns false for non-matching | Incorrect secret | High |

#### validators.test.ts (~18 tests)

| Test | Description | Priority |
|------|-------------|----------|
| `validateRedirectUri` — accepts HTTPS URL | Standard case | High |
| `validateRedirectUri` — rejects HTTP in production | Security enforcement | High |
| `validateRedirectUri` — allows HTTP localhost in prod | Dev exception | High |
| `validateRedirectUri` — allows HTTP localhost in dev | Dev mode | Medium |
| `validateRedirectUri` — allows HTTP 127.0.0.1 | Loopback variant | Medium |
| `validateRedirectUri` — rejects fragments (#) | OIDC security rule | High |
| `validateRedirectUri` — rejects wildcards in path | Security rule | High |
| `validateRedirectUri` — accepts custom URI scheme | Native apps | High |
| `validateRedirectUri` — rejects invalid URL | Malformed input | High |
| `validateRedirectUris` — validates all URIs | Batch validation | High |
| `validateRedirectUris` — rejects when over max | Max 10 URIs | Medium |
| `validateRedirectUris` — returns all errors | Comprehensive validation | Medium |
| `getDefaultGrantTypes` — confidential web | auth_code + refresh + client_cred | High |
| `getDefaultGrantTypes` — public spa | auth_code + refresh | High |
| `getDefaultGrantTypes` — public native | auth_code + refresh | High |
| `getDefaultTokenEndpointAuthMethod` — confidential | client_secret_basic | High |
| `getDefaultTokenEndpointAuthMethod` — public | none | High |
| `validateRedirectUri` — allows localhost with port | Port varies for native | Medium |

#### repository.test.ts (~12 tests)

| Test | Description | Priority |
|------|-------------|----------|
| `insertClient` — inserts and returns mapped client | Happy path | High |
| `findClientById` — returns mapped client | Found by UUID | High |
| `findClientById` — returns null when not found | No rows | High |
| `findClientByClientId` — returns mapped client | Found by OIDC client_id | High |
| `findClientByClientId` — returns null when not found | No rows | High |
| `updateClient` — builds dynamic SET clause | Partial update | High |
| `updateClient` — throws when not found | No rows returned | High |
| `listClients` — returns paginated results | Correct pagination | High |
| `listClients` — filters by organizationId | WHERE clause | High |
| `listClients` — filters by applicationId | WHERE clause | High |
| `listClients` — filters by status | WHERE clause | High |
| `listClients` — searches by client_name | ILIKE clause | Medium |

#### secret-repository.test.ts (~10 tests)

| Test | Description | Priority |
|------|-------------|----------|
| `insertSecret` — inserts and returns row | Includes hash | High |
| `findSecretById` — returns row | Found by UUID | High |
| `findSecretById` — returns null when not found | No rows | High |
| `listSecretsByClient` — returns all secrets | Including revoked | High |
| `listActiveSecrets` — returns only active non-expired | Filtered query | High |
| `listActiveSecrets` — excludes expired secrets | Expiry check | High |
| `listActiveSecrets` — excludes revoked secrets | Status check | High |
| `revokeSecret` — sets status to revoked | Status update | High |
| `updateLastUsedAt` — updates timestamp | Time tracking | High |
| `cleanupExpiredSecrets` — returns deleted count | Cleanup utility | Medium |

#### cache.test.ts (~8 tests)

| Test | Description | Priority |
|------|-------------|----------|
| `getCachedClientByClientId` — returns cached value | Cache hit | High |
| `getCachedClientByClientId` — returns null on miss | Cache miss | High |
| `getCachedClientById` — returns cached value | Cache hit | High |
| `getCachedClientById` — returns null on miss | Cache miss | High |
| `cacheClient` — stores under both keys | client_id + id keys | High |
| `invalidateClientCache` — deletes both keys | Cleanup | High |
| Date deserialization — restores Date objects | createdAt, updatedAt | High |
| Redis error — returns null (graceful degradation) | Error handling | Medium |

#### service.test.ts (~22 tests)

| Test | Description | Priority |
|------|-------------|----------|
| `createClient` — creates confidential client with secret | Returns ClientWithSecret | High |
| `createClient` — creates public client without secret | secret is null | High |
| `createClient` — generates random client_id | Not UUID, base64url | High |
| `createClient` — validates org exists and active | Dependency check | High |
| `createClient` — validates app exists and active | Dependency check | High |
| `createClient` — validates redirect URIs | Security validation | High |
| `createClient` — applies default grant types | Based on type combo | High |
| `createClient` — applies default auth method | Based on client type | High |
| `createClient` — caches after creation | Cache integration | High |
| `createClient` — writes audit log | Audit integration | High |
| `getClientById` — cache-first lookup | Cache hit path | High |
| `getClientById` — falls back to DB | Cache miss path | High |
| `getClientByClientId` — cache-first by OIDC id | Cache hit path | High |
| `updateClient` — updates and re-caches | Happy path | High |
| `updateClient` — throws on not found | Error handling | High |
| `revokeClient` — revokes active client | Status change | High |
| `revokeClient` — throws if already revoked | Validation error | High |
| `deactivateClient` — deactivates active client | Status change | High |
| `activateClient` — activates inactive client | Status change | High |
| `listClientsByOrganization` — filters by org | Passthrough | Medium |
| `listClientsByApplication` — filters by app | Passthrough | Medium |
| `findForOidc` — returns OIDC metadata format | Metadata mapping | High |

#### secret-service.test.ts (~15 tests)

| Test | Description | Priority |
|------|-------------|----------|
| `generateAndStore` — generates, hashes, stores | Full flow | High |
| `generateAndStore` — returns plaintext | Shown once | High |
| `generateAndStore` — writes audit log | Audit integration | High |
| `generateAndStore` — applies optional label | Label storage | Medium |
| `generateAndStore` — applies optional expiry | Expiry date | Medium |
| `revoke` — revokes active secret | Status change | High |
| `revoke` — throws if already revoked | Validation error | High |
| `revoke` — throws if not found | Not found error | High |
| `revoke` — writes audit log | Audit integration | High |
| `listByClient` — returns secrets without hashes | Security | High |
| `listActiveByClient` — returns only active non-expired | Filtered | High |
| `verify` — returns true for matching secret | Argon2id verify | High |
| `verify` — returns false for non-matching | Failed verify | High |
| `verify` — updates last_used_at on match | Time tracking | High |
| `verify` — returns false when no active secrets | Empty list | Medium |

### Route Tests

#### routes/applications.test.ts (~15 tests)

| Test | Description | Priority |
|------|-------------|----------|
| POST / — creates application (201) | Happy path | High |
| POST / — validates required fields (400) | Zod validation | High |
| GET / — lists applications | Paginated response | High |
| GET /:id — returns application (200) | Found | High |
| GET /:id — returns 404 for unknown | Not found | High |
| PUT /:id — updates application | Partial update | High |
| PUT /:id — validates body (400) | Zod validation | High |
| POST /:id/archive — archives (204) | Status action | High |
| POST /:id/activate — activates (204) | Status action | High |
| POST /:id/deactivate — deactivates (204) | Status action | High |
| POST /:id/modules — creates module (201) | Nested create | High |
| GET /:id/modules — lists modules | Nested list | High |
| PUT /:id/modules/:moduleId — updates module | Nested update | High |
| POST /:id/modules/:moduleId/deactivate — deactivates (204) | Nested action | High |
| Requires super-admin — rejects 403 | Auth check | High |

#### routes/clients.test.ts (~18 tests)

| Test | Description | Priority |
|------|-------------|----------|
| POST / — creates confidential client with secret (201) | Happy path | High |
| POST / — creates public client without secret (201) | No secret | High |
| POST / — validates required fields (400) | Zod validation | High |
| POST / — validates redirect URIs (400) | URI validation | High |
| GET / — lists clients | Paginated response | High |
| GET / — filters by organizationId | Query param | High |
| GET /:id — returns client (200) | Found | High |
| GET /:id — returns 404 for unknown | Not found | High |
| PUT /:id — updates client | Partial update | High |
| POST /:id/revoke — revokes (204) | Status action | High |
| POST /:id/activate — activates (204) | Status action | High |
| POST /:id/deactivate — deactivates (204) | Status action | High |
| POST /:id/secrets — generates secret (201) | Returns plaintext | High |
| POST /:id/secrets — includes plaintext warning | Security UX | High |
| GET /:id/secrets — lists secrets | Without hashes | High |
| POST /:id/secrets/:secretId/revoke — revokes (204) | Secret action | High |
| Requires super-admin — rejects 403 | Auth check | High |
| ApplicationNotFoundError → 400 | Error mapping | High |

## Test Data

### Fixtures Needed

```typescript
// Application test fixture
const testApplication = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'BusinessSuite',
  slug: 'business-suite',
  description: 'All-in-one business platform',
  status: 'active',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

// Client test fixture
const testClient = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  organizationId: '550e8400-e29b-41d4-a716-446655440000',
  applicationId: '550e8400-e29b-41d4-a716-446655440001',
  clientId: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  clientName: 'Acme Web App',
  clientType: 'confidential',
  applicationType: 'web',
  redirectUris: ['https://acme.example.com/callback'],
  postLogoutRedirectUris: ['https://acme.example.com/logout'],
  grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
  responseTypes: ['code'],
  scope: 'openid profile email',
  tokenEndpointAuthMethod: 'client_secret_basic',
  allowedOrigins: ['https://acme.example.com'],
  requirePkce: true,
  status: 'active',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};
```

### Mock Requirements

- `vi.mock('../lib/database.js')` — Mock `getPool()` returning `mockPool()`
- `vi.mock('../lib/redis.js')` — Mock `getRedis()` returning mock Redis client
- `vi.mock('../lib/audit-log.js')` — Mock `writeAuditLog()` (fire-and-forget)
- `vi.mock('argon2')` — Mock `hash()` and `verify()` for crypto tests
- `vi.mock('../clients/crypto.js')` — Mock crypto functions in service tests
- `vi.mock('../applications/service.js')` — Mock app service in client service tests
- `vi.mock('../organizations/service.js')` — Mock org service in client service tests

## Verification Checklist

- [ ] All new unit tests pass
- [ ] No regressions in existing 348 tests
- [ ] Full `yarn verify` passes (lint + build + test)
- [ ] Test coverage meets 90%+ for new modules
- [ ] All public functions have corresponding tests
- [ ] Error paths tested (not just happy paths)
