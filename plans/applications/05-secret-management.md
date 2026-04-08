# Secret Management: Crypto, Argon2id, Secret Lifecycle

> **Document**: 05-secret-management.md
> **Parent**: [Index](00-index.md)

## Overview

Secret management handles the full lifecycle of client secrets for confidential
OIDC clients. Secrets are cryptographically generated, stored as Argon2id hashes,
and verified during token endpoint authentication. Multiple active secrets per
client support zero-downtime rotation.

This is the security-critical part of RD-05. The plaintext secret is shown exactly
once at creation and never stored in the database.

## Architecture

### New Dependency

**`argon2` (npm package)**:
- Well-maintained native binding for Argon2id hashing
- Pre-built binaries for Linux, macOS, Windows
- Async API — doesn't block the event loop
- Must be added to `package.json` dependencies

```bash
yarn add argon2
```

**`@types/argon2`** is NOT needed — `argon2` ships with its own TypeScript types.

### Files

| File                            | Purpose                                   |
|---------------------------------|-------------------------------------------|
| `src/clients/crypto.ts`        | Client ID gen, secret gen, Argon2id wrap  |
| `src/clients/secret-repository.ts` | PostgreSQL CRUD for client_secrets   |
| `src/clients/secret-service.ts`| Secret lifecycle business logic           |

## Implementation Details

### crypto.ts — Cryptographic Utilities

```typescript
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';

/**
 * Generate a cryptographically random client_id.
 * Format: 32 random bytes, base64url-encoded (~43 characters).
 * This is the public OIDC client identifier.
 */
export function generateClientId(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Generate a cryptographically random client secret.
 * Format: 48 random bytes, base64url-encoded (~64 characters).
 * This plaintext is shown to the user ONCE and never stored.
 */
export function generateSecret(): string {
  return randomBytes(48).toString('base64url');
}

/**
 * Hash a secret using Argon2id.
 *
 * Argon2id is the recommended variant — combines Argon2d (GPU-resistant)
 * and Argon2i (side-channel resistant). Default parameters from the
 * argon2 library are used (they follow OWASP recommendations).
 *
 * @param plaintext - The secret to hash
 * @returns Argon2id hash string (includes algorithm, salt, params)
 */
export async function hashSecret(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, {
    type: argon2.argon2id,
  });
}

/**
 * Verify a plaintext secret against an Argon2id hash.
 *
 * @param hash - Stored Argon2id hash
 * @param plaintext - Secret to verify
 * @returns true if the secret matches the hash
 */
export async function verifySecretHash(hash: string, plaintext: string): Promise<boolean> {
  return argon2.verify(hash, plaintext);
}
```

### secret-repository.ts — PostgreSQL CRUD for Secrets

| Function                                | Description                                  | Returns                |
|-----------------------------------------|----------------------------------------------|------------------------|
| `insertSecret(data)`                   | Insert a hashed secret row                    | `ClientSecretRow`      |
| `findSecretById(id)`                   | Find secret by UUID                           | `ClientSecretRow \| null` |
| `listSecretsByClient(clientDbId)`      | List all secrets for a client                 | `ClientSecretRow[]`    |
| `listActiveSecrets(clientDbId)`        | Active + not-expired secrets                  | `ClientSecretRow[]`    |
| `revokeSecret(id)`                     | Set status = 'revoked'                        | `void`                 |
| `updateLastUsedAt(id)`                 | Update last_used_at timestamp                 | `void`                 |
| `cleanupExpiredSecrets()`              | Delete expired + revoked secrets older than N | `number`               |

**InsertSecretData**:
```typescript
interface InsertSecretData {
  clientId: string;      // FK to clients.id (internal UUID)
  secretHash: string;    // Argon2id hash
  label?: string;
  expiresAt?: Date;
}
```

**`listActiveSecrets` query logic**:
```sql
SELECT * FROM client_secrets
WHERE client_id = $1
  AND status = 'active'
  AND (expires_at IS NULL OR expires_at > NOW())
ORDER BY created_at DESC
```

**`cleanupExpiredSecrets` logic**:
Deletes secrets that are both revoked AND older than 30 days, or expired AND older
than 30 days. Returns the count of deleted rows.

### secret-service.ts — Secret Lifecycle

| Function                            | Description                                           |
|-------------------------------------|-------------------------------------------------------|
| `generateAndStore(clientDbId, input, actor?)` | Gen plaintext → hash → store → audit → return with plaintext |
| `revoke(secretId, actor?)`         | Validate → set revoked → audit                         |
| `listByClient(clientDbId)`         | Return all secrets (without hashes)                    |
| `listActiveByClient(clientDbId)`   | Return active, non-expired secrets (without hashes)    |
| `verify(clientDbId, plaintext)`    | Load active secrets → try each → update last_used_at   |
| `cleanupExpired()`                 | Delegate to repository, return count                   |

**`generateAndStore` flow**:
1. Generate plaintext secret (48 bytes, base64url)
2. Hash with Argon2id
3. Insert into `client_secrets` table
4. Write audit log: `client.secret.generated`
5. Return `SecretWithPlaintext` (includes the plaintext — shown once)

**`verify` flow** (called during OIDC token endpoint authentication):
1. Load all active, non-expired secrets for the client
2. Iterate through each secret:
   a. `argon2.verify(secret.hash, providedPlaintext)`
   b. If match: update `last_used_at`, audit log `client.secret.verified`, return `true`
3. If no match: audit log `client.secret.failed` (security event), return `false`

**Security considerations**:
- Verification iterates ALL active secrets (not short-circuit on name/label)
- `last_used_at` updated on successful match only
- Failed verification logged as security event (helps detect brute force)
- Argon2id is async — doesn't block the Node.js event loop

**`revoke` validation**:
- Secret must exist
- Secret must currently be `active`
- Revocation is permanent (no un-revoke)

## Audit Events

| Operation                | Event Type                  | Category         |
|--------------------------|----------------------------|------------------|
| Secret generated         | `client.secret.generated`  | `admin`          |
| Secret revoked           | `client.secret.revoked`    | `admin`          |
| Secret verified (success)| `client.secret.verified`   | `authentication` |
| Secret verified (fail)   | `client.secret.failed`     | `security`       |

## Error Handling

| Error Case                   | Handling Strategy                               |
|------------------------------|-------------------------------------------------|
| Secret not found             | Throw `ClientNotFoundError`                     |
| Secret already revoked       | Throw `ClientValidationError`                   |
| Client not found for verify  | Return `false`                                  |
| No active secrets            | Return `false`                                  |
| Argon2 internal error        | Log error, return `false` (fail closed)         |

## Security Notes

1. **Plaintext never stored** — Only the Argon2id hash goes into the database
2. **Plaintext shown once** — The `generateAndStore` return value is the only time
   the plaintext is available. The API response must clearly indicate this.
3. **Fail closed** — Any error during verification results in rejection
4. **Rate limiting** — Not implemented in RD-05; should be added in RD-07 (auth workflows)
5. **Timing attacks** — Argon2id verification has consistent timing; iterating
   all secrets prevents timing-based enumeration of secret count
