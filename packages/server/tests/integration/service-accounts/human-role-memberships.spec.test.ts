/** Reserved membership and permanent classification cannot be bypassed by generic role APIs. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getPermissionsForAdminRole,
  resolvePermissionsFromRoles,
} from '../../../src/lib/admin-permissions.js';
import { getPool } from '../../../src/lib/database.js';
import { assignRolesToUser, removeRolesFromUser } from '../../../src/rbac/user-role-service.js';
import { truncateAllTables } from '../helpers/database.js';
import {
  createTestApplication,
  createTestRole,
  createTestUser,
} from '../helpers/factories.js';
import {
  addFixtureMemberships,
  classifyFixtureUser,
  createHumanAdminFixtures,
  resetHumanFixtures,
} from './human-fixtures.js';

/** Each caller has a real canonical membership, not a supplied authority snapshot. */
const humanActorKinds = ['superAdmin', 'userAdmin'] as const;

/** Capture stored memberships and audit count without deriving expected event names. */
async function membershipState(userId: string) {
  const memberships = await getPool().query<{ role_id: string }>(
    'SELECT role_id FROM user_roles WHERE user_id = $1 ORDER BY role_id',
    [userId],
  );
  const audits = await getPool().query<{ count: number }>('SELECT COUNT(*)::int AS count FROM audit_log');
  return { roles: memberships.rows.map((row) => row.role_id), audits: audits.rows[0]?.count };
}

describe('Human role membership boundaries', () => {
  beforeEach(resetHumanFixtures);
  afterEach(truncateAllTables);

  it('should contribute no human Admin permissions when the reserved service role is resolved', () => {
    expect(getPermissionsForAdminRole('porta-invite-service')).toEqual([]);
    expect(resolvePermissionsFromRoles(['porta-invite-service'])).toEqual([]);
    expect(resolvePermissionsFromRoles(['porta-invite-service', 'porta-user-admin'])).toEqual(
      resolvePermissionsFromRoles(['porta-user-admin']),
    );
  });

  it.each(humanActorKinds)(
    'should reject reserved-role assignment without membership or audit changes when the actor is %s',
    async (actorKind) => {
      const admin = await createHumanAdminFixtures();
      const human = await createTestUser(admin.organizationId);
      const before = await membershipState(human.id);
      // Invitation authority itself is insufficient to delegate a machine-only identity role.
      expect(getPermissionsForAdminRole('porta-user-admin')).toContain('admin:user:invite');

      await expect(
        assignRolesToUser({
          organizationId: admin.organizationId,
          userId: human.id,
          roleIds: [admin.reservedRole.id],
          allowedApplicationId: admin.application.id,
          actor: { kind: 'user', userId: admin[actorKind].id },
        }),
      ).rejects.toThrow();

      expect(await membershipState(human.id)).toEqual(before);
    },
  );

  describe.each(humanActorKinds)('classified target with %s actor', (actorKind) => {
    it.each(['assign', 'remove'] as const)(
      'should reject generic %s without role or audit changes when the target has a permanent marker and broader roles',
      async (operation) => {
        const admin = await createHumanAdminFixtures();
        const ordinaryApplication = await createTestApplication();
        const ordinaryRole = await createTestRole(ordinaryApplication.id);
        const service = await createTestUser(admin.organizationId);
        await classifyFixtureUser(service.id);
        await addFixtureMemberships(service.id, [admin.reservedRole.id, admin.superAdminRole.id]);
        if (operation === 'remove') {
          await addFixtureMemberships(service.id, [ordinaryRole.id]);
        }
        const before = await membershipState(service.id);
        const input = {
          organizationId: admin.organizationId,
          userId: service.id,
          roleIds: [ordinaryRole.id],
          allowedApplicationId: ordinaryApplication.id,
          actor: { kind: 'user', userId: admin[actorKind].id } as const,
        };

        if (operation === 'assign') {
          await expect(assignRolesToUser(input)).rejects.toThrow();
        } else {
          await expect(removeRolesFromUser(input)).rejects.toThrow();
        }

        expect(await membershipState(service.id)).toEqual(before);
      },
    );
  });

  it.each(humanActorKinds)(
    'should retain ordinary role assignment and removal when the human actor is %s',
    async (actorKind) => {
      const admin = await createHumanAdminFixtures();
      const application = await createTestApplication();
      const role = await createTestRole(application.id);
      const human = await createTestUser(admin.organizationId);
      const input = {
        organizationId: admin.organizationId,
        userId: human.id,
        roleIds: [role.id],
        allowedApplicationId: application.id,
        actor: { kind: 'user', userId: admin[actorKind].id } as const,
      };

      await assignRolesToUser(input);
      expect((await membershipState(human.id)).roles).toEqual([role.id]);
      const result = await removeRolesFromUser(input);

      expect(typeof result.reauthenticationRequired).toBe('boolean');
      expect((await membershipState(human.id)).roles).toEqual([]);
    },
  );
});
