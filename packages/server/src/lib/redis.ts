import { Redis } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from './logger.js';

let redis: Redis | null = null;

export async function connectRedis(): Promise<Redis> {
  redis = new Redis(config.redisUrl, {
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
