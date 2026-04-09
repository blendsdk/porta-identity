# Adapters: OIDC Provider Core

> **Document**: 04-adapters.md
> **Parent**: [Index](00-index.md)

## Overview

This document specifies the PostgreSQL adapter, Redis adapter, and hybrid adapter factory for `node-oidc-provider`. The adapters implement the provider's storage interface for OIDC artifacts (tokens, sessions, grants, interactions, etc.).

## Architecture

### Hybrid Adapter Strategy

Short-lived, high-throughput artifacts are stored in Redis for performance. Long-lived artifacts that need persistence across Redis restarts go to PostgreSQL.

| Model Name | Storage | TTL | Rationale |
|------------|---------|-----|-----------|
| `Session` | Redis | 24h | Frequently accessed, short-lived |
| `Interaction` | Redis | 1h | Very short-lived (login flow) |
| `AuthorizationCode` | Redis | 10min | Short-lived, high throughput |
| `ReplayDetection` | Redis | varies | Performance-critical duplicate detection |
| `ClientCredentials` | Redis | 1h | Short-lived M2M tokens |
| `PushedAuthorizationRequest` | Redis | 1h | Short-lived PAR requests |
| `AccessToken` | PostgreSQL | 1h | Needs introspection after Redis TTL |
| `RefreshToken` | PostgreSQL | 30d | Long-lived, must survive restarts |
| `Grant` | PostgreSQL | 30d | Long-lived grant records |
| `DeviceCode` | PostgreSQL | 10min | Not used but required by interface |
| `BackchannelAuthenticationRequest` | PostgreSQL | varies | Not used but falls to default |
| (any other) | PostgreSQL | varies | Default: PostgreSQL for persistence |

### Adapter Interface

`node-oidc-provider` requires adapters to implement these methods:

```typescript
interface AdapterPayload {
  [key: string]: unknown;
  // Standard fields set by the provider:
  accountId?: string;
  clientId?: string;
  grantId?: string;
  iat?: number;
  exp?: number;
  uid?: string;
  userCode?: string;
  jti?: string;
  kind?: string;
  consumed?: number | boolean;
}

interface Adapter {
  upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void>;
  find(id: string): Promise<AdapterPayload | undefined>;
  findByUserCode(userCode: string): Promise<AdapterPayload | undefined>;
  findByUid(uid: string): Promise<AdapterPayload | undefined>;
  consume(id: string): Promise<void>;
  destroy(id: string): Promise<void>;
  revokeByGrantId(grantId: string): Promise<void>;
}
```

Each adapter instance is created per-model: `new Adapter('AccessToken')`, `new Adapter('Session')`, etc.

## Implementation Details

### PostgreSQL Adapter (`src/oidc/postgres-adapter.ts`)

Stores OIDC artifacts in the `oidc_payloads` table using parameterized queries.

```typescript
/**
 * PostgreSQL adapter for node-oidc-provider.
 *
 * Stores long-lived OIDC artifacts (AccessToken, RefreshToken, Grant)
 * in the oidc_payloads table. Uses parameterized queries to prevent
 * SQL injection.
 *
 * Table schema (from migration 010):
 *   id          VARCHAR(255) NOT NULL
 *   type        VARCHAR(50) NOT NULL — model name
 *   payload     JSONB NOT NULL
 *   grant_id    VARCHAR(255)
 *   user_code   VARCHAR(255)
 *   uid         VARCHAR(255)
 *   expires_at  TIMESTAMPTZ
 *   consumed_at TIMESTAMPTZ
 *   PRIMARY KEY (id, type)
 */
export class PostgresAdapter {
  protected name: string; // Model name (e.g., 'AccessToken')

  constructor(name: string);

  /**
   * Create or update an OIDC artifact.
   * Uses INSERT ... ON CONFLICT to handle both create and update.
   * Extracts grant_id, user_code, uid from payload for indexed lookups.
   */
  async upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void>;

  /**
   * Find an artifact by its ID.
   * Checks expires_at — returns undefined if expired.
   */
  async find(id: string): Promise<AdapterPayload | undefined>;

  /**
   * Find an artifact by user code (device flow).
   * Not actively used in Porta but required by the adapter interface.
   */
  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined>;

  /**
   * Find an artifact by UID (sessions).
   */
  async findByUid(uid: string): Promise<AdapterPayload | undefined>;

  /**
   * Mark an artifact as consumed.
   * Sets consumed_at to NOW(). Used for authorization code replay detection.
   */
  async consume(id: string): Promise<void>;

  /**
   * Delete an artifact by ID.
   */
  async destroy(id: string): Promise<void>;

  /**
   * Revoke all artifacts associated with a grant.
   * Deletes all rows where grant_id matches.
   */
  async revokeByGrantId(grantId: string): Promise<void>;
}
```

