/**
 * Deferred invitation integration tests.
 *
 * Validates invitation token storage with details (personal message, pre-assignment data),
 * retrieval of invitation tokens with details, and the invitation token lifecycle. Invitations are
 * email/organization-keyed and carry no account until acceptance.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import { createTestOrganization, createTestUser } from '../helpers/factories.js';
import {
  replaceInvitation,
  findValidInvitationToken,
  markTokenUsed,
} from '../../../src/auth/token-repository.js';
import { getPool } from '../../../src/lib/database.js';
import { createInvitationRouter } from '../../../src/routes/invitation.js';
import { createHash, randomBytes } from 'node:crypto';

vi.mock('../../../src/auth/csrf.js', () => ({
  generateCsrfToken: () => 'csrf-token-test',
  verifyCsrfToken: () => true,
  setCsrfCookie: () => undefined,
  getCsrfFromCookie: () => 'csrf-token-test',
}));

vi.mock('../../../src/auth/i18n.js', () => ({
  resolveLocale: async () => 'en',
  getTranslationFunction: () => (key: string) => key,
}));

vi.mock('../../../src/auth/template-engine.js', () => ({
  renderPage: async () => '<html>rendered</html>',
}));

vi.mock('../../../src/auth/effective-branding.js', () => ({
  resolveEffectiveBranding: async () => ({ imageSources: {} }),
}));

/** Generate a random token and its SHA-256 hash */
function generateTokenPair(): { plaintext: string; hash: string } {
  const plaintext = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(plaintext).digest('hex');
  return { plaintext, hash };
}

