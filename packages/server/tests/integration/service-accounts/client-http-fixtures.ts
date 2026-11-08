import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { afterEach, beforeEach, expect } from 'vitest';
import { generateAndStore, verify } from '../../../src/clients/secret-service.js';
import { getPool } from '../../../src/lib/database.js';
import { getRedis } from '../../../src/lib/redis.js';
import { ensureSigningKeys } from '../../../src/lib/signing-keys.js';
import { loadOidcTtlConfig } from '../../../src/lib/system-config.js';
import {
  clearAdminAuthProvider,
  setAdminAuthProvider,
} from '../../../src/middleware/admin-auth.js';
import { createOidcProvider } from '../../../src/oidc/provider.js';
import { createApp } from '../../../src/server.js';
import {
  getServiceAccount,
  revokeServiceAccount,
  setServiceAccount,
} from '../../../src/service-accounts/index.js';
import { truncateAllTables } from '../helpers/database.js';
import { createTestApplication, createTestClient } from '../helpers/factories.js';
import {
  createLifecycleActor,
  createLifecycleFixture,
  lifecycleSecurityFingerprint,
  readLifecycleAccount,
  readLifecycleAudits,
  readLifecycleSecrets,
} from './lifecycle-fixtures.js';
import type { LifecycleActor, LifecycleFixture } from './lifecycle-fixtures.js';

/** Both current and retained revoked ownership rows restrict client mutations. */
export const CLIENT_HTTP_BINDING_STATES = ['active', 'revoked'] as const;

/** Public lifecycle states exercised through existing administrative routes. */
export type ClientHttpBindingState = typeof CLIENT_HTTP_BINDING_STATES[number];

/** Real lifecycle projection used only to provision owned HTTP targets. */
type HttpBinding = Awaited<ReturnType<typeof setServiceAccount>>;

/** Real database entities and a loopback instance of the complete application. */
export interface ClientHttpFixture extends LifecycleFixture {
  /** Canonical App Admin with a real administrative-organization membership. */
  appAdmin: LifecycleActor;
  /** Canonical User Admin with a real administrative-organization membership. */
  userAdmin: LifecycleActor;
  /** Send an authenticated request; never include response bodies in failure messages. */
  request(
    actor: LifecycleActor,
    method: 'PUT' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Response>;
}

/** Non-secret client fields read independently of the HTTP response. */
export interface ClientHttpClientState {
  /** Persisted display name. */
  clientName: string;
  /** Persisted client lifecycle state. */
  status: string;
}

/** One-time credential response; assertions must never print this whole object. */
export interface ClientHttpSecret {
  /** Public credential identifier. */
  id: string;
  /** Internal UUID of the owning client. */
  clientId: string;
  /** Explicit synthetic label supplied by the test. */
  label: string;
  /** One-time secret material, used only as input to real credential verification. */
  plaintext: string;
}

/** Refuse destructive resets unless both services explicitly match the test environment. */
function assertIsolatedClientHttpEnvironment(): void {
  if (
    process.env.NODE_ENV !== 'test'
    || !process.env.TEST_DATABASE_URL
    || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
    || !process.env.TEST_REDIS_URL
    || process.env.REDIS_URL !== process.env.TEST_REDIS_URL
  ) {
    throw new Error('HTTP specifications require explicitly matched test database and Redis URLs');
  }
}

/** Listen only on IPv4 loopback, using an operating-system-assigned free port. */
async function listenClientHttpServer(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const fail = (error: Error): void => reject(error);
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', fail);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('HTTP specification server did not acquire a loopback port');
  }
  return `http://127.0.0.1:${address.port}`;
}

/**
 * Register isolated fixtures and teardown for a specification file.
 * Only opaque AccessToken lookup is replaced; account resolution, roles, routes,
 * middleware, audit transactions, PostgreSQL and Redis remain real.
 * @returns A getter for the current test's fixture.
 * @example const current = useClientHttpFixture();
 */
