import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import {
  initI18n,
  initTemplateEngine,
  setEmailTransport,
} from '../../../src/auth/index.js';
import { getRedis } from '../../../src/lib/redis.js';
import { ensureSigningKeys } from '../../../src/lib/signing-keys.js';
import { loadOidcTtlConfig } from '../../../src/lib/system-config.js';
import {
  clearAdminAuthProvider,
  setAdminAuthProvider,
} from '../../../src/middleware/admin-auth.js';
import { createOidcProvider } from '../../../src/oidc/provider.js';
import { createApp } from '../../../src/server.js';
import { createLifecycleFixture } from './lifecycle-fixtures.js';
import type { LifecycleFixture } from './lifecycle-fixtures.js';

/** Full application listener; only opaque identity lookup is supplied externally. */
export interface ReservedRoleApp {
  /** Loopback-only origin chosen by the operating system. */
  baseUrl: string;
  /** Random synthetic bearer credential resolving to a real database user. */
  adminToken: string;
  /** Close owned HTTP connections and release the listener. */
  close(): Promise<void>;
}

/** Email boundary observation without retaining messages or invitation credentials. */
export interface ReservedRoleMail {
  /** Number of transport calls, including unsuccessful invitation attempts. */
  attempts: number;
}

/**
 * Reset only explicitly selected test stores before seeding real role definitions.
 * Matching URLs prevent a cached application lookup from surviving database truncation.
 * The runner, not this helper, owns and later removes these isolated stores.
 *
 * @throws When the caller has not explicitly selected matching test stores.
 */
export async function createReservedRoleFixture(): Promise<LifecycleFixture> {
  if (
    process.env.NODE_ENV !== 'test'
    || !process.env.TEST_DATABASE_URL
    || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
    || !process.env.TEST_REDIS_URL
    || process.env.REDIS_URL !== process.env.TEST_REDIS_URL
  ) {
    throw new Error('Reserved-role fixtures require explicitly selected isolated test stores');
  }
  await getRedis().flushdb();
  const fixture = await createLifecycleFixture();
  await initI18n();
  await initTemplateEngine();
  return fixture;
}

/** Install the true external email seam while leaving invitation persistence real. */
export function captureReservedRoleMail(): ReservedRoleMail {
  const observation: ReservedRoleMail = { attempts: 0 };
  setEmailTransport({
    async send(options) {
      observation.attempts += 1;
      return {
        messageId: randomBytes(16).toString('hex'),
        accepted: typeof options.to === 'string' ? [options.to] : [],
        rejected: [],
      };
    },
  });
  return observation;
}

/** Close only this helper's listener, including connections left open by fetch. */
async function closeReservedRoleServer(server: Server): Promise<void> {
  server.closeAllConnections();
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

/**
 * Start the real application, provider, routing and mutation-audit middleware.
 * Authentication resolves a random opaque token to an existing user; authorization
 * still loads that user's real memberships and application definitions.
 * Call after seeding configuration, and always close the returned listener.
 *
 * @param actorId - Real human identity used by authenticated Admin requests.
 * @returns An owned loopback listener with its synthetic bearer credential.
 */
export async function startReservedRoleApp(actorId: string): Promise<ReservedRoleApp> {
  await initI18n();
  await initTemplateEngine();
  const jwks = await ensureSigningKeys();
  const ttl = await loadOidcTtlConfig();
  const provider = await createOidcProvider({ jwks, ttl });
  const app = createApp(provider);
  const adminToken = randomBytes(32).toString('hex');
  setAdminAuthProvider({
    AccessToken: {
      async find(token) {
        return token === adminToken ? { accountId: actorId } : undefined;
      },
    },
  });
  const server = createServer(app.callback());
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Missing owned loopback listener address');
    }
    return {
      baseUrl: `http://127.0.0.1:${address.port}`,
      adminToken,
      close: () => closeReservedRoleServer(server),
    };
  } catch (error) {
    await closeReservedRoleServer(server);
    clearAdminAuthProvider();
    throw error;
  }
}

/** Release owned HTTP resources and remove only the two permitted external seams. */
export async function resetReservedRoleRuntime(app?: ReservedRoleApp): Promise<void> {
  try {
    await app?.close();
  } finally {
    clearAdminAuthProvider();
    setEmailTransport(null);
  }
}

/** Decode one HTML attribute layer, including numeric escapes used by template engines. */
function decodeReservedRoleAttribute(value: string): string {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d{1,7}|#x[\da-f]{1,6});/gi, (entity) => {
    const name = entity.slice(1, -1).toLowerCase();
    if (name === 'amp') return '&';
    if (name === 'quot') return '"';
    if (name === 'apos') return "'";
    if (name === 'lt') return '<';
    if (name === 'gt') return '>';
    const codePoint = name.startsWith('#x')
      ? Number.parseInt(name.slice(2), 16)
      : Number.parseInt(name.slice(1), 10);
    return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '\uFFFD';
  });
}

/**
 * Read the hidden CSRF value without assuming HTML attribute order or quote style.
 * Only bounded input tags are inspected; no page contents are included in errors.
 */
export function readReservedRoleCsrf(html: string): string {
  const inputTags = html.match(/<input\b[^>]{0,4096}>/gi) ?? [];
  for (const tag of inputTags) {
    const attributes = new Map<string, string>();
    const attributePattern = /([a-z_:][a-z0-9_:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
    for (const match of tag.matchAll(attributePattern)) {
      attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4]);
    }
    if (
      attributes.get('type')?.toLowerCase() === 'hidden'
      && attributes.get('name') === '_csrf'
    ) {
      const value = attributes.get('value');
      if (value) return decodeReservedRoleAttribute(value);
    }
  }
  throw new Error('Invitation form did not contain a hidden CSRF value');
}
