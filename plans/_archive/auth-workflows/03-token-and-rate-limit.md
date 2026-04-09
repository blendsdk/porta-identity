# Token Management & Rate Limiting: Auth Workflows

> **Document**: 03-token-and-rate-limit.md
> **Parent**: [Index](00-index.md)

## Overview

Shared infrastructure for all token-based auth flows (magic links, password resets, invitations) and Redis-based rate limiting. These are low-level building blocks consumed by the interaction routes.

## Architecture

### Token Flow

```
Generate:   crypto.randomBytes(32) → base64url plaintext
Hash:       SHA-256(plaintext) → hex string
Store:      INSERT INTO {table} (user_id, token_hash, expires_at)
Verify:     SHA-256(input) → SELECT WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
Mark used:  UPDATE SET used_at = NOW()
```

### Rate Limit Flow

```
Key format: ratelimit:{action}:{org_id}:{identifier_hash}
Check:      INCR key → if count > limit, reject with 429
Expire:     SET TTL to window seconds on first increment
Reset:      DEL key (after successful auth)
```

## Implementation Details

### Token Utilities — `src/auth/tokens.ts`

```typescript
import crypto from 'node:crypto';

/** Result of generating a new token — plaintext for the URL, hash for the DB */
export interface GeneratedToken {
  plaintext: string;  // base64url, goes in the email link
  hash: string;       // SHA-256 hex, stored in the database
}

/**
 * Generate a cryptographically secure token.
 * Returns both the plaintext (for the email/URL) and the SHA-256 hash (for DB storage).
 */
export function generateToken(): GeneratedToken {
  const plaintext = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
  return { plaintext, hash };
}

/**
 * Hash a plaintext token for database lookup.
 * Used during verification — the user provides the plaintext, we hash and look up.
 */
export function hashToken(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}
```

### Token Repository — `src/auth/token-repository.ts`

Handles CRUD for all three token tables. Uses a `tableName` parameter to share logic.

```typescript
type TokenTable = 'magic_link_tokens' | 'password_reset_tokens' | 'invitation_tokens';

interface TokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

/** Insert a new token into the specified table. */
export async function insertToken(table: TokenTable, userId: string, tokenHash: string, expiresAt: Date): Promise<void>;

/** Find a valid (unused, not expired) token by its hash. */
export async function findValidToken(table: TokenTable, tokenHash: string): Promise<TokenRecord | null>;

/** Mark a token as used (set used_at = NOW()). */
export async function markTokenUsed(table: TokenTable, tokenId: string): Promise<void>;

/** Delete expired/used tokens older than a cutoff (cleanup). */
export async function deleteExpiredTokens(table: TokenTable, olderThan: Date): Promise<number>;

/** Invalidate all unused tokens for a user in a table (e.g., when new token issued). */
export async function invalidateUserTokens(table: TokenTable, userId: string): Promise<void>;
```

**Design decisions:**
- `findValidToken` checks `used_at IS NULL AND expires_at > NOW()` in a single query
- `invalidateUserTokens` sets `used_at = NOW()` on all active tokens for a user — ensures only the latest token is valid
- Table name is validated against allowed values (no SQL injection via parameterized table names — use allowlist)

### Rate Limiter — `src/auth/rate-limiter.ts`

Sliding window counter using Redis INCR + EXPIRE.

```typescript
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter: number;  // seconds
}

export interface RateLimitConfig {
  /** Max requests allowed in the window */
  max: number;
  /** Window size in seconds */
  windowSeconds: number;
}

/**
 * Check if a request is within the rate limit.
 * Uses INCR + conditional EXPIRE for atomic counter management.
 */
export async function checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult>;

/**
 * Reset rate limit counter for a key (e.g., after successful login).
 */
export async function resetRateLimit(key: string): Promise<void>;

/**
 * Build a rate limit key for login attempts.
 * Format: ratelimit:login:{org_id}:{sha256(ip + email)}
 */
export function buildLoginRateLimitKey(orgId: string, ip: string, email: string): string;

/**
 * Build a rate limit key for magic link requests.
 * Format: ratelimit:magic:{org_id}:{sha256(email)}
 */
export function buildMagicLinkRateLimitKey(orgId: string, email: string): string;

/**
 * Build a rate limit key for password reset requests.
 * Format: ratelimit:reset:{org_id}:{sha256(email)}
 */
export function buildPasswordResetRateLimitKey(orgId: string, email: string): string;

/**
 * Load rate limit configuration from system_config with defaults.
 */
export async function loadLoginRateLimitConfig(): Promise<RateLimitConfig>;
export async function loadMagicLinkRateLimitConfig(): Promise<RateLimitConfig>;
export async function loadPasswordResetRateLimitConfig(): Promise<RateLimitConfig>;
```

**Rate limit defaults (from system_config):**

| Config Key | Default | Description |
| --- | --- | --- |
| `rate_limit_login_max` | 10 | Max login attempts per window |
| `rate_limit_login_window` | 900 | Login window in seconds (15 min) |
| `rate_limit_magic_link_max` | 5 | Max magic link requests per window |
| `rate_limit_magic_link_window` | 900 | Magic link window in seconds |
| `rate_limit_password_reset_max` | 5 | Max password reset requests per window |
| `rate_limit_password_reset_window` | 900 | Password reset window in seconds |

**Redis implementation:**
```
MULTI
  INCR ratelimit:login:{org}:{hash}
  TTL ratelimit:login:{org}:{hash}
EXEC

If TTL = -1 (no expiry set): EXPIRE ratelimit:login:{org}:{hash} {window}
If count > max: reject with { allowed: false, retryAfter: TTL }
```

**Graceful degradation:** If Redis is unavailable, `checkRateLimit` returns `{ allowed: true }` with a warning log — never block legitimate users due to Redis failure.

## Error Handling

| Error Case | Handling |
| --- | --- |
| Token not found | Return null from `findValidToken` |
| Token expired | Same as not found (checked in SQL) |
| Token already used | Same as not found (checked in SQL) |
| Redis unavailable | Rate limiter allows request, logs warning |
| Invalid table name | Throw immediately (programming error) |

## Testing Requirements

- Token generation: deterministic tests with mocked crypto
- Token repository: all CRUD operations with mocked pg pool
- Rate limiter: check, exceed, reset scenarios with mocked Redis
- Key builders: format validation
- Graceful degradation: Redis failure → allow with warning
