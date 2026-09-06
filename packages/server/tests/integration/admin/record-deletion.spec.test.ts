import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getPool, runDatabaseTransaction } from '../../../src/lib/database.js';
import { getRedis } from '../../../src/lib/redis.js';
import { upsertSession } from '../../../src/lib/session-tracking.js';
import { PostgresAdapter } from '../../../src/oidc/postgres-adapter.js';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClaimDefinition,
  createTestClient,
  createTestClientWithSecret,
  createTestOrganization,
  createTestPermission,
  createTestRole,
  createTestUser,
} from '../helpers/factories.js';
import { flushTestRedis } from '../helpers/redis.js';

type DeleteOperation = (...identifiers: string[]) => Promise<unknown>;

async function requiredExport(
  module: Promise<object>,
  exportName: string,
): Promise<DeleteOperation> {
  const loaded = await module;
  const candidate = Reflect.get(loaded, exportName);
  expect(candidate, `${exportName} must be implemented`).toBeTypeOf('function');
  if (typeof candidate !== 'function') throw new Error(`${exportName} is not implemented`);
  return candidate as DeleteOperation;
}

async function deleteOrganization(): Promise<DeleteOperation> {
  return requiredExport(import('../../../src/organizations/service.js'), 'deleteOrganization');
}

async function deleteOrganizationRepository(): Promise<DeleteOperation> {
  return requiredExport(import('../../../src/organizations/repository.js'), 'deleteOrganization');
}

async function deleteApplication(): Promise<DeleteOperation> {
  return requiredExport(import('../../../src/applications/service.js'), 'deleteApplication');
}

async function deleteModule(): Promise<DeleteOperation> {
  return requiredExport(import('../../../src/applications/service.js'), 'deleteModule');
}

async function deleteClient(): Promise<DeleteOperation> {
  return requiredExport(import('../../../src/clients/service.js'), 'deleteClient');
}

async function deleteRole(): Promise<DeleteOperation> {
  return requiredExport(import('../../../src/rbac/role-service.js'), 'deleteRole');
}

async function deletePermission(): Promise<DeleteOperation> {
  return requiredExport(import('../../../src/rbac/permission-service.js'), 'deletePermission');
}

async function deleteClaim(): Promise<DeleteOperation> {
  return requiredExport(import('../../../src/custom-claims/service.js'), 'deleteDefinition');
}

async function deleteUser(): Promise<DeleteOperation> {
  return requiredExport(import('../../../src/users/service.js'), 'deleteUser');
}

async function inMutation(operation: DeleteOperation, ...identifiers: string[]): Promise<unknown> {
  return runDatabaseTransaction(() => operation(...identifiers));
}

