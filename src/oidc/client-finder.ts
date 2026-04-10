/**
 * Dynamic client lookup for node-oidc-provider.
 *
 * Wired into the provider via configuration.findClient, this module is called
 * by oidc-provider for EVERY request that needs client information (authorization,
 * token exchange, introspection, revocation, etc.).
 *
 * This is the fix for GAP-1 (dead code) and GAP-2 (missing secret verification):
 *
 * GAP-1: Previously, findClientByClientId was never imported by the provider.
 *        The provider fell back to adapter.find('Client', id) which looked in
 *        oidc_payloads — but clients live in the clients table. Now wired via
 *        configuration.findClient → provider.ts → this module.
 *
 * GAP-2: Previously, findForOidc() didn't return client_secret, so confidential
 *        clients couldn't authenticate. Now we verify the presented secret via
 *        Argon2id and pass it through so oidc-provider's built-in comparison
 *        succeeds (comparing the secret against itself).
 *
 * Decision Matrix:
 * | Client Type    | Secret Presented? | Valid? | Result                                    |
 * |----------------|-------------------|--------|-------------------------------------------|
 * | Confidential   | Yes               | Yes    | ✅ Success (set client_secret: presented) |
 * | Confidential   | Yes               | No     | ❌ invalid_client + log warning           |
 * | Confidential   | No                | —      | Return metadata (provider enforces auth)  |
 * | Public         | Yes               | —      | ❌ invalid_client + log warning           |
 * | Public         | No                | —      | ✅ Success                                |
 */

import { findForOidc } from '../clients/service.js';
import { getClientByClientId } from '../clients/service.js';
import { verify as verifySecret } from '../clients/secret-service.js';
import { logger } from '../lib/logger.js';

/** Client metadata in the format node-oidc-provider expects */
export interface OidcClientMetadata {
  /** Index signature — oidc-provider expects Record<string, unknown> compatibility */
  [key: string]: unknown;
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
  /** Set only for confidential clients with a valid presented secret */
  client_secret?: string;
}

/**
 * Extract client_secret from the request context.
 *
 * Supports two OAuth2 client authentication methods:
 * - client_secret_post: secret in request body
 * - client_secret_basic: secret in Authorization header (Basic base64(id:secret))
 *
 * Body takes priority over header to match oidc-provider's own preference.
 * Returns undefined if no secret is present.
 *
 * @param ctx - Koa context from oidc-provider (typed as unknown for decoupling)
 * @param clientId - The client_id to match against Basic auth header
 * @returns The extracted secret string, or undefined if none found
 */
export function extractClientSecret(ctx: unknown, clientId: string): string | undefined {
  // Cast to the shape we need — Koa context with body and headers
  const koaCtx = ctx as {
    request?: { body?: Record<string, unknown> };
    headers?: Record<string, string>;
  };

  // Method 1: client_secret_post — secret in request body (higher priority)
  const bodySecret = koaCtx?.request?.body?.client_secret;
  if (typeof bodySecret === 'string' && bodySecret.length > 0) {
    return bodySecret;
  }

  // Method 2: client_secret_basic — Authorization: Basic base64(client_id:client_secret)
  const authHeader = koaCtx?.headers?.authorization;
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
      const colonIndex = decoded.indexOf(':');
      if (colonIndex > 0) {
        // RFC 6749 §2.3.1: client_id and client_secret are URL-encoded in Basic auth
        const headerClientId = decodeURIComponent(decoded.substring(0, colonIndex));
        const headerSecret = decodeURIComponent(decoded.substring(colonIndex + 1));
        // Only return if the client_id in header matches the requested client
        if (headerClientId === clientId && headerSecret.length > 0) {
          return headerSecret;
        }
      }
    } catch {
      // Malformed Basic auth (bad base64 or invalid URL encoding) — treat as no secret.
      // This is intentional: we fail open to "no secret" rather than blocking,
      // because the decision matrix will handle the rejection appropriately.
      logger.warn({ clientId }, 'Malformed Basic auth header during client authentication');
    }
  }

  return undefined;
}

/**
 * Find an OIDC client by its client_id, with optional secret verification.
 *
 * This is the main findClient hook called by oidc-provider. It:
 * 1. Looks up the client via the service (cache-backed)
 * 2. Extracts any presented secret from the request context
 * 3. Applies the decision matrix (see module doc)
 * 4. Returns metadata with client_secret pass-through if valid
 *
 * Returns undefined if client not found or authentication fails
 * (oidc-provider interprets undefined as "invalid_client").
 *
 * @param ctx - Koa context from oidc-provider
 * @param clientId - The OIDC client_id to look up
 * @returns Client metadata object, or undefined if not found/auth failed
 */
export async function findClientByClientId(
  ctx: unknown,
  clientId: string,
): Promise<OidcClientMetadata | undefined> {
  try {
    // Step 1: Look up client via service (cache-backed, active-only)
    const metadata = await findForOidc(clientId);
    if (!metadata) return undefined;

    // Map the service result to the OidcClientMetadata interface
    const oidcMetadata: OidcClientMetadata = {
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

    // Step 2: Determine client type and extract presented secret
    const isPublic = oidcMetadata.token_endpoint_auth_method === 'none';
    const presentedSecret = extractClientSecret(ctx, clientId);

    // Step 3: Apply decision matrix

    // Public client + secret presented → reject (misconfiguration or probe)
    if (isPublic && presentedSecret) {
      logger.warn({ clientId }, 'Public client sent client_secret — rejecting as invalid_client');
      return undefined;
    }

    // Public client + no secret → success (normal public client flow)
    if (isPublic) {
      return oidcMetadata;
    }

    // Confidential client + secret presented → verify via Argon2id
    if (presentedSecret) {
      // Look up the internal client record to get the DB id for secret verification
      const client = await getClientByClientId(clientId);
      if (!client) return undefined;

      const isValid = await verifySecret(client.id, presentedSecret);
      if (!isValid) {
        logger.warn({ clientId }, 'Confidential client secret verification failed');
        return undefined;
      }

      // Valid secret — pass it through in metadata so oidc-provider's built-in
      // comparison succeeds (comparing the presented secret against itself).
      // The REAL verification already happened via Argon2id above.
      return { ...oidcMetadata, client_secret: presentedSecret };
    }

    // Confidential client + no secret → return metadata without secret.
    // The provider will enforce authentication based on token_endpoint_auth_method.
    // This handles the authorization endpoint (where no secret is needed).
    return oidcMetadata;
  } catch (error) {
    // Fail closed — any unexpected error returns undefined (invalid_client)
    logger.error({ clientId, error }, 'Failed to look up OIDC client');
    return undefined;
  }
}
