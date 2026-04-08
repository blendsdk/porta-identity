/**
 * Dynamic client lookup for node-oidc-provider.
 *
 * Delegates to the client service's findForOidc() function which handles
 * cache-backed lookups, status checking, and mapping to oidc-provider
 * metadata format. This module acts as the bridge between the OIDC
 * provider configuration and Porta's client management system.
 *
 * Updated in RD-05 to use the full client service instead of direct
 * SQL queries. The client service provides:
 *   - Redis cache integration (5-min TTL)
 *   - Proper status checking (only active clients returned)
 *   - Complete metadata mapping including PKCE and allowed origins
 *
 * The OidcClientMetadata interface remains here since it's referenced
 * by the OIDC configuration module.
 */

import { findForOidc } from '../clients/service.js';
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
 * Delegates to the client service's findForOidc() function which:
 *   1. Checks Redis cache first (5-min TTL)
 *   2. Falls back to database on cache miss
 *   3. Returns only active clients
 *   4. Maps internal model to oidc-provider metadata format
 *
 * Returns undefined if no active client is found (oidc-provider convention).
 *
 * @param clientId - The OIDC client_id to look up
 * @returns Client metadata object, or undefined if not found
 */
export async function findClientByClientId(clientId: string): Promise<OidcClientMetadata | undefined> {
  try {
    const metadata = await findForOidc(clientId);
    if (!metadata) return undefined;

    // Map the service result to the OidcClientMetadata interface.
    // The service returns Record<string, unknown> for flexibility,
    // but we cast to the well-known metadata shape here.
    return {
      client_id: metadata.client_id as string,
      client_name: metadata.client_name as string,
      application_type: metadata.application_type as string,
      redirect_uris: metadata.redirect_uris as string[],
      post_logout_redirect_uris: metadata.post_logout_redirect_uris as string[],
      grant_types: metadata.grant_types as string[],
      response_types: metadata.response_types as string[],
      scope: metadata.scope as string,
      token_endpoint_auth_method: metadata.token_endpoint_auth_method as string,
      allowed_origins: (metadata['urn:porta:allowed_origins'] as string[]) ?? [],
    };
  } catch (error) {
    logger.error({ clientId, error }, 'Failed to look up OIDC client');
    return undefined;
  }
}
