# RD-03: OIDC Provider Core

> **Document**: RD-03-oidc-provider-core.md
> **Status**: Draft
> **Created**: 2026-04-08
> **Project**: Porta v5 — OIDC Provider
> **Depends On**: RD-01 (Project Scaffolding), RD-02 (Database Schema)

---

## Feature Overview

Integrate `node-oidc-provider` as the OIDC protocol engine for Porta v5. This includes configuring the provider, implementing PostgreSQL and Redis adapters, setting up token policies, JWKS key management, and mounting the provider on the Koa application. The provider must support multi-tenant issuers (one per organization), opaque access tokens, JWT ID tokens, and all required OIDC/OAuth2 flows.

---

## Functional Requirements

### Must Have

- [ ] `node-oidc-provider` integrated and mounted on the Koa application
- [ ] Multi-tenant issuer support: each organization gets its own OIDC issuer URL
- [ ] PostgreSQL adapter for persistent OIDC artifact storage (via `oidc_payloads` table)
- [ ] Redis adapter for short-lived OIDC data (sessions, interactions, replay detection)
- [ ] Opaque access tokens (not JWT — more secure, requires introspection)
- [ ] JWT ID tokens (standard, sent to client)
- [ ] ES256 signing algorithm (ECDSA with P-256 curve)
- [ ] Signing keys loaded from database (`signing_keys` table)
- [ ] JWKS endpoint serving active + grace-period keys
- [ ] Client lookup from database (`clients` + `client_secrets` tables)
- [ ] Token introspection endpoint (RFC 7662)
- [ ] Token revocation endpoint (RFC 7009)
- [ ] All token lifetimes read from `system_config` table with hardcoded fallback defaults

### Supported OIDC/OAuth2 Flows

- [ ] Authorization Code with PKCE (web, mobile, desktop)
- [ ] Client Credentials (service-to-service)
- [ ] Refresh Token (with rotation)

### Supported OIDC Endpoints

- [ ] Authorization endpoint (`/auth`)
- [ ] Token endpoint (`/token`)
- [ ] UserInfo endpoint (`/userinfo`)
- [ ] JWKS endpoint (`/jwks`)
- [ ] Discovery endpoint (`/.well-known/openid-configuration`)
- [ ] Introspection endpoint (`/token/introspection`)
- [ ] Revocation endpoint (`/token/revocation`)
- [ ] End session endpoint (`/session/end`)

### Supported OIDC Parameters

All standard parameters handled by `node-oidc-provider` automatically:

- [ ] `state` — CSRF protection + application state (returned verbatim in redirect)
- [ ] `nonce` — Replay protection for ID tokens
- [ ] `code_challenge` / `code_challenge_method` — PKCE
- [ ] `redirect_uri` — Validated against registered URIs
- [ ] `scope` — Standard scopes: `openid`, `profile`, `email`, `address`, `phone`, `offline_access`
- [ ] `response_type` — `code` (Authorization Code flow)
- [ ] `prompt` — `none`, `login`, `consent`
- [ ] `login_hint` — Pre-fill email on login page
- [ ] `ui_locales` — Preferred language for login UI (used by i18n system)
- [ ] `acr_values` — Requested authentication context class

### Should Have

- [ ] Token exchange support (RFC 8693) — for future service-to-service scenarios
- [ ] Pushed Authorization Requests (PAR, RFC 9126) — enhanced security for authorization requests
- [ ] Resource indicators (RFC 8707) — audience restriction on tokens

### Won't Have (Out of Scope)

- Dynamic client registration (RFC 7591) — clients are admin-registered only
- Implicit flow — deprecated, not secure
- ROPC (Resource Owner Password Credentials) flow — deprecated
- Device Authorization Grant — not needed for web/mobile/desktop with browser
- SAML / WS-Federation — OIDC only

---

## Technical Requirements

### Provider Configuration

```typescript
// Conceptual configuration structure
const providerConfig = {
  // Adapter
  adapter: PostgresAdapter,          // Custom adapter using oidc_payloads table

  // Clients
  findAccount: accountFinder,         // Custom account finder using users table
  clients: undefined,                 // Dynamic lookup from clients table (not static)

  // Features
  features: {
    introspection: { enabled: true },
    revocation: { enabled: true },
    resourceIndicators: { enabled: true },
    clientCredentials: { enabled: true },
    rpInitiatedLogout: { enabled: true },
  },

  // Token formats
  formats: {
    AccessToken: 'opaque',           // Opaque access tokens
    ClientCredentials: 'opaque',
  },

  // PKCE
  pkce: {
    required: () => true,             // Require PKCE for all authorization code flows
    methods: ['S256'],                // Only S256 (no plain)
  },

  // TTLs (loaded from system_config table)
  ttl: {
    AccessToken: configService.get('access_token_ttl', 900),
    AuthorizationCode: 60,
    IdToken: configService.get('id_token_ttl', 3600),
    RefreshToken: configService.get('refresh_token_ttl', 2592000),
    Interaction: 3600,
    Session: configService.get('session_ttl', 86400),
    Grant: configService.get('refresh_token_ttl', 2592000),
  },

  // Refresh token rotation
  rotateRefreshToken: true,

  // Scopes and claims mapping
  scopes: ['openid', 'profile', 'email', 'address', 'phone', 'offline_access'],
  claims: {
    openid: ['sub'],
    profile: ['name', 'given_name', 'family_name', 'middle_name', 'nickname',
              'preferred_username', 'profile', 'picture', 'website',
              'gender', 'birthdate', 'zoneinfo', 'locale', 'updated_at'],
    email: ['email', 'email_verified'],
    address: ['address'],
    phone: ['phone_number', 'phone_number_verified'],
  },

  // Interactions (login/consent UI)
  interactions: {
    url: interactionUrl,               // Returns URL for login/consent pages
  },

  // Signing keys
  jwks: {
    keys: [],                          // Loaded from signing_keys table at startup
  },

  // Cookies
  cookies: {
    keys: [],                          // Cookie signing keys
    long: { signed: true, httpOnly: true, sameSite: 'lax' },
    short: { signed: true, httpOnly: true, sameSite: 'lax' },
  },
};
```

