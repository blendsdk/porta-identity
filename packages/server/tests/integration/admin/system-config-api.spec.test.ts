/** Verifies administrative configuration commits against real PostgreSQL transactions. */
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import Koa from 'koa';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { findSuperAdminOrganization } from '../../../src/organizations/repository.js';
import { createTestUser } from '../helpers/factories.js';
import { seedBaseData, truncateAllTables } from '../helpers/database.js';
import { TEST_CONFIG_DEFINITIONS } from '../../unit/routes/system-config-api-fixtures.js';

vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: object, next: () => Promise<void>) => next(),
}));

import { createConfigRouter } from '../../../src/routes/config.js';
import { adminMutationAudit } from '../../../src/middleware/admin-mutation-audit.js';
import * as runtime from '../../../src/lib/system-config.js';

describe('live administrative configuration atomicity', () => {
  let actorId: string;
  let organizationId: string;

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    const organization = await findSuperAdminOrganization();
    if (!organization) throw new Error('Control-plane seed is missing');
    organizationId = organization.id;
    actorId = (
      await createTestUser(organizationId, {
        email: 'config-actor@integration.example',
      })
    ).id;
    runtime.clearSystemConfigCache();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await getPool().query('DROP TRIGGER IF EXISTS config_spec_failure ON audit_log');
    await getPool().query('DROP TRIGGER IF EXISTS config_spec_failure ON system_config');
    await getPool().query('DROP FUNCTION IF EXISTS config_spec_failure()');
    runtime.clearSystemConfigCache();
  });

  /** Run the real router and generic audit middleware with only the authenticated identity substituted. */
  async function update(key: string | undefined, body: unknown) {
    const incoming = new IncomingMessage(new Socket());
    incoming.method = 'PUT';
    incoming.url = `/api/admin/config${key === undefined ? '' : `/${encodeURIComponent(key)}`}`;
    const context = new Koa().createContext(incoming, new ServerResponse(incoming));
    context.request.body = body;
    context.state = {
      requestId: 'live-config-request',
      adminUser: {
        id: actorId,
        email: 'config-actor@integration.example',
        organizationId,
        roles: [],
        permissions: ['admin:config:read', 'admin:config:update'],
      },
    };
    await adminMutationAudit()(context, async () => {
      await createConfigRouter().routes()(context, async () => undefined);
    });
    return context;
  }

  /** Read native durable values without runtime cache fallback. */
  async function values() {
    const result = await getPool().query<{ key: string; value: unknown }>(
      'SELECT key, value FROM system_config WHERE key = ANY($1::text[]) ORDER BY key',
      [['access_token_ttl', 'magic_link_ttl']],
    );
    return result.rows;
  }

  /** Observe every audit record written for the route actor, including accidental generic duplicates. */
  async function audit() {
    return (
      await getPool().query<{ event_type: string; metadata: unknown }>(
        'SELECT event_type, metadata FROM audit_log WHERE actor_id = $1',
        [actorId],
      )
    ).rows;
  }

  it('should commit a runtime value, write one minimal audit and clear the cache after commit', async () => {
    expect(await runtime.getSystemConfigNumber('magic_link_ttl')).toBe(900);
    const clear = vi.spyOn(runtime, 'clearSystemConfigCache');
    const response = await update('magic_link_ttl', { value: 1200 });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: expect.objectContaining({ key: 'magic_link_ttl', value: 1200 }),
      restartRequired: false,
    });
    expect(await audit()).toEqual([
      {
        event_type: 'admin.config.updated',
        metadata: { keys: ['magic_link_ttl'], restartRequired: false },
      },
    ]);
    expect(clear).toHaveBeenCalledOnce();
    expect(await runtime.getSystemConfigNumber('magic_link_ttl')).toBe(1200);
  });

  it('should commit a mixed batch in catalog order with one sorted-key audit', async () => {
    const response = await update(undefined, {
      values: { magic_link_ttl: 1200, access_token_ttl: 7200 },
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [
        expect.objectContaining({ key: 'access_token_ttl', value: 7200 }),
        expect.objectContaining({ key: 'magic_link_ttl', value: 1200 }),
      ],
      restartRequired: true,
    });
    expect(await values()).toEqual([
      { key: 'access_token_ttl', value: 7200 },
      { key: 'magic_link_ttl', value: 1200 },
    ]);
    expect(await audit()).toEqual([
      {
        event_type: 'admin.config.updated',
        metadata: {
          keys: ['access_token_ttl', 'magic_link_ttl'],
          restartRequired: true,
        },
      },
    ]);
  });

  it('should replace a corrupt existing value with a valid native submission', async () => {
    await getPool().query('UPDATE system_config SET value = $1::jsonb WHERE key = $2', [
      JSON.stringify('corrupt-old-content'),
      'magic_link_ttl',
    ]);
    expect((await update('magic_link_ttl', { value: 1200 })).status).toBe(200);
    expect((await values()).find((row) => row.key === 'magic_link_ttl')?.value).toBe(1200);
  });

  it.each(['audit failure', 'update failure', 'missing target', 'invalid readback'] as const)(
    'should roll back all batch changes and preserve cache on %s',
    async (failure) => {
      expect(await runtime.getSystemConfigNumber('magic_link_ttl')).toBe(900);
      if (failure === 'missing target')
        await getPool().query('DELETE FROM system_config WHERE key = $1', ['magic_link_ttl']);
      if (failure === 'audit failure') {
        await getPool().query(
          "CREATE FUNCTION config_spec_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private-config-audit-failure'; END $$",
        );
        await getPool().query(
          'CREATE TRIGGER config_spec_failure BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION config_spec_failure()',
        );
      }
      if (failure === 'update failure') {
        await getPool().query(
          "CREATE FUNCTION config_spec_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.key = 'magic_link_ttl' THEN RAISE EXCEPTION 'private-config-update-failure'; END IF; RETURN NEW; END $$",
        );
        await getPool().query(
          'CREATE TRIGGER config_spec_failure BEFORE UPDATE ON system_config FOR EACH ROW EXECUTE FUNCTION config_spec_failure()',
        );
      }
      if (failure === 'invalid readback') {
        await getPool().query(
          "CREATE FUNCTION config_spec_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.key = 'magic_link_ttl' THEN NEW.value := '\"private-invalid-readback\"'::jsonb; END IF; RETURN NEW; END $$",
        );
        await getPool().query(
          'CREATE TRIGGER config_spec_failure BEFORE UPDATE ON system_config FOR EACH ROW EXECUTE FUNCTION config_spec_failure()',
        );
      }
      const before = await values();
      const clear = vi.spyOn(runtime, 'clearSystemConfigCache');
      const response = await update(undefined, {
        values: { access_token_ttl: 7200, magic_link_ttl: 1200 },
      });
      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        error: 'Configuration store is unavailable',
        code: 'config_store_unavailable',
        requestId: expect.any(String),
      });
      expect(JSON.stringify(response.body)).not.toContain('private-');
      expect(await values()).toEqual(before);
      expect(await audit()).toEqual([]);
      expect(clear).not.toHaveBeenCalled();
      expect(await runtime.getSystemConfigNumber('magic_link_ttl')).toBe(900);
    },
  );

  it('should expose all native defaults without database-owned metadata', async () => {
    const rows = await getPool().query<{ key: string; value: unknown }>(
      'SELECT key, value FROM system_config WHERE key = ANY($1::text[])',
      [TEST_CONFIG_DEFINITIONS.map((entry) => entry.key)],
    );
    expect(rows.rows).toHaveLength(18);
    for (const entry of TEST_CONFIG_DEFINITIONS)
      expect(rows.rows.find((row) => row.key === entry.key)?.value).toEqual(entry.defaultValue);
  });
});
