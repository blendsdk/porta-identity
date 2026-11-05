/** Synthetic database fixtures for permanent separation from human account flows. */
import { randomBytes, randomUUID } from 'node:crypto';
import { getPool } from '../../../src/lib/database.js';
import { getRedis } from '../../../src/lib/redis.js';
import { protectRecoveryAddress } from '../../../src/auth/recovery-crypto.js';
import { createRecoveryJobRepository } from '../../../src/auth/recovery-job-repository.js';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClient,
  createTestPermission,
  createTestRole,
  createTestUser,
  createTestUserWithPassword,
} from '../helpers/factories.js';

/** Both public recovery intents must remain unavailable to classified accounts. */
export const HUMAN_RECOVERY_KINDS = ['magic_link', 'password_reset'] as const;

/** The existing recovery queue's supported human authentication intents. */
export type HumanRecoveryKind = (typeof HUMAN_RECOVERY_KINDS)[number];

/** Reset only the isolated database managed by the integration test worker. */
export async function resetHumanFixtures(): Promise<void> {
  if (process.env.NODE_ENV !== 'test' || !process.env.TEST_REDIS_URL ||
      process.env.TEST_REDIS_URL !== process.env.REDIS_URL) {
    throw new Error('Human fixtures require an explicit matching isolated test Redis database');
  }
  await truncateAllTables();
  // Factory SQL bypasses production deletion cleanup; no prior fixture's canonical app may survive.
  await getRedis().flushdb();
  await seedBaseData();
}

/** Find the seeded control-plane organization without inferring authority from its slug. */
export async function controlPlaneOrganizationId(): Promise<string> {
  const result = await getPool().query<{ id: string }>(
    'SELECT id FROM organizations WHERE is_super_admin = TRUE',
  );
  const organization = result.rows[0];
  if (result.rows.length !== 1 || !organization) {
    throw new Error('The isolated fixture requires one control-plane organization');
  }
  return organization.id;
}

/** Generate an unrelated, strong password for each synthetic account or attempted change. */
export function humanFixturePassword(): string {
  return `Synthetic!9-${randomBytes(16).toString('hex')}`;
}

/**
 * Classify an owned fixture after its human credentials or artifacts already exist.
 * This SQL is not a product conversion path: it models old artifacts and stale caches.
 */
export async function classifyFixtureUser(userId: string): Promise<void> {
  await getPool().query('UPDATE users SET is_service_account = TRUE WHERE id = $1', [userId]);
}

/** Add memberships directly so rejection tests need no privileged production mutation. */
export async function addFixtureMemberships(userId: string, roleIds: readonly string[]): Promise<void> {
  await getPool().query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1::uuid, role_id FROM unnest($2::uuid[]) AS role_id`,
    [userId, roleIds],
  );
}

/**
 * Build live canonical role memberships and a matching invitation permission ceiling.
 * The reserved role's sole permission is an independent fixture expectation, not a
 * copy of a runtime permission table. No human receives that reserved role here.
 */
export async function createHumanAdminFixtures() {
  const organizationId = await controlPlaneOrganizationId();
  const application = await createTestApplication({ name: 'Porta Admin', slug: 'porta-admin' });
  const invitationPermission = await createTestPermission(application.id, {
    name: 'Invite users',
    slug: 'admin:user:invite',
  });
  const reservedRole = await createTestRole(application.id, {
    name: 'Invitation service',
    slug: 'porta-invite-service',
  });
  const superAdminRole = await createTestRole(application.id, {
    name: 'Super Admin',
    slug: 'porta-super-admin',
  });
  const userAdminRole = await createTestRole(application.id, {
    name: 'User Admin',
    slug: 'porta-user-admin',
  });
  await getPool().query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT role_id, $1::uuid FROM unnest($2::uuid[]) AS role_id`,
    [invitationPermission.id, [reservedRole.id, superAdminRole.id, userAdminRole.id]],
  );
  for (const slug of ['admin:user:read', 'admin:user:lifecycle']) {
    const permission = await createTestPermission(application.id, { name: slug, slug });
    await getPool().query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT role_id, $1::uuid FROM unnest($2::uuid[]) AS role_id`,
      [permission.id, [superAdminRole.id, userAdminRole.id]],
    );
  }
  const superAdmin = await createTestUser(organizationId);
  const userAdmin = await createTestUser(organizationId);
  await addFixtureMemberships(superAdmin.id, [superAdminRole.id]);
  await addFixtureMemberships(userAdmin.id, [userAdminRole.id]);
  return {
    organizationId,
    application,
    invitationPermission,
    reservedRole,
    superAdminRole,
    userAdminRole,
    superAdmin,
    userAdmin,
  };
}

/**
 * Create an owned, schema-valid binding without depending on provisioning behavior.
 * An active binding owns an active account; a revoked one owns an inactive account.
 * A retained password deliberately stresses human-denial guards, not provisioning.
 */
export async function createClassifiedBindingFixture(
  organizationId: string,
  applicationId: string,
  targetOrganizationId: string,
  status: 'active' | 'revoked',
) {
  const { user, password } = await createTestUserWithPassword(
    organizationId,
    humanFixturePassword(),
  );
  await classifyFixtureUser(user.id);
  await getPool().query('UPDATE users SET status = $2 WHERE id = $1', [
    user.id,
    status === 'active' ? 'active' : 'inactive',
  ]);
  const client = await createTestClient(organizationId, applicationId, {
    grantTypes: ['client_credentials'],
    responseTypes: [],
    tokenEndpointAuthMethod: 'client_secret_basic',
    requirePkce: false,
  });
  const bindingId = randomUUID();
  await getPool().query(
    `INSERT INTO client_service_accounts
       (id, client_id, account_id, authorization_version, status, targets)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      bindingId,
      client.id,
      user.id,
      randomUUID(),
      status,
      JSON.stringify([
        { organizationId: targetOrganizationId, allowedRoles: [], allowedClaimDefinitions: [] },
      ]),
    ],
  );
  return { user, password, client, bindingId };
}

