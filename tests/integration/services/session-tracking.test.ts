/**
 * Session tracking and management integration tests.
 *
 * Validates session CRUD operations against the admin_sessions table,
 * including upsert, list, filter, revoke, and user session revocation.
 *
 * @see 05-dashboard-sessions-history.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import { createTestOrganization, createTestUser } from '../helpers/factories.js';
import {
  upsertSession,
  getSession,
  listSessions,
  revokeSession,
  revokeUserSessions,
  purgeExpiredSessions,
} from '../../../src/lib/session-tracking.js';
import { randomUUID } from 'node:crypto';

describe('Session Tracking (Integration)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();
  });

  // ── Upsert & Get ──────────────────────────────────────────────────

  describe('upsertSession / getSession', () => {
    it('should create a new session and retrieve it', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);
      const sessionId = randomUUID();

      await upsertSession({
        sessionId,
        userId: user.id,
        organizationId: org.id,
        ipAddress: '192.168.1.1',
        userAgent: 'TestAgent/1.0',
        expiresAt: new Date(Date.now() + 3600_000),
      });

      const session = await getSession(sessionId);

      expect(session).not.toBeNull();
      expect(session!.sessionId).toBe(sessionId);
      expect(session!.userId).toBe(user.id);
      expect(session!.organizationId).toBe(org.id);
      expect(session!.ipAddress).toBe('192.168.1.1');
      expect(session!.userAgent).toBe('TestAgent/1.0');
      expect(session!.revokedAt).toBeNull();
    });

    it('should upsert an existing session (update on conflict)', async () => {
      const sessionId = randomUUID();

      await upsertSession({
        sessionId,
        expiresAt: new Date(Date.now() + 1800_000),
      });

      // Upsert again — should not create a duplicate
      await upsertSession({
        sessionId,
        expiresAt: new Date(Date.now() + 7200_000),
      });

      const session = await getSession(sessionId);

      // Session should still exist (upsert didn't fail or create duplicate)
      expect(session).not.toBeNull();
      expect(session!.sessionId).toBe(sessionId);
    });

    it('should return null for non-existent session', async () => {
      const session = await getSession(randomUUID());

      expect(session).toBeNull();
    });
  });

  // ── List Sessions ──────────────────────────────────────────────────

  describe('listSessions', () => {
    it('should list all sessions', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);

      for (let i = 0; i < 3; i++) {
        await upsertSession({
          sessionId: randomUUID(),
          userId: user.id,
          organizationId: org.id,
          expiresAt: new Date(Date.now() + 3600_000),
        });
      }

      const result = await listSessions({ pageSize: 10, activeOnly: false });

      expect(result.data.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter sessions by userId', async () => {
      const org = await createTestOrganization();
      const user1 = await createTestUser(org.id, { email: 'sess1@test.com' });
      const user2 = await createTestUser(org.id, { email: 'sess2@test.com' });

      await upsertSession({
        sessionId: randomUUID(),
        userId: user1.id,
        organizationId: org.id,
        expiresAt: new Date(Date.now() + 3600_000),
      });
      await upsertSession({
        sessionId: randomUUID(),
        userId: user2.id,
        organizationId: org.id,
        expiresAt: new Date(Date.now() + 3600_000),
      });

      const result = await listSessions({ userId: user1.id, pageSize: 10, activeOnly: false });

      expect(result.data.every((s) => s.userId === user1.id)).toBe(true);
    });

    it('should filter sessions by organizationId', async () => {
      const org1 = await createTestOrganization({ name: 'Sess Org 1' });
      const org2 = await createTestOrganization({ name: 'Sess Org 2' });

      await upsertSession({
        sessionId: randomUUID(),
        organizationId: org1.id,
        expiresAt: new Date(Date.now() + 3600_000),
      });
      await upsertSession({
        sessionId: randomUUID(),
        organizationId: org2.id,
        expiresAt: new Date(Date.now() + 3600_000),
      });

      const result = await listSessions({ organizationId: org1.id, pageSize: 10, activeOnly: false });

      expect(result.data.every((s) => s.organizationId === org1.id)).toBe(true);
    });

    it('should filter active sessions only', async () => {
      const org = await createTestOrganization();
      const activeId = randomUUID();
      const revokedId = randomUUID();

      await upsertSession({
        sessionId: activeId,
        organizationId: org.id,
        expiresAt: new Date(Date.now() + 3600_000),
      });
      await upsertSession({
        sessionId: revokedId,
        organizationId: org.id,
        expiresAt: new Date(Date.now() + 3600_000),
      });
      await revokeSession(revokedId);

      const result = await listSessions({ activeOnly: true, pageSize: 10 });

      expect(result.data.every((s) => s.revokedAt === null)).toBe(true);
    });

    it('should paginate sessions', async () => {
      const org = await createTestOrganization();
      for (let i = 0; i < 5; i++) {
        await upsertSession({
          sessionId: randomUUID(),
          organizationId: org.id,
          expiresAt: new Date(Date.now() + 3600_000),
        });
      }

      const page1 = await listSessions({ pageSize: 2, activeOnly: false });

      expect(page1.data).toHaveLength(2);
      expect(page1.total).toBeGreaterThan(2);
    });
  });

  // ── Revocation ─────────────────────────────────────────────────────

  describe('revokeSession', () => {
    it('should mark a session as revoked', async () => {
      const sessionId = randomUUID();
      await upsertSession({
        sessionId,
        expiresAt: new Date(Date.now() + 3600_000),
      });

      await revokeSession(sessionId);

      const session = await getSession(sessionId);
      expect(session).not.toBeNull();
      expect(session!.revokedAt).not.toBeNull();
      expect(session!.revokedAt).toBeInstanceOf(Date);
    });
  });

  describe('revokeUserSessions', () => {
    it('should revoke all sessions for a user', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);

      const sessionIds = [randomUUID(), randomUUID(), randomUUID()];
      for (const sid of sessionIds) {
        await upsertSession({
          sessionId: sid,
          userId: user.id,
          organizationId: org.id,
          expiresAt: new Date(Date.now() + 3600_000),
        });
      }

      await revokeUserSessions(user.id);

      for (const sid of sessionIds) {
        const session = await getSession(sid);
        expect(session!.revokedAt).not.toBeNull();
      }
    });
  });

  // ── Purge Expired ──────────────────────────────────────────────────

  describe('purgeExpiredSessions', () => {
    it('should remove expired sessions', async () => {
      const expiredId = randomUUID();
      const activeId = randomUUID();

      // Create an expired session (in the past)
      await upsertSession({
        sessionId: expiredId,
        expiresAt: new Date(Date.now() - 1000),
      });
      // Create an active session (in the future)
      await upsertSession({
        sessionId: activeId,
        expiresAt: new Date(Date.now() + 3600_000),
      });

      await purgeExpiredSessions();

      const expired = await getSession(expiredId);
      const active = await getSession(activeId);

      expect(expired).toBeNull();
      expect(active).not.toBeNull();
    });
  });
});
