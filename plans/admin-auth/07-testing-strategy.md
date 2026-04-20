# Testing Strategy: Admin API Authentication

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

- Unit tests: 90%+ coverage for all new modules
- Integration tests: All admin API endpoints with auth verification
- E2E tests: Complete bootstrap → login → admin operation flow

### What Changes, What Doesn't

| Test Area | Action | Rationale |
|-----------|--------|-----------|
| Service-layer unit tests (~2000) | **No change** | Service layer is untouched |
| CLI unit tests (~220) | **Rewrite** | Service mocks → HTTP mocks |
| Admin route integration tests (~8 files) | **Update** | Add Bearer token to all requests |
| OIDC/Auth integration tests | **No change** | Different code path |
| E2E tests | **No change** | Test OIDC flows, not admin API |
| Playwright UI tests | **No change** | Test login UI, not admin API |
| Pentest admin tests | **Update** | Test new auth mechanism |

## Test Categories

### Unit Tests

#### Admin Auth Middleware (`tests/unit/middleware/admin-auth.test.ts`)

| Test | Description | Priority |
|------|-------------|----------|
| Returns 401 when no Authorization header | Missing header → 401 | High |
| Returns 401 when header is not Bearer | `Authorization: Basic xxx` → 401 | High |
| Returns 401 when token is malformed | Non-JWT string → 401 | High |
| Returns 401 when JWT signature is invalid | Tampered token → 401 | High |
| Returns 401 when JWT is expired | Past exp claim → 401 | High |
| Returns 401 when issuer is wrong | Different issuer → 401 | High |
| Returns 401 when user not found | Valid JWT, deleted user → 401 | High |
| Returns 401 when user is not active | Suspended/locked user → 401 | High |
| Returns 403 when user not in super-admin org | Regular org user → 403 | High |
| Returns 403 when user lacks admin role | Super-admin org but no role → 403 | High |
| Sets ctx.state.adminUser on success | Valid admin → adminUser populated | High |
| Passes with valid admin token | Full happy path | High |

#### Token Store (`tests/unit/cli/token-store.test.ts`)

| Test | Description | Priority |
|------|-------------|----------|
| Writes credentials with 0600 permissions | File mode check | High |
| Creates ~/.porta/ directory if missing | Directory creation | High |
| Reads stored credentials correctly | Round-trip write/read | High |
| Returns null when no credentials file | Missing file handling | High |
| Clears credentials (deletes file) | Logout cleanup | High |
| Detects expired tokens (with 60s buffer) | Expiry calculation | High |
| Detects valid (non-expired) tokens | Non-expired check | Medium |
| Refreshes expired token via token endpoint | Refresh grant flow | High |
| Returns null when refresh fails (server error) | Error handling | High |
| Returns null when refresh token is revoked | Revoked token | Medium |

#### HTTP Client (`tests/unit/cli/http-client.test.ts`)

| Test | Description | Priority |
|------|-------------|----------|
| Attaches Bearer token to requests | Auth header formation | High |
| Auto-refreshes expired token before request | Transparent refresh | High |
| Exits with message when not logged in | No credentials → error | High |
| Exits with message when refresh fails | Expired session → error | High |
| Maps 401 response to auth error | HTTP error mapping | High |
| Maps 403 response to permission error | HTTP error mapping | High |
| Maps 400 response with validation details | Zod error mapping | High |
| Maps 404 response to not-found error | HTTP error mapping | Medium |
| Maps 500 response to server error | HTTP error mapping | Medium |
| Builds correct URL with query params (GET) | URL construction | Medium |
| Sends JSON body (POST/PUT) | Request body | Medium |

#### Init Command (`tests/unit/cli/commands/init.test.ts`)

| Test | Description | Priority |
|------|-------------|----------|
| Creates admin app, client, role, permissions, user | Full happy path | High |
| Refuses when admin app already exists | Safety guard | High |
| Allows re-init with --force flag | Force flag | Medium |
| Works in non-interactive mode (all flags) | CI mode | Medium |
| Ensures signing keys exist | Key bootstrap | Medium |
| Reports error when super-admin org missing | Pre-condition check | High |

#### Login/Logout/Whoami (`tests/unit/cli/commands/auth.test.ts`)

| Test | Description | Priority |
|------|-------------|----------|
| Login generates valid PKCE parameters | S256 challenge | High |
| Login starts localhost callback server | Server creation | High |
| Login stores tokens after successful flow | Token persistence | High |
| Logout clears stored credentials | Token cleanup | High |
| Whoami displays user info | Identity display | Medium |
| Whoami warns when not logged in | Missing creds | Medium |
| Whoami warns when token expired | Expired creds | Medium |

#### Migrated CLI Commands (per command file)

Each migrated command file gets unit tests that mock the HTTP client:

