/**
 * Redis adapter for node-oidc-provider.
 *
 * Stores short-lived, high-throughput OIDC artifacts (Session, Interaction,
 * AuthorizationCode, ReplayDetection, ClientCredentials, PushedAuthorizationRequest)
 * in Redis with automatic expiry via TTL.
 *
 * Key patterns:
 *   oidc:{type}:{id}                — Primary key (stores JSON payload)
 *   oidc:{type}:uid:{uid}           — UID index → primary ID (sessions)
 *   oidc:{type}:user_code:{uc}      — User code index → primary ID (device flow)
 *   oidc:{type}:grant:{grantId}     — Grant set of primary IDs (for revocation)
 */

import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { upsertSession, revokeSession } from '../lib/session-tracking.js';
import type { AdapterPayload } from './postgres-adapter.js';

/**
 * Redis adapter implementing the node-oidc-provider storage interface.
 *
 * Each instance is created per-model (e.g., new RedisAdapter('Session')).
 * All keys are namespaced under `oidc:{modelName}:` to avoid collisions
 * with other Redis data.
 */
export class RedisAdapter {
  /** Model name — used in Redis key prefixes (e.g., 'Session', 'Interaction') */
  protected name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Build the primary Redis key for an artifact.
   * @param id - Artifact ID
   * @returns Redis key like 'oidc:Session:abc123'
   */
  protected key(id: string): string {
    return `oidc:${this.name}:${id}`;
  }

  /**
   * Build the UID index key.
   * @param uid - Unique identifier
   * @returns Redis key like 'oidc:Session:uid:def456'
   */
  protected uidKey(uid: string): string {
    return `oidc:${this.name}:uid:${uid}`;
  }

  /**
   * Build the user code index key.
   * @param userCode - User-facing device code
   * @returns Redis key like 'oidc:DeviceCode:user_code:XYZ'
   */
  protected userCodeKey(userCode: string): string {
    return `oidc:${this.name}:user_code:${userCode}`;
  }

  /**
   * Build the grant set key.
   * @param grantId - Grant identifier
   * @returns Redis key like 'oidc:Session:grant:grant789'
   */
  protected grantKey(grantId: string): string {
    return `oidc:${this.name}:grant:${grantId}`;
  }

  /**
   * Store an artifact in Redis with TTL.
   *
   * Sets the main key with the full payload as JSON. Also creates index keys
   * for uid, userCode, and grantId if present in the payload, enabling
   * efficient lookups by those fields.
   *
   * @param id - Artifact ID
   * @param payload - Full OIDC artifact payload
   * @param expiresIn - TTL in seconds
   */
  async upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void> {
    const redis = getRedis();
    const mainKey = this.key(id);

    // Use pipeline for atomic multi-key operations
    const pipeline = redis.pipeline();

    // Store the full payload with TTL
    if (expiresIn) {
      pipeline.set(mainKey, JSON.stringify(payload), 'EX', expiresIn);
    } else {
      pipeline.set(mainKey, JSON.stringify(payload));
    }

    // Create UID index key if present (used by findByUid for session lookups)
    if (payload.uid) {
      const uidIdx = this.uidKey(payload.uid);
      if (expiresIn) {
        pipeline.set(uidIdx, id, 'EX', expiresIn);
      } else {
        pipeline.set(uidIdx, id);
      }
    }

    // Create user code index key if present (used by findByUserCode for device flow)
    if (payload.userCode) {
      const ucIdx = this.userCodeKey(payload.userCode);
      if (expiresIn) {
        pipeline.set(ucIdx, id, 'EX', expiresIn);
      } else {
        pipeline.set(ucIdx, id);
      }
    }

    // Track artifact in grant set if grant_id present (used by revokeByGrantId)
    if (payload.grantId) {
      const grantSetKey = this.grantKey(payload.grantId);
      pipeline.sadd(grantSetKey, id);
      if (expiresIn) {
        pipeline.expire(grantSetKey, expiresIn);
      }
    }

    await pipeline.exec();

    // Fire-and-forget: mirror session data to PostgreSQL for admin listing.
    // Only Session model needs tracking — other models (Interaction, AuthorizationCode, etc.)
    // are short-lived artifacts that don't need admin visibility.
    if (this.name === 'Session') {
      const expiresAt = new Date(Date.now() + expiresIn * 1000);
      upsertSession({
        sessionId: id,
        userId: payload.accountId as string | undefined,
        organizationId: payload.orgId as string | undefined,
        grantId: payload.grantId as string | undefined,
        expiresAt,
      }).catch(() => {
        // Intentionally swallowed — tracking must never break the OIDC flow.
        // upsertSession already logs warnings internally.
      });
    }
  }

