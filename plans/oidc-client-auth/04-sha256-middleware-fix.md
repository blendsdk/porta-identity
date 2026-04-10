# OIDC Client Authentication Fix — SHA-256 Middleware Approach

## Problem Summary

### Root Cause (discovered during playground testing)
**`findClient` does NOT exist as a configuration option in oidc-provider v9.x.** Our entire client-finder implementation was based on a wrong assumption. oidc-provider silently ignores unknown config properties.

### How oidc-provider actually resolves clients
```
Client.find(clientId)  →  adapter.find(clientId)  →  HybridAdapter  →  PostgresAdapter  →  oidc_payloads table
```
But clients live in the **`clients`** table, not `oidc_payloads`. So every client lookup returns `undefined` → `invalid_client`.

### How oidc-provider verifies secrets
```javascript
// shared/client_auth.js
clientSecret = decodeAuthToken(basic.slice(i + 1));   // line 107: extract from Basic header
const matches = await ctx.oidc.client.compareClientSecret(clientSecret);  // line 182: compare
```
```javascript
// models/client.js
compareClientSecret(actual) {
  return constantEquals(this.clientSecret, actual, 1000);  // line 496-498: string equality
}
```
oidc-provider does a **direct string comparison** of the presented secret against `this.clientSecret` (from adapter metadata).

---

## Solution: SHA-256 Pre-Hashing Middleware

### Concept
Instead of monkey-patching oidc-provider, we transform the request **before** it reaches the provider:

1. **At secret generation**: Store `SHA-256(secret)` alongside the existing Argon2id hash
2. **At request time**: A Koa middleware hashes the presented secret with SHA-256 and replaces it in the request
3. **In the adapter**: Return the stored SHA-256 hash as `client_secret` in metadata
4. **oidc-provider compares**: `SHA-256(presented) === SHA-256(stored)` → ✅ MATCH

```
Request:  Authorization: Basic base64(client_id : plaintext_secret)
    ↓ Middleware
Modified: Authorization: Basic base64(client_id : sha256(plaintext_secret))
    ↓ oidc-provider extracts sha256(plaintext_secret)
    ↓ adapter.find(clientId) returns { client_secret: sha256_hash_from_db }
    ↓ compareClientSecret( sha256(presented) ) === sha256_hash_from_db
    = ✅ MATCH (no monkey-patching)
```

### Why SHA-256 is appropriate for client secrets
- Client secrets are **machine-generated** (48 bytes / 64 chars of cryptographic randomness)
- They're NOT human passwords — no dictionary attacks, no brute force feasible
- SHA-256 is **preimage-resistant** — can't reverse the hash to get the secret
- SHA-256 is instant (~microseconds) vs Argon2id (~100ms) — no performance penalty
- We keep Argon2id for **user passwords** where it's actually needed

### Multi-secret rotation note
With this approach, `findForOidc()` returns the SHA-256 hash of the **most recent active secret** as `client_secret`. For the common case (1 active secret), this works perfectly. During rotation (briefly 2 active secrets), only the newest secret will pass oidc-provider's comparison. If multi-secret comparison is needed later, a `compareClientSecret` override can be added as an enhancement.

---

## Architecture

### Files to CREATE

| File | Purpose |
|------|---------|
| `src/middleware/client-secret-hash.ts` | Koa middleware: SHA-256 hash presented secrets before oidc-provider |
| `migrations/013_client_secret_sha256.sql` | Add `secret_sha256` column to `client_secrets` table |
| `tests/unit/middleware/client-secret-hash.test.ts` | Unit tests for the middleware |
| `tests/unit/oidc/adapter-factory-client.test.ts` | Tests for Client model routing in adapter |

### Files to MODIFY

| File | Change |
|------|--------|
| `src/clients/crypto.ts` | Add `sha256Secret(plaintext)` function |
| `src/clients/secret-service.ts` | Compute and store SHA-256 at generation time |
| `src/clients/secret-repository.ts` | Accept `secretSha256` in insert, add `getLatestActiveSha256()` |
| `src/oidc/adapter-factory.ts` | Route `Client` model to `findForOidc()` instead of PostgresAdapter |
| `src/clients/service.ts` | `findForOidc()` returns `client_secret: sha256_hash` for confidential clients |
| `src/server.ts` | Mount SHA-256 middleware before oidc-provider routes |
| `src/oidc/configuration.ts` | Remove dead `findClient` parameter |
| `src/oidc/provider.ts` | Remove dead `findClient` import and wiring |

### Files to DELETE/DEPRECATE

