# Penetration Tests: Testing Strategy

> **Document**: 07-penetration-tests.md
> **Parent**: [Index](00-index.md)

## Overview

Porta v5 is a **public-facing multi-tenant OIDC identity provider**. It is the single most critical component in the authentication chain — if Porta is compromised, every downstream application, every tenant, and every user is compromised. These penetration tests approach Porta from the perspective of a determined adversary, systematically probing every attack surface.

**Mindset:** Every test in this suite asks "Can I break this?" rather than "Does this work?" We think like:
- 🎩 **Expert Pentester** — Trying every known CVE and attack vector against OIDC providers
- 🏴‍☠️ **White-Hat Hacker** — Creative exploitation, chaining vulnerabilities, thinking laterally
- 🛡️ **IT Security Officer** — OWASP compliance, defense-in-depth, zero-trust verification
- 🔧 **SSO Engineer** — RFC 6749/7636/7009 spec compliance, protocol-level attacks

## Architecture

### Test Structure

```
tests/pentest/
├── setup.ts                        # Pentest global setup (reuses shared server setup)
├── teardown.ts                     # Pentest global teardown
├── helpers/
│   └── attack-client.ts           # HTTP client with attack utilities
├── oidc-attacks/                   # OIDC protocol-level attacks
│   ├── pkce-bypass.test.ts        # PKCE enforcement bypass attempts
│   ├── redirect-uri-manipulation.test.ts  # Redirect URI attacks
│   ├── code-injection.test.ts     # Authorization code injection
│   ├── token-substitution.test.ts # Token cross-use attacks
│   ├── scope-escalation.test.ts   # Privilege escalation via scopes
│   └── refresh-token-replay.test.ts # Refresh token replay/race conditions
├── auth-bypass/                    # Authentication bypass attacks
│   ├── sql-injection.test.ts      # SQL injection in auth flows
│   ├── brute-force.test.ts        # Credential brute force
│   ├── timing-attacks.test.ts     # Timing-based information leaks
│   └── session-attacks.test.ts    # Session fixation/hijacking
├── magic-link-attacks/             # Magic link & password reset attacks
│   ├── token-prediction.test.ts   # Token predictability analysis
│   ├── token-replay.test.ts       # Token reuse/replay attacks
│   ├── host-header-injection.test.ts  # URL poisoning via Host header
│   └── email-enumeration.test.ts  # Email existence detection
├── admin-security/                 # Admin API security
│   ├── unauthorized-access.test.ts    # Access without authentication
│   ├── privilege-escalation.test.ts   # Regular user → admin
│   ├── idor.test.ts                   # Insecure direct object references
│   └── mass-assignment.test.ts        # Extra fields in requests
├── injection/                      # Injection attacks
│   ├── sql-injection-comprehensive.test.ts  # SQL injection across all inputs
│   ├── xss.test.ts                # Cross-site scripting
│   ├── header-injection.test.ts   # CRLF / header injection
│   └── template-injection.test.ts # Server-side template injection
├── crypto-attacks/                 # Cryptographic attacks
│   ├── jwt-algorithm-confusion.test.ts  # alg:none, HS256 confusion
│   ├── jwt-manipulation.test.ts   # Payload tampering, clock manipulation
│   └── key-confusion.test.ts      # Key ID manipulation
├── multi-tenant-attacks/           # Multi-tenant exploitation
│   ├── cross-tenant-auth.test.ts  # Cross-tenant authentication
│   ├── tenant-enumeration.test.ts # Tenant discovery/enumeration
│   └── slug-injection.test.ts     # Injection via org slug URL param
└── infrastructure/                 # Infrastructure-level attacks
    ├── http-security-headers.test.ts  # Missing/weak HTTP headers
    ├── cors-misconfiguration.test.ts  # CORS policy testing
    ├── method-tampering.test.ts   # HTTP method override attacks
    └── information-disclosure.test.ts # Error messages, stack traces, debug info
```

### Attack Client Helper

