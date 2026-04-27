import Router from '@koa/router';
import type { BffConfig } from '../config.js';
import type { OidcConfig } from '../oidc.js';
import type { Logger } from 'pino';
import type { SessionData } from '../session.js';
import { refreshTokens } from '../oidc.js';
import type Koa from 'koa';

/**
 * Headers that should NOT be forwarded from the upstream Porta response.
 * These are hop-by-hop headers or headers the BFF manages itself.
 */
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
]);

/**
 * Create the API proxy router.
 *
 * Forwards all /api/* requests to Porta's /api/admin/* endpoints.
 * Injects the Bearer token from the server-side session.
 * Handles transparent token refresh on 401 responses.
 *
 * @param config - BFF configuration
 * @param oidcConfig - OIDC configuration (for token refresh)
 * @param logger - Pino logger
 * @returns Koa router for API proxy
 */
export function createApiProxyRouter(
  config: BffConfig,
  oidcConfig: OidcConfig,
  logger: Logger,
): Router {
  const router = new Router();

  router.all('/api/*path', async (ctx) => {
    const session = ctx.session as unknown as SessionData;

    // Map /api/... to /api/admin/... on the Porta server
    const upstreamPath = ctx.path.replace(/^\/api/, '/api/admin');
    const upstreamUrl = new URL(upstreamPath, config.portaUrl);

    // Forward query parameters
    if (ctx.querystring) {
      upstreamUrl.search = ctx.querystring;
    }

    // Ensure we have a valid access token (proactively refresh if expiring soon)
    let accessToken = session.accessToken;
    if (session.tokenExpiry && Date.now() >= session.tokenExpiry - 30000) {
      // Token expires within 30 seconds — proactively refresh
      try {
        const newTokens = await refreshTokens(oidcConfig, session.refreshToken);
        session.accessToken = newTokens.access_token!;
        session.refreshToken = newTokens.refresh_token || session.refreshToken;
        session.tokenExpiry = Date.now() + (newTokens.expires_in || 900) * 1000;
        accessToken = session.accessToken;
        logger.debug('Proactively refreshed access token');
      } catch (err) {
        logger.warn({ err }, 'Proactive token refresh failed');
      }
    }

    // Forward the request to Porta
    const response = await forwardRequest(ctx, upstreamUrl, accessToken, logger);

    // If 401 and we have a refresh token, try refreshing and retrying once
    if (response.status === 401 && session.refreshToken) {
      try {
        const newTokens = await refreshTokens(oidcConfig, session.refreshToken);
        session.accessToken = newTokens.access_token!;
        session.refreshToken = newTokens.refresh_token || session.refreshToken;
        session.tokenExpiry = Date.now() + (newTokens.expires_in || 900) * 1000;
        accessToken = session.accessToken;

        logger.debug('Refreshed token after 401, retrying request');
        const retryResponse = await forwardRequest(ctx, upstreamUrl, accessToken, logger);
        sendUpstreamResponse(ctx, retryResponse);
        return;
      } catch (err) {
        logger.warn({ err }, 'Token refresh after 401 failed');
        // Session is invalid — force re-login
        ctx.session = null;
        ctx.status = 401;
        ctx.body = { error: 'Session expired. Please log in again.' };
        return;
      }
    }

    sendUpstreamResponse(ctx, response);
  });

  return router;
}

/**
 * Forward an HTTP request to the upstream Porta server.
 * Includes Bearer token, forwards relevant headers.
 *
 * @param ctx - Koa context
 * @param upstreamUrl - Target URL on Porta
 * @param accessToken - Bearer access token
 * @param logger - Pino logger
 * @returns Fetch response from Porta
 */
async function forwardRequest(
  ctx: Koa.Context,
  upstreamUrl: URL,
  accessToken: string,
  logger: Logger,
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: ctx.get('Accept') || 'application/json',
    'X-Request-Id': ctx.get('X-Request-Id') || '',
  };

  // Forward content-type for POST/PUT/PATCH
  if (ctx.get('Content-Type')) {
    headers['Content-Type'] = ctx.get('Content-Type');
  }

  // Forward If-Match for ETag concurrency control
  if (ctx.get('If-Match')) {
    headers['If-Match'] = ctx.get('If-Match');
  }

  // Determine body to forward for state-changing methods
  // koa-bodyparser attaches parsed body to ctx.request.body
  let body: string | undefined = undefined;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(ctx.method)) {
    const reqBody = (ctx.request as unknown as Record<string, unknown>).body;
    if (reqBody) {
      body = JSON.stringify(reqBody);
    }
  }

  logger.debug(
    { method: ctx.method, upstream: upstreamUrl.toString() },
    'Proxying request to Porta',
  );

  return fetch(upstreamUrl.toString(), {
    method: ctx.method,
    headers,
    body,
    signal: AbortSignal.timeout(30000), // 30s timeout
  });
}

/**
 * Send the upstream Porta response back to the browser.
 * Forwards status, body, and relevant headers (ETag, pagination).
 * Filters out hop-by-hop headers that shouldn't be forwarded.
 *
 * @param ctx - Koa context
 * @param response - Fetch response from Porta
 */
function sendUpstreamResponse(ctx: Koa.Context, response: Response): void {
  ctx.status = response.status;

  // Forward relevant headers from Porta (ETag, content-type, pagination, etc.)
  for (const [key, value] of response.headers.entries()) {
    const lowerKey = key.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(lowerKey)) {
      ctx.set(key, value);
    }
  }

  // Stream the response body
  ctx.body = response.body;
}
