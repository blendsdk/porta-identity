# E2E Tests: Testing Strategy

> **Document**: 06-e2e-tests.md
> **Parent**: [Index](00-index.md)

## Overview

End-to-end tests exercise complete HTTP flows against a real running Porta server (Koa + OIDC provider + PostgreSQL + Redis + MailHog). They verify that OIDC flows, authentication workflows, multi-tenant isolation, invalid parameter handling, and security controls work correctly from the perspective of an HTTP client.

## Architecture

### Test Structure

```
tests/e2e/
├── setup.ts                        # Start test server, seed data
├── teardown.ts                     # Stop server, cleanup
├── helpers/
│   ├── http-client.ts             # HTTP client wrapper for test requests
│   ├── oidc-client.ts            # OIDC client helper (auth URLs, code exchange)
│   └── mailhog.ts                # MailHog API client (read/assert emails)
├── flows/                          # OIDC protocol flow tests
│   ├── discovery.test.ts          # OIDC discovery endpoint
│   ├── authorization-code.test.ts # Complete auth code + PKCE flow
│   ├── client-credentials.test.ts # Client credentials flow
│   ├── refresh-token.test.ts      # Refresh token rotation
│   ├── token-introspection.test.ts # Token introspection
│   └── token-revocation.test.ts   # Token revocation
├── auth/                           # Authentication workflow tests
│   ├── password-login.test.ts     # Password login flow
│   ├── magic-link.test.ts        # Magic link login flow
│   ├── forgot-password.test.ts   # Forgot/reset password flow
│   └── consent.test.ts           # Consent flow
├── invalid-params/                 # Invalid parameter / negative path tests
│   ├── authorization.test.ts      # Invalid auth endpoint params
│   ├── token-exchange.test.ts     # Invalid token endpoint params
│   ├── consent-interaction.test.ts # Invalid consent/interaction params
│   ├── login-form.test.ts        # Invalid login form submissions
│   └── introspection-revocation.test.ts # Invalid introspection/revocation
├── multi-tenant/                   # Multi-tenant tests
│   ├── tenant-isolation.test.ts   # User/client isolation per org
│   └── issuer-resolution.test.ts  # Per-org OIDC issuer
└── security/                       # Security-focused E2E tests
    ├── rate-limiting.test.ts      # Rate limit enforcement
    ├── csrf.test.ts               # CSRF protection
    └── user-enumeration.test.ts   # No user enumeration
```

---

## Implementation Details

### E2E Test Helpers

#### HTTP Client (`http-client.ts`)

A lightweight HTTP client wrapper that manages cookies and follows redirects intelligently for OIDC flows.

```typescript
/**
 * HTTP client for E2E test requests.
 * Manages cookie jar, follows/records redirects, parses responses.
 */
export class TestHttpClient {
  private baseUrl: string;
  private cookies: Map<string, string>;

  constructor(baseUrl: string) { /* ... */ }

  /** GET request with optional cookie/header overrides */
  async get(path: string, options?: RequestOptions): Promise<TestResponse> { /* ... */ }

  /** POST request with form body or JSON */
  async post(path: string, body: Record<string, string>, options?: RequestOptions): Promise<TestResponse> { /* ... */ }

  /** Follow redirect chain and return all intermediate responses */
  async followRedirects(url: string, maxRedirects?: number): Promise<RedirectChain> { /* ... */ }

  /** Extract CSRF token from HTML form page */
  extractCsrfToken(html: string): string | null { /* ... */ }

  /** Clear cookie jar */
  clearCookies(): void { /* ... */ }
}

interface TestResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  json?: unknown;
  location?: string; // Redirect location
}
```

#### OIDC Test Client (`oidc-client.ts`)

Higher-level OIDC client that builds authorization URLs, handles PKCE, and exchanges codes.