```typescript
// tests/pentest/helpers/attack-client.ts
//
// Extended HTTP client with attack-specific utilities.
// Inherits from TestHttpClient but adds methods for crafting malicious requests.

/**
 * Attack client for penetration tests.
 * Provides utilities for crafting malicious requests, timing measurements,
 * and bypassing normal client-side validation.
 */
export class AttackClient {
  constructor(private baseUrl: string) {}

  /** Send raw HTTP request with full control over method, headers, body */
  async rawRequest(options: RawRequestOptions): Promise<RawResponse> { /* ... */ }

  /** Measure response time in milliseconds (for timing attacks) */
  async timedRequest(method: string, path: string, body?: string): Promise<{ response: RawResponse; durationMs: number }> { /* ... */ }

  /** Send request with specific Host header (for host header injection) */
  async withHostHeader(host: string, path: string): Promise<RawResponse> { /* ... */ }

  /** Send request with injected headers */
  async withHeaders(headers: Record<string, string>, method: string, path: string): Promise<RawResponse> { /* ... */ }

  /** Send rapid-fire concurrent requests (for race conditions) */
  async concurrent(requests: Array<() => Promise<RawResponse>>, count: number): Promise<RawResponse[]> { /* ... */ }

  /** Build Basic auth header from credentials */
  basicAuth(clientId: string, clientSecret: string): string { /* ... */ }

  /** Build a crafted JWT with custom header/payload (for JWT attacks) */
  craftJwt(header: object, payload: object, signature?: string): string { /* ... */ }

  /** URL-encode with optional double-encoding (for filter bypass) */
  encode(value: string, doubleEncode?: boolean): string { /* ... */ }
}
```

---

## Implementation Details

### 1. OIDC Protocol Attacks

These tests target vulnerabilities in the OAuth 2.0 / OIDC protocol implementation itself. Every attack here has been documented in real-world CVEs against identity providers.

#### PKCE Bypass (`pkce-bypass.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Omit code_challenge entirely | Remove PKCE from auth request | Server REJECTS — PKCE is mandatory |
| 2 | Use `plain` code_challenge_method | `code_challenge_method=plain` | Server REJECTS — only S256 accepted |
| 3 | Omit code_verifier on exchange | Have code_challenge but skip verifier | Server REJECTS — `invalid_grant` |
| 4 | Send wrong code_verifier | Valid code, random verifier | Server REJECTS — `invalid_grant` |
| 5 | Replay code_challenge with different verifier | Precompute S256 of known value, use different verifier | Server REJECTS — hash mismatch |
| 6 | Empty code_challenge | `code_challenge=` | Server REJECTS — `invalid_request` |
| 7 | Extremely long code_verifier | 500-char verifier | Server REJECTS or handles gracefully |

#### Redirect URI Manipulation (`redirect-uri-manipulation.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Completely different domain | `redirect_uri=https://evil.com/callback` | REJECTED — URI not registered |
| 2 | Subdomain variation | `redirect_uri=https://evil.localhost:3001/callback` | REJECTED |
| 3 | Path traversal in redirect | `redirect_uri=http://localhost:3001/../../../etc/passwd` | REJECTED |
| 4 | Fragment injection | `redirect_uri=http://localhost:3001/callback#evil` | REJECTED or fragment stripped |
| 5 | URL-encoded variation | `redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fcallback` | Exact-match comparison |
| 6 | Open redirect via double encoding | `redirect_uri=http://localhost:3001/callback%2F..%2F..%2F` | REJECTED |
| 7 | Missing scheme | `redirect_uri=//evil.com/callback` | REJECTED |
| 8 | Data URI | `redirect_uri=data:text/html,<script>alert(1)</script>` | REJECTED |
| 9 | JavaScript URI | `redirect_uri=javascript:alert(1)` | REJECTED |
| 10 | Null byte injection | `redirect_uri=http://localhost:3001/callback%00.evil.com` | REJECTED |

#### Authorization Code Injection (`code-injection.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Use stolen code from Org A in Org B's flow | Cross-tenant code exchange | REJECTED — code bound to client/org |
| 2 | Exchange code with different client_id | Valid code, wrong client | REJECTED — code bound to requesting client |
| 3 | Exchange code with different redirect_uri | Change redirect_uri on exchange | REJECTED — must match auth request |
| 4 | Race condition: exchange same code concurrently | 10 parallel exchange requests | Only 1 succeeds, rest get `invalid_grant` |
| 5 | Code from public client used by confidential client | Type mismatch | REJECTED |

