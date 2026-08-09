/**
 * Audit log repository integration tests.
 *
 * Verifies insert and query operations against a real PostgreSQL database.
 * Tests cover: insert entry, query by entity type, query by entity ID,
 * query by action, query with date range, pagination, and user deletion
 * SET NULL behavior.
 *
 * Each test starts with a clean slate via truncateAllTables().
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import { createTestOrganization, createTestUser } from '../helpers/factories.js';
import { writeAuditLog } from '../../../src/lib/audit-log.js';
import { getPool } from '../../../src/lib/database.js';

/** Helper: query audit log entries with optional filters */
async function queryAuditLog(filters?: {
  eventCategory?: string;
  eventType?: string;
  organizationId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const pool = getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters?.eventCategory) {
    conditions.push(`event_category = $${idx++}`);
    params.push(filters.eventCategory);
  }
  if (filters?.eventType) {
    conditions.push(`event_type = $${idx++}`);
    params.push(filters.eventType);
  }
  if (filters?.organizationId) {
    conditions.push(`organization_id = $${idx++}`);
    params.push(filters.organizationId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(
    `SELECT COUNT(*) as count FROM audit_log ${where}`,
    params,
  );
  const total = parseInt(countResult.rows[0].count as string, 10);

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  const dataResult = await pool.query(
    `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset],
  );

  return { rows: dataResult.rows, total };
}

describe('Audit Log Repository (Integration)', () => {
  let orgId: string;

  beforeEach(async () => {
    await truncateAllTables();
    await flushTestRedis();
    const org = await createTestOrganization();
    orgId = org.id;
  });

  // ── Insert ───────────────────────────────────────────────────

  it('should insert an audit log entry with auto-generated ID and timestamp', async () => {
    await writeAuditLog({
      organizationId: orgId,
      eventType: 'organization.created',
      eventCategory: 'organization',
      description: 'Test org created',
      metadata: { key: 'value' },
    });

    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM audit_log WHERE organization_id = $1`,
      [orgId],
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].id).toBeDefined();
    expect(result.rows[0].created_at).toBeDefined();
    expect(result.rows[0].event_type).toBe('organization.created');
    expect(result.rows[0].event_category).toBe('organization');
  });

  // ── Query by Entity Type ─────────────────────────────────────

  it('should query audit logs by event category', async () => {
    await writeAuditLog({
      organizationId: orgId,
      eventType: 'organization.updated',
      eventCategory: 'organization',
    });
    await writeAuditLog({
      organizationId: orgId,
      eventType: 'user.created',
      eventCategory: 'user',
    });

    const orgLogs = await queryAuditLog({ eventCategory: 'organization' });
    expect(orgLogs.total).toBe(1);
    expect(orgLogs.rows[0].event_category).toBe('organization');

    const userLogs = await queryAuditLog({ eventCategory: 'user' });
    expect(userLogs.total).toBe(1);
  });

  // ── Query by Entity ID (Organization) ────────────────────────

  it('should query audit logs by organization ID', async () => {
    const otherOrg = await createTestOrganization();

    await writeAuditLog({
      organizationId: orgId,
      eventType: 'organization.updated',
      eventCategory: 'organization',
    });
    await writeAuditLog({
      organizationId: otherOrg.id,
      eventType: 'organization.updated',
      eventCategory: 'organization',
    });

    const result = await queryAuditLog({ organizationId: orgId });
    expect(result.total).toBe(1);
  });

  // ── Query by Action ──────────────────────────────────────────

  it('should query audit logs by event type', async () => {
    await writeAuditLog({
      organizationId: orgId,
      eventType: 'user.created',
      eventCategory: 'user',
    });
    await writeAuditLog({
      organizationId: orgId,
      eventType: 'user.updated',
      eventCategory: 'user',
    });
    await writeAuditLog({
      organizationId: orgId,
      eventType: 'user.deleted',
      eventCategory: 'user',
    });

    const result = await queryAuditLog({ eventType: 'user.created' });
    expect(result.total).toBe(1);
    expect(result.rows[0].event_type).toBe('user.created');
  });

  // ── Query with Date Range ────────────────────────────────────

  it('should support filtering by timestamp range', async () => {
    const pool = getPool();

    // Insert entries with controlled timestamps
    await pool.query(
      `INSERT INTO audit_log (organization_id, event_type, event_category, created_at)
       VALUES ($1, 'old.event', 'test', NOW() - INTERVAL '2 days')`,
      [orgId],
    );
    await pool.query(
      `INSERT INTO audit_log (organization_id, event_type, event_category, created_at)
       VALUES ($1, 'recent.event', 'test', NOW())`,
      [orgId],
    );

    // Query only recent entries (last 24 hours)
    const result = await pool.query(
      `SELECT * FROM audit_log WHERE organization_id = $1 AND created_at > NOW() - INTERVAL '1 day'`,
      [orgId],
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].event_type).toBe('recent.event');
  });

  // ── Pagination ───────────────────────────────────────────────

  it('should support pagination of audit log entries', async () => {
    // Insert 5 entries
    for (let i = 0; i < 5; i++) {
      await writeAuditLog({
        organizationId: orgId,
        eventType: `test.event.${i}`,
        eventCategory: 'test',
      });
    }

    const page1 = await queryAuditLog({
      organizationId: orgId,
      limit: 3,
      offset: 0,
    });
    expect(page1.rows).toHaveLength(3);
    expect(page1.total).toBe(5);

    const page2 = await queryAuditLog({
      organizationId: orgId,
      limit: 3,
      offset: 3,
    });
    expect(page2.rows).toHaveLength(2);
  });

  // ── User Deletion Sets NULL ──────────────────────────────────

  it('should set user_id to NULL when user is deleted (ON DELETE SET NULL)', async () => {
    const user = await createTestUser(orgId);
    const pool = getPool();

    // Create audit log entry referencing the user
    await writeAuditLog({
      organizationId: orgId,
      userId: user.id,
      eventType: 'user.login',
      eventCategory: 'auth',
    });

    // Verify user_id is set
    const before = await pool.query(
      `SELECT user_id FROM audit_log WHERE organization_id = $1 AND event_type = 'user.login'`,
      [orgId],
    );
    expect(before.rows[0].user_id).toBe(user.id);

    // Delete the user — audit log should retain the entry with NULL user_id
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);

    const after = await pool.query(
      `SELECT user_id FROM audit_log WHERE organization_id = $1 AND event_type = 'user.login'`,
      [orgId],
    );
    expect(after.rows[0].user_id).toBeNull();
  });
});