```typescript
/**
 * OIDC test client for E2E tests.
 * Builds authorization URLs with PKCE, exchanges codes for tokens,
 * introspects tokens, and performs other OIDC operations.
 */
export class OidcTestClient {
  constructor(
    private baseUrl: string,
    private orgSlug: string,
    private clientId: string,
    private clientSecret?: string,
  ) {}

  /** Build authorization URL with PKCE challenge */
  buildAuthorizationUrl(options?: {
    scope?: string;
    state?: string;
    nonce?: string;
    redirectUri?: string;
  }): AuthorizationRequest { /* ... */ }

  /** Exchange authorization code for tokens (with PKCE verifier) */
  async exchangeCode(code: string, codeVerifier: string, redirectUri?: string): Promise<TokenSet> { /* ... */ }

  /** Refresh tokens using a refresh_token */
  async refreshToken(refreshToken: string): Promise<TokenSet> { /* ... */ }

  /** Introspect a token */
  async introspect(token: string, tokenTypeHint?: string): Promise<IntrospectionResult> { /* ... */ }

  /** Revoke a token */
  async revoke(token: string, tokenTypeHint?: string): Promise<void> { /* ... */ }

  /** Get tokens via client_credentials grant */
  async clientCredentials(scope?: string): Promise<TokenSet> { /* ... */ }

  /** Fetch the OIDC discovery document */
  async discovery(): Promise<DiscoveryDocument> { /* ... */ }

  /** Fetch the JWKS endpoint */
  async jwks(): Promise<JWKSDocument> { /* ... */ }
}

interface AuthorizationRequest {
  url: string;
  codeVerifier: string;
  codeChallenge: string;
  state: string;
  nonce: string;
}

interface TokenSet {
  access_token: string;
  token_type: string;
  expires_in: number;
  id_token?: string;
  refresh_token?: string;
  scope?: string;
}
```

#### MailHog Client (`mailhog.ts`)

```typescript
/**
 * MailHog API client for verifying email delivery in E2E tests.
 * Connects to MailHog's REST API to retrieve and inspect captured emails.
 */
export class MailHogClient {
  constructor(private baseUrl: string = process.env.TEST_MAILHOG_URL ?? 'http://localhost:8025') {}

  /** Get all captured messages */
  async getMessages(): Promise<MailHogMessage[]> { /* ... */ }

  /** Get the latest message for a specific recipient email */
  async getLatestFor(email: string): Promise<MailHogMessage | null> { /* ... */ }

  /** Wait for a message to arrive for a recipient (with polling) */
  async waitForMessage(email: string, timeoutMs?: number): Promise<MailHogMessage> { /* ... */ }

  /** Extract a URL link from an email body matching a pattern */
  extractLink(message: MailHogMessage, pattern: RegExp): string | null { /* ... */ }

  /** Delete all captured messages */
  async clearAll(): Promise<void> { /* ... */ }
}

interface MailHogMessage {
  id: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  html: string;
  receivedAt: Date;
}
```

---

### OIDC Flow Tests

#### Discovery Endpoint (`discovery.test.ts`)

| # | Test Case | Expected Result |
|---|-----------|----------------|
| 1 | `GET /:orgSlug/.well-known/openid-configuration` | Returns valid discovery document with correct issuer |
| 2 | Issuer matches org base URL | `issuer` field is `{baseUrl}/{orgSlug}` |
| 3 | All required endpoints present | authorization, token, userinfo, jwks_uri, introspection, revocation |
| 4 | Supported scopes listed | `openid`, `profile`, `email`, `address`, `phone` |
| 5 | Supported grant types listed | `authorization_code`, `client_credentials`, `refresh_token` |
| 6 | JWKS endpoint returns valid keys | Response contains ES256 public key(s) |
| 7 | Different orgs have different issuers | Org A's issuer ≠ Org B's issuer |

#### Authorization Code + PKCE Flow (`authorization-code.test.ts`)

