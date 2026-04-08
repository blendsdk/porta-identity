/**
 * Dynamic client lookup for node-oidc-provider.
 *
 * Looks up OIDC clients from the database instead of static configuration.
 * The client finder queries the `clients` table for active clients and maps
 * database columns to the OIDC client metadata format expected by the provider.
 *
 * In RD-03 this is a basic implementation — full secret verification with
 * Argon2id is implemented in RD-05 (Application & Client Management).
 *
 * Note: Confidential clients with `token_endpoint_auth_method` of
 * 'client_secret_basic' or 'client_secret_post' use 'none' auth method
 * as a placeholder until RD-05 implements proper secret verification.
 */

import { getPool } from '../lib/database.js';
import { logger } from '../lib/logger.js';

/** Client metadata in the format node-oidc-provider expects */
export interface OidcClientMetadata {
  client_id: string;
  client_name: string;
  application_type: string;
  redirect_uris: string[];
  post_logout_redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  scope: string;
  token_endpoint_auth_method: string;
  /** Custom field — not part of OIDC spec, used by CORS handler */
  allowed_origins: string[];
}

/**
 * Find an OIDC client by its client_id.
 *
 * Queries the clients table for an active client matching the given client_id.
 * Returns OIDC client metadata in the format expected by node-oidc-provider,
 * or undefined if no active client is found.
 *
 * @param clientId - The OIDC client_id to look up
 * @returns Client metadata object, or undefined if not found
 */
export async function findClientByClientId(clientId: string): Promise<OidcClientMetadata | undefined> {
  const pool = getPool();

  try {
    const result = await pool.query<{
      client_id: string;
      client_name: string;
      application_type: string;
      redirect_uris: string[];
      post_logout_redirect_uris: string[];
      grant_types: string[];
      response_types: string[];
      scope: string;
      token_endpoint_auth_method: string;
      allowed_origins: string[];
    }>(
      `SELECT
        client_id, client_name, application_type,
        redirect_uris, post_logout_redirect_uris,
        grant_types, response_types, scope,
        token_endpoint_auth_method, allowed_origins
       FROM clients
       WHERE client_id = $1 AND status = 'active'
       LIMIT 1`,
      [clientId],
    );

    if (result.rows.length === 0) return undefined;

    const row = result.rows[0];

    // Map database columns to OIDC client metadata format.
    // For RD-03, use 'none' auth method as placeholder for confidential clients
    // until RD-05 implements Argon2id secret verification.
    return {
      client_id: row.client_id,
      client_name: row.client_name,
      application_type: row.application_type,
      redirect_uris: row.redirect_uris,
      post_logout_redirect_uris: row.post_logout_redirect_uris ?? [],
      grant_types: row.grant_types,
      response_types: row.response_types,
      scope: row.scope,
      token_endpoint_auth_method: row.token_endpoint_auth_method,
      allowed_origins: row.allowed_origins ?? [],
    };
  } catch (error) {
    logger.error({ clientId, error }, 'Failed to look up OIDC client');
    return undefined;
  }
}