#### Token Substitution (`token-substitution.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Use access_token from Client A at Client B's resource | Cross-client token | Different `aud`, verification fails |
| 2 | Use token from Org A against Org B's endpoints | Cross-tenant token | Different `iss`, rejected |
| 3 | Use ID token as access token | Wrong token type | Rejected at resource |
| 4 | Use access token as refresh token | Type confusion | REJECTED — `invalid_grant` |

#### Scope Escalation (`scope-escalation.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Request scope not registered for client | `scope=admin:all` | Scope ignored or error |
| 2 | Request elevated scope on refresh | Broader scope than original grant | REJECTED — can't escalate |
| 3 | Request `offline_access` when not allowed | Unauthorized scope | No refresh token issued |
| 4 | Modify scope in token exchange request | Add scope to code exchange | Ignored — scope from auth request only |

#### Refresh Token Replay (`refresh-token-replay.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Replay old refresh token after rotation | Use previous refresh token | REJECTED — entire grant revoked |
| 2 | Race condition: concurrent refresh requests | 5 parallel refresh requests | Only 1 succeeds, grant preserved |
| 3 | Use refresh token from revoked client | Client revoked between token and refresh | REJECTED |
| 4 | Use refresh token from suspended user | User suspended after token issued | REJECTED |

---

### 2. Authentication Bypass Attacks

#### SQL Injection in Auth Flows (`sql-injection.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Login email field | `' OR '1'='1' --` | REJECTED — parameterized queries |
| 2 | Login email field (UNION) | `' UNION SELECT * FROM users --` | REJECTED |
| 3 | Login password field | `' OR '1'='1` | REJECTED |
| 4 | Magic link email field | `'; DROP TABLE users; --` | REJECTED |
| 5 | Password reset email field | `1'; WAITFOR DELAY '0:0:5' --` | REJECTED (no delay) |
| 6 | Organization slug in URL | `/:orgSlug/` with SQL payload | REJECTED |
| 7 | Client ID in token request | SQL in client_id param | REJECTED |
| 8 | Scope parameter | SQL in scope value | REJECTED |
| 9 | State parameter | SQL in state value | REJECTED (no DB operation) |
| 10 | Redirect URI parameter | SQL in redirect_uri | REJECTED |

#### Brute Force (`brute-force.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Rapid login attempts (same user) | 20 rapid-fire login attempts | Rate limited after threshold (429) |
| 2 | Credential stuffing (many users) | Different email/password combos | Rate limited per IP |
| 3 | Account lockout trigger | N wrong passwords for same user | Account locked |
| 4 | Magic link request flooding | Rapid magic link requests | Rate limited |
| 5 | Password reset flooding | Rapid reset requests | Rate limited |
| 6 | Client credentials brute force | Different secrets for same client_id | Rate limited |

#### Timing Attacks (`timing-attacks.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Login: valid user vs invalid user | Measure response times | Within ±20% — no significant difference |
| 2 | Login: correct password vs wrong | Measure response times | Within ±20% — constant-time comparison |
| 3 | Magic link: existing vs non-existing | Measure response times | Within ±20% |
| 4 | Password reset: existing vs non-existing | Measure response times | Within ±20% |
| 5 | Client auth: valid vs invalid secret | Measure response times | Within ±20% |

**Timing attack methodology:**
```typescript
// Run each scenario 10 times, compare median response times
// A timing difference > 20% indicates a potential information leak
const validTimes = await measureNRequests(10, () => loginWithValidEmail());
const invalidTimes = await measureNRequests(10, () => loginWithInvalidEmail());
const validMedian = median(validTimes);
const invalidMedian = median(invalidTimes);
const ratio = Math.abs(validMedian - invalidMedian) / Math.max(validMedian, invalidMedian);
expect(ratio).toBeLessThan(0.20); // < 20% difference
```

#### Session Attacks (`session-attacks.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Session fixation | Set session cookie before auth, check if reused | Session regenerated on login |
| 2 | Session cookie flags | Inspect Set-Cookie headers | HttpOnly, Secure (in prod), SameSite |
| 3 | Cross-org session reuse | Login in Org A, reuse session in Org B | Sessions are org-scoped |
| 4 | Expired session reuse | Use expired session cookie | REJECTED — session not found |

