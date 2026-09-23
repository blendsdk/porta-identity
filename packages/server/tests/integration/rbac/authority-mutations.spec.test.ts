import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, runDatabaseTransaction } from '../../../src/lib/database.js';
import { observeOperationalLogOutput } from '../../../src/lib/logger.js';
import { getRedis } from '../../../src/lib/redis.js';
import { upsertSession } from '../../../src/lib/session-tracking.js';
import { PostgresAdapter } from '../../../src/oidc/postgres-adapter.js';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClient,
  createTestOrganization,
  createTestPermission,
  createTestRole,
  createTestUser,
} from '../helpers/factories.js';
import { flushTestRedis } from '../helpers/redis.js';

/** Dynamic service mutation signature used while the specification leads implementation. */
type Mutation = (...arguments_: unknown[]) => Promise<unknown>;

/** Database, cache, session, and token records needed to observe one authority mutation. */
interface AuthorityFixture {
  readonly applicationId: string;
  readonly organizationId: string;
  readonly actorId: string;
  readonly targetId: string;
  readonly unrelatedId: string;
  readonly roleId: string;
  readonly permissionId: string;
  readonly targetSessionId: string;
  readonly unrelatedSessionId: string;
  readonly targetArtifactIds: readonly string[];
  readonly unrelatedArtifactIds: readonly string[];
}

/** Load a planned service mutation without assuming its not-yet-final TypeScript signature. */
async function requiredMutation(module: Promise<object>, exportName: string): Promise<Mutation> {
  const loaded = await module;
  const candidate = Reflect.get(loaded, exportName);
  expect(candidate, `${exportName} must be implemented`).toBeTypeOf('function');
  if (typeof candidate !== 'function') throw new Error(`${exportName} is not implemented`);
  return candidate as Mutation;
}

async function assignUserRoles(): Promise<Mutation> {
  return requiredMutation(import('../../../src/rbac/user-role-service.js'), 'assignRolesToUser');
}

async function removeUserRoles(): Promise<Mutation> {
  return requiredMutation(import('../../../src/rbac/user-role-service.js'), 'removeRolesFromUser');
}

async function assignRolePermissions(): Promise<Mutation> {
  return requiredMutation(import('../../../src/rbac/role-service.js'), 'assignPermissionsToRole');
}

async function removeRolePermissions(): Promise<Mutation> {
  return requiredMutation(import('../../../src/rbac/role-service.js'), 'removePermissionsFromRole');
}

async function updateRole(): Promise<Mutation> {
  return requiredMutation(import('../../../src/rbac/role-service.js'), 'updateRole');
}

/** Execute one service mutation inside the same transaction boundary used by production routes. */
async function mutate(operation: Mutation, ...arguments_: unknown[]): Promise<unknown> {
  return runDatabaseTransaction(() => operation(...arguments_));
}

async function assignDirect(userId: string, roleId: string, assignedBy?: string): Promise<void> {
  await getPool().query(
    `INSERT INTO user_roles (user_id, role_id, assigned_by)
     VALUES ($1, $2, $3)`,
    [userId, roleId, assignedBy ?? null],
  );
}

async function grantDirect(roleId: string, permissionId: string): Promise<void> {
  await getPool().query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)', [
    roleId,
    permissionId,
  ]);
}

