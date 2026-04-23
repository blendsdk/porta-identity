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
| `src/oidc/configuration.ts` | `logoutSource` hook for logout page rendering |
| `templates/default/pages/logout.hbs` | Logout page template |

## Related Documentation

- [OIDC Concepts](./oidc.md) — OIDC protocol overview
- [Architecture](./architecture.md) — System architecture overview
- [Multi-Tenancy](./multi-tenancy.md) — Organization-scoped sessions
