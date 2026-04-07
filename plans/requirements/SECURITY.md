# Porta v5 — Security Requirements

> **Part of:** [OVERVIEW.md](./OVERVIEW.md)
> **Section:** §7 Security Requirements
> **Version**: 0.10.0

---

## Table of Contents

- [Security Requirements Matrix](#security-requirements-matrix)
- [Account Lockout Policy](#account-lockout-policy)
- [Rate Limiting Thresholds](#rate-limiting-thresholds)
- [Password Policy](#password-policy)
- [Signing Key Rotation Policy](#signing-key-rotation-policy)
- [Token & Session Lifetimes](#token--session-lifetimes)

---

## Security Requirements Matrix

| ID | Requirement | Priority | Description |
|----|-------------|----------|-------------|
| SEC-01 | PKCE enforcement | **MVP** | Required for ALL authorization code flows |
| SEC-02 | Argon2id password hashing | **MVP** | Memory-hard, side-channel resistant |
| SEC-03 | Constant-time token comparison | **MVP** | Prevent timing attacks on secrets and codes |
| SEC-04 | Single-use authorization codes | **MVP** | Atomic consume; revoke all tokens if code replayed |
| SEC-05 | Refresh token rotation | **MVP** | New refresh token on each use; detect replay |
| SEC-06 | Redirect URI exact matching | **MVP** | No wildcards, no open redirectors |
| SEC-07 | HTTPS required in production | **MVP** | oidc-provider enforces this |
| SEC-08 | CSRF protection on interaction forms | **MVP** | Token-based CSRF on all server-rendered POST forms (login, consent, MFA, invitation acceptance) |
| SEC-09 | Rate limiting on sensitive endpoints | **MVP** | `/token`, `/interaction/*/login`, magic link requests |
| SEC-10 | Brute force protection | **MVP** | Progressive delays, account lockout after N failures |
| SEC-11 | MFA secret encryption at rest | **MVP** | TOTP secrets encrypted in database |
| SEC-12 | Cookie security | **MVP** | HttpOnly, Secure, SameSite=Lax |
| SEC-13 | CSP headers on interaction pages | **MVP** | Prevent XSS on login/consent pages |
| SEC-14 | Signing key rotation | **MVP** | Periodic rotation with JWKS overlap period |
| SEC-15 | Magic link single-use | **MVP** | Atomic consume, hash-based storage |
| SEC-16 | Magic link rate limiting | **MVP** | Max 3 per email per 15 minutes |
| SEC-17 | Invitation token single-use | **MVP** | Consumed atomically on acceptance |
| SEC-18 | User enumeration prevention | **MVP** | Same response for valid/invalid emails on magic link and password reset |
| SEC-19 | Audit logging of all security events | **MVP** | See [FEATURES.md §4.12 Audit Logging](./FEATURES.md#412-audit-logging) |
| SEC-20 | Input validation on all endpoints | **MVP** | Schema validation (zod or similar) |
| SEC-21 | Signing key encryption at rest | **MVP** | Private keys encrypted with AES-256-GCM via `KEY_ENCRYPTION_KEY` |
| SEC-22 | Client secret hashing | **MVP** | Client secrets stored as SHA-256 hashes, shown once at creation |
| SEC-23 | Admin API key hashing | **MVP** | API keys stored as SHA-256 hashes, shown once at creation |
| SEC-24 | Password policy enforcement | **MVP** | Minimum 10 characters, no max length cap below 128 chars |
| SEC-25 | CORS policy | **MVP** | Origins derived from registered redirect URIs; see [API-SURFACE.md §5.3 CORS Policy](./API-SURFACE.md#cors-policy) |

---

## Account Lockout Policy

> Implements SEC-10 (brute force protection). Uses `failed_logins` and `locked_until` columns on `users` table.

| Parameter | Value | Notes |
|-----------|-------|-------|
| Max failed login attempts | 5 | Before lockout is triggered |
| Lockout duration | 15 minutes | `locked_until` set to `now() + 15 min` |
| Progressive delay | 1s after 3 failures, 3s after 4 failures | Artificial delay on login response to slow attackers |
| Counter reset | On successful login | `failed_logins` set to 0, `locked_until` set to NULL |
| Counter scope | Per user account | NOT per IP (prevents distributed brute force on one account) |
| Lockout bypass | Admin can unlock via `PUT /api/admin/users/:id/status` | Sets status back to `active`, resets counters |
| MFA failures | Counted separately (3 max) | After 3 failed MFA attempts, the interaction is invalidated and user must restart login |

---

## Rate Limiting Thresholds

> Implements SEC-09. Rate limits enforced via in-memory sliding window (Redis-backed for multi-instance).

| Endpoint / Action | Limit | Window | Key | Notes |
|-------------------|-------|--------|-----|-------|
| `POST /token` | 30 requests | 1 minute | Per `client_id` | Covers all grant types |
| `POST /interaction/*/login` | 10 attempts | 1 minute | Per IP address | Password login attempts |
| `POST /interaction/*/magic-link` | 3 requests | 15 minutes | Per email address | SEC-16 |
| `POST /api/forgot-password` | 3 requests | 15 minutes | Per email address | Prevent email flooding |
| `POST /api/reset-password` | 10 requests | 1 minute | Per IP address | Prevent token brute-force |
| `POST /api/verify-email` | 5 requests | 15 minutes | Per email address | |
| `POST /introspect` | 100 requests | 1 minute | Per `client_id` | Resource server introspection |
| `POST /api/register` | 5 requests | 1 hour | Per IP address | Phase 2 self-registration |
| Admin API (all endpoints) | 60 requests | 1 minute | Per API key or admin user | Prevent accidental flooding |
| Global fallback | 120 requests | 1 minute | Per IP address | Catches unlisted endpoints |

**Rate limit response:** HTTP 429 with `Retry-After` header (seconds) and `X-RateLimit-Remaining` / `X-RateLimit-Reset` headers on all responses.

---

## Password Policy

| Rule | Value | Notes |
|------|-------|-------|
| Minimum length | 10 characters | Enforced on creation, change, and reset |
| Maximum length | 128 characters | Prevent DoS via Argon2id on very long inputs |
| Complexity requirements | **None** | Length-based policy per NIST SP 800-63B; no forced uppercase/symbols |
| Common password check | **MVP** | Reject passwords from a top-10K breached password list (bundled) |
| Breach database check (HaveIBeenPwned) | **Phase 2** | Optional k-anonymity API check via `HIBP_ENABLED` env var |
| Password history | **Not enforced** | Users may reuse previous passwords |
| Password expiry | **Not enforced** | No forced rotation per NIST SP 800-63B guidance |

---

## Signing Key Rotation Policy

> Implements SEC-14. Signing keys are rotated automatically on a configurable schedule.

| Parameter | Default | Env Var | Notes |
|-----------|---------|---------|-------|
| Rotation interval | 90 days | `KEY_ROTATION_INTERVAL` | How often a new key is generated and the old one is rotated |
| Overlap period | 24 hours | `KEY_ROTATION_OVERLAP` | How long the old key remains in JWKS after rotation (for in-flight token verification) |
| Default algorithm | RS256 | `SIGNING_ALGORITHM` | Supported: `RS256`, `ES256`. RS256 chosen for broadest client library compatibility |

**Rotation mechanism:**
- **Automatic:** An in-process interval timer checks on startup and every hour whether the active signing key is older than `KEY_ROTATION_INTERVAL`. If so, it generates a new key and marks the old one as `rotated`.
- **Manual:** Admin can force rotation via `POST /api/admin/signing-keys/rotate` (see [API-SURFACE.md §5.5](./API-SURFACE.md#signing-keys)). Use this for emergency rotation if a key is compromised.
- **Leader election:** In multi-instance deployments, rotation uses a PostgreSQL advisory lock (`pg_try_advisory_lock`) to ensure only one instance performs the rotation. Other instances pick up the new key on their next JWKS refresh cycle.

**Key lifecycle:**
1. **`active`** — Current signing key. All new tokens are signed with this key.
2. **`rotated`** — Previous key. Still in JWKS for verification but not used for signing. `expires_at` set to `rotated_at + KEY_ROTATION_OVERLAP`.
3. **`retired`** — Removed from JWKS. Kept in database for audit trail. Cleaned up after 1 year.

---

## Token & Session Lifetimes

> Default values configured in oidc-provider. All are overridable via environment variables.

| Token/Session | Default TTL | Env Var | Notes |
|---------------|-------------|---------|-------|
| Access token | 1 hour | `ACCESS_TOKEN_TTL` | Opaque; stored in Redis |
| ID token | 1 hour | `ID_TOKEN_TTL` | JWT; signed with signing key |
| Refresh token | 30 days | `REFRESH_TOKEN_TTL` | Rotated on each use; stored in PostgreSQL |
| Authorization code | 60 seconds | — | oidc-provider default; not configurable |
| Session (cookie) | 14 days | `SESSION_TTL` | Cookie-based; stored in Redis |
| Interaction | 10 minutes | `INTERACTION_TTL` | Login/consent flow timeout |
| Magic link | 15 minutes | `MAGIC_LINK_TTL` | Single-use email link |
| Invitation | 72 hours | `INVITATION_TTL` | Configurable per invitation |
| Password reset | 1 hour | `PASSWORD_RESET_TTL` | Single-use email link |
| Email verification | 24 hours | `EMAIL_VERIFY_TTL` | Single-use email link |
| Signing key overlap | 24 hours | `KEY_ROTATION_OVERLAP` | Old key stays in JWKS after rotation |