| Test Pattern | Description | Priority |
|-------------|-------------|----------|
| Happy path: command sends correct HTTP request | Verify URL, method, body | High |
| Happy path: command formats output correctly | Table/JSON output | High |
| Error: server returns 404 | Not-found handling | Medium |
| Error: server returns 400 with details | Validation error display | Medium |
| Error: server returns 500 | Server error handling | Medium |

### Integration Tests

#### Admin Auth Integration (`tests/integration/middleware/admin-auth.test.ts`)

| Test | Components | Description |
|------|-----------|-------------|
| Full auth flow with real JWT | Signing keys + JWT + middleware | Issue real token, validate it |
| 401 for anonymous request | Middleware + route | No token → 401 |
| 401 for expired token | Signing keys + JWT + middleware | Issue expired token → 401 |
| 403 for non-admin user | Users + RBAC + middleware | Regular user token → 403 |
| 200 for admin user | Full stack | Admin token → success |
| Admin identity in ctx.state | Middleware + route handler | Verify adminUser populated |

#### Admin Route Integration (update existing files)

Each existing admin route integration test file needs Bearer token support:

```typescript
// tests/integration/helpers/admin-auth.ts — NEW HELPER

/**
 * Create admin test infrastructure: super-admin org, admin app,
 * admin client, admin role, admin user. Returns a valid Bearer token.
 *
 * Used by all admin route integration tests.
 */
export async function setupAdminAuth(): Promise<{
  adminUser: User;
  adminOrg: Organization;
  bearerToken: string;
}>;

/**
 * Generate a valid JWT access token for the admin user.
 * Uses test signing keys to create a real ES256 JWT.
 */
export async function generateAdminToken(userId: string): Promise<string>;
```

Updated test pattern:

```typescript
// BEFORE:
const res = await request(app.callback())
  .post('/api/admin/organizations')
  .send({ name: 'Test Org' });

// AFTER:
const { bearerToken } = await setupAdminAuth();
const res = await request(app.callback())
  .post('/api/admin/organizations')
  .set('Authorization', `Bearer ${bearerToken}`)
  .send({ name: 'Test Org' });
```

Files to update (8 total):
- `tests/integration/routes/organizations.test.ts`
- `tests/integration/routes/applications.test.ts`
- `tests/integration/routes/clients.test.ts`
- `tests/integration/routes/users.test.ts`
- `tests/integration/routes/roles.test.ts`
- `tests/integration/routes/permissions.test.ts`
- `tests/integration/routes/user-roles.test.ts`
- `tests/integration/routes/custom-claims.test.ts`

#### Init Command Integration (`tests/integration/cli/init.test.ts`)

| Test | Description |
|------|-------------|
| Full init on clean database | Creates all entities correctly |
| Init refuses when already initialized | Safety guard works |
| Init with --force re-initializes | Force mode works |
| All created entities are valid | App, client, role, perms, user all correct |
| Admin user can authenticate | Token issued and validates |

### End-to-End Tests

#### Bootstrap-to-Admin-Operation (`tests/e2e/admin-auth/`)

| Scenario | Steps | Expected Result |
|----------|-------|-----------------|
| Full bootstrap flow | migrate → init → login → org create | Organization created successfully |
| Token refresh | Login → wait for expiry → org list | Auto-refresh, then success |
| Permission denied | Login as non-admin → org list | 403 error, clear message |
| Server not running | Login attempt without server | Clear "server unavailable" error |

### Pentest Updates

Update existing admin security pentests for the new auth mechanism:

| Test Area | Update Needed |
|-----------|--------------|
| Admin unauthorized access | Verify 401 without token |
| Admin privilege escalation | Verify non-admin token → 403 |
| JWT manipulation | Test tampered/forged tokens |
| Token replay | Test expired/revoked tokens |
| Brute force on admin endpoints | Rate limiting still works |

## Test Data

### Fixtures Needed

- Test ES256 signing key pair (for JWT generation in tests)
- Admin user fixture (super-admin org, porta-admin role)
- Non-admin user fixture (super-admin org, no admin role)
- Regular user fixture (non-super-admin org)
- Expired JWT fixture
- Malformed JWT fixture

### Test Helpers

```
tests/
  helpers/
    admin-auth.ts          — NEW: setupAdminAuth(), generateAdminToken()
  integration/
    helpers/
      admin-fixtures.ts    — NEW: createAdminTestData(), cleanupAdminTestData()
```

## Verification Checklist

- [ ] All existing service-layer unit tests still pass (unchanged)
- [ ] All new middleware unit tests pass
- [ ] All new CLI unit tests pass (HTTP mocks)
- [ ] All admin route integration tests pass (with Bearer token)
- [ ] All new integration tests pass (init, auth flow)
- [ ] E2E admin flow tests pass
- [ ] No regressions in OIDC/auth/2FA tests
- [ ] No regressions in playground functionality
- [ ] `yarn verify` passes clean
