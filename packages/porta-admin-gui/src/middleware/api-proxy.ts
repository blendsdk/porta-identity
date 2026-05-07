/**
 * API proxy middleware for the BFF server.
 *
 * Proxies `ALL /api/*` requests to the Porta Admin API via SDK transport.
 * Path rewriting: `/api/...` → `/api/admin/...` on Porta.
 * Handles PortaHttpError by converting back to HTTP responses for the SPA.
 * Forwards ETag/If-Match headers for optimistic concurrency.
 *
 * @module middleware/api-proxy
 */

import type { Context, Next } from 'koa';
import { createNodeTransport } from '@portaidentity/sdk/node';
import { PortaHttpError } from '@portaidentity/sdk';
import { createAuthProvider } from '../auth/token-manager.js';
import type { OidcConfig } from '../auth/oidc.js';
import type { SessionStore } from '../session.js';

/** Dependencies for API proxy creation. */
export interface ApiProxyDeps {
  /** Porta server base URL. */
  serverUrl: string;
  /** Resolved OIDC config (needed for token refresh). */
  oidcConfig: OidcConfig;
  /** Session store (needed to clear session on auth failure). */
  sessionStore: SessionStore;
}

/**
 * Create API proxy middleware that forwards requests via SDK transport.
 *
 * For each request, creates a fresh NodeTransport with an AuthProvider
 * that reads tokens from the current session. The SDK handles 401→refresh→retry.
 *
 * @param deps - Injected dependencies.
 * @returns Koa middleware function.
 */
export function createApiProxy(
  deps: ApiProxyDeps,
): (ctx: Context, next: Next) => Promise<void> {
  const { serverUrl, oidcConfig, sessionStore } = deps;

  return async (ctx: Context, next: Next): Promise<void> => {
    // Only handle /api/* routes
    if (!ctx.path.startsWith('/api/')) {
      return next();
    }

    // Session is required (enforced by session guard upstream)
    const session = ctx.state.session;
    if (!session) {
      ctx.status = 401;
      ctx.body = { error: 'Authentication required' };
      return;
    }

    // Create per-request auth provider with the session's tokens
    const authProvider = createAuthProvider(session, oidcConfig);

    // Create a fresh SDK transport for this request
    const transport = createNodeTransport({
      baseUrl: serverUrl,
      auth: authProvider,
    });

    // Rewrite path: /api/... → /api/admin/...
    const targetPath = ctx.path.replace(/^\/api/, '/api/admin');

    // Collect request headers to forward
    const headers: Record<string, string> = {};
    if (ctx.headers['if-match']) {
      headers['If-Match'] = ctx.headers['if-match'] as string;
    }
    if (ctx.headers['if-none-match']) {
      headers['If-None-Match'] = ctx.headers['if-none-match'] as string;
    }

    try {
      const response = await transport.request({
        method: ctx.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        path: targetPath,
        body: ctx.method !== 'GET' && ctx.method !== 'HEAD' ? ctx.request.body : undefined,
        params: ctx.query as Record<string, string>,
        headers,
      });

      // Forward response status and body
      ctx.status = response.status;
      ctx.body = response.data;

      // Forward ETag header for optimistic concurrency
      if (response.headers?.['etag']) {
        ctx.set('ETag', response.headers['etag']);
      }
      if (response.headers?.['content-type']) {
        ctx.set('Content-Type', response.headers['content-type']);
      }
    } catch (err) {
      if (err instanceof PortaHttpError) {
        // SDK HTTP error — convert back to HTTP response for SPA
        ctx.status = err.status;
        ctx.body = { error: err.message, code: err.code };
      } else {
        // Network error or refresh failure — clear session, return 401
        if (ctx.state.sessionId) {
          sessionStore.delete(ctx.state.sessionId);
        }
        ctx.status = 401;
        ctx.body = { error: 'Session expired — please log in again' };
      }
    }
  };
}