export function useClientHttpFixture(): () => ClientHttpFixture {
  let current: ClientHttpFixture | undefined;
  let server: Server | undefined;
  let resetAllowed = false;

  beforeEach(async () => {
    assertIsolatedClientHttpEnvironment();
    resetAllowed = true;
    clearAdminAuthProvider();
    await getRedis().flushdb();
    const fixture = await createLifecycleFixture();
    // Token issuance must not share the lifecycle target client: several scenarios deactivate
    // or delete that client and still expect the route's own response.
    const humanClient = await createTestClient(
      fixture.adminOrganization.id,
      fixture.adminApplication.id,
      { grantTypes: ['authorization_code', 'refresh_token'], scope: 'openid' },
    );
    const appAdmin = await createLifecycleActor(fixture.adminOrganization.id, fixture.appAdminRole);
    const userAdmin = await createLifecycleActor(fixture.adminOrganization.id, fixture.userAdminRole);
    const jwks = await ensureSigningKeys();
    const ttl = await loadOidcTtlConfig();
    const provider = await createOidcProvider({ jwks, ttl });
    const app = createApp(provider);

    const tokenAccounts = new Map<string, string>();
    const actorTokens = new Map<string, string>();
    for (const actor of [fixture.actor, appAdmin, userAdmin]) {
      const token = randomBytes(32).toString('base64url');
      tokenAccounts.set(token, actor.id);
      actorTokens.set(actor.id, token);
    }
    // createApp installs its provider first; replace only the external token lookup afterwards.
    setAdminAuthProvider({
      AccessToken: {
        find: async (token: string) => {
          const accountId = tokenAccounts.get(token);
          return accountId ? { accountId, clientId: humanClient.clientId } : undefined;
        },
      },
    });
    server = createServer(app.callback());
    const origin = await listenClientHttpServer(server);
    current = {
      ...fixture,
      appAdmin,
      userAdmin,
      request: async (actor, method, path, body) => {
        const token = actorTokens.get(actor.id);
        if (!token) throw new Error('HTTP fixture accepts only its seeded human identities');
        return fetch(`${origin}${path}`, {
          method,
          redirect: 'manual',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      },
    };
  });

  afterEach(async () => {
    current = undefined;
    clearAdminAuthProvider();
    const ownedServer = server;
    server = undefined;
    try {
      if (ownedServer) {
        ownedServer.closeAllConnections();
        if (ownedServer.listening) {
          await new Promise<void>((resolve, reject) => {
            ownedServer.close((error) => error ? reject(error) : resolve());
          });
        }
      }
    } finally {
      const shouldReset = resetAllowed;
      resetAllowed = false;
      if (shouldReset) {
        assertIsolatedClientHttpEnvironment();
        try {
          await truncateAllTables();
        } finally {
          await getRedis().flushdb();
        }
      }
    }
  });

  return () => {
    if (!current) throw new Error('HTTP specification fixture is not initialized');
    return current;
  };
}

/** Provision an owned binding using the dedicated public service, never fixture-only rows. */
export async function bindClientHttpFixture(
  fixture: ClientHttpFixture,
  state: ClientHttpBindingState = 'active',
): Promise<HttpBinding> {
  const binding = await setServiceAccount(fixture.client.id, {
    accountEmail: fixture.accountEmail,
    targets: [{
      organizationId: fixture.organization.id,
      allowedRoles: [],
      allowedClaimDefinitions: [],
    }],
  }, fixture.actor);
  if (state === 'revoked') {
    await revokeServiceAccount(fixture.client.id, fixture.actor);
  }
  return binding;
}

/** Create an ordinary unbound client in the control-plane organization but not the Admin app. */
export async function createOrdinaryClientHttpFixture(fixture: ClientHttpFixture) {
  // The canonical Admin application is reserved: any client there can receive Admin tokens and
  // must be managed only by a full Super Admin. This fixture models a genuinely ordinary client.
  const application = await createTestApplication();
  return createTestClient(fixture.adminOrganization.id, application.id, {
    clientType: 'confidential',
    grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
    tokenEndpointAuthMethod: 'client_secret_basic',
  });
}

/** Generate a credential as a live human Super Admin after binding, returning only its safe ID. */
export async function prepareClientHttpSecret(
  fixture: ClientHttpFixture,
  clientId: string,
): Promise<string> {
  const previousIds = new Set((await readLifecycleSecrets(clientId)).map((entry) => entry.id));
  await generateAndStore(clientId, { label: 'HTTP revocation fixture' }, fixture.actor.id);
  const secret = (await readLifecycleSecrets(clientId)).find(
    (entry) => entry.status === 'active' && !previousIds.has(entry.id),
  );
  if (!secret) throw new Error('HTTP revocation fixture has no active credential');
  return secret.id;
}

/** Read persisted state without relying on a route echoing its submitted input. */
export async function readClientHttpClient(clientId: string): Promise<ClientHttpClientState | null> {
  const result = await getPool().query<ClientHttpClientState>(
    'SELECT client_name AS "clientName", status FROM clients WHERE id = $1',
    [clientId],
  );
  return result.rows[0] ?? null;
}

/** Narrow parsed JSON without bypassing static typing. */
export function isClientHttpRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Parse response JSON with fixed failures that cannot accidentally print credential contents. */
export async function readClientHttpObject(response: Response): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('HTTP response must contain valid JSON');
  }
  if (!isClientHttpRecord(body)) throw new Error('HTTP response must contain a JSON object');
  return body;
}

