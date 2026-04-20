# Requirements: Admin API Authentication

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-13](../../requirements/RD-13-admin-auth-cli-v2.md)

## Feature Overview

Secure the admin API (`/api/admin/*`) with proper OIDC-based authentication and rearchitect the CLI from direct-database access to an authenticated HTTP client. The system authenticates itself — Porta validates Bearer tokens issued by its own OIDC provider using its own ES256 signing keys.

### Problem Statement

**GAP-3 (Critical):** The admin API routes have no real authentication. The `requireSuperAdmin()` middleware checks `ctx.state.organization.isSuperAdmin`, but admin routes are not behind the tenant resolver — so `ctx.state.organization` is always undefined and the check always throws 403. Even if it worked, there's no user identity verification (no tokens, no sessions, no API keys).

**CLI Architecture:** The CLI connects directly to PostgreSQL and Redis, calling service functions directly. This means:
- CLI requires direct database access (not suitable for remote administration)
- No audit trail tied to a user identity
- No authorization checks (any CLI user can do anything)
- CLI and admin API are two completely separate code paths

---

## Functional Requirements

### Must Have

#### Admin API Authentication
- [ ] Bearer token validation on all `/api/admin/*` endpoints
- [ ] JWT self-validation using Porta's own ES256 signing keys (no HTTP introspection call)
- [ ] Admin-level RBAC: only users with `porta-admin` role in the super-admin org can access admin endpoints
- [ ] Proper 401 (unauthenticated — missing/invalid token) vs 403 (unauthorized — valid token, wrong role) responses
- [ ] Audit log entries for all admin actions with user identity extracted from JWT `sub` claim
- [ ] Token issuer validation (token must be issued by Porta's own provider)
- [ ] Token audience validation (if configured)
- [ ] Token expiry validation

#### Bootstrap Command (`porta init`)
- [ ] `porta init` — Creates admin organization, admin application, admin CLI client, and first admin user in a single step
- [ ] Works without a running server (direct DB + Redis connection)
- [ ] Only works when no admin application exists yet (safety guard — refuses to re-initialize)
- [ ] Prompts for admin user email, name, and password
- [ ] Creates public OIDC client with Auth Code + PKCE grants, localhost redirect URIs
- [ ] Creates `porta-admin` role with full admin permissions
- [ ] Assigns the `porta-admin` role to the first admin user
- [ ] `porta migrate` stays as direct-DB (needed before server can start)

#### CLI Authentication
- [ ] `porta login` — Opens browser, starts local HTTP server for callback, OIDC Auth Code + PKCE flow
- [ ] `porta logout` — Clears stored tokens
- [ ] `porta whoami` — Shows current authenticated identity (email, org, roles)
- [ ] Token storage in `~/.porta/credentials.json` with `0600` file permissions
- [ ] Automatic token refresh using refresh_token when access_token expires
- [ ] Token expiry handling — re-login prompt when refresh fails
- [ ] `--server` flag to specify Porta server URL (default: `http://localhost:3000`)

#### CLI HTTP Migration
- [ ] All existing CLI commands work via HTTP admin API instead of direct DB
- [ ] Same CLI interface (arguments, flags, output format) — no UX regression
- [ ] Authenticated HTTP client with automatic Bearer token attachment
- [ ] Proper error handling: 401 → "Run porta login", 403 → "Insufficient permissions"
- [ ] HTTP client follows existing CLI output patterns (table + JSON modes)

### Should Have

- [ ] `porta login --no-browser` — Print URL for manual copy-paste (headless environments)
- [ ] Admin client auto-registration during `porta init` (admin CLI client is created automatically)
- [ ] `porta init --force` to re-initialize (with confirmation prompt)
- [ ] Token refresh retry with exponential backoff

### Won't Have (This Release)

- Device Authorization Grant (RFC 8628) — Auth Code + PKCE with browser is sufficient
- Machine-to-machine admin access (service account with client_credentials)
- Admin UI (web-based management console)
- Multi-server profile support (`porta login --profile staging`)
- Token storage encryption (system keychain integration)
- New database tables or migrations — existing schema supports everything

---

## Technical Requirements

### JWT Self-Validation

The admin auth middleware validates tokens without making HTTP calls:

1. Extract Bearer token from `Authorization` header
2. Decode JWT header to get `kid` (key ID)
3. Load the corresponding ES256 public key from Porta's signing key store (already in memory)
4. Verify JWT signature using the public key
5. Validate standard claims: `iss`, `exp`, `iat`
6. Extract `sub` claim (user UUID)
7. Look up user in database, verify active status
8. Verify user belongs to the super-admin organization
9. Verify user has the `porta-admin` role (via `user_roles` → `roles` lookup)
10. Set `ctx.state.adminUser` with identity information for audit logging

### PKCE Authentication Flow

```
1. porta login [--server http://localhost:3000]
2. CLI generates PKCE code_verifier + code_challenge (S256)
3. CLI starts temporary HTTP server on http://127.0.0.1:<random-port>/callback
4. CLI opens browser to:
   http://localhost:3000/porta-admin/auth?
     response_type=code&
     client_id=<porta-admin-cli>&
     redirect_uri=http://127.0.0.1:<port>/callback&
     scope=openid profile email offline_access&
     code_challenge=<S256-hash>&
     code_challenge_method=S256&
     state=<random>
5. User authenticates in browser (normal Porta login flow)
6. Porta redirects to http://127.0.0.1:<port>/callback?code=xxx&state=yyy
7. CLI exchanges code for tokens at /<org-slug>/token endpoint
8. CLI stores tokens to ~/.porta/credentials.json (0600 perms)
9. CLI shuts down temporary server
10. CLI prints: "Logged in as admin@example.com"
```

### Token Storage Format

```json
{
  "server": "http://localhost:3000",
  "orgSlug": "porta-admin",
  "clientId": "porta-admin-cli-xxxx",
  "accessToken": "eyJ...",
  "refreshToken": "xxxx",
  "idToken": "eyJ...",
  "expiresAt": "2026-04-20T12:00:00Z",
  "userInfo": {
    "sub": "uuid",
    "email": "admin@example.com",
    "name": "Admin User"
  }
}
```

### HTTP Client Architecture

```
CLI Command (e.g., porta org create)
  → httpClient.post('/api/admin/organizations', { name: 'Acme' })
    → Reads token from ~/.porta/credentials.json
    → If access_token expired, attempts refresh via /token endpoint
    → If refresh fails, prints "Session expired. Run porta login"
    → Attaches Authorization: Bearer <token>
    → Makes HTTP request
    → Handles response (200→success, 401→re-auth, 403→permission error, 4xx/5xx→error)
```

---

## Security Considerations

- Admin tokens are standard OIDC tokens — same security as user tokens
- JWT validation happens in-process (no internal HTTP calls, no latency)
- Token storage file permissions: `0600` (owner-only read/write)
- Localhost callback server binds to `127.0.0.1` only (no external access)
- PKCE prevents authorization code interception even without client secret
- Short-lived access tokens + refresh token rotation
- Admin actions audit-logged with user identity from JWT `sub` claim
- `porta init` refuses to run if system already initialized (prevents re-bootstrap attacks)
- No admin credentials in environment variables or config files

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Token validation | Introspection endpoint, JWT self-validation | JWT self-validation | Faster, no HTTP call, keys already in memory |
| Admin identity | API key, super-admin flag, RBAC role | RBAC role | Uses existing RBAC system, supports multiple admin users with different permissions |
| CLI auth | Device Auth Grant, Auth Code + PKCE, API key | Auth Code + PKCE | Industry standard (az login, gh auth), already supported by OIDC provider |
| CLI client type | Confidential, Public | Public | CLI can't safely store secrets, PKCE provides security |
| Bootstrap | Seed script, init command, env vars | Init command | Interactive, safe (single-use guard), self-contained |
| Direct-DB commands | None, init only, init + migrate | init + migrate | Both needed before server can start |
| Route handlers | Rewrite, keep + swap middleware | Keep + swap middleware | Handlers are solid, only auth layer needs replacing |
| Playground seed | Rewrite to HTTP, keep as direct-DB | Keep as direct-DB | Dev tool, requires DB access by design, no security concern |

---

## Acceptance Criteria

1. [ ] `porta init` creates admin org + app + client + user and prints success message
2. [ ] `porta init` refuses to run a second time (safety guard)
3. [ ] Admin API returns 401 when no Bearer token is provided
4. [ ] Admin API returns 401 when an invalid/expired Bearer token is provided
5. [ ] Admin API returns 403 when a valid token belongs to a non-admin user
6. [ ] Admin API returns 200 when a valid token belongs to an admin user
7. [ ] `porta login` opens browser, completes OIDC flow, stores tokens
8. [ ] `porta logout` clears stored tokens
9. [ ] `porta whoami` displays current user identity
10. [ ] All CLI commands (org, app, client, user, etc.) work via HTTP with Bearer token
11. [ ] CLI automatically refreshes expired access tokens using refresh token
12. [ ] CLI shows "Run porta login" when authentication is required
13. [ ] Audit log entries include admin user identity from JWT
14. [ ] Existing route handlers (Zod validation, service calls, error mapping) work unchanged
15. [ ] Playground applications (SPA + BFF) continue to work without changes
16. [ ] Playground seed script continues to work as direct-DB
17. [ ] All tests pass (`yarn verify`)
