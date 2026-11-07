/**
 * Admin service for one user's connected OIDC applications.
 *
 * A connected app is a live provider Grant. Listing reads the existing `oidc_payloads` rows and
 * joins the owning client so the result is always scoped to one user and organization. Revoking
 * deletes the Grant and every artifact sharing its `grant_id`; it never deletes the user or client.
 * The shared OIDC session may fail its authority check and require reauthentication.
 */

import { getPool, runDatabaseTransaction } from '../lib/database.js';

/** One live connected application projection. */
export interface ConnectedApp {
  /** Provider Grant identifier. */
  readonly grantId: string;
  /** Public OAuth client identifier. */
  readonly clientId: string;
  /** Human-readable client name. */
  readonly clientName: string;
  /** Internal application UUID that owns the client. */
  readonly applicationId: string;
  /** Sorted union of OIDC and resource scopes granted to this app. */
  readonly scopes: readonly string[];
  /** Grant creation timestamp. */
  readonly createdAt: string;
  /** Grant expiry timestamp, or null for a non-expiring grant. */
  readonly expiresAt: string | null;
}

/** Shape accepted from the provider's JSON payload. */
type Payload = Record<string, unknown>;

/** UUID accepted for the user and organization identifiers. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Provider-compatible opaque grant identifier. */
const GRANT_ID = /^[A-Za-z0-9_-]{1,255}$/;

/** Returns true for a plain object, never an array or null. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extracts the granted scope union from the provider Grant payload. */
function scopesFrom(payload: Payload): readonly string[] {
  const scopes = new Set<string>();
  if (isRecord(payload.openid) && typeof payload.openid.scope === 'string') {
    for (const scope of payload.openid.scope.split(/\s+/)) {
      if (scope) scopes.add(scope);
    }
  }
  if (isRecord(payload.resources)) {
    for (const value of Object.values(payload.resources)) {
      if (typeof value === 'string') {
        for (const scope of value.split(/\s+/)) {
          if (scope) scopes.add(scope);
        }
      }
    }
  }
  return [...scopes].sort();
}

/** Converts a provider timestamp to an ISO string without inventing one. */
function timestamp(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

/**
 * List one user's live connected applications within one organization.
 *
 * Expired grants are excluded. Invalid identifiers return an empty list; the route boundary
 * reports validation before calling this service.
 *
 * @param organizationId - Internal organization UUID.
 * @param userId - Internal user UUID.
 * @returns Live grants with client identity, scopes and timestamps.
 * @example await listConnectedApps(organizationId, userId);
 */
export async function listConnectedApps(
  organizationId: string,
  userId: string,
): Promise<readonly ConnectedApp[]> {
  if (!UUID.test(organizationId) || !UUID.test(userId)) return [];

  const result = await getPool().query<{
    id: string;
    payload: Payload;
    created_at: Date;
    expires_at: Date | null;
    client_id: string;
    client_name: string;
    application_id: string;
  }>(
    `SELECT app_grant.id, app_grant.payload, app_grant.created_at, app_grant.expires_at,
            client.client_id, client.client_name, client.application_id
       FROM oidc_payloads app_grant
       JOIN clients client ON client.client_id = app_grant.payload->>'clientId'
      WHERE app_grant.type = 'Grant'
        AND app_grant.payload->>'accountId' = $2
        AND client.organization_id = $1
        AND (app_grant.expires_at IS NULL OR app_grant.expires_at > NOW())
      ORDER BY app_grant.created_at DESC, app_grant.id`,
    [organizationId, userId],
  );

  return Object.freeze(
    result.rows.map((row) =>
      Object.freeze({
        grantId: row.id,
        clientId: row.client_id,
        clientName: row.client_name,
        applicationId: row.application_id,
        scopes: Object.freeze(scopesFrom(row.payload)),
        createdAt: row.created_at.toISOString(),
        expiresAt: timestamp(row.expires_at),
      }),
    ),
  );
}

/**
 * Revoke one connected app owned by the exact user and organization.
 *
 * @param organizationId - Internal organization UUID.
 * @param userId - Internal user UUID.
 * @param grantId - Provider Grant identifier.
 * @returns True when a matching grant was deleted; false when it is absent or foreign.
 * @example await revokeConnectedApp(organizationId, userId, grantId);
 */
export async function revokeConnectedApp(
  organizationId: string,
  userId: string,
  grantId: string,
): Promise<boolean> {
  if (!UUID.test(organizationId) || !UUID.test(userId) || !GRANT_ID.test(grantId)) return false;

  return runDatabaseTransaction(async () => {
    const owned = await getPool().query<{ id: string }>(
      `SELECT app_grant.id
         FROM oidc_payloads app_grant
         JOIN clients client ON client.client_id = app_grant.payload->>'clientId'
        WHERE app_grant.id = $3
          AND app_grant.type = 'Grant'
          AND app_grant.payload->>'accountId' = $2
          AND client.organization_id = $1
        FOR UPDATE OF app_grant`,
      [organizationId, userId, grantId],
    );
    if (owned.rows.length === 0) return false;

    // Tokens and refresh artifacts point at the Grant through grant_id. The Grant row itself is
    // identified by its own id, so delete both explicitly in the same transaction.
    await getPool().query('DELETE FROM oidc_payloads WHERE grant_id = $1', [grantId]);
    await getPool().query("DELETE FROM oidc_payloads WHERE id = $1 AND type = 'Grant'", [grantId]);
    return true;
  });
}
