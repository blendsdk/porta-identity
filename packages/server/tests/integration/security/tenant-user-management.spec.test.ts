/**
 * Live tenant API specification for create, list, get, and update.
 *
 * The router, auth middleware, tenant guards, rate limiter, services, and
 * PostgreSQL transaction run unchanged. Only the OIDC token lookup is
 * substituted so the test can act as a real tenant client.
 */

import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import Koa from 'koa';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TenantTokenProvider } from '../../../src/middleware/tenant-user-auth.js';
import { createTenantUsersRouter } from '../../../src/routes/tenant-users.js';
import { getPool } from '../../../src/lib/database.js';
import { seedBaseData, truncateAllTables } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClient,
  createTestOrganization,
  createTestUser,
} from '../helpers/factories.js';
import { flushTestRedis } from '../helpers/redis.js';

interface Fixture {
  readonly organizationId: string;
  readonly clientId: string;
  readonly router: ReturnType<typeof createTenantUsersRouter>;
}

interface RequestOptions {
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Dispatch one route through the real tenant middleware stack.
 *
 * @param fixture - Tenant client and router fixture
 * @param options - Method, path, body, and optional headers
 * @returns Completed Koa context
 */
async function request(fixture: Fixture, options: RequestOptions) {
  const incoming = new IncomingMessage(new Socket());
  incoming.method = options.method;
  incoming.url = options.path;
  incoming.headers.authorization = 'Bearer tenant-token';
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    incoming.headers[name.toLowerCase()] = value;
  }

  const context = new Koa().createContext(incoming, new ServerResponse(incoming));
  if (options.body !== undefined) context.request.body = options.body;
  context.state = { requestId: randomUUID() };

  await fixture.router.routes()(context, async () => undefined);
  return context;
}

/** Read one user row directly from PostgreSQL. */
async function readUser(userId: string) {
  const result = await getPool().query<{
    id: string;
    email: string;
    email_verified: boolean;
    given_name: string | null;
    phone_number: string | null;
    phone_number_verified: boolean;
    address_street: string | null;
    password_hash: string | null;
  }>(
    `SELECT id, email, email_verified, given_name, phone_number,
            phone_number_verified, address_street, password_hash
       FROM users WHERE id = $1`,
    [userId],
  );
  return result.rows[0];
}

/** Read the latest audit row for one event and organization. */
async function readAudit(eventType: string, organizationId: string) {
  const result = await getPool().query<{
    actor_type: string;
    actor_client_id: string | null;
    actor_client_name: string | null;
    user_id: string | null;
    metadata: Record<string, unknown>;
  }>(
    `SELECT actor_type, actor_client_id, actor_client_name, user_id, metadata
       FROM audit_log
      WHERE event_type = $1 AND organization_id = $2
      ORDER BY created_at DESC
      LIMIT 1`,
    [eventType, organizationId],
  );
  return result.rows[0];
}

let fixture: Fixture;

beforeEach(async () => {
  await truncateAllTables();
  await seedBaseData();
  await flushTestRedis();

  const organization = await createTestOrganization();
  const application = await createTestApplication();
  await createTestApplication({ name: 'Porta Admin', slug: 'porta-admin' });
  const client = await createTestClient(organization.id, application.id, {
    scope: 'org:user:read org:user:write org:user:delete',
  });

  const provider: TenantTokenProvider = {
    ClientCredentials: {
      find: async (token) =>
        token === 'tenant-token' ? { clientId: client.clientId, scopes: new Set([
          'org:user:read',
          'org:user:write',
          'org:user:delete',
        ]) } : undefined,
    },
    AccessToken: { find: async () => undefined },
  };

  fixture = {
    organizationId: organization.id,
    clientId: client.clientId,
    router: createTenantUsersRouter(provider),
  };
});