---

### 3. Magic Link & Password Reset Attacks

#### Token Prediction (`token-prediction.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Token entropy analysis | Generate 100 tokens, check for patterns | No sequential/predictable patterns |
| 2 | Token length verification | Inspect token length | Sufficient entropy (≥32 bytes, ≥256 bits) |
| 3 | Token character set | Analyze token characters | Uses full URL-safe alphabet |
| 4 | Sequential request comparison | Generate 2 tokens, compare | No shared prefix/suffix, completely random |

#### Token Replay (`token-replay.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Reuse consumed magic link token | Click same link twice | REJECTED on second use |
| 2 | Reuse consumed reset token | Submit same reset twice | REJECTED |
| 3 | Use old token after new one generated | Request 2 tokens, use first | REJECTED (latest only) OR both valid (check policy) |
| 4 | Use invitation token after acceptance | Re-use accepted invitation | REJECTED |

#### Host Header Injection (`host-header-injection.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Custom Host header on magic link request | `Host: evil.com` | Link URL uses configured ISSUER_BASE_URL, NOT Host header |
| 2 | Custom Host header on password reset | `Host: attacker.com` | Reset URL uses configured base, NOT Host header |
| 3 | X-Forwarded-Host injection | `X-Forwarded-Host: evil.com` | Ignored for URL generation |
| 4 | X-Forwarded-Proto injection | `X-Forwarded-Proto: http` | Doesn't downgrade HTTPS |
| 5 | Double Host header | Two Host headers with different values | Handled safely (no confusion) |

#### Email Enumeration (`email-enumeration.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Magic link: existing email | Request magic link for real user | Response: 202 (or success page) |
| 2 | Magic link: non-existing email | Request for fake@test.com | Same response as #1 |
| 3 | Reset: existing email | Request reset for real user | Same response format |
| 4 | Reset: non-existing email | Request for fake@test.com | Identical to #3 |
| 5 | Response body comparison | Diff response bodies | Character-for-character identical |
| 6 | Response header comparison | Diff response headers | No timing/header differences |

---

### 4. Admin API Security

#### Unauthorized Access (`unauthorized-access.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | All admin endpoints without auth | `GET/POST/PUT/DELETE /api/admin/*` | 401 for every endpoint |
| 2 | With random Bearer token | `Authorization: Bearer random` | 401 |
| 3 | With expired token | Valid format, expired | 401 |
| 4 | With user access token (not admin) | Regular user's token | 403 |
| 5 | With API key format | `X-API-Key: random` | 401 (not supported) |

#### Privilege Escalation (`privilege-escalation.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Regular user creates org | POST /api/admin/organizations | 403 |
| 2 | Regular user modifies own role | Attempt to self-assign admin role | REJECTED |
| 3 | Org admin accesses other org | Cross-tenant admin access | REJECTED — 403 |
| 4 | Modify super-admin flag | Set isSuperAdmin=true in request | Ignored or REJECTED |

#### IDOR — Insecure Direct Object References (`idor.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Access Org B's users via Org A's context | `/api/admin/organizations/{orgB}/users` | 403 or 404 |
| 2 | Modify Org B's client | PUT /api/admin/clients/{orgBClientId} | 403 |
| 3 | Access other org's audit log | Filter by foreign org ID | Empty results or 403 |
| 4 | Sequential ID enumeration | Try incrementing UUIDs | UUIDs are random, not sequential |
| 5 | Access deleted/archived resources | Reference archived org's data | Proper error handling |

#### Mass Assignment (`mass-assignment.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Create org with extra fields | `{ name: "Test", isSuperAdmin: true, id: "custom-uuid" }` | Extra fields ignored |
| 2 | Update user with status escalation | `{ status: "active" }` on locked user via wrong endpoint | Status change properly gated |
| 3 | Create client with elevated grants | `{ grantTypes: ["implicit"] }` | Disallowed grants rejected |
| 4 | Update with internal fields | `{ createdAt: "2020-01-01", passwordHash: "..." }` | Internal fields ignored |

---

### 5. Injection Attacks

#### Comprehensive SQL Injection (`sql-injection-comprehensive.test.ts`)

Tests SQL injection across EVERY user-controllable input in the system.

