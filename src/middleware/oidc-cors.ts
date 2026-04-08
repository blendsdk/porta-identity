/**
 * CORS handler for OIDC endpoints.
 *
 * node-oidc-provider accepts a `clientBasedCORS` configuration function
 * that determines whether a given origin is allowed for CORS requests.
 * This implementation checks the requesting origin against the client's
 * `allowed_origins` field from the database.
 *
 * In development mode, all origins are allowed for convenience.
 */

import { config } from '../config/index.js';

/**
 * Determine if a CORS origin is allowed for OIDC requests.
 *
 * Called by node-oidc-provider for cross-origin requests to OIDC endpoints
 * (e.g., /token from a browser-based SPA). Checks if the requesting origin
 * matches the client's registered allowed_origins.
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

  // Check if the requesting origin is in the client's registered allowed_origins.
  // The allowed_origins field comes from the clients table (TEXT[] column).
  // Cast to access the custom allowed_origins property from our client metadata.
  const clientMeta = client as { allowed_origins?: string[] };
  const allowedOrigins = clientMeta.allowed_origins ?? [];
  return allowedOrigins.includes(origin);
}