/**
 * Compare an entire stored account without returning its password hash to test output.
 * The database computes the fingerprint, including lifecycle and login metadata.
 */
export async function humanUserFingerprint(userId: string): Promise<string> {
  const result = await getPool().query<{ fingerprint: string }>(
    'SELECT md5(to_jsonb(account)::text) AS fingerprint FROM users AS account WHERE id = $1',
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new Error('The synthetic account is missing');
  return row.fingerprint;
}

/** Count persistent sessions without exposing session identifiers or payloads. */
export async function humanSessionCounts(userId: string) {
  const result = await getPool().query<{ oidc: number; admin: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM oidc_payloads WHERE type = 'Session') AS oidc,
       (SELECT COUNT(*)::int FROM admin_sessions WHERE user_id = $1) AS admin`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Session fixture counts are unavailable');
  return row;
}

/**
 * Enqueue a real protected recovery request while leaving account lookup to the worker.
 * A unique digest prevents another test's idempotency key from deciding the result.
 */
export async function enqueueHumanRecovery(
  organizationId: string,
  email: string,
  jobType: HumanRecoveryKind,
) {
  const context = {
    organizationId,
    jobType,
    interactionUid: null,
    idempotencyDigest: randomBytes(32).toString('hex'),
  };
  const protectedAddress = await protectRecoveryAddress(email, context);
  const result = await createRecoveryJobRepository().enqueue({
    ...context,
    protectedAddress,
    availableAt: new Date(Date.now() - 1_000),
  });
  if (!result.inserted) throw new Error('The synthetic recovery request was not inserted');
  return result.job;
}

/** Claim through the real repository so lease and protected-address fields remain genuine. */
export async function claimHumanRecovery(jobId: string) {
  const jobs = await createRecoveryJobRepository().claimAvailable({
    workerId: randomUUID(),
    now: new Date(),
    leaseExpiredBefore: new Date(Date.now() - 60_000),
    limit: 1,
  });
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) throw new Error('The synthetic recovery request could not be claimed');
  return job;
}

/** Count only unexpired, unused recovery artifacts; never return authentication material. */
export async function usableHumanRecoveryArtifacts(userId: string): Promise<number> {
  const result = await getPool().query<{ count: number }>(
    `SELECT (
       (SELECT COUNT(*) FROM magic_link_tokens
         WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()) +
       (SELECT COUNT(*) FROM password_reset_tokens
         WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW())
     )::int AS count`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Recovery fixture counts are unavailable');
  return row.count;
}