| # | Test Case | Inputs Tested | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Classic OR injection | `' OR '1'='1`, `' OR 1=1 --` | Parameterized — no injection |
| 2 | UNION-based injection | `' UNION SELECT username, password FROM users --` | Parameterized |
| 3 | Time-based blind injection | `'; WAITFOR DELAY '0:0:5' --`, `' AND SLEEP(5) --` | No delay (pg: `pg_sleep`) |
| 4 | Error-based injection | `' AND 1=CONVERT(int, @@version) --` | No DB error details exposed |
| 5 | Stacked queries | `'; DROP TABLE users; --` | Single-statement execution |
| 6 | JSON injection in bodies | `{"email": "' OR '1'='1"}` | Input validated, parameterized |
| 7 | Injection via URL path params | `/api/admin/organizations/' OR '1'='1` | Route not matched / 404 |
| 8 | Injection via query params | `?search=' OR '1'='1` | Parameterized |
| 9 | Injection via sort params | `?sort=name; DROP TABLE users` | Whitelist-validated sort columns |
| 10 | Injection via pagination | `?limit=1; DROP TABLE users` | Integer-validated |

**Input locations tested:** URL path parameters, query string parameters, POST form fields, POST JSON body, HTTP headers (where server reads them), cookie values.

#### Cross-Site Scripting (`xss.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | XSS in login error message | Login with email `<script>alert(1)</script>` | HTML-escaped in response |
| 2 | XSS in org name (login page) | Org with name `<img onerror=alert(1)>` | HTML-escaped in template |
| 3 | XSS in error page | Trigger error with XSS in parameter | HTML-escaped |
| 4 | XSS in redirect_uri error | `redirect_uri="><script>alert(1)</script>` | Not reflected unsafely |
| 5 | XSS via state parameter | `state="><script>alert(1)</script>` | Encoded in redirect |
| 6 | Stored XSS via org branding | HTML in custom CSS/logo URL | Sanitized |
| 7 | XSS in email templates | User name `<script>alert(1)</script>` | HTML-escaped in email |

#### Header Injection (`header-injection.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | CRLF in redirect URI | `redirect_uri=http://localhost%0d%0aEvil-Header: value` | No header injection |
| 2 | CRLF in Location header | Via crafted auth response | No response splitting |
| 3 | Newline in cookie value | Inject via crafted cookie | Sanitized |
| 4 | CRLF in custom headers | `X-Custom: value%0d%0aX-Evil: header` | Sanitized |

#### Template Injection (`template-injection.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Handlebars injection in org name | Org name `{{constructor.constructor('return process')()}}` | Escaped, no code execution |
| 2 | Handlebars injection in user name | Name `{{7*7}}` in login page | Literal string displayed, not `49` |
| 3 | Prototype pollution via JSON | `{"__proto__": {"admin": true}}` | No prototype pollution |

---

### 6. Cryptographic Attacks

#### JWT Algorithm Confusion (`jwt-algorithm-confusion.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | `alg: none` — strip signature | Create JWT with `alg: "none"`, empty signature | REJECTED — only ES256 accepted |
| 2 | `alg: HS256` with public key as secret | Sign with server's ECDSA public key as HMAC secret | REJECTED — algorithm mismatch |
| 3 | `alg: RS256` substitution | Sign with different key type | REJECTED — only ES256 |
| 4 | Empty algorithm | `alg: ""` | REJECTED |
| 5 | Case variation | `alg: "es256"`, `alg: "Es256"` | REJECTED — exact match required |

#### JWT Manipulation (`jwt-manipulation.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Modify `sub` claim | Change subject to another user's ID | Signature invalid → REJECTED |
| 2 | Modify `iss` claim | Change issuer to different org | Signature invalid → REJECTED |
| 3 | Modify `exp` to far future | Extend expiration by 100 years | Signature invalid → REJECTED |
| 4 | Set `nbf` to far future | Token "not before" year 2100 | If somehow valid sig → token not yet valid |
| 5 | Remove `exp` claim | Strip expiration | Signature invalid → REJECTED |
| 6 | Add `admin: true` claim | Extra claims in payload | Signature invalid → REJECTED |
| 7 | Modify `aud` claim | Change audience | Signature invalid → REJECTED |
| 8 | Token with manipulated `iat` | `iat` in the future | Handled — may reject or accept (sig check first) |

