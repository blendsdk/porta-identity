/**
 * Specification tests for the ETag emitted when an administrator creates a user.
 *
 * The create response must carry the same weak ETag the read and update routes
 * derive from the user's `updatedAt`, so a client can send it back as `If-Match`
 * on the next update without an extra read.
 */
import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import Koa from 'koa';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: object, next: () => Promise<void>) => next(),
}));

import { generateETag } from '../../../src/lib/etag.js';
import { createUserRouter } from '../../../src/routes/users.js';
import { seedBaseData, truncateAllTables } from '../helpers/database.js';
import { createTestOrganization } from '../helpers/factories.js';
import { flushTestRedis } from '../helpers/redis.js';

/** Administrator identity and request payload for one admin user route call. */
interface AuthenticatedRouteOptions {
  /** Single permission granted to the substituted administrator. */
  readonly permission: string;
  /** Parsed request body when the route expects one. */
  readonly body?: unknown;
  /** Request headers such as `If-Match`. */
  readonly headers?: Readonly<Record<string, string>>;
}

/** Fields of the created user needed to derive and reuse its ETag. */
interface CreatedUser {
  readonly id: string;
  readonly updatedAt: string;
}

/**
 * Call one admin user route with only the authenticated administrator
 * substituted. The router, its permission check, and its tenant guard run
 * unchanged against the real test database.
 *
 * @param method - HTTP method to dispatch
 * @param path - Full request path including the `/api/admin` prefix
 * @param organizationId - Organization the substituted administrator belongs to
 * @param options - Permission, optional body, and optional request headers
 * @returns The completed Koa context carrying status, body, and response headers
 */
async function request(
  method: string,
  path: string,
  organizationId: string,
  options: AuthenticatedRouteOptions,
) {
  const incoming = new IncomingMessage(new Socket());
  incoming.method = method;
  incoming.url = path;
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    incoming.headers[name.toLowerCase()] = value;
  }
  const context = new Koa().createContext(incoming, new ServerResponse(incoming));
  if (options.body !== undefined) context.request.body = options.body;
  context.state = {
    requestId: 'user-create-etag-request',
    adminUser: {
      id: '10000000-0000-4000-8000-000000000002',
      email: 'etag-operator@example.test',
      organizationId,
      roles: [],
      permissions: [options.permission],
    },
  };
  await createUserRouter().routes()(context, async () => undefined);
  return context;
}

/**
 * Create a user through the admin route and read the created user from the
 * `{ data }` envelope.
 *
 * @param organizationId - Organization receiving the new user
 * @returns The completed create context and the created user
 */
async function createUserThroughRoute(organizationId: string) {
  const email = `etag-${randomUUID()}@test.example.com`;
  const context = await request(
    'POST',
    `/api/admin/organizations/${organizationId}/users`,
    organizationId,
    {
      permission: 'admin:user:create',
      body: { email, givenName: 'Casey', familyName: 'Creator' },
    },
  );
  const created = (context.body as { data: CreatedUser }).data;
  return { context, created };
}

describe('user create ETag', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();
  });

  // The create response exposes the weak ETag derived from the new user's
  // identity and `updatedAt`, matching the value every other write path emits.
  it('should return a weak ETag derived from the user updatedAt when an administrator creates a user', async () => {
    const organization = await createTestOrganization();

    const { context, created } = await createUserThroughRoute(organization.id);

    expect(context.status).toBe(201);
    const etag = context.response.get('ETag');
    expect(etag).toMatch(/^W\/"[a-f0-9]{16}"$/);
    expect(etag).toBe(generateETag('user', created.id, new Date(created.updatedAt)));
  });

  // Reading the created user repeats the create ETag exactly, so a client can
  // keep using the header it received on create.
  it('should repeat the create ETag on a subsequent read when the user was just created', async () => {
    const organization = await createTestOrganization();
    const { context: createContext, created } = await createUserThroughRoute(organization.id);
    const createETag = createContext.response.get('ETag');
    expect(createETag).toMatch(/^W\/"[a-f0-9]{16}"$/);

    const read = await request(
      'GET',
      `/api/admin/organizations/${organization.id}/users/${created.id}`,
      organization.id,
      { permission: 'admin:user:read' },
    );

    expect(read.status).toBe(200);
    expect(read.response.get('ETag')).toBe(createETag);
  });

  // The ETag returned at create is accepted as `If-Match`, so the first update
  // after a create does not need an extra read.
  it('should accept an If-Match update carrying the create ETag when the user was just created', async () => {
    const organization = await createTestOrganization();
    const { context: createContext, created } = await createUserThroughRoute(organization.id);
    const createETag = createContext.response.get('ETag');
    expect(createETag).toMatch(/^W\/"[a-f0-9]{16}"$/);

    const update = await request(
      'PUT',
      `/api/admin/organizations/${organization.id}/users/${created.id}`,
      organization.id,
      {
        permission: 'admin:user:update',
        headers: { 'If-Match': createETag },
        body: { givenName: 'Renamed' },
      },
    );

    expect(update.status).toBe(200);
    expect(update.body).toEqual({
      data: expect.objectContaining({ id: created.id, givenName: 'Renamed' }),
    });
  });
});