describe('tenant user API', () => {
  it('ST-10 creates a full profile with verification flags and first-class client audit', async () => {
    const context = await request(fixture, {
      method: 'POST',
      path: `/api/organizations/${fixture.organizationId}/users`,
      body: {
        email: `full-${randomUUID()}@example.test`,
        givenName: 'Full',
        familyName: 'Profile',
        phoneNumber: '+15555550123',
        phoneNumberVerified: true,
        emailVerified: true,
        address: { street: '1 Main St', country: 'US' },
      },
    });

    expect(context.status).toBe(201);
    const body = context.body as { data: { id: string } };
    const row = await readUser(body.data.id);
    expect(row).toMatchObject({
      email_verified: true,
      given_name: 'Full',
      phone_number: '+15555550123',
      phone_number_verified: true,
      address_street: '1 Main St',
      password_hash: null,
    });
    expect(context.response.get('ETag')).toMatch(/^W\/"[a-f0-9]{16}"$/);

    const audit = await readAudit('user.created', fixture.organizationId);
    expect(audit).toMatchObject({
      actor_type: 'client',
      actor_client_id: fixture.clientId,
      actor_client_name: expect.any(String),
      user_id: body.data.id,
    });
  });

  it('ST-11 rejects a tenant create with a password', async () => {
    const context = await request(fixture, {
      method: 'POST',
      path: `/api/organizations/${fixture.organizationId}/users`,
      body: { email: 'password@example.test', password: 'Password1!' },
    });

    expect(context.status).toBe(400);
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS count FROM users WHERE email = 'password@example.test'`,
    );
    expect(count.rows[0]?.count).toBe(0);
  });

  it('ST-13 returns 409 for a duplicate tenant email', async () => {
    const email = `duplicate-${randomUUID()}@example.test`;
    const first = await request(fixture, {
      method: 'POST',
      path: `/api/organizations/${fixture.organizationId}/users`,
      body: { email },
    });
    expect(first.status).toBe(201);

    const second = await request(fixture, {
      method: 'POST',
      path: `/api/organizations/${fixture.organizationId}/users`,
      body: { email },
    });
    expect(second.status).toBe(409);
  });

  it('ST-16 lists only the path organization and audits the list without user contents', async () => {
    await createTestUser(fixture.organizationId, { email: `a-${randomUUID()}@example.test` });
    const other = await createTestOrganization();
    await createTestUser(other.id, { email: `b-${randomUUID()}@example.test` });

    const context = await request(fixture, {
      method: 'GET',
      path: `/api/organizations/${fixture.organizationId}/users?page=1&pageSize=20`,
    });

    expect(context.status).toBe(200);
    const body = context.body as { data: Array<{ organizationId: string }>; total: number };
    expect(body.data.every((user) => user.organizationId === fixture.organizationId)).toBe(true);
    expect(body.total).toBe(1);

    const audit = await readAudit('user.listed', fixture.organizationId);
    expect(audit).toMatchObject({
      actor_type: 'client',
      actor_client_id: fixture.clientId,
      user_id: null,
    });
    expect(JSON.stringify(audit.metadata)).not.toContain('@example.test');
  });

  it('ST-17/ST-18 reads one user and hides foreign users with the same 404', async () => {
    const user = await createTestUser(fixture.organizationId, {
      email: `read-${randomUUID()}@example.test`,
    });
    const read = await request(fixture, {
      method: 'GET',
      path: `/api/organizations/${fixture.organizationId}/users/${user.id}`,
    });
    expect(read.status).toBe(200);
    expect(read.response.get('ETag')).toMatch(/^W\/"[a-f0-9]{16}"$/);

    const foreignOrg = await createTestOrganization();
    const foreign = await createTestUser(foreignOrg.id, {
      email: `foreign-${randomUUID()}@example.test`,
    });
    const hidden = await request(fixture, {
      method: 'GET',
      path: `/api/organizations/${fixture.organizationId}/users/${foreign.id}`,
    });
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual({ error: 'User not found' });
  });

  it('ST-21/ST-25 updates a user and preserves the Admin stale-If-Match response', async () => {
    const user = await createTestUser(fixture.organizationId, {
      email: `update-${randomUUID()}@example.test`,
    });

    const update = await request(fixture, {
      method: 'PUT',
      path: `/api/organizations/${fixture.organizationId}/users/${user.id}`,
      body: { nickname: 'newbie' },
    });
    expect(update.status).toBe(200);
    expect((update.body as { data: { nickname: string } }).data.nickname).toBe('newbie');

    const stale = await request(fixture, {
      method: 'PUT',
      path: `/api/organizations/${fixture.organizationId}/users/${user.id}`,
      headers: { 'If-Match': 'W/"0000000000000000"' },
      body: { nickname: 'stale' },
    });
    expect(stale.status).toBe(409);
  });
});
