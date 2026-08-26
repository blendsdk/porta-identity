/**
 * Enhanced invitation integration tests.
 *
 * Validates invitation token storage with details (personal message,
 * pre-assignment data), retrieval of invitation tokens with details,
 * and the invitation token lifecycle.
 *
 * @see 07-import-export-invitation.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import { createTestOrganization, createTestUser } from '../helpers/factories.js';
import {
  insertInvitationToken,
  findValidInvitationToken,
  markTokenUsed,
} from '../../../src/auth/token-repository.js';
import { createHash, randomBytes } from 'node:crypto';

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

  // ── Insert & Find Invitation Tokens ────────────────────────────────

  describe('insertInvitationToken / findValidInvitationToken', () => {
    it('should store and retrieve an invitation token without details', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);
      const { hash } = generateTokenPair();

      await insertInvitationToken(
        user.id,
        hash,
        new Date(Date.now() + 86400_000), // 24h from now
      );

      const token = await findValidInvitationToken(hash);

      expect(token).not.toBeNull();
      expect(token!.userId).toBe(user.id);
      expect(token!.tokenHash).toBe(hash);
      expect(token!.details).toBeNull();
      expect(token!.invitedBy).toBeNull();
      expect(token!.usedAt).toBeNull();
    });

    it('should store and retrieve an invitation token with details', async () => {
      const org = await createTestOrganization();
      const inviter = await createTestUser(org.id, { email: 'inviter@test.com' });
      const invitee = await createTestUser(org.id, { email: 'invitee@test.com' });
      const { hash } = generateTokenPair();

      const details = {
        personalMessage: 'Welcome to our team!',
        inviterName: 'John Admin',
        rolePreAssignments: [
          { applicationId: 'app-uuid-1', roleId: 'role-uuid-1' },
        ],
        claimPreAssignments: [
          { applicationId: 'app-uuid-2', claimDefinitionId: 'claim-uuid-1', value: 'engineering' },
        ],
      };

      await insertInvitationToken(
        invitee.id,
        hash,
        new Date(Date.now() + 86400_000),
        details,
        inviter.id,
      );

      const token = await findValidInvitationToken(hash);

      expect(token).not.toBeNull();
      expect(token!.userId).toBe(invitee.id);
      expect(token!.details).not.toBeNull();
      expect(token!.details!.personalMessage).toBe('Welcome to our team!');
      expect(token!.details!.inviterName).toBe('John Admin');
      expect(token!.details!.rolePreAssignments).toBeDefined();
      expect(token!.details!.claimPreAssignments).toBeDefined();
      expect(token!.invitedBy).toBe(inviter.id);
    });

    it('should return null for non-existent token hash', async () => {
      const fakeHash = createHash('sha256').update('nonexistent').digest('hex');

      const token = await findValidInvitationToken(fakeHash);

      expect(token).toBeNull();
    });

    it('should return null for expired invitation token', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);
      const { hash } = generateTokenPair();

      // Insert with expiry in the past
      await insertInvitationToken(
        user.id,
        hash,
        new Date(Date.now() - 1000), // already expired
      );

      const token = await findValidInvitationToken(hash);

      expect(token).toBeNull();
    });

    it('should return null for already-consumed invitation token', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);
      const { hash } = generateTokenPair();

      await insertInvitationToken(
        user.id,
        hash,
        new Date(Date.now() + 86400_000),
      );

      // Consume the token — find it first to get its ID
      const found = await findValidInvitationToken(hash);
      await markTokenUsed('invitation_tokens', found!.id);

      const token = await findValidInvitationToken(hash);

      expect(token).toBeNull();
    });
  });

  // ── Details Preservation ───────────────────────────────────────────

  describe('details JSONB preservation', () => {
    it('should preserve complex nested details', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);
      const { hash } = generateTokenPair();

      const complexDetails = {
        personalMessage: 'Join us! 🎉',
        inviterName: 'Ádmin Üser',
        rolePreAssignments: [
          { applicationId: 'aaa-bbb-ccc', roleId: 'ddd-eee-fff' },
          { applicationId: 'ggg-hhh-iii', roleId: 'jjj-kkk-lll' },
        ],
        claimPreAssignments: [
          { applicationId: 'aaa-bbb-ccc', claimDefinitionId: 'claim-1', value: 'dept-a' },
        ],
      };

      await insertInvitationToken(
        user.id,
        hash,
        new Date(Date.now() + 86400_000),
        complexDetails,
      );

      const token = await findValidInvitationToken(hash);

      expect(token!.details).toEqual(complexDetails);
    });

    it('should handle empty details object', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);
      const { hash } = generateTokenPair();

      await insertInvitationToken(
        user.id,
        hash,
        new Date(Date.now() + 86400_000),
        {},
      );

      const token = await findValidInvitationToken(hash);

      expect(token!.details).toEqual({});
    });

    it('should handle null details gracefully', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);
      const { hash } = generateTokenPair();

      await insertInvitationToken(
        user.id,
        hash,
        new Date(Date.now() + 86400_000),
        null,
        null,
      );

      const token = await findValidInvitationToken(hash);

      expect(token!.details).toBeNull();
      expect(token!.invitedBy).toBeNull();
    });
  });

  // ── Multiple Invitations ───────────────────────────────────────────

  describe('multiple invitations', () => {
    it('should support multiple pending invitations for different users', async () => {
      const org = await createTestOrganization();
      const user1 = await createTestUser(org.id, { email: 'inv1@test.com' });
      const user2 = await createTestUser(org.id, { email: 'inv2@test.com' });

      const token1 = generateTokenPair();
      const token2 = generateTokenPair();

      await insertInvitationToken(
        user1.id,
        token1.hash,
        new Date(Date.now() + 86400_000),
        { personalMessage: 'Welcome user 1!' },
      );
      await insertInvitationToken(
        user2.id,
        token2.hash,
        new Date(Date.now() + 86400_000),
        { personalMessage: 'Welcome user 2!' },
      );

      const found1 = await findValidInvitationToken(token1.hash);
      const found2 = await findValidInvitationToken(token2.hash);

      expect(found1!.userId).toBe(user1.id);
      expect(found1!.details!.personalMessage).toBe('Welcome user 1!');
      expect(found2!.userId).toBe(user2.id);
      expect(found2!.details!.personalMessage).toBe('Welcome user 2!');
    });
  });
});