### Multi-Tenant Issuer Resolution

`node-oidc-provider` supports dynamic issuer resolution. The issuer is determined per-request based on the organization slug:

```
Issuer URL pattern:
  https://auth.example.com/{org-slug}

Examples:
  https://auth.example.com/acme-corp
  https://auth.example.com/globex
  https://auth.example.com/porta-admin

Discovery endpoint:
  https://auth.example.com/acme-corp/.well-known/openid-configuration
```

**Implementation approach:**

1. Koa middleware extracts `org-slug` from the request path
2. Looks up organization in database (with caching in Redis)
3. Sets the OIDC issuer dynamically for the request
4. `node-oidc-provider` uses the resolved issuer for all endpoints

```typescript
// Middleware pseudocode
async function tenantResolver(ctx, next) {
  const orgSlug = ctx.params.orgSlug;
  const org = await organizationService.findBySlug(orgSlug);
  if (!org || org.status !== 'active') {
    ctx.throw(404, 'Organization not found');
  }
  ctx.state.organization = org;
  ctx.state.issuer = `${config.issuerBaseUrl}/${org.slug}`;
  await next();
}
```

### PostgreSQL Adapter

The adapter implements `node-oidc-provider`'s adapter interface, storing all OIDC artifacts in the `oidc_payloads` table.

**Required adapter methods:**

| Method | Purpose |
|--------|---------|
| `upsert(id, payload, expiresIn)` | Create or update an OIDC artifact |
| `find(id)` | Find an artifact by ID |
| `findByUserCode(userCode)` | Find by user code (device flow, not used but required) |
| `findByUid(uid)` | Find by UID (sessions) |
| `consume(id)` | Mark an artifact as consumed |
| `destroy(id)` | Delete an artifact |
| `revokeByGrantId(grantId)` | Revoke all artifacts for a grant |

**Considerations:**
- Use parameterized queries (prevent SQL injection)
- Set `expires_at` based on `expiresIn` parameter
- Implement cleanup job for expired records (periodic DELETE)
- Consider using Redis for short-lived artifacts (AuthorizationCode, Interaction) and Postgres for long-lived (RefreshToken, Grant)

### Redis Adapter (Hybrid Strategy)

For performance, short-lived OIDC artifacts are stored in Redis instead of PostgreSQL:

| Artifact Type | Storage | Rationale |
|--------------|---------|-----------|
| Session | Redis | Short-lived, frequently accessed |
| Interaction | Redis | Very short-lived (login flow) |
| AuthorizationCode | Redis | Short-lived (60s), high throughput |
| ReplayDetection | Redis | Short-lived, performance-critical |
| AccessToken | PostgreSQL | Needs introspection after Redis TTL |
| RefreshToken | PostgreSQL | Long-lived, needs persistence |
| Grant | PostgreSQL | Long-lived, needs persistence |
| ClientCredentials | Redis | Short-lived |

The adapter factory decides which adapter to use based on the model name:

```typescript
function adapterFactory(modelName: string) {
  const redisModels = ['Session', 'Interaction', 'AuthorizationCode',
                       'ReplayDetection', 'ClientCredentials'];
  if (redisModels.includes(modelName)) {
    return new RedisAdapter(modelName);
  }
  return new PostgresAdapter(modelName);
}
```

### Client Lookup (findAccount & clientFinder)

Instead of static client configuration, `node-oidc-provider` is configured to look up clients dynamically from the database:

```typescript
// Custom client metadata resolution
async function findClient(clientId: string): Promise<ClientMetadata | undefined> {
  const client = await clientRepository.findByClientId(clientId);
  if (!client || client.status !== 'active') return undefined;

  const secrets = await clientSecretRepository.findActiveByClientId(client.id);

  return {
    client_id: client.client_id,
    client_secret: secrets.length > 0 ? undefined : undefined, // Secrets verified via custom method
    redirect_uris: client.redirect_uris,
    post_logout_redirect_uris: client.post_logout_redirect_uris,
    grant_types: client.grant_types,
    response_types: client.response_types,
    scope: client.scope,
    token_endpoint_auth_method: client.token_endpoint_auth_method,
    application_type: client.application_type,
    // ... other OIDC client metadata
  };
}
```

