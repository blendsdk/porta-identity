# Resource Indicators Fix: UserInfo (/me) Endpoint

> **Document**: 03-resource-indicators-fix.md
> **Parent**: [Index](00-index.md)

## Overview

Fix the `resourceIndicators.defaultResource` function in `src/oidc/configuration.ts` so that access tokens are only audience-restricted when the client explicitly requests a resource via the `resource` parameter. This allows tokens obtained through the standard authorization code flow (without a `resource` parameter) to work with the `/me` (userinfo) endpoint.

## Architecture

### Current Architecture

```typescript
resourceIndicators: {
  enabled: true,
  defaultResource: async () => 'urn:porta:default',        // Always returns resource
  useGrantedResource: async () => true,                      // Always uses it
  getResourceServerInfo: async () => ({                      // Always configures it
    scope: 'openid profile email',
    audience: 'urn:porta:default',
    accessTokenFormat: 'opaque',
    accessTokenTTL: ttlConfig.AccessToken,
  }),
},
```

**Result:** Every access token is audience-restricted → userinfo rejects them all.

### Proposed Changes

```typescript
resourceIndicators: {
  enabled: true,
  defaultResource: async (_ctx, _client, oneOf) => {
    // Only apply resource indicator when explicitly requested by the client.
    // When oneOf is undefined (no resource parameter in auth request),
    // returning undefined produces a standard token that works with /me.
    return oneOf ?? undefined;
  },
  useGrantedResource: async () => true,
  getResourceServerInfo: async () => ({
    scope: 'openid profile email',
    audience: 'urn:porta:default',
    accessTokenFormat: 'opaque',
    accessTokenTTL: ttlConfig.AccessToken,
  }),
},
```

**Result:** Tokens without explicit resource → unrestricted → `/me` works. Tokens with explicit resource → audience-restricted → resource server use.

## Implementation Details

### Change Summary

| Item | Before | After |
| ---- | ------ | ----- |
| `defaultResource` params | `async ()` | `async (_ctx, _client, oneOf)` |
| `defaultResource` return | `'urn:porta:default'` (always) | `oneOf ?? undefined` (conditional) |

### Behavioral Impact

| Scenario | Before | After |
| -------- | ------ | ----- |
| Auth code flow, no `resource` param | Token audience-restricted, `/me` returns 401 | Token unrestricted, `/me` returns 200 |
| Auth code flow, `resource=urn:porta:default` | Token audience-restricted | Token audience-restricted (no change) |
| Token introspection | Works (introspection accepts any valid token) | Works (no change) |
| Token exchange (client_secret_post) | Works | Works (no change) |

### Integration Points

- **`src/oidc/provider.ts`** — No changes needed. The provider passes the config through.
- **`src/oidc/account-finder.ts`** — No changes needed. `findAccount` is called by the provider for userinfo requests.
- **`tests/unit/oidc/configuration.test.ts`** — May need to update if there are tests specifically checking that `defaultResource` always returns a string.

## Error Handling

| Error Case | Handling Strategy |
| ---------- | ----------------- |
| `oneOf` is a string (explicit resource) | Return it as-is → audience-restricted token |
| `oneOf` is undefined (no resource) | Return `undefined` → unrestricted token |

## Testing Requirements

- Unit test: Verify `defaultResource` returns `undefined` when `oneOf` is not provided
- Unit test: Verify `defaultResource` returns the resource when `oneOf` is provided
- E2E test: Verify `/me` returns 200 with valid token (covered in `04-userinfo-e2e-tests.md`)
