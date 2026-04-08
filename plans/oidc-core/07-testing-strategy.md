# Testing Strategy: OIDC Provider Core

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

- Unit tests: High coverage for all new modules (adapters, signing keys, system config, configuration, finders, middleware)
- Integration tests: Deferred to later RDs — RD-03 focuses on unit-testable modules with mocked DB/Redis
- E2E tests: Provider endpoint tests deferred to RD-07 (requires login UI) and RD-10 (testing strategy)

### Testing Approach

All RD-03 modules are designed to be **unit-testable with mocked infrastructure**:
- PostgreSQL adapter → mock `getPool()` to return mock query results
- Redis adapter → mock `getRedis()` to return mock Redis client
- System config service → mock `getPool()` for DB queries
- Signing keys → mock `getPool()` for DB queries; pure functions tested directly
- Configuration builder → pure function, no mocks needed
- Tenant resolver → mock DB query; test middleware behavior
- Client/account finders → mock `getPool()`
- CORS → pure function, no mocks needed

## Test Categories

### Unit Tests

#### System Config Service (`tests/unit/lib/system-config.test.ts`)

| Test | Description | Priority |
|------|-------------|----------|
| `getSystemConfigNumber` returns DB value | Query returns valid number, verify parsed correctly | High |
| `getSystemConfigNumber` returns fallback on missing key | Key not in DB, returns fallback | High |
| `getSystemConfigNumber` returns fallback on invalid value | Non-numeric JSONB value, returns fallback | High |
| `getSystemConfigString` returns DB value | Query returns valid string | High |
| `getSystemConfigBoolean` returns true | JSONB boolean true value | High |
| `getSystemConfigBoolean` returns false | JSONB boolean false value | High |
| Cache returns cached value within TTL | Second call within 60s doesn't query DB | High |
| Cache expires after TTL | Call after 60s queries DB again | Medium |
| `clearSystemConfigCache` resets cache | After clear, next call queries DB | Medium |
| `loadOidcTtlConfig` returns all TTL values | All TTL keys loaded correctly | High |
| `loadOidcTtlConfig` uses fallbacks for missing keys | Missing keys return defaults | High |
| Handles DB connection error gracefully | Returns fallback on query failure | Medium |

#### Signing Keys (`tests/unit/lib/signing-keys.test.ts`)

| Test | Description | Priority |
|------|-------------|----------|
| `generateES256KeyPair` produces valid PEM keys | Generated keys are valid PEM format | High |
| `generateES256KeyPair` kid is deterministic for same key | Same public key → same kid | High |
| `generateES256KeyPair` kid differs for different keys | Different keys → different kids | High |
| `generateES256KeyPair` algorithm is ES256 | Algorithm field is 'ES256' | High |
| `pemToJwk` converts PEM to valid JWK | Known PEM → verify JWK fields | High |
| `pemToJwk` includes kid, use, alg | JWK has kid='sig', alg='ES256' | High |
| `pemToJwk` includes private key (d parameter) | JWK has d, x, y, kty, crv | High |
| `signingKeysToJwks` converts multiple records | Array of records → JWK key set | High |
| `signingKeysToJwks` returns empty set for empty input | No records → empty keys array | Medium |
| `loadSigningKeysFromDb` returns records from DB | Mock DB returns rows, verify mapping | High |
| `loadSigningKeysFromDb` excludes revoked keys | Revoked keys not in result | Medium |
| `ensureSigningKeys` loads existing keys | DB has active keys → returns them | High |
| `ensureSigningKeys` generates key when none exist | Empty DB → generates + inserts | High |
| `ensureSigningKeys` logs warning on auto-generation | Verify logger.warn called | Medium |

#### PostgreSQL Adapter (`tests/unit/oidc/postgres-adapter.test.ts`)

