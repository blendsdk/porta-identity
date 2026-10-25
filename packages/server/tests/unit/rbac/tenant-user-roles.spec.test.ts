/**
 * Specification tests for tenant-bounded user-role mutations.
 *
 * The service must own the transaction, keep service actors inside the client
 * application, write `assigned_by = NULL`, and reject system actors and
 * cross-application roles.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  lockUserRoleTargets: vi.fn(),
  assignRolesToUser: vi.fn(),
  removeRolesFromUser: vi.fn(),
  getRolesForUser: vi.fn(),
  getPermissionsForUser: vi.fn(),
  getRolesForOrganizationUser: vi.fn(),
  getPermissionsForOrganizationUser: vi.fn(),
  getUsersWithRole: vi.fn(),
  getApplicationBySlug: vi.fn(),
  lockControlPlaneOrganization: vi.fn(),
  requireActiveSuperAdminSurvivor: vi.fn(),
  revokeAffectedAuthorityInTransaction: vi.fn(),
  registerAuthorityCleanup: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  runDatabaseTransaction: vi.fn(),
}));

vi.mock('../../../src/rbac/mapping-repository.js', () => ({
  lockUserRoleTargets: dependencies.lockUserRoleTargets,
  assignRolesToUser: dependencies.assignRolesToUser,
  removeRolesFromUser: dependencies.removeRolesFromUser,
  getRolesForUser: dependencies.getRolesForUser,
  getPermissionsForUser: dependencies.getPermissionsForUser,
  getRolesForOrganizationUser: dependencies.getRolesForOrganizationUser,
  getPermissionsForOrganizationUser: dependencies.getPermissionsForOrganizationUser,
  getUsersWithRole: dependencies.getUsersWithRole,
}));

vi.mock('../../../src/applications/service.js', () => ({
  getApplicationBySlug: dependencies.getApplicationBySlug,
}));

vi.mock('../../../src/users/repository.js', () => ({
  lockControlPlaneOrganization: dependencies.lockControlPlaneOrganization,
  requireActiveSuperAdminSurvivor: dependencies.requireActiveSuperAdminSurvivor,
}));

vi.mock('../../../src/lib/database.js', () => ({
  getDatabaseTransactionClient: () => ({ query: vi.fn() }),
  runDatabaseTransaction: (work: () => Promise<unknown>) =>
    dependencies.runDatabaseTransaction(work),
}));

vi.mock('../../../src/lib/audit-log.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/audit-log.js')>();
  return {
    ...actual,
    writeAuditLogInTransaction: dependencies.writeAuditLogInTransaction,
  };
});

vi.mock('../../../src/lib/deletion-cleanup.js', () => ({
  registerDeletionCleanup: vi.fn(),
  registerAuthorityCleanup: dependencies.registerAuthorityCleanup,
}));

vi.mock('../../../src/lib/authority-revocation.js', () => ({
  revokeAffectedAuthorityInTransaction: dependencies.revokeAffectedAuthorityInTransaction,
}));

import { assignRolesToUser, removeRolesFromUser } from '../../../src/rbac/user-role-service.js';
import { RoleApplicationBoundaryError, RoleDelegationError } from '../../../src/rbac/errors.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const APP = '33333333-3333-4333-8333-333333333333';
const OTHER_APP = '44444444-4444-4444-8444-444444444444';
const ADMIN_APP = '55555555-5555-4555-8555-555555555555';
const ROLE = '66666666-6666-4666-8666-666666666666';

function role(applicationId = APP, slug = 'crm-editor') {
  return { id: ROLE, applicationId, slug, name: 'CRM Editor' };
}

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.runDatabaseTransaction.mockImplementation((work: () => Promise<unknown>) => work());
  dependencies.getApplicationBySlug.mockResolvedValue({ id: ADMIN_APP, slug: 'porta-admin' });
  dependencies.lockUserRoleTargets.mockResolvedValue({
    user: { id: USER, status: 'active' },
    roles: [role()],
    assignedRoleIds: [],
  });
  dependencies.assignRolesToUser.mockResolvedValue([ROLE]);
  dependencies.removeRolesFromUser.mockResolvedValue([ROLE]);
  dependencies.revokeAffectedAuthorityInTransaction.mockResolvedValue({ grantIds: [] });
  dependencies.registerAuthorityCleanup.mockResolvedValue(undefined);
  dependencies.writeAuditLogInTransaction.mockResolvedValue(undefined);
});

describe('tenant user role mutations', () => {
  it('assigns a client-application role as a service actor with a null assigned_by', async () => {
    await assignRolesToUser({
      organizationId: ORG,
      userId: USER,
      roleIds: [ROLE],
      actor: { kind: 'service', clientId: 'bff-client', clientName: 'Tenant BFF' },
      allowedApplicationId: APP,
    });

    expect(dependencies.assignRolesToUser).toHaveBeenCalledWith(ORG, USER, [ROLE], undefined);
    expect(dependencies.writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: ORG,
        eventType: 'user.roles.assigned',
        actorType: 'client',
        actorClientId: 'bff-client',
        userId: USER,
      }),
    );
  });

  it('opens its own service transaction and deduplicates repeated role IDs', async () => {
    await assignRolesToUser({
      organizationId: ORG,
      userId: USER,
      roleIds: [ROLE, ROLE],
      actor: { kind: 'service', clientId: 'bff-client', clientName: 'Tenant BFF' },
      allowedApplicationId: APP,
    });

    expect(dependencies.runDatabaseTransaction).toHaveBeenCalledOnce();
    expect(dependencies.lockUserRoleTargets).toHaveBeenCalledWith(ORG, USER, [ROLE]);
    expect(dependencies.assignRolesToUser).toHaveBeenCalledWith(ORG, USER, [ROLE], undefined);
  });

  it('rejects a role from another application before writing', async () => {
    dependencies.lockUserRoleTargets.mockResolvedValue({
      user: { id: USER, status: 'active' },
      roles: [role(OTHER_APP)],
      assignedRoleIds: [],
    });

    await expect(
      assignRolesToUser({
        organizationId: ORG,
        userId: USER,
        roleIds: [ROLE],
        actor: { kind: 'service', clientId: 'bff-client', clientName: 'Tenant BFF' },
        allowedApplicationId: APP,
      }),
    ).rejects.toBeInstanceOf(RoleApplicationBoundaryError);
    expect(dependencies.assignRolesToUser).not.toHaveBeenCalled();
  });

  it('rejects an unassigned foreign-application role on removal', async () => {
    dependencies.lockUserRoleTargets.mockResolvedValue({
      user: { id: USER, status: 'active' },
      roles: [role(OTHER_APP)],
      assignedRoleIds: [],
    });

    await expect(
      removeRolesFromUser({
        organizationId: ORG,
        userId: USER,
        roleIds: [ROLE],
        actor: { kind: 'service', clientId: 'bff-client', clientName: 'Tenant BFF' },
        allowedApplicationId: APP,
      }),
    ).rejects.toBeInstanceOf(RoleApplicationBoundaryError);

    expect(dependencies.removeRolesFromUser).not.toHaveBeenCalled();
    expect(dependencies.writeAuditLogInTransaction).not.toHaveBeenCalled();
  });

  it('rejects a canonical admin application role for a tenant actor', async () => {
    dependencies.lockUserRoleTargets.mockResolvedValue({
      user: { id: USER, status: 'active' },
      roles: [role(ADMIN_APP, 'porta-super-admin')],
      assignedRoleIds: [],
    });

    await expect(
      assignRolesToUser({
        organizationId: ORG,
        userId: USER,
        roleIds: [ROLE],
        actor: { kind: 'service', clientId: 'bff-client', clientName: 'Tenant BFF' },
        allowedApplicationId: APP,
      }),
    ).rejects.toBeInstanceOf(RoleApplicationBoundaryError);
  });

  it('propagates a durable role audit failure so the mutation rolls back', async () => {
    dependencies.writeAuditLogInTransaction.mockRejectedValue(new Error('audit unavailable'));

    await expect(
      assignRolesToUser({
        organizationId: ORG,
        userId: USER,
        roleIds: [ROLE],
        actor: { kind: 'service', clientId: 'bff-client', clientName: 'Tenant BFF' },
        allowedApplicationId: APP,
      }),
    ).rejects.toThrow('audit unavailable');
  });

  it('rejects a system actor role mutation', async () => {
    await expect(
      assignRolesToUser({
        organizationId: ORG,
        userId: USER,
        roleIds: [ROLE],
        actor: { kind: 'system' },
        allowedApplicationId: APP,
      }),
    ).rejects.toBeInstanceOf(RoleDelegationError);
  });

  it('removes a client-application role and returns no reauthentication for a service actor', async () => {
    dependencies.lockUserRoleTargets.mockResolvedValue({
      user: { id: USER, status: 'active' },
      roles: [role()],
      assignedRoleIds: [ROLE],
    });

    const result = await removeRolesFromUser({
      organizationId: ORG,
      userId: USER,
      roleIds: [ROLE],
      actor: { kind: 'service', clientId: 'bff-client', clientName: 'Tenant BFF' },
      allowedApplicationId: APP,
    });

    expect(result).toEqual({ reauthenticationRequired: false });
    expect(dependencies.removeRolesFromUser).toHaveBeenCalledWith(ORG, USER, [ROLE]);
    expect(dependencies.writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: ORG,
        eventType: 'user.roles.removed',
        actorType: 'client',
      }),
    );
  });
});