**SQL query patterns:**

```sql
-- upsert
INSERT INTO oidc_payloads (id, type, payload, grant_id, user_code, uid, expires_at)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (id, type)
DO UPDATE SET payload = $3, grant_id = $4, user_code = $5, uid = $6, expires_at = $7;

-- find
SELECT payload, consumed_at FROM oidc_payloads
WHERE id = $1 AND type = $2 AND (expires_at IS NULL OR expires_at > NOW());

-- findByUserCode
SELECT payload, consumed_at FROM oidc_payloads
WHERE user_code = $1 AND type = $2 AND (expires_at IS NULL OR expires_at > NOW());

-- findByUid
SELECT payload, consumed_at FROM oidc_payloads
WHERE uid = $1 AND type = $2 AND (expires_at IS NULL OR expires_at > NOW());

-- consume
UPDATE oidc_payloads SET consumed_at = NOW() WHERE id = $1 AND type = $2;

-- destroy
DELETE FROM oidc_payloads WHERE id = $1 AND type = $2;

-- revokeByGrantId
DELETE FROM oidc_payloads WHERE grant_id = $1 AND type = $2;
```

**Key implementation notes:**
- `expires_at` is calculated as `NOW() + expiresIn seconds` using PostgreSQL interval arithmetic
- When returning payload, merge `consumed_at` into the payload as `consumed` (epoch timestamp) — this is what `node-oidc-provider` expects
- The `type` column is always set to `this.name` (the model name)
- Use `getPool()` from `src/lib/database.ts` — never create a separate connection

### Redis Adapter (`src/oidc/redis-adapter.ts`)

Stores short-lived OIDC artifacts in Redis using key prefixes.

```typescript
/**
 * Redis adapter for node-oidc-provider.
 *
 * Stores short-lived OIDC artifacts (Session, Interaction, AuthorizationCode,
 * ReplayDetection, ClientCredentials) in Redis with automatic expiry via TTL.
 *
 * Key patterns:
 *   oidc:{type}:{id}           — Primary key
 *   oidc:{type}:uid:{uid}      — UID index (sessions)
 *   oidc:{type}:user_code:{uc} — User code index (device flow)
 *   oidc:{type}:grant:{grantId} — Grant ID set (for revocation)
 */
export class RedisAdapter {
  protected name: string; // Model name (e.g., 'Session')

  constructor(name: string);

  /**
   * Store an artifact in Redis with TTL.
   * Sets the main key and any index keys (uid, userCode, grantId).
   */
  async upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void>;

  /**
   * Find an artifact by ID.
   * Returns undefined if not found (TTL expired).
   */
  async find(id: string): Promise<AdapterPayload | undefined>;

  /** Find by user code — looks up the index key first, then the main key. */
  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined>;

  /** Find by UID — looks up the index key first, then the main key. */
  async findByUid(uid: string): Promise<AdapterPayload | undefined>;

  /** Mark as consumed — updates the payload with consumed timestamp. */
  async consume(id: string): Promise<void>;

  /** Delete an artifact and its index keys. */
  async destroy(id: string): Promise<void>;

  /** Revoke all artifacts for a grant — deletes all keys in the grant set. */
  async revokeByGrantId(grantId: string): Promise<void>;
}
```

