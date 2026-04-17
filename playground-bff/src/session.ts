/**
 * Redis Session Configuration
 *
 * Configures koa-session to use Redis as the backing store.
 * Sessions are stored under the `bff:sess:` key prefix to avoid
 * collisions with Porta's own Redis keys.
 *
 * The session cookie is HttpOnly and signed — the browser never
 * sees the token values, only the session ID.
 */

import session from 'koa-session';
import Redis from 'ioredis';
import type Koa from 'koa';

/**
 * Configure session middleware on the Koa app.
 * Creates a Redis-backed session store with HttpOnly cookies.
 *
 * @param app - Koa application instance
 * @param redisHost - Redis server host
 * @param redisPort - Redis server port
 */
export function configureSession(app: Koa, redisHost: string, redisPort: number): void {
  const redis = new Redis({ host: redisHost, port: redisPort });

  // Custom Redis session store — uses bff:sess: prefix to avoid
  // key collisions with Porta's Redis data
  const store = {
    async get(key: string): Promise<unknown> {
      const data = await redis.get(`bff:sess:${key}`);
      return data ? JSON.parse(data) : null;
    },
    async set(key: string, sess: unknown, maxAge?: number): Promise<void> {
      // Default TTL: 24 hours (86400 seconds)
      const ttl = maxAge ? Math.ceil(maxAge / 1000) : 86400;
      await redis.set(`bff:sess:${key}`, JSON.stringify(sess), 'EX', ttl);
    },
    async destroy(key: string): Promise<void> {
      await redis.del(`bff:sess:${key}`);
    },
  };

  // Signing key for session cookies — acceptable for a dev playground
  app.keys = ['bff-playground-secret-key'];

  app.use(session({
    key: 'bff_session',   // Cookie name — distinct from Porta's cookies
    maxAge: 86400000,     // 24 hours in milliseconds
    httpOnly: true,       // Browser cannot read cookie via JS
    signed: true,         // Cookie is signed with app.keys
    store,
  }, app));
}
