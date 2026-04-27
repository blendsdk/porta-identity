import type { Middleware } from 'koa';
import type { Logger } from 'pino';
import crypto from 'node:crypto';

/** HTTP header name for the CSRF token */
const CSRF_HEADER = 'x-csrf-token';

/**
 * Session key where the CSRF token is stored.
 *
 * IMPORTANT: Must NOT start with underscore — koa-session v7's toJSON()
 * strips all properties starting with '_' (treats them as "private stuff"),
 * which would cause the CSRF token to be lost on every session save.
 */
const CSRF_SESSION_KEY = 'csrfSecret';

/**
 * CSRF protection middleware.
 *
 * - Generates a CSRF token and stores it in the session
 * - GET /auth/me includes the CSRF token in the response
 * - POST/PUT/PATCH/DELETE requests to /api/* must include the token in X-CSRF-Token header
 * - Token is validated against the session-stored token
 *
 * This prevents cross-site request forgery since the token
 * is not accessible to other origins (SameSite=Strict cookie + custom header).
 *
 * @param logger - Optional Pino logger for CSRF diagnostic logging
 * @returns Koa middleware that enforces CSRF tokens on state-changing API requests
 */
export function csrfProtection(logger?: Logger): Middleware {
  return async (ctx, next) => {
    // Ensure a CSRF token exists in the session
    if (ctx.session && !ctx.session[CSRF_SESSION_KEY]) {
      ctx.session[CSRF_SESSION_KEY] = crypto.randomBytes(32).toString('hex');
      logger?.debug(
        { path: ctx.path, hasSession: !!ctx.session },
        'CSRF: Generated new token for session',
      );
    }

    // Skip CSRF validation for safe methods and non-API routes
    const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(ctx.method);
    const isApiRoute = ctx.path.startsWith('/api/');

    if (isStateChanging && isApiRoute) {
      // If the session has no auth data (expired or never authenticated),
      // skip CSRF validation and let the downstream session guard return 401.
      // CSRF protection is only meaningful for authenticated sessions — the
      // purpose is to prevent another site from abusing an active session.
      // Without auth data, there is no session to abuse.
      const sess = ctx.session as Record<string, unknown> | undefined;
      const hasAuthSession = !!(sess?.accessToken && sess?.user);

      if (hasAuthSession) {
        const token = ctx.get(CSRF_HEADER);
        const expectedToken = sess?.[CSRF_SESSION_KEY] as string | undefined;

        if (!token || !expectedToken || token !== expectedToken) {
          logger?.warn(
            {
              path: ctx.path,
              method: ctx.method,
              hasToken: !!token,
              hasExpected: !!expectedToken,
              tokenMatch: token === expectedToken,
              hasSession: !!ctx.session,
              sessionKeys: ctx.session ? Object.keys(ctx.session) : [],
            },
            'CSRF: Token validation failed',
          );
          ctx.status = 403;
          ctx.body = { error: 'Invalid CSRF token' };
          return;
        }
      }
    }

    await next();
  };
}

/**
 * Get the CSRF token from the session.
 * Used by the /auth/me endpoint to include the token in the response
 * so the SPA can send it with state-changing requests.
 *
 * @param session - Koa session object
 * @returns CSRF token string or undefined if no session
 */
export function getCsrfToken(session: Record<string, unknown> | undefined): string | undefined {
  return session?.[CSRF_SESSION_KEY] as string | undefined;
}
