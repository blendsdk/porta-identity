/**
 * Specification tests for the shared invitation workflow.
 *
 * These tests pin the tenant boundary: pre-assigned roles and claims must stay
 * inside the caller's application, and a tenant user cannot grant a role that
 * exceeds their live permission set.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = vi.hoisted(() => ({
  query: vi.fn(),
}));

const transaction = vi.hoisted(() => ({
  query: vi.fn(),
}));

const dependencies = vi.hoisted(() => ({
  getOrganizationById: vi.fn(),
  getUserByEmail: vi.fn(),
  generateToken: vi.fn(),
  replaceInvitation: vi.fn(),
  sendInvitationEmail: vi.fn(),
  getSystemConfigNumber: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  getPermissionsForRole: vi.fn(),
}));

vi.mock('../../../src/organizations/service.js', () => ({
  getOrganizationById: dependencies.getOrganizationById,
}));

vi.mock('../../../src/users/service.js', () => ({
  getUserByEmail: dependencies.getUserByEmail,
}));

vi.mock('../../../src/auth/tokens.js', () => ({
  generateToken: dependencies.generateToken,
}));

vi.mock('../../../src/auth/token-repository.js', () => ({
  replaceInvitation: dependencies.replaceInvitation,
  InvitationConflictError: class InvitationConflictError extends Error {},
}));

vi.mock('../../../src/auth/email-service.js', () => ({
  sendInvitationEmail: dependencies.sendInvitationEmail,
}));

vi.mock('../../../src/lib/system-config.js', () => ({
  getSystemConfigNumber: dependencies.getSystemConfigNumber,
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  inviteActorToAuditActor: (actor: {
    kind: 'admin' | 'user' | 'service';
    userId?: string;
    clientId?: string;
    displayName: string;
  }) =>
    actor.kind === 'service' && actor.clientId
      ? { kind: 'service', clientId: actor.clientId, clientName: actor.displayName }
      : actor.userId
        ? { kind: 'user', userId: actor.userId }
        : { kind: 'system' },
  auditActorColumns: (actor: {
    kind: 'user' | 'service' | 'system';
    userId?: string;
    clientId?: string;
    clientName?: string;
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
  writeAuditLogInTransaction: dependencies.writeAuditLogInTransaction,
}));

vi.mock('../../../src/lib/database.js', () => ({
  getPool: () => pool,
  afterDatabaseCommit: async (callback: () => Promise<void>) => callback(),
  getDatabaseTransactionClient: () => transaction,
  runDatabaseTransaction: async (work: () => Promise<unknown>) => work(),
}));

vi.mock('../../../src/rbac/role-service.js', () => ({
  getPermissionsForRole: dependencies.getPermissionsForRole,
}));

vi.mock('../../../src/config/index.js', () => ({
  config: { issuerBaseUrl: 'https://auth.example.com' },
}));

import {
  InvitePreAssignmentError,
  InviteUserExistsError,
  inviteUser,
} from '../../../src/users/invite-service.js';
import { RoleDelegationError } from '../../../src/rbac/errors.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const APP_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_APP_ID = '33333333-3333-4333-8333-333333333333';
const ROLE_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';

const ORGANIZATION = {
  id: ORG_ID,
  slug: 'acme',
  defaultLocale: 'en',
};

const ADMIN_ACTOR = {
  kind: 'admin' as const,
  userId: USER_ID,
  displayName: 'Admin User',
};

const USER_ACTOR = {
  kind: 'user' as const,
  userId: USER_ID,
  displayName: 'Tenant Admin',
  permissions: new Set(['org:user:invite', 'crm:contacts:read']),
};

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.getOrganizationById.mockResolvedValue(ORGANIZATION);
  dependencies.getUserByEmail.mockResolvedValue(null);
  dependencies.generateToken.mockReturnValue({ plaintext: 'token', hash: 'token-hash' });
  dependencies.replaceInvitation.mockResolvedValue({ id: 'invitation-1' });
  dependencies.sendInvitationEmail.mockResolvedValue(undefined);
  dependencies.getSystemConfigNumber.mockResolvedValue(3600);
  dependencies.writeAuditLogInTransaction.mockResolvedValue(undefined);
  dependencies.getPermissionsForRole.mockResolvedValue([]);
  pool.query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM applications')) return { rows: [{ id: APP_ID }] };
    if (sql.includes('FROM roles')) return { rows: [{ id: ROLE_ID }] };
    if (sql.includes('FROM custom_claim_definitions')) return { rows: [{ id: ROLE_ID }] };
    return { rows: [] };
  });
});

describe('inviteUser', () => {
  it('creates an admin invitation with the administrator as the actor', async () => {
    const result = await inviteUser({
      organizationId: ORG_ID,
      input: { email: 'new.user@example.com' },
      actor: ADMIN_ACTOR,
    });

    expect(result).toEqual({
      invitationId: 'invitation-1',
      email: 'new.user@example.com',
      invitationSent: true,
      expiresAt: expect.any(String),
    });
    expect(dependencies.replaceInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        email: 'new.user@example.com',
        invitedBy: USER_ID,
      }),
    );
    expect(dependencies.writeAuditLogInTransaction).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        actorId: USER_ID,
        actorType: 'user',
        eventType: 'user.invited',
      }),
    );
    expect(dependencies.sendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new.user@example.com' }),
      ORGANIZATION,
      'https://auth.example.com/acme/auth/accept-invite/token',
      'en',
      expect.objectContaining({ inviterName: 'Admin User' }),
    );
  });

  it('creates a service invitation without a user actor', async () => {
    await inviteUser({
      organizationId: ORG_ID,
      input: { email: 'new.user@example.com' },
      actor: { kind: 'service', clientId: 'bff-client', displayName: 'Tenant BFF' },
    });

    expect(dependencies.replaceInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ invitedBy: null }),
    );
    expect(dependencies.writeAuditLogInTransaction).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        actorId: undefined,
        actorType: 'client',
        actorClientId: 'bff-client',
        actorClientName: 'Tenant BFF',
        metadata: expect.objectContaining({
          actorKind: 'service',
          serviceClientId: 'bff-client',
        }),
      }),
    );
  });

  it('does not schedule the invitation email when the durable audit insert fails', async () => {
    dependencies.writeAuditLogInTransaction.mockRejectedValue(new Error('audit unavailable'));

    await expect(
      inviteUser({
        organizationId: ORG_ID,
        input: { email: 'new.user@example.com' },
        actor: ADMIN_ACTOR,
      }),
    ).rejects.toThrow('audit unavailable');

    expect(dependencies.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('rejects an email that already belongs to the organization', async () => {
    dependencies.getUserByEmail.mockResolvedValue({ id: USER_ID });

    await expect(
      inviteUser({
        organizationId: ORG_ID,
        input: { email: 'existing@example.com' },
        actor: ADMIN_ACTOR,
      }),
    ).rejects.toBeInstanceOf(InviteUserExistsError);
  });

  it('rejects a role owned by another application', async () => {
    await expect(
      inviteUser({
        organizationId: ORG_ID,
        input: {
          email: 'new.user@example.com',
          roles: [{ applicationId: OTHER_APP_ID, roleId: ROLE_ID }],
        },
        actor: ADMIN_ACTOR,
        allowedApplicationId: APP_ID,
      }),
    ).rejects.toBeInstanceOf(InvitePreAssignmentError);

    expect(dependencies.replaceInvitation).not.toHaveBeenCalled();
  });

  it('rejects a tenant user role that exceeds their permissions', async () => {
    dependencies.getPermissionsForRole.mockResolvedValue([
      { id: 'permission-1', applicationId: APP_ID, slug: 'crm:contacts:write' },
    ]);

    await expect(
      inviteUser({
        organizationId: ORG_ID,
        input: {
          email: 'new.user@example.com',
          roles: [{ applicationId: APP_ID, roleId: ROLE_ID }],
        },
        actor: USER_ACTOR,
        allowedApplicationId: APP_ID,
      }),
    ).rejects.toBeInstanceOf(RoleDelegationError);

    expect(dependencies.replaceInvitation).not.toHaveBeenCalled();
  });

  it('allows a tenant user to grant a role inside their permissions', async () => {
    await inviteUser({
      organizationId: ORG_ID,
      input: {
        email: 'new.user@example.com',
        roles: [{ applicationId: APP_ID, roleId: ROLE_ID }],
      },
      actor: USER_ACTOR,
      allowedApplicationId: APP_ID,
    });

    expect(dependencies.replaceInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        invitedBy: USER_ID,
        details: expect.objectContaining({
          roles: [{ applicationId: APP_ID, roleId: ROLE_ID }],
        }),
      }),
    );
  });

  it('maps a live invitation conflict to a stable domain error', async () => {
    const { InvitationConflictError } = await import('../../../src/auth/token-repository.js');
    dependencies.replaceInvitation.mockRejectedValue(new InvitationConflictError());

    await expect(
      inviteUser({
        organizationId: ORG_ID,
        input: { email: 'new.user@example.com' },
        actor: ADMIN_ACTOR,
      }),
    ).rejects.toMatchObject({ name: 'InviteConflictError' });
  });
});
