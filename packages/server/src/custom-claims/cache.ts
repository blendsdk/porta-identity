/**
 * Custom claims cache — Redis-backed fast lookup layer.
 *
 * Caches claim definitions per application to reduce database queries
 * during admin views and list operations. Claim values are NOT cached
 * because they have high cardinality (per-user × per-claim) and the
 * DB query with JOIN is already efficient for the token issuance path.
 *
 * Key format: `claims:defs:{applicationId}`
 * TTL: 5 minutes (balance between freshness and performance)
 *
 * All Redis errors are caught and logged — cache failures never propagate
 * to callers. The system gracefully degrades to direct database lookups
 * when Redis is unavailable.
 *
 * Invalidation triggers:
 * - Definition created/updated/deleted → invalidateDefinitionsCache()
 */

import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import type { CustomClaimDefinition } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cache TTL in seconds (5 minutes) */
const CACHE_TTL = 300;

/** Key prefix for claim definitions by application ID */
const DEFINITIONS_PREFIX = 'claims:defs:';

// ---------------------------------------------------------------------------
// Get / Set / Invalidate
// ---------------------------------------------------------------------------

/**
 * Get cached claim definitions for an application.
 *
 * Returns null on cache miss, invalid JSON, or Redis error.
 * Callers should fall back to the database on null.
 *
 * @param applicationId - Application UUID
 * @returns Cached definitions array or null on miss
 */
export async function getCachedDefinitions(
  applicationId: string,
): Promise<CustomClaimDefinition[] | null> {
  try {
    const redis = getRedis();
    const data = await redis.get(`${DEFINITIONS_PREFIX}${applicationId}`);
    if (!data) return null;
    return deserializeDefinitions(data);
  } catch (err) {
    // Graceful degradation — log and return null so caller falls back to DB
    logger.warn({ err, applicationId }, 'Failed to read claim definitions from cache');
    return null;
  }
}

/**
 * Cache claim definitions for an application.
 *
 * Stores the definitions array as JSON with a 5-minute TTL.
 * Date fields are serialized to ISO 8601 strings automatically.
 *
 * @param applicationId - Application UUID
 * @param definitions - Array of definitions to cache
 */
export async function setCachedDefinitions(
  applicationId: string,
  definitions: CustomClaimDefinition[],
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(
      `${DEFINITIONS_PREFIX}${applicationId}`,
      JSON.stringify(definitions),
      'EX',
      CACHE_TTL,
    );
  } catch (err) {
    // Graceful degradation — cache write failure is non-fatal
    logger.warn({ err, applicationId }, 'Failed to cache claim definitions');
  }
}

/**
 * Invalidate cached claim definitions for an application.
 *
 * Should be called after any definition create, update, or delete.
 *
 * @param applicationId - Application UUID
 */
export async function invalidateDefinitionsCache(applicationId: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(`${DEFINITIONS_PREFIX}${applicationId}`);
  } catch (err) {
    // Graceful degradation — cache invalidation failure is non-fatal
    logger.warn({ err, applicationId }, 'Failed to invalidate claim definitions cache');
  }
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Deserialize a JSON string from Redis into a CustomClaimDefinition array.
 *
 * Converts ISO 8601 date strings back to Date objects for the
 * createdAt and updatedAt fields on each definition.
 *
 * @param data - JSON string from Redis
 * @returns Array of definition objects with proper Date instances, or null if parse fails
 */
function deserializeDefinitions(data: string): CustomClaimDefinition[] | null {
  try {
    const parsed = JSON.parse(data) as CustomClaimDefinition[];

    // Restore Date objects from ISO string serialization
    for (const def of parsed) {
      def.createdAt = new Date(def.createdAt);
      def.updatedAt = new Date(def.updatedAt);
    }

    return parsed;
  } catch {
    logger.warn('Failed to parse cached claim definitions JSON');
    return null;
  }
}
