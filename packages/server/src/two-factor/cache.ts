/**
 * Two-factor authentication cache — Redis-backed fast lookup layer.
 *
 * Provides get/set/invalidate operations for a user's 2FA status stored
 * in Redis. The cached status includes whether 2FA is enabled, the method,
 * TOTP configuration state, and remaining recovery codes.
 *
 * Cache key: `2fa:status:{userId}` with a 5-minute TTL (matches org/user caches).
 *
 * Used by the auth login flow to quickly determine if 2FA is required
 * without hitting the database for every authentication attempt.
 *
 * All Redis errors are caught and logged — cache failures never
 * propagate to callers. The system gracefully degrades to direct
 * database lookups when Redis is unavailable.
 */

import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import type { TwoFactorStatus } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cache TTL in seconds (5 minutes — matches organizations/users caches) */
const CACHE_TTL = 300;

/** Key prefix for user 2FA status lookups */
const STATUS_PREFIX = '2fa:status:';

// ---------------------------------------------------------------------------
// Cache retrieval
// ---------------------------------------------------------------------------

/**
 * Get a user's 2FA status from cache.
 *
 * Returns null on cache miss, invalid JSON, or Redis error.
 * Callers should fall back to building the status from the database.
 *
 * @param userId - User UUID
 * @returns Cached 2FA status or null
 */
export async function getCachedTwoFactorStatus(userId: string): Promise<TwoFactorStatus | null> {
  try {
    const redis = getRedis();
    const data = await redis.get(`${STATUS_PREFIX}${userId}`);
    if (!data) return null;
    return deserializeStatus(data);
  } catch (err) {
    // Graceful degradation — log and return null so caller falls back to DB
    logger.warn({ err, userId }, 'Failed to read 2FA status from cache');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cache storage
// ---------------------------------------------------------------------------

/**
 * Store a user's 2FA status in cache.
 *
 * The status object is simple (no Date fields) so JSON serialization
 * is straightforward — no special deserialization needed.
 *
 * @param userId - User UUID
 * @param status - 2FA status to cache
 */
export async function cacheTwoFactorStatus(
  userId: string,
  status: TwoFactorStatus,
): Promise<void> {
  try {
    const redis = getRedis();
    const data = JSON.stringify(status);
    await redis.set(`${STATUS_PREFIX}${userId}`, data, 'EX', CACHE_TTL);
  } catch (err) {
    // Graceful degradation — cache write failure is non-fatal
    logger.warn({ err, userId }, 'Failed to cache 2FA status');
  }
}

// ---------------------------------------------------------------------------
// Cache invalidation
// ---------------------------------------------------------------------------

/**
 * Invalidate the cached 2FA status for a user.
 *
 * Should be called after any 2FA state change (setup, disable,
 * verification, recovery code use) to ensure stale data is not served.
 *
 * @param userId - User UUID
 */
export async function invalidateTwoFactorCache(userId: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(`${STATUS_PREFIX}${userId}`);
  } catch (err) {
    // Graceful degradation — cache invalidation failure is non-fatal
    logger.warn({ err, userId }, 'Failed to invalidate 2FA status cache');
  }
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Deserialize a JSON string from Redis into a TwoFactorStatus object.
 *
 * The TwoFactorStatus interface has no Date fields, so no special
 * deserialization is needed beyond JSON.parse().
 *
 * @param data - JSON string from Redis
 * @returns TwoFactorStatus object or null if parse fails
 */
function deserializeStatus(data: string): TwoFactorStatus | null {
  try {
    return JSON.parse(data) as TwoFactorStatus;
  } catch {
    logger.warn('Failed to parse cached 2FA status JSON');
    return null;
  }
}