  /**
   * Find an artifact by its ID.
   *
   * Returns undefined if the key doesn't exist (expired via TTL or never stored).
   *
   * @param id - Artifact ID
   * @returns The artifact payload, or undefined if not found
   */
  async find(id: string): Promise<AdapterPayload | undefined> {
    const redis = getRedis();
    const data = await redis.get(this.key(id));

    if (!data) return undefined;

    try {
      return JSON.parse(data) as AdapterPayload;
    } catch (error) {
      logger.warn({ key: this.key(id), error }, 'Invalid JSON in Redis OIDC payload');
      return undefined;
    }
  }

  /**
   * Find an artifact by user code (device flow).
   *
   * Looks up the user code index key to get the primary artifact ID,
   * then retrieves the full payload from the main key.
   *
   * @param userCode - The user-facing device code
   * @returns The artifact payload, or undefined if not found
   */
  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    const redis = getRedis();
    const id = await redis.get(this.userCodeKey(userCode));

    if (!id) return undefined;

    return this.find(id);
  }

  /**
   * Find an artifact by UID (sessions).
   *
   * Looks up the UID index key to get the primary artifact ID,
   * then retrieves the full payload from the main key.
   *
   * @param uid - The unique identifier
   * @returns The artifact payload, or undefined if not found
   */
  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    const redis = getRedis();
    const id = await redis.get(this.uidKey(uid));

    if (!id) return undefined;

    return this.find(id);
  }

  /**
   * Mark an artifact as consumed.
   *
   * Reads the current payload, adds a `consumed` timestamp (epoch seconds),
   * and writes it back with the remaining TTL preserved. This is used for
   * authorization code replay detection.
   *
   * @param id - Artifact ID to mark as consumed
   */
  async consume(id: string): Promise<void> {
    const redis = getRedis();
    const mainKey = this.key(id);

    const data = await redis.get(mainKey);
    if (!data) return;

    try {
      const payload = JSON.parse(data) as AdapterPayload;
      payload.consumed = Math.floor(Date.now() / 1000);

      // Preserve the remaining TTL when updating the payload
      const ttl = await redis.ttl(mainKey);
      if (ttl > 0) {
        await redis.set(mainKey, JSON.stringify(payload), 'EX', ttl);
      } else {
        // No TTL set (or key is expiring imminently) — just update
        await redis.set(mainKey, JSON.stringify(payload));
      }
    } catch (error) {
      logger.warn({ key: mainKey, error }, 'Failed to consume OIDC artifact in Redis');
    }
  }

  /**
   * Delete an artifact and its associated index keys.
   *
   * Reads the payload first to identify any index keys that need cleanup,
   * then deletes all keys in a single pipeline operation.
   *
   * @param id - Artifact ID to delete
   */
  async destroy(id: string): Promise<void> {
    const redis = getRedis();
    const mainKey = this.key(id);

    // Read payload to find associated index keys
    const data = await redis.get(mainKey);
    const keysToDelete = [mainKey];

    if (data) {
      try {
        const payload = JSON.parse(data) as AdapterPayload;
        // Clean up index keys if they exist
        if (payload.uid) keysToDelete.push(this.uidKey(payload.uid));
        if (payload.userCode) keysToDelete.push(this.userCodeKey(payload.userCode));
      } catch {
        // If JSON parse fails, just delete the main key
      }
    }

    await redis.del(...keysToDelete);

    // Fire-and-forget: mark session as revoked in PostgreSQL tracking table.
    // Only Session model needs tracking — other model destroys don't need admin visibility.
    if (this.name === 'Session') {
      revokeSession(id).catch(() => {
        // Intentionally swallowed — tracking must never break the OIDC flow.
        // revokeSession already logs warnings internally.
      });
    }
  }

  /**
   * Revoke all artifacts associated with a grant.
   *
   * Reads the grant set to find all artifact IDs, then deletes each
   * artifact (including its index keys) and finally the grant set itself.
   * Uses best-effort deletion — logs warnings for individual failures
   * but continues with remaining keys.
   *
   * @param grantId - Grant ID whose artifacts should be revoked
   */
  async revokeByGrantId(grantId: string): Promise<void> {
    const redis = getRedis();
    const grantSetKey = this.grantKey(grantId);

    // Get all artifact IDs in this grant
    const members = await redis.smembers(grantSetKey);

    if (members.length === 0) {
      // No artifacts to revoke — clean up the empty set key just in case
      await redis.del(grantSetKey);
      return;
    }

    // Delete each artifact (destroy handles index key cleanup)
    const deletePromises = members.map((id) => this.destroy(id));
    await Promise.all(deletePromises);

    // Delete the grant set itself
    await redis.del(grantSetKey);
  }
}