| Test | Description | Priority |
|------|-------------|----------|
| `upsert` inserts new payload | Verify INSERT query with correct parameters | High |
| `upsert` calculates expires_at from expiresIn | Verify interval arithmetic | High |
| `upsert` extracts grant_id, user_code, uid from payload | Verify extraction for indexed columns | High |
| `find` returns payload for existing record | DB returns row → payload returned | High |
| `find` returns undefined for missing record | DB returns no rows → undefined | High |
| `find` returns undefined for expired record | Expired record → undefined | High |
| `find` merges consumed_at into payload | consumed_at → consumed field in result | High |
| `findByUserCode` queries by user_code column | Verify correct WHERE clause | Medium |
| `findByUid` queries by uid column | Verify correct WHERE clause | Medium |
| `consume` updates consumed_at to NOW() | Verify UPDATE query | High |
| `destroy` deletes by id and type | Verify DELETE query | High |
| `revokeByGrantId` deletes by grant_id and type | Verify DELETE query | High |
| Constructor sets model name | `this.name` equals constructor argument | Medium |

#### Redis Adapter (`tests/unit/oidc/redis-adapter.test.ts`)

| Test | Description | Priority |
|------|-------------|----------|
| `upsert` sets main key with TTL | Verify SET with EX | High |
| `upsert` sets uid index key when payload has uid | Verify index key creation | High |
| `upsert` sets user_code index key when present | Verify index key creation | Medium |
| `upsert` adds to grant set when payload has grantId | Verify SADD | High |
| `find` returns parsed payload | GET + JSON.parse | High |
| `find` returns undefined for missing key | GET returns null → undefined | High |
| `findByUid` looks up index then main key | Two GET operations | Medium |
| `findByUserCode` looks up index then main key | Two GET operations | Medium |
| `consume` reads, adds consumed timestamp, writes back | GET + SET with remaining TTL | High |
| `destroy` deletes main key | DEL operation | High |
| `revokeByGrantId` deletes all grant members | SMEMBERS + DEL for each | High |
| Key format follows `oidc:{type}:{id}` pattern | Verify key construction | High |

#### Adapter Factory (`tests/unit/oidc/adapter-factory.test.ts`)

| Test | Description | Priority |
|------|-------------|----------|
| Routes Session to RedisAdapter | `new Factory('Session')` uses Redis | High |
| Routes Interaction to RedisAdapter | `new Factory('Interaction')` uses Redis | High |
| Routes AuthorizationCode to RedisAdapter | `new Factory('AuthorizationCode')` uses Redis | High |
| Routes ReplayDetection to RedisAdapter | `new Factory('ReplayDetection')` uses Redis | High |
| Routes ClientCredentials to RedisAdapter | `new Factory('ClientCredentials')` uses Redis | High |
| Routes PushedAuthorizationRequest to RedisAdapter | `new Factory('PushedAuthorizationRequest')` uses Redis | Medium |
| Routes AccessToken to PostgresAdapter | `new Factory('AccessToken')` uses Postgres | High |
| Routes RefreshToken to PostgresAdapter | `new Factory('RefreshToken')` uses Postgres | High |
| Routes Grant to PostgresAdapter | `new Factory('Grant')` uses Postgres | High |
| Routes unknown model to PostgresAdapter | `new Factory('FutureModel')` defaults to Postgres | Medium |
| Factory returns a class constructor | `typeof factory` is function | Medium |

#### Configuration Builder (`tests/unit/oidc/configuration.test.ts`)

| Test | Description | Priority |
|------|-------------|----------|
| Returns valid configuration object | Output has all required fields | High |
| TTL values match input | Input TTLs reflected in output ttl section | High |
| PKCE required for all flows | pkce.required returns true | High |
| PKCE methods is S256 only | pkce.methods is ['S256'] | High |
| Access token format is opaque | formats.AccessToken is 'opaque' | High |
| Scopes include all OIDC standard scopes | openid, profile, email, etc. | High |
| Claims mapping is correct | Standard OIDC claims per scope | High |
| Cookie configuration is secure | httpOnly, signed, sameSite: lax | High |
| Features enabled: introspection, revocation | features.introspection.enabled is true | High |
| Refresh token rotation enabled | rotateRefreshToken is true | Medium |
| Grant types include auth code, client creds, refresh | Three grant types configured | High |
| Response types include code only | responseTypes is ['code'] | Medium |

#### Client Finder (`tests/unit/oidc/client-finder.test.ts`)

