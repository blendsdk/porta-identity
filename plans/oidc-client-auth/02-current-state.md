# Current State: OIDC Client Authentication

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

The client management system is fully implemented (RD-05): clients table, CRUD service,
Redis cache, secret management with Argon2id hashing, and a client-finder module. However,
the client-finder is **dead code** — written but never wired into the OIDC provider.

### Relevant Files

| File                           | Purpose                              | Changes Needed                              |
|--------------------------------|--------------------------------------|---------------------------------------------|
| `src/oidc/client-finder.ts`    | OIDC client lookup bridge            | Accept `ctx`, add secret verification       |
| `src/oidc/configuration.ts`    | Provider config builder              | Add `findClient` parameter                  |
| `src/oidc/provider.ts`         | Provider factory                     | Wire `findClientByClientId` to config       |
| `src/clients/service.ts`       | Client business logic                | Add `verifyClientSecret()` function         |
| `src/clients/secret-service.ts`| Secret lifecycle management          | Already has `verify()` — will be reused     |
| `src/oidc/adapter-factory.ts`  | Hybrid adapter routing               | No changes — Client still routes to adapter |

### Code Analysis

#### Client Resolution Flow (Current — BROKEN)

```
oidc-provider token request
  → adapter.find('Client', clientId)
  → PostgresAdapter.find(clientId) with type='Client'
  → SELECT FROM oidc_payloads WHERE id=$1 AND type='Client'
  → No rows (clients are in 'clients' table, not 'oidc_payloads')
  → Returns undefined → invalid_client error
```

#### Client Resolution Flow (After Fix)

```
oidc-provider token request
  → configuration.findClient(ctx, clientId)
  → findClientByClientId(ctx, clientId)
    → findForOidc(clientId) → clients table → cache-backed lookup
    → Extract secret from ctx (body or Authorization header)
    → If confidential + secret: verify() against Argon2id hashes
    → If valid: return metadata with client_secret = presented secret
    → If invalid: return undefined → invalid_client
  → oidc-provider uses returned metadata
```

#### Existing `findForOidc()` (clients/service.ts, line 451)

Returns client metadata but WITHOUT `client_secret`:
```typescript
return {
  client_id: client.clientId,
  client_name: client.clientName,
  application_type: client.applicationType,
  redirect_uris: client.redirectUris,
  post_logout_redirect_uris: client.postLogoutRedirectUris,
  grant_types: client.grantTypes,
  response_types: client.responseTypes,
  scope: client.scope,
  token_endpoint_auth_method: client.clientType === 'public'
    ? 'none'
    : client.tokenEndpointAuthMethod,
  'urn:porta:allowed_origins': client.allowedOrigins,
};
```

#### Existing `verify()` (clients/secret-service.ts, line 121)

Already implements Argon2id verification against all active secrets:
```typescript
export async function verify(clientDbId: string, plaintext: string): Promise<boolean>
// 1. getActiveSecretHashes(clientDbId)
// 2. Iterate, verifySecretHash(hash, plaintext) for each
// 3. On match: update last_used_at, audit log, return true
// 4. No match: audit log failure, return false
```

## Gaps Identified

### Gap 1: Client Finder Not Wired (CRITICAL)

**Current**: `findClientByClientId` in `client-finder.ts` is never imported. Zero references
outside its own file and test file.

**Required**: Must be wired into `buildProviderConfiguration()` as the `findClient` hook.

**Fix**: Add `findClient` parameter to `BuildProviderConfigParams`, pass it in `provider.ts`.

### Gap 2: Secret Verification Missing (CRITICAL)

**Current**: `findForOidc()` returns metadata without `client_secret`. Confidential clients
get `token_endpoint_auth_method: 'client_secret_post'` but no secret → provider rejects.

**Required**: For confidential clients, verify the presented secret via Argon2id, then
return it as `client_secret` in metadata so oidc-provider's comparison succeeds.

**Fix**: In `findClientByClientId`, extract secret from request context, verify, include in
metadata if valid.

### Gap 3: No Secret Extraction from HTTP Request

**Current**: `findClientByClientId(clientId)` takes only `clientId`. No access to request ctx.

**Required**: Must accept Koa context to extract `client_secret` from:
- Request body (`client_secret_post`): `ctx.request.body.client_secret`
- Authorization header (`client_secret_basic`): `Authorization: Basic base64(id:secret)`

**Fix**: Change signature to `findClientByClientId(ctx, clientId)`.

## Dependencies

### Internal

- `clients/service.ts` — `findForOidc()` already works, just needs secret augmentation
- `clients/secret-service.ts` — `verify()` already works for Argon2id checking
- `clients/secret-repository.ts` — `getActiveSecretHashes()` already works

### External

- `node-oidc-provider` v9.x — supports `findClient(ctx, id)` in configuration

## Risks and Concerns

| Risk                                  | Likelihood | Impact | Mitigation                                  |
|---------------------------------------|------------|--------|---------------------------------------------|
| Argon2id latency on every token req   | High       | Low    | Only runs when secret is presented (~50ms)  |
| findClient called on non-token paths  | Medium     | Low    | Skip secret extraction if no secret present |
| Breaking existing tests               | Low        | High   | Additive changes only, mock findClient      |
| node-oidc-provider API change         | Low        | High   | Pin to v9.x, test with actual provider      |
