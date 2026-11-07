/** Fixed route mappings for the admin connected-apps surface. */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  listConnectedApps: vi.fn(),
  revokeConnectedApp: vi.fn(),
}));

vi.mock('../../../src/connected-apps/service.js', () => service);

import { createConnectedAppsRouter } from '../../../src/routes/connected-apps.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const grantId = '33333333-3333-4333-8333-333333333333';

/** Returns the terminal handler for one method/path pair. */
function handler(method: 'GET' | 'DELETE') {
  const router = createConnectedAppsRouter();
  const layer = router.stack.find((candidate) =>
    candidate.methods.includes(method) &&
    candidate.path ===
      '/api/admin/organizations/:orgId/users/:userId/connected-apps' +
        (method === 'DELETE' ? '/:grantId' : ''),
  );
  if (!layer) throw new Error(`Missing ${method} connected-apps route`);
  return layer.stack[layer.stack.length - 1]!;
}

/** Minimal Koa context accepted by the route handlers. */
interface Context {
  params: Record<string, string>;
  status: number;
  body: unknown;
}

/** Executes one handler and returns its public context. */
async function invoke(
  method: 'GET' | 'DELETE',
  params: Record<string, string>,
): Promise<Context> {
  const ctx: Context = { params, status: 200, body: undefined };
  await handler(method)(ctx as never, async () => undefined);
  return ctx;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('connected-apps route', () => {
  it('returns the user list under a data envelope', async () => {
    service.listConnectedApps.mockResolvedValue([{ grantId }]);

    const ctx = await invoke('GET', { orgId: organizationId, userId });

    expect(ctx.status).toBe(200);
    expect(ctx.body).toEqual({ data: [{ grantId }] });
    expect(service.listConnectedApps).toHaveBeenCalledWith(organizationId, userId);
  });

  it('rejects malformed identifiers with a fixed 400 body', async () => {
    const ctx = await invoke('GET', { orgId: 'not-an-org', userId });

    expect(ctx.status).toBe(400);
    expect(ctx.body).toEqual({ error: 'Connected app request is invalid' });
    expect(service.listConnectedApps).not.toHaveBeenCalled();
  });

  it('returns 404 for a grant outside the user and organization', async () => {
    service.revokeConnectedApp.mockResolvedValue(false);

    const ctx = await invoke('DELETE', { orgId: organizationId, userId, grantId });

    expect(ctx.status).toBe(404);
    expect(ctx.body).toEqual({ error: 'Connected app not found' });
  });

  it('returns 204 after a successful revoke', async () => {
    service.revokeConnectedApp.mockResolvedValue(true);

    const ctx = await invoke('DELETE', { orgId: organizationId, userId, grantId });

    expect(ctx.status).toBe(204);
    expect(service.revokeConnectedApp).toHaveBeenCalledWith(organizationId, userId, grantId);
  });

  it('maps an unexpected storage failure to a fixed 503 body', async () => {
    service.listConnectedApps.mockRejectedValue(new Error('database detail'));

    const ctx = await invoke('GET', { orgId: organizationId, userId });

    expect(ctx.status).toBe(503);
    expect(ctx.body).toEqual({ error: 'Connected app operation failed' });
  });
});
