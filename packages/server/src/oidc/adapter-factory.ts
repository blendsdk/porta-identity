/**
 * Hybrid adapter factory for node-oidc-provider.
 *
 * Routes short-lived, high-throughput models to RedisAdapter and
 * long-lived models to PostgresAdapter. This maximizes performance
 * for frequently accessed artifacts (sessions, interactions, auth codes)
 * while ensuring persistence for long-lived ones (access tokens,
 * refresh tokens, grants).
 *
 * Usage:
 *   const provider = new Provider(issuer, {
 *     adapter: createAdapterFactory(),
 *   });
 *
 * The factory returns a CLASS (not an instance) — node-oidc-provider
 * instantiates it with `new AdapterClass(modelName)`.
 */

import { PostgresAdapter, revokeGrantsByIds } from './postgres-adapter.js';
import { RedisAdapter, cleanupRedisGrants } from './redis-adapter.js';
import { findForOidc } from '../clients/service.js';
import { logger } from '../lib/logger.js';
import type { AdapterPayload } from './postgres-adapter.js';

/**
 * Models routed to Redis for performance.
 *
 * These are short-lived, high-throughput artifacts where Redis's
 * in-memory speed and automatic TTL expiry are ideal:
 * - Session: frequently accessed per-request, 24h TTL
 * - Interaction: very short-lived login flow state, 1h TTL
 * - AuthorizationCode: short-lived, high throughput, 10min TTL
 * - ReplayDetection: performance-critical duplicate detection
 * - ClientCredentials: short-lived M2M tokens, 1h TTL
 * - PushedAuthorizationRequest: short-lived PAR requests, 1h TTL
 */
export const REDIS_MODELS = new Set([
  'Session',
  'Interaction',
  'AuthorizationCode',
  'ReplayDetection',
  'ClientCredentials',
  'PushedAuthorizationRequest',
]);

/**
 * Check if a model name should be stored in Redis.
 *
 * @param name - OIDC model name (e.g., 'Session', 'AccessToken')
 * @returns true if the model should use Redis, false for PostgreSQL
 */
export function isRedisModel(name: string): boolean {
  return REDIS_MODELS.has(name);
}

/**
 * Create the hybrid adapter factory for node-oidc-provider.
 *
 * Returns a class constructor that node-oidc-provider calls with
 * `new AdapterClass(modelName)`. The constructor internally creates
 * either a RedisAdapter or PostgresAdapter based on the model name.
 *
 * @returns A class constructor compatible with node-oidc-provider's adapter option
 */
export function createAdapterFactory() {
  /**
   * HybridAdapter delegates all operations to either RedisAdapter or
   * PostgresAdapter based on the model name. This is transparent to
   * node-oidc-provider — it just sees a standard adapter interface.
   */
  return class HybridAdapter {
    /** The underlying adapter (Redis or PostgreSQL) */
    public delegate: PostgresAdapter | RedisAdapter;

    /** The OIDC model name this adapter instance handles */
    public name: string;

    constructor(name: string) {
      this.name = name;

      // Route to the appropriate adapter based on the model name
      if (REDIS_MODELS.has(name)) {
        this.delegate = new RedisAdapter(name);
      } else {
        this.delegate = new PostgresAdapter(name);
      }
    }

    /** Create or update an OIDC artifact */
    async upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void> {
      return this.delegate.upsert(id, payload, expiresIn);
    }

    /**
     * Find an artifact by its primary ID.
     *
     * For the 'Client' model, routes to findForOidc() which resolves
     * clients from the clients table (not oidc_payloads). This is the
     * bridge between Porta's client management and oidc-provider.
     */
    async find(id: string): Promise<AdapterPayload | undefined> {
      if (this.name === 'Client') {
        return findForOidc(id) as Promise<AdapterPayload | undefined>;
      }
      return this.delegate.find(id);
    }

    /** Find an artifact by user code (device flow) */
    async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
      return this.delegate.findByUserCode(userCode);
    }

    /** Find an artifact by UID (sessions) */
    async findByUid(uid: string): Promise<AdapterPayload | undefined> {
      return this.delegate.findByUid(uid);
    }

    /** Mark an artifact as consumed */
    async consume(id: string): Promise<void> {
      return this.delegate.consume(id);
    }

    /**
     * Delete an artifact by ID.
     *
     * For Session models, this performs a cascade delete: before destroying the
     * session itself, it reads the session's authorizations to extract grant IDs,
     * then deletes all associated grants and tokens from PostgreSQL and cleans up
     * Redis grant sets. This ensures "explicit logout = total cleanup."
     *
     * For all other models, delegates directly to the underlying adapter.
     *
     * Error handling: cascade failures are logged but do NOT prevent the session
     * from being destroyed — the user must always be able to log out.
     */
    async destroy(id: string): Promise<void> {
      if (this.name === 'Session') {
        try {
          // Step 1: Read session to extract grant IDs before destroying it.
          // The session payload has an `authorizations` map:
          //   { [clientId]: { grantId, sid } }
          const session = await this.delegate.find(id);
          if (session?.authorizations) {
            const grantIds: string[] = [];
            const authorizations = session.authorizations as Record<
              string,
              { grantId?: string }
            >;
            for (const auth of Object.values(authorizations)) {
              if (auth.grantId) grantIds.push(auth.grantId);
            }

            if (grantIds.length > 0) {
              // Step 2a: Cascade delete all grant-related records from PostgreSQL.
              // This is the critical cleanup — removes AccessTokens, RefreshTokens,
              // Grants, and any other artifacts sharing these grant IDs.
              await revokeGrantsByIds(grantIds);

              // Step 2b: Best-effort cleanup of Redis grant sets and member keys.
              // Not critical — Redis keys have TTLs — but removes stale keys immediately.
              await cleanupRedisGrants(grantIds);

              logger.info(
                { sessionId: id, grantIds },
                'Session destroy: cascade-deleted grants and tokens',
              );
            }
          }
        } catch (err) {
          // Cascade failed — log but proceed with session destruction.
          // The user must always be able to log out; orphaned tokens will
          // expire naturally via their TTLs.
          logger.error(
            { err, sessionId: id },
            'Session destroy: cascade cleanup failed (proceeding with session deletion)',
          );
        }
      }

      // Step 3: Delete the session/artifact itself via the delegate
      return this.delegate.destroy(id);
    }

    /** Revoke all artifacts for a given grant */
    async revokeByGrantId(grantId: string): Promise<void> {
      return this.delegate.revokeByGrantId(grantId);
    }
  };
}
