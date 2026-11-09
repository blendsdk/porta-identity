/**
 * Specification tests for the resource-server Admin API.
 *
 * These tests exercise the real router, service, repository, PostgreSQL transaction, and generic
 * Admin mutation audit. Only the authenticated administrator identity is substituted; every
 * authorization and persistence boundary remains real.
 */

import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import Koa from 'koa';
import { errors } from 'oidc-provider';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getPool } from '../../../src/lib/database.js';
import { ADMIN_PERMISSIONS } from '../../../src/lib/admin-permissions.js';
import { findSuperAdminOrganization } from '../../../src/organizations/repository.js';
import { resolveResourceServerInfo } from '../../../src/oidc/resource-servers.js';
import type { Application } from '../../../src/applications/types.js';
import { createTestApplication, createTestUser } from '../helpers/factories.js';
import { seedBaseData, truncateAllTables } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';

vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: object, next: () => Promise<void>) => next(),
}));

import { createResourceServerRouter } from '../../../src/routes/resource-servers.js';
import { adminMutationAudit } from '../../../src/middleware/admin-mutation-audit.js';

interface RouteResult {
  readonly context: Koa.Context;
  readonly error?: unknown;
}

interface ResourceServerBody {
  id: string;
  applicationId: string;
  slug: string;
  name: string;
  identifier: string;
  audience: string;
  scopes: string[];
  createdAt: string;
  updatedAt: string;
}

const READ = ADMIN_PERMISSIONS.APP_READ;
const WRITE = ADMIN_PERMISSIONS.APP_UPDATE;