// ---------------------------------------------------------------------------
// Standalone helpers for session lifecycle management
// ---------------------------------------------------------------------------

/**
 * Models stored in Redis — used by cleanupRedisGrants to iterate grant sets.
 * Must match the REDIS_MODELS set in adapter-factory.ts. Defined here as an
 * array (not imported) to avoid circular dependencies between adapter files.
 */
const REDIS_MODEL_NAMES = [
  'Session',
  'Interaction',
  'AuthorizationCode',
  'ReplayDetection',
  'ClientCredentials',
  'PushedAuthorizationRequest',
];

/**
 * Clean up Redis grant sets and their member keys for the given grant_ids.
 *
 * When a session is destroyed during explicit logout, the PostgreSQL cascade
 * (revokeGrantsByIds) handles the critical data cleanup. This function provides
 * best-effort cleanup of the corresponding Redis keys — grant set keys and
 * the individual artifact keys they reference.
 *
 * This is NOT critical for correctness: Redis keys have TTLs and will expire
 * on their own. However, cleaning them up immediately prevents stale keys from
 * being used during the window between logout and TTL expiry.
 *
 * Errors are logged but never propagated — the logout flow must not fail
 * because of a Redis cleanup issue.
 *
 * @param grantIds - Array of grant IDs whose Redis keys should be cleaned up
 */
export async function cleanupRedisGrants(grantIds: string[]): Promise<void> {
  if (grantIds.length === 0) return;

  try {
    const redis = getRedis();
    const keysToDelete: string[] = [];

    // For each model type × grant ID, look up the grant set and collect
    // both the set key and all member keys for deletion.
    for (const model of REDIS_MODEL_NAMES) {
      for (const grantId of grantIds) {
        const grantKey = `oidc:${model}:grant:${grantId}`;
        // Get all artifact IDs in this grant set
        const members = await redis.smembers(grantKey);
        // Queue the grant set key itself for deletion
        keysToDelete.push(grantKey);
        // Queue each member's primary key for deletion
        for (const memberId of members) {
          keysToDelete.push(`oidc:${model}:${memberId}`);
        }
      }
    }

    // Batch delete all collected keys in one DEL command
    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
    }
  } catch (err) {
    // Best-effort — Redis keys have TTLs and will expire naturally
    logger.warn({ err, grantIds }, 'Failed to clean up Redis grant keys (keys will expire via TTL)');
  }
}
