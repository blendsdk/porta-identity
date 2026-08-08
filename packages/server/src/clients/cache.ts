/**
 * Client cache — Redis-backed fast lookup layer.
 *
 * Provides get/set/invalidate operations for Client objects stored in Redis.
 * Each client is cached under two keys:
 *   - `client:cid:{clientId}` — for lookups by OIDC client_id (public identifier)
 *   - `client:id:{id}`        — for lookups by internal UUID
 *
 * Both keys store the same JSON-serialized Client object with a 5-minute TTL.
 * Date fields (createdAt, updatedAt) are serialized as ISO 8601 strings and
 * deserialized back to Date objects on read.
 *
 * IMPORTANT: Secret data is NEVER cached. Secret lookups always hit the
 * database directly to ensure revoked/expired secrets are immediately
 * ineffective. Only client metadata is cached here.
 *
 * All Redis errors are caught and logged — cache failures never propagate
 * to callers. The system gracefully degrades to direct database lookups
 * when Redis is unavailable.
 */

import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import type { Client } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cache TTL in seconds (5 minutes) */
const CACHE_TTL = 300;

/** Key prefix for OIDC client_id lookups */
const CLIENT_ID_PREFIX = 'client:cid:';

/** Key prefix for internal UUID lookups */
const ID_PREFIX = 'client:id:';

// ---------------------------------------------------------------------------
// Cache retrieval
// ---------------------------------------------------------------------------

/**
 * Get a client from cache by OIDC client_id.
 *
 * Returns null on cache miss, invalid JSON, or Redis error.
 * Callers should fall back to the database on null.
 *
 * @param clientId - OIDC client_id (public identifier)
 * @returns Cached client or null
 */
export async function getCachedClientByClientId(clientId: string): Promise<Client | null> {
  try {
    const redis = getRedis();
    const data = await redis.get(`${CLIENT_ID_PREFIX}${clientId}`);
    if (!data) return null;
    return deserializeClient(data);
  } catch (err) {
    // Graceful degradation — log and return null so caller falls back to DB
    logger.warn({ err, clientId }, 'Failed to read client from cache by client_id');
    return null;
  }
}

/**
 * Get a client from cache by internal UUID.
 *
 * Returns null on cache miss, invalid JSON, or Redis error.
 * Callers should fall back to the database on null.
 *
 * @param id - Client internal UUID
 * @returns Cached client or null
 */
export async function getCachedClientById(id: string): Promise<Client | null> {
  try {
    const redis = getRedis();
    const data = await redis.get(`${ID_PREFIX}${id}`);
    if (!data) return null;
    return deserializeClient(data);
  } catch (err) {
    // Graceful degradation — log and return null so caller falls back to DB
    logger.warn({ err, id }, 'Failed to read client from cache by ID');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cache storage
// ---------------------------------------------------------------------------

/**
 * Store a client in cache under both client_id and internal ID keys.
 *
 * Both keys get the same TTL so they expire together.
 * Date fields are serialized to ISO 8601 strings automatically
 * by JSON.stringify().
 *
 * @param client - Client to cache
 */
export async function cacheClient(client: Client): Promise<void> {
  try {
    const redis = getRedis();
    const data = JSON.stringify(client);

    // Store under both keys with the same TTL
    await redis.set(`${CLIENT_ID_PREFIX}${client.clientId}`, data, 'EX', CACHE_TTL);
    await redis.set(`${ID_PREFIX}${client.id}`, data, 'EX', CACHE_TTL);
  } catch (err) {
    // Graceful degradation — cache write failure is non-fatal
    logger.warn({ err, clientId: client.clientId, id: client.id }, 'Failed to cache client');
  }
}

// ---------------------------------------------------------------------------
// Cache invalidation
// ---------------------------------------------------------------------------

/**
 * Invalidate all cache entries for a client.
 *
 * Deletes both the client_id-keyed and ID-keyed cache entries.
 * Should be called after any write operation (create, update,
 * status change) to ensure stale data is not served.
 *
 * @param clientId - OIDC client_id (public identifier)
 * @param id - Client internal UUID
 */
export async function invalidateClientCache(clientId: string, id: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(`${CLIENT_ID_PREFIX}${clientId}`, `${ID_PREFIX}${id}`);
  } catch (err) {
    // Graceful degradation — cache invalidation failure is non-fatal
    logger.warn({ err, clientId, id }, 'Failed to invalidate client cache');
  }
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Deserialize a JSON string from Redis into a Client object.
 *
 * Converts ISO 8601 date strings back to Date objects for the
 * createdAt and updatedAt fields, which JSON.stringify() serializes
 * as strings rather than Date instances.
 *
 * @param data - JSON string from Redis
 * @returns Client object with proper Date instances, or null if parse fails
 */
function deserializeClient(data: string): Client | null {
  try {
    const parsed = JSON.parse(data) as Client;

    // Restore Date objects from ISO string serialization
    parsed.createdAt = new Date(parsed.createdAt);
    parsed.updatedAt = new Date(parsed.updatedAt);

    return parsed;
  } catch {
    logger.warn('Failed to parse cached client JSON');
    return null;
  }
}
