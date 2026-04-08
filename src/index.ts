import { createApp } from './server.js';
import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import { connectDatabase, disconnectDatabase } from './lib/database.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';

async function main() {
  // Connect to infrastructure
  await connectDatabase();
  await connectRedis();

  // Create and start server
  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    logger.info({ port: config.port, host: config.host }, 'Server started');
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    server.close(async () => {
      await disconnectDatabase();
      await disconnectRedis();
      logger.info('Server shut down gracefully');
      process.exit(0);
    });

    // Force exit after 10 seconds
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
