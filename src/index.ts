/**
 * Application entry point.
 *
 * Orchestrates startup in the correct order:
 * 1. Connect to PostgreSQL and Redis
 * 2. Initialize i18n and template engine for auth workflows
 * 3. Load/generate signing keys from the database
 * 4. Load OIDC TTL configuration from system_config table
 * 5. Create the OIDC provider with all configuration wired together
 * 6. Create and start the Koa HTTP server with the provider mounted
 * 7. Register graceful shutdown handlers (SIGTERM/SIGINT)
 */

import { createApp } from './server.js';
import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import { connectDatabase, disconnectDatabase } from './lib/database.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';
import { ensureSigningKeys } from './lib/signing-keys.js';
import { loadOidcTtlConfig } from './lib/system-config.js';
import { createOidcProvider } from './oidc/provider.js';
import { initI18n, registerHandlebarsI18nHelper } from './auth/i18n.js';
import { initTemplateEngine } from './auth/template-engine.js';

async function main() {
  // Step 1: Connect to infrastructure services
  await connectDatabase();
  await connectRedis();

  // Step 2: Initialize i18n and template engine for auth workflow pages.
  // Must happen before any route handlers are invoked.
  await initI18n();
  registerHandlebarsI18nHelper();
  await initTemplateEngine();

  // Step 3: Load or auto-generate signing keys from the database.
  // If no active keys exist (e.g., fresh database), a new ES256 key pair
  // is generated and inserted automatically.
  const jwks = await ensureSigningKeys();

  // Step 4: Load OIDC TTL configuration from the system_config table.
  // Falls back to hardcoded defaults if config keys are missing.
  const ttl = await loadOidcTtlConfig();

  // Step 5: Create the OIDC provider with all config wired together
  const oidcProvider = await createOidcProvider({ jwks, ttl });

  // Step 6: Create and start the HTTP server with OIDC provider mounted
  const app = createApp(oidcProvider);
  const server = app.listen(config.port, config.host, () => {
    logger.info({ port: config.port, host: config.host }, 'Server started');
  });

  // Step 7: Graceful shutdown — close connections in reverse order
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    server.close(async () => {
      await disconnectDatabase();
      await disconnectRedis();
      logger.info('Server shut down gracefully');
      process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown stalls
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal(err, 'Failed to start server');
  process.exit(1);
});
