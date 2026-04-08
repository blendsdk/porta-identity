# Keys & Crypto: OIDC Provider Core

> **Document**: 05-keys-and-crypto.md
> **Parent**: [Index](00-index.md)

## Overview

This document specifies the signing key management system for the OIDC provider. It covers loading ES256 keys from the `signing_keys` database table, converting PEM keys to JWK format, generating new ES256 key pairs, and managing cookie signing keys.

## Architecture

### Key Lifecycle

```
Generate (ES256 P-256)
    ↓
Store in signing_keys table (PEM, status='active')
    ↓
Load at startup → Convert PEM → JWK
    ↓
Pass to node-oidc-provider as jwks.keys
    ↓
Active key used for signing new tokens
    ↓
On rotation: mark old key as 'retired' (still published in JWKS for verification)
    ↓
After grace period: mark as 'revoked' (removed from JWKS on next restart)
```

### Key States

| Status | Signing | Published in JWKS | Purpose |
|--------|---------|-------------------|---------|
| `active` | ✅ Yes (newest active) | ✅ Yes | Sign new tokens |
| `retired` | ❌ No | ✅ Yes | Verify existing tokens during grace period |
| `revoked` | ❌ No | ❌ No | Archived, not loaded |

## Implementation Details

### Signing Key Service (`src/lib/signing-keys.ts`)

```typescript
import { createPrivateKey, createPublicKey, generateKeyPairSync, KeyObject } from 'node:crypto';

/**
 * Signing key management for the OIDC provider.
 *
 * Handles loading ES256 key pairs from the database, converting between
 * PEM and JWK formats, and generating new key pairs for bootstrapping
 * and rotation.
 *
 * Key format:
 *   - Database stores PEM-encoded keys (public_key, private_key columns)
 *   - node-oidc-provider requires JWK format (jwks.keys configuration)
 *   - Node.js crypto module handles PEM ↔ JWK conversion
 */

/** Represents a signing key loaded from the database */
export interface SigningKeyRecord {
  id: string;
  kid: string;
  algorithm: string;
  publicKey: string;   // PEM-encoded
  privateKey: string;  // PEM-encoded
  status: 'active' | 'retired' | 'revoked';
  activatedAt: Date;
  retiredAt: Date | null;
  expiresAt: Date | null;
}

/** JWK representation for node-oidc-provider */
export interface JwkKeyPair {
  kty: string;       // 'EC'
  crv: string;       // 'P-256'
  kid: string;       // Key ID
  use: string;       // 'sig'
  alg: string;       // 'ES256'
  x: string;         // Public key X coordinate (base64url)
  y: string;         // Public key Y coordinate (base64url)
  d: string;         // Private key D value (base64url) — only in private JWK
}

/**
 * Load signing keys from the database.
 *
 * Queries the signing_keys table for active and retired keys that
 * haven't expired. Returns them sorted by activated_at DESC (newest first).
 *
 * @returns Array of signing key records
 */
export async function loadSigningKeysFromDb(): Promise<SigningKeyRecord[]>;

/**
 * Convert a PEM key pair to JWK format for node-oidc-provider.
 *
 * Uses Node.js crypto module to parse PEM and export as JWK.
 * The resulting JWK includes the private key (d parameter) which
 * is needed by the provider for signing.
 *
 * @param pem - PEM-encoded private key
 * @param kid - Key ID to include in the JWK
 * @returns JWK object with both public and private key parameters
 */
export function pemToJwk(privatePem: string, kid: string): JwkKeyPair;

/**
 * Convert signing key records from the database into JWK format
 * suitable for node-oidc-provider's jwks.keys configuration.
 *
 * @param records - Array of signing key records from DB
 * @returns JWK key set with all active + retired keys
 */
export function signingKeysToJwks(records: SigningKeyRecord[]): { keys: JwkKeyPair[] };

/**
 * Generate a new ES256 key pair.
 *
 * Creates an ECDSA key pair using the P-256 curve.
 * Returns PEM-encoded keys for database storage and a kid.
 *
 * The kid is generated as a truncated SHA-256 hash of the public key,
 * ensuring uniqueness and determinism.
 *
 * @returns Object containing PEM keys, kid, and algorithm
 */
export function generateES256KeyPair(): {
  kid: string;
  algorithm: string;
  publicKeyPem: string;
  privateKeyPem: string;
};

/**
 * Ensure at least one active signing key exists.
 *
 * Called at startup. If no active keys are found in the database:
 * 1. Generate a new ES256 key pair
 * 2. Insert it into the signing_keys table with status='active'
 * 3. Log a warning that a key was auto-generated
 *
 * This ensures the OIDC provider can always start, even on a fresh database.
 *
 * @returns The loaded JWK key set (possibly with the newly generated key)
 */
export async function ensureSigningKeys(): Promise<{ keys: JwkKeyPair[] }>;
```

