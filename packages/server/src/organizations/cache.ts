/**
 * Organization cache — Redis-backed fast lookup layer.
 *
 * Provides get/set/invalidate operations for Organization objects
 * stored in Redis. Each organization is cached under two keys:
 *   - `org:slug:{slug}` — for tenant resolver lookups by URL path
 *   - `org:id:{id}`     — for service layer lookups by UUID
 *
 * Both keys store the same JSON-serialized Organization object
 * with a 5-minute TTL. Date fields (createdAt, updatedAt) are
 * serialized as ISO 8601 strings and deserialized back to Date
 * objects on read.
 *
 * All Redis errors are caught and logged — cache failures never
 * propagate to callers. The system gracefully degrades to direct
 * database lookups when Redis is unavailable.
 */

import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import type { Organization } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cache TTL in seconds (5 minutes) */
const CACHE_TTL = 300;

/** Key prefix for slug-based lookups */
const SLUG_PREFIX = 'org:slug:';

/** Key prefix for ID-based lookups */
const ID_PREFIX = 'org:id:';

// ---------------------------------------------------------------------------
// Cache retrieval
// ---------------------------------------------------------------------------

/**
 * Get an organization from cache by slug.
 *
 * Returns null on cache miss, invalid JSON, or Redis error.
 * Callers should fall back to the database on null.
 *
 * @param slug - Organization slug
 * @returns Cached organization or null
 */
export async function getCachedOrganizationBySlug(slug: string): Promise<Organization | null> {
  try {
    const redis = getRedis();
    const data = await redis.get(`${SLUG_PREFIX}${slug}`);
    if (!data) return null;
    return deserializeOrganization(data);
  } catch (err) {
    // Graceful degradation — log and return null so caller falls back to DB
    logger.warn({ err, slug }, 'Failed to read organization from cache by slug');
    return null;
  }
}

/**
 * Get an organization from cache by ID.
 *
 * Returns null on cache miss, invalid JSON, or Redis error.
 * Callers should fall back to the database on null.
 *
 * @param id - Organization UUID
 * @returns Cached organization or null
 */
export async function getCachedOrganizationById(id: string): Promise<Organization | null> {
  try {
    const redis = getRedis();
    const data = await redis.get(`${ID_PREFIX}${id}`);
    if (!data) return null;
    return deserializeOrganization(data);
  } catch (err) {
    // Graceful degradation — log and return null so caller falls back to DB
    logger.warn({ err, id }, 'Failed to read organization from cache by ID');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cache storage
// ---------------------------------------------------------------------------

/**
 * Store an organization in cache under both slug and ID keys.
 *
 * Both keys get the same TTL so they expire together.
 * Date fields are serialized to ISO 8601 strings automatically
 * by JSON.stringify().
 *
 * @param org - Organization to cache
 */
export async function cacheOrganization(org: Organization): Promise<void> {
  try {
    const redis = getRedis();
    const data = JSON.stringify(org);

    // Store under both keys with the same TTL
    await redis.set(`${SLUG_PREFIX}${org.slug}`, data, 'EX', CACHE_TTL);
    await redis.set(`${ID_PREFIX}${org.id}`, data, 'EX', CACHE_TTL);
  } catch (err) {
    // Graceful degradation — cache write failure is non-fatal
    logger.warn({ err, slug: org.slug, id: org.id }, 'Failed to cache organization');
  }
}

// ---------------------------------------------------------------------------
// Cache invalidation
// ---------------------------------------------------------------------------

/**
 * Invalidate all cache entries for an organization.
 *
 * Deletes both the slug-keyed and ID-keyed cache entries.
 * Should be called after any write operation (create, update,
 * status change) to ensure stale data is not served.
 *
 * @param slug - Organization slug
 * @param id - Organization UUID
 */
export async function invalidateOrganizationCache(slug: string, id: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(`${SLUG_PREFIX}${slug}`, `${ID_PREFIX}${id}`);
  } catch (err) {
    // Graceful degradation — cache invalidation failure is non-fatal
    logger.warn({ err, slug, id }, 'Failed to invalidate organization cache');
  }
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Deserialize a JSON string from Redis into an Organization object.
 *
 * Converts ISO 8601 date strings back to Date objects for the
 * createdAt and updatedAt fields, which JSON.stringify() serializes
 * as strings rather than Date instances.
 *
 * @param data - JSON string from Redis
 * @returns Organization object with proper Date instances, or null if parse fails
 */
function deserializeOrganization(data: string): Organization | null {
  try {
    const parsed = JSON.parse(data) as Organization;

    // Restore Date objects from ISO string serialization
    parsed.createdAt = new Date(parsed.createdAt);
    parsed.updatedAt = new Date(parsed.updatedAt);

    return parsed;
  } catch {
    logger.warn('Failed to parse cached organization JSON');
    return null;
  }
}
