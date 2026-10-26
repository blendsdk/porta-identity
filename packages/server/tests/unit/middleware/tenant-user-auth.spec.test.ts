/**
 * Specification tests for tenant actor authentication and scopes.
 *
 * The shared tenant middleware must accept exactly the caller kinds each
 * route permits, enforce the required scope and client boundary, preserve
 * the existing security decision/reference instrumentation, and fail closed
 * for every missing or foreign authority.
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

import { recordSecurityDecision, recordSecurityReference } from '../../../src/security/decision-context.js';
import { requireTenantActorAuth } from '../../../src/middleware/tenant-user-auth.js';
import type {
  TenantActor,
  TenantTokenProvider,
} from '../../../src/middleware/tenant-user-auth.js';

const TENANT_ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '99999999-9999-4999-8999-999999999999';
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
  scope: 'org:user:invite org:user:read org:user:write org:user:delete',
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

const provider: TenantTokenProvider = {
  AccessToken: { find: ACCESS_TOKEN_FIND },
  ClientCredentials: { find: CLIENT_CREDENTIALS_FIND },
};

function createMockCtx(authHeader?: string) {
  let statusCode = 200;
  let responseBody: unknown;

  const ctx = {
    params: { orgId: TENANT_ORG_ID },
    state: {} as { tenantActor?: TenantActor },
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

async function run(
  authHeader: string | undefined,
  options: {
    readonly allowedActorKinds: readonly ('service' | 'user')[];
    readonly requiredScope: string;
    readonly requiredPermission?: string;
    readonly activeProvider?: TenantTokenProvider;
  },
) {
  const ctx = createMockCtx(authHeader);
  const next = vi.fn().mockResolvedValue(undefined);
  await requireTenantActorAuth({
    provider: options.activeProvider ?? provider,
    allowedActorKinds: options.allowedActorKinds,
    requiredScope: options.requiredScope,
    ...(options.requiredPermission ? { requiredPermission: options.requiredPermission } : {}),
  })(ctx as never, next);
  return { ctx, next };
}

const CRUD_OPTIONS = {
  allowedActorKinds: ['service'] as const,
  requiredScope: 'org:user:read',
};

const INVITE_OPTIONS = {
  allowedActorKinds: ['service', 'user'] as const,
  requiredScope: 'org:user:invite',
  requiredPermission: 'org:user:invite',
};

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

describe('tenant actor authentication', () => {
  it('should fail closed with a configuration error when the provider is unavailable', async () => {
    const ctx = createMockCtx('Bearer token');
    const next = vi.fn().mockResolvedValue(undefined);

    await requireTenantActorAuth({
      provider: undefined,
      allowedActorKinds: ['service'],
      requiredScope: 'org:user:read',
    })(ctx as never, next);

    expect(ctx.status).toBe(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject a missing bearer token with 401', async () => {
    const { ctx, next } = await run(undefined, CRUD_OPTIONS);

    expect(ctx.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject an empty bearer token with 401', async () => {
    const { ctx, next } = await run('Bearer ', CRUD_OPTIONS);

    expect(ctx.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject a token that is neither a service token nor a user token with 401', async () => {
    const { ctx, next } = await run('Bearer unknown', CRUD_OPTIONS);

    expect(ctx.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should accept an active confidential tenant client with the required scope', async () => {
    CLIENT_CREDENTIALS_FIND.mockResolvedValue({
      clientId: CLIENT_ID,
      scopes: new Set(['org:user:read']),
    });

    const { ctx, next } = await run('Bearer service-token', CRUD_OPTIONS);

    expect(next).toHaveBeenCalledOnce();
    expect(ctx.state.tenantActor).toEqual({
      kind: 'service',
      clientId: CLIENT_ID,
      clientName: TENANT_CLIENT.clientName,
      applicationId: TENANT_APP_ID,
      organizationId: TENANT_ORG_ID,
      displayName: TENANT_CLIENT.clientName,
    });
  });

  it('should reject a service token without the required scope', async () => {
    CLIENT_CREDENTIALS_FIND.mockResolvedValue({
      clientId: CLIENT_ID,
      scopes: new Set(['openid']),
    });

    const { ctx, next } = await run('Bearer service-token', CRUD_OPTIONS);

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject a service client whose registered scope omits the required capability', async () => {
    repository.getClientByClientId.mockResolvedValue({ ...TENANT_CLIENT, scope: 'openid profile' });
    CLIENT_CREDENTIALS_FIND.mockResolvedValue({
      clientId: CLIENT_ID,
      scopes: new Set(['org:user:read']),
    });

    const { ctx, next } = await run('Bearer service-token', CRUD_OPTIONS);

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject a public service client', async () => {
    repository.getClientByClientId.mockResolvedValue({ ...TENANT_CLIENT, clientType: 'public' });
    CLIENT_CREDENTIALS_FIND.mockResolvedValue({
      clientId: CLIENT_ID,
      scopes: new Set(['org:user:read']),
    });

    const { ctx, next } = await run('Bearer service-token', CRUD_OPTIONS);

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject an inactive service client', async () => {
    repository.getClientByClientId.mockResolvedValue({ ...TENANT_CLIENT, status: 'inactive' });
    CLIENT_CREDENTIALS_FIND.mockResolvedValue({
      clientId: CLIENT_ID,
      scopes: new Set(['org:user:read']),
    });

    const { ctx, next } = await run('Bearer service-token', CRUD_OPTIONS);

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject a service client from another organization', async () => {
    repository.getClientByClientId.mockResolvedValue({
      ...TENANT_CLIENT,
      organizationId: OTHER_ORG_ID,
    });
    CLIENT_CREDENTIALS_FIND.mockResolvedValue({
      clientId: CLIENT_ID,
      scopes: new Set(['org:user:read']),
    });

    const { ctx, next } = await run('Bearer service-token', CRUD_OPTIONS);

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject a client linked to the canonical admin application', async () => {
    repository.getClientByClientId.mockResolvedValue({
      ...TENANT_CLIENT,
      applicationId: ADMIN_APP_ID,
    });
    CLIENT_CREDENTIALS_FIND.mockResolvedValue({
      clientId: CLIENT_ID,
      scopes: new Set(['org:user:read']),
    });

    const { ctx, next } = await run('Bearer service-token', CRUD_OPTIONS);

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject the super-admin organization as a tenant target', async () => {
    const ctx = createMockCtx('Bearer service-token');
    ctx.params.orgId = ADMIN_ORG_ID;
    const next = vi.fn().mockResolvedValue(undefined);
    CLIENT_CREDENTIALS_FIND.mockResolvedValue({
      clientId: CLIENT_ID,
      scopes: new Set(['org:user:read']),
    });
    repository.getClientByClientId.mockResolvedValue({
      ...TENANT_CLIENT,
      organizationId: ADMIN_ORG_ID,
    });

    await requireTenantActorAuth({
      provider,
      allowedActorKinds: ['service'],
      requiredScope: 'org:user:read',
    })(ctx as never, next);

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject a tenant user token on a service-only CRUD route', async () => {
    ACCESS_TOKEN_FIND.mockResolvedValue({
      accountId: USER_ID,
      clientId: CLIENT_ID,
      scopes: new Set(['openid']),
    });

    const { ctx, next } = await run('Bearer user-token', CRUD_OPTIONS);

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should accept an active tenant user with the invite permission on the invite route', async () => {
    ACCESS_TOKEN_FIND.mockResolvedValue({
      accountId: USER_ID,
      clientId: CLIENT_ID,
      scopes: new Set(['openid']),
    });

    const { ctx, next } = await run('Bearer user-token', INVITE_OPTIONS);

    expect(next).toHaveBeenCalledOnce();
    expect(ctx.state.tenantActor).toEqual({
      kind: 'user',
      userId: USER_ID,
      applicationId: TENANT_APP_ID,
      organizationId: TENANT_ORG_ID,
      displayName: 'Tenant Admin',
      permissions: new Set(['org:user:invite']),
    });
  });

  it('should reject a tenant user without the invite permission', async () => {
    repository.buildPermissionClaims.mockResolvedValue(['crm:contacts:read']);
    ACCESS_TOKEN_FIND.mockResolvedValue({
      accountId: USER_ID,
      clientId: CLIENT_ID,
      scopes: new Set(['openid']),
    });

    const { ctx, next } = await run('Bearer user-token', INVITE_OPTIONS);

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject a tenant user from another organization', async () => {
    ACCESS_TOKEN_FIND.mockResolvedValue({
      accountId: USER_ID,
      clientId: CLIENT_ID,
      scopes: new Set(['openid']),
    });
    repository.findUserForOidc.mockResolvedValue({
      ...TENANT_USER,
      organizationId: OTHER_ORG_ID,
    });

    const { ctx, next } = await run('Bearer user-token', INVITE_OPTIONS);

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject a user token issued by an inactive client', async () => {
    ACCESS_TOKEN_FIND.mockResolvedValue({
      accountId: USER_ID,
      clientId: CLIENT_ID,
      scopes: new Set(['openid']),
    });
    repository.getClientByClientId.mockResolvedValue({
      ...TENANT_CLIENT,
      status: 'inactive',
    });

    const { ctx, next } = await run('Bearer user-token', INVITE_OPTIONS);

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject a user token issued by a client from another organization', async () => {
    ACCESS_TOKEN_FIND.mockResolvedValue({
      accountId: USER_ID,
      clientId: CLIENT_ID,
      scopes: new Set(['openid']),
    });
    repository.getClientByClientId.mockResolvedValue({
      ...TENANT_CLIENT,
      organizationId: OTHER_ORG_ID,
    });

    const { ctx, next } = await run('Bearer user-token', INVITE_OPTIONS);

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject a user token whose client is linked to the canonical admin application', async () => {
    ACCESS_TOKEN_FIND.mockResolvedValue({
      accountId: USER_ID,
      clientId: CLIENT_ID,
      scopes: new Set(['openid']),
    });
    repository.getClientByClientId.mockResolvedValue({
      ...TENANT_CLIENT,
      applicationId: ADMIN_APP_ID,
    });

    const { ctx, next } = await run('Bearer user-token', INVITE_OPTIONS);

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should preserve the security reference and decision instrumentation on success and denial', async () => {
    CLIENT_CREDENTIALS_FIND.mockResolvedValue({
      clientId: CLIENT_ID,
      scopes: new Set(['org:user:read']),
    });

    const success = await run('Bearer service-token', CRUD_OPTIONS);
    expect(success.next).toHaveBeenCalledOnce();
    expect(recordSecurityReference).toHaveBeenCalledWith(expect.anything(), 'actor', CLIENT_ID);
    expect(recordSecurityReference).toHaveBeenCalledWith(
      expect.anything(),
      'tenant',
      TENANT_ORG_ID,
    );
    expect(recordSecurityDecision).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ outcome: 'deny' }),
    );

    CLIENT_CREDENTIALS_FIND.mockResolvedValue({
      clientId: CLIENT_ID,
      scopes: new Set(['openid']),
    });

    const denial = await run('Bearer service-token', CRUD_OPTIONS);
    expect(denial.ctx.status).toBe(403);
    expect(recordSecurityDecision).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ outcome: 'deny' }),
    );
  });
});