| File | Reason |
|------|--------|
| `src/oidc/client-finder.ts` | Dead code — built on wrong assumption (`findClient` doesn't exist) |
| `tests/unit/oidc/client-finder.test.ts` | Tests for dead code |

---

## Detailed Changes

### 1. Migration: `migrations/013_client_secret_sha256.sql`

```sql
-- Up Migration
ALTER TABLE client_secrets ADD COLUMN secret_sha256 VARCHAR(64);

-- Backfill: existing secrets cannot be backfilled (we don't have plaintexts).
-- New secrets will have both Argon2id hash and SHA-256 hash.
-- Old secrets still work via Argon2id verification in the admin API.

CREATE INDEX idx_client_secrets_sha256 ON client_secrets(secret_sha256) WHERE secret_sha256 IS NOT NULL;

COMMENT ON COLUMN client_secrets.secret_sha256 IS 'SHA-256 hex hash of the secret — used for oidc-provider client authentication';

-- Down Migration
DROP INDEX IF EXISTS idx_client_secrets_sha256;
ALTER TABLE client_secrets DROP COLUMN IF EXISTS secret_sha256;
```

### 2. Crypto: `src/clients/crypto.ts`

Add:
```typescript
import { createHash } from 'node:crypto';

/**
 * Compute SHA-256 hash of a client secret.
 *
 * Used for oidc-provider integration where the secret hash is stored
 * in the database and compared against the hashed presented secret.
 * SHA-256 is appropriate for machine-generated, high-entropy secrets.
 *
 * @param plaintext - The secret to hash
 * @returns Hex-encoded SHA-256 hash (64 characters)
 */
export function sha256Secret(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}
```

### 3. Secret Repository: `src/clients/secret-repository.ts`

- `InsertSecretData`: add `secretSha256: string | null`
- `insertSecret()`: include `secret_sha256` in INSERT
- Add `getLatestActiveSha256(clientDbId)`: returns the SHA-256 hash of the most recent active, non-expired secret

### 4. Secret Service: `src/clients/secret-service.ts`

- `generateAndStore()`: compute `sha256Secret(plaintext)` and pass to `insertSecret()`

### 5. Adapter Factory: `src/oidc/adapter-factory.ts`

- Store `name` on HybridAdapter instance
- In `find()`: if `name === 'Client'`, call `findForOidc(id)` instead of `delegate.find(id)`
- Import `findForOidc` from clients service

### 6. Client Service: `src/clients/service.ts`

- `findForOidc()`: for confidential clients, load the latest active SHA-256 hash and include as `client_secret` in the returned metadata

### 7. Middleware: `src/middleware/client-secret-hash.ts`

```typescript
/**
 * SHA-256 client secret pre-hashing middleware.
 *
 * Transforms client_secret values in incoming requests by replacing
 * the plaintext with its SHA-256 hash BEFORE oidc-provider processes them.
 *
 * Supports:
 * - client_secret_basic: Authorization: Basic base64(client_id:secret)
 * - client_secret_post: client_secret in POST body
 *
 * This allows oidc-provider's built-in string comparison to work
 * with our SHA-256-hashed secret storage — no monkey-patching needed.
 */
```

Handles:
- `Authorization: Basic` header → decode, hash secret, re-encode, replace header
- `ctx.request.body.client_secret` → hash and replace

### 8. Server.ts

Mount the middleware on the OIDC router, before `oidcProvider.callback()`:

```typescript
oidcRouter.use(tenantResolver());
oidcRouter.use(clientSecretHashMiddleware());  // ← NEW: hash secrets before provider
oidcRouter.all('/{*path}', async (ctx) => { ... });
```

### 9. Cleanup: Remove dead code

- Remove `findClient` from `BuildProviderConfigParams` in configuration.ts
- Remove `findClient: findClientByClientId` from provider.ts
- Remove import of `findClientByClientId` from provider.ts
- Mark `client-finder.ts` as deprecated or delete

---

## Testing Strategy

### Unit Tests: `client-secret-hash.test.ts` (~15 tests)
- Passes through requests without client_secret unchanged
- Hashes client_secret in POST body
- Hashes secret in Authorization: Basic header
- Handles malformed Basic auth gracefully
- Handles empty secret
- Handles missing Authorization header
- Handles non-Basic Authorization schemes (Bearer, etc.)
- URL-encoded client_id/secret in Basic auth
- Does not affect non-OIDC routes

### Unit Tests: `adapter-factory-client.test.ts` (~8 tests)
- Client model routes to findForOidc (not PostgresAdapter)
- Returns undefined for unknown clients
- Returns metadata with client_secret for confidential clients
- Returns metadata without client_secret for public clients
- Other models still route to Redis/Postgres as before
- Session still routes to Redis
- AccessToken still routes to Postgres

### Unit Tests: `crypto.test.ts` additions (~3 tests)
- sha256Secret returns 64-char hex string
- sha256Secret is deterministic (same input → same output)
- sha256Secret produces different hashes for different inputs

### Unit Tests: `secret-service.test.ts` additions (~3 tests)
- generateAndStore stores SHA-256 hash alongside Argon2id
- SHA-256 hash matches sha256(plaintext)

### Unit Tests: `service.test.ts` additions (~3 tests)
- findForOidc returns client_secret for confidential clients
- findForOidc does NOT return client_secret for public clients
- findForOidc returns undefined for clients without active secrets

### Existing tests to UPDATE
- `configuration.test.ts` — Remove findClient tests
- `client-finder.test.ts` — Delete or mark deprecated

### Total new tests: ~32

---

## Execution Plan

### Phase 1: Database + Crypto (foundation)
| # | Task | File(s) |
|---|------|---------|
| 1.1 | Create migration 013 (add `secret_sha256` column) | `migrations/013_client_secret_sha256.sql` |
| 1.2 | Add `sha256Secret()` to crypto module | `src/clients/crypto.ts` |
| 1.3 | Update secret repository (accept + store SHA-256) | `src/clients/secret-repository.ts` |
| 1.4 | Update secret service (compute SHA-256 at generation) | `src/clients/secret-service.ts` |
| 1.5 | Add `getLatestActiveSha256()` to repository | `src/clients/secret-repository.ts` |

### Phase 2: Adapter + Service (wiring)
| # | Task | File(s) |
|---|------|---------|
| 2.1 | Route `Client` model in adapter-factory to `findForOidc()` | `src/oidc/adapter-factory.ts` |
| 2.2 | Update `findForOidc()` to return `client_secret: sha256` | `src/clients/service.ts` |

### Phase 3: Middleware (the key piece)
| # | Task | File(s) |
|---|------|---------|
| 3.1 | Create SHA-256 pre-hashing middleware | `src/middleware/client-secret-hash.ts` |
| 3.2 | Mount middleware in server.ts before oidc-provider | `src/server.ts` |

### Phase 4: Cleanup (remove dead code)
| # | Task | File(s) |
|---|------|---------|
| 4.1 | Remove `findClient` from configuration.ts | `src/oidc/configuration.ts` |
| 4.2 | Remove `findClient` wiring from provider.ts | `src/oidc/provider.ts` |
| 4.3 | Deprecate/delete `client-finder.ts` | `src/oidc/client-finder.ts` |

### Phase 5: Testing
| # | Task | File(s) |
|---|------|---------|
| 5.1 | Middleware unit tests | `tests/unit/middleware/client-secret-hash.test.ts` |
| 5.2 | Adapter-factory Client routing tests | `tests/unit/oidc/adapter-factory.test.ts` |
| 5.3 | Crypto sha256Secret tests | `tests/unit/clients/crypto.test.ts` |
| 5.4 | Secret service SHA-256 tests | `tests/unit/clients/secret-service.test.ts` |
| 5.5 | findForOidc client_secret tests | `tests/unit/clients/service.test.ts` |
| 5.6 | Remove/update client-finder tests | `tests/unit/oidc/client-finder.test.ts` |
| 5.7 | Run full test suite | `yarn verify` |

### Phase 6: Playground verification
| # | Task |
|---|------|
| 6.1 | Run migrations (`yarn tsx scripts/playground-seed.ts`) |
| 6.2 | Start server, verify discovery endpoint |
| 6.3 | Test with OIDC tester (confidential client) |
| 6.4 | Test with OIDC tester (public client) |

---

## Security Considerations

1. **SHA-256 for client secrets is appropriate** — machine-generated, 48 bytes (384 bits) of entropy. Preimage attacks on SHA-256 are computationally infeasible.
2. **Argon2id retained for user passwords** — human-chosen, low entropy, needs slow hashing.
3. **Old secrets without SHA-256** — existing secrets will have `secret_sha256 = NULL` and won't work with oidc-provider auth. New secrets must be generated. This is acceptable because the playground seed already generates new secrets on each run.
4. **No plaintext stored** — we store `SHA-256(secret)` and `Argon2id(secret)`, never the plaintext.
5. **Timing safety** — oidc-provider's `constantEquals()` provides timing-safe comparison of the SHA-256 hashes.
