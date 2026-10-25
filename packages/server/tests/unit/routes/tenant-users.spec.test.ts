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
}));

vi.mock('../../../src/middleware/tenant-invite-rate-limiter.js', () => ({
  tenantInviteRateLimiter: () => async (_ctx: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../../src/users/invite-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/users/invite-service.js')>();
  return { ...actual, inviteUser: service.inviteUser };
});

import { createTenantUsersRouter } from '../../../src/routes/tenant-users.js';
import {
  InvitePreAssignmentError,
  InviteUserExistsError,
} from '../../../src/users/invite-service.js';
import { RoleDelegationError } from '../../../src/rbac/errors.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const APP_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

function createMockCtx(body: unknown = { email: 'new.user@example.com' }) {
  let statusCode = 200;
  let responseBody: unknown;

  return {
    params: { orgId: ORG_ID },
    request: { body },
    state: { tenantActor: state.actor },
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