async function createModule(applicationId: string, name = 'Billing'): Promise<string> {
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO application_modules (id, application_id, name, slug)
     VALUES ($1, $2, $3, $4)`,
    [id, applicationId, name, `${name.toLowerCase()}-${id.slice(0, 8)}`],
  );
  return id;
}

async function assignRole(userId: string, roleId: string): Promise<void> {
  await getPool().query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [
    userId,
    roleId,
  ]);
}

async function grantPermission(roleId: string, permissionId: string): Promise<void> {
  await getPool().query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)', [
    roleId,
    permissionId,
  ]);
}

async function setClaimValue(userId: string, claimId: string): Promise<void> {
  await getPool().query(
    `INSERT INTO custom_claim_values (user_id, claim_id, value)
     VALUES ($1, $2, $3::jsonb)`,
    [userId, claimId, JSON.stringify('test-value')],
  );
}

async function track(userId: string, organizationId: string): Promise<string> {
  const sessionId = randomUUID();
  await upsertSession({
    sessionId,
    userId,
    organizationId,
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  return sessionId;
}

async function scalar(sql: string, values: readonly unknown[] = []): Promise<number> {
  const result = await getPool().query<{ count: string }>(sql, [...values]);
  return Number(result.rows[0]?.count ?? 0);
}

async function revoked(sessionId: string): Promise<boolean | null> {
  const result = await getPool().query<{ revoked: boolean }>(
    `SELECT revoked_at IS NOT NULL AS revoked FROM admin_sessions WHERE session_id = $1`,
    [sessionId],
  );
  return result.rows[0]?.revoked ?? null;
}

async function nextImmediate(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('immutable record deletion integration contract', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();
  });

  it('deletes an organization-owned graph while preserving global applications and other tenants', async () => {
    const remove = await deleteOrganization();
    const targetOrg = await createTestOrganization();
    const otherOrg = await createTestOrganization();
    const application = await createTestApplication();
    const targetClient = await createTestClient(targetOrg.id, application.id);
    const otherClient = await createTestClient(otherOrg.id, application.id);
    const targetUser = await createTestUser(targetOrg.id);
    const otherUser = await createTestUser(otherOrg.id);
    const targetSession = await track(targetUser.id, targetOrg.id);
    const otherSession = await track(otherUser.id, otherOrg.id);

    await inMutation(remove, targetOrg.id, otherUser.id);

    expect(await scalar('SELECT COUNT(*) FROM organizations WHERE id = $1', [targetOrg.id])).toBe(
      0,
    );
    expect(await scalar('SELECT COUNT(*) FROM users WHERE id = $1', [targetUser.id])).toBe(0);
    expect(await scalar('SELECT COUNT(*) FROM clients WHERE id = $1', [targetClient.id])).toBe(0);
    expect(await scalar('SELECT COUNT(*) FROM applications WHERE id = $1', [application.id])).toBe(
      1,
    );
    expect(await scalar('SELECT COUNT(*) FROM clients WHERE id = $1', [otherClient.id])).toBe(1);
    expect(await scalar('SELECT COUNT(*) FROM users WHERE id = $1', [otherUser.id])).toBe(1);
    expect(await revoked(targetSession)).toBeNull();
    expect(await revoked(otherSession)).toBe(false);
  });

  it('deletes an application graph across organizations and revokes exactly affected users', async () => {
    const remove = await deleteApplication();
    const orgA = await createTestOrganization();
    const orgB = await createTestOrganization();
    const app = await createTestApplication();
    const otherApp = await createTestApplication();
    const clientA = await createTestClient(orgA.id, app.id);
    const clientB = await createTestClient(orgB.id, app.id);
    const otherClient = await createTestClient(orgA.id, otherApp.id);
    const affectedA = await createTestUser(orgA.id);
    const affectedB = await createTestUser(orgB.id);
    const unrelated = await createTestUser(orgA.id);
    const role = await createTestRole(app.id);
    const permission = await createTestPermission(app.id);
    const claim = await createTestClaimDefinition(app.id);
    await assignRole(affectedA.id, role.id);
    await grantPermission(role.id, permission.id);
    await setClaimValue(affectedB.id, claim.id);
    const sessionA = await track(affectedA.id, orgA.id);
    const sessionB = await track(affectedB.id, orgB.id);
    const unrelatedSession = await track(unrelated.id, orgA.id);
    const grantId = randomUUID();
    await new PostgresAdapter('Grant').upsert(
      grantId,
      { clientId: clientA.clientId, accountId: affectedA.id },
      3600,
    );
    const redis = getRedis();
    await redis.set(`app:id:${app.id}`, JSON.stringify(app));
    await redis.set(`app:id:${otherApp.id}`, JSON.stringify(otherApp));

    await inMutation(remove, app.id, unrelated.id);
    await nextImmediate();

    expect(await scalar('SELECT COUNT(*) FROM applications WHERE id = $1', [app.id])).toBe(0);
    expect(
      await scalar('SELECT COUNT(*) FROM clients WHERE id = ANY($1::uuid[])', [
        [clientA.id, clientB.id],
      ]),
    ).toBe(0);
    expect(await scalar('SELECT COUNT(*) FROM roles WHERE id = $1', [role.id])).toBe(0);
    expect(await scalar('SELECT COUNT(*) FROM permissions WHERE id = $1', [permission.id])).toBe(0);
    expect(
      await scalar('SELECT COUNT(*) FROM custom_claim_definitions WHERE id = $1', [claim.id]),
    ).toBe(0);
    expect(await scalar('SELECT COUNT(*) FROM oidc_payloads WHERE id = $1', [grantId])).toBe(0);
    expect(await revoked(sessionA)).toBe(true);
    expect(await revoked(sessionB)).toBe(true);
    expect(await revoked(unrelatedSession)).toBe(false);
    expect(await scalar('SELECT COUNT(*) FROM clients WHERE id = $1', [otherClient.id])).toBe(1);
    expect(await redis.get(`app:id:${app.id}`)).toBeNull();
    expect(await redis.get(`app:id:${otherApp.id}`)).not.toBeNull();
    const audit = await getPool().query<{ metadata: unknown }>(
      "SELECT metadata FROM audit_log WHERE event_type = 'app.deleted'",
    );
    expect(audit.rows).toHaveLength(1);
    const serializedAudit = JSON.stringify(audit.rows[0]?.metadata);
    expect(serializedAudit).not.toContain(affectedA.email);
    expect(serializedAudit).not.toContain(affectedB.email);
    expect(serializedAudit).not.toContain(grantId);
    expect(serializedAudit).not.toContain(`app:id:${app.id}`);
  });

  it('parent-qualifies module deletion and cascades only owned permissions and links', async () => {
    const remove = await deleteModule();
    const org = await createTestOrganization();
    const app = await createTestApplication();
    const wrongApp = await createTestApplication();
    const moduleId = await createModule(app.id);
    const affected = await createTestUser(org.id);
    const unrelated = await createTestUser(org.id);
    const role = await createTestRole(app.id);
    const permission = await createTestPermission(app.id, { moduleId });
    const otherPermission = await createTestPermission(app.id);
    await assignRole(affected.id, role.id);
    await grantPermission(role.id, permission.id);
    await grantPermission(role.id, otherPermission.id);
    const affectedSession = await track(affected.id, org.id);
    const unrelatedSession = await track(unrelated.id, org.id);

    await expect(inMutation(remove, wrongApp.id, moduleId, unrelated.id)).rejects.toThrow();
    expect(await scalar('SELECT COUNT(*) FROM application_modules WHERE id = $1', [moduleId])).toBe(
      1,
    );

    await inMutation(remove, app.id, moduleId, unrelated.id);
    expect(await scalar('SELECT COUNT(*) FROM application_modules WHERE id = $1', [moduleId])).toBe(
      0,
    );
    expect(await scalar('SELECT COUNT(*) FROM permissions WHERE id = $1', [permission.id])).toBe(0);
    expect(
      await scalar('SELECT COUNT(*) FROM role_permissions WHERE permission_id = $1', [
        permission.id,
      ]),
    ).toBe(0);
    expect(
      await scalar('SELECT COUNT(*) FROM permissions WHERE id = $1', [otherPermission.id]),
    ).toBe(1);
    expect(await scalar('SELECT COUNT(*) FROM roles WHERE id = $1', [role.id])).toBe(1);
    expect(await revoked(affectedSession)).toBe(true);
    expect(await revoked(unrelatedSession)).toBe(false);
  });

  it('deletes a client, its secrets, and identifiable protocol state without revoking user sessions', async () => {
    const remove = await deleteClient();
    const org = await createTestOrganization();
    const app = await createTestApplication();
    const user = await createTestUser(org.id);
    const { client } = await createTestClientWithSecret(org.id, app.id);
    const otherClient = await createTestClient(org.id, app.id);
    const sessionId = await track(user.id, org.id);
    const grantId = randomUUID();
    const accessTokenId = randomUUID();
    await new PostgresAdapter('Grant').upsert(
      grantId,
      { clientId: client.clientId, accountId: user.id },
      3600,
    );
    await new PostgresAdapter('AccessToken').upsert(
      accessTokenId,
      { clientId: client.clientId, accountId: user.id, grantId },
      3600,
    );

    await inMutation(remove, client.id, user.id);

    expect(await scalar('SELECT COUNT(*) FROM clients WHERE id = $1', [client.id])).toBe(0);
    expect(
      await scalar('SELECT COUNT(*) FROM client_secrets WHERE client_id = $1', [client.id]),
    ).toBe(0);
    expect(
      await scalar('SELECT COUNT(*) FROM oidc_payloads WHERE id = ANY($1::varchar[])', [
        [grantId, accessTokenId],
      ]),
    ).toBe(0);
    expect(await scalar('SELECT COUNT(*) FROM clients WHERE id = $1', [otherClient.id])).toBe(1);
    expect(await revoked(sessionId)).toBe(false);
  });

  it('parent-qualifies role deletion, removes links, and emits no second event on repeat', async () => {
    const remove = await deleteRole();
    const org = await createTestOrganization();
    const app = await createTestApplication();
    const wrongApp = await createTestApplication();
    const user = await createTestUser(org.id);
    const role = await createTestRole(app.id);
    const permission = await createTestPermission(app.id);
    await assignRole(user.id, role.id);
    await grantPermission(role.id, permission.id);
    const sessionId = await track(user.id, org.id);

    await expect(inMutation(remove, wrongApp.id, role.id, user.id)).rejects.toThrow();
    await inMutation(remove, app.id, role.id, user.id);
    await expect(inMutation(remove, app.id, role.id, user.id)).rejects.toThrow();

    expect(await scalar('SELECT COUNT(*) FROM roles WHERE id = $1', [role.id])).toBe(0);
    expect(await scalar('SELECT COUNT(*) FROM user_roles WHERE role_id = $1', [role.id])).toBe(0);
    expect(
      await scalar('SELECT COUNT(*) FROM role_permissions WHERE role_id = $1', [role.id]),
    ).toBe(0);
    expect(await scalar("SELECT COUNT(*) FROM audit_log WHERE event_type = 'role.deleted'")).toBe(
      1,
    );
    expect(await revoked(sessionId)).toBe(true);
  });

  it('parent-qualifies permission deletion and preserves the role and unrelated authority', async () => {
    const remove = await deletePermission();
    const org = await createTestOrganization();
    const app = await createTestApplication();
    const wrongApp = await createTestApplication();
    const affected = await createTestUser(org.id);
    const unrelated = await createTestUser(org.id);
    const role = await createTestRole(app.id);
    const permission = await createTestPermission(app.id);
    await assignRole(affected.id, role.id);
    await grantPermission(role.id, permission.id);
    const affectedSession = await track(affected.id, org.id);
    const unrelatedSession = await track(unrelated.id, org.id);

    await expect(inMutation(remove, wrongApp.id, permission.id, unrelated.id)).rejects.toThrow();
    await inMutation(remove, app.id, permission.id, unrelated.id);

    expect(await scalar('SELECT COUNT(*) FROM permissions WHERE id = $1', [permission.id])).toBe(0);
    expect(await scalar('SELECT COUNT(*) FROM roles WHERE id = $1', [role.id])).toBe(1);
    expect(await scalar('SELECT COUNT(*) FROM user_roles WHERE role_id = $1', [role.id])).toBe(1);
    expect(await revoked(affectedSession)).toBe(true);
    expect(await revoked(unrelatedSession)).toBe(false);
  });

  it('parent-qualifies claim deletion, removes values, and revokes only value owners', async () => {
    const remove = await deleteClaim();
    const org = await createTestOrganization();
    const app = await createTestApplication();
    const wrongApp = await createTestApplication();
    const affected = await createTestUser(org.id);
    const unrelated = await createTestUser(org.id);
    const claim = await createTestClaimDefinition(app.id);
    await setClaimValue(affected.id, claim.id);
    const affectedSession = await track(affected.id, org.id);
    const unrelatedSession = await track(unrelated.id, org.id);

    await expect(inMutation(remove, wrongApp.id, claim.id, unrelated.id)).rejects.toThrow();
    await inMutation(remove, app.id, claim.id, unrelated.id);

    expect(
      await scalar('SELECT COUNT(*) FROM custom_claim_definitions WHERE id = $1', [claim.id]),
    ).toBe(0);
    expect(
      await scalar('SELECT COUNT(*) FROM custom_claim_values WHERE claim_id = $1', [claim.id]),
    ).toBe(0);
    expect(await scalar('SELECT COUNT(*) FROM users WHERE id = $1', [affected.id])).toBe(1);
    expect(await revoked(affectedSession)).toBe(true);
    expect(await revoked(unrelatedSession)).toBe(false);
  });

  it('physically deletes the current user within the exact organization and retains nullable audit history', async () => {
    const remove = await deleteUser();
    const org = await createTestOrganization();
    const wrongOrg = await createTestOrganization();
    const user = await createTestUser(org.id);
    const unrelated = await createTestUser(org.id);
    const unrelatedSession = await track(unrelated.id, org.id);
    await getPool().query(
      `INSERT INTO audit_log (organization_id, user_id, actor_id, event_type, event_category, metadata)
       VALUES ($1, $2, $2, 'user.updated', 'admin', $3::jsonb)`,
      [org.id, user.id, JSON.stringify({ email: user.email })],
    );

    await expect(inMutation(remove, wrongOrg.id, user.id, user.id)).rejects.toThrow();
    await inMutation(remove, org.id, user.id, user.id);

    expect(await scalar('SELECT COUNT(*) FROM users WHERE id = $1', [user.id])).toBe(0);
    expect(
      await scalar(
        "SELECT COUNT(*) FROM audit_log WHERE event_type = 'user.updated' AND user_id IS NULL AND actor_id IS NULL",
      ),
    ).toBe(1);
    expect(
      await scalar(
        "SELECT COUNT(*) FROM audit_log WHERE event_type = 'user.deleted' AND actor_id IS NULL",
      ),
    ).toBe(1);
    expect(await revoked(unrelatedSession)).toBe(false);
  });

  it('rejects control-plane organization deletion at both service and repository boundaries', async () => {
    const serviceRemove = await deleteOrganization();
    const repositoryRemove = await deleteOrganizationRepository();
    const result = await getPool().query<{ id: string }>(
      "SELECT id FROM organizations WHERE slug = 'porta-admin'",
    );
    const controlPlaneId = result.rows[0]!.id;

    await expect(inMutation(serviceRemove, controlPlaneId, randomUUID())).rejects.toThrow();
    await expect(inMutation(repositoryRemove, controlPlaneId)).rejects.toThrow();
    expect(await scalar('SELECT COUNT(*) FROM organizations WHERE id = $1', [controlPlaneId])).toBe(
      1,
    );
  });

  it('serializes concurrent deletion of the last two exact active porta-super-admin users', async () => {
    const remove = await deleteUser();
    const control = await getPool().query<{ id: string }>(
      "SELECT id FROM organizations WHERE slug = 'porta-admin'",
    );
    const controlPlaneId = control.rows[0]!.id;
    const application = await createTestApplication({ slug: 'porta-admin', name: 'Porta Admin' });
    const role = await createTestRole(application.id, {
      slug: 'porta-super-admin',
      name: 'Porta Super Admin',
    });
    const first = await createTestUser(controlPlaneId, { status: 'active' });
    const second = await createTestUser(controlPlaneId, { status: 'active' });
    await assignRole(first.id, role.id);
    await assignRole(second.id, role.id);

    const outcomes = await Promise.allSettled([
      inMutation(remove, controlPlaneId, first.id, first.id),
      inMutation(remove, controlPlaneId, second.id, second.id),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(
      await scalar(
        `SELECT COUNT(*) FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
         WHERE u.organization_id = $1 AND u.status = 'active'
           AND r.slug = 'porta-super-admin' AND r.application_id = $2`,
        [controlPlaneId, application.id],
      ),
    ).toBe(1);
  });

  it('rolls back dependencies, tracking, and audit and schedules no Redis work after a pre-commit failure', async () => {
    const remove = await deleteApplication();
    const org = await createTestOrganization();
    const app = await createTestApplication();
    const user = await createTestUser(org.id);
    const role = await createTestRole(app.id);
    await assignRole(user.id, role.id);
    const sessionId = await track(user.id, org.id);
    const redisKey = `app:id:${app.id}`;
    await getRedis().set(redisKey, JSON.stringify(app));
    const blockerTable = `deletion_blocker_${randomUUID().replaceAll('-', '')}`;

    try {
      await getPool().query(
        `CREATE TABLE ${blockerTable} (
           application_id UUID PRIMARY KEY REFERENCES applications(id) ON DELETE RESTRICT
         )`,
      );
      await getPool().query(`INSERT INTO ${blockerTable} (application_id) VALUES ($1)`, [app.id]);

      await expect(inMutation(remove, app.id, user.id)).rejects.toThrow();
      await nextImmediate();

      expect(await scalar('SELECT COUNT(*) FROM applications WHERE id = $1', [app.id])).toBe(1);
      expect(await scalar('SELECT COUNT(*) FROM roles WHERE id = $1', [role.id])).toBe(1);
      expect(await revoked(sessionId)).toBe(false);
      expect(await scalar("SELECT COUNT(*) FROM audit_log WHERE event_type = 'app.deleted'")).toBe(
        0,
      );
      expect(await getRedis().get(redisKey)).not.toBeNull();
    } finally {
      await getPool().query(`DROP TABLE IF EXISTS ${blockerTable}`);
    }
  });
});
