import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import Koa from 'koa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assertAuditSchema, AuditSchemaError } from '../../../src/lib/audit-schema.js';
import { getPool } from '../../../src/lib/database.js';
import { observeOperationalLogOutput } from '../../../src/lib/logger.js';
import { findSuperAdminOrganization } from '../../../src/organizations/repository.js';
import { adminMutationAudit } from '../../../src/middleware/admin-mutation-audit.js';
import { createTestUser } from '../helpers/factories.js';
import { seedBaseData, truncateAllTables } from '../helpers/database.js';

/** Narrow an unknown log record before reading review-safe fields. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Parse one observed pino argument array and return its first structured field object. */
function observedFields(serialized: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(serialized);
  const first = Array.isArray(parsed) ? parsed[0] : undefined;
  return isRecord(first) ? first : {};
}

describe('generic administrative mutation audit', () => {
  let actorId: string;
  let organizationId: string;

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    const organization = await findSuperAdminOrganization();
    if (!organization) throw new Error('Control-plane organization is missing');
    organizationId = organization.id;
    actorId = (
      await createTestUser(organizationId, {
        email: 'issue-199-actor@integration.example',
      })
    ).id;
  });

  afterEach(async () => {
    await getPool().query('DROP TRIGGER IF EXISTS issue_199_audit_failure ON audit_log');
    await getPool().query('DROP FUNCTION IF EXISTS issue_199_audit_failure()');
  });

  /** Run a minimal generic admin mutation through the real audit middleware. */
  async function runMutation() {
    const incoming = new IncomingMessage(new Socket());
    incoming.method = 'PUT';
    incoming.url = '/api/admin/widgets/widget-1';
    const context = new Koa().createContext(incoming, new ServerResponse(incoming));
    Reflect.set(context, '_matchedRoute', '/api/admin/widgets/:id');
    context.state = {
      requestId: 'issue-199-request',
      adminUser: {
        id: actorId,
        email: 'issue-199-actor@integration.example',
        organizationId,
        roles: [],
        permissions: [],
      },
    };

    await adminMutationAudit()(context, async () => {
      context.status = 204;
    });

    return context;
  }

  it('should accept the migrated test database audit schema', async () => {
    await expect(assertAuditSchema()).resolves.toBeUndefined();
  });

  it('should resolve audit_log through the unqualified search path', async () => {
    const client = await getPool().connect();
    const schema = `issue199_guard_${randomUUID().replaceAll('-', '')}`;

    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}, public`);
      await expect(assertAuditSchema(client)).resolves.toBeUndefined();
    } finally {
      await client.query('RESET search_path');
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      client.release();
    }
  });

  it('should reject a legacy audit_log selected by the search path', async () => {
    const client = await getPool().connect();
    const schema = `issue199_legacy_${randomUUID().replaceAll('-', '')}`;

    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`CREATE TABLE ${schema}.audit_log (actor_client_id VARCHAR(255))`);
      await client.query(`SET search_path TO ${schema}, public`);
      await expect(assertAuditSchema(client)).rejects.toBeInstanceOf(AuditSchemaError);
    } finally {
      await client.query('RESET search_path');
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      client.release();
    }
  });

  it('should commit one actor-attributed audit row for a successful mutation', async () => {
    const context = await runMutation();

    expect(context.status).toBe(204);
    const audits = await getPool().query<{
      actor_id: string;
      actor_type: string;
      actor_client_id: string | null;
      actor_client_name: string | null;
      event_type: string;
      metadata: { method: string; routeTemplate: string };
    }>(
      `SELECT actor_id, actor_type, actor_client_id, actor_client_name, event_type, metadata
         FROM audit_log
        WHERE event_type = 'admin.mutation.committed'`,
    );

    expect(audits.rowCount).toBe(1);
    expect(audits.rows[0]).toMatchObject({
      actor_id: actorId,
      actor_type: 'user',
      actor_client_id: null,
      actor_client_name: null,
      event_type: 'admin.mutation.committed',
      metadata: {
        method: 'PUT',
        routeTemplate: '/api/admin/widgets/:id',
      },
    });
  });

  it('should return 503, roll back, and log only safe structured failure context', async () => {
    await getPool().query(`
      CREATE OR REPLACE FUNCTION issue_199_audit_failure() RETURNS trigger AS $$
      BEGIN
        IF NEW.event_type = 'admin.mutation.committed' THEN
          RAISE EXCEPTION 'forced audit failure' USING ERRCODE = '42P01';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER issue_199_audit_failure
        BEFORE INSERT ON audit_log
        FOR EACH ROW EXECUTE FUNCTION issue_199_audit_failure();
    `);

    const observed: string[] = [];
    const stopObserving = observeOperationalLogOutput((entry) => observed.push(entry));
    let context;
    try {
      context = await runMutation();
    } finally {
      stopObserving();
    }

    expect(context.status).toBe(503);
    expect(context.body).toEqual({
      error: 'Administrative request could not be completed',
      code: 'admin_mutation_unavailable',
      requestId: 'issue-199-request',
    });

    const persisted = await getPool().query(
      "SELECT 1 FROM audit_log WHERE event_type = 'admin.mutation.committed'",
    );
    expect(persisted.rowCount).toBe(0);

    const failure = observed.map(observedFields).find((entry) => entry.event === 'admin_mutation_failed');
    expect(failure).toMatchObject({
      event: 'admin_mutation_failed',
      requestId: 'issue-199-request',
      method: 'PUT',
      routeTemplate: '/api/admin/widgets/:id',
      errorCode: '42P01',
      failureClass: 'audit_schema_missing',
    });
    expect(typeof failure?.errorName).toBe('string');

    const serialized = observed.join('\n');
    expect(serialized).not.toContain('forced audit failure');
    expect(serialized).not.toContain('INSERT INTO');
    expect(serialized).not.toContain('stack');
  });
});
