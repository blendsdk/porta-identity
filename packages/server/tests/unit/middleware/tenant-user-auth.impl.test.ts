/**
 * Implementation tests for tenant actor authentication.
 *
 * These tests cover the lookup order, provider fallback behavior, state
 * isolation, and the rate-limit key expected by the shared invite limiter.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  getClientByClientId: vi.fn(),
  findUserForOidc: vi.fn(),
  buildPermissionClaims: vi.fn(),
  getApplicationBySlug: vi.fn(),
  findSuperAdminOrganization: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock('../../../src/clients/service.js', () => ({
  getClientByClientId: repository.getClientByClientId,
}));

vi.mock('../../../src/users/service.js', () => ({
  findUserForOidc: repository.findUserForOidc,
}));

vi.mock('../../../src/rbac/user-role-service.js', () => ({
  buildPermissionClaims: repository.buildPermissionClaims,
}));

vi.mock('../../../src/applications/service.js', () => ({
  getApplicationBySlug: repository.getApplicationBySlug,
}));

vi.mock('../../../src/organizations/repository.js', () => ({
  findSuperAdminOrganization: repository.findSuperAdminOrganization,
}));

vi.mock('../../../src/security/decision-context.js', () => ({
  recordSecurityDecision: vi.fn(),
  recordSecurityReference: vi.fn(),
}));

vi.mock('../../../src/auth/rate-limiter.js', () => ({
  checkRateLimit: repository.checkRateLimit,
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { requireTenantActorAuth } from '../../../src/middleware/tenant-user-auth.js';
import type { TenantTokenProvider } from '../../../src/middleware/tenant-user-auth.js';
import { tenantInviteRateLimiter } from '../../../src/middleware/tenant-invite-rate-limiter.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const APP_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const CLIENT_ID = 'bff-client';

const CLIENT = {
  clientId: CLIENT_ID,
  clientName: 'Tenant BFF',
  clientType: 'confidential' as const,
  status: 'active' as const,
  organizationId: ORG_ID,
  applicationId: APP_ID,
  scope: 'org:user:read',
};

const USER = {
  id: USER_ID,
  organizationId: ORG_ID,
  email: 'user@example.test',
  givenName: 'Tenant',
  familyName: 'User',
  status: 'active' as const,
};

function createCtx() {
  let statusCode = 200;
  const ctx = {
    params: { orgId: ORG_ID },
    state: {} as Record<string, unknown>,
    get: vi.fn((name: string) => (name === 'Authorization' ? 'Bearer token' : '')),
    set: vi.fn(),
    get status() {
      return statusCode;
    },
    set status(value: number) {
      statusCode = value;
    },
    body: undefined as unknown,
    throw: vi.fn(),
  };
  return ctx;
}

beforeEach(() => {
  vi.clearAllMocks();
  repository.getClientByClientId.mockResolvedValue(CLIENT);
  repository.findUserForOidc.mockResolvedValue(USER);
  repository.buildPermissionClaims.mockResolvedValue(['org:user:read']);
  repository.getApplicationBySlug.mockResolvedValue({ id: 'admin-app', slug: 'porta-admin' });
  repository.findSuperAdminOrganization.mockResolvedValue({ id: 'admin-org' });
  repository.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 10, retryAfter: 0 });
});

describe('tenant actor auth implementation', () => {
  it('looks up a service token first and does not consult the user token when it resolves', async () => {
    const serviceFind = vi.fn().mockResolvedValue({
      clientId: CLIENT_ID,
      scopes: new Set(['org:user:read']),
    });
    const userFind = vi.fn();
    const provider: TenantTokenProvider = {
      ClientCredentials: { find: serviceFind },
      AccessToken: { find: userFind },
    };

    const ctx = createCtx();
    const next = vi.fn().mockResolvedValue(undefined);
    await requireTenantActorAuth({
      provider,
      allowedActorKinds: ['service'],
      requiredScope: 'org:user:read',
    })(ctx as never, next);

    expect(serviceFind).toHaveBeenCalledWith('token');
    expect(userFind).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('falls back to the user token when the service lookup fails', async () => {
    const serviceFind = vi.fn().mockRejectedValue(new Error('service lookup failed'));
    const userFind = vi.fn().mockResolvedValue({
      accountId: USER_ID,
      clientId: CLIENT_ID,
      scopes: new Set(['openid']),
    });
    const provider: TenantTokenProvider = {
      ClientCredentials: { find: serviceFind },
      AccessToken: { find: userFind },
    };

    const ctx = createCtx();
    const next = vi.fn().mockResolvedValue(undefined);
    await requireTenantActorAuth({
      provider,
      allowedActorKinds: ['user'],
      requiredScope: 'org:user:read',
      requiredPermission: 'org:user:read',
    })(ctx as never, next);

    expect(userFind).toHaveBeenCalledOnce();
    expect(ctx.state.tenantActor).toMatchObject({ kind: 'user', userId: USER_ID });
    expect(next).toHaveBeenCalledOnce();
  });

  it('does not fall back to a user token when a service token is valid but forbidden by the route', async () => {
    const serviceFind = vi.fn().mockResolvedValue({
      clientId: CLIENT_ID,
      scopes: new Set(['org:user:read']),
    });
    const userFind = vi.fn();
    const provider: TenantTokenProvider = {
      ClientCredentials: { find: serviceFind },
      AccessToken: { find: userFind },
    };

    const ctx = createCtx();
    const next = vi.fn();
    await requireTenantActorAuth({
      provider,
      allowedActorKinds: ['user'],
      requiredScope: 'org:user:read',
    })(ctx as never, next);

    expect(ctx.status).toBe(403);
    expect(userFind).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('does not leak one request actor into another context', async () => {
    const serviceFind = vi.fn().mockResolvedValue({
      clientId: CLIENT_ID,
      scopes: new Set(['org:user:read']),
    });
    const provider: TenantTokenProvider = {
      ClientCredentials: { find: serviceFind },
      AccessToken: { find: vi.fn() },
    };

    const first = createCtx();
    const second = createCtx();
    await requireTenantActorAuth({
      provider,
      allowedActorKinds: ['service'],
      requiredScope: 'org:user:read',
    })(first as never, vi.fn().mockResolvedValue(undefined));

    expect(first.state.tenantActor).toBeDefined();
    expect(second.state.tenantActor).toBeUndefined();
  });

  it('passes through the invite limiter without an authenticated actor', async () => {
    const ctx = createCtx();
    const next = vi.fn().mockResolvedValue(undefined);

    await tenantInviteRateLimiter()(ctx as never, next);

    expect(repository.checkRateLimit).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('keys the invite limiter by organization and client for a service actor', async () => {
    const ctx = createCtx();
    ctx.state.tenantActor = {
      kind: 'service',
      clientId: CLIENT_ID,
      clientName: 'Tenant BFF',
      applicationId: APP_ID,
      organizationId: ORG_ID,
      displayName: 'Tenant BFF',
    };
    const next = vi.fn().mockResolvedValue(undefined);

    await tenantInviteRateLimiter()(ctx as never, next);

    expect(repository.checkRateLimit).toHaveBeenCalledWith(
      `ratelimit:tenant-invite:client:${ORG_ID}:${CLIENT_ID}`,
      expect.objectContaining({ max: 30, windowSeconds: 3600 }),
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('keys the invite limiter by organization and user for a user actor', async () => {
    const ctx = createCtx();
    ctx.state.tenantActor = {
      kind: 'user',
      userId: USER_ID,
      applicationId: APP_ID,
      organizationId: ORG_ID,
      displayName: 'Tenant User',
      permissions: new Set(['org:user:invite']),
    };
    const next = vi.fn().mockResolvedValue(undefined);

    await tenantInviteRateLimiter()(ctx as never, next);

    expect(repository.checkRateLimit).toHaveBeenCalledWith(
      `ratelimit:tenant-invite:user:${ORG_ID}:${USER_ID}`,
      expect.objectContaining({ max: 30, windowSeconds: 3600 }),
    );
  });
});
