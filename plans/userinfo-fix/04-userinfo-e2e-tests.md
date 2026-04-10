# UserInfo E2E Tests: UserInfo (/me) Endpoint

> **Document**: 04-userinfo-e2e-tests.md
> **Parent**: [Index](00-index.md)

## Overview

Create a dedicated Playwright E2E test file (`tests/ui/flows/userinfo.spec.ts`) that comprehensively tests the `/me` (userinfo) endpoint. This file exercises the endpoint after obtaining tokens through the full authorization code flow, then validates happy path, error cases, and scope-filtered claims.

## Architecture

### Test Flow

Each test that needs a valid token follows this flow:

```
1. Build OIDC auth URL with PKCE → navigate to login page
2. Fill in credentials → submit login form
3. Grant consent
4. Capture redirect with authorization code
5. Exchange code for tokens (POST /token with client_secret_post)
6. Use access_token to call GET /{orgSlug}/me
7. Assert response
```

The token acquisition (steps 1-5) is reused across tests. The test file uses the existing `confidential client` infrastructure seeded in `global-setup.ts`.

### Test Infrastructure Reuse

| Component | Source | Notes |
| --------- | ------ | ----- |
| Org, app, user, client seeding | `global-setup.ts` | Already seeds confidential client entities |
| PKCE helpers | `test-fixtures.ts` | `generateCodeVerifier()`, `generateCodeChallenge()` |
| Test data fixture | `test-fixtures.ts` | `testData` with `confClientId`, `confClientSecret`, `confOrgSlug`, etc. |
| Auth flow helper | `test-fixtures.ts` | `startAuthFlow()` navigates to login page with PKCE |

## Implementation Details

### New File: `tests/ui/flows/userinfo.spec.ts`

#### Test Cases

| # | Test Name | Scopes | Expected |
|---|-----------|--------|----------|
| 1 | `GET /me returns user profile and email claims` | `openid profile email` | 200 with `sub`, `email`, `name`, `family_name`, `given_name` |
| 2 | `GET /me rejects invalid bearer token` | — | 401 |
| 3 | `GET /me rejects missing Authorization header` | — | 400 or 401 |
| 4 | `GET /me with openid-only scope returns minimal claims` | `openid` | 200 with `sub` only (no email, no profile) |

#### Helper: Token Acquisition

To avoid duplicating the full auth flow in every test, implement a shared helper within the test file:

```typescript
async function acquireTokens(
  page: Page,
  testData: TestData,
  baseUrl: string,
  scopes: string,
): Promise<{ accessToken: string; idToken: string }> {
  // 1. Build auth URL with PKCE
  // 2. Navigate to login page
  // 3. Fill credentials + submit
  // 4. Grant consent
  // 5. Capture auth code from redirect
  // 6. POST /token with client_secret_post + PKCE
  // 7. Return { accessToken, idToken }
}
```

#### Test Structure

```typescript
test.describe('UserInfo (/me) endpoint', () => {
  test('GET /me returns user profile and email claims', async ({ page, testData }) => {
    const { accessToken } = await acquireTokens(page, testData, baseUrl, 'openid profile email');
    const response = await fetch(`${baseUrl}/${orgSlug}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(response.status).toBe(200);
    const claims = await response.json();
    expect(claims.sub).toBeDefined();
    expect(claims.email).toBe(testData.confUserEmail);
    expect(claims.name).toBeDefined();
  });

  test('GET /me rejects invalid bearer token', async ({ testData }) => {
    const response = await fetch(`${baseUrl}/${orgSlug}/me`, {
      headers: { Authorization: 'Bearer invalid-token-12345' },
    });
    expect(response.status).toBe(401);
  });

  test('GET /me rejects missing Authorization header', async ({ testData }) => {
    const response = await fetch(`${baseUrl}/${orgSlug}/me`);
    expect([400, 401]).toContain(response.status);
  });

  test('GET /me with openid-only scope returns sub only', async ({ page, testData }) => {
    const { accessToken } = await acquireTokens(page, testData, baseUrl, 'openid');
    const response = await fetch(`${baseUrl}/${orgSlug}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(response.status).toBe(200);
    const claims = await response.json();
    expect(claims.sub).toBeDefined();
    expect(claims.email).toBeUndefined();
    expect(claims.name).toBeUndefined();
  });
});
```

### Updated File: `tests/ui/flows/confidential-client.spec.ts`

Change the userinfo step (Step 8) from graceful 401-acceptance to strict 200 assertion:

```typescript
// BEFORE (graceful)
if (meResponse.status === 200) {
  // validate
} else {
  expect(meResponse.status).toBe(401);
}

// AFTER (strict)
expect(meResponse.status).toBe(200);
const meClaims = await meResponse.json();
expect(meClaims.sub).toBe(subject);
expect(meClaims.email).toBe(testData.confUserEmail);
```

## Error Handling

| Error Case | Expected Response | Test Coverage |
| ---------- | ----------------- | ------------- |
| Valid token, full scopes | 200 + claims | Test 1 |
| Invalid token | 401 | Test 2 |
| Missing Authorization | 400 or 401 | Test 3 |
| Valid token, minimal scope | 200 + `sub` only | Test 4 |

## Testing Requirements

- All 4 new tests must pass
- Existing 26 Playwright tests must continue passing
- All 2013+ unit/integration tests must pass
- `yarn verify` must pass
