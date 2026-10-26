/**
 * Integration durability test for invitation audit.
 *
 * The real invitation transaction must roll back the invitation row and must
 * not send email when the durable audit insert fails.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import { createTestOrganization } from '../helpers/factories.js';
import { getPool } from '../../../src/lib/database.js';
import { inviteUser } from '../../../src/users/invite-service.js';

const email = vi.hoisted(() => ({ sendInvitationEmail: vi.fn() }));

vi.mock('../../../src/auth/email-service.js', () => ({
  sendInvitationEmail: email.sendInvitationEmail,
}));

const TRIGGER = 'fail_user_invited_audit_trigger';
const FUNCTION = 'fail_user_invited_audit';

async function installAuditFailure(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE OR REPLACE FUNCTION ${FUNCTION}() RETURNS trigger AS $$
    BEGIN
      IF NEW.event_type = 'user.invited' THEN
        RAISE EXCEPTION 'audit unavailable';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await pool.query(`DROP TRIGGER IF EXISTS ${TRIGGER} ON audit_log`);
  await pool.query(`
    CREATE TRIGGER ${TRIGGER}
    BEFORE INSERT ON audit_log
    FOR EACH ROW EXECUTE FUNCTION ${FUNCTION}()
  `);
}

async function removeAuditFailure(): Promise<void> {
  const pool = getPool();
  await pool.query(`DROP TRIGGER IF EXISTS ${TRIGGER} ON audit_log`);
  await pool.query(`DROP FUNCTION IF EXISTS ${FUNCTION}()`);
}

beforeEach(async () => {
  await truncateAllTables();
  await seedBaseData();
  await flushTestRedis();
  email.sendInvitationEmail.mockResolvedValue(undefined);
});

afterEach(async () => {
  await removeAuditFailure();
});

describe('invitation audit durability', () => {
  it('rolls back the invitation and skips email when the audit insert fails', async () => {
    const organization = await createTestOrganization();
    await installAuditFailure();

    await expect(
      inviteUser({
        organizationId: organization.id,
        input: { email: 'durable@example.test' },
        actor: { kind: 'service', clientId: 'bff-client', displayName: 'Tenant BFF' },
      }),
    ).rejects.toThrow(/audit unavailable/);

    const invitations = await getPool().query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM invitation_tokens
        WHERE organization_id = $1`,
      [organization.id],
    );
    expect(invitations.rows[0]?.count).toBe(0);

    const audits = await getPool().query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM audit_log
        WHERE organization_id = $1 AND event_type = 'user.invited'`,
      [organization.id],
    );
    expect(audits.rows[0]?.count).toBe(0);
    expect(email.sendInvitationEmail).not.toHaveBeenCalled();
  });
});
