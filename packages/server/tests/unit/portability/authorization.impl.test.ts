import Koa from 'koa';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  requirePortabilityAuthorization,
  type PortabilityCategory,
} from '../../../src/portability/index.js';

const openServers = new Set<Server>();

/** Close every ephemeral server even when an assertion fails. */
afterEach(async () => {
  await Promise.all(
    [...openServers].map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
  openServers.clear();
});

interface AuthorizationRequest {
  /** Roles assigned to the test administrator. */
  readonly roles: readonly string[];
  /** Permissions assigned to the test administrator. */
  readonly permissions: readonly string[];
  /** Request body inspected for environment scope. */
  readonly body: unknown;
  /** Categories returned by the route's validated-category reader. */
  readonly categories: readonly PortabilityCategory[] | undefined;
}

/** Exercise the middleware through a real Koa context and HTTP response. */
async function authorize(request: AuthorizationRequest): Promise<Response> {
  const app = new Koa();
  app.use(async (context, next) => {
    context.state.adminUser = {
      id: 'admin-user',
      email: 'admin@example.test',
      organizationId: 'control-plane',
      roles: [...request.roles],
      permissions: [...request.permissions],
    };
    context.request.body = request.body;
    await next();
  });
  app.use(requirePortabilityAuthorization('export', () => request.categories));
  app.use((context) => {
    context.status = 204;
  });
  const server = app.listen(0, '127.0.0.1');
  openServers.add(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Missing test server port');
  return fetch(`http://127.0.0.1:${address.port}`);
}

describe('portability authorization middleware implementation', () => {
  const organizationPermissions = ['admin:export:read', 'admin:org:read'];

  it('should reject unavailable categories before calling the protected operation', async () => {
    const response = await authorize({
      roles: ['porta-super-admin'],
      permissions: organizationPermissions,
      body: { scope: { kind: 'organization', organization_slug: 'acme' } },
      categories: undefined,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual({
      error: 'Invalid export request',
      code: 'export_request_invalid',
    });
  });

  it('should reject a missing category permission', async () => {
    const response = await authorize({
      roles: ['porta-super-admin'],
      permissions: ['admin:export:read'],
      body: { scope: { kind: 'organization', organization_slug: 'acme' } },
      categories: ['organizations'],
    });

    expect(response.status).toBe(403);
  });

  it('should reject the legacy admin role for environment scope', async () => {
    const response = await authorize({
      roles: ['porta-admin'],
      permissions: organizationPermissions,
      body: { scope: { kind: 'environment' } },
      categories: ['organizations'],
    });

    expect(response.status).toBe(403);
  });

  it('should allow the exact super-admin role for environment scope', async () => {
    const response = await authorize({
      roles: ['porta-super-admin'],
      permissions: organizationPermissions,
      body: { scope: { kind: 'environment' } },
      categories: ['organizations'],
    });

    expect(response.status).toBe(204);
  });

  it('should allow selected-organization scope without a super-admin role', async () => {
    const response = await authorize({
      roles: ['porta-auditor'],
      permissions: organizationPermissions,
      body: { scope: { kind: 'organization', organization_slug: 'acme' } },
      categories: ['organizations'],
    });

    expect(response.status).toBe(204);
  });
});
