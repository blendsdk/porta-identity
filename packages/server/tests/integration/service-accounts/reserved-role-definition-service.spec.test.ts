import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool, runDatabaseTransaction } from '../../../src/lib/database.js';
import {
  createRole,
  deleteRole,
  updateRole,
} from '../../../src/rbac/role-service.js';
import { setServiceAccount } from '../../../src/service-accounts/index.js';
import { createTestRole } from '../helpers/factories.js';
import { lifecycleSecurityFingerprint } from './lifecycle-fixtures.js';
import type { LifecycleFixture } from './lifecycle-fixtures.js';
import {
  createReservedRoleFixture,
  resetReservedRoleRuntime,
} from './reserved-role-fixtures.js';

describe('reserved invitation-only role definition service boundary', () => {
  let fixture: LifecycleFixture;

  beforeEach(async () => {
    fixture = await createReservedRoleFixture();
  });

  afterEach(async () => {
    await resetReservedRoleRuntime();
  });

  // Generic creation cannot manufacture the canonical service definition, even without a collision.
  it('should reject canonical reserved creation when no reserved definition exists', async () => {
    await getPool().query('DELETE FROM roles WHERE id = $1', [fixture.serviceRole.id]);
    const absent = await getPool().query<{ count: number }>(
      'SELECT count(*)::int AS count FROM roles WHERE application_id = $1 AND slug = $2',
      [fixture.adminApplication.id, 'porta-invite-service'],
    );
    expect(absent.rows).toEqual([{ count: 0 }]);
    const before = await lifecycleSecurityFingerprint();

    await expect(createRole({
      applicationId: fixture.adminApplication.id,
      name: 'Synthetic generic service role',
      slug: 'porta-invite-service',
    }, fixture.actor.id)).rejects.toThrow();

    expect(await lifecycleSecurityFingerprint()).toBe(before);
  });

  // Renaming another role must not manufacture the same protected identity through a different API.
  it('should reject renaming an ordinary canonical-application role to the absent reserved slug', async () => {
    await getPool().query('DELETE FROM roles WHERE id = $1', [fixture.serviceRole.id]);
    const ordinary = await createTestRole(fixture.adminApplication.id, {
      name: 'Synthetic ordinary administration role',
      slug: 'synthetic-ordinary-administration',
    });
    const before = await lifecycleSecurityFingerprint();

    await expect(runDatabaseTransaction(() => updateRole(
      fixture.adminApplication.id,
      ordinary.id,
      { slug: 'porta-invite-service' },
      fixture.actor.id,
    ))).rejects.toThrow();

    expect(await lifecycleSecurityFingerprint()).toBe(before);
  });

  // Dedicated memberships and ownership cannot be undermined through generic definition editing.
  it.each([
    { field: 'name', input: { name: 'Synthetic changed service name' } },
    { field: 'slug', input: { slug: 'synthetic-renamed-service' } },
    { field: 'description', input: { description: 'Synthetic changed service description' } },
  ])('should reject a generic $field update of a bound canonical reserved role', async ({ input }) => {
    await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail,
      targets: [fixture.target],
    }, fixture.actor);
    const before = await lifecycleSecurityFingerprint();

    await expect(runDatabaseTransaction(() => updateRole(
      fixture.adminApplication.id,
      fixture.serviceRole.id,
      input,
      fixture.actor.id,
    ))).rejects.toThrow();

    expect(await lifecycleSecurityFingerprint()).toBe(before);
  });

  // Deletion must preserve the owned account's only membership and its durable binding.
  it('should reject generic deletion of a bound canonical reserved role', async () => {
    await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail,
      targets: [fixture.target],
    }, fixture.actor);
    const before = await lifecycleSecurityFingerprint();

    await expect(runDatabaseTransaction(() => deleteRole(
      fixture.adminApplication.id,
      fixture.serviceRole.id,
      fixture.actor.id,
    ))).rejects.toThrow();

    expect(await lifecycleSecurityFingerprint()).toBe(before);
  });

  // Only the canonical application reserves this slug; unrelated application roles remain ordinary.
  it('should allow generic creation, editing and deletion of the same slug in another application', async () => {
    const ordinary = await createRole({
      applicationId: fixture.application.id,
      name: 'Synthetic ordinary same-slug role',
      slug: 'porta-invite-service',
    }, fixture.actor.id);
    const changed = await runDatabaseTransaction(() => updateRole(
      fixture.application.id,
      ordinary.id,
      { name: 'Synthetic updated ordinary role' },
      fixture.actor.id,
    ));
    expect(changed.role).toMatchObject({
      id: ordinary.id,
      slug: 'porta-invite-service',
      name: 'Synthetic updated ordinary role',
    });

    await runDatabaseTransaction(() => deleteRole(
      fixture.application.id,
      ordinary.id,
      fixture.actor.id,
    ));

    const remaining = await getPool().query<{ id: string; slug: string }>(
      'SELECT id, slug FROM roles WHERE id = ANY($1::uuid[]) ORDER BY id',
      [[ordinary.id, fixture.serviceRole.id]],
    );
    expect(remaining.rows).toEqual([{ id: fixture.serviceRole.id, slug: 'porta-invite-service' }]);
  });
});