**Client secret verification:** Since secrets are stored as Argon2id hashes, implement a custom `client_secret_basic` / `client_secret_post` authentication that verifies against all active secrets for the client.

### Account Finder (findAccount)

Maps users from the `users` table to OIDC accounts:

```typescript
async function findAccount(ctx: KoaContext, sub: string): Promise<Account> {
  const user = await userRepository.findById(sub);
  if (!user) return undefined;

  return {
    accountId: user.id,
    async claims(use, scope, claims, rejected) {
      // Return OIDC standard claims based on requested scopes
      const profile = buildClaimsFromUser(user, scope);
      // Add custom claims
      const customClaims = await customClaimService.getClaimsForUser(user.id, user.organization_id);
      return { sub: user.id, ...profile, ...customClaims };
    },
  };
}
```

### Signing Key Management

Keys are stored in the `signing_keys` table and loaded at startup:

```
Startup:
1. Load all keys where status IN ('active', 'retired') AND (expires_at IS NULL OR expires_at > NOW())
2. Convert PEM keys to JWK format
3. Pass to node-oidc-provider as jwks.keys
4. Newest 'active' key is used for signing
5. 'retired' keys are published in JWKS for verification only

Key Rotation (via CLI):
1. Generate new ES256 key pair
2. Insert into signing_keys with status = 'active'
3. Mark previous active key as 'retired', set expires_at = NOW() + grace_period
4. Restart or hot-reload provider to pick up new key

Cleanup (via CLI):
1. Find keys where status = 'retired' AND expires_at < NOW()
2. Update status to 'revoked'
3. Remove from JWKS on next restart
```

### CORS Middleware

OIDC endpoints must support CORS for browser-based clients (SPA, mobile webviews):

```typescript
// CORS configuration per-client
async function oidcCors(ctx: KoaContext): Promise<string | false> {
  const origin = ctx.get('Origin');
  if (!origin) return false;

  // Check if origin is allowed for any active client
  const allowed = await clientRepository.isOriginAllowed(origin);
  return allowed ? origin : false;
}
```

### Error Handling

- OIDC protocol errors follow RFC 6749 §5.2 (JSON error responses)
- `node-oidc-provider` handles most error formatting automatically
- Custom error handler for:
  - Database connection failures → 503 Service Unavailable
  - Invalid tenant → 404 Not Found
  - Rate limiting → 429 Too Many Requests

---

## Integration Points

### With RD-04 (Organizations)
- Tenant resolution middleware provides organization context
- OIDC issuer URL is derived from organization slug

### With RD-05 (Applications & Clients)
- Client metadata loaded from `clients` table
- Client secret verification against `client_secrets` table

### With RD-06 (Users)
- `findAccount` loads user from `users` table
- Claims built from user profile fields

### With RD-07 (Auth Workflows)
- Interaction URL routes to login/consent pages
- Login result fed back to provider via interaction completion

### With RD-08 (RBAC & Custom Claims)
- Custom claims injected via `findAccount.claims()`
- Roles/permissions may be included as custom claims

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Access token format | JWT, opaque | Opaque | More secure, supports instant revocation via introspection |
| ID token format | JWT, opaque | JWT | Standard, client needs to read claims |
| Signing algorithm | RS256, RS384, ES256, ES384, EdDSA | ES256 | Modern, fast, small keys, widely supported |
| Adapter strategy | All Postgres, all Redis, hybrid | Hybrid (Redis for short-lived, Postgres for long-lived) | Best performance + persistence balance |
| Client lookup | Static config, dynamic DB | Dynamic DB | Required for admin-managed clients |
| PKCE | Optional, required for public, required for all | Required for all | Security best practice (OAuth 2.1) |
| Multi-tenant | Path-based, subdomain, header | Path-based (`/{org-slug}`) | Simple, works with single domain, easy to test |

---

## Acceptance Criteria

1. [ ] `node-oidc-provider` starts and serves discovery endpoint at `/{org-slug}/.well-known/openid-configuration`
2. [ ] Authorization Code + PKCE flow completes successfully end-to-end
3. [ ] Client Credentials flow returns valid opaque access token
4. [ ] Refresh token rotation works (old refresh token is invalidated)
5. [ ] Token introspection returns correct token metadata
6. [ ] Token revocation invalidates the token
7. [ ] JWKS endpoint returns active and grace-period keys
8. [ ] Opaque access tokens cannot be decoded by the client
9. [ ] ID tokens are valid JWTs signed with ES256
10. [ ] Multi-tenant issuer: different orgs get different issuers
11. [ ] Client lookup from database works (no static configuration)
12. [ ] UserInfo endpoint returns correct OIDC standard claims
13. [ ] All TTL values are read from `system_config` table
14. [ ] Invalid org slug returns 404
15. [ ] CORS works for registered client origins