| Test | Description | Priority |
|------|-------------|----------|
| Returns client metadata for active client | DB returns row → mapped metadata | High |
| Returns undefined for missing client | No rows → undefined | High |
| Returns undefined for inactive client | Status != active → undefined | High |
| Maps all OIDC fields correctly | redirect_uris, grant_types, etc. | High |

#### Account Finder (`tests/unit/oidc/account-finder.test.ts`)

| Test | Description | Priority |
|------|-------------|----------|
| Returns account for active user | DB returns user → account object | High |
| Returns undefined for missing user | No rows → undefined | High |
| Returns undefined for inactive user | Status != active → undefined | High |
| claims() returns correct standard claims | sub, email, name, etc. | High |
| claims() handles null name fields | Missing given_name/family_name → undefined | Medium |

#### Tenant Resolver (`tests/unit/middleware/tenant-resolver.test.ts`)

| Test | Description | Priority |
|------|-------------|----------|
| Sets organization on ctx.state for valid org | Active org → ctx.state.organization set | High |
| Sets issuer on ctx.state | Active org → ctx.state.issuer set correctly | High |
| Returns 404 for unknown slug | No org found → 404 | High |
| Returns 404 for inactive org | Suspended/archived org → 404 | High |
| Returns 404 for missing slug | No orgSlug param → 404 | Medium |
| Calls next() on success | Valid org → next() called | High |

#### CORS Handler (`tests/unit/oidc/oidc-cors.test.ts`)

| Test | Description | Priority |
|------|-------------|----------|
| Returns true in development mode | nodeEnv=development → always true | High |
| Returns false when no client | No client → false | High |
| Returns true for allowed origin | Origin in client.allowed_origins → true | High |
| Returns false for disallowed origin | Origin not in allowed_origins → false | High |

#### Config Schema (`tests/unit/config.test.ts` — update existing)

| Test | Description | Priority |
|------|-------------|----------|
| Validates cookieKeys array with valid keys | Array of strings ≥16 chars → pass | High |
| Rejects empty cookieKeys array | Empty array → fail | High |
| Rejects cookieKeys with short strings | Strings <16 chars → fail | High |

## Test Data

### Fixtures Needed

- **PEM key pair** — Pre-generated ES256 key pair for deterministic tests
- **OIDC payload** — Sample AccessToken/Session payload for adapter tests
- **Organization record** — `{ id: 'uuid', slug: 'test-org', name: 'Test Org', status: 'active' }`
- **Client record** — Sample client metadata with all OIDC fields
- **User record** — Sample user with OIDC standard claims

### Mock Requirements

- `getPool()` mock — Returns mock Pool with `.query()` method
- `getRedis()` mock — Returns mock Redis client with `get`, `set`, `del`, `sadd`, `smembers`, `pipeline`, `ttl` methods
- `config` mock — Override `issuerBaseUrl`, `nodeEnv`, `cookieKeys` for testing
- `logger` mock — Verify warning/error logging calls

## Test File Structure

```
tests/
└── unit/
    ├── config.test.ts                      # Updated — add cookieKeys tests
    ├── lib/
    │   ├── system-config.test.ts           # System config service tests
    │   └── signing-keys.test.ts            # Signing key management tests
    ├── oidc/
    │   ├── postgres-adapter.test.ts        # PostgreSQL adapter tests
    │   ├── redis-adapter.test.ts           # Redis adapter tests
    │   ├── adapter-factory.test.ts         # Adapter factory routing tests
    │   ├── configuration.test.ts           # Configuration builder tests
    │   ├── client-finder.test.ts           # Client finder tests
    │   ├── account-finder.test.ts          # Account finder tests
    │   └── oidc-cors.test.ts               # CORS handler tests
    └── middleware/
        ├── error-handler.test.ts           # Existing
        ├── request-logger.test.ts          # Existing
        └── tenant-resolver.test.ts         # Tenant resolver tests
```

## Verification Checklist

- [ ] All new unit tests pass
- [ ] Existing tests still pass (error-handler, request-logger, config, migrations)
- [ ] No regressions in existing tests
- [ ] `yarn lint` passes with new files
- [ ] `yarn build` passes (TypeScript compiles)
- [ ] `yarn verify` passes (lint + build + all tests)
- [ ] Test coverage covers all public functions in new modules
