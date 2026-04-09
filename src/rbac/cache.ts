/**
 * RBAC cache — Redis-backed fast lookup layer.
 *
 * Provides get/set/invalidate operations for RBAC data stored in Redis:
 *   - `rbac:role:{id}` — Individual role objects (for admin lookups)
 *   - `rbac:user-roles:{userId}` — User's role slugs (for token claims)
 *   - `rbac:user-perms:{userId}` — User's permission slugs (for token claims)
 *
 * The user-roles and user-permissions caches store slug arrays (string[])
 * rather than full objects because token claims only need slugs. This
 * reduces cache memory usage and serialization overhead on the hot path.
 *
 * All Redis errors are caught and logged — cache failures never propagate
 * to callers. The system gracefully degrades to direct database lookups
 * when Redis is unavailable.
 *
 * TTL: 5 minutes (balance between freshness and performance).
 *
 * Invalidation triggers:
 * - Role updated/deleted → invalidateRoleCache()
 * - Role-permission mapping changed → invalidateAllUserRbacCaches()
 * - User-role assignment changed → invalidateUserRbacCache()
 */

import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import type { Role } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cache TTL in seconds (5 minutes) */
const CACHE_TTL = 300;

/** Key prefix for role objects by ID */
const ROLE_PREFIX = 'rbac:role:';

/** Key prefix for user role slugs */
const USER_ROLES_PREFIX = 'rbac:user-roles:';

/** Key prefix for user permission slugs */
const USER_PERMISSIONS_PREFIX = 'rbac:user-perms:';

// ---------------------------------------------------------------------------
// Role cache
// ---------------------------------------------------------------------------

/**
 * Get a cached role by ID.
 *
 * Returns null on cache miss, invalid JSON, or Redis error.
 * Callers should fall back to the database on null.
 *
 * @param id - Role UUID
 * @returns Cached role or null
 */
export async function getCachedRole(id: string): Promise<Role | null> {
  try {
    const redis = getRedis();
    const data = await redis.get(`${ROLE_PREFIX}${id}`);
    if (!data) return null;
    return deserializeRole(data);
  } catch (err) {
    // Graceful degradation — log and return null so caller falls back to DB
    logger.warn({ err, id }, 'Failed to read role from cache');
    return null;
  }
}

/**
 * Cache a role by ID.
 *
 * Stores the full Role object as JSON with a 5-minute TTL.
 * Date fields are serialized to ISO 8601 strings automatically.
 *
 * @param role - Role to cache
 */
export async function setCachedRole(role: Role): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(`${ROLE_PREFIX}${role.id}`, JSON.stringify(role), 'EX', CACHE_TTL);
  } catch (err) {
    // Graceful degradation — cache write failure is non-fatal
    logger.warn({ err, id: role.id }, 'Failed to cache role');
  }
}

/**
 * Invalidate a cached role.
 *
 * Should be called after any role update or deletion.
 *
 * @param id - Role UUID
 */
export async function invalidateRoleCache(id: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(`${ROLE_PREFIX}${id}`);
  } catch (err) {
    // Graceful degradation — cache invalidation failure is non-fatal
    logger.warn({ err, id }, 'Failed to invalidate role cache');
  }
}

// ---------------------------------------------------------------------------
// User roles cache (slug arrays for token claims)
// ---------------------------------------------------------------------------

/**
 * Get cached user role slugs (for token claims).
 *
 * Returns null on cache miss, indicating the caller should resolve
 * from the database and cache the result.
 *
 * @param userId - User UUID
 * @returns Cached array of role slugs, or null on miss
 */
export async function getCachedUserRoles(userId: string): Promise<string[] | null> {
  try {
    const redis = getRedis();
    const data = await redis.get(`${USER_ROLES_PREFIX}${userId}`);
    if (!data) return null;
    return JSON.parse(data) as string[];
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to read user roles from cache');
    return null;
  }
}

/**
 * Cache user role slugs.
 *
 * Stores the slug array as JSON with a 5-minute TTL.
 *
 * @param userId - User UUID
 * @param roleSlugs - Array of role slug strings
 */
export async function setCachedUserRoles(userId: string, roleSlugs: string[]): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(`${USER_ROLES_PREFIX}${userId}`, JSON.stringify(roleSlugs), 'EX', CACHE_TTL);
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to cache user roles');
  }
}

// ---------------------------------------------------------------------------
// User permissions cache (slug arrays for token claims)
// ---------------------------------------------------------------------------

/**
 * Get cached user permission slugs (for token claims).
 *
 * Returns null on cache miss, indicating the caller should resolve
 * from the database and cache the result.
 *
 * @param userId - User UUID
 * @returns Cached array of permission slugs, or null on miss
 */
export async function getCachedUserPermissions(userId: string): Promise<string[] | null> {
  try {
    const redis = getRedis();
    const data = await redis.get(`${USER_PERMISSIONS_PREFIX}${userId}`);
    if (!data) return null;
    return JSON.parse(data) as string[];
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to read user permissions from cache');
    return null;
  }
}

/**
 * Cache user permission slugs.
 *
 * Stores the slug array as JSON with a 5-minute TTL.
 *
 * @param userId - User UUID
 * @param permissionSlugs - Array of permission slug strings
 */
export async function setCachedUserPermissions(
  userId: string,
  permissionSlugs: string[],
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(
      `${USER_PERMISSIONS_PREFIX}${userId}`,
      JSON.stringify(permissionSlugs),
      'EX',
      CACHE_TTL,
    );
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to cache user permissions');
  }
}

// ---------------------------------------------------------------------------
// Invalidation
// ---------------------------------------------------------------------------

/**
 * Invalidate all user-related RBAC cache (roles + permissions).
 *
 * Called when a user's role assignments change. Deletes both the
 * role slugs cache and permission slugs cache for the user.
 *
 * @param userId - User UUID
 */
export async function invalidateUserRbacCache(userId: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(
      `${USER_ROLES_PREFIX}${userId}`,
      `${USER_PERMISSIONS_PREFIX}${userId}`,
    );
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to invalidate user RBAC cache');
  }
}

/**
 * Invalidate all user RBAC caches (roles + permissions) for all users.
 *
 * Called when role-permission mappings change, since we cannot easily
 * enumerate which users have a specific role from Redis alone. Uses
 * SCAN to find and delete matching keys without blocking Redis.
 *
 * This is a relatively expensive operation but role-permission changes
 * are infrequent admin operations, so the trade-off is acceptable.
 */
export async function invalidateAllUserRbacCaches(): Promise<void> {
  try {
    const redis = getRedis();

    // Use SCAN to find and delete user RBAC cache keys
    // SCAN is non-blocking unlike KEYS which can lock Redis
    const patterns = [`${USER_ROLES_PREFIX}*`, `${USER_PERMISSIONS_PREFIX}*`];

    for (const pattern of patterns) {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== '0');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to invalidate all user RBAC caches');
  }
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Deserialize a JSON string from Redis into a Role object.
 *
 * Converts ISO 8601 date strings back to Date objects for the
 * createdAt and updatedAt fields.
 *
 * @param data - JSON string from Redis
 * @returns Role object with proper Date instances, or null if parse fails
 */
function deserializeRole(data: string): Role | null {
  try {
    const parsed = JSON.parse(data) as Role;

    // Restore Date objects from ISO string serialization
    parsed.createdAt = new Date(parsed.createdAt);
    parsed.updatedAt = new Date(parsed.updatedAt);

    return parsed;
  } catch {
    logger.warn('Failed to parse cached role JSON');
    return null;
  }
}
