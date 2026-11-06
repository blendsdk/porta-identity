/** Integration evidence for canonical Admin role delegation on the invitation path. */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { invalidateApplicationCache } from '../../../src/applications/cache.js';
import { setEmailTransport } from '../../../src/auth/index.js';
import { getPermissionsForAdminRole } from '../../../src/lib/admin-permissions.js';
import { getPool } from '../../../src/lib/database.js';
import { RoleDelegationError } from '../../../src/rbac/errors.js';
import { inviteUser } from '../../../src/users/invite-service.js';
import { seedBaseData, truncateAllTables } from '../helpers/database.js';
import { createTestApplication, createTestOrganization, createTestRole } from '../helpers/factories.js';
import { createHumanAdminFixtures } from '../service-accounts/human-fixtures.js';

beforeEach(async () => {
  await truncateAllTables();
  await seedBaseData();
});

/** Create the canonical fixture and clear any slug cache left by a prior test file. */
async function adminFixtures() {
  const fixtures = await createHumanAdminFixtures();
  await invalidateApplicationCache('porta-admin', fixtures.application.id);
  return fixtures;
}

afterEach(() => {
  setEmailTransport(null);
});

describe('invitation canonical role delegation', () => {
  it('rejects a super-admin pre-assignment from a user-admin actor without creating an invitation', async () => {
    const fixtures = await adminFixtures();
    const target = await createTestOrganization();
    const email = `delegation-denied-${target.id}@example.test`;

    await expect(
      inviteUser({
        organizationId: target.id,
        input: {
          email,
          roles: [
            { applicationId: fixtures.application.id, roleId: fixtures.superAdminRole.id },
          ],
        },
        actor: {
          kind: 'admin',
          userId: fixtures.userAdmin.id,
          displayName: 'User Admin',
          permissions: new Set(getPermissionsForAdminRole('porta-user-admin')),
        },
      }),
    ).rejects.toBeInstanceOf(RoleDelegationError);

    const rows = await getPool().query<{ count: string }>(
      'SELECT count(*)::text AS count FROM invitation_tokens WHERE organization_id = $1',
      [target.id],
    );
    expect(rows.rows[0]?.count).toBe('0');
  });

  it('allows a super-admin actor to pre-assign the canonical role', async () => {
    const fixtures = await adminFixtures();
    const target = await createTestOrganization();
    const email = `delegation-allowed-${target.id}@example.test`;
    setEmailTransport({
      async send() {
        return { accepted: [email], rejected: [] };
      },
    });

    const result = await inviteUser({
      organizationId: target.id,
      input: {
        email,
        roles: [
          { applicationId: fixtures.application.id, roleId: fixtures.superAdminRole.id },
        ],
      },
      actor: {
        kind: 'admin',
        userId: fixtures.superAdmin.id,
        displayName: 'Super Admin',
        permissions: new Set(getPermissionsForAdminRole('porta-super-admin')),
      },
    });

    expect(result.email).toBe(email);
    const rows = await getPool().query<{ count: string }>(
      'SELECT count(*)::text AS count FROM invitation_tokens WHERE organization_id = $1',
      [target.id],
    );
    expect(rows.rows[0]?.count).toBe('1');
  });

  it('does not reject an ordinary application role for a user-admin actor', async () => {
    const fixtures = await adminFixtures();
    const target = await createTestOrganization();
    const ordinaryApplication = await createTestApplication({
      name: 'Ordinary',
      slug: `ordinary-${target.id}`,
    });
    const ordinaryRole = await createTestRole(ordinaryApplication.id, {
      name: `Ordinary role ${target.id}`,
      slug: `ordinary-role-${target.id}`,
    });
    const email = `ordinary-allowed-${target.id}@example.test`;
    setEmailTransport({
      async send() {
        return { accepted: [email], rejected: [] };
      },
    });

    const result = await inviteUser({
      organizationId: target.id,
      input: {
        email,
        roles: [{ applicationId: ordinaryApplication.id, roleId: ordinaryRole.id }],
      },
      actor: {
        kind: 'admin',
        userId: fixtures.userAdmin.id,
        displayName: 'User Admin',
        permissions: new Set(getPermissionsForAdminRole('porta-user-admin')),
      },
    });

    expect(result.email).toBe(email);
  });
});
