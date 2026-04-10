# RD-13: Admin Authentication & CLI v2

> **Document**: RD-13-admin-auth-cli-v2.md
> **Status**: Draft
> **Created**: 2026-04-10
> **Project**: Porta v5 — OIDC Provider
> **Depends On**: RD-03 (OIDC Provider Core), RD-05 (Client Management), RD-08 (RBAC), RD-09 (CLI)
> **Discovered**: Gap analysis during playground testing (GAP-3)

---

## Feature Overview

Secure the admin API with proper OIDC-based authentication and rearchitect the CLI from
direct-database access to authenticated HTTP client. The CLI authenticates via Authorization
Code + PKCE (localhost callback pattern), similar to `az login`, `gh auth login`, and
`netlify login`.

### Problem Statement

**GAP-3 (Critical):** The admin API routes (`/api/admin/*`) currently have no real
authentication. The `requireSuperAdmin()` middleware checks `ctx.state.organization.isSuperAdmin`,
but admin routes are not behind the tenant resolver — so `ctx.state.organization` is always
undefined and the check always fails (403). Even if it didn't fail, there's no user identity
verification (no tokens, no sessions, no API keys).

**CLI Architecture:** The CLI currently connects directly to PostgreSQL and Redis, calling
service functions directly. This means:
- CLI requires direct database access (not suitable for remote administration)
- No audit trail tied to a user identity
- No authorization checks (any CLI user can do anything)
- CLI and admin API are two completely separate code paths

### Proposed Architecture

```
CLI v2 (thin HTTP client)
  → porta login                    # Opens browser → OIDC Auth Code + PKCE
  → porta org create --name "Acme" # HTTP POST /api/admin/organizations (Bearer token)
  → porta logout                   # Clears stored tokens

Admin API (secured)
  /api/admin/*                     # Validates Bearer token, checks RBAC permissions
```

**Exception:** `porta init` remains as a direct-DB bootstrap command for first-time setup.

---

## Functional Requirements

### Must Have

#### Admin API Authentication
- [ ] Bearer token validation on all `/api/admin/*` endpoints
- [ ] Token introspection or JWT validation against the Porta provider itself
- [ ] Admin-level RBAC: only users with admin roles can access admin endpoints
- [ ] Proper 401 (unauthenticated) vs 403 (unauthorized) responses
- [ ] Audit log entries for all admin actions with user identity

#### CLI Authentication
- [ ] `porta login` — Opens browser, starts local HTTP server for callback, OIDC Auth Code + PKCE
- [ ] `porta logout` — Clears stored tokens
- [ ] `porta whoami` — Shows current authenticated identity
- [ ] Token storage in `~/.porta/credentials.json` (or XDG-compliant path)
- [ ] Automatic token refresh (using refresh_token)
- [ ] Token expiry handling — re-login prompt when refresh fails

#### CLI Commands (HTTP Mode)
- [ ] All existing CLI commands work via HTTP admin API instead of direct DB
- [ ] Same CLI interface (arguments, flags, output format)
- [ ] `--server` flag to specify Porta server URL (default: `http://localhost:3000`)

#### Bootstrap (Direct-DB Mode)
- [ ] `porta init` — Creates first organization (super-admin), first admin user, first client
- [ ] `porta init` works without a running server (direct DB + Redis)
- [ ] `porta init` only works when the system has no organizations yet (safety guard)
- [ ] `porta migrate` — Stays as direct-DB (needed before server can start)

### Should Have

- [ ] `porta login --no-browser` — Print URL for manual copy-paste (headless environments)
- [ ] Token storage encryption (system keychain integration)
- [ ] Multi-server profile support (`porta login --profile staging`)
- [ ] Admin client auto-registration during `porta init`

### Won't Have (This Release)

- Device Authorization Grant (RFC 8628) — can use Auth Code + PKCE with browser
- Machine-to-machine admin access (service account with client credentials)
- Admin UI (web-based management console)

---

## Technical Requirements

### CLI Authentication Flow