| # | Test Case | Expected Result |
|---|-----------|----------------|
| 1 | Complete happy path flow | Auth → login → consent → code → tokens (access + id + refresh) |
| 2 | ID token contains correct claims | `sub`, `iss`, `aud`, `nonce`, profile claims |
| 3 | Access token is valid JWT | Properly signed ES256, correct `iss`, `aud` |
| 4 | Token `sub` matches user ID | Subject claim = authenticated user's ID |
| 5 | Scopes respected in claims | `profile` scope → name claims, `email` → email claim |
| 6 | State parameter returned | Callback includes original `state` |
| 7 | Authorization code is single-use | Second exchange returns error |
| 8 | Expired authorization code rejected | Wait beyond TTL, exchange fails |

#### Client Credentials Flow (`client-credentials.test.ts`)

| # | Test Case | Expected Result |
|---|-----------|----------------|
| 1 | Complete happy path | POST to token endpoint → access token |
| 2 | Token has correct `client_id` claim | `client_id` in token matches |
| 3 | No ID token returned | Client credentials doesn't issue ID tokens |
| 4 | No refresh token returned | Client credentials doesn't issue refresh tokens |
| 5 | Scope restriction | Only granted scopes appear in token |
| 6 | Invalid client secret rejected | 401 error |
| 7 | Revoked client rejected | Proper error response |

#### Refresh Token Rotation (`refresh-token.test.ts`)

| # | Test Case | Expected Result |
|---|-----------|----------------|
| 1 | Refresh returns new token set | New access + refresh tokens |
| 2 | Old refresh token rejected after rotation | Previous refresh token no longer valid |
| 3 | Token refresh preserves scope | Same scopes in new tokens |
| 4 | Multiple sequential refreshes work | Each rotation produces valid tokens |
| 5 | Expired refresh token rejected | Proper error after TTL |

#### Token Introspection (`token-introspection.test.ts`)

| # | Test Case | Expected Result |
|---|-----------|----------------|
| 1 | Active access token | `active: true` with claims |
| 2 | Expired token | `active: false` |
| 3 | Revoked token | `active: false` |
| 4 | Invalid/random token | `active: false` |
| 5 | Correct token metadata | `client_id`, `scope`, `exp`, `iss` present |

#### Token Revocation (`token-revocation.test.ts`)

| # | Test Case | Expected Result |
|---|-----------|----------------|
| 1 | Revoke access token | 200 OK, token no longer introspectable as active |
| 2 | Revoke refresh token | 200 OK, refresh no longer usable |
| 3 | Revoke already-revoked token | 200 OK (idempotent) |
| 4 | Revoke invalid token | 200 OK (spec says always 200) |

---

### Authentication Workflow Tests

#### Password Login Flow (`password-login.test.ts`)

| # | Test Case | Expected Result |
|---|-----------|----------------|
| 1 | Successful password login | Login → redirect to consent/callback with code |
| 2 | Invalid password rejected | Error message shown, no redirect |
| 3 | Non-existent user rejected | Same error as invalid password (no enumeration) |
| 4 | Locked account rejected | Account locked error message |
| 5 | Suspended account rejected | Account suspended error message |
| 6 | Login tracks lastLoginAt | User's login timestamp updated |
| 7 | CSRF token required | POST without CSRF token rejected |

#### Magic Link Flow (`magic-link.test.ts`)

| # | Test Case | Expected Result |
|---|-----------|----------------|
| 1 | Request magic link → email sent | Email appears in MailHog with valid link |
| 2 | Click magic link → authenticated | Redirect to callback with auth code |
| 3 | Magic link is single-use | Second click returns error |
| 4 | Expired magic link rejected | Error after TTL |
| 5 | Non-existent email → same response | No enumeration (202 always) |
| 6 | Link URL contains correct token | Token in URL matches DB |

#### Forgot/Reset Password (`forgot-password.test.ts`)

| # | Test Case | Expected Result |
|---|-----------|----------------|
| 1 | Request reset → email sent | Reset email appears in MailHog |
| 2 | Use reset link → password updated | New password works for login |
| 3 | Old password no longer works | Login with old password fails |
| 4 | Reset token is single-use | Second use returns error |
| 5 | Expired reset token rejected | Error after TTL |
| 6 | Non-existent email → same response | No enumeration |

