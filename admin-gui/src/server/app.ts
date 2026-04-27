import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import type { BffConfig } from './config.js';
import type { Logger } from 'pino';
import { requestLogger } from './middleware/request-logger.js';
import { securityHeaders } from './middleware/security-headers.js';

/**
 * Create the BFF Koa application with the core middleware stack.
 *
 * Middleware order is security-critical:
 * 1. Logger → 2. Security headers → 3. Body parser
 *
 * Session, CSRF, routes, and SPA serving are added by the entry point
 * after the app is created — this keeps the factory focused and testable.
 *
 * @param config - Validated BFF configuration
 * @param logger - Pino logger instance
 * @returns Configured Koa application
 */
export function createApp(config: BffConfig, logger: Logger): Koa {
  const app = new Koa();

  // Cookie signing keys for session cookies
  app.keys = [config.sessionSecret];

  // Trust proxy when behind reverse proxy (Docker, SSH tunnel, etc.)
  app.proxy = config.nodeEnv === 'production';

  // 1. Request logger — logs every request with X-Request-Id
  app.use(requestLogger(logger));

  // 2. Security headers — CSP, X-Frame-Options, etc.
  app.use(securityHeaders(config));

  // 3. Body parser — JSON only, for API proxy (10MB limit for bulk operations)
  app.use(bodyParser({ jsonLimit: '10mb' }));

  return app;
}
