import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { setupOidc } from './oidc.js';
import { configureSession } from './session.js';
import { configureSpaServing } from './routes/spa.js';
import { createAuthRouter } from './routes/auth.js';
import { createHealthRouter } from './routes/health.js';
import { createApiProxyRouter } from './routes/api-proxy.js';
import { sessionGuard } from './middleware/session-guard.js';
import { csrfProtection } from './middleware/csrf.js';
import pino from 'pino';

/**
 * Admin GUI BFF entry point.
 *
 * Startup sequence:
 * 1. Load and validate configuration
 * 2. Create logger
 * 3. Discover Porta OIDC configuration
 * 4. Create Koa app with middleware
 * 5. Configure sessions (Redis)
 * 6. Mount routes (health, auth, API proxy, SPA)
 * 7. Start listening
 * 8. Set up graceful shutdown
 */
async function main(): Promise<void> {
  // 1. Load config (fail-fast on invalid env vars)
  const config = loadConfig();

  // 2. Create logger (pino-pretty in dev, JSON in production, silent in test)
  const logger = pino({
    level: config.logLevel,
    transport:
      config.nodeEnv === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  });

  logger.info('Starting Porta Admin GUI BFF...');

  // 3. Discover OIDC configuration from Porta
  const oidcConfig = await setupOidc(config, logger);

  // 4. Create Koa app with core middleware (logger, security headers, body parser)
  const app = createApp(config, logger);

  // 5. Configure sessions (Redis-backed with idle + absolute timeouts)
  const redis = configureSession(app, config, logger);
  await redis.connect();

  // 6. Mount middleware and routes in security-critical order
  // CSRF protection (validates tokens on state-changing requests)
  app.use(csrfProtection());

  // Health check (no auth required — used by load balancers)
  const healthRouter = createHealthRouter(config, redis);
  app.use(healthRouter.routes());
  app.use(healthRouter.allowedMethods());

  // Auth routes (login, callback, logout, me)
  const authRouter = createAuthRouter(config, oidcConfig, logger);
  app.use(authRouter.routes());
  app.use(authRouter.allowedMethods());

  // Session guard (blocks unauthenticated /api/* requests)
  app.use(sessionGuard());

  // API proxy (forwards /api/* to Porta /api/admin/* with Bearer token)
  const apiProxyRouter = createApiProxyRouter(config, oidcConfig, logger);
  app.use(apiProxyRouter.routes());
  app.use(apiProxyRouter.allowedMethods());

  // SPA serving (static assets + index.html catch-all in production)
  configureSpaServing(app, config);

  // 7. Start listening
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, 'Admin GUI BFF listening');
  });

  // 8. Graceful shutdown — close server, disconnect Redis, exit cleanly
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down Admin GUI BFF...');
    server.close();
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal error starting Admin GUI BFF:', err);
  process.exit(1);
});