### PEM → JWK Conversion

Node.js `crypto` module provides built-in JWK export:

```typescript
import { createPrivateKey } from 'node:crypto';

export function pemToJwk(privatePem: string, kid: string): JwkKeyPair {
  // Parse the PEM into a KeyObject
  const keyObject = createPrivateKey(privatePem);

  // Export as JWK — includes both public and private parameters
  const jwk = keyObject.export({ format: 'jwk' });

  return {
    ...jwk,
    kid,
    use: 'sig',
    alg: 'ES256',
  };
}
```

### ES256 Key Generation

```typescript
import { generateKeyPairSync, createHash } from 'node:crypto';

export function generateES256KeyPair() {
  // Generate ECDSA P-256 key pair
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  });

  // Export as PEM for database storage
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

  // Generate kid from public key hash (first 16 hex chars of SHA-256)
  const kid = createHash('sha256')
    .update(publicKeyPem)
    .digest('hex')
    .substring(0, 16);

  return {
    kid,
    algorithm: 'ES256',
    publicKeyPem,
    privateKeyPem,
  };
}
```

### Auto-Bootstrap at Startup

The `ensureSigningKeys()` function is called during application startup (in `src/index.ts`):

```typescript
// In main():
await connectDatabase();
await connectRedis();

// Load or generate signing keys
const jwks = await ensureSigningKeys();

// Create provider with loaded keys
const provider = createOidcProvider(jwks);
const app = createApp(provider);
```

**Behavior:**
1. Query `signing_keys` for active/retired keys
2. If no active keys → generate new ES256 key pair, insert into DB, log warning
3. Convert all loaded keys (active + retired) to JWK format
4. Return JWK key set for provider configuration

### Database Queries

```sql
-- Load active and retired keys (not expired, not revoked)
SELECT id, kid, algorithm, public_key, private_key, status, activated_at, retired_at, expires_at
FROM signing_keys
WHERE status IN ('active', 'retired')
  AND (expires_at IS NULL OR expires_at > NOW())
ORDER BY activated_at DESC;

-- Insert new key
INSERT INTO signing_keys (kid, algorithm, public_key, private_key, status, activated_at)
VALUES ($1, $2, $3, $4, 'active', NOW());
```

## Cookie Keys

Cookie signing keys come from the application config (`COOKIE_KEYS` environment variable), not from the database. They are passed directly to the provider configuration:

```typescript
cookies: {
  keys: config.cookieKeys,  // From COOKIE_KEYS env var
  long: { signed: true, httpOnly: true, sameSite: 'lax' },
  short: { signed: true, httpOnly: true, sameSite: 'lax' },
}
```

**Rationale:** Cookie keys are infrastructure configuration (like database URLs) and change with deployment environments. Signing keys are OIDC protocol keys that are shared across all instances and must be in the database.

## Error Handling

| Error Case | Handling Strategy |
|------------|-------------------|
| No active keys in DB | Auto-generate new key pair, insert, log warning |
| Invalid PEM in database | Log error, skip key, continue with remaining keys |
| Key generation failure | Fatal error — cannot start provider without keys |
| Database unreachable during key load | Fatal error — cannot start without keys |
| Duplicate kid on auto-generate | Extremely unlikely (SHA-256 collision); would fail on unique constraint, retry with new key |

## Testing Requirements

- Unit tests for `pemToJwk()` — convert known PEM to JWK, verify all fields
- Unit tests for `generateES256KeyPair()` — verify PEM format, kid generation, algorithm
- Unit tests for `signingKeysToJwks()` — convert multiple records, verify ordering
- Unit tests for `ensureSigningKeys()` — mock DB; test with existing keys, test auto-generation
- Unit tests for `loadSigningKeysFromDb()` — mock DB; verify query and result mapping
