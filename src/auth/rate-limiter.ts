/**
 * Redis-based sliding window rate limiter.
 *
 * Uses INCR + EXPIRE for atomic counter management. Each action type
 * (login, magic link, password reset) has its own key format and
 * configurable limits loaded from system_config with sensible defaults.
 *
 * Graceful degradation: if Redis is unavailable, requests are ALLOWED
 * with a warning log — we never block legitimate users due to Redis failure.
 *
 * Key format: ratelimit:{action}:{org_id}:{identifier_hash}
 *
 * @example
 *   const key = buildLoginRateLimitKey(orgId, ip, email);
 *   const config = await loadLoginRateLimitConfig();
 *   const result = await checkRateLimit(key, config);
 *   if (!result.allowed) {
 *     ctx.status = 429;
 *     ctx.set('Retry-After', String(result.retryAfter));
 *   }
 */

import crypto from 'node:crypto';
import { getRedis } from '../lib/redis.js';
import { getSystemConfigNumber } from '../lib/system-config.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of a rate limit check */
export interface RateLimitResult {
  /** Whether the request is allowed (within limit) */
  allowed: boolean;
  /** Number of remaining requests in this window */
  remaining: number;
  /** When the current window expires */
  resetAt: Date;
  /** Seconds until the client can retry (0 if allowed) */
  retryAfter: number;
}

/** Configuration for a rate limit rule */
export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  max: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

// ---------------------------------------------------------------------------
// Rate limit check
// ---------------------------------------------------------------------------

/**
 * Check if a request is within the rate limit for the given key.
 *
 * Uses Redis INCR + conditional EXPIRE for atomic counter management:
 *   1. INCR the key (creates it at 1 if new)
 *   2. If TTL is -1 (no expiry), set EXPIRE to windowSeconds
 *   3. Compare count against max — reject if exceeded
 *
 * On Redis failure, returns allowed: true with a warning log.
 *
 * @param key - Rate limit key (use a build*Key function to construct)
 * @param config - Rate limit configuration (max requests + window)
 * @returns Rate limit result with allowed status and metadata
 */
export async function checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  try {
    const redis = getRedis();

    // Atomically increment the counter
    const count = await redis.incr(key);

    // If this is the first request in the window, set the TTL
    if (count === 1) {
      await redis.expire(key, config.windowSeconds);
    }

    // Get the remaining TTL to calculate resetAt and retryAfter
    const ttl = await redis.ttl(key);

    // Handle edge case: TTL is -1 (key exists but no expiry set — race condition)
    // Re-set the expire to ensure the window closes
    if (ttl === -1) {
      await redis.expire(key, config.windowSeconds);
    }

    const effectiveTtl = ttl > 0 ? ttl : config.windowSeconds;
    const resetAt = new Date(Date.now() + effectiveTtl * 1000);

    if (count > config.max) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: effectiveTtl,
      };
    }

    return {
      allowed: true,
      remaining: config.max - count,
      resetAt,
      retryAfter: 0,
    };
  } catch (error) {
    // Graceful degradation: allow request on Redis failure
    logger.warn({ error, key }, 'Rate limiter Redis error — allowing request');
    return {
      allowed: true,
      remaining: config.max,
      resetAt: new Date(Date.now() + config.windowSeconds * 1000),
      retryAfter: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Rate limit reset
// ---------------------------------------------------------------------------

/**
 * Reset the rate limit counter for a key.
 *
 * Called after successful authentication to clear the counter,
 * allowing the user to make fresh attempts if they log out and back in.
 *
 * @param key - Rate limit key to reset
 */
export async function resetRateLimit(key: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(key);
  } catch (error) {
    // Non-critical — log and continue
    logger.warn({ error, key }, 'Failed to reset rate limit counter');
  }
}

// ---------------------------------------------------------------------------
// Key builders
// ---------------------------------------------------------------------------

/**
 * Hash an identifier for use in rate limit keys.
 * Uses SHA-256 to normalize variable-length inputs into fixed-length keys
 * and prevent PII from appearing in Redis key names.
 *
 * @param value - The raw identifier to hash
 * @returns First 16 hex chars of SHA-256 (64-bit — enough for key uniqueness)
 */
function hashIdentifier(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

/**
 * Build a rate limit key for login attempts.
 * Combines IP + email to rate-limit per user per source IP.
 *
 * Format: ratelimit:login:{org_id}:{sha256(ip + email)[:16]}
 *
 * @param orgId - Organization UUID
 * @param ip - Client IP address
 * @param email - Email address being attempted
 * @returns Rate limit key string
 */
export function buildLoginRateLimitKey(orgId: string, ip: string, email: string): string {
  return `ratelimit:login:${orgId}:${hashIdentifier(ip + email)}`;
}

/**
 * Build a rate limit key for magic link requests.
 * Rate-limits per email to prevent spam.
 *
 * Format: ratelimit:magic:{org_id}:{sha256(email)[:16]}
 *
 * @param orgId - Organization UUID
 * @param email - Email address requesting magic link
 * @returns Rate limit key string
 */
export function buildMagicLinkRateLimitKey(orgId: string, email: string): string {
  return `ratelimit:magic:${orgId}:${hashIdentifier(email)}`;
}

/**
 * Build a rate limit key for password reset requests.
 * Rate-limits per email to prevent abuse.
 *
 * Format: ratelimit:reset:{org_id}:{sha256(email)[:16]}
 *
 * @param orgId - Organization UUID
 * @param email - Email address requesting password reset
 * @returns Rate limit key string
 */
/**
 * Build a generic rate limit key for custom actions (e.g., 2FA verification, OTP resend).
 *
 * @param action - Action identifier (e.g., '2fa_verify', '2fa_resend')
 * @param orgId - Organization UUID
 * @param identifier - User-specific identifier (e.g., userId)
 * @returns Redis key string
 */
export function buildRateLimitKey(action: string, orgId: string, identifier: string): string {
  return `ratelimit:${action}:${orgId}:${hashIdentifier(identifier)}`;
}

export function buildPasswordResetRateLimitKey(orgId: string, email: string): string {
  return `ratelimit:reset:${orgId}:${hashIdentifier(email)}`;
}

// ---------------------------------------------------------------------------
// Config loaders
// ---------------------------------------------------------------------------

/**
 * Load login rate limit configuration from system_config.
 *
 * @returns Rate limit config with max attempts and window duration
 */
export async function loadLoginRateLimitConfig(): Promise<RateLimitConfig> {
  const [max, windowSeconds] = await Promise.all([
    getSystemConfigNumber('rate_limit_login_max', 10),
    getSystemConfigNumber('rate_limit_login_window', 900),
  ]);
  return { max, windowSeconds };
}

/**
 * Load magic link rate limit configuration from system_config.
 *
 * @returns Rate limit config with max requests and window duration
 */
export async function loadMagicLinkRateLimitConfig(): Promise<RateLimitConfig> {
  const [max, windowSeconds] = await Promise.all([
    getSystemConfigNumber('rate_limit_magic_link_max', 5),
    getSystemConfigNumber('rate_limit_magic_link_window', 900),
  ]);
  return { max, windowSeconds };
}

/**
 * Load password reset rate limit configuration from system_config.
 *
 * @returns Rate limit config with max requests and window duration
 */
export async function loadPasswordResetRateLimitConfig(): Promise<RateLimitConfig> {
  const [max, windowSeconds] = await Promise.all([
    getSystemConfigNumber('rate_limit_password_reset_max', 5),
    getSystemConfigNumber('rate_limit_password_reset_window', 900),
  ]);
  return { max, windowSeconds };
}
