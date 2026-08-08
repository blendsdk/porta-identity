/**
 * User cache — Redis-backed fast lookup layer.
 *
 * Provides get/set/invalidate operations for User objects stored in
 * Redis. Users are cached by ID only (not by email) because:
 *   - Email lookups happen during login (which hits DB for password_hash anyway)
 *   - ID lookups happen during token validation, userinfo, etc. (cacheable)
 *   - Simpler invalidation — one key per user instead of two
 *
 * Date fields are serialized as ISO 8601 strings by JSON.stringify()
 * and restored to Date objects on read. The user cache has 5 nullable
 * date fields: passwordChangedAt, lockedAt, lastLoginAt, createdAt,
 * updatedAt.
 *
 * All Redis errors are caught and logged — cache failures never
 * propagate to callers. The system gracefully degrades to direct
 * database lookups when Redis is unavailable.
 */

import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import type { User } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cache TTL in seconds (5 minutes — matches organizations) */
const CACHE_TTL = 300;

/** Key prefix for ID-based lookups */
const USER_PREFIX = 'user:id:';

// ---------------------------------------------------------------------------
// Cache retrieval
// ---------------------------------------------------------------------------

/**
 * Get a user from cache by ID.
 *
 * Returns null on cache miss, invalid JSON, or Redis error.
 * Callers should fall back to the database on null.
 *
 * @param id - User UUID
 * @returns Cached user or null
 */
export async function getCachedUserById(id: string): Promise<User | null> {
  try {
    const redis = getRedis();
    const data = await redis.get(`${USER_PREFIX}${id}`);
    if (!data) return null;
    return deserializeUser(data);
  } catch (err) {
    // Graceful degradation — log and return null so caller falls back to DB
    logger.warn({ err, id }, 'Failed to read user from cache');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cache storage
// ---------------------------------------------------------------------------

/**
 * Store a user in cache under the ID key.
 *
 * Date fields are serialized to ISO 8601 strings automatically
 * by JSON.stringify(). Silent failure — cache write errors are
 * logged but never propagated.
 *
 * @param user - User to cache
 */
export async function cacheUser(user: User): Promise<void> {
  try {
    const redis = getRedis();
    const data = JSON.stringify(user);
    await redis.set(`${USER_PREFIX}${user.id}`, data, 'EX', CACHE_TTL);
  } catch (err) {
    // Graceful degradation — cache write failure is non-fatal
    logger.warn({ err, id: user.id }, 'Failed to cache user');
  }
}

// ---------------------------------------------------------------------------
// Cache invalidation
// ---------------------------------------------------------------------------

/**
 * Invalidate the cache entry for a user.
 *
 * Should be called after any write operation (create, update, status
 * change, password change) to ensure stale data is not served.
 *
 * @param id - User UUID
 */
export async function invalidateUserCache(id: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(`${USER_PREFIX}${id}`);
  } catch (err) {
    // Graceful degradation — cache invalidation failure is non-fatal
    logger.warn({ err, id }, 'Failed to invalidate user cache');
  }
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Deserialize a JSON string from Redis into a User object.
 *
 * Converts ISO 8601 date strings back to Date objects for all date
 * fields. The User interface has 5 date fields: createdAt, updatedAt
 * (always present), and passwordChangedAt, lockedAt, lastLoginAt
 * (nullable — only converted when non-null).
 *
 * @param data - JSON string from Redis
 * @returns User object with proper Date instances, or null if parse fails
 */
function deserializeUser(data: string): User | null {
  try {
    const parsed = JSON.parse(data) as User;

    // Restore required Date objects from ISO string serialization
    parsed.createdAt = new Date(parsed.createdAt);
    parsed.updatedAt = new Date(parsed.updatedAt);

    // Restore nullable Date objects (only convert when non-null)
    if (parsed.passwordChangedAt !== null) {
      parsed.passwordChangedAt = new Date(parsed.passwordChangedAt);
    }
    if (parsed.lockedAt !== null) {
      parsed.lockedAt = new Date(parsed.lockedAt);
    }
    if (parsed.lastLoginAt !== null) {
      parsed.lastLoginAt = new Date(parsed.lastLoginAt);
    }

    return parsed;
  } catch {
    logger.warn('Failed to parse cached user JSON');
    return null;
  }
}
