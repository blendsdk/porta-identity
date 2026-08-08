/**
 * OIDC CORS middleware — pre-sets CORS headers at the outer Koa level.
 *
 * Solves a fundamental issue with node-oidc-provider's CORS handling:
 * the provider uses @koa/cors with `keepHeadersOnError: false`, which
 * means CORS headers are stripped from error responses (e.g., 400 from
 * the token endpoint). SPAs that exchange authorization codes or refresh
 * tokens via cross-origin fetch() cannot read error responses, breaking
 * error handling in browser-based OIDC flows.
 *
 * How this middleware fixes it:
 *
 *   1. It sets `Access-Control-Allow-Origin` and related headers BEFORE
 *      the request enters oidc-provider's internal Koa context.
 *
 *   2. The provider's `cors.js` middleware detects existing `access-control-*`
 *      headers and SKIPS its own CORS handling entirely (see
 *      node_modules/oidc-provider/lib/shared/cors.js lines 32-37).
 *
 *   3. Because the headers are set at the outer Koa level and the provider
 *      doesn't touch them, they survive regardless of whether the OIDC
 *      endpoint succeeds or returns an error.
 *
 * Origin validation follows the same two-tier strategy as `oidc-cors.ts`:
 *   - In development mode: all origins are allowed.
 *   - In production: the client's `allowed_origins` and `redirect_uris`
 *     are checked. The client is identified from the `client_id` body
 *     parameter (standard for token, revocation, and introspection
 *     endpoints). If no client_id is present or the client cannot be
 *     found, no CORS headers are set — the request proceeds but the
 *     browser will block the response (correct security behavior).
 *
 * Placement: mount in the `oidcRouter` (server.ts) AFTER the body parser
 * (so `client_id` is available from `ctx.request.body`) but BEFORE the
 * `clientSecretHash` middleware and the provider delegation handler.
 *
 * For OIDC endpoints that don't require client authentication (e.g.,
 * JWKS, discovery), CORS is always allowed — these are public endpoints
 * that any origin may access. The middleware detects these by path.
 *
 * @module middleware/oidc-preflight-cors
 */

import type { Middleware } from 'koa';
import { config } from '../config/index.js';
import { getClientByClientId } from '../clients/service.js';
import { getPool } from '../lib/database.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Public-endpoint path patterns — these are accessible without client auth
// and allow CORS from any origin (same as oidc-provider's "open" CORS).
// Paths are relative to the /:orgSlug prefix (after tenant resolution).
// ---------------------------------------------------------------------------

/** Paths that are publicly accessible and allow any CORS origin. */
const OPEN_CORS_PATHS = new Set([
  '/jwks',
  '/.well-known/openid-configuration',
  '/.well-known/oauth-authorization-server',
]);

/**
 * Check if the request path (within the org scope) is a public endpoint
 * that allows CORS from any origin.
 *
 * @param fullPath - The full request path (e.g., '/acme/jwks')
 * @param orgSlug - The organization slug (e.g., 'acme')
 * @returns true if the path is a public CORS endpoint
 */
function isOpenCorsPath(fullPath: string, orgSlug: string): boolean {
  const subPath = fullPath.slice(`/${orgSlug}`.length);
  return OPEN_CORS_PATHS.has(subPath);
}

/**
 * Check if an origin is allowed for a given client by examining the
 * client's `allowedOrigins` and `redirectUris` fields.
 *
 * This replicates the same logic as `oidc-cors.ts` but works with the
 * Client domain object (from the service layer) rather than the OIDC
 * provider's internal client metadata format.
 *
 * @param origin - The requesting origin (e.g., 'https://app.example.com')
 * @param client - Client with allowedOrigins and redirectUris arrays
 * @returns true if the origin is allowed
 */
function isOriginAllowed(
  origin: string,
  client: { allowedOrigins: string[]; redirectUris: string[] },
): boolean {
  // 1. Check explicit allowed_origins
  if (client.allowedOrigins.includes(origin)) return true;

  // 2. Derive origins from redirect_uris
  for (const uri of client.redirectUris) {
    try {
      const redirectOrigin = new URL(uri).origin;
      if (redirectOrigin !== 'null' && redirectOrigin === origin) return true;
    } catch {
      // Skip malformed URIs
    }
  }

  return false;
}

/**
 * Set standard CORS response headers for an allowed origin.
 *
 * @param ctx - Koa context
 * @param origin - The allowed origin value
 */
function setCorsHeaders(
  ctx: { set: (name: string, value: string) => void },
  origin: string,
): void {
  ctx.set('Access-Control-Allow-Origin', origin);
  ctx.set('Vary', 'Origin');
}

/**
 * Set preflight-specific CORS response headers (in addition to the base
 * headers set by `setCorsHeaders`).
 *
 * @param ctx - Koa context
 */
function setPreflightHeaders(
  ctx: { set: (name: string, value: string) => void },
): void {
  ctx.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  ctx.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, DPoP');
  ctx.set('Access-Control-Max-Age', '3600');
}

// ---------------------------------------------------------------------------
// Bearer token → clientId resolution
// ---------------------------------------------------------------------------

