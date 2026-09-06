import { Redis } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from './logger.js';

let redis: Redis | null = null;

/** Maximum time one Redis command may hold a public request while Redis is unavailable. */
const REDIS_COMMAND_TIMEOUT_MS = 1000;

export async function connectRedis(): Promise<Redis> {
  redis = new Redis(config.redisUrl, {
    commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  await redis.connect();
  logger.info('Redis connected');

  redis.on('error', (err: Error) => {
    logger.error({ err }, 'Redis error');
  });

  return redis;
}

export function getRedis(): Redis {
  if (!redis) throw new Error('Redis not connected. Call connectRedis() first.');
  return redis;
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info('Redis disconnected');
  }
}