#### Key Confusion (`key-confusion.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Use non-existent `kid` | `kid: "attacker-key-123"` in JWT header | REJECTED — key not found |
| 2 | Omit `kid` entirely | No key ID in header | REJECTED or uses default |
| 3 | Use `jku` header to inject JWKS URL | `jku: "https://evil.com/jwks"` | Ignored — JWKS only from trusted source |
| 4 | Use `x5u` header for cert URL | `x5u: "https://evil.com/cert"` | Ignored |
| 5 | Embed key in `jwk` header | Full JWK in JWT header | Ignored — only DB keys trusted |

---

### 7. Multi-Tenant Attacks

#### Cross-Tenant Authentication (`cross-tenant-auth.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | User from Org A logs in via Org B | Login at `/:orgB/interaction/.../login` with Org A user | REJECTED — user not found in Org B |
| 2 | Token from Org A introspected at Org B | Introspect at `/:orgB/token/introspection` | `active: false` (different issuer) |
| 3 | Refresh token from Org A used at Org B | Refresh at `/:orgB/token` | REJECTED |
| 4 | Client from Org A authenticates at Org B | Client credentials at `/:orgB/token` | REJECTED — client not found |
| 5 | Suspended org user has existing tokens | Suspend org, introspect existing token | `active: false` or token revoked |
| 6 | Archived org user has existing tokens | Archive org, introspect existing token | `active: false` or token revoked |

#### Tenant Enumeration (`tenant-enumeration.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Valid vs invalid org slug response time | Measure timing difference | Within ±20% — no timing leak |
| 2 | Valid vs invalid org slug HTTP status | Compare status codes | Both return 404 (no special error for valid-but-inactive) |
| 3 | Brute force org slugs | Try common slugs (admin, test, demo) | Rate limited or consistent responses |
| 4 | Discovery endpoint for invalid org | `/:invalidSlug/.well-known/openid-configuration` | 404 |
| 5 | Active vs suspended response difference | Compare error responses | No information about org status to unauthenticated user |

#### Slug Injection (`slug-injection.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | SQL injection via org slug | `/' OR '1'='1/token` | Route not matched / 404 |
| 2 | Path traversal via slug | `/../admin/token` | Route not matched / 404 |
| 3 | URL-encoded special chars | `/%00/token`, `/%2e%2e/token` | Handled safely |
| 4 | Unicode normalization tricks | `ⓐⓓⓜⓘⓝ` (circled letters for "admin") | Not matched to real slug |
| 5 | Excessively long slug | 10,000 character slug | 404 (slug validation) |
| 6 | Null byte in slug | `org%00slug/token` | Handled safely |

---

### 8. Infrastructure Security

#### HTTP Security Headers (`http-security-headers.test.ts`)

| # | Test Case | What We Verify | Expected Value |
|---|-----------|---------------|----------------|
| 1 | X-Frame-Options | Clickjacking protection | `DENY` or `SAMEORIGIN` |
| 2 | X-Content-Type-Options | MIME sniffing protection | `nosniff` |
| 3 | X-XSS-Protection | Legacy XSS filter | `0` (disabled, CSP preferred) |
| 4 | Strict-Transport-Security | HTTPS enforcement | Present in production |
| 5 | Content-Security-Policy | Script/style restrictions | Restrictive policy |
| 6 | Referrer-Policy | Referrer leakage prevention | `no-referrer` or `strict-origin` |
| 7 | Cache-Control on auth pages | Prevent caching of auth pages | `no-store, no-cache` |
| 8 | Cache-Control on token responses | Prevent token caching | `no-store` |
| 9 | X-Request-Id present | Request tracing | Present on all responses |
| 10 | Server header suppressed | No server version disclosure | Absent or generic |

