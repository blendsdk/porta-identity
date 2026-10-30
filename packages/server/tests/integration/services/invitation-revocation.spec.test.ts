/** Revocation changes only live, unaccepted invitations within the caller's exact boundary. */
import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setEmailTransport } from '../../../src/auth/email-service.js';
import type { EmailTransport } from '../../../src/auth/email-transport.js';
import { initI18n } from '../../../src/auth/i18n.js';
import { initTemplateEngine } from '../../../src/auth/template-engine.js';
import { getPool } from '../../../src/lib/database.js';
import { inviteUser } from '../../../src/users/invite-service.js';
import { revokeInvitation } from '../../../src/users/invitation-revocation-service.js';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { createTestApplication, createTestUser } from '../helpers/factories.js';
import { flushTestRedis } from '../helpers/redis.js';
import {
  REVOCATION_ACTOR, acceptFixture, createInvitationBoundary, createRevocationInvitation,
  invitationSnapshot, recipientCount, revocationAudits, revokeFixture,
} from '../helpers/invitation-revocation.js';

/** Substitute only external SMTP delivery; invitation creation and rendering remain real. */
const sendEmail = vi.fn<EmailTransport['send']>(async () => ({
  messageId: 'invitation-revocation-test', accepted: [], rejected: [],
}));

/** Remove only the audit fault injection owned by this test suite. */
async function removeAuditFailure() {
  await getPool().query('DROP TRIGGER IF EXISTS fail_invitation_revoked_audit_trigger ON audit_log');
  await getPool().query('DROP FUNCTION IF EXISTS fail_invitation_revoked_audit()');
}

beforeAll(async () => {
  await initI18n();
  await initTemplateEngine();
});
beforeEach(async () => {
  await truncateAllTables();
  await seedBaseData();
  await flushTestRedis();
  sendEmail.mockClear();
  setEmailTransport({ send: sendEmail });
});
afterEach(async () => {
  setEmailTransport(null);
  await removeAuditFailure();
});

