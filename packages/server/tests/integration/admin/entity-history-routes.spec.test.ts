/**
 * Route-level specification tests for application and client history.
 *
 * These tests exercise the real Admin routers against PostgreSQL. Only the authenticated
 * administrator is substituted, so permission checks, entity resolution, audit metadata scoping, and
 * the response envelope are verified end to end.
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import Koa from 'koa';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findSuperAdminOrganization } from '../../../src/organizations/repository.js';
import { ADMIN_PERMISSIONS } from '../../../src/lib/admin-permissions.js';
import { writeAuditLog } from '../../../src/lib/audit-log.js';
import { createTestApplication, createTestClient, createTestUser } from '../helpers/factories.js';
import { seedBaseData, truncateAllTables } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';

vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: object, next: () => Promise<void>) => next(),
}));

import { createApplicationRouter } from '../../../src/routes/applications.js';
import { createClientRouter } from '../../../src/routes/clients.js';

interface RouteResult {
  readonly context: Koa.Context;
  readonly error?: unknown;
}

const ACTOR_EMAIL = 'history-routes-spec@integration.example';

describe('application and client history routes', () => {
  let actorId: string;
  let organizationId: string;

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();

    const organization = await findSuperAdminOrganization();
    if (!organization) throw new Error('Control-plane seed is missing');
    organizationId = organization.id;
    actorId = (await createTestUser(organizationId, { email: ACTOR_EMAIL })).id;
  });

  /** Dispatch one application history request. */
  async function requestApplication(path: string): Promise<RouteResult> {
    return dispatch(createApplicationRouter(), ADMIN_PERMISSIONS.APP_READ, path);
  }

  /** Dispatch one client history request. */
  async function requestClient(path: string): Promise<RouteResult> {
    return dispatch(createClientRouter(), ADMIN_PERMISSIONS.CLIENT_READ, path);
  }

  /** Run one real router request with only the actor and permission substituted. */
  async function dispatch(
    router: ReturnType<typeof createApplicationRouter> | ReturnType<typeof createClientRouter>,
    permission: string,
    path: string,
  ): Promise<RouteResult> {
    const incoming = new IncomingMessage(new Socket());
    incoming.method = 'GET';
    incoming.url = `/api/admin/${path}`;
    const context = new Koa().createContext(incoming, new ServerResponse(incoming));
    context.state = {
      requestId: 'entity-history-routes-spec',
      adminUser: {
        id: actorId,
        email: ACTOR_EMAIL,
        organizationId,
        roles: [],
        permissions: [permission],
      },
    };

    try {
      await router.routes()(context, async () => undefined);
      return { context };
    } catch (error) {
      return { context, error };
    }
  }

  /** Resolve a completed or rejected request status. */
  function statusOf(result: RouteResult): number {
    if (result.error === undefined) return result.context.status;
    const status = Reflect.get(result.error, 'status');
    if (typeof status === 'number') return status;
    throw result.error;
  }

  it('returns application history by UUID and by slug', async () => {
    const application = await createTestApplication({ name: 'History App' });
    await writeAuditLog({
      eventType: 'app.created',
      eventCategory: 'admin',
      metadata: { applicationId: application.id, slug: application.slug },
    });
    await writeAuditLog({
      eventType: 'app.module.created',
      eventCategory: 'admin',
      metadata: { applicationId: application.id, moduleId: 'module-1' },
    });

    for (const identifier of [application.id, application.slug]) {
      const response = await requestApplication(`applications/${identifier}/history`);
      expect(statusOf(response)).toBe(200);
      const body = response.context.body as {
        data: Array<{ eventType: string }>;
        hasMore: boolean;
        nextCursor: string | null;
      };
      expect(body.data.map((entry) => entry.eventType).sort()).toEqual([
        'app.created',
        'app.module.created',
      ]);
      expect(body.hasMore).toBe(false);
      expect(body.nextCursor).toBeNull();
    }
  });

  it('returns client history from both client metadata keys', async () => {
    const organization = await findSuperAdminOrganization();
    const application = await createTestApplication();
    const client = await createTestClient(organization!.id, application.id);

    await writeAuditLog({
      eventType: 'client.created',
      eventCategory: 'admin',
      metadata: { clientDbId: client.id, clientId: client.clientId },
    });
    await writeAuditLog({
      eventType: 'client.secret.generated',
      eventCategory: 'admin',
      metadata: { clientId: client.id, secretId: 'secret-1' },
    });

    const response = await requestClient(`clients/${client.id}/history`);

    expect(statusOf(response)).toBe(200);
    expect(
      (response.context.body as { data: Array<{ eventType: string }> }).data
        .map((entry) => entry.eventType)
        .sort(),
    ).toEqual(['client.created', 'client.secret.generated']);
  });

  it('keeps canonical application history readable', async () => {
    const canonical = await createTestApplication({
      name: 'Porta Admin',
      slug: 'porta-admin',
    });
    await writeAuditLog({
      eventType: 'app.created',
      eventCategory: 'admin',
      metadata: { applicationId: canonical.id },
    });

    const response = await requestApplication(`applications/${canonical.id}/history`);

    expect(statusOf(response)).toBe(200);
    expect((response.context.body as { data: unknown[] }).data).toHaveLength(1);
  });

  it('answers 404 for unknown applications and clients', async () => {
    expect(statusOf(await requestApplication('applications/missing/history'))).toBe(404);
    expect(statusOf(await requestClient(`clients/${randomUUID()}/history`))).toBe(404);
  });
});