describe('Enhanced Invitation (Integration)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();
  });

  // ── Store & Retrieve Invitation Tokens ─────────────────────────────

  describe('replaceInvitation / findValidInvitationToken', () => {
    it('should store and retrieve an invitation token without details', async () => {
      const org = await createTestOrganization();
      const email = 'invitee@test.com';
      const { hash } = generateTokenPair();

      await replaceInvitation({
        organizationId: org.id,
        email,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 86400_000),
      });

      const token = await findValidInvitationToken(hash, org.id);

      expect(token).not.toBeNull();
      expect(token!.userId).toBeNull();
      expect(token!.organizationId).toBe(org.id);
      expect(token!.email).toBe(email);
      expect(token!.tokenHash).toBe(hash);
      expect(token!.details).toBeNull();
      expect(token!.invitedBy).toBeNull();
      expect(token!.usedAt).toBeNull();
    });

    it('should store and retrieve an invitation token with details', async () => {
      const org = await createTestOrganization();
      const inviter = await createTestUser(org.id, { email: 'inviter@test.com' });
      const email = 'invitee@test.com';
      const { hash } = generateTokenPair();

      const details = {
        personalMessage: 'Welcome to our team!',
        inviterName: 'John Admin',
        roles: [{ applicationId: 'app-uuid-1', roleId: 'role-uuid-1' }],
        claims: [
          { applicationId: 'app-uuid-2', claimDefinitionId: 'claim-uuid-1', value: 'engineering' },
        ],
      };

      await replaceInvitation({
        organizationId: org.id,
        email,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 86400_000),
        details,
        invitedBy: inviter.id,
      });

      const token = await findValidInvitationToken(hash, org.id);

      expect(token).not.toBeNull();
      expect(token!.userId).toBeNull();
      expect(token!.email).toBe(email);
      expect(token!.details).not.toBeNull();
      expect(token!.details!.personalMessage).toBe('Welcome to our team!');
      expect(token!.details!.inviterName).toBe('John Admin');
      expect(token!.details!.roles).toBeDefined();
      expect(token!.details!.claims).toBeDefined();
      expect(token!.invitedBy).toBe(inviter.id);
    });

    it('should return null for non-existent token hash', async () => {
      const org = await createTestOrganization();
      const fakeHash = createHash('sha256').update('nonexistent').digest('hex');

      const token = await findValidInvitationToken(fakeHash, org.id);

      expect(token).toBeNull();
    });

    it('should reject a valid token issued for another organization', async () => {
      const owningOrg = await createTestOrganization({ slug: 'invite-owning-org' });
      const foreignOrg = await createTestOrganization({ slug: 'invite-foreign-org' });
      const { hash } = generateTokenPair();

      await replaceInvitation({
        organizationId: owningOrg.id,
        email: 'invitee@test.com',
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 86400_000),
      });

      expect(await findValidInvitationToken(hash, owningOrg.id)).not.toBeNull();
      expect(await findValidInvitationToken(hash, foreignOrg.id)).toBeNull();
    });

    it('should return null for expired invitation token', async () => {
      const org = await createTestOrganization();
      const { hash } = generateTokenPair();

      await replaceInvitation({
        organizationId: org.id,
        email: 'invitee@test.com',
        tokenHash: hash,
        expiresAt: new Date(Date.now() - 1000),
      });

      expect(await findValidInvitationToken(hash, org.id)).toBeNull();
    });

    it('should return null for already-consumed invitation token', async () => {
      const org = await createTestOrganization();
      const { hash } = generateTokenPair();

      await replaceInvitation({
        organizationId: org.id,
        email: 'invitee@test.com',
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 86400_000),
      });

      const found = await findValidInvitationToken(hash, org.id);
      await markTokenUsed('invitation_tokens', found!.id);

      expect(await findValidInvitationToken(hash, org.id)).toBeNull();
    });
  });

  // ── Details Preservation ───────────────────────────────────────────

  describe('details JSONB preservation', () => {
    it('should preserve complex nested details', async () => {
      const org = await createTestOrganization();
      const { hash } = generateTokenPair();

      const complexDetails = {
        personalMessage: 'Join us! 🎉',
        inviterName: 'Ádmin Üser',
        roles: [
          { applicationId: 'aaa-bbb-ccc', roleId: 'ddd-eee-fff' },
          { applicationId: 'ggg-hhh-iii', roleId: 'jjj-kkk-lll' },
        ],
        claims: [{ applicationId: 'aaa-bbb-ccc', claimDefinitionId: 'claim-1', value: 'dept-a' }],
      };

      await replaceInvitation({
        organizationId: org.id,
        email: 'invitee@test.com',
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 86400_000),
        details: complexDetails,
      });

      const token = await findValidInvitationToken(hash, org.id);

      expect(token!.details).toEqual(complexDetails);
    });

    it('should handle empty details object', async () => {
      const org = await createTestOrganization();
      const { hash } = generateTokenPair();

      await replaceInvitation({
        organizationId: org.id,
        email: 'invitee@test.com',
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 86400_000),
        details: {},
      });

      const token = await findValidInvitationToken(hash, org.id);

      expect(token!.details).toEqual({});
    });

    it('should handle null details gracefully', async () => {
      const org = await createTestOrganization();
      const { hash } = generateTokenPair();

      await replaceInvitation({
        organizationId: org.id,
        email: 'invitee@test.com',
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 86400_000),
        details: null,
        invitedBy: null,
      });

      const token = await findValidInvitationToken(hash, org.id);

      expect(token!.details).toBeNull();
      expect(token!.invitedBy).toBeNull();
    });
  });

  // ── Multiple Invitations ───────────────────────────────────────────

  describe('multiple invitations', () => {
    it('should support multiple pending invitations for different emails', async () => {
      const org = await createTestOrganization();
      const token1 = generateTokenPair();
      const token2 = generateTokenPair();

      await replaceInvitation({
        organizationId: org.id,
        email: 'inv1@test.com',
        tokenHash: token1.hash,
        expiresAt: new Date(Date.now() + 86400_000),
        details: { personalMessage: 'Welcome user 1!' },
      });
      await replaceInvitation({
        organizationId: org.id,
        email: 'inv2@test.com',
        tokenHash: token2.hash,
        expiresAt: new Date(Date.now() + 86400_000),
        details: { personalMessage: 'Welcome user 2!' },
      });

      const found1 = await findValidInvitationToken(token1.hash, org.id);
      const found2 = await findValidInvitationToken(token2.hash, org.id);

      expect(found1!.email).toBe('inv1@test.com');
      expect(found1!.details!.personalMessage).toBe('Welcome user 1!');
      expect(found2!.email).toBe('inv2@test.com');
      expect(found2!.details!.personalMessage).toBe('Welcome user 2!');
    });

    it('should replace the previous live invitation for the same email', async () => {
      const org = await createTestOrganization();
      const first = generateTokenPair();
      const second = generateTokenPair();

      await replaceInvitation({
        organizationId: org.id,
        email: 'repeat@test.com',
        tokenHash: first.hash,
        expiresAt: new Date(Date.now() + 86400_000),
      });
      await replaceInvitation({
        organizationId: org.id,
        email: 'repeat@test.com',
        tokenHash: second.hash,
        expiresAt: new Date(Date.now() + 86400_000),
      });

      expect(await findValidInvitationToken(first.hash, org.id)).toBeNull();
      expect(await findValidInvitationToken(second.hash, org.id)).not.toBeNull();
    });
  });

  // ── Rejection audit persistence ────────────────────────────────────

  describe('rejection audit persistence', () => {
    it('should persist one user.invite.failed security event for an invalid token', async () => {
      const org = await createTestOrganization({ slug: 'invite-audit-org' });
      const router = createInvitationRouter();
      const layer = router.stack.find(
        (entry) => entry.methods.includes('GET') && entry.path.includes('accept-invite'),
      );
      expect(layer).toBeDefined();

      const ctx = {
        params: { orgSlug: org.slug, token: 'unknown-invitation-token' },
        query: {},
        state: { organization: org },
        ip: '127.0.0.1',
        status: 200,
        type: '',
        body: undefined as unknown,
        cookies: { get: () => 'csrf-token-test', set: () => undefined },
        get: () => '',
      };

      await layer!.stack[layer!.stack.length - 1](ctx as never, vi.fn() as never);

      // The rejection audit is best-effort: the handler does not await the write, so it may land
      // shortly after the response. Poll briefly for the durable row instead of racing it.
      const pool = getPool();
      let auditRow: { event_type: string; event_category: string } | undefined;
      for (let attempt = 0; attempt < 40 && auditRow === undefined; attempt += 1) {
        const result = await pool.query<{ event_type: string; event_category: string }>(
          `SELECT event_type, event_category FROM audit_log WHERE organization_id = $1 AND event_type = 'user.invite.failed'`,
          [org.id],
        );
        if (result.rowCount === 1) {
          auditRow = result.rows[0];
        } else {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }
      expect(auditRow).toMatchObject({
        event_type: 'user.invite.failed',
        event_category: 'security',
      });
    });
  });
});
