# Capabilities

Porta is a full-featured, multi-tenant OpenID Connect (OIDC) provider designed for organizations that need enterprise-grade identity management with complete control over the authentication experience.

## Multi-Tenant OIDC

Porta is multi-tenant from the ground up. Every organization gets its own isolated OIDC endpoints, user pool, and configuration — all from a single deployment.

| Capability | Description |
|-----------|-------------|
| **Path-based tenancy** | Each org gets its own OIDC namespace: `/{orgSlug}/.well-known/openid-configuration` |
| **Per-org user pools** | Users belong to a specific organization; the same email can exist in different orgs |
| **Per-org branding** | Logo, favicon, primary color, company name, and custom CSS — all configurable via API |
| **Per-org login methods** | Choose which authentication methods are available per organization |
| **Per-org 2FA policy** | Enforce two-factor authentication with configurable policies |
| **Organization lifecycle** | Active → Suspended → Archived status transitions with audit logging |

### OIDC Standards Compliance

Built on the battle-tested [node-oidc-provider](https://github.com/panva/node-oidc-provider) library, Porta supports:

- **Authorization Code + PKCE** — The recommended flow for all client types
- **Client Credentials** — Machine-to-machine authentication
- **Refresh Tokens** — Long-lived sessions with configurable TTLs
- **Discovery** — Standard `/.well-known/openid-configuration` per organization
- **JWKS** — Public key endpoint for token verification
- **UserInfo** — Standard claims endpoint
- **Token Revocation** and **Introspection**
- **End Session** — RP-initiated logout

::: info Intentional Omission
Porta does **not** support the Implicit flow. This is by design — the Authorization Code + PKCE flow is more secure and recommended by current OAuth 2.0 best practices.
:::

---

## Flexible Authentication

Porta supports multiple authentication methods that can be mixed and matched per organization and even per client.

### Login Methods

| Method | Description |
|--------|-------------|
| **Password** | Traditional email + password with Argon2id hashing and [NIST SP 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html) compliant validation |
| **Magic Link** | Passwordless email-based authentication with secure one-time tokens |

Login methods are configured at two levels:

1. **Organization default** — Sets the baseline for all clients in the organization
2. **Per-client override** — Individual clients can restrict or expand available methods

```
Organization default: [password, magic_link]
├── Client A: inherits → [password, magic_link]
├── Client B: override → [password]           # password only
└── Client C: override → [magic_link]         # magic link only
```

### Two-Factor Authentication (2FA)

Porta provides three 2FA methods that can be combined:

| Method | Description |
|--------|-------------|
| **Email OTP** | 6-digit code sent via email, configurable expiry |
| **TOTP** | Authenticator app support (Google Authenticator, Authy, etc.) with QR code setup |
| **Recovery Codes** | One-time backup codes for account recovery, Argon2id hashed |

2FA can be enforced per-organization with policies:
- **Optional** — Users choose whether to enable 2FA
- **Encouraged** — Users are prompted but not required
- **Required** — All users must configure 2FA

See [Authentication Modes](./authentication-modes.md) for the full deep dive.

---

## Customizable Login UI

Every user-facing page in Porta — login, consent, password reset, magic link, 2FA, invitations, and all emails — is fully customizable.

### Zero-Code Branding (API-Driven)

Without touching any templates, you can customize per organization via the Admin API or CLI:

| Setting | Effect |
|---------|--------|
| **Logo URL** | Displayed in page headers and email headers |
| **Favicon URL** | Browser tab icon |
| **Primary Color** | Buttons, links, and accent colors (CSS `--primary` variable) |
| **Company Name** | Page titles, headers, footers, and email signatures |
| **Custom CSS** | Up to 10KB of raw CSS injected into every page (full style override) |

```bash
# Set branding via CLI
porta org branding <org-id> \
  --logo-url "https://example.com/logo.png" \
  --primary-color "#E11D48" \
  --company-name "Acme Corp"
```

### Full Template Override

For complete UI control, Porta uses [Handlebars](https://handlebarsjs.com/) templates with a clear structure:

```
templates/default/
├── layouts/main.hbs          # Base HTML layout (head, body wrapper)
├── pages/                     # Login, consent, password reset, 2FA, etc.
│   ├── login.hbs
│   ├── consent.hbs
│   ├── forgot-password.hbs
│   ├── reset-password.hbs
│   ├── magic-link-sent.hbs
│   ├── two-factor-verify.hbs
│   └── ... (12 pages total)
├── partials/                  # Reusable components (header, footer, flash)
├── emails/                    # HTML + plain-text email templates
│   ├── magic-link.hbs
│   ├── password-reset.hbs
│   ├── invitation.hbs
│   ├── otp-code.hbs
│   └── ... (6 email types × 2 formats)
```

Mount your own templates via Docker volume and override any or all pages:

```yaml
# docker-compose.yml
services:
  porta:
    image: blendsdk/porta:latest
    volumes:
      - ./my-templates:/app/templates/default
```

See the [Custom UI Tutorial](../guide/custom-ui.md) for a complete step-by-step guide.

---

## RBAC & Custom Claims

### Role-Based Access Control

Porta provides a full RBAC system scoped per application:

- **Roles** — Named collections of permissions (e.g., `admin`, `editor`, `viewer`)
- **Permissions** — Granular actions (e.g., `users:read`, `users:write`, `reports:export`)
- **Role-Permission Mappings** — Assign permissions to roles
- **User-Role Assignments** — Assign roles to users per organization

Roles and permissions are included in OIDC tokens, so your applications can make authorization decisions without additional API calls:

```json
{
  "sub": "user-uuid",
  "roles": ["admin", "editor"],
  "permissions": ["users:read", "users:write", "reports:export"]
}
```

### Custom Claims

Define application-specific claims with type validation:

| Claim Type | Example |
|-----------|---------|
| `string` | `department: "Engineering"` |
| `number` | `employee_id: 42` |
| `boolean` | `is_manager: true` |
| `string[]` | `teams: ["frontend", "platform"]` |

Custom claims are injected into OIDC tokens alongside standard claims, giving your applications rich user context without extra API calls.

---

## Admin Tooling

### CLI (`porta`)

A comprehensive command-line tool for managing every aspect of Porta:

| Command | Description |
|---------|-------------|
| `porta init` | Bootstrap the admin system (first-time setup) |
| `porta login` / `logout` / `whoami` | OIDC-based CLI authentication |
| `porta org` | Create, list, update, suspend, archive organizations + branding |
| `porta app` | Manage applications, modules, roles, permissions, claims |
| `porta client` | Create clients, manage secrets, configure login methods |
| `porta user` | Full user lifecycle, roles, claims, 2FA management |
| `porta keys` | ES256 signing key management (list, generate, rotate) |
| `porta config` | System configuration management |
| `porta audit` | View audit logs with filtering |
| `porta migrate` | Database migration management |

### REST Admin API

Every CLI operation is backed by a JWT-authenticated REST API at `/api/admin/*`:

- **10 Organization endpoints** — CRUD, status transitions, branding
- **11 Application endpoints** — CRUD, modules
- **10 Client endpoints** — CRUD, secrets, login methods
- **13 User endpoints** — CRUD, status transitions, passwords, 2FA
- **9 Role endpoints** — CRUD, permission assignment
- **6 Permission endpoints** — CRUD
- **9 Custom Claim endpoints** — Definitions and user values
- Plus: config, keys, audit log endpoints

---

## Security & Compliance

| Feature | Implementation |
|---------|---------------|
| **Token Signing** | ES256 (ECDSA P-256) — keys auto-generated, stored as PEM in database |
| **Password Hashing** | Argon2id with NIST SP 800-63B compliant validation |
| **Client Secrets** | Argon2id hashed with SHA-256 pre-hash for length normalization |
| **PKCE** | Required for public clients, supported for all |
| **CSRF Protection** | Token-based CSRF on all form submissions |
| **Rate Limiting** | Redis-backed per-endpoint rate limiting on auth flows |
| **Audit Logging** | Every admin operation and security event logged with actor, target, metadata |
| **CORS** | Configurable per OIDC endpoint |
| **Session Security** | Short-lived sessions in Redis with signed cookies |
| **Key Rotation** | Active/retired/revoked key lifecycle with JWKS endpoint |
| **2FA Secret Encryption** | AES-256-GCM for TOTP secrets at rest |
| **Recovery Code Hashing** | Argon2id for recovery codes |
| **Secure Headers** | CSP, X-Frame-Options, X-Content-Type-Options on all responses |
| **No Information Leakage** | Root page returns neutral content; no product/vendor identification |

---

## Infrastructure

| Component | Technology |
|-----------|-----------|
| **Runtime** | Node.js ≥ 22 |
| **Framework** | Koa (required for node-oidc-provider compatibility) |
| **Language** | TypeScript (strict mode) |
| **Database** | PostgreSQL 16 |
| **Cache/Sessions** | Redis 7 |
| **OIDC Engine** | node-oidc-provider 9.x |
| **Deployment** | Docker image, Docker Compose, or standalone |

### Hybrid Storage Architecture

Porta uses a hybrid adapter strategy for optimal performance:

| Data Type | Storage | Reason |
|-----------|---------|--------|
| Sessions, Interactions, Auth Codes | **Redis** | Ephemeral, high-speed, auto-expiry |
| Access Tokens, Refresh Tokens, Grants | **PostgreSQL** | Durable, queryable, audit trail |
| Organizations, Users, Clients, Roles | **PostgreSQL** | Primary data store |
| Tenant resolution, RBAC lookups | **Redis cache** | Performance with graceful degradation |

---

## At a Glance

| Capability | Porta |
|-----------|-------|
| Multi-tenant | ✅ Path-based org isolation |
| OIDC compliant | ✅ Authorization Code + PKCE, Client Credentials, Refresh |
| Password login | ✅ Argon2id + NIST validation |
| Magic link login | ✅ Secure one-time email tokens |
| 2FA — Email OTP | ✅ Configurable expiry |
| 2FA — TOTP | ✅ Authenticator app with QR setup |
| 2FA — Recovery codes | ✅ Argon2id hashed backup codes |
| Per-org login methods | ✅ Default + override per client |
| Custom login UI | ✅ Handlebars templates + Docker volume mount |
| Per-org branding (API) | ✅ Logo, colors, CSS, company name |
| Custom email templates | ✅ HTML + plain text |
| RBAC | ✅ Roles + permissions per application |
| Custom claims | ✅ Type-validated, injected into tokens |
| Admin CLI | ✅ 14+ commands |
| Admin REST API | ✅ JWT-authenticated, 70+ endpoints |
| Audit logging | ✅ All operations logged |
| Key rotation | ✅ ES256 with lifecycle management |
| i18n | ✅ Locale-based translations |
| Docker support | ✅ Production-ready image |