async function trackedSession(userId: string, organizationId: string): Promise<string> {
  const sessionId = randomUUID();
  await upsertSession({
    sessionId,
    userId,
    organizationId,
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  return sessionId;
}

/** Create durable grant and token records whose survival or removal can be asserted exactly. */
async function storedAuthority(
  userId: string,
  publicClientId: string,
  label: string,
): Promise<readonly string[]> {
  const grantId = `${label}-grant-${randomUUID()}`;
  const accessTokenId = `${label}-access-${randomUUID()}`;
  const refreshTokenId = `${label}-refresh-${randomUUID()}`;
  await new PostgresAdapter('Grant').upsert(
    grantId,
    { accountId: userId, clientId: publicClientId, kind: 'Grant' },
    3600,
  );
  await new PostgresAdapter('AccessToken').upsert(
    accessTokenId,
    { accountId: userId, clientId: publicClientId, grantId, kind: 'AccessToken' },
    3600,
  );
  await new PostgresAdapter('RefreshToken').upsert(
    refreshTokenId,
    { accountId: userId, clientId: publicClientId, grantId, kind: 'RefreshToken' },
    3600,
  );
  return [grantId, accessTokenId, refreshTokenId];
}

/** Create two isolated users and a complete assigned-role authority chain for mutation tests. */
async function createAuthorityFixture(): Promise<AuthorityFixture> {
  const organization = await createTestOrganization();
  const application = await createTestApplication();
  const client = await createTestClient(organization.id, application.id);
  const actor = await createTestUser(organization.id);
  const target = await createTestUser(organization.id);
  const unrelated = await createTestUser(organization.id);
  const role = await createTestRole(application.id);
  const permission = await createTestPermission(application.id);
  await assignDirect(target.id, role.id, actor.id);
  await grantDirect(role.id, permission.id);

  return {
    applicationId: application.id,
    organizationId: organization.id,
    actorId: actor.id,
    targetId: target.id,
    unrelatedId: unrelated.id,
    roleId: role.id,
    permissionId: permission.id,
    targetSessionId: await trackedSession(target.id, organization.id),
    unrelatedSessionId: await trackedSession(unrelated.id, organization.id),
    targetArtifactIds: await storedAuthority(target.id, client.clientId, 'target'),
    unrelatedArtifactIds: await storedAuthority(unrelated.id, client.clientId, 'unrelated'),
  };
}

async function count(sql: string, values: readonly unknown[] = []): Promise<number> {
  const result = await getPool().query<{ count: string }>(sql, [...values]);
  return Number(result.rows[0]?.count ?? 0);
}

async function isRevoked(sessionId: string): Promise<boolean> {
  const result = await getPool().query<{ revoked: boolean }>(
    'SELECT revoked_at IS NOT NULL AS revoked FROM admin_sessions WHERE session_id = $1',
    [sessionId],
  );
  return result.rows[0]?.revoked ?? false;
}

async function artifactsExist(ids: readonly string[]): Promise<number> {
  return count('SELECT COUNT(*) FROM oidc_payloads WHERE id = ANY($1::varchar[])', [ids]);
}

/** Seed both established RBAC cache keys for one user. */
async function seedRbacCache(userId: string, label: string): Promise<void> {
  await getRedis().set(`rbac:user-roles:${userId}`, JSON.stringify([`${label}-role`]));
  await getRedis().set(`rbac:user-perms:${userId}`, JSON.stringify([`${label}:resource:read`]));
}

/** Assert whether both established RBAC cache keys remain present for one user. */
async function expectRbacCache(userId: string, present: boolean): Promise<void> {
  expect(await getRedis().exists(`rbac:user-roles:${userId}`)).toBe(present ? 1 : 0);
  expect(await getRedis().exists(`rbac:user-perms:${userId}`)).toBe(present ? 1 : 0);
}

/** Read the reduction signal without trusting an unknown implementation result shape. */
function reauthenticationRequired(result: unknown): boolean | undefined {
  if (typeof result !== 'object' || result === null) return undefined;
  const value = Reflect.get(result, 'reauthenticationRequired');
  return typeof value === 'boolean' ? value : undefined;
}

/** Yield once so detached post-commit cleanup can run without introducing a fixed delay. */
async function nextImmediate(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await truncateAllTables();
  await seedBaseData();
  await flushTestRedis();
});

describe('application RBAC authority mutations', () => {
  // Adding an ordinary role records its actor and invalidates no other user's authority cache.
  it('commits a user-role addition with actor provenance and targeted cache invalidation', async () => {
    const organization = await createTestOrganization();
    const application = await createTestApplication();
    const actor = await createTestUser(organization.id);
    const target = await createTestUser(organization.id);
    const unrelated = await createTestUser(organization.id);
    const role = await createTestRole(application.id);
    const targetSession = await trackedSession(target.id, organization.id);
    const unrelatedSession = await trackedSession(unrelated.id, organization.id);
    await seedRbacCache(target.id, 'target');
    await seedRbacCache(unrelated.id, 'unrelated');

    await mutate(await assignUserRoles(), organization.id, target.id, [role.id], actor.id);

    const assignment = await getPool().query<{ assignedBy: string | null }>(
      `SELECT assigned_by AS "assignedBy" FROM user_roles WHERE user_id = $1 AND role_id = $2`,
      [target.id, role.id],
    );
    expect(assignment.rows[0]?.assignedBy).toBe(actor.id);
    await expectRbacCache(target.id, false);
    await expectRbacCache(unrelated.id, true);
    expect(await isRevoked(targetSession)).toBe(false);
    expect(await isRevoked(unrelatedSession)).toBe(false);
  });

  // Adding a permission changes future authority without terminating existing authenticated state.
  it('adds a role permission and invalidates only users assigned to that role', async () => {
    const fixture = await createAuthorityFixture();
    const secondPermission = await createTestPermission(fixture.applicationId);
    await seedRbacCache(fixture.targetId, 'target');
    await seedRbacCache(fixture.unrelatedId, 'unrelated');

    await mutate(
      await assignRolePermissions(),
      fixture.applicationId,
      fixture.roleId,
      [secondPermission.id],
      fixture.actorId,
    );

    expect(
      await count(
        'SELECT COUNT(*) FROM role_permissions WHERE role_id = $1 AND permission_id = $2',
        [fixture.roleId, secondPermission.id],
      ),
    ).toBe(1);
    await expectRbacCache(fixture.targetId, false);
    await expectRbacCache(fixture.unrelatedId, true);
    expect(await isRevoked(fixture.targetSessionId)).toBe(false);
    expect(await artifactsExist(fixture.targetArtifactIds)).toBe(3);
  });

  // Removing an assignment revokes only the user whose effective authority was reduced.
  it('removes a user role and revokes only that user session and token state', async () => {
    const fixture = await createAuthorityFixture();

    const result = await mutate(
      await removeUserRoles(),
      fixture.organizationId,
      fixture.targetId,
      [fixture.roleId],
      fixture.actorId,
    );
    await nextImmediate();

    expect(reauthenticationRequired(result)).toBe(false);
    expect(
      await count('SELECT COUNT(*) FROM user_roles WHERE user_id = $1 AND role_id = $2', [
        fixture.targetId,
        fixture.roleId,
      ]),
    ).toBe(0);
    expect(await isRevoked(fixture.targetSessionId)).toBe(true);
    expect(await artifactsExist(fixture.targetArtifactIds)).toBe(0);
    expect(await isRevoked(fixture.unrelatedSessionId)).toBe(false);
    expect(await artifactsExist(fixture.unrelatedArtifactIds)).toBe(3);
  });

  // Removing a permission revokes every assigned user and preserves unrelated authenticated state.
  it('removes a role permission and revokes only users assigned to that role', async () => {
    const fixture = await createAuthorityFixture();

    await mutate(
      await removeRolePermissions(),
      fixture.applicationId,
      fixture.roleId,
      [fixture.permissionId],
      fixture.actorId,
    );
    await nextImmediate();

    expect(
      await count(
        'SELECT COUNT(*) FROM role_permissions WHERE role_id = $1 AND permission_id = $2',
        [fixture.roleId, fixture.permissionId],
      ),
    ).toBe(0);
    expect(await isRevoked(fixture.targetSessionId)).toBe(true);
    expect(await artifactsExist(fixture.targetArtifactIds)).toBe(0);
    expect(await isRevoked(fixture.unrelatedSessionId)).toBe(false);
    expect(await artifactsExist(fixture.unrelatedArtifactIds)).toBe(3);
  });

  // Idempotent removals are committed no-ops and cannot terminate authenticated state.
  it('returns no reauthentication for absent user-role and role-permission mappings', async () => {
    const fixture = await createAuthorityFixture();
    const absentRole = await createTestRole(fixture.applicationId);
    const absentPermission = await createTestPermission(fixture.applicationId);

    const userResult = await mutate(
      await removeUserRoles(),
      fixture.organizationId,
      fixture.targetId,
      [absentRole.id],
      fixture.actorId,
    );
    const permissionResult = await mutate(
      await removeRolePermissions(),
      fixture.applicationId,
      fixture.roleId,
      [absentPermission.id],
      fixture.actorId,
    );

    expect(reauthenticationRequired(userResult)).toBe(false);
    expect(reauthenticationRequired(permissionResult)).toBe(false);
    expect(await isRevoked(fixture.targetSessionId)).toBe(false);
    expect(await artifactsExist(fixture.targetArtifactIds)).toBe(3);
  });

  // Only an actual slug change reduces live role claims; metadata edits do not.
  it('revokes assigned users for a slug change but not a name or description change', async () => {
    const slugFixture = await createAuthorityFixture();
    const metadataFixture = await createAuthorityFixture();

    const slugResult = await mutate(
      await updateRole(),
      slugFixture.applicationId,
      slugFixture.roleId,
      { slug: `changed-${randomUUID().slice(0, 8)}` },
      slugFixture.actorId,
    );
    const metadataResult = await mutate(
      await updateRole(),
      metadataFixture.applicationId,
      metadataFixture.roleId,
      { name: 'Renamed role', description: 'Metadata only' },
      metadataFixture.actorId,
    );
    await nextImmediate();

    expect(reauthenticationRequired(slugResult)).toBe(false);
    expect(reauthenticationRequired(metadataResult)).toBe(false);
    expect(await isRevoked(slugFixture.targetSessionId)).toBe(true);
    expect(await artifactsExist(slugFixture.targetArtifactIds)).toBe(0);
    expect(await isRevoked(metadataFixture.targetSessionId)).toBe(false);
    expect(await artifactsExist(metadataFixture.targetArtifactIds)).toBe(3);
  });

  // The result is true exactly when the committed reduction includes the authenticated actor.
  it('reports reauthentication only when the actor is in the affected-user set', async () => {
    const affectedActor = await createAuthorityFixture();
    await assignDirect(affectedActor.actorId, affectedActor.roleId, affectedActor.actorId);
    const actorSession = await trackedSession(affectedActor.actorId, affectedActor.organizationId);
    const unaffectedActor = await createAuthorityFixture();

    const affected = await mutate(
      await removeUserRoles(),
      affectedActor.organizationId,
      affectedActor.actorId,
      [affectedActor.roleId],
      affectedActor.actorId,
    );
    const unaffected = await mutate(
      await removeUserRoles(),
      unaffectedActor.organizationId,
      unaffectedActor.targetId,
      [unaffectedActor.roleId],
      unaffectedActor.actorId,
    );

    expect(reauthenticationRequired(affected)).toBe(true);
    expect(reauthenticationRequired(unaffected)).toBe(false);
    expect(await isRevoked(actorSession)).toBe(true);
  });

  // Competing final-holder removals serialize on one control-plane invariant.
  it('preserves one exact active canonical super-admin under concurrent removals', async () => {
    const control = await getPool().query<{ id: string }>(
      "SELECT id FROM organizations WHERE slug = 'porta-admin'",
    );
    const organizationId = control.rows[0]!.id;
    const application = await createTestApplication({ name: 'Porta Admin', slug: 'porta-admin' });
    const role = await createTestRole(application.id, {
      name: 'Porta Super Admin',
      slug: 'porta-super-admin',
    });
    const first = await createTestUser(organizationId, { status: 'active' });
    const second = await createTestUser(organizationId, { status: 'active' });
    await assignDirect(first.id, role.id, first.id);
    await assignDirect(second.id, role.id, second.id);
    const remove = await removeUserRoles();

    const outcomes = await Promise.allSettled([
      mutate(remove, organizationId, first.id, [role.id], first.id),
      mutate(remove, organizationId, second.id, [role.id], second.id),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(
      await count(
        `SELECT COUNT(*) FROM user_roles ur
         JOIN users u ON u.id = ur.user_id
         JOIN roles r ON r.id = ur.role_id
         WHERE u.organization_id = $1 AND u.status = 'active'
           AND r.application_id = $2 AND r.slug = 'porta-super-admin'`,
        [organizationId, application.id],
      ),
    ).toBe(1);
  });

  // A concurrent assignment is either captured by the reduction or receives no removed permission.
  it('cannot leave stale effective authority when assignment races permission removal', async () => {
    const fixture = await createAuthorityFixture();
    const racingUser = await createTestUser(fixture.organizationId);
    const racingSession = await trackedSession(racingUser.id, fixture.organizationId);
    const assign = await assignUserRoles();
    const remove = await removeRolePermissions();

    await Promise.all([
      mutate(assign, fixture.organizationId, racingUser.id, [fixture.roleId], fixture.actorId),
      mutate(
        remove,
        fixture.applicationId,
        fixture.roleId,
        [fixture.permissionId],
        fixture.actorId,
      ),
    ]);

    const effective = await count(
      `SELECT COUNT(*) FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       WHERE ur.user_id = $1 AND rp.permission_id = $2`,
      [racingUser.id, fixture.permissionId],
    );
    expect(effective).toBe(0);
    expect(await isRevoked(fixture.targetSessionId)).toBe(true);
    if (await isRevoked(racingSession)) {
      expect(
        await count('SELECT COUNT(*) FROM user_roles WHERE user_id = $1 AND role_id = $2', [
          racingUser.id,
          fixture.roleId,
        ]),
      ).toBe(1);
    }
  });

  // Redis cleanup is detached from the committed database authority decision and logs no IDs.
  it('keeps a committed reduction authoritative when post-commit Redis cleanup fails', async () => {
    const fixture = await createAuthorityFixture();
    await seedRbacCache(fixture.targetId, 'target');
    const observed: string[] = [];
    const stopObserving = observeOperationalLogOutput((entry) => observed.push(entry));
    const deletionFailure = vi.spyOn(getRedis(), 'del').mockRejectedValue(new Error('redis down'));

    try {
      await mutate(
        await removeUserRoles(),
        fixture.organizationId,
        fixture.targetId,
        [fixture.roleId],
        fixture.actorId,
      );
      await nextImmediate();
      await nextImmediate();
    } finally {
      deletionFailure.mockRestore();
      stopObserving();
    }

    expect(
      await count('SELECT COUNT(*) FROM user_roles WHERE user_id = $1 AND role_id = $2', [
        fixture.targetId,
        fixture.roleId,
      ]),
    ).toBe(0);
    expect(await isRevoked(fixture.targetSessionId)).toBe(true);
    expect(await artifactsExist(fixture.targetArtifactIds)).toBe(0);
    const cleanupWarnings = observed.filter((entry) =>
      entry.includes('authority-redis-cleanup-failed'),
    );
    expect(cleanupWarnings).toHaveLength(1);
    expect(cleanupWarnings[0]).not.toContain(fixture.targetId);
    expect(cleanupWarnings[0]).not.toContain(fixture.roleId);
    expect(cleanupWarnings[0]).not.toContain(fixture.actorId);
  });
});