/** Validate the exact one-time secret envelope without printing plaintext in assertion failures. */
export async function readClientHttpSecret(response: Response): Promise<ClientHttpSecret> {
  const body = await readClientHttpObject(response);
  expect(Object.keys(body).sort()).toEqual(['data', 'warning']);
  expect(typeof body.warning === 'string' && body.warning.length > 0).toBe(true);
  if (!isClientHttpRecord(body.data)) throw new Error('Secret response must contain a data object');
  const data = body.data;
  expect(Object.keys(data).sort()).toEqual([
    'clientId', 'createdAt', 'expiresAt', 'id', 'label', 'plaintext',
  ]);
  if (
    typeof data.id !== 'string' || typeof data.clientId !== 'string'
    || typeof data.label !== 'string' || typeof data.plaintext !== 'string'
  ) {
    throw new Error('Secret response must contain its required string fields');
  }
  expect(data.plaintext.length > 0).toBe(true);
  expect(typeof data.createdAt === 'string' && Number.isFinite(Date.parse(data.createdAt))).toBe(true);
  expect(data.expiresAt === null || (
    typeof data.expiresAt === 'string' && Number.isFinite(Date.parse(data.expiresAt))
  )).toBe(true);
  return { id: data.id, clientId: data.clientId, label: data.label, plaintext: data.plaintext };
}

/** Check real credential verification using only a boolean assertion, never secret arguments. */
export async function expectClientHttpSecretUsable(clientId: string, plaintext: string): Promise<void> {
  expect(await verify(clientId, plaintext)).toBe(true);
}

/** Assert unchanged ownership and the expected account state after a successful client mutation. */
export async function expectClientHttpBinding(
  fixture: ClientHttpFixture,
  binding: HttpBinding,
  state: ClientHttpBindingState,
): Promise<void> {
  const current = await getServiceAccount(fixture.client.id, fixture.actor);
  expect(current.id).toBe(binding.id);
  expect(current.serviceAccountId).toBe(binding.serviceAccountId);
  expect(current.status).toBe(state);
  const account = await readLifecycleAccount(binding.serviceAccountId);
  expect(account?.isServiceAccount).toBe(true);
  expect(account?.status).toBe(state === 'active' ? 'active' : 'inactive');
}

/** Require committed human-attributed audit evidence without prescribing an internal event name. */
export async function expectClientHttpAudit(
  fixture: ClientHttpFixture,
  previousIds: readonly string[],
): Promise<void> {
  const previous = new Set(previousIds);
  const added = (await readLifecycleAudits()).filter((entry) => !previous.has(entry.id));
  expect(added.length > 0).toBe(true);
  expect(added.every((entry) => entry.actorId === fixture.actor.id)).toBe(true);
}

/**
 * Require a generic 403 and byte-for-byte unchanged security/audit state.
 * Return only a digest of the safe envelope so tests can compare active and revoked
 * denials without ever printing an unexpected secret-bearing response.
 */
export async function expectClientHttpForbidden(
  fixture: ClientHttpFixture,
  response: Response,
  previousFingerprint: string,
): Promise<string> {
  expect(response.status).toBe(403);
  expect(response.headers.get('content-type')?.includes('application/json')).toBe(true);
  const body = await readClientHttpObject(response);
  expect(Object.keys(body).sort()).toEqual(['error', 'message']);
  expect(typeof body.error === 'string' && body.error.length > 0).toBe(true);
  expect(typeof body.message === 'string' && body.message.length > 0).toBe(true);
  const serialized = JSON.stringify(body);
  const sensitive = [
    fixture.accountEmail, fixture.oldSecret, fixture.client.id, fixture.client.clientId,
    fixture.actor.id, fixture.actor.email, fixture.appAdmin.id, fixture.appAdmin.email,
    fixture.userAdmin.id, fixture.userAdmin.email, fixture.adminOrganization.id,
  ];
  expect(sensitive.some((value) => serialized.includes(value))).toBe(false);
  const unsafeDetails = [
    /service[\s_-]*account|binding|classified|\bhuman\b|super[\s_-]*admin/i,
    /password|secret|plaintext|token|postgres|\bsql\b|constraint|stack/i,
    /@[\w.-]+|[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}|\/(?:home|usr|src)\//i,
  ];
  expect(unsafeDetails.some((pattern) => pattern.test(serialized))).toBe(false);
  expect(await lifecycleSecurityFingerprint()).toBe(previousFingerprint);
  return createHash('sha256').update(serialized).digest('hex');
}
