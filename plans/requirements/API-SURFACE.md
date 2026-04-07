# Porta v5 — API Surface

> **Part of:** [OVERVIEW.md](./OVERVIEW.md)
> **Section:** §5 API Surface
> **Version**: 0.8.0

---

## Table of Contents

- [5.1 OIDC Protocol Endpoints](#51-oidc-protocol-endpoints)
- [5.2 Interaction Endpoints (User-Facing)](#52-interaction-endpoints-user-facing)
- [5.3 API Conventions](#53-api-conventions)
- [5.4 Admin API Authentication](#54-admin-api-authentication)
- [5.5 Admin API Endpoints](#55-admin-api-endpoints)
- [5.6 Self-Service API Endpoints](#56-self-service-api-endpoints)

---

## 5.1 OIDC Protocol Endpoints

> Provided by `oidc-provider`. Configured, not custom-built.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/.well-known/openid-configuration` | OIDC Discovery document |
| GET | `/jwks` | JSON Web Key Set (public signing keys) |
| GET/POST | `/authorize` | Authorization endpoint (initiates auth flow) |
| POST | `/token` | Token endpoint (issue/refresh tokens) |
| GET/POST | `/userinfo` | User claims endpoint |
| POST | `/revoke` | Token revocation |
| POST | `/introspect` | Token introspection (required for opaque access tokens) |
| GET/POST | `/end-session` | Logout |
| POST | `/device/auth` | Device authorization (Phase 2) |
| POST | `/device` | Device code verification (Phase 2) |

### Operational Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check — see response schema below |

### Health Check Response Schema

**`GET /health`** — Returns PostgreSQL and Redis connectivity status.

**Response (HTTP 200 — healthy or degraded):**
```json
{
  "status": "healthy",
  "version": "5.0.0",
  "checks": {
    "postgresql": { "status": "up", "latency_ms": 5 },
    "redis": { "status": "up", "latency_ms": 2 }
  }
}
```

**Response (HTTP 503 — unhealthy):**
```json
{
  "status": "unhealthy",
  "version": "5.0.0",
  "checks": {
    "postgresql": { "status": "down", "latency_ms": null },
    "redis": { "status": "up", "latency_ms": 2 }
  }
}
```

| Status | Meaning | HTTP Code |
|--------|---------|-----------|
| `healthy` | All checks pass | 200 |
| `degraded` | Non-critical service unavailable (future use) | 200 |
| `unhealthy` | PostgreSQL or Redis is down | 503 |

### Consent Policy

Consent determines when the user sees a "this application wants to access..." screen:

- **First-party clients (default):** Consent is **skipped** when the client is configured with `skipConsent: true` in its payload. This is the default for first-party applications where consent is implicit.
- **Third-party clients:** Consent is **always shown** on first authorization and when new scopes are requested. Configurable per client via `skipConsent: false` (default for third-party).
- **Scope changes:** If a client requests scopes not previously granted, consent is re-prompted regardless of `skipConsent` setting.
- **Grant persistence:** Accepted consent grants are stored in PostgreSQL (via `oidc_models` with `model_name = 'Grant'`). Users can revoke grants via RP-Initiated Logout.

---

## 5.2 Interaction Endpoints (User-Facing)

> Server-rendered pages for authentication interactions. Branded per application.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/interaction/:uid` | Show login or consent page (branded per application) |
| POST | `/interaction/:uid/login` | Submit password credentials |
| POST | `/interaction/:uid/magic-link` | Request magic link email |
| GET | `/interaction/:uid/magic/:token` | Verify magic link (from email) |
| POST | `/interaction/:uid/mfa` | Submit TOTP code |
| POST | `/interaction/:uid/confirm` | Confirm consent |
| GET | `/invite/:token` | Show invitation acceptance page (branded per application) |
| POST | `/invite/:token/accept` | Accept invitation and create account |

### Error Handling on Interaction Pages

Interaction pages must handle the following error scenarios gracefully (server-rendered, branded, translated):

| Scenario | Behavior |
|----------|----------|
| Expired interaction (`uid` no longer valid) | Show "session expired" page with link to restart login |
| Invalid/malformed interaction `uid` | Show generic error page |
| Organization suspended | Show "access unavailable" page (no org details leaked) |
| Application disabled | Show "application unavailable" page |
| Rate limited | Show "too many attempts" page with retry-after hint |
| Server error (500) | Show generic "something went wrong" page |
| Invalid magic link token | Show "link expired or already used" page |
| Invalid invitation token | Show "invitation expired or revoked" page |

All error pages must support i18n and application branding (when resolvable). oidc-provider's default error handler is overridden with custom EJS error templates.

---

## 5.3 API Conventions

### Pagination

All list endpoints use **offset-based pagination** with the following query parameters:

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `page` | INT | 1 | — | Page number (1-based) |
| `per_page` | INT | 20 | 100 | Items per page |
| `sort` | TEXT | varies | — | Sort field (e.g., `created_at`, `email`) |
| `order` | TEXT | `desc` | — | Sort direction: `asc` or `desc` |

**Paginated response envelope:**
```json
{
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 142,
    "total_pages": 8
  }
}
```

### API Response Format

**Success responses:**
```json
{
  "data": { ... }
}
```

**Error responses (RFC 7807-inspired):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": [
      { "field": "email", "message": "must be a valid email address" }
    ]
  }
}
```

### Update Semantics

**PUT endpoints use merge semantics** — only provided fields are updated; omitted fields retain their current values. This avoids requiring callers to send the full resource on every update. (This is technically PATCH behavior but uses PUT for API simplicity.)

### Sensitive Fields Never Returned

The following fields are **never included** in any Admin API or Self-Service API response:

| Field | Table | Reason |
|-------|-------|--------|
| `password_hash` | `users` | Security — password hashes must never leave the server |
| `mfa_secret` | `users` | Security — TOTP secret is encrypted at rest |
| `secret_hash` | `oidc_clients` | Security — client secrets are shown only once at creation |
| `key_hash` | `admin_api_keys` | Security — API keys are shown only once at creation |
| `token_hash` | `invitations`, `magic_links`, `email_verification_tokens`, `password_reset_tokens` | Security — token hashes are internal |
| `code_hash` | `mfa_backup_codes` | Security — backup codes are shown only once at MFA setup |
| `private_key_enc` | `signing_keys` | Security — encrypted private keys never leave the server |
| `failed_logins` | `users` | Internal — lockout counter is not exposed |
| `locked_until` | `users` | Internal — lockout details not exposed (prevents attacker timing) |

**HTTP status code conventions:**

| Code | Usage |
|------|-------|
| 200 | Success (GET, PUT) |
| 201 | Created (POST that creates a resource) |
| 204 | No Content (DELETE) |
| 400 | Validation error, malformed request |
| 401 | Missing or invalid authentication |
| 403 | Authenticated but not authorized |
| 404 | Resource not found |
| 409 | Conflict (duplicate email, slug, etc.) |
| 422 | Business logic error (e.g., cannot delete org with active members) |
| 429 | Rate limited |
| 500 | Internal server error |

### CORS Policy

CORS is configured to support SPA clients calling Porta endpoints:

- **Allowed origins:** Derived from registered redirect URIs of OIDC clients (exact match, no wildcards)
- **Allowed methods:** GET, POST, PUT, DELETE, OPTIONS
- **Allowed headers:** `Authorization`, `Content-Type`, `X-API-Key`
- **Exposed headers:** `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- **Credentials:** `true` (for cookie-based session endpoints)
- **Max age:** 86400 (24 hours preflight cache)
- **OIDC endpoints** (`/token`, `/userinfo`, `/revoke`, `/introspect`): CORS enabled per oidc-provider defaults
- **Admin API endpoints**: CORS enabled for admin JWT-authenticated requests
- **Interaction endpoints**: No CORS needed (server-rendered, same-origin)

---

## 5.4 Admin API Authentication

> Defines how the Admin API validates incoming requests. See [OVERVIEW.md ADR-008](./OVERVIEW.md#adr-008-admin-api-dual-authentication) for the architectural decision.

The Admin API accepts two authentication methods (checked in order):

**1. API Key (`X-API-Key` header):**
- The key value is hashed (SHA-256) and looked up in `admin_api_keys`
- Key must not be expired (`expires_at IS NULL OR expires_at > now()`) and not revoked (`revoked_at IS NULL`)
- In MVP, all API keys grant **full admin access** (the `scopes` field on `admin_api_keys` is reserved for Phase 2 fine-grained permissions)
- Audit log records the `key_id` and `key_name` as the actor

**2. Admin JWT (`Authorization: Bearer <token>`):**
- The bearer token is an **opaque access token** (per ADR-005) issued via a `porta-admin` client in the `porta-system` organization
- Porta validates the token via **self-introspection** (calling its own introspection logic internally, not an HTTP call)
- The token must include the `app:roles` scope to resolve the user's admin role
- The user must have a role on the `porta-admin` application within the `porta-system` organization

**Admin role → access matrix:**

| Role on `porta-admin` | GET endpoints | POST/PUT/DELETE endpoints | API key management | Signing key management |
|-----------------------|--------------|--------------------------|--------------------|-----------------------|
| `super-admin` | ✅ | ✅ | ✅ | ✅ |
| `admin` | ✅ | ✅ | ❌ | ❌ |
| `read-only` | ✅ | ❌ | ❌ | ❌ |

**Error responses:**
- Missing auth → HTTP 401 `{ "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }`
- Invalid/expired token or key → HTTP 401 `{ "error": { "code": "UNAUTHORIZED", "message": "Invalid credentials" } }`
- Insufficient role → HTTP 403 `{ "error": { "code": "FORBIDDEN", "message": "Insufficient permissions" } }`

---

## 5.5 Admin API Endpoints

> Protected by admin authentication: API key (`X-API-Key` header) or admin JWT (`Authorization: Bearer` header).
> Used by external applications for management operations.

### Organizations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/organizations` | List all organizations |
| POST | `/api/admin/organizations` | Create an organization |
| GET | `/api/admin/organizations/:orgId` | Get organization details |
| PUT | `/api/admin/organizations/:orgId` | Update an organization |
| DELETE | `/api/admin/organizations/:orgId` | Delete an organization |

### Organization Members

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/organizations/:orgId/members` | List organization members |
| POST | `/api/admin/organizations/:orgId/members` | Add a user as member |
| PUT | `/api/admin/organizations/:orgId/members/:userId` | Update member org-level role |
| DELETE | `/api/admin/organizations/:orgId/members/:userId` | Remove member from organization |

### Organization-Application Subscriptions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/organizations/:orgId/applications` | List enabled applications for org |
| POST | `/api/admin/organizations/:orgId/applications` | Enable an application for org |
| DELETE | `/api/admin/organizations/:orgId/applications/:appId` | Disable application for org |

### Applications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/applications` | List all applications |
| POST | `/api/admin/applications` | Create an application |
| GET | `/api/admin/applications/:id` | Get application details |
| PUT | `/api/admin/applications/:id` | Update an application (including branding) |
| DELETE | `/api/admin/applications/:id` | Delete an application |

### Permissions (per Application)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/applications/:appId/permissions` | List permissions |
| POST | `/api/admin/applications/:appId/permissions` | Create permission(s) |
| DELETE | `/api/admin/applications/:appId/permissions/:permId` | Delete a permission |

### Roles (per Application)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/applications/:appId/roles` | List roles |
| POST | `/api/admin/applications/:appId/roles` | Create a role with permissions |
| PUT | `/api/admin/applications/:appId/roles/:roleId` | Update role (name, permissions) |
| DELETE | `/api/admin/applications/:appId/roles/:roleId` | Delete a role |

### Clients (per Organization + Application)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/organizations/:orgId/applications/:appId/clients` | List clients for org+app |
| POST | `/api/admin/organizations/:orgId/applications/:appId/clients` | Create OIDC client |
| GET | `/api/admin/clients/:clientId` | Get client details |
| PUT | `/api/admin/clients/:clientId` | Update client |
| DELETE | `/api/admin/clients/:clientId` | Delete client |
| POST | `/api/admin/clients/:clientId/rotate-secret` | Rotate client secret (returns new secret once) |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List/search users |
| POST | `/api/admin/users` | Create a user |
| GET | `/api/admin/users/:id` | Get user details |
| PUT | `/api/admin/users/:id` | Update user |
| PUT | `/api/admin/users/:id/status` | Suspend/activate user |
| GET | `/api/admin/users/:id/organizations` | List user's orgs, apps, and roles |

### User-Organization-Application Role Assignments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/organizations/:orgId/applications/:appId/users` | List users with roles for org+app |
| POST | `/api/admin/organizations/:orgId/applications/:appId/users/:userId/roles` | Assign role(s) to user |
| DELETE | `/api/admin/organizations/:orgId/applications/:appId/users/:userId/roles/:roleId` | Remove role from user |

### Invitations (per Organization)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/organizations/:orgId/invitations` | List invitations for org |
| POST | `/api/admin/organizations/:orgId/invitations` | Create an invitation (org + app + roles) |
| POST | `/api/admin/organizations/:orgId/invitations/bulk` | Bulk invite (Phase 2) |
| DELETE | `/api/admin/invitations/:id` | Revoke an invitation |

### Admin API Keys

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/api-keys` | List API keys (prefix + name, never the full key) |
| POST | `/api/admin/api-keys` | Create an API key (returns plaintext once) |
| DELETE | `/api/admin/api-keys/:id` | Revoke an API key |
| POST | `/api/admin/api-keys/:id/rotate` | Rotate an API key (returns new plaintext once) |

### Audit Log

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/audit` | Query audit log (with filters including organization) |

### Signing Keys

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/signing-keys` | List signing keys (id, algorithm, status, created_at, rotated_at, expires_at) |
| POST | `/api/admin/signing-keys/rotate` | Force signing key rotation (returns new key ID). See [SECURITY.md §7 Signing Key Rotation Policy](./SECURITY.md#signing-key-rotation-policy) |

---

## 5.6 Self-Service API Endpoints

> Authenticated by user's own token.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/register` | Self-service registration (Phase 2, disabled by default) |
| POST | `/api/verify-email` | Verify email with token |
| POST | `/api/forgot-password` | Request password reset |
| POST | `/api/reset-password` | Reset password with token |
| PUT | `/api/account/password` | Change password (authenticated) |
| GET | `/api/account/profile` | Get own profile (Phase 2) |
| PUT | `/api/account/profile` | Update own profile (Phase 2) |
| POST | `/api/account/mfa/setup` | Start MFA setup (get QR code) |
| POST | `/api/account/mfa/confirm` | Confirm MFA setup (verify first code) |
| DELETE | `/api/account/mfa` | Disable MFA |
