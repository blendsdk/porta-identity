/** Integration evidence for per-application resource-server resolution. */

import { randomUUID } from 'node:crypto';
import { errors } from 'oidc-provider';
import { beforeEach, describe, expect, it } from 'vitest';

import { getPool } from '../../../src/lib/database.js';
import { resolveResourceServerInfo } from '../../../src/oidc/resource-servers.js';
import { seedBaseData, truncateAllTables } from '../helpers/database.js';
import { createTestApplication } from '../helpers/factories.js';

const TTL = 900;

beforeEach(async () => {
  await truncateAllTables();
  await seedBaseData();
});

/** Creates one application-owned resource server with its explicit custom scopes. */
async function resourceServer(
  applicationId: string,
  identifier: string,
  scopes: readonly string[],
): Promise<string> {
  const result = await getPool().query<{ id: string }>(
    `INSERT INTO resource_servers (application_id, slug, name, identifier, audience)
     VALUES ($1, $2, $3, $4, $4) RETURNING id`,
    [applicationId, `resource-${randomUUID()}`, 'Billing API', identifier],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('Resource server fixture was not created');
  for (const scope of scopes) {
    await getPool().query(
      'INSERT INTO resource_server_scopes (resource_server_id, scope) VALUES ($1, $2)',
      [id, scope],
    );
  }
  return id;
}

describe('per-application resource servers', () => {
  it('resolves the owning application and returns its registered scopes and audience', async () => {
    const application = await createTestApplication();
    const identifier = `https://billing-${randomUUID()}.example.test`;
    await resourceServer(application.id, identifier, ['billing:read', 'billing:write']);

    const info = await resolveResourceServerInfo({
      applicationId: application.id,
      identifier,
      requestedScope: 'openid billing:read',
      accessTokenTTL: TTL,
    });

    expect(info.audience).toBe(identifier);
    expect(info.scope.split(' ')).toEqual(
      expect.arrayContaining(['openid', 'profile', 'email', 'billing:read', 'billing:write']),
    );
    expect(info.accessTokenFormat).toBe('opaque');
    expect(info.accessTokenTTL).toBe(TTL);
  });

  it('rejects a resource owned by a different application', async () => {
    const owner = await createTestApplication();
    const other = await createTestApplication();
    const identifier = `https://billing-${randomUUID()}.example.test`;
    await resourceServer(owner.id, identifier, ['billing:read']);

    await expect(
      resolveResourceServerInfo({
        applicationId: other.id,
        identifier,
        requestedScope: 'billing:read',
        accessTokenTTL: TTL,
      }),
    ).rejects.toBeInstanceOf(errors.InvalidTarget);
  });

  it('rejects an unknown absolute resource', async () => {
    const application = await createTestApplication();

    await expect(
      resolveResourceServerInfo({
        applicationId: application.id,
        identifier: `https://unknown-${randomUUID()}.example.test`,
        requestedScope: 'openid',
        accessTokenTTL: TTL,
      }),
    ).rejects.toBeInstanceOf(errors.InvalidTarget);
  });

  it('rejects an unregistered custom scope for the resource', async () => {
    const application = await createTestApplication();
    const identifier = `https://billing-${randomUUID()}.example.test`;
    await resourceServer(application.id, identifier, ['billing:read']);

    await expect(
      resolveResourceServerInfo({
        applicationId: application.id,
        identifier,
        requestedScope: 'billing:write',
        accessTokenTTL: TTL,
      }),
    ).rejects.toBeInstanceOf(errors.InvalidScope);
  });
});
