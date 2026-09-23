import { beforeEach, describe, expect, it } from 'vitest';
import { generateAndStore } from '../../../src/clients/secret-service.js';
import { insertSecret } from '../../../src/clients/secret-repository.js';
import { getPool } from '../../../src/lib/database.js';
import {
  createTestApplication,
  createTestClient,
  createTestOrganization,
} from '../helpers/factories.js';
import { truncateAllTables } from '../helpers/database.js';

/** Insert active, non-expiring secret rows without spending time hashing fixture plaintext. */
async function insertActiveSecrets(clientId: string, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await insertSecret({
      clientId,
      secretHash: `fixture-argon2-hash-${index}`,
      secretSha256: index.toString(16).padStart(64, '0'),
      label: `fixture-${index}`,
      expiresAt: null,
    });
  }
}

/** Count the active, unexpired credentials visible to client authentication. */
async function activeSecretCount(clientId: string): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM client_secrets
      WHERE client_id = $1
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > NOW())`,
    [clientId],
  );
  return Number(result.rows[0]?.count ?? '0');
}

describe('active client-secret cap specification', () => {
  beforeEach(async () => truncateAllTables());

  it('ST-07C permits total 10 and rejects total 11 without inserting a row', async () => {
    const organization = await createTestOrganization();
    const application = await createTestApplication();
    const client = await createTestClient(organization.id, application.id);
    await insertActiveSecrets(client.id, 9);

    await expect(generateAndStore(client.id, { label: 'tenth' })).resolves.toBeDefined();
    expect(await activeSecretCount(client.id)).toBe(10);

    await expect(generateAndStore(client.id, { label: 'eleventh' })).rejects.toThrow();
    expect(await activeSecretCount(client.id)).toBe(10);
  });

  it('ST-07C atomically admits only one of two concurrent attempts from 9', async () => {
    const organization = await createTestOrganization();
    const application = await createTestApplication();
    const client = await createTestClient(organization.id, application.id);
    await insertActiveSecrets(client.id, 9);

    const outcomes = await Promise.allSettled([
      generateAndStore(client.id, { label: 'concurrent-a' }),
      generateAndStore(client.id, { label: 'concurrent-b' }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(await activeSecretCount(client.id)).toBe(10);
  });
});