describe('resource-server Admin API', () => {
  let actorId: string;
  let organizationId: string;
  let appA: Application;
  let appB: Application;

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();

    const organization = await findSuperAdminOrganization();
    if (!organization) throw new Error('Control-plane seed is missing');
    organizationId = organization.id;
    actorId = (await createTestUser(organizationId, {
      email: `resource-server-spec-${randomUUID()}@example.test`,
    })).id;

    appA = await createTestApplication({
      name: 'Application A',
      slug: `app-a-${randomUUID().slice(0, 8)}`,
    });
    appB = await createTestApplication({
      name: 'Application B',
      slug: `app-b-${randomUUID().slice(0, 8)}`,
    });
  });

  /**
   * Dispatch one real Admin API request.
   *
   * @param method - HTTP method
   * @param path - Path below `/api/admin/applications`
   * @param permissions - Permissions held by the substituted administrator
   * @param body - Optional request body
   * @returns Completed context and any thrown public HTTP error
   */
  async function requestAbsolute(
    method: string,
    url: string,
    permissions: readonly string[],
    body?: unknown,
  ): Promise<RouteResult> {
    const incoming = new IncomingMessage(new Socket());
    incoming.method = method;
    incoming.url = url;
    const context = new Koa().createContext(incoming, new ServerResponse(incoming));
    if (body !== undefined) context.request.body = body;
    context.state = {
      requestId: `resource-server-spec-${randomUUID()}`,
      adminUser: {
        id: actorId,
        email: 'resource-server-spec@example.test',
        organizationId,
        roles: [],
        permissions: [...permissions],
      },
    };

    const dispatch = () => createResourceServerRouter().routes()(context, async () => undefined);

    if (method === 'GET') {
      await dispatch();
      return { context };
    }

    try {
      await adminMutationAudit()(context, dispatch);
      return { context };
    } catch (error) {
      return { context, error };
    }
  }

  async function request(
    method: string,
    path: string,
    permissions: readonly string[],
    body?: unknown,
  ): Promise<RouteResult> {
    return requestAbsolute(method, `/api/admin/applications${path}`, permissions, body);
  }

  function statusOf(result: RouteResult): number {
    if (result.error === undefined) return result.context.status;
    const status = Reflect.get(result.error, 'status');
    return typeof status === 'number' ? status : 500;
  }

  function bodyOf(result: RouteResult): unknown {
    return result.context.body;
  }

  function dataOf(result: RouteResult): ResourceServerBody {
    const body = bodyOf(result);
    if (typeof body !== 'object' || body === null || !('data' in body)) {
      throw new Error('Expected a data response');
    }
    const data = Reflect.get(body, 'data');
    if (typeof data !== 'object' || data === null) throw new Error('Expected a data object');
    return data as ResourceServerBody;
  }

  function collectionOf(result: RouteResult): ResourceServerBody[] {
    const body = bodyOf(result);
    if (typeof body !== 'object' || body === null || !('data' in body)) {
      throw new Error('Expected a data response');
    }
    const data = Reflect.get(body, 'data');
    if (!Array.isArray(data)) throw new Error('Expected a data array');
    return data as ResourceServerBody[];
  }

  function appPath(app: Application, suffix = ''): string {
    return `/${app.id}/resource-servers${suffix}`;
  }

  function appSlugPath(app: Application, suffix = ''): string {
    return `/${app.slug}/resource-servers${suffix}`;
  }

  function resourcePath(app: Application, resourceServerId: string): string {
    return appPath(app, `/${resourceServerId}`);
  }

  async function createResource(
    app: Application,
    input: Record<string, unknown>,
    permissions: readonly string[] = [WRITE],
  ): Promise<RouteResult> {
    return request('POST', appPath(app), permissions, input);
  }

  async function auditCount(): Promise<number> {
    const result = await getPool().query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM audit_log
        WHERE event_type = 'admin.mutation.committed'`,
    );
    return result.rows[0]?.count ?? 0;
  }

  it('returns an empty list when the application has no resource servers', async () => {
    const result = await request('GET', appPath(appA), [READ]);

    expect(statusOf(result)).toBe(200);
    expect(collectionOf(result)).toEqual([]);
  });

  it('lists resource servers ordered by name and then identifier', async () => {
    const first = await createResource(appA, {
      name: 'Zulu API',
      identifier: `https://zulu-${randomUUID()}.example.test`,
    });
    const second = await createResource(appA, {
      name: 'Alpha API',
      identifier: `https://alpha-${randomUUID()}.example.test`,
    });
    expect(statusOf(first)).toBe(201);
    expect(statusOf(second)).toBe(201);

    const result = await request('GET', appPath(appA), [READ]);
    expect(statusOf(result)).toBe(200);
    expect(collectionOf(result).map((row) => row.name)).toEqual(['Alpha API', 'Zulu API']);
  });

  it('creates a resource server with the identifier as the default audience', async () => {
    const identifier = `https://billing-${randomUUID()}.example.test`;
    const result = await createResource(appA, { name: 'Billing API', identifier });

    expect(statusOf(result)).toBe(201);
    const created = dataOf(result);
    expect(created).toMatchObject({
      applicationId: appA.id,
      name: 'Billing API',
      identifier,
      audience: identifier,
      scopes: [],
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(created.slug).toMatch(/^billing-api/);
  });

  it('returns custom scopes sorted after creation', async () => {
    const result = await createResource(appA, {
      name: 'Billing API',
      identifier: `https://billing-${randomUUID()}.example.test`,
      scopes: ['billing:write', 'billing:read'],
    });

    expect(statusOf(result)).toBe(201);
    expect(dataOf(result).scopes).toEqual(['billing:read', 'billing:write']);
  });

  it('rejects duplicate identifier, audience, and application-local slug', async () => {
    const identifier = `https://duplicate-${randomUUID()}.example.test`;
    const audience = `https://audience-${randomUUID()}.example.test`;
    const slug = `shared-slug-${randomUUID().slice(0, 8)}`;

    expect(statusOf(await createResource(appA, { name: 'One', slug, identifier }))).toBe(201);
    expect(statusOf(await createResource(appA, { name: 'Two', slug, identifier: `https://two-${randomUUID()}.example.test` }))).toBe(409);
    expect(statusOf(await createResource(appB, { name: 'Three', identifier }))).toBe(409);
    expect(statusOf(await createResource(appA, { name: 'Four', identifier: `https://four-${randomUUID()}.example.test`, audience }))).toBe(201);
    expect(statusOf(await createResource(appB, { name: 'Five', identifier: `https://five-${randomUUID()}.example.test`, audience }))).toBe(409);
    expect(statusOf(await createResource(appB, { name: 'Six', slug, identifier: `https://six-${randomUUID()}.example.test` }))).toBe(201);
  });

  it.each([
    ['relative', 'billing'],
    ['fragment', 'https://billing.example.test/#fragment'],
    ['too long', `https://billing.example.test/${'a'.repeat(2049)}`],
  ])('rejects a %s identifier', async (_label, identifier) => {
    const result = await createResource(appA, { name: 'Billing API', identifier });

    expect(statusOf(result)).toBe(400);
    expect(bodyOf(result)).toEqual({ error: 'Resource server request is invalid' });
  });

  it('rejects standard OIDC scopes and duplicate custom scopes', async () => {
    const identifier = `https://billing-${randomUUID()}.example.test`;
    expect(statusOf(await createResource(appA, { name: 'Billing API', identifier, scopes: ['openid'] }))).toBe(400);
    expect(statusOf(await createResource(appA, { name: 'Billing API', identifier: `https://other-${randomUUID()}.example.test`, scopes: ['billing:read', 'billing:read'] }))).toBe(400);
  });

  it('resets the audience to the identifier when update omits it', async () => {
    const identifier = `https://billing-${randomUUID()}.example.test`;
    const audience = `https://api-${randomUUID()}.example.test`;
    const created = dataOf(await createResource(appA, { name: 'Billing API', identifier, audience }));
    expect(created.audience).toBe(audience);

    const result = await request('PUT', resourcePath(appA, created.id), [WRITE], {
      name: created.name,
      slug: created.slug,
      identifier: created.identifier,
    });

    expect(statusOf(result)).toBe(200);
    expect(dataOf(result).audience).toBe(identifier);
  });

  it('replaces the complete scope registry on update', async () => {
    const created = dataOf(await createResource(appA, {
      name: 'Billing API',
      identifier: `https://billing-${randomUUID()}.example.test`,
      scopes: ['billing:read', 'billing:write'],
    }));

    const one = await request('PUT', resourcePath(appA, created.id), [WRITE], {
      name: created.name,
      slug: created.slug,
      identifier: created.identifier,
      scopes: ['billing:read'],
    });
    expect(statusOf(one)).toBe(200);
    expect(dataOf(one).scopes).toEqual(['billing:read']);

    const none = await request('PUT', resourcePath(appA, created.id), [WRITE], {
      name: created.name,
      slug: created.slug,
      identifier: created.identifier,
    });
    expect(statusOf(none)).toBe(200);
    expect(dataOf(none).scopes).toEqual([]);
  });

  it('returns 404 for a resource server owned by another application', async () => {
    const created = dataOf(await createResource(appA, {
      name: 'Billing API',
      identifier: `https://billing-${randomUUID()}.example.test`,
    }));

    for (const [method, body] of [
      ['GET', undefined],
      ['PUT', { name: created.name, slug: created.slug, identifier: created.identifier }],
      ['DELETE', undefined],
    ] as const) {
      const result = await request(method, resourcePath(appB, created.id), method === 'GET' ? [READ] : [WRITE], body);
      expect(statusOf(result)).toBe(404);
      expect(bodyOf(result)).toEqual({ error: 'Resource server not found' });
    }
  });

  it('hard deletes the resource server, its scopes, and its namespace entries', async () => {
    const created = dataOf(await createResource(appA, {
      name: 'Billing API',
      identifier: `https://billing-${randomUUID()}.example.test`,
      scopes: ['billing:read'],
    }));

    const deleted = await request('DELETE', resourcePath(appA, created.id), [WRITE]);
    expect(statusOf(deleted)).toBe(204);

    const parent = await getPool().query('SELECT id FROM resource_servers WHERE id = $1', [created.id]);
    const scopes = await getPool().query('SELECT scope FROM resource_server_scopes WHERE resource_server_id = $1', [created.id]);
    const namespace = await getPool().query('SELECT value FROM resource_server_namespace WHERE resource_server_id = $1', [created.id]);
    expect(parent.rows).toHaveLength(0);
    expect(scopes.rows).toHaveLength(0);
    expect(namespace.rows).toHaveLength(0);
    expect(collectionOf(await request('GET', appPath(appA), [READ]))).toEqual([]);
  });

  it('makes the deleted identifier invalid for provider resolution', async () => {
    const identifier = `https://billing-${randomUUID()}.example.test`;
    const created = dataOf(await createResource(appA, { name: 'Billing API', identifier }));
    expect(statusOf(await request('DELETE', resourcePath(appA, created.id), [WRITE]))).toBe(204);

    await expect(
      resolveResourceServerInfo({
        applicationId: appA.id,
        identifier,
        accessTokenTTL: 900,
      }),
    ).rejects.toBeInstanceOf(errors.InvalidTarget);
  });

  it('enforces read and write permissions without mutating on denial', async () => {
    const readDenied = await request('GET', appPath(appA), []);
    expect(statusOf(readDenied)).toBe(403);

    const before = await getPool().query<{ count: number }>('SELECT count(*)::integer AS count FROM resource_servers');
    const writeDenied = await createResource(appA, {
      name: 'Billing API',
      identifier: `https://billing-${randomUUID()}.example.test`,
    }, [READ]);
    expect(statusOf(writeDenied)).toBe(403);
    const after = await getPool().query<{ count: number }>('SELECT count(*)::integer AS count FROM resource_servers');
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it('writes one audit row per successful mutation and none for validation failure', async () => {
    const before = await auditCount();
    const created = dataOf(await createResource(appA, {
      name: 'Billing API',
      identifier: `https://billing-${randomUUID()}.example.test`,
    }));
    expect(await auditCount()).toBe(before + 1);

    expect(statusOf(await createResource(appA, { name: 'Invalid', identifier: 'relative' }))).toBe(400);
    expect(await auditCount()).toBe(before + 1);

    expect(statusOf(await request('PUT', resourcePath(appA, created.id), [WRITE], {
      name: created.name,
      slug: created.slug,
      identifier: created.identifier,
      scopes: ['billing:read'],
    }))).toBe(200);
    expect(await auditCount()).toBe(before + 2);

    expect(statusOf(await request('DELETE', resourcePath(appA, created.id), [WRITE]))).toBe(204);
    expect(await auditCount()).toBe(before + 3);
  });

  it('accepts application UUID and slug and resource-server UUID and slug', async () => {
    const identifier = `https://billing-${randomUUID()}.example.test`;
    const created = dataOf(await createResource(appA, { name: 'Billing API', identifier }));

    expect(statusOf(await request('GET', appSlugPath(appA), [READ]))).toBe(200);
    expect(statusOf(await request('GET', appSlugPath(appA, `/${created.slug}`), [READ]))).toBe(200);
    expect(statusOf(await request('GET', appPath(appA, `/${created.slug}`), [READ]))).toBe(200);
  });

  it('requires name, slug, and identifier on update', async () => {
    const created = dataOf(await createResource(appA, {
      name: 'Billing API',
      identifier: `https://billing-${randomUUID()}.example.test`,
      scopes: ['billing:read'],
    }));

    const result = await request('PUT', resourcePath(appA, created.id), [WRITE], { name: 'Renamed' });
    expect(statusOf(result)).toBe(400);
    expect(bodyOf(result)).toEqual({ error: 'Resource server request is invalid' });

    const current = await request('GET', resourcePath(appA, created.id), [READ]);
    expect(dataOf(current).name).toBe('Billing API');
    expect(dataOf(current).scopes).toEqual(['billing:read']);
  });

  it('rejects an identifier that collides with another application audience', async () => {
    const shared = `https://shared-${randomUUID()}.example.test`;
    expect(statusOf(await createResource(appA, {
      name: 'A API',
      identifier: shared,
    }))).toBe(201);

    const result = await createResource(appB, {
      name: 'B API',
      identifier: `https://b-${randomUUID()}.example.test`,
      audience: shared,
    });

    expect(statusOf(result)).toBe(409);
    expect(bodyOf(result)).toEqual({
      error: 'Resource server conflicts with an existing identifier, audience, or slug',
    });
  });

  it('treats a null audience as the identifier', async () => {
    const identifier = `https://billing-${randomUUID()}.example.test`;
    const result = await createResource(appA, { name: 'Billing API', identifier, audience: null });

    expect(statusOf(result)).toBe(201);
    expect(dataOf(result).audience).toBe(identifier);
  });

  it.each(['Billing\nAPI', 'Billing\u001bAPI', 'Billing\u0000API'])(
    'rejects control characters in the name %j',
    async (name) => {
      const result = await createResource(appA, {
        name,
        identifier: `https://billing-${randomUUID()}.example.test`,
      });
      expect(statusOf(result)).toBe(400);
      expect(bodyOf(result)).toEqual({ error: 'Resource server request is invalid' });
    },
  );

  it.each([
    'HTTPS://billing.example.test',
    ' https://billing.example.test',
    'https://billing.example.test ',
    'https://billing.example.test/\n',
    'https://billing.example.test/\u0000',
  ])('rejects the non-canonical URI %j', async (identifier) => {
    const result = await createResource(appA, { name: 'Billing API', identifier });
    expect(statusOf(result)).toBe(400);
    expect(bodyOf(result)).toEqual({ error: 'Resource server request is invalid' });
  });

  it('rejects a UUID-shaped resource-server slug', async () => {
    const result = await createResource(appA, {
      name: 'Billing API',
      slug: '11111111-1111-4111-8111-111111111111',
      identifier: `https://billing-${randomUUID()}.example.test`,
    });
    expect(statusOf(result)).toBe(400);
    expect(bodyOf(result)).toEqual({ error: 'Resource server request is invalid' });
  });

  it('rejects a create whose generated slug is reserved', async () => {
    const result = await createResource(appA, {
      name: 'API',
      identifier: `https://billing-${randomUUID()}.example.test`,
    });
    expect(statusOf(result)).toBe(400);
    expect(bodyOf(result)).toEqual({ error: 'Resource server request is invalid' });
  });

  it('rejects malformed route identifiers with a fixed 400', async () => {
    const list = await request('GET', '/!/resource-servers', [READ]);
    expect(statusOf(list)).toBe(400);
    expect(bodyOf(list)).toEqual({ error: 'Resource server request is invalid' });

    const created = dataOf(await createResource(appA, {
      name: 'Billing API',
      identifier: `https://billing-${randomUUID()}.example.test`,
    }));
    const get = await request('GET', `${appPath(appA)}/!`, [READ]);
    expect(statusOf(get)).toBe(400);
    expect(bodyOf(get)).toEqual({ error: 'Resource server request is invalid' });
    expect(created.id).toBeTruthy();
  });

  it('rejects an update that collides with another resource server and rolls back', async () => {
    const first = dataOf(await createResource(appA, {
      name: 'First API',
      identifier: `https://first-${randomUUID()}.example.test`,
    }));
    const second = dataOf(await createResource(appA, {
      name: 'Second API',
      identifier: `https://second-${randomUUID()}.example.test`,
    }));

    const result = await request('PUT', resourcePath(appA, first.id), [WRITE], {
      name: first.name,
      slug: first.slug,
      identifier: second.identifier,
      scopes: ['billing:read'],
    });

    expect(statusOf(result)).toBe(409);
    const current = dataOf(await request('GET', resourcePath(appA, first.id), [READ]));
    expect(current.identifier).toBe(first.identifier);
    expect(current.scopes).toEqual([]);
  });

  it('creates through an application slug and updates/deletes through a resource slug', async () => {
    const identifier = `https://billing-${randomUUID()}.example.test`;
    const created = dataOf(await request('POST', appSlugPath(appA), [WRITE], {
      name: 'Billing API',
      identifier,
    }));

    const updated = await request('PUT', `${appPath(appA)}/${created.slug}`, [WRITE], {
      name: 'Billing API Updated',
      slug: created.slug,
      identifier,
      scopes: ['billing:read'],
    });
    expect(statusOf(updated)).toBe(200);
    expect(dataOf(updated).name).toBe('Billing API Updated');

    const deleted = await request('DELETE', `${appPath(appA)}/${created.slug}`, [WRITE]);
    expect(statusOf(deleted)).toBe(204);
  });

  it('requires the correct permission on every route', async () => {
    const created = dataOf(await createResource(appA, {
      name: 'Billing API',
      identifier: `https://billing-${randomUUID()}.example.test`,
    }));

    expect(statusOf(await request('GET', appPath(appA), []))).toBe(403);
    expect(statusOf(await request('GET', resourcePath(appA, created.id), []))).toBe(403);
    expect(statusOf(await request('POST', appPath(appA), [], {
      name: 'Denied API',
      identifier: `https://denied-${randomUUID()}.example.test`,
    }))).toBe(403);
    expect(statusOf(await request('PUT', resourcePath(appA, created.id), [], {
      name: created.name,
      slug: created.slug,
      identifier: created.identifier,
    }))).toBe(403);
    expect(statusOf(await request('DELETE', resourcePath(appA, created.id), []))).toBe(403);
    expect(dataOf(await request('GET', resourcePath(appA, created.id), [READ])).id).toBe(created.id);
  });

  it('audits a mixed-case admin path instead of bypassing the mutation transaction', async () => {
    const before = await auditCount();
    const result = await requestAbsolute(
      'POST',
      `/Api/Admin/applications/${appA.id}/resource-servers`,
      [WRITE],
      {
        name: 'Mixed Case API',
        identifier: `https://mixed-${randomUUID()}.example.test`,
      },
    );

    expect(statusOf(result)).toBe(201);
    expect(await auditCount()).toBe(before + 1);
  });

  it('removes distinct identifier and audience namespace entries and frees them', async () => {
    const identifier = `https://reuse-${randomUUID()}.example.test`;
    const audience = `https://reuse-aud-${randomUUID()}.example.test`;
    const created = dataOf(await createResource(appA, { name: 'Reusable API', identifier, audience }));
    const otherIdentifier = `https://other-${randomUUID()}.example.test`;
    await createResource(appB, { name: 'Other API', identifier: otherIdentifier });

    expect(statusOf(await request('DELETE', resourcePath(appA, created.id), [WRITE]))).toBe(204);
    const removed = await getPool().query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM resource_server_namespace WHERE resource_server_id = $1',
      [created.id],
    );
    expect(removed.rows[0]?.count).toBe(0);

    const reuse = await createResource(appB, { name: 'Reused API', identifier, audience });
    expect(statusOf(reuse)).toBe(201);
  });

  it('leaves an already-issued token row intact when the resource server is deleted', async () => {
    const identifier = `https://token-${randomUUID()}.example.test`;
    const created = dataOf(await createResource(appA, { name: 'Token API', identifier }));
    const tokenId = randomUUID();
    await getPool().query(
      `INSERT INTO oidc_payloads (id, type, payload, expires_at)
       VALUES ($1, 'AccessToken', $2, NOW() + INTERVAL '1 hour')`,
      [tokenId, { aud: identifier }],
    );

    expect(statusOf(await request('DELETE', resourcePath(appA, created.id), [WRITE]))).toBe(204);
    const token = await getPool().query('SELECT id FROM oidc_payloads WHERE id = $1 AND type = $2', [
      tokenId,
      'AccessToken',
    ]);
    expect(token.rows).toHaveLength(1);
  });

  it('records actor, method, and route template on the successful mutation audit', async () => {
    await createResource(appA, {
      name: 'Audited API',
      identifier: `https://audited-${randomUUID()}.example.test`,
    });

    const result = await getPool().query<{
      actor_id: string;
      metadata: { method?: unknown; routeTemplate?: unknown };
    }>(
      `SELECT actor_id, metadata FROM audit_log
        WHERE event_type = 'admin.mutation.committed'
        ORDER BY created_at DESC LIMIT 1`,
    );
    const row = result.rows[0];
    expect(row?.actor_id).toBe(actorId);
    expect(row?.metadata.method).toBe('POST');
    expect(typeof row?.metadata.routeTemplate === 'string').toBe(true);
    expect(row?.metadata.routeTemplate).toContain('resource-servers');
  });
});
