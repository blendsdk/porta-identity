# Client Finder Integration + Secret Verification

> **Document**: 03-client-finder.md
> **Parent**: [Index](00-index.md)

## Overview

Wire `findClientByClientId` into the OIDC provider configuration as the `findClient` hook,
and add Argon2id secret verification for confidential clients. This is a single document
covering both GAP-1 (wiring) and GAP-2 (secret verification) since they are tightly coupled.

## Architecture

### Current Architecture

```
oidc-provider → adapter.find('Client', id) → PostgresAdapter → oidc_payloads table → NOT FOUND
```

### Proposed Architecture

```
oidc-provider → config.findClient(ctx, id) → findClientByClientId(ctx, id)
  → findForOidc(id) → clients table (via service + cache)
  → extractSecret(ctx) → from body or Authorization header
  → Decision matrix → verify or reject
  → Return metadata (with client_secret if confidential + valid)
```

## Implementation Details

### 1. Update `BuildProviderConfigParams` (configuration.ts)

Add `findClient` parameter:

```typescript
export interface BuildProviderConfigParams {
  // ... existing params ...
  /** Client finder function — looks up clients by client_id with secret verification */
  findClient: (ctx: unknown, id: string) => Promise<Record<string, unknown> | undefined>;
}
```

In `buildProviderConfiguration()`, add to returned config:
```typescript
return {
  // ... existing config ...
  findClient: params.findClient,
};
```

### 2. Update `createOidcProvider()` (provider.ts)

Import and wire the client finder:
```typescript
import { findClientByClientId } from './client-finder.js';

// In createOidcProvider():
const configuration = buildProviderConfiguration({
  // ... existing params ...
  findClient: findClientByClientId,
});
```

### 3. Rewrite `findClientByClientId()` (client-finder.ts)

New signature accepts Koa context:

```typescript
export async function findClientByClientId(
  ctx: unknown,
  clientId: string,
): Promise<OidcClientMetadata | undefined> {
  // 1. Look up client via service (cache-backed)
  const metadata = await findForOidc(clientId);
  if (!metadata) return undefined;

  // 2. Determine client type and extract presented secret
  const isPublic = metadata.token_endpoint_auth_method === 'none';
  const presentedSecret = extractClientSecret(ctx, clientId);

  // 3. Apply decision matrix
  if (isPublic && presentedSecret) {
    // Public client should NOT send a secret — misconfiguration
    logger.warn({ clientId }, 'Public client sent client_secret — likely misconfiguration');
    return undefined; // → invalid_client
  }

  if (!isPublic && presentedSecret) {
    // Confidential client — verify secret via Argon2id
    const client = await getClientByClientId(clientId);
    if (!client) return undefined;

    const isValid = await verifySecret(client.id, presentedSecret);
    if (!isValid) {
      logger.warn({ clientId }, 'Confidential client secret verification failed');
      return undefined; // → invalid_client
    }

    // Valid — include presented secret so oidc-provider comparison succeeds
    return { ...oidcMetadata, client_secret: presentedSecret };
  }

  // Public client without secret, or confidential client without secret
  // (provider will enforce auth based on token_endpoint_auth_method)
  return oidcMetadata;
}
```

### 4. Secret Extraction Helper

```typescript
/**
 * Extract client_secret from the request context.
 *
 * Supports two OAuth2 client authentication methods:
 * - client_secret_post: secret in request body
 * - client_secret_basic: secret in Authorization header (Basic base64(id:secret))
 *
 * Returns undefined if no secret is present.
 */
function extractClientSecret(ctx: unknown, clientId: string): string | undefined {
  const koaCtx = ctx as { request?: { body?: Record<string, unknown> }; headers?: Record<string, string> };

  // Method 1: client_secret_post — secret in request body
  const bodySecret = koaCtx?.request?.body?.client_secret;
  if (typeof bodySecret === 'string' && bodySecret.length > 0) {
    return bodySecret;
  }

  // Method 2: client_secret_basic — Authorization: Basic base64(client_id:client_secret)
  const authHeader = koaCtx?.headers?.authorization;
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
      const colonIndex = decoded.indexOf(':');
      if (colonIndex > 0) {
        const headerClientId = decodeURIComponent(decoded.substring(0, colonIndex));
        const headerSecret = decodeURIComponent(decoded.substring(colonIndex + 1));
        // Only return if the client_id in header matches
        if (headerClientId === clientId && headerSecret.length > 0) {
          return headerSecret;
        }
      }
    } catch {
      // Malformed Basic auth — ignore, treat as no secret
    }
  }

  return undefined;
}
```

### 5. `verifyClientSecret()` in service.ts (convenience wrapper)

```typescript
/**
 * Verify a client secret for OIDC authentication.
 * Delegates to secret-service.verify() which checks all active, non-expired hashes.
 *
 * @param clientId - The OIDC client_id (external identifier)
 * @param plaintext - The presented secret
 * @returns true if secret matches any active hash
 */
export async function verifyClientSecret(clientId: string, plaintext: string): Promise<boolean> {
  const client = await getClientByClientId(clientId);
  if (!client || client.status !== 'active') return false;
  if (client.clientType === 'public') return false;
  return verify(client.id, plaintext);
}
```

## Integration Points

### How oidc-provider uses findClient

When oidc-provider receives a request that needs client info (authorization, token, introspection, etc.):

1. Provider checks if `configuration.findClient` exists
2. If yes: calls `findClient(ctx, clientId)` — bypasses adapter for client model
3. If no: falls back to adapter (`adapter.find('Client', clientId)`)
4. Provider uses returned metadata for all client checks (redirect_uris, grant_types, etc.)
5. For token endpoint: if `token_endpoint_auth_method` is `client_secret_post`/`client_secret_basic`, provider compares presented secret with metadata `client_secret`

### Why pass-through works

After Argon2id verification, we set `client_secret: presentedSecret` in the metadata.
When oidc-provider then compares the presented secret against the metadata secret,
it's comparing the secret against itself — always matches. The REAL verification
already happened via Argon2id.

## Error Handling

| Error Case                         | Handling                                          |
|------------------------------------|---------------------------------------------------|
| Client not found                   | Return `undefined` → oidc-provider returns 401    |
| Client not active (suspended, etc) | Return `undefined` → invalid_client               |
| Secret verification fails          | Return `undefined` + log warning + audit log      |
| Secret extraction fails (bad Base64)| Ignore, treat as no secret                       |
| Database error during lookup       | Return `undefined` + log error                    |
| Redis cache error                  | Graceful degradation to DB (existing behavior)    |
