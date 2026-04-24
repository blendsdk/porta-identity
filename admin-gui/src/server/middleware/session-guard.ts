import type { Middleware } from 'koa';

/**
 * Session guard middleware.
 *
 * Requires an active, authenticated session for all /api/* routes.
 * Returns 401 if no session or session has no access token.
 * This ensures the API proxy never runs without authentication.
 *
 * Non-API routes (e.g., /auth/*, /health, static assets) are not guarded,
 * allowing the login flow and health checks to work without a session.
 *
 * @returns Koa middleware that blocks unauthenticated API requests
 */
export function sessionGuard(): Middleware {
  return async (ctx, next) => {
    // Only guard /api/* routes — other routes handle their own auth
    if (!ctx.path.startsWith('/api/')) {
      return next();
    }

    const session = ctx.session as Record<string, unknown> | undefined;
    if (!session?.accessToken || !session?.user) {
      ctx.status = 401;
      ctx.body = { error: 'Not authenticated. Please log in.' };
      return;
    }

    await next();
  };
}
