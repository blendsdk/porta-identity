/**
 * Specification tests for the tenant invitation route.
 *
 * The route must map the authenticated tenant actor into the shared invite
 * service, keep the tenant application boundary, and expose only sanitized
 * error outcomes.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  actor: undefined as unknown,
}));

const service = vi.hoisted(() => ({
  inviteUser: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  listUsersByOrganization: vi.fn(),
  listUsersCursor: vi.fn(),
  getUserById: vi.fn(),
  findUserById: vi.fn(),
  getOrganizationById: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock('../../../src/middleware/tenant-user-auth.js', () => ({
  requireTenantActorAuth: () => async (
    ctx: { state: { tenantActor?: unknown } },
    next: () => Promise<void>,
  ) => {
    ctx.state.tenantActor = state.actor;
    await next();
  },
}));

vi.mock('../../../src/middleware/tenant-invite-rate-limiter.js', () => ({
  tenantInviteRateLimiter: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../../src/middleware/tenant-user-rate-limiter.js', () => ({
  tenantUserWriteRateLimiter: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
  tenantUserDeleteRateLimiter: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../../src/users/invite-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/users/invite-service.js')>();
  return { ...actual, inviteUser: service.inviteUser };
});

vi.mock('../../../src/users/service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/users/service.js')>();
  return {
    ...actual,
    createUser: service.createUser,
    updateUser: service.updateUser,
    listUsersByOrganization: service.listUsersByOrganization,
    listUsersCursor: service.listUsersCursor,
    getUserById: service.getUserById,
  };
});

vi.mock('../../../src/users/repository.js', () => ({
  findUserById: service.findUserById,
}));

vi.mock('../../../src/organizations/service.js', () => ({
  getOrganizationById: service.getOrganizationById,
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: service.writeAuditLog,
  tenantActorToAuditActor: (actor: {
    kind: 'service' | 'user';
    clientId?: string;
    clientName?: string;
    userId?: string;
  }) =>
    actor.kind === 'service'
      ? { kind: 'service', clientId: actor.clientId, clientName: actor.clientName }
      : { kind: 'user', userId: actor.userId },
  auditActorColumns: (actor: {
    kind: 'service' | 'user' | 'system';
    clientId?: string;
    clientName?: string;
    userId?: string;
  }) =>
    actor.kind === 'service'
      ? {
          actorId: undefined,
          actorType: 'client',
          actorClientId: actor.clientId,
          actorClientName: actor.clientName,
        }
      : actor.kind === 'user'
        ? {
            actorId: actor.userId,
            actorType: 'user',
            actorClientId: null,
            actorClientName: null,
          }
        : {
            actorId: undefined,
            actorType: 'system',
            actorClientId: null,
            actorClientName: null,
          },
}));

import { createTenantUsersRouter } from '../../../src/routes/tenant-users.js';
import {
  InvitePreAssignmentError,
  InviteUserExistsError,
} from '../../../src/users/invite-service.js';
import { UserEmailConflictError } from '../../../src/users/errors.js';
import { RoleDelegationError } from '../../../src/rbac/errors.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '99999999-9999-4999-8999-999999999999';
const APP_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

function testUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    organizationId: ORG_ID,
    email: 'new.user@example.com',
    emailVerified: false,
    hasPassword: false,
    givenName: 'New',
    familyName: 'User',
    phoneNumber: null,
    phoneNumberVerified: false,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function createMockCtx(body: unknown = { email: 'new.user@example.com' }) {
  let statusCode = 200;
  let responseBody: unknown;
  const headers: Record<string, string> = {};

  return {
    params: { orgId: ORG_ID, userId: USER_ID },
    query: {},
    request: { body, headers: {} as Record<string, string> },
    state: { tenantActor: state.actor } as Record<string, unknown>,
    ip: '127.0.0.1',
    get(field: string) {
      return headers[field.toLowerCase()] ?? '';
    },
    set(field: string, value: string) {
      headers[field.toLowerCase()] = value;
    },
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
}

/** Execute every middleware in one matched route layer. */
async function executeLayer(
  layer: { stack: Array<(ctx: unknown, next: () => Promise<void>) => Promise<void>> },
  ctx: unknown,
): Promise<void> {
  let index = 0;
  const next = async (): Promise<void> => {
    const middleware = layer.stack[index++];
    if (middleware) await middleware(ctx, next);
  };
  await next();
}