#### CORS Misconfiguration (`cors-misconfiguration.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Request from unauthorized origin | `Origin: https://evil.com` | No `Access-Control-Allow-Origin` for evil.com |
| 2 | Null origin | `Origin: null` | Not allowed |
| 3 | Wildcard origin with credentials | Check if `*` + credentials allowed | NEVER — this is a critical vulnerability |
| 4 | Subdomain bypass | `Origin: https://evil.localhost` | Not matched as allowed |
| 5 | CORS on admin endpoints | `Origin: https://evil.com` on `/api/admin/*` | Rejected |
| 6 | CORS on OIDC endpoints | `Origin: https://evil.com` on token/introspection | Only registered origins |
| 7 | Preflight (OPTIONS) response | OPTIONS with crafted origin | Proper CORS headers |

#### HTTP Method Tampering (`method-tampering.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | PUT on POST-only endpoints | `PUT /token` | 405 Method Not Allowed |
| 2 | DELETE on GET-only endpoints | `DELETE /.well-known/openid-configuration` | 405 |
| 3 | PATCH on admin endpoints | Where not expected | 405 |
| 4 | X-HTTP-Method-Override header | `POST` with `X-HTTP-Method-Override: DELETE` | Header IGNORED |
| 5 | TRACE method | `TRACE /` | 405 or not implemented |
| 6 | OPTIONS on non-CORS endpoints | Unexpected OPTIONS | Proper handling |

#### Information Disclosure (`information-disclosure.test.ts`)

| # | Test Case | Attack Vector | Expected Result |
|---|-----------|--------------|-----------------|
| 1 | Error response format | Trigger various errors | No stack traces, no file paths |
| 2 | 500 error details | Trigger internal error | Generic "Internal Server Error", no DB details |
| 3 | Debug endpoints | `GET /debug`, `/api/debug`, `/_debug` | 404 |
| 4 | Source code exposure | `GET /package.json`, `/.git/config`, `/tsconfig.json` | 404 |
| 5 | Environment variables | `GET /env`, `/api/env` | 404 |
| 6 | Health endpoint sensitivity | `GET /health` | No sensitive info (DB connection strings, passwords) |
| 7 | Error in JSON API | Invalid JSON body | Clean error, no parsing details |
| 8 | Version disclosure | Check all response headers | No version numbers exposed |

---

## Code Examples

### Typical Pentest Test Structure

```typescript
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { AttackClient } from '../helpers/attack-client.js';
import { createFullTestTenant } from '../../integration/helpers/factories.js';
import { truncateAllTables, seedBaseData } from '../../integration/helpers/database.js';
import type { TestTenant } from '../../integration/helpers/factories.js';

describe('PKCE Bypass Attacks', () => {
  let attacker: AttackClient;
  let tenant: TestTenant;

  beforeAll(async () => {
    attacker = new AttackClient(process.env.TEST_SERVER_URL!);
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    tenant = await createFullTestTenant();
  });

  it('should REJECT authorization request without code_challenge', async () => {
    // Arrange: build auth URL WITHOUT PKCE (attacker omits it)
    const authUrl = `/${tenant.org.slug}/auth?` + new URLSearchParams({
      client_id: tenant.client.clientId,
      redirect_uri: 'http://localhost:3001/callback',
      response_type: 'code',
      scope: 'openid',
      state: 'test-state',
      nonce: 'test-nonce',
      // NOTE: No code_challenge, no code_challenge_method
    }).toString();

    // Act: send the auth request
    const response = await attacker.rawRequest({
      method: 'GET',
      path: authUrl,
    });

    // Assert: server MUST reject — PKCE is mandatory
    expect(response.status).toBeGreaterThanOrEqual(400);
    // Should NOT redirect with a code
    expect(response.headers['location']).not.toContain('code=');
  });
});
```

---

## Error Handling

| Error Case | Handling Strategy |
|------------|-------------------|
| Test accidentally succeeds (attack works) | **CRITICAL BUG** — test failure is correct, indicates vulnerability |
| Timing measurement variance | Run multiple iterations, use median, allow ±20% |
| Race condition tests non-deterministic | Run multiple times, at least 1 attempt should show proper handling |
| Server crashes during pentest | Global setup restarts, test reports failure clearly |

## Testing Requirements

- Every pentest verifies the attack is **rejected** — a passing test means the system is secure
- A **failing** pentest means a **vulnerability was found** — treat as critical bug
- All OWASP Top 10 categories relevant to OIDC are covered
- Pentests are idempotent and repeatable
- Pentests run independently via `yarn test:pentest`
- Estimated: ~130-150 pentest cases across all categories
