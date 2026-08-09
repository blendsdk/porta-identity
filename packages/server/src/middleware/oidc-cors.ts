/**
 * CORS handler for OIDC endpoints.
 *
 * node-oidc-provider accepts a `clientBasedCORS` configuration function
 * that determines whether a given origin is allowed for CORS requests.
 *
 * Origin resolution follows a two-tier strategy:
 *   1. **Explicit allowed_origins** — checks the client's `allowed_origins`
 *      field from the database (stored as `urn:porta:allowed_origins` in
 *      provider metadata).
 *   2. **Redirect URI derivation** — extracts the origin (scheme + host +
 *      port) from each of the client's registered `redirect_uris`. If the
 *      requesting origin matches any redirect URI's origin, CORS is allowed.
 *      This is safe because the client already trusts those origins for
 *      redirect flows.
 *
 * In development mode, all origins are allowed for convenience.
 */

import { config } from '../config/index.js';

/**
 * Determine if a CORS origin is allowed for OIDC requests.
 *
 * Called by node-oidc-provider for cross-origin requests to OIDC endpoints
 * (e.g., /token from a browser-based SPA). Checks if the requesting origin
 * matches the client's registered allowed_origins or the origin of any
 * registered redirect_uri.
 *
 * @param _ctx - Koa context with OIDC extensions
 * @param origin - The requesting origin (e.g., 'https://app.example.com')
 * @param client - The matched OIDC client metadata (may be undefined for non-client requests)
 * @returns true if the origin is allowed, false otherwise
 */
export function oidcCors(
  _ctx: unknown,
  origin: string,
  client: unknown,
): boolean {
  // In development, allow all origins for convenience during local testing
  if (config.nodeEnv === 'development') return true;

  // If no client context, deny CORS (non-client requests shouldn't have CORS)
  if (!client) return false;

  // Cast to access client metadata properties.
  // findForOidc() stores allowed_origins under the namespaced key
  // 'urn:porta:allowed_origins' (required by extraClientMetadata config).
  // redirect_uris is a standard OIDC property always present on clients.
  const clientMeta = client as {
    'urn:porta:allowed_origins'?: string[];
    redirect_uris?: string[];
  };

  // 1. Check explicit allowed_origins
  const allowedOrigins = clientMeta['urn:porta:allowed_origins'] ?? [];
  if (allowedOrigins.includes(origin)) return true;

  // 2. Derive origins from redirect_uris — if the client has a redirect_uri
  //    at a given origin, it's safe to allow CORS from that origin.
  //    new URL(uri).origin extracts 'scheme://host[:port]', which is exactly
  //    what the browser sends as the CORS Origin header.
  const redirectUris = clientMeta.redirect_uris ?? [];
  for (const uri of redirectUris) {
    try {
      const { origin: redirectOrigin } = new URL(uri);
      // Skip native app schemes (e.g., 'myapp://callback') which produce
      // 'null' as origin — native apps don't make browser CORS requests.
      if (redirectOrigin !== 'null' && redirectOrigin === origin) return true;
    } catch {
      // Skip malformed URIs
    }
  }

  return false;
}