/**
 * Extract the `clientId` from an opaque Bearer access token by looking
 * up its record in PostgreSQL.
 *
 * node-oidc-provider stores opaque access tokens in the `oidc_payloads`
 * table (via the PostgresAdapter) with `type = 'AccessToken'`. The token
 * value sent by the client IS the `jti`, which is the `id` column in the
 * table. The JSONB `payload` column includes a `clientId` field.
 *
 * NOTE: AccessToken is a long-lived model routed to PostgreSQL by the
 * hybrid adapter factory (adapter-factory.ts). Short-lived models like
 * Session and AuthorizationCode go to Redis, but AccessToken does NOT.
 *
 * This lookup is best-effort: if the token is missing, expired, or the
 * database is unavailable, `null` is returned and CORS headers are not
 * set. The actual token validation is still performed by the provider
 * downstream.
 *
 * @param authHeader - The raw `Authorization` header value (e.g., 'Bearer abc123')
 * @returns The clientId if resolved, or null
 */
async function resolveClientIdFromBearerToken(authHeader: string): Promise<string | null> {
  if (!authHeader) return null;

  // Extract the token value from "Bearer <token>"
  const match = /^Bearer\s+(\S+)$/i.exec(authHeader);
  if (!match) return null;

  const tokenValue = match[1];

  try {
    const pool = getPool();
    const result = await pool.query<{ client_id: string }>(
      `SELECT payload->>'clientId' AS client_id
       FROM oidc_payloads
       WHERE id = $1 AND type = 'AccessToken'
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [tokenValue],
    );

    if (result.rows.length === 0) return null;

    const clientId = result.rows[0].client_id;
    return typeof clientId === 'string' && clientId.length > 0 ? clientId : null;
  } catch (err) {
    // Database unavailable — graceful degradation.
    // The provider will still validate the token; we just can't set
    // CORS headers pre-emptively.
    logger.debug(
      { err },
      'OIDC CORS: failed to resolve clientId from Bearer token',
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Create the OIDC CORS middleware.
 *
 * Must be mounted in the oidcRouter AFTER the body parser (so
 * `client_id` is available) but BEFORE `clientSecretHash` and the
 * provider delegation handler.
 *
 * @returns Koa middleware that pre-sets CORS headers for OIDC routes
 */
export function oidcPreflightCors(): Middleware {
  return async function oidcPreflightCorsMiddleware(ctx, next) {
    const origin = ctx.get('Origin');

    // No Origin header → not a CORS request (backend service, curl, etc.)
    // Skip — no CORS headers needed.
    if (!origin) {
      return next();
    }

    const orgSlug = ctx.params?.orgSlug ?? '';

    // -----------------------------------------------------------------------
    // OPTIONS preflight — respond immediately, skip downstream middleware
    // -----------------------------------------------------------------------
    if (ctx.method === 'OPTIONS') {
      // Dev: allow all origins
      // Prod: allow preflight broadly — the actual request will do the
      // full client-based check. If the actual request's origin is
      // unauthorized, it won't have CORS headers and the browser will
      // block the response. This is secure because the preflight itself
      // doesn't grant any access — it only tells the browser that a
      // subsequent actual request is permitted to be sent.
      setCorsHeaders(ctx, origin);
      setPreflightHeaders(ctx);
      ctx.status = 204;
      return;
    }

    // -----------------------------------------------------------------------
    // Actual request (GET, POST, etc.) with Origin header
    // -----------------------------------------------------------------------

    // Public endpoints (jwks, discovery) allow any origin — no client check.
    if (isOpenCorsPath(ctx.path, orgSlug)) {
      setCorsHeaders(ctx, origin);
      return next();
    }

    // Development mode: allow all origins for convenience.
    if (config.nodeEnv === 'development') {
      setCorsHeaders(ctx, origin);
      return next();
    }

    // Production mode: client-based CORS check.
    // Strategy: identify the client from one of two sources, then check
    // whether the requesting origin is allowed for that client.
    //
    //   1. `client_id` in the body — token, revocation, introspection
    //      endpoints send client_id in the form-encoded body.
    //   2. Bearer token in `Authorization` header — userinfo (/me) and
    //      other authenticated GET endpoints. The access token record in
    //      PostgreSQL contains the clientId that issued it.
    //
    // If neither source yields a client, no CORS headers are set (safe
    // default: browser blocks the cross-origin response).
    const body = ctx.request.body as Record<string, unknown> | undefined;
    let clientId: string | null =
      typeof body?.client_id === 'string' && body.client_id.length > 0
        ? body.client_id
        : null;

    // Fallback: extract clientId from a Bearer access token stored in PostgreSQL.
    // This enables CORS for endpoints like /me (userinfo) where the only
    // client identifier is embedded in the opaque access token record.
    if (!clientId) {
      clientId = await resolveClientIdFromBearerToken(ctx.get('Authorization'));
    }

    if (!clientId) {
      // Can't identify client from body or Bearer token — skip CORS.
      // The provider will process the request, but the browser blocks
      // the cross-origin response. This is correct security behavior.
      return next();
    }

    try {
      const client = await getClientByClientId(clientId);
      if (client && isOriginAllowed(origin, client)) {
        setCorsHeaders(ctx, origin);
      }
      // If client not found or origin not allowed, don't set CORS headers.
      // The provider processes the request normally, but the browser blocks
      // the cross-origin response — correct security behavior.
    } catch (err) {
      // Graceful degradation: if the client lookup fails (e.g., DB down),
      // don't set CORS headers. The request proceeds but the browser
      // blocks the response. This is the safe default.
      logger.warn(
        { err, clientId, origin },
        'OIDC CORS: client lookup failed, CORS headers not set',
      );
    }

    return next();
  };
}
