import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getPool, runDatabaseTransaction } from '../../../src/lib/database.js';
import { findServiceAccountByClientId } from '../../../src/service-accounts/index.js';
import { truncateAllTables } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClaimDefinition,
  createTestClient,
  createTestOrganization,
  createTestRole,
  createTestUser,
} from '../helpers/factories.js';

/**
 * Store a complete binding using ordinary entity factories and explicit schema values.
 * An ownerless fixture represents only the valid revoked, empty-policy marker state.
 */
async function createBindingFixture(ownerless = false) {
  const organization = await createTestOrganization();
  const application = await createTestApplication();
  const client = await createTestClient(organization.id, application.id);
  const account = ownerless ? null : await createTestUser(organization.id);
  const role = ownerless ? null : await createTestRole(application.id);
  const claim = ownerless ? null : await createTestClaimDefinition(application.id);

  if (account !== null) {
    await getPool().query('UPDATE users SET is_service_account = TRUE WHERE id = $1', [account.id]);
  }

  const targets =
    role !== null && claim !== null
      ? [
          {
            organizationId: organization.id,
            allowedRoles: [{ applicationId: application.id, roleId: role.id }],
            allowedClaimDefinitions: [
              { applicationId: application.id, claimDefinitionId: claim.id },
            ],
          },
        ]
      : [];
  const binding = {
    id: randomUUID(),
    clientId: client.id,
    accountId: account?.id ?? null,
    authorizationVersion: randomUUID(),
    status: ownerless ? 'revoked' : 'active',
    targets,
    createdAt: new Date('2026-02-03T04:05:06.000Z'),
    updatedAt: new Date('2026-02-04T04:05:06.000Z'),
  };

  await getPool().query(
    `INSERT INTO client_service_accounts
       (id, client_id, account_id, authorization_version, status, targets, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
    [
      binding.id,
      binding.clientId,
      binding.accountId,
      binding.authorizationVersion,
      binding.status,
      JSON.stringify(binding.targets),
      binding.createdAt,
      binding.updatedAt,
    ],
  );
  return { binding, organizationId: organization.id, applicationId: application.id };
}

/** Reject successful or non-Error outcomes instead of treating corrupt storage as no binding. */
async function readCorruptionError(clientId: string): Promise<Error> {
  try {
    await findServiceAccountByClientId(clientId);
  } catch (error) {
    if (!(error instanceof Error)) {
      throw new Error('Corrupt stored targets must reject with an Error.', { cause: error });
    }
    return error;
  }
  throw new Error('Corrupt stored targets must not produce a binding or a missing result.');
}

describe('Stored service-account reads', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  it('should return null when the client has no stored binding', async () => {
    await expect(findServiceAccountByClientId(randomUUID())).resolves.toBeNull();
  });

  // Internal reads retain the version and Date values; no public projection is implied here.
  it('should return the complete stored binding when its target array is valid', async () => {
    const fixture = await createBindingFixture();

    await expect(findServiceAccountByClientId(fixture.binding.clientId)).resolves.toEqual(
      fixture.binding,
    );
  });

  it('should retain the ownerless state when a revoked marker has an empty target array', async () => {
    const fixture = await createBindingFixture(true);

    await expect(findServiceAccountByClientId(fixture.binding.clientId)).resolves.toEqual({
      ...fixture.binding,
      accountId: null,
      status: 'revoked',
      targets: [],
    });
  });

  // Different corrupt values must yield one safe error, never raw data or fallback authority.
  it('should reject with one fixed safe error when valid JSON arrays contain corrupt targets', async () => {
    const fixture = await createBindingFixture();
    const invalidOrganizationId = `invalid-stored-organization-${randomUUID()}`;
    const invalidRoleId = `invalid-stored-role-${randomUUID()}`;
    const corruptions = [
      [
        {
          organizationId: invalidOrganizationId,
          allowedRoles: [],
          allowedClaimDefinitions: [],
        },
      ],
      [
        {
          organizationId: fixture.organizationId,
          allowedRoles: [{ applicationId: fixture.applicationId, roleId: invalidRoleId }],
          allowedClaimDefinitions: [],
        },
      ],
    ];
    const messages: string[] = [];

    for (const targets of corruptions) {
      await getPool().query('UPDATE client_service_accounts SET targets = $1::jsonb WHERE id = $2', [
        JSON.stringify(targets),
        fixture.binding.id,
      ]);
      const error = await readCorruptionError(fixture.binding.clientId);
      expect(error.message.trim()).not.toBe('');
      for (const storedValue of [
        invalidOrganizationId,
        invalidRoleId,
        fixture.binding.id,
        fixture.binding.clientId,
        fixture.binding.authorizationVersion,
        fixture.organizationId,
        fixture.applicationId,
      ]) {
        expect(error.message).not.toContain(storedValue);
      }
      expect(error.message).not.toContain(JSON.stringify(targets));
      if (fixture.binding.accountId !== null) {
        expect(error.message).not.toContain(fixture.binding.accountId);
      }
      messages.push(error.message);
    }

    expect(messages[0]).toBe(messages[1]);
  });

  // A reader outside the shared transaction would see the old version, not this uncommitted one.
  it('should read uncommitted state when the caller uses the shared transaction context', async () => {
    const fixture = await createBindingFixture();
    const transactionVersion = randomUUID();
    const rollback = new Error('Roll back the reader transaction fixture.');

    await expect(
      runDatabaseTransaction(async () => {
        await getPool().query(
          'UPDATE client_service_accounts SET authorization_version = $1 WHERE id = $2',
          [transactionVersion, fixture.binding.id],
        );
        await expect(findServiceAccountByClientId(fixture.binding.clientId)).resolves.toMatchObject({
          authorizationVersion: transactionVersion,
        });
        throw rollback;
      }),
    ).rejects.toBe(rollback);

    await expect(findServiceAccountByClientId(fixture.binding.clientId)).resolves.toEqual(
      fixture.binding,
    );
  });
});
