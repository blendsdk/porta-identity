import session from 'koa-session';
import { Redis } from 'ioredis';
import type Koa from 'koa';
import type { BffConfig } from './config.js';
import type { Logger } from 'pino';

/** Key prefix for admin GUI sessions in Redis */
const SESSION_PREFIX = 'porta-admin-session:';

/** Idle timeout: 30 minutes of inactivity */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Absolute timeout: 8 hours maximum session lifetime */
const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

/**
 * Session data stored in Redis.
 * Contains OIDC tokens (server-side only) and user info.
 */
export interface SessionData {
  /** OIDC access token (never exposed to browser) */
  accessToken: string;
  /** OIDC refresh token (never exposed to browser) */
  refreshToken: string;
  /** Access token expiry timestamp (epoch ms) */
  tokenExpiry: number;
  /** Authenticated user info */
  user: {
    id: string;
    email: string;
    name: string;
    roles: string[];
    orgId: string;
  };
  /** Timestamp when the user logged in (epoch ms) */
  loginAt: number;
  /** Timestamp of last activity (epoch ms) — for idle timeout */
  lastActivity: number;
  /** PKCE code_verifier (stored temporarily during auth flow) */
  codeVerifier?: string;
  /** OIDC state parameter (stored temporarily during auth flow) */
  authState?: string;
}

/**
 * Create Redis-backed session store with idle + absolute timeout enforcement.
 * Uses separate Redis DB (from REDIS_URL) to isolate from OIDC sessions.
 *
 * @param config - BFF configuration (Redis URL)
 * @param logger - Pino logger
 * @returns Session store and Redis client
 */
export function createSessionStore(config: BffConfig, logger: Logger) {
  const redis = new Redis(config.redisUrl, {
    keyPrefix: SESSION_PREFIX,
    lazyConnect: true,
  });

  redis.on('error', (err: Error) => {
    logger.error({ err }, 'Redis session store error');
  });

  redis.on('connect', () => {
    logger.info('Redis session store connected');
  });

  const store = {
    async get(key: string) {
      const data = await redis.get(key);
      if (!data) return null;

      const sess = JSON.parse(data);

      // Check absolute timeout — session cannot exceed 8 hours regardless of activity
      if (sess.loginAt && Date.now() - sess.loginAt > ABSOLUTE_TIMEOUT_MS) {
        logger.info({ key }, 'Session expired (absolute timeout)');
        await redis.del(key);
        return null;
      }

      // Check idle timeout — session expires after 30 minutes of inactivity
      if (sess.lastActivity && Date.now() - sess.lastActivity > IDLE_TIMEOUT_MS) {
        logger.info({ key }, 'Session expired (idle timeout)');
        await redis.del(key);
        return null;
      }

      // Update last activity timestamp and persist to Redis immediately.
      // koa-session compares ctx.session to the object returned by get() to detect changes,
      // so modifying lastActivity here would not trigger a save — we must write it ourselves.
      sess.lastActivity = Date.now();
      const ttlSec = await redis.ttl(key);
      if (ttlSec > 0) {
        await redis.setex(key, ttlSec, JSON.stringify(sess));
      }

      return sess;
    },

    async set(key: string, sess: Record<string, unknown>, maxAge?: number) {
      // Use the shorter of: maxAge from koa-session, or absolute timeout
      const ttlMs = Math.min(maxAge || ABSOLUTE_TIMEOUT_MS, ABSOLUTE_TIMEOUT_MS);
      const ttlSec = Math.ceil(ttlMs / 1000);
      await redis.setex(key, ttlSec, JSON.stringify(sess));
    },

    async destroy(key: string) {
      await redis.del(key);
    },
  };

  return { store, redis };
}

/**
 * Configure koa-session with Redis-backed store and security-hardened cookie settings.
 *
 * @param app - Koa application instance
 * @param config - BFF configuration
 * @param logger - Pino logger
 * @returns Redis client instance (for health checks and graceful shutdown)
 */
export function configureSession(app: Koa, config: BffConfig, logger: Logger) {
  const { store, redis } = createSessionStore(config, logger);

  const sessionConfig: Record<string, unknown> = {
    key: 'porta-admin-session',
    store,
    maxAge: ABSOLUTE_TIMEOUT_MS,
    httpOnly: true,
    signed: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict' as const,
    renew: false, // We handle renewal via lastActivity tracking
  };

  app.use(session(sessionConfig, app));

  return redis;
}
