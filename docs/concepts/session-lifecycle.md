# Session Lifecycle & Token Cleanup

This document describes Porta's OIDC session lifecycle model — how sessions, grants, and tokens interact across Redis and PostgreSQL, and what happens when a user logs out or a session expires.

## Architecture: Hybrid Storage

Porta uses a **hybrid OIDC adapter** that routes artifacts to different stores based on their lifetime:

| Store      | Models                                                                                      | Rationale                    |
|------------|---------------------------------------------------------------------------------------------|------------------------------|
| **Redis**  | Session, Interaction, AuthorizationCode, ReplayDetection, ClientCredentials, PushedAuthorizationRequest | Short-lived, high-throughput  |
| **PostgreSQL** | AccessToken, RefreshToken, Grant                                                        | Long-lived, durable          |

The `HybridAdapter` in `src/oidc/adapter-factory.ts` routes model operations to the appropriate adapter (`RedisAdapter` or `PostgresAdapter`).

## Session → Token Link

When a user authenticates, the OIDC provider creates a **session** in Redis with an `authorizations` map:

```json
{
  "accountId": "user-uuid",
  "authorizations": {
    "client-id-1": { "grantId": "grant-abc", "sid": "session-id-1" },
    "client-id-2": { "grantId": "grant-def", "sid": "session-id-2" }
  }
}
```

Each `grantId` references a **Grant** record in PostgreSQL, which in turn links to **AccessTokens** and **RefreshTokens** via the `grant_id` column in the `oidc_payloads` table.

> **Important:** There is no foreign key cascade between Redis sessions and PostgreSQL grants/tokens. The cleanup must be performed explicitly.

## Three-Point Lifecycle Model

Porta implements a three-point model for session and token lifecycle management:

### 1. Explicit Logout = Total Cleanup

When a user actively logs out (clicks "Sign Out"), the OIDC provider calls `session.destroy()`. Porta's `HybridAdapter` intercepts this for Session models and performs a **cascade delete**:

1. **Read** the session's `authorizations` to extract all `grantId` values
2. **Delete** all grants, access tokens, and refresh tokens from PostgreSQL (`DELETE FROM oidc_payloads WHERE grant_id = ANY($1)`)
3. **Clean up** corresponding Redis grant sets and member keys (best-effort)
4. **Destroy** the session itself from Redis

This ensures that after logout, no tokens remain usable — the user is fully logged out across all clients.

**Error handling:** If the cascade fails (e.g., database temporarily unavailable), the session is still destroyed. The user can always log out. Orphaned tokens will expire naturally via their TTLs.

### 2. Natural Session Expiry = Tokens Survive

When a session expires naturally (e.g., user closes browser, session TTL elapses), Redis automatically removes the session key. In this case:

- **No cascade delete occurs** — grants and tokens in PostgreSQL continue to live until their own TTL expires
- This is intentional: it supports **refresh token flows** (e.g., `offline_access` scope) where the application should be able to refresh tokens even after the interactive session ends
- Long-lived refresh tokens are a feature, not a bug, for server-side applications (BFF pattern)

### 3. Opportunistic Cleanup (Expired Record Purge)

To prevent unbounded growth of the `oidc_payloads` table from naturally-expired records, Porta runs a **fire-and-forget cleanup** on every new authentication flow start:

```sql
DELETE FROM oidc_payloads WHERE expires_at IS NOT NULL AND expires_at < NOW()
```

This cleanup:
- Runs in `src/routes/interactions.ts` when a login interaction begins
- Is non-blocking (fire-and-forget) — failures are logged but don't interrupt the auth flow
- Is self-regulating — cleanup frequency scales with authentication activity
- Requires no cron jobs or external schedulers

This pattern is proven from Porta v4.

## Forced Re-Login (`prompt=login`)

OIDC relying parties — including the Porta CLI and Admin GUI — can request a
**forced re-authentication** by sending `prompt=login` on the authorization
request. This tells the provider to ignore any existing SSO session and make
the user sign in again.

### The stale-cookie problem

