/** Specification tests for the admin connected-apps service. */

import { randomBytes, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import { getPool } from '../../../src/lib/database.js';
import { listConnectedApps, revokeConnectedApp } from '../../../src/connected-apps/service.js';
import { seedBaseData, truncateAllTables } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClient,
  createTestOrganization,
  createTestUser,
} from '../helpers/factories.js';

/** One owned user/client/grant fixture. */
interface ConnectedFixture {
  readonly organizationId: string;
  readonly userId: string;
  readonly clientId: string;
  readonly publicClientId: string;
  readonly grantId: string;
}

/** Creates one live grant plus access and refresh artifacts for the same grant ID. */
async function connected(
  organizationId: string,
  userId: string,
  clientId: string,
  options: { readonly expired?: boolean } = {},
): Promise<ConnectedFixture> {
  const grantId = randomBytes(32).toString('base64url');
  const tokenId = randomUUID();
  const refreshId = randomUUID();
  const expiresAt = options.expired ? new Date(Date.now() - 3_600_000) : null;
  const payload = {
    accountId: userId,
    clientId,
    openid: { scope: 'openid profile email' },
    resources: { 'https://api.example.test': 'billing:read' },
  };
  await getPool().query(
    `INSERT INTO oidc_payloads (id, type, payload, grant_id, expires_at)
     VALUES ($1, 'Grant', $2, NULL, $3)`,
    [grantId, payload, expiresAt],
  );
  await getPool().query(
    `INSERT INTO oidc_payloads (id, type, payload, grant_id)
     VALUES ($1, 'AccessToken', $2, $3), ($4, 'RefreshToken', $2, $3)`,
    [tokenId, { grantId, accountId: userId, clientId }, grantId, refreshId],
  );
  return { organizationId, userId, clientId: clientId, publicClientId: clientId, grantId };
}

beforeEach(async () => {
  await truncateAllTables();
  await seedBaseData();
});

describe('connected apps list', () => {
  it('returns live grants with client identity and granted scopes', async () => {
    const organization = await createTestOrganization();
    const application = await createTestApplication();
    const client = await createTestClient(organization.id, application.id);
    const user = await createTestUser(organization.id);
    const fixture = await connected(organization.id, user.id, client.clientId);

    const apps = await listConnectedApps(organization.id, user.id);

    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({
      grantId: fixture.grantId,
      clientId: client.clientId,
      clientName: client.clientName,
      applicationId: application.id,
    });
    expect(apps[0]?.scopes).toEqual(
      expect.arrayContaining(['openid', 'profile', 'email', 'billing:read']),
    );
    expect(apps[0]?.createdAt).toBeTypeOf('string');
  });

  it('returns only the exact user and organization live grants', async () => {
    const ownerOrganization = await createTestOrganization();
    const ownerApplication = await createTestApplication();
    const ownerClient = await createTestClient(ownerOrganization.id, ownerApplication.id);
    const owner = await createTestUser(ownerOrganization.id);
    const ownerLive = await connected(ownerOrganization.id, owner.id, ownerClient.clientId);
    await connected(ownerOrganization.id, owner.id, ownerClient.clientId, { expired: true });

    const sameOrganizationUser = await createTestUser(ownerOrganization.id);
    await connected(ownerOrganization.id, sameOrganizationUser.id, ownerClient.clientId);

    const otherOrganization = await createTestOrganization();
    const otherApplication = await createTestApplication();
    const otherClient = await createTestClient(otherOrganization.id, otherApplication.id);
    const otherUser = await createTestUser(otherOrganization.id);
    await connected(otherOrganization.id, otherUser.id, otherClient.clientId);

    // A grant for the owner user whose client belongs to another organization must not appear.
    await connected(otherOrganization.id, owner.id, otherClient.clientId);

    const ownerApps = await listConnectedApps(ownerOrganization.id, owner.id);
    expect(ownerApps.map((app) => app.grantId)).toEqual([ownerLive.grantId]);
    expect(await listConnectedApps(ownerOrganization.id, sameOrganizationUser.id)).toHaveLength(1);
    expect(await listConnectedApps(otherOrganization.id, otherUser.id)).toHaveLength(1);
  });
});

describe('connected apps revoke', () => {
  it('deletes the grant and all artifacts sharing its grant ID', async () => {
    const organization = await createTestOrganization();
    const application = await createTestApplication();
    const client = await createTestClient(organization.id, application.id);
    const user = await createTestUser(organization.id);
    const fixture = await connected(organization.id, user.id, client.clientId);

    await expect(
      revokeConnectedApp(organization.id, user.id, fixture.grantId),
    ).resolves.toBe(true);

    const remaining = await getPool().query<{ count: string }>(
      'SELECT count(*)::text AS count FROM oidc_payloads WHERE grant_id = $1',
      [fixture.grantId],
    );
    expect(remaining.rows[0]?.count).toBe('0');
    const grant = await getPool().query<{ count: string }>(
      "SELECT count(*)::text AS count FROM oidc_payloads WHERE id = $1 AND type = 'Grant'",
      [fixture.grantId],
    );
    expect(grant.rows[0]?.count).toBe('0');
    const userRow = await getPool().query('SELECT id FROM users WHERE id = $1', [user.id]);
    const clientRow = await getPool().query('SELECT id FROM clients WHERE id = $1', [client.id]);
    expect(userRow.rows).toHaveLength(1);
    expect(clientRow.rows).toHaveLength(1);
  });

  it.each([
    ['another user', 'user'],
    ['another organization', 'organization'],
    ['an unknown grant', 'unknown'],
  ] as const)('does not revoke a grant owned by %s', async (_label, kind) => {
    const organization = await createTestOrganization();
    const application = await createTestApplication();
    const client = await createTestClient(organization.id, application.id);
    const user = await createTestUser(organization.id);
    const fixture = await connected(organization.id, user.id, client.clientId);
    const otherOrganization = await createTestOrganization();
    const otherUser = await createTestUser(otherOrganization.id);

    const targetUser = kind === 'user' ? otherUser.id : user.id;
    const targetOrganization = kind === 'organization' ? otherOrganization.id : organization.id;
    const targetGrant = kind === 'unknown' ? randomUUID() : fixture.grantId;

    await expect(
      revokeConnectedApp(targetOrganization, targetUser, targetGrant),
    ).resolves.toBe(false);
    const remaining = await getPool().query<{ count: string }>(
      'SELECT count(*)::text AS count FROM oidc_payloads WHERE grant_id = $1',
      [fixture.grantId],
    );
    expect(remaining.rows[0]?.count).toBe('2');
    const grant = await getPool().query<{ count: string }>(
      "SELECT count(*)::text AS count FROM oidc_payloads WHERE id = $1 AND type = 'Grant'",
      [fixture.grantId],
    );
    expect(grant.rows[0]?.count).toBe('1');
  });
});
