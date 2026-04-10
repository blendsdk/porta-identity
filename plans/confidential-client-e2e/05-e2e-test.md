# E2E Test: Confidential Client Workflow

> **Document**: 05-e2e-test.md
> **Parent**: [Index](00-index.md)

## Overview

Playwright test at `tests/ui/flows/confidential-client.spec.ts` that exercises
the complete confidential client OIDC workflow end-to-end.

## Test Setup

### Seed Confidential Client in Global Setup

In `tests/ui/setup/global-setup.ts`:
1. Create a confidential client (type: `confidential`, auth method: `client_secret_post`)
2. Generate a client secret
3. Export `CONF_CLIENT_ID`, `CONF_CLIENT_SECRET` as env vars

### Add to Test Fixtures

In `tests/ui/fixtures/test-fixtures.ts`:
1. Add `confClientId` and `confClientSecret` to `TestData`
2. Add `startConfidentialAuthFlow(page)` helper that generates PKCE and starts
   the auth flow with the confidential client

## Test Workflow

### Step 1: Authentication + Consent

```
1. startConfidentialAuthFlow(page) → navigate to login page
2. Fill email + password → submit login form
3. Handle consent page (approve scopes: openid profile email)
4. Capture redirect URL with authorization code
```

### Step 2: Token Exchange (client_secret_post)

```
POST /:orgSlug/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={auth_code}
&redirect_uri={redirect_uri}
&client_id={client_id}
&client_secret={plaintext_secret}
&code_verifier={pkce_verifier}
```

Use Playwright's `request.post()` API (NOT browser fetch — avoids CORS).

**Assertions:**
- Status 200
- Response contains `access_token`, `id_token`, `token_type: 'Bearer'`
- `refresh_token` present (if `offline_access` requested)

### Step 3: ID Token Validation

Decode the JWT `id_token` (base64url decode, no signature check needed in test):

**Assertions:**
- `iss` matches the issuer URL (`http://localhost:{port}/{orgSlug}`)
- `aud` matches `client_id`
- `sub` is present and non-empty
- `email` claim present (if `email` scope requested)
- `iat` and `exp` are valid timestamps
- `nonce` matches the one sent in the auth request

### Step 4: Token Introspection

```
POST /:orgSlug/token/introspection
Content-Type: application/x-www-form-urlencoded

token={access_token}
&client_id={client_id}
&client_secret={plaintext_secret}
```

**Assertions:**
- Status 200
- `active: true`
- `client_id` matches
- `token_type: 'access_token'`
- `sub` present

### Step 5: UserInfo Request

```
GET /:orgSlug/me
Authorization: Bearer {access_token}
```

**Assertions:**
- Status 200
- `sub` matches ID token `sub`
- `email` matches test user email
- `name` or profile claims present (if `profile` scope)

## Error Handling

| Error Case | Expected Behavior |
|------------|-------------------|
| Invalid client_secret | Token endpoint returns 401 `invalid_client` |
| Expired auth code | Token endpoint returns 400 `invalid_grant` |
| Missing code_verifier | Token endpoint returns 400 (PKCE required) |
| Invalid access_token for userinfo | Returns 401 |