A subtle edge case occurs when a `_session` cookie from a *previous* login
survives in the browser into a new `prompt=login` flow. During the authorize
resume step, node-oidc-provider rotates the session identifier, so the
interaction's recorded session uid no longer matches the live session uid. The
provider then throws `SessionNotFound`, which historically surfaced as a
terminal **"Something went wrong"** page — the user had to manually clear
browser storage to recover.

> **Note:** The underlying Redis `Session` record is present during this
> failure — this is a session-id rotation mismatch, **not** a Redis durability
> problem. See [Three-Point Lifecycle Model](#three-point-lifecycle-model) for
> how `Session` records expire.

### Two-layer fix

Porta resolves this with two complementary, security-preserving safeguards:

1. **Proactive cookie reset (`prompt=login` middleware).** The
   `promptLoginReset` middleware (`src/middleware/prompt-login-reset.ts`) runs
   on the **initial** org-scoped authorize endpoint (`GET`/`POST`
   `/{orgSlug}/auth`) before the provider. When the `prompt` parameter contains
   the `login` value, it clears the `_session` + `_session.sig` cookie pair so
   the provider mints a fresh session with no uid mismatch. Normal SSO /
   session-reuse logins (no `prompt=login`) are completely unaffected. The stale
   Redis `Session` record is left to expire naturally via its TTL. An audit
   event `auth.prompt_login.session_reset` is recorded.

2. **Graceful `SessionNotFound` recovery (safety net).** If a mismatch still
   reaches the provider's error handler, the custom `renderError` hook
   (`src/oidc/configuration.ts`) detects `SessionNotFound`, clears the stale
   cookie pair, and renders a friendly **"Your session has expired. Please sign
   in again."** message instead of the generic error. The next request then has
   no stale cookie and starts a clean flow.

**Security note:** Both layers only ever *clear* a provably-dead cookie and
re-render. Neither accepts, revives, or trusts any session — the provider's
`SessionNotFound` guard still fully rejects the mismatched session. Cookie
clearing is signing-free (the outer Koa app does not configure `app.keys`), so
it works regardless of cookie-signing configuration.

## Logout Page UX

When a user triggers logout, they see a two-action page:

- **Sign Out** — Confirms the logout, triggers session destruction with cascade delete
- **Return to Application** — Cancels the logout, returns to the client's `post_logout_redirect_uri`

The logout page is rendered by the `logoutSource` hook in `src/oidc/configuration.ts` using the `templates/default/pages/logout.hbs` template with i18n support.

## Playground Logout Behavior

### SPA Playground (`playground/`)
The SPA saves the `id_token` before clearing OIDC storage, then passes it as `id_token_hint` to the end-session endpoint. This allows oidc-provider to identify the user and skip the confirmation page for a seamless logout experience.

### BFF Playground (`playground-bff/`)
The BFF performs **token revocation** before redirecting to the end-session endpoint — it sends revocation requests for both the access token and refresh token to the `/token/revocation` endpoint, then redirects the browser to `/session/end` for session cleanup.

## Implementation Files

| File | Purpose |
|------|---------|
| `src/oidc/adapter-factory.ts` | HybridAdapter with Session `destroy()` cascade override |
| `src/oidc/postgres-adapter.ts` | `revokeGrantsByIds()` and `purgeExpired()` functions |
| `src/oidc/redis-adapter.ts` | `cleanupRedisGrants()` function |
| `src/routes/interactions.ts` | Opportunistic `purgeExpired()` call on auth flow start |
| `src/oidc/configuration.ts` | `logoutSource` hook, `renderError` SessionNotFound recovery, `loadExistingGrant` offline_access upgrade |
| `src/middleware/prompt-login-reset.ts` | `prompt=login` session-cookie reset middleware |
| `templates/default/pages/logout.hbs` | Logout page template |

## Related Documentation

- [OIDC Concepts](./oidc.md) — OIDC protocol overview
- [Architecture](./architecture.md) — System architecture overview
- [Multi-Tenancy](./multi-tenancy.md) — Organization-scoped sessions