**Redis key strategy:**

```
# Main key — stores the full payload as JSON
oidc:Session:abc123 → {"accountId":"...","exp":...}

# UID index — maps UID to the primary key ID (for findByUid)
oidc:Session:uid:def456 → "abc123"

# User code index — maps user code to primary key ID (for findByUserCode)
oidc:DeviceCode:user_code:XYZ → "abc123"

# Grant set — tracks all IDs belonging to a grant (for revokeByGrantId)
oidc:Session:grant:grant789 → SET{"abc123", "def456"}
```

**Key implementation notes:**
- All keys use `oidc:` prefix to namespace within Redis
- TTL is set via `SETEX` (or `SET ... EX`) — Redis handles automatic expiry
- `consume()` reads the payload, adds `consumed` timestamp, writes it back with remaining TTL
- `revokeByGrantId()` reads the grant set, deletes all referenced keys, then deletes the set
- Use `getRedis()` from `src/lib/redis.ts` — never create a separate connection
- Use Redis pipeline/multi for atomic operations where possible

### Adapter Factory (`src/oidc/adapter-factory.ts`)

Routes model names to the appropriate adapter class.

```typescript
/**
 * Hybrid adapter factory for node-oidc-provider.
 *
 * Routes short-lived models to RedisAdapter and long-lived models
 * to PostgresAdapter. The factory is passed to node-oidc-provider
 * as the `adapter` configuration option.
 *
 * Usage:
 *   const provider = new Provider(issuer, { adapter: createAdapterFactory() });
 *
 * The factory returns a CLASS (not an instance) — node-oidc-provider
 * instantiates it with `new AdapterClass(modelName)`.
 */

/** Models stored in Redis for performance (short-lived, high-throughput) */
const REDIS_MODELS = new Set([
  'Session',
  'Interaction',
  'AuthorizationCode',
  'ReplayDetection',
  'ClientCredentials',
  'PushedAuthorizationRequest',
]);

/**
 * Create the hybrid adapter factory.
 * Returns a class constructor that node-oidc-provider calls with `new`.
 */
export function createAdapterFactory(): AdapterConstructor;
```

**Implementation pattern:**

The factory returns a class that delegates to the appropriate adapter:

```typescript
export function createAdapterFactory() {
  return class HybridAdapter {
    protected delegate: PostgresAdapter | RedisAdapter;

    constructor(name: string) {
      if (REDIS_MODELS.has(name)) {
        this.delegate = new RedisAdapter(name);
      } else {
        this.delegate = new PostgresAdapter(name);
      }
    }

    // Delegate all methods to the appropriate adapter
    upsert(...args) { return this.delegate.upsert(...args); }
    find(...args) { return this.delegate.find(...args); }
    // ... etc
  };
}
```

## Integration Points

- **PostgresAdapter** uses `getPool()` from `src/lib/database.ts`
- **RedisAdapter** uses `getRedis()` from `src/lib/redis.ts`
- **Both adapters** import `logger` from `src/lib/logger.ts` for error logging
- **AdapterFactory** is passed to `buildProviderConfiguration()` from `src/oidc/configuration.ts`

## Error Handling

| Error Case | Handling Strategy |
|------------|-------------------|
| PostgreSQL query failure | Log error, re-throw (provider handles error response) |
| Redis connection failure | Log error, re-throw (provider handles error response) |
| Expired artifact found | Return `undefined` (same as not found) |
| Invalid JSON payload in Redis | Log warning, return `undefined` |
| Grant set partially deleted | Best-effort deletion, log warnings for failures |

## Testing Requirements

- Unit tests for `PostgresAdapter` — mock `getPool()`, verify SQL queries and parameters
- Unit tests for `RedisAdapter` — mock `getRedis()`, verify key patterns and TTL
- Unit tests for adapter factory — verify routing: Redis models → RedisAdapter, others → PostgresAdapter
- Unit tests for edge cases: expired artifacts, consumed artifacts, missing data
- Unit tests for `revokeByGrantId` — verify all related artifacts are deleted