```
1. porta login [--server http://localhost:3000]
2. CLI generates PKCE code_verifier + code_challenge
3. CLI starts temporary HTTP server on http://localhost:<random-port>/callback
4. CLI opens browser to:
   http://localhost:3000/<admin-org>/auth?
     response_type=code&
     client_id=<porta-admin-cli>&
     redirect_uri=http://localhost:<port>/callback&
     scope=openid profile email offline_access&
     code_challenge=<S256-hash>&
     code_challenge_method=S256
5. User authenticates in browser (normal Porta login, with 2FA if configured)
6. Porta redirects to http://localhost:<port>/callback?code=xxx&state=yyy
7. CLI exchanges code for tokens (access_token, refresh_token, id_token)
8. CLI stores tokens to ~/.porta/credentials.json
9. CLI shuts down temporary server
10. CLI prints: "Logged in as admin@example.com"
```

### Admin API Security

```
Request:
  POST /api/admin/organizations
  Authorization: Bearer <access_token>
  Content-Type: application/json
  { "name": "Acme Corp" }

Server:
  1. Extract Bearer token from Authorization header
  2. Introspect/validate token against Porta's own OIDC provider
  3. Extract user identity (sub claim)
  4. Check user has admin role (RBAC)
  5. If authorized → process request
  6. If not → 401 or 403
```

### Bootstrap Flow (porta init)

```
porta init
  1. Check: any organizations exist? If yes → error "System already initialized"
  2. Run migrations if needed
  3. Create super-admin organization
  4. Create admin application
  5. Create admin CLI client (public, Auth Code + PKCE, localhost redirect)
  6. Prompt for admin user details (email, name, password)
  7. Create admin user with admin role
  8. Print: "System initialized. Run 'porta login' to authenticate."
```

### Chicken-and-Egg Solution

The bootstrap problem (need CLI auth to create clients, need clients for CLI auth) is
solved by `porta init`:
1. `porta init` is the ONLY command that uses direct-DB access
2. It creates everything needed for subsequent OIDC-based authentication
3. After `porta init`, all other commands use HTTP + Bearer tokens
4. `porta init` refuses to run if the system is already initialized (safety)

---

## Migration Path

### Phase 1: Secure Admin API
- Add bearer token validation middleware
- Implement token introspection against self
- Add admin RBAC checks
- Existing CLI continues to work (direct-DB)

### Phase 2: CLI Authentication
- Implement `porta login` / `porta logout` / `porta whoami`
- Token storage and refresh
- Add `--server` flag

### Phase 3: CLI HTTP Migration
- Migrate each CLI command from direct-service to HTTP calls
- Keep same interface (arguments, output format)
- `porta init` + `porta migrate` stay as direct-DB

### Phase 4: Deprecate Direct-DB CLI
- All commands except `porta init` + `porta migrate` use HTTP
- Remove direct-service calls from other commands
- Update documentation

---

## Security Considerations

- Admin tokens have limited scope — not interchangeable with regular user tokens
- Token storage file permissions: `0600` (owner-only read/write)
- Localhost callback server binds to `127.0.0.1` only (no external access)
- PKCE prevents authorization code interception
- Short-lived access tokens + refresh token rotation
- Admin actions audit-logged with user identity from token

---

## Scope Decisions

| Decision                          | Options                              | Chosen           | Rationale                                    |
|-----------------------------------|--------------------------------------|------------------|----------------------------------------------|
| CLI auth method                   | Device Auth Grant, Auth Code + PKCE  | Auth Code + PKCE | Already supported, simpler UX, standard      |
| Bootstrap approach                | Seed script, init command, env vars  | init command     | Interactive, safe (single-use), self-contained|
| Admin client type                 | Confidential, Public                 | Public           | CLI can't hold secrets, PKCE provides security|
| Token storage                     | File, keychain, env var              | File (v1)        | Simple, cross-platform. Keychain later.       |
| Direct-DB commands remaining      | None, init only, init + migrate      | init + migrate   | Both needed before server is running          |

---

## Related Documents

- [RD-03](RD-03-oidc-provider-core.md) — OIDC provider configuration
- [RD-05](RD-05-application-client-management.md) — Client management
- [RD-08](RD-08-rbac-custom-claims.md) — RBAC for admin authorization
- [RD-09](RD-09-cli.md) — Current CLI architecture
- [Gap Analysis](../plans/oidc-client-auth/00-index.md) — Where GAP-3 was discovered