function findLayer(
  router: ReturnType<typeof createTenantUsersRouter>,
  method: string,
  path: string,
) {
  return router.stack.find((layer) => layer.methods.includes(method) && layer.path === path);
}

async function executeRoute(
  router: ReturnType<typeof createTenantUsersRouter>,
  method: string,
  path: string,
  ctx: ReturnType<typeof createMockCtx>,
) {
  const layer = findLayer(router, method, path);
  if (!layer) throw new Error(`Route not found: ${method} ${path}`);
  await executeLayer(layer, ctx);
  return ctx;
}

function findInviteHandler(router: ReturnType<typeof createTenantUsersRouter>) {
  return router.stack.find(
    (layer) =>
      layer.methods.includes('POST') && layer.path === '/api/organizations/:orgId/users/invite',
  );
}

async function execute(router: ReturnType<typeof createTenantUsersRouter>, body?: unknown) {
  const layer = findInviteHandler(router);
  if (!layer) throw new Error('Invite route not found');
  const ctx = createMockCtx(body);
  await layer.stack[layer.stack.length - 1](ctx as never, vi.fn());
  return ctx;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.actor = {
    kind: 'service',
    clientId: 'bff-client',
    clientName: 'Tenant BFF',
    applicationId: APP_ID,
    organizationId: ORG_ID,
    displayName: 'Tenant BFF',
  };
  service.inviteUser.mockResolvedValue({
    invitationId: 'invitation-1',
    email: 'new.user@example.com',
    invitationSent: true,
    expiresAt: '2026-10-31T12:00:00.000Z',
  });
  service.createUser.mockResolvedValue(testUser());
  service.updateUser.mockResolvedValue(testUser({ givenName: 'Updated' }));
  service.getUserById.mockResolvedValue(testUser());
  service.findUserById.mockResolvedValue(testUser());
  service.getOrganizationById.mockResolvedValue({ id: ORG_ID, slug: 'acme' });
  service.listUsersByOrganization.mockResolvedValue({
    data: [testUser()],
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  });
  service.listUsersCursor.mockResolvedValue({
    data: [testUser()],
    hasMore: false,
    nextCursor: null,
  });
  service.writeAuditLog.mockResolvedValue(undefined);
});

describe('tenant invitation route', () => {
  it('passes a service actor and the tenant application boundary to the invite service', async () => {
    const ctx = await execute(createTenantUsersRouter());

    expect(service.inviteUser).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      input: { email: 'new.user@example.com' },
      actor: {
        kind: 'service',
        clientId: 'bff-client',
        displayName: 'Tenant BFF',
      },
      allowedApplicationId: APP_ID,
    });
    expect(ctx.status).toBe(201);
    expect(ctx.body).toEqual({
      data: {
        invitationId: 'invitation-1',
        email: 'new.user@example.com',
        invitationSent: true,
        expiresAt: '2026-10-31T12:00:00.000Z',
      },
    });
  });

  it('passes a user actor with live permissions', async () => {
    const permissions = new Set(['org:user:invite']);
    state.actor = {
      kind: 'user',
      userId: USER_ID,
      applicationId: APP_ID,
      organizationId: ORG_ID,
      displayName: 'Tenant Admin',
      permissions,
    };

    await execute(createTenantUsersRouter());

    expect(service.inviteUser).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: {
          kind: 'user',
          userId: USER_ID,
          displayName: 'Tenant Admin',
          permissions,
        },
      }),
    );
  });

  it('returns 409 when the email already belongs to the organization', async () => {
    service.inviteUser.mockRejectedValue(new InviteUserExistsError());

    const ctx = await execute(createTenantUsersRouter());

    expect(ctx.status).toBe(409);
    expect(ctx.body).toEqual({ error: 'User already exists in this organization' });
  });

  it('returns 400 for an invalid pre-assignment', async () => {
    service.inviteUser.mockRejectedValue(new InvitePreAssignmentError());

    const ctx = await execute(createTenantUsersRouter());

    expect(ctx.status).toBe(400);
    expect(ctx.body).toEqual({ error: 'User request is invalid' });
  });

  it('returns 403 when a tenant user exceeds their authority', async () => {
    service.inviteUser.mockRejectedValue(new RoleDelegationError());

    const ctx = await execute(createTenantUsersRouter());

    expect(ctx.status).toBe(403);
    expect(ctx.body).toEqual({
      error: 'Forbidden',
      message: 'The requested operation is not permitted',
    });
  });

  it('rejects custom claim pre-assignment on the tenant route', async () => {
    const ctx = await execute(createTenantUsersRouter(), {
      email: 'new.user@example.com',
      claims: [
        {
          applicationId: APP_ID,
          claimDefinitionId: '44444444-4444-4444-8444-444444444444',
          value: 'admin',
        },
      ],
    });

    expect(ctx.status).toBe(400);
    expect(ctx.body).toEqual({ error: 'User request is invalid' });
    expect(service.inviteUser).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed request body', async () => {
    const ctx = await execute(createTenantUsersRouter(), { email: 'not-an-email' });

    expect(ctx.status).toBe(400);
    expect(ctx.body).toEqual({ error: 'User request is invalid' });
    expect(service.inviteUser).not.toHaveBeenCalled();
  });

  it('returns 401 when authentication did not set an actor', async () => {
    state.actor = undefined;

    const ctx = await execute(createTenantUsersRouter());

    expect(ctx.status).toBe(401);
    expect(service.inviteUser).not.toHaveBeenCalled();
  });
});