describe('invitation revocation persistence', () => {
  it('records tenant ownership without roles and never trusts recipient ownership hints', async () => {
    const boundary = await createInvitationBoundary();
    const foreignApplication = await createTestApplication();
    const input = {
      email: 'tenant-invitation@example.test', applicationId: foreignApplication.id,
      details: { personalMessage: 'Welcome', applicationId: foreignApplication.id },
    };
    const tenant = await inviteUser({
      organizationId: boundary.organizationId, allowedApplicationId: boundary.applicationId,
      input, actor: {
        kind: 'service', clientId: REVOCATION_ACTOR.clientId,
        displayName: REVOCATION_ACTOR.clientName,
      },
    });
    expect(await invitationSnapshot(tenant.invitationId)).toMatchObject({
      application_id: boundary.applicationId, user_id: null, used_at: null,
    });
    const administrator = await createTestUser(boundary.organizationId);
    const admin = await inviteUser({
      organizationId: boundary.organizationId,
      input: { ...input, email: 'admin-invitation@example.test' },
      actor: { kind: 'admin', userId: administrator.id, displayName: 'Administrator' },
    });
    expect(await invitationSnapshot(admin.invitationId)).toMatchObject({ application_id: null });
  });

  it('consumes a live invitation once and durably records only its ids and trusted actor context', async () => {
    const boundary = await createInvitationBoundary();
    const invitation = await createRevocationInvitation(boundary.organizationId, boundary.applicationId);
    const before = await invitationSnapshot(invitation.id);
    await expect(revokeInvitation({
      ...boundary, invitationId: invitation.id, actor: REVOCATION_ACTOR,
      auditContext: { ipAddress: '192.0.2.19', userAgent: 'Invitation specification' },
    })).resolves.toBeUndefined();
    const after = await invitationSnapshot(invitation.id);
    expect(after?.used_at).toEqual(expect.any(String));
    expect(after).toEqual({ ...before, used_at: after?.used_at });
    expect((await revocationAudits(boundary.organizationId)).rows).toEqual([{
      actor_type: 'client', actor_id: null, actor_client_id: REVOCATION_ACTOR.clientId,
      actor_client_name: REVOCATION_ACTOR.clientName, user_id: null, event_category: 'admin',
      description: 'User invitation revoked',
      metadata: { invitationId: invitation.id, applicationId: boundary.applicationId },
      ip_address: '192.0.2.19', user_agent: 'Invitation specification',
    }]);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(await acceptFixture(invitation)).toBeNull();
    expect(await recipientCount(invitation)).toBe(0);
  });

  it.each(['foreign application', 'foreign organization', 'unknown id'])(
    'silently preserves all artifacts for a target with %s', async (target) => {
      const boundary = await createInvitationBoundary();
      const foreign = await createInvitationBoundary();
      const own = await createRevocationInvitation(boundary.organizationId, boundary.applicationId);
      const other = await createRevocationInvitation(
        target === 'foreign organization' ? foreign.organizationId : boundary.organizationId,
        target === 'foreign organization' ? boundary.applicationId : foreign.applicationId,
      );
      const before = await Promise.all([invitationSnapshot(own.id), invitationSnapshot(other.id)]);
      await expect(revokeFixture(boundary, target === 'unknown id' ? randomUUID() : other.id))
        .resolves.toBeUndefined();
      expect(await Promise.all([invitationSnapshot(own.id), invitationSnapshot(other.id)])).toEqual(before);
      expect((await revocationAudits(boundary.organizationId)).rows).toEqual([]);
      expect((await revocationAudits(foreign.organizationId)).rows).toEqual([]);
    },
  );

  it.each(['used', 'expired', 'revoked', 'null-owned', 'attached user'])(
    'preserves every historical field and creates no success event for an %s invitation', async (state) => {
      const boundary = await createInvitationBoundary();
      const user = state === 'used' || state === 'attached user'
        ? await createTestUser(boundary.organizationId) : undefined;
      const invitation = await createRevocationInvitation(
        boundary.organizationId, state === 'null-owned' ? null : boundary.applicationId,
        {
          usedAt: state === 'used' || state === 'revoked' ? new Date('2020-01-01') : undefined,
          expiresAt: state === 'expired' ? new Date('2020-01-01') : undefined,
          userId: user?.id,
        },
      );
      const before = await invitationSnapshot(invitation.id);
      await expect(revokeFixture(boundary, invitation.id)).resolves.toBeUndefined();
      expect(await invitationSnapshot(invitation.id)).toEqual(before);
      expect((await revocationAudits(boundary.organizationId)).rows).toEqual([]);
    },
  );

  it('keeps an accepted account and its consumed invitation unchanged', async () => {
    const boundary = await createInvitationBoundary();
    const invitation = await createRevocationInvitation(boundary.organizationId, boundary.applicationId);
    const accepted = await acceptFixture(invitation);
    expect(accepted).toEqual({ userId: expect.any(String), email: invitation.email });
    const before = await invitationSnapshot(invitation.id);
    const account = await getPool().query('SELECT * FROM users WHERE id = $1', [accepted!.userId]);
    await expect(revokeFixture(boundary, invitation.id)).resolves.toBeUndefined();
    expect(await invitationSnapshot(invitation.id)).toEqual(before);
    expect((await getPool().query('SELECT * FROM users WHERE id = $1', [accepted!.userId])).rows)
      .toEqual(account.rows);
    expect(await recipientCount(invitation)).toBe(1);
    expect((await revocationAudits(boundary.organizationId)).rows).toEqual([]);
  });

  it('rolls back revocation when durable auditing fails and leaves real acceptance usable', async () => {
    const boundary = await createInvitationBoundary();
    const invitation = await createRevocationInvitation(boundary.organizationId, boundary.applicationId);
    const before = await invitationSnapshot(invitation.id);
    try {
      await getPool().query(`
        CREATE FUNCTION fail_invitation_revoked_audit() RETURNS trigger AS $$
        BEGIN
          IF NEW.event_type = 'user.invite.revoked' THEN
            RAISE EXCEPTION 'invitation audit unavailable';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER fail_invitation_revoked_audit_trigger BEFORE INSERT ON audit_log
        FOR EACH ROW EXECUTE FUNCTION fail_invitation_revoked_audit();
      `);
      await expect(revokeFixture(boundary, invitation.id)).rejects.toThrow();
      expect(await invitationSnapshot(invitation.id)).toEqual(before);
      expect((await revocationAudits(boundary.organizationId)).rows).toEqual([]);
    } finally {
      await removeAuditFailure();
    }
    expect(await acceptFixture(invitation)).toEqual({ userId: expect.any(String), email: invitation.email });
    expect(await recipientCount(invitation)).toBe(1);
  });
});
