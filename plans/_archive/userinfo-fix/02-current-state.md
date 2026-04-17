# Current State: UserInfo (/me) Endpoint Fix

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

The `/me` (userinfo) endpoint is provided natively by `node-oidc-provider` — there is no custom implementation in Porta. The provider mounts it automatically at `/{orgSlug}/me` via the OIDC router in `server.ts`. The `findAccount` function in `account-finder.ts` provides user claims when the provider calls it during a userinfo request.

### Relevant Files

| File                                          | Purpose                                   | Changes Needed |
| --------------------------------------------- | ----------------------------------------- | -------------- |
| `src/oidc/configuration.ts`                   | OIDC provider config with resourceIndicators | Fix `defaultResource` |
| `src/oidc/account-finder.ts`                  | Account lookup + claims builder           | None           |
| `src/oidc/provider.ts`                        | Provider factory                          | None           |
| `src/server.ts`                               | Koa app + OIDC route mounting             | None           |
| `tests/unit/oidc/configuration.test.ts`       | Configuration unit tests                  | May need update |
| `tests/ui/flows/confidential-client.spec.ts`  | Existing E2E test with graceful /me handling | Strict 200 assertion |
| `tests/ui/fixtures/test-fixtures.ts`          | Playwright test fixtures                  | None           |
| `tests/ui/setup/global-setup.ts`              | Playwright global setup + seeding         | None           |

### Code Analysis

#### The Problem: `resourceIndicators` in `configuration.ts`

```typescript
// Lines 69-79 — CURRENT (broken)
resourceIndicators: {
  enabled: true,
  defaultResource: async () => 'urn:porta:default',
  useGrantedResource: async () => true,
  getResourceServerInfo: async () => ({
    scope: 'openid profile email',
    audience: 'urn:porta:default',
    accessTokenFormat: 'opaque',
    accessTokenTTL: ttlConfig.AccessToken,
  }),
},
```

**How oidc-provider processes this:**

1. During token exchange, oidc-provider calls `defaultResource()` → gets `'urn:porta:default'`
2. Since a resource is returned, oidc-provider calls `getResourceServerInfo('urn:porta:default')` → gets audience/scope config
3. The resulting access token is audience-restricted to `'urn:porta:default'`
4. When the token is presented to `/me`, oidc-provider checks: "Is this token for userinfo or for a resource server?"
5. Since `aud` is `'urn:porta:default'` (not the provider), oidc-provider rejects it with "invalid token provided"

#### The `defaultResource` Signature

```typescript
// node-oidc-provider type signature
defaultResource: (ctx: KoaContext, client: Client, oneOf?: string) => Promise<string | undefined>
```

- `oneOf` — If the authorization request included a `resource` parameter, this is the value
- When `oneOf` is `undefined`, it means no resource was explicitly requested
- Returning `undefined` means "no resource indicator" → token works for userinfo

#### Existing E2E Test — Graceful Handling

The `confidential-client.spec.ts` test (Step 8, lines 197-221) currently handles the `/me` failure gracefully:

```typescript
if (meResponse.status === 200) {
  // validate claims
} else {
  expect(meResponse.status).toBe(401); // accepted as "known limitation"
}
```

This was a workaround documented during the confidential-client-e2e plan. After the fix, this should strictly assert 200.

## Gaps Identified

### Gap 1: Unconditional Resource Indicator

**Current Behavior:** Every access token is audience-restricted to `urn:porta:default`, even when no resource was requested.
**Required Behavior:** Only audience-restrict tokens when the client explicitly requests a resource via the `resource` parameter.
**Fix Required:** Change `defaultResource` to return `oneOf ?? undefined`.

### Gap 2: No Dedicated UserInfo E2E Tests

**Current Behavior:** The only `/me` test is a graceful fallback in `confidential-client.spec.ts`.
**Required Behavior:** Dedicated test file covering happy path, error cases, and scope filtering.
**Fix Required:** Create `tests/ui/flows/userinfo.spec.ts`.

## Dependencies

### Internal Dependencies

- Confidential client seeding infrastructure (already exists in `global-setup.ts`)
- Playwright test fixtures (already exist in `test-fixtures.ts`)
- PKCE helpers (already exist in `test-fixtures.ts`)

### External Dependencies

- `node-oidc-provider` v9.8.0 — no changes needed, behavior is correct per spec
- Playwright — test runner, already configured

## Risks and Concerns

| Risk                                | Likelihood | Impact | Mitigation                                              |
| ----------------------------------- | ---------- | ------ | ------------------------------------------------------- |
| Removing default resource breaks something else | Low    | Medium | Only change `defaultResource`, keep `getResourceServerInfo` for when resources ARE requested |
| Token introspection regression      | Low        | Medium | Existing E2E test covers introspection, will catch regressions |
| Scope filtering not working         | Low        | Low    | Test with reduced scopes to verify                      |
