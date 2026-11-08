import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { truncateAllTables } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClient,
  createTestOrganization,
  createTestUser,
} from '../helpers/factories.js';

/** Create a dedicated account through ordinary fixtures, then mark its stored classification. */
async function createServiceUser(organizationId: string) {
  const account = await createTestUser(organizationId);
  await getPool().query('UPDATE users SET is_service_account = TRUE WHERE id = $1', [account.id]);
  return account;
}

/** Create valid foreign-key owners without relying on any provisioning service. */
async function createOwners() {
  const organization = await createTestOrganization();
  const application = await createTestApplication();
  const client = await createTestClient(organization.id, application.id);
  const account = await createServiceUser(organization.id);
  return { organization, application, client, account };
}

/**
 * Insert every binding column explicitly so these tests do not prescribe database defaults.
 * Raw target and status values also let rejection cases reach the database itself.
 */
async function insertBinding(
  clientId: string,
  accountId: string | null,
  {
    id = randomUUID(),
    status = 'active',
    targets = [],
  }: { id?: string; status?: string; targets?: unknown } = {},
): Promise<string> {
  await getPool().query(
    `INSERT INTO client_service_accounts
       (id, client_id, account_id, authorization_version, status, targets, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
    [
      id,
      clientId,
      accountId,
      randomUUID(),
      status,
      JSON.stringify(targets),
      new Date('2026-01-02T03:04:05.000Z'),
      new Date('2026-01-03T03:04:05.000Z'),
    ],
  );
  return id;
}

describe('Service-account binding schema', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  // Ordinary user creation must never opt a human into the permanent service classification.
  it('should classify an ordinary user as human when the database default is used', async () => {
    const organization = await createTestOrganization();
    const user = await createTestUser(organization.id);
    const result = await getPool().query<{ is_service_account: boolean }>(
      'UPDATE users SET is_service_account = DEFAULT WHERE id = $1 RETURNING is_service_account',
      [user.id],
    );

    expect(result.rows).toEqual([{ is_service_account: false }]);
  });

  it('should reject an unknown classification when the service flag is set to SQL NULL', async () => {
    const organization = await createTestOrganization();
    const user = await createTestUser(organization.id);

    await expect(
      getPool().query('UPDATE users SET is_service_account = NULL WHERE id = $1', [user.id]),
    ).rejects.toMatchObject({ code: '23502' });
  });

  // Native database types preserve UUID identity, structured policy, and timezone-aware times.
  it('should use native column types when a complete binding is stored', async () => {
    const owners = await createOwners();
    const id = await insertBinding(owners.client.id, owners.account.id);
    const result = await getPool().query<{
      id_type: string;
      client_type: string;
      account_type: string;
      version_type: string;
      targets_type: string;
      targets_shape: string;
      created_type: string;
      updated_type: string;
    }>(
      `SELECT pg_typeof(id)::text AS id_type, pg_typeof(client_id)::text AS client_type,
              pg_typeof(account_id)::text AS account_type,
              pg_typeof(authorization_version)::text AS version_type,
              pg_typeof(targets)::text AS targets_type, jsonb_typeof(targets) AS targets_shape,
              pg_typeof(created_at)::text AS created_type,
              pg_typeof(updated_at)::text AS updated_type
         FROM client_service_accounts WHERE id = $1`,
      [id],
    );

    expect(result.rows).toEqual([
      {
        id_type: 'uuid',
        client_type: 'uuid',
        account_type: 'uuid',
        version_type: 'uuid',
        targets_type: 'jsonb',
        targets_shape: 'array',
        created_type: 'timestamp with time zone',
        updated_type: 'timestamp with time zone',
      },
    ]);
  });

  // Different accounts isolate client uniqueness from the separate account-ownership constraint.
  it('should reject duplicate client ownership when the second binding uses a different account', async () => {
    const owners = await createOwners();
    const otherAccount = await createServiceUser(owners.organization.id);
    await insertBinding(owners.client.id, owners.account.id);

    await expect(insertBinding(owners.client.id, otherAccount.id)).rejects.toMatchObject({
      code: '23505',
    });
  });

  // Different clients isolate account uniqueness from the separate client-ownership constraint.
  it('should reject shared account ownership when the second binding uses a different client', async () => {
    const owners = await createOwners();
    const otherClient = await createTestClient(owners.organization.id, owners.application.id);
    await insertBinding(owners.client.id, owners.account.id);

    await expect(insertBinding(otherClient.id, owners.account.id)).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('should reject a duplicate primary key when both owners are otherwise distinct', async () => {
    const first = await createOwners();
    const second = await createOwners();
    const id = await insertBinding(first.client.id, first.account.id);

    await expect(insertBinding(second.client.id, second.account.id, { id })).rejects.toMatchObject({
      code: '23505',
    });
    const primaryKey = await getPool().query<{ column_name: string }>(
      `SELECT key_column.column_name
         FROM information_schema.table_constraints table_constraint
         JOIN information_schema.key_column_usage key_column
           ON key_column.constraint_schema = table_constraint.constraint_schema
           AND key_column.constraint_name = table_constraint.constraint_name
           AND key_column.table_schema = table_constraint.table_schema
           AND key_column.table_name = table_constraint.table_name
        WHERE table_constraint.table_schema = 'public'
          AND table_constraint.table_name = 'client_service_accounts'
          AND table_constraint.constraint_type = 'PRIMARY KEY'
        ORDER BY key_column.ordinal_position`,
    );
    expect(primaryKey.rows).toEqual([{ column_name: 'id' }]);
  });

  // Valid JSON is insufficient: the stored policy must be an array, not another JSON value.
  it.each([
    { description: 'an object', value: { organizationId: 'not-an-array' } },
    { description: 'JSON null', value: null },
    { description: 'a string', value: 'not-an-array' },
    { description: 'a number', value: 42 },
    { description: 'a boolean', value: false },
  ])('should reject $description when it is stored as targets', async ({ value }) => {
    const owners = await createOwners();

    await expect(
      insertBinding(owners.client.id, owners.account.id, { targets: value }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it.each(['client', 'account'] as const)(
    'should reject a missing %s when its foreign-key owner does not exist',
    async (missingOwner) => {
      const owners = await createOwners();
      const clientId = missingOwner === 'client' ? randomUUID() : owners.client.id;
      const accountId = missingOwner === 'account' ? randomUUID() : owners.account.id;

      await expect(insertBinding(clientId, accountId)).rejects.toMatchObject({ code: '23503' });
    },
  );

  it('should reject an unsupported status when a binding is inserted directly', async () => {
    const owners = await createOwners();

    await expect(
      insertBinding(owners.client.id, owners.account.id, { status: 'paused' }),
    ).rejects.toMatchObject({ code: expect.stringMatching(/^(23514|22P02)$/) });
  });

  // Revoked clients retain distinct ownership markers even after their account no longer exists.
  it('should allow separate ownerless markers when revoked clients have empty targets', async () => {
    const owners = await createOwners();
    const otherClient = await createTestClient(owners.organization.id, owners.application.id);
    const firstId = await insertBinding(owners.client.id, null, { status: 'revoked', targets: [] });
    const secondId = await insertBinding(otherClient.id, null, { status: 'revoked', targets: [] });
    const result = await getPool().query<{ id: string }>(
      `SELECT id FROM client_service_accounts
        WHERE account_id IS NULL AND status = 'revoked' AND targets = '[]'::jsonb`,
    );

    expect(result.rows.map((row) => row.id).sort()).toEqual([firstId, secondId].sort());
  });
});
