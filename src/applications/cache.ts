/**
 * Application cache — Redis-backed fast lookup layer.
 *
 * Provides get/set/invalidate operations for Application objects
 * stored in Redis. Each application is cached under two keys:
 *   - `app:slug:{slug}` — for lookups by slug (e.g., client service)
 *   - `app:id:{id}`     — for lookups by UUID
 *
 * Both keys store the same JSON-serialized Application object
 * with a 5-minute TTL. Date fields (createdAt, updatedAt) are
 * serialized as ISO 8601 strings and deserialized back to Date
 * objects on read.
 *
 * Module data is NOT cached separately — modules are small enough
 * to always load from the database. Application-level caching is
 * sufficient since apps are looked up frequently by the client service.
 *
 * All Redis errors are caught and logged — cache failures never
 * propagate to callers. The system gracefully degrades to direct
 * database lookups when Redis is unavailable.
 */

import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import type { Application } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cache TTL in seconds (5 minutes) */
const CACHE_TTL = 300;

/** Key prefix for slug-based lookups */
const SLUG_PREFIX = 'app:slug:';

/** Key prefix for ID-based lookups */
const ID_PREFIX = 'app:id:';

// ---------------------------------------------------------------------------
// Cache retrieval
// ---------------------------------------------------------------------------

/**
 * Get an application from cache by slug.
 *
 * Returns null on cache miss, invalid JSON, or Redis error.
 * Callers should fall back to the database on null.
 *
 * @param slug - Application slug
 * @returns Cached application or null
 */
export async function getCachedApplicationBySlug(slug: string): Promise<Application | null> {
  try {
    const redis = getRedis();
    const data = await redis.get(`${SLUG_PREFIX}${slug}`);
    if (!data) return null;
    return deserializeApplication(data);
  } catch (err) {
    // Graceful degradation — log and return null so caller falls back to DB
    logger.warn({ err, slug }, 'Failed to read application from cache by slug');
    return null;
  }
}

/**
 * Get an application from cache by ID.
 *
 * Returns null on cache miss, invalid JSON, or Redis error.
 * Callers should fall back to the database on null.
 *
 * @param id - Application UUID
 * @returns Cached application or null
 */
export async function getCachedApplicationById(id: string): Promise<Application | null> {
  try {
    const redis = getRedis();
    const data = await redis.get(`${ID_PREFIX}${id}`);
    if (!data) return null;
    return deserializeApplication(data);
  } catch (err) {
    // Graceful degradation — log and return null so caller falls back to DB
    logger.warn({ err, id }, 'Failed to read application from cache by ID');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cache storage
// ---------------------------------------------------------------------------

/**
 * Store an application in cache under both slug and ID keys.
 *
 * Both keys get the same TTL so they expire together.
 * Date fields are serialized to ISO 8601 strings automatically
 * by JSON.stringify().
 *
 * @param app - Application to cache
 */
export async function cacheApplication(app: Application): Promise<void> {
  try {
    const redis = getRedis();
    const data = JSON.stringify(app);

    // Store under both keys with the same TTL
    await redis.set(`${SLUG_PREFIX}${app.slug}`, data, 'EX', CACHE_TTL);
    await redis.set(`${ID_PREFIX}${app.id}`, data, 'EX', CACHE_TTL);
  } catch (err) {
    // Graceful degradation — cache write failure is non-fatal
    logger.warn({ err, slug: app.slug, id: app.id }, 'Failed to cache application');
  }
}

// ---------------------------------------------------------------------------
// Cache invalidation
// ---------------------------------------------------------------------------

/**
 * Invalidate all cache entries for an application.
 *
 * Deletes both the slug-keyed and ID-keyed cache entries.
 * Should be called after any write operation (create, update,
 * status change) to ensure stale data is not served.
 *
 * @param slug - Application slug
 * @param id - Application UUID
 */
export async function invalidateApplicationCache(slug: string, id: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(`${SLUG_PREFIX}${slug}`, `${ID_PREFIX}${id}`);
  } catch (err) {
    // Graceful degradation — cache invalidation failure is non-fatal
    logger.warn({ err, slug, id }, 'Failed to invalidate application cache');
  }
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Deserialize a JSON string from Redis into an Application object.
 *
 * Converts ISO 8601 date strings back to Date objects for the
 * createdAt and updatedAt fields, which JSON.stringify() serializes
 * as strings rather than Date instances.
 *
 * @param data - JSON string from Redis
 * @returns Application object with proper Date instances, or null if parse fails
 */
function deserializeApplication(data: string): Application | null {
  try {
    const parsed = JSON.parse(data) as Application;

    // Restore Date objects from ISO string serialization
    parsed.createdAt = new Date(parsed.createdAt);
    parsed.updatedAt = new Date(parsed.updatedAt);

    return parsed;
  } catch {
    logger.warn('Failed to parse cached application JSON');
    return null;
  }
}
