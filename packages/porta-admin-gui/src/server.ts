/**
 * Koa application factory for the standalone Admin GUI BFF.
 *
 * Creates a configured Koa app with the complete middleware stack:
 *   1. Error handler
 *   2. Security headers
 *   3. Body parser
 *   4. Request logger
 *   5. Session cookie middleware
 *
 * Route-level middleware (health, auth, session guard, API proxy, static)
 * is wired in by `startServer()` after OIDC discovery completes.
 *
 * @module server
 */

import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import { errorHandler } from './middleware/error-handler.js';
import { securityHeaders } from './middleware/security-headers.js';
import { sessionMiddleware } from './middleware/session.js';
import { requestLogger } from './middleware/request-logger.js';
import type { SessionStore } from './session.js';

/** Dependencies injected into the app factory. */
export interface AppDependencies {
  /** In-memory session store instance. */
  sessionStore: SessionStore;
}

/**
 * Create a configured Koa application with the base middleware stack.
 *
 * The returned app has the foundational middleware (error handling, security,
 * body parsing, session) but does NOT yet have route handlers. Routes are
 * added by `startServer()` after OIDC discovery and config resolution.
 *
 * @param deps - Injected dependencies (session store).
 * @returns Configured Koa application.
 */
export function createApp(deps: AppDependencies): Koa {
  const app = new Koa();

  // Koa requires keys for signed cookies — we use unsigned cookies,
  // but set keys anyway to avoid runtime errors with ctx.cookies
  app.keys = ['porta-gui-unsigned'];

  // --- Middleware stack (order matters) ---

  // 1. Global error handler — catches all downstream errors
  app.use(errorHandler());

  // 2. Security headers on every response
  app.use(securityHeaders());

  // 3. Body parser for API proxy request forwarding
  app.use(bodyParser({ enableTypes: ['json'] }));

  // 4. Request logging
  app.use(requestLogger());

  // 5. Session cookie middleware (reads/writes session from cookie)
  app.use(sessionMiddleware(deps.sessionStore));

  return app;
}
