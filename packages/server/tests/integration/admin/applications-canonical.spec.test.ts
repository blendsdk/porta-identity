/**
 * Specification tests for the canonical Porta Admin application boundary.
 *
 * The canonical `porta-admin` application owns Porta's control-plane roles, permissions, modules
 * and clients. It must stay readable through the Admin API but must not be mutable through the
 * ordinary application and module routes. These tests exercise the real router and the request
 * transaction middleware against PostgreSQL, substituting only the authenticated administrator.
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import Koa from 'koa';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { ADMIN_PERMISSIONS } from '../../../src/lib/admin-permissions.js';
import { findSuperAdminOrganization } from '../../../src/organizations/repository.js';
import type { Application, ApplicationModule } from '../../../src/applications/types.js';
import { insertModule } from '../../../src/applications/repository.js';
import { createTestApplication, createTestUser } from '../helpers/factories.js';
import { seedBaseData, truncateAllTables } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';

vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: object, next: () => Promise<void>) => next(),
}));

import { createApplicationRouter } from '../../../src/routes/applications.js';
import { adminMutationAudit } from '../../../src/middleware/admin-mutation-audit.js';

interface RouteResult {
  readonly context: Koa.Context;
  readonly error?: unknown;
}

const ACTOR_EMAIL = 'canonical-app-spec@integration.example';

describe('canonical Porta Admin application protection', () => {
  let actorId: string;
  let organizationId: string;
  let canonical: Application;
  let canonicalModule: ApplicationModule;
  let normal: Application;
  let normalModule: ApplicationModule;

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();

    const organization = await findSuperAdminOrganization();
    if (!organization) throw new Error('Control-plane seed is missing');
    organizationId = organization.id;
    actorId = (await createTestUser(organizationId, { email: ACTOR_EMAIL })).id;

    canonical = await createTestApplication({ name: 'Porta Admin', slug: 'porta-admin' });
    canonicalModule = await insertModule({
      applicationId: canonical.id,
      name: 'Canonical Module',
      slug: 'canonical-module',
    });
    normal = await createTestApplication({ name: 'Normal Application' });
    normalModule = await insertModule({
      applicationId: normal.id,
      name: 'Billing',
      slug: 'billing',
    });
  });

  /**
   * Dispatch one real Admin API request.
   *
   * Mutations run through the real request transaction middleware; reads run directly. Only the
   * authenticated identity and its permissions are substituted.
   *
   * @param method - HTTP method
   * @param path - Path below `/api/admin/applications`
   * @param permission - One admin permission granted to the substituted actor
   * @param body - Optional request body
   * @returns The completed context and any thrown public HTTP error
   */
  async function request(
    method: string,
    path: string,
    permission: string,
    body?: unknown,
  ): Promise<RouteResult> {
    const incoming = new IncomingMessage(new Socket());
    incoming.method = method;
    incoming.url = `/api/admin/applications${path}`;
    const context = new Koa().createContext(incoming, new ServerResponse(incoming));
    if (body !== undefined) context.request.body = body;
    context.state = {
      requestId: 'canonical-app-spec',
      adminUser: {
        id: actorId,
        email: ACTOR_EMAIL,
        organizationId,
        roles: [],
        permissions: [permission],
      },
    };

    const dispatch = () => createApplicationRouter().routes()(context, async () => undefined);

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

  /** Resolve the response status from either a completed context or a thrown public error. */
  function statusOf(result: RouteResult): number {
    if (result.error === undefined) return result.context.status;
    const status = Reflect.get(result.error, 'status');
    if (typeof status === 'number') return status;
    throw result.error;
  }

  /** Read the durable application row, bypassing every cache. */
  async function applicationRow(id: string): Promise<{ name: string; status: string } | undefined> {
    const result = await getPool().query<{ name: string; status: string }>(
      'SELECT name, status FROM applications WHERE id = $1',
      [id],
    );
    return result.rows[0];
  }

  /** Read the durable module row, bypassing every cache. */
  async function moduleRow(id: string): Promise<{ name: string; status: string } | undefined> {
    const result = await getPool().query<{ name: string; status: string }>(
      'SELECT name, status FROM application_modules WHERE id = $1',
      [id],
    );
    return result.rows[0];
  }

  /** Count the modules owned by one application. */
  async function moduleCount(applicationId: string): Promise<number> {
    const result = await getPool().query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM application_modules WHERE application_id = $1',
      [applicationId],
    );
    return Number(result.rows[0]?.count ?? '0');
  }

  it('rejects every mutation of the canonical application without changing state', async () => {
    const update = await request('PUT', `/${canonical.id}`, ADMIN_PERMISSIONS.APP_UPDATE, {
      name: 'Renamed Control Plane',
    });
    expect(statusOf(update)).toBe(400);
    expect(await applicationRow(canonical.id)).toMatchObject({
      name: 'Porta Admin',
      status: 'active',
    });

    const deactivate = await request(
      'POST',
      `/${canonical.id}/deactivate`,
      ADMIN_PERMISSIONS.APP_UPDATE,
    );
    expect(statusOf(deactivate)).toBe(400);
    expect((await applicationRow(canonical.id))?.status).toBe('active');

    await getPool().query("UPDATE applications SET status = 'inactive' WHERE id = $1", [
      canonical.id,
    ]);
    const activate = await request(
      'POST',
      `/${canonical.id}/activate`,
      ADMIN_PERMISSIONS.APP_UPDATE,
    );
    expect(statusOf(activate)).toBe(400);
    expect((await applicationRow(canonical.id))?.status).toBe('inactive');

    const remove = await request('DELETE', `/${canonical.id}`, ADMIN_PERMISSIONS.APP_DELETE);
    expect(statusOf(remove)).toBe(400);
    expect(await applicationRow(canonical.id)).toBeDefined();
  });

  it('rejects every mutation of a canonical application module without changing state', async () => {
    const before = await moduleCount(canonical.id);

    const create = await request('POST', `/${canonical.id}/modules`, ADMIN_PERMISSIONS.APP_UPDATE, {
      name: 'Injected Module',
      slug: 'injected-module',
    });
    expect(statusOf(create)).toBe(400);
    expect(await moduleCount(canonical.id)).toBe(before);

    const update = await request(
      'PUT',
      `/${canonical.id}/modules/${canonicalModule.id}`,
      ADMIN_PERMISSIONS.APP_UPDATE,
      { name: 'Renamed Module' },
    );
    expect(statusOf(update)).toBe(400);
    expect((await moduleRow(canonicalModule.id))?.name).toBe('Canonical Module');

    const deactivate = await request(
      'POST',
      `/${canonical.id}/modules/${canonicalModule.id}/deactivate`,
      ADMIN_PERMISSIONS.APP_UPDATE,
    );
    expect(statusOf(deactivate)).toBe(400);
    expect((await moduleRow(canonicalModule.id))?.status).toBe('active');

    await getPool().query("UPDATE application_modules SET status = 'inactive' WHERE id = $1", [
      canonicalModule.id,
    ]);
    const activate = await request(
      'POST',
      `/${canonical.id}/modules/${canonicalModule.id}/activate`,
      ADMIN_PERMISSIONS.APP_UPDATE,
    );
    expect(statusOf(activate)).toBe(400);
    expect((await moduleRow(canonicalModule.id))?.status).toBe('inactive');

    const remove = await request(
      'DELETE',
      `/${canonical.id}/modules/${canonicalModule.id}`,
      ADMIN_PERMISSIONS.MODULE_DELETE,
    );
    expect(statusOf(remove)).toBe(400);
    expect(await moduleRow(canonicalModule.id)).toBeDefined();
  });

  it('keeps the canonical application and its modules readable', async () => {
    const list = await request('GET', '', ADMIN_PERMISSIONS.APP_READ);
    expect(statusOf(list)).toBe(200);
    expect(
      (list.context.body as { data: Application[] }).data.map((application) => application.id),
    ).toContain(canonical.id);

    const get = await request('GET', `/${canonical.id}`, ADMIN_PERMISSIONS.APP_READ);
    expect(statusOf(get)).toBe(200);
    expect((get.context.body as { data: Application }).data.id).toBe(canonical.id);

    const modules = await request('GET', `/${canonical.id}/modules`, ADMIN_PERMISSIONS.APP_READ);
    expect(statusOf(modules)).toBe(200);
    expect(
      (modules.context.body as { data: ApplicationModule[] }).data.map((module) => module.id),
    ).toContain(canonicalModule.id);
  });

  it('keeps ordinary applications and modules mutable', async () => {
    expect(
      statusOf(
        await request('PUT', `/${normal.id}`, ADMIN_PERMISSIONS.APP_UPDATE, {
          name: 'Updated Application',
        }),
      ),
    ).toBe(200);
    expect((await applicationRow(normal.id))?.name).toBe('Updated Application');

    expect(
      statusOf(await request('POST', `/${normal.id}/deactivate`, ADMIN_PERMISSIONS.APP_UPDATE)),
    ).toBe(204);
    expect((await applicationRow(normal.id))?.status).toBe('inactive');
    expect(
      statusOf(await request('POST', `/${normal.id}/activate`, ADMIN_PERMISSIONS.APP_UPDATE)),
    ).toBe(204);
    expect((await applicationRow(normal.id))?.status).toBe('active');

    const create = await request('POST', `/${normal.id}/modules`, ADMIN_PERMISSIONS.APP_UPDATE, {
      name: 'CRM',
      slug: 'crm',
    });
    expect(statusOf(create)).toBe(201);
    const createdModuleId = (create.context.body as { data: ApplicationModule }).data.id;
    expect(await moduleRow(createdModuleId)).toMatchObject({ name: 'CRM', status: 'active' });

    expect(
      statusOf(
        await request(
          'PUT',
          `/${normal.id}/modules/${normalModule.id}`,
          ADMIN_PERMISSIONS.APP_UPDATE,
          { name: 'Billing Updated' },
        ),
      ),
    ).toBe(200);
    expect((await moduleRow(normalModule.id))?.name).toBe('Billing Updated');

    expect(
      statusOf(
        await request(
          'POST',
          `/${normal.id}/modules/${normalModule.id}/deactivate`,
          ADMIN_PERMISSIONS.APP_UPDATE,
        ),
      ),
    ).toBe(204);
    expect((await moduleRow(normalModule.id))?.status).toBe('inactive');
    expect(
      statusOf(
        await request(
          'POST',
          `/${normal.id}/modules/${normalModule.id}/activate`,
          ADMIN_PERMISSIONS.APP_UPDATE,
        ),
      ),
    ).toBe(204);
    expect((await moduleRow(normalModule.id))?.status).toBe('active');

    expect(
      statusOf(
        await request(
          'DELETE',
          `/${normal.id}/modules/${normalModule.id}`,
          ADMIN_PERMISSIONS.MODULE_DELETE,
        ),
      ),
    ).toBe(204);
    expect(await moduleRow(normalModule.id)).toBeUndefined();

    expect(statusOf(await request('DELETE', `/${normal.id}`, ADMIN_PERMISSIONS.APP_DELETE))).toBe(
      204,
    );
    expect(await applicationRow(normal.id)).toBeUndefined();
  });
});
