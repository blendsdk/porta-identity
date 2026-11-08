import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { inviteUser } from '../../../src/users/invite-service.js';
import { createTestRole } from '../helpers/factories.js';
import { lifecycleSecurityFingerprint } from './lifecycle-fixtures.js';
import type { LifecycleFixture } from './lifecycle-fixtures.js';
import {
  captureReservedRoleMail,
  createReservedRoleFixture,
  resetReservedRoleRuntime,
} from './reserved-role-fixtures.js';
import type { ReservedRoleMail } from './reserved-role-fixtures.js';

describe('reserved invitation-only role in human invitation preassignments', () => {
  let fixture: LifecycleFixture;
  let mail: ReservedRoleMail;

  beforeEach(async () => {
    fixture = await createReservedRoleFixture();
    mail = captureReservedRoleMail();
  });

  afterEach(async () => {
    await resetReservedRoleRuntime();
  });

  // Human invitation admission cannot be bypassed by a Super Admin or valid neighboring assignments.
  it.each(['reserved only', 'reserved first', 'reserved last'] as const)(
    'should reject a Super Admin human invitation with %s before persistence, audit or mail',
    async (order) => {
      const sameSlug = await createTestRole(fixture.application.id, {
        name: 'Synthetic ordinary same-slug invitation role',
        slug: 'porta-invite-service',
      });
      const reserved = { applicationId: fixture.adminApplication.id, roleId: fixture.serviceRole.id };
      const ordinary = [
        ...fixture.target.allowedRoles,
        { applicationId: fixture.application.id, roleId: sameSlug.id },
      ];
      const roles = order === 'reserved only'
        ? [reserved]
        : order === 'reserved first' ? [reserved, ...ordinary] : [...ordinary, reserved];
      const before = await lifecycleSecurityFingerprint();

      await expect(inviteUser({
        organizationId: fixture.target.organizationId,
        input: {
          email: `synthetic-reserved-${randomBytes(8).toString('hex')}@test.example.com`,
          roles,
        },
        actor: {
          kind: 'admin',
          userId: fixture.actor.id,
          displayName: 'Synthetic Admin',
        },
      })).rejects.toThrow();

      expect(await lifecycleSecurityFingerprint()).toBe(before);
      expect(mail.attempts).toBe(0);
    },
  );

  // Even a ceiling that admits the canonical application cannot admit its service-only role.
  it.each(['unrestricted application', 'matching application ceiling'] as const)(
    'should reject reserved preassignments with an %s',
    async (ceiling) => {
      const before = await lifecycleSecurityFingerprint();

      await expect(inviteUser({
        organizationId: fixture.target.organizationId,
        input: {
          email: `synthetic-ceiling-${randomBytes(8).toString('hex')}@test.example.com`,
          roles: [{ applicationId: fixture.adminApplication.id, roleId: fixture.serviceRole.id }],
        },
        actor: {
          kind: 'admin',
          userId: fixture.actor.id,
          displayName: 'Synthetic Admin',
        },
        allowedApplicationId: ceiling === 'matching application ceiling'
          ? fixture.adminApplication.id
          : undefined,
      })).rejects.toThrow();

      expect(await lifecycleSecurityFingerprint()).toBe(before);
      expect(mail.attempts).toBe(0);
    },
  );

  // The same slug outside the canonical application remains a valid ordinary human preassignment.
  it('should preserve ordinary human invitations including an unrelated same-slug role', async () => {
    const sameSlug = await createTestRole(fixture.application.id, {
      name: 'Synthetic ordinary same-slug invitation role',
      slug: 'porta-invite-service',
    });
    const email = `synthetic-ordinary-${randomBytes(8).toString('hex')}@test.example.com`;
    const roles = [
      ...fixture.target.allowedRoles,
      { applicationId: fixture.application.id, roleId: sameSlug.id },
    ];

    await inviteUser({
      organizationId: fixture.target.organizationId,
      input: { email, roles },
      actor: {
        kind: 'admin',
        userId: fixture.actor.id,
        displayName: 'Synthetic Admin',
      },
    });

    const invitations = await getPool().query<{ details: { roles: typeof roles } }>(
      'SELECT details FROM invitation_tokens WHERE organization_id = $1 AND email = $2',
      [fixture.target.organizationId, email],
    );
    expect(invitations.rows).toHaveLength(1);
    expect(invitations.rows[0].details.roles).toEqual(roles);
    const users = await getPool().query<{ count: number }>(
      'SELECT count(*)::int AS count FROM users WHERE organization_id = $1 AND email = $2',
      [fixture.target.organizationId, email],
    );
    expect(users.rows).toEqual([{ count: 0 }]);
    expect(mail.attempts).toBe(1);
  });
});
