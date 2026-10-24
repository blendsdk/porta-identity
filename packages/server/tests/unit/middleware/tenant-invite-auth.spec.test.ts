/**
 * Specification tests for tenant invitation authentication.
 *
 * The route must accept exactly two caller types: a tenant service client with
 * the invitation scope and a tenant user with the invitation permission. Every
 * control-plane, cross-organization, wrong-application, and missing-authority
 * case must fail closed before the route can create an invitation.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  getClientByClientId: vi.fn(),
  findUserForOidc: vi.fn(),
  buildPermissionClaims: vi.fn(),
  getApplicationBySlug: vi.fn(),
  findSuperAdminOrganization: vi.fn(),
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

vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { requireTenantInviteAuth } from '../../../src/middleware/tenant-invite-auth.js';
import type {
  TenantInviteActor,
  TenantInviteTokenProvider,
} from '../../../src/middleware/tenant-invite-auth.js';

const TENANT_ORG_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ORG_ID = '22222222-2222-4222-8222-222222222222';
const TENANT_APP_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_APP_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const CLIENT_ID = 'bff-client';

const TENANT_CLIENT = {
  clientId: CLIENT_ID,
  clientName: 'Tenant BFF',
  clientType: 'confidential' as const,
  status: 'active' as const,
  organizationId: TENANT_ORG_ID,
  applicationId: TENANT_APP_ID,
  scope: 'org:user:invite',
};

const TENANT_USER = {
  id: USER_ID,
  organizationId: TENANT_ORG_ID,
  email: 'admin@example.test',
  givenName: 'Tenant',
  familyName: 'Admin',
  status: 'active' as const,
};

const ACCESS_TOKEN_FIND = vi.fn();
const CLIENT_CREDENTIALS_FIND = vi.fn();

const provider: TenantInviteTokenProvider = {
  AccessToken: { find: ACCESS_TOKEN_FIND },
  ClientCredentials: { find: CLIENT_CREDENTIALS_FIND },
};

function createMockCtx(authHeader?: string) {
  let statusCode = 200;
  let responseBody: unknown;

  const ctx = {
    params: { orgId: TENANT_ORG_ID },
    state: {} as { tenantInviteActor?: TenantInviteActor },
    get: vi.fn((name: string) => (name === 'Authorization' ? (authHeader ?? '') : '')),
    set: vi.fn(),
    get status() {
      return statusCode;
    },
    set status(value: number) {
      statusCode = value;
    },
    get body() {
      return responseBody;
    },
    set body(value: unknown) {
      responseBody = value;
    },
    throw: vi.fn((status: number, message: string) => {
      const error = new Error(message) as Error & { status: number };
      error.status = status;
      throw error;
    }),
  };

  return ctx;
}

async function run(authHeader?: string, activeProvider: TenantInviteTokenProvider = provider) {
  const ctx = createMockCtx(authHeader);
  const next = vi.fn().mockResolvedValue(undefined);
  await requireTenantInviteAuth(activeProvider)(ctx as never, next);
  return { ctx, next };
}

beforeEach(() => {
  vi.clearAllMocks();
  repository.getClientByClientId.mockResolvedValue(TENANT_CLIENT);
  repository.findUserForOidc.mockResolvedValue(TENANT_USER);
  repository.buildPermissionClaims.mockResolvedValue(['org:user:invite']);
  repository.getApplicationBySlug.mockResolvedValue({ id: ADMIN_APP_ID, slug: 'porta-admin' });
  repository.findSuperAdminOrganization.mockResolvedValue({ id: ADMIN_ORG_ID });
  CLIENT_CREDENTIALS_FIND.mockResolvedValue(undefined);
  ACCESS_TOKEN_FIND.mockResolvedValue(undefined);
});

describe('tenant invitation authentication', () => {
  it('fails closed when the provider is unavailable', async () => {
    const ctx = createMockCtx('Bearer token');
    const next = vi.fn().mockResolvedValue(undefined);

    await requireTenantInviteAuth(undefined)(ctx as never, next);

    expect(ctx.status).toBe(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a missing bearer token', async () => {
    const { ctx, next } = await run();

    expect(ctx.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token that is neither a service token nor a user token', async () => {
    const { ctx, next } = await run('Bearer unknown');

    expect(ctx.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts an active confidential tenant client with the invitation scope', async () => {
    CLIENT_CREDENTIALS_FIND.mockResolvedValue({
      clientId: CLIENT_ID,
      scopes: new Set(['org:user:invite']),
    });

    const { ctx, next } = await run('Bearer service-token');

    expect(next).toHaveBeenCalledOnce();
    expect(ctx.state.tenantInviteActor).toEqual({
      kind: 'service',
      clientId: CLIENT_ID,
      applicationId: TENANT_APP_ID,
      organizationId: TENANT_ORG_ID,
      displayName: TENANT_CLIENT.clientName,
    });
  });

  it('rejects a service token without the invitation scope', async () => {
    CLIENT_CREDENTIALS_FIND.mockResolvedValue({
      clientId: CLIENT_ID,
      scopes: new Set(['openid']),
    });

    const { ctx, next } = await run('Bearer service-token');

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a public service client', async () => {
    repository.getClientByClientId.mockResolvedValue({ ...TENANT_CLIENT, clientType: 'public' });
    CLIENT_CREDENTIALS_FIND.mockResolvedValue({
      clientId: CLIENT_ID,
      scopes: new Set(['org:user:invite']),
    });

    const { ctx, next } = await run('Bearer service-token');

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a service client from another organization', async () => {
    repository.getClientByClientId.mockResolvedValue({
      ...TENANT_CLIENT,
      organizationId: '99999999-9999-4999-8999-999999999999',
    });
    CLIENT_CREDENTIALS_FIND.mockResolvedValue({
      clientId: CLIENT_ID,
      scopes: new Set(['org:user:invite']),
    });

    const { ctx, next } = await run('Bearer service-token');

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a client linked to the canonical admin application', async () => {
    repository.getClientByClientId.mockResolvedValue({
      ...TENANT_CLIENT,
      applicationId: ADMIN_APP_ID,
    });
    CLIENT_CREDENTIALS_FIND.mockResolvedValue({
      clientId: CLIENT_ID,
      scopes: new Set(['org:user:invite']),
    });

    const { ctx, next } = await run('Bearer service-token');

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects the super-admin organization as a tenant target', async () => {
    const ctx = createMockCtx('Bearer service-token');
    ctx.params.orgId = ADMIN_ORG_ID;
    const next = vi.fn().mockResolvedValue(undefined);
    CLIENT_CREDENTIALS_FIND.mockResolvedValue({
      clientId: CLIENT_ID,
      scopes: new Set(['org:user:invite']),
    });
    repository.getClientByClientId.mockResolvedValue({
      ...TENANT_CLIENT,
      organizationId: ADMIN_ORG_ID,
    });

    await requireTenantInviteAuth(provider)(ctx as never, next);

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a service client whose registered scope omits the invitation capability', async () => {
    repository.getClientByClientId.mockResolvedValue({ ...TENANT_CLIENT, scope: 'openid profile' });
    CLIENT_CREDENTIALS_FIND.mockResolvedValue({
      clientId: CLIENT_ID,
      scopes: new Set(['org:user:invite']),
    });

    const { ctx, next } = await run('Bearer service-token');

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts an active tenant user with the invitation permission', async () => {
    ACCESS_TOKEN_FIND.mockResolvedValue({
      accountId: USER_ID,
      clientId: CLIENT_ID,
      scopes: new Set(['openid']),
    });

    const { ctx, next } = await run('Bearer user-token');

    expect(next).toHaveBeenCalledOnce();
    expect(ctx.state.tenantInviteActor).toEqual({
      kind: 'user',
      userId: USER_ID,
      applicationId: TENANT_APP_ID,
      organizationId: TENANT_ORG_ID,
      displayName: 'Tenant Admin',
      permissions: new Set(['org:user:invite']),
    });
  });

  it('rejects a tenant user without the invitation permission', async () => {
    repository.buildPermissionClaims.mockResolvedValue(['crm:contacts:read']);
    ACCESS_TOKEN_FIND.mockResolvedValue({
      accountId: USER_ID,
      clientId: CLIENT_ID,
      scopes: new Set(['openid']),
    });

    const { ctx, next } = await run('Bearer user-token');

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a tenant user from another organization', async () => {
    ACCESS_TOKEN_FIND.mockResolvedValue({
      accountId: USER_ID,
      clientId: CLIENT_ID,
      scopes: new Set(['openid']),
    });
    repository.findUserForOidc.mockResolvedValue({
      ...TENANT_USER,
      organizationId: '99999999-9999-4999-8999-999999999999',
    });

    const { ctx, next } = await run('Bearer user-token');

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a user token issued by a client from another organization', async () => {
    ACCESS_TOKEN_FIND.mockResolvedValue({
      accountId: USER_ID,
      clientId: CLIENT_ID,
      scopes: new Set(['openid']),
    });
    repository.getClientByClientId.mockResolvedValue({
      ...TENANT_CLIENT,
      organizationId: '99999999-9999-4999-8999-999999999999',
    });

    const { ctx, next } = await run('Bearer user-token');

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a user token whose client is linked to the canonical admin application', async () => {
    ACCESS_TOKEN_FIND.mockResolvedValue({
      accountId: USER_ID,
      clientId: CLIENT_ID,
      scopes: new Set(['openid']),
    });
    repository.getClientByClientId.mockResolvedValue({
      ...TENANT_CLIENT,
      applicationId: ADMIN_APP_ID,
    });

    const { ctx, next } = await run('Bearer user-token');

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});