describe('tenant user CRUD routes', () => {
  const auditActor = {
    kind: 'service' as const,
    clientId: 'bff-client',
    clientName: 'Tenant BFF',
  };

  it('ST-10 creates a full profile with verification flags and returns an ETag', async () => {
    const ctx = createMockCtx({
      email: 'full@example.com',
      givenName: 'Full',
      familyName: 'Profile',
      phoneNumber: '+15555550123',
      phoneNumberVerified: true,
      emailVerified: true,
    });

    await executeRoute(
      createTenantUsersRouter(),
      'POST',
      '/api/organizations/:orgId/users',
      ctx,
    );

    expect(ctx.status).toBe(201);
    expect(service.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        email: 'full@example.com',
        emailVerified: true,
        phoneNumberVerified: true,
      }),
      auditActor,
      expect.objectContaining({ ipAddress: '127.0.0.1' }),
    );
    expect(ctx.get('ETag')).toMatch(/^W\/"[a-f0-9]{16}"$/);
    expect(ctx.body).toEqual({ data: expect.objectContaining({ id: USER_ID }) });
  });

  it('ST-11 rejects a password on tenant create before calling the service', async () => {
    const ctx = createMockCtx({ email: 'password@example.com', password: 'Password1!' });

    await executeRoute(
      createTenantUsersRouter(),
      'POST',
      '/api/organizations/:orgId/users',
      ctx,
    );

    expect(ctx.status).toBe(400);
    expect(ctx.body).toEqual({ error: 'User request is invalid' });
    expect(service.createUser).not.toHaveBeenCalled();
  });

  it('ST-12 rejects a verified phone without a phone number', async () => {
    const ctx = createMockCtx({
      email: 'phone@example.com',
      phoneNumberVerified: true,
    });

    await executeRoute(
      createTenantUsersRouter(),
      'POST',
      '/api/organizations/:orgId/users',
      ctx,
    );

    expect(ctx.status).toBe(400);
    expect(service.createUser).not.toHaveBeenCalled();
  });

  it('ST-13 maps a duplicate tenant email to 409', async () => {
    service.createUser.mockRejectedValue(new UserEmailConflictError());
    const ctx = createMockCtx({ email: 'duplicate@example.com' });

    await executeRoute(
      createTenantUsersRouter(),
      'POST',
      '/api/organizations/:orgId/users',
      ctx,
    );

    expect(ctx.status).toBe(409);
    expect(ctx.body).toEqual({ error: 'User already exists in this organization' });
  });

  it('ST-15 ignores a body organizationId and uses the path organization', async () => {
    const ctx = createMockCtx({
      email: 'body-org@example.com',
      organizationId: OTHER_ORG_ID,
    });

    await executeRoute(
      createTenantUsersRouter(),
      'POST',
      '/api/organizations/:orgId/users',
      ctx,
    );

    expect(service.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('ST-16 lists only the path organization with validated pagination and writes list audit', async () => {
    const ctx = createMockCtx();
    ctx.query = { page: '2', pageSize: '10', search: 'alice', status: 'active' };

    await executeRoute(createTenantUsersRouter(), 'GET', '/api/organizations/:orgId/users', ctx);

    expect(ctx.status).toBe(200);
    expect(service.listUsersByOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        page: 2,
        pageSize: 10,
        search: 'alice',
        status: 'active',
      }),
    );
    expect(service.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'user.listed',
        organizationId: ORG_ID,
        actorType: 'client',
        actorClientId: 'bff-client',
        metadata: expect.not.objectContaining({ userIds: expect.anything() }),
      }),
    );
  });

  it('ST-17 returns one user with an ETag and writes read audit', async () => {
    const ctx = createMockCtx();

    await executeRoute(
      createTenantUsersRouter(),
      'GET',
      '/api/organizations/:orgId/users/:userId',
      ctx,
    );

    expect(ctx.status).toBe(200);
    expect(ctx.get('ETag')).toMatch(/^W\/"[a-f0-9]{16}"$/);
    expect(service.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'user.read',
        userId: USER_ID,
        actorType: 'client',
      }),
    );
  });

  it('ST-18 returns the same 404 for an absent or foreign user before reading', async () => {
    service.findUserById.mockResolvedValue(testUser({ organizationId: OTHER_ORG_ID }));
    const ctx = createMockCtx();

    await executeRoute(
      createTenantUsersRouter(),
      'GET',
      '/api/organizations/:orgId/users/:userId',
      ctx,
    );

    expect(ctx.status).toBe(404);
    expect(ctx.body).toEqual({ error: 'User not found' });
    expect(service.getUserById).not.toHaveBeenCalled();
  });

  it('ST-21 updates profile and verification flags with a new ETag', async () => {
    service.getUserById.mockResolvedValue(testUser({ phoneNumber: '+15555550123' }));
    const ctx = createMockCtx({ nickname: 'newbie', phoneNumberVerified: true });

    await executeRoute(
      createTenantUsersRouter(),
      'PUT',
      '/api/organizations/:orgId/users/:userId',
      ctx,
    );

    expect(ctx.status).toBe(200);
    expect(service.updateUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ nickname: 'newbie', phoneNumberVerified: true }),
      auditActor,
      expect.objectContaining({ ipAddress: '127.0.0.1' }),
    );
    expect(ctx.get('ETag')).toMatch(/^W\/"[a-f0-9]{16}"$/);
  });

  it('ST-22 rejects email, status, password, and 2FA fields on tenant update', async () => {
    for (const body of [
      { email: 'changed@example.com' },
      { status: 'inactive' },
      { password: 'Password1!' },
      { twoFactorEnabled: true },
    ]) {
      const ctx = createMockCtx(body);
      await executeRoute(
        createTenantUsersRouter(),
        'PUT',
        '/api/organizations/:orgId/users/:userId',
        ctx,
      );
      expect(ctx.status).toBe(400);
    }
    expect(service.updateUser).not.toHaveBeenCalled();
  });

  it('ST-24 rejects a verified phone when neither the request nor the stored user has one', async () => {
    service.getUserById.mockResolvedValue(testUser({ phoneNumber: null }));
    const ctx = createMockCtx({ phoneNumberVerified: true });

    await executeRoute(
      createTenantUsersRouter(),
      'PUT',
      '/api/organizations/:orgId/users/:userId',
      ctx,
    );

    expect(ctx.status).toBe(400);
    expect(service.updateUser).not.toHaveBeenCalled();
  });

  it('ST-25 returns the existing Admin conflict response for a stale If-Match', async () => {
    const ctx = createMockCtx({ givenName: 'Stale' });
    ctx.set('If-Match', 'W/"0000000000000000"');

    await executeRoute(
      createTenantUsersRouter(),
      'PUT',
      '/api/organizations/:orgId/users/:userId',
      ctx,
    );

    expect(ctx.status).toBe(409);
    expect(service.updateUser).not.toHaveBeenCalled();
  });
});