#### Consent Flow (`consent.test.ts`)

| # | Test Case | Expected Result |
|---|-----------|----------------|
| 1 | First-party client auto-consents | No consent page shown |
| 2 | Third-party client shows consent | Consent page rendered |
| 3 | User grants consent | Redirect with auth code |
| 4 | User denies consent | Redirect with `access_denied` error |
| 5 | Previously-granted scopes remembered | No re-consent for same scopes |

---

### Invalid Parameter Tests

These test that the server returns proper OIDC-compliant error responses when clients send malformed, missing, or invalid parameters. Every assertion verifies both the HTTP status code AND the error code/description in the response body.

#### Authorization Endpoint Invalid Params (`authorization.test.ts`)

| # | Test Case | Invalid Parameter | Expected Error |
|---|-----------|-------------------|----------------|
| 1 | Missing client_id | Omit entirely | `invalid_request` |
| 2 | Unknown client_id | Random UUID | Error page (no redirect_uri to send error to) |
| 3 | Revoked client | Valid but revoked client_id | Error page |
| 4 | Missing redirect_uri | Omit entirely | Error page (can't redirect error) |
| 5 | Mismatched redirect_uri | `https://evil.com/callback` | Error page |
| 6 | Invalid response_type | `response_type=token` | `unsupported_response_type` |
| 7 | Missing response_type | Omit entirely | `invalid_request` |
| 8 | Empty scope | `scope=` | Handled gracefully |
| 9 | Missing PKCE code_challenge | Omit when PKCE enforced | `invalid_request` |
| 10 | Invalid code_challenge_method | `code_challenge_method=plain` | `invalid_request` |
| 11 | Missing nonce for openid | Omit nonce with `scope=openid` | `invalid_request` |
| 12 | Duplicate parameters | `client_id` twice | Handled gracefully |
| 13 | Excessively long state | 10KB state value | Handled gracefully |
| 14 | Special characters in state | `state=<script>alert(1)</script>` | Properly escaped/handled |

#### Token Endpoint Invalid Params (`token-exchange.test.ts`)

| # | Test Case | Invalid Parameter | Expected Error |
|---|-----------|-------------------|----------------|
| 1 | Missing grant_type | Omit entirely | `invalid_request` (400) |
| 2 | Unsupported grant_type | `grant_type=password` | `unsupported_grant_type` (400) |
| 3 | Invalid authorization code | Random string | `invalid_grant` (400) |
| 4 | Expired authorization code | Use after TTL | `invalid_grant` (400) |
| 5 | Already-used code | Exchange twice | `invalid_grant` (400) |
| 6 | Wrong code_verifier | Mismatched PKCE verifier | `invalid_grant` (400) |
| 7 | Missing code_verifier | Omit when PKCE used | `invalid_grant` (400) |
| 8 | Wrong redirect_uri | Different from auth request | `invalid_grant` (400) |
| 9 | Invalid client credentials | Wrong secret | `invalid_client` (401) |
| 10 | Missing client authentication | No auth header, no body creds | `invalid_client` (401) |
| 11 | Expired refresh token | Use after TTL | `invalid_grant` (400) |
| 12 | Revoked refresh token | Use after revocation | `invalid_grant` (400) |
| 13 | Client credentials with wrong scope | Scope not granted | Scope rejected or ignored |
| 14 | Empty POST body | No parameters at all | `invalid_request` (400) |

#### Consent/Interaction Invalid Params (`consent-interaction.test.ts`)

| # | Test Case | Invalid Parameter | Expected Error |
|---|-----------|-------------------|----------------|
| 1 | Invalid interaction UID | Random string | Redirect to auth start or error page |
| 2 | Expired interaction | Wait beyond TTL | Restart flow |
| 3 | Missing interaction cookie | No session cookie | Error page |
| 4 | Tampered consent data | Modified form fields | Rejected |

#### Login Form Invalid Params (`login-form.test.ts`)

| # | Test Case | Invalid Parameter | Expected Error |
|---|-----------|-------------------|----------------|
| 1 | Missing email | Empty email field | Validation error displayed |
| 2 | Invalid email format | `not-an-email` | Validation error |
| 3 | Missing password | Empty password field | Validation error |
| 4 | Empty body | Submit empty POST | Validation error |
| 5 | Extra unexpected fields | `admin=true` in body | Ignored, no privilege escalation |
| 6 | Invalid content type | Send JSON instead of form | Handled gracefully |

#### Introspection/Revocation Invalid Params (`introspection-revocation.test.ts`)

| # | Test Case | Invalid Parameter | Expected Error |
|---|-----------|-------------------|----------------|
| 1 | Introspection: missing token | Omit token param | `invalid_request` or `active: false` |
| 2 | Introspection: malformed token | Random string | `active: false` |
| 3 | Introspection: no client auth | No credentials | `invalid_client` (401) |
| 4 | Revocation: missing token | Omit token param | 200 (spec: always 200) |
| 5 | Revocation: no client auth | No credentials | `invalid_client` (401) |

---

### Multi-Tenant Tests

#### Tenant Isolation (`tenant-isolation.test.ts`)

| # | Test Case | Expected Result |
|---|-----------|----------------|
| 1 | User in Org A can't auth via Org B | Login fails — user not found in Org B |
| 2 | Client in Org A can't auth via Org B | Client not found for Org B |
| 3 | Token from Org A not valid in Org B context | Different issuers |
| 4 | User listing scoped to org | API returns only org's users |
| 5 | Suspended org blocks all auth | 403 for any auth flow |
| 6 | Archived org blocks all auth | 404 for any auth flow |

#### Issuer Resolution (`issuer-resolution.test.ts`)

| # | Test Case | Expected Result |
|---|-----------|----------------|
| 1 | Each org has unique issuer | `{baseUrl}/{orgSlug}` pattern |
| 2 | Discovery doc per org | Different discovery endpoints per org |
| 3 | Tokens have org-specific issuer | `iss` claim matches org |
| 4 | JWKS shared across orgs | Same signing keys for all orgs |

---

### Security E2E Tests

#### Rate Limiting (`rate-limiting.test.ts`)

| # | Test Case | Expected Result |
|---|-----------|----------------|
| 1 | Login rate limit enforced | After N failed attempts, 429 returned |
| 2 | Magic link request rate limit | After N requests, 429 returned |
| 3 | Rate limit resets after window | After cooldown, requests work again |

#### CSRF Protection (`csrf.test.ts`)

| # | Test Case | Expected Result |
|---|-----------|----------------|
| 1 | Login form includes CSRF token | Token present in HTML |
| 2 | POST without CSRF token rejected | 403 error |
| 3 | POST with invalid CSRF token rejected | 403 error |
| 4 | POST with valid CSRF token accepted | Request processed |

#### User Enumeration Prevention (`user-enumeration.test.ts`)

| # | Test Case | Expected Result |
|---|-----------|----------------|
| 1 | Login: existing vs non-existing email | Same error message and timing |
| 2 | Magic link: existing vs non-existing | Same response (202) |
| 3 | Password reset: existing vs non-existing | Same response (202) |

---

## Error Handling

| Error Case | Handling Strategy |
|------------|-------------------|
| Server startup fails | Global setup throws with clear error |
| E2E test timeout | 60s timeout, clear test isolation |
| MailHog not available | Polling with timeout, clear error message |
| Flaky redirect chains | `followRedirects()` with max-redirect limit |
| Cookie handling complexity | `TestHttpClient` manages cookie jar automatically |

## Testing Requirements

- All OIDC flows tested end-to-end with real server
- All auth workflows tested including email verification via MailHog
- All invalid parameter combinations verified with correct error codes
- Multi-tenant isolation verified across organizations
- Rate limiting and CSRF protection verified
- Estimated: ~100-120 E2E test cases
