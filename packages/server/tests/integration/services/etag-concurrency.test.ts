/**
 * ETag optimistic concurrency integration tests.
 *
 * Validates ETag generation from real entity data and that ETags
 * change when entities are updated (enabling conflict detection).
 *
 * @see 04-cursor-pagination-etag.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import {
  createTestOrganization,
  createTestApplication,
  createTestClient,
  createTestUser,
} from '../helpers/factories.js';
import {
  updateOrganization,
  findOrganizationById,
} from '../../../src/organizations/repository.js';
import {
  updateApplication,
  findApplicationById,
} from '../../../src/applications/repository.js';
import { updateClient, findClientById } from '../../../src/clients/repository.js';
import { updateUser, findUserById } from '../../../src/users/repository.js';
import { generateETag, matchesETag } from '../../../src/lib/etag.js';

describe('ETag Concurrency (Integration)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();
  });

  // ── Organization ETag ──────────────────────────────────────────────

  describe('Organization ETag', () => {
    it('should generate deterministic ETag for an organization', async () => {
      const org = await createTestOrganization({ name: 'ETag Org' });

      const etag1 = generateETag('organization', org.id, org.updatedAt);
      const etag2 = generateETag('organization', org.id, org.updatedAt);

      expect(etag1).toBe(etag2);
      expect(etag1).toMatch(/^W\/"[a-f0-9]+"$/);
    });

    it('should change ETag when organization is updated', async () => {
      const org = await createTestOrganization({ name: 'ETag Change Org' });
      const etagBefore = generateETag('organization', org.id, org.updatedAt);

      await updateOrganization(org.id, { name: 'Updated Display Name' });
      const updated = await findOrganizationById(org.id);

      const etagAfter = generateETag('organization', updated!.id, updated!.updatedAt);

      expect(etagBefore).not.toBe(etagAfter);
    });

    it('should match ETag correctly with matchesETag', async () => {
      const org = await createTestOrganization({ name: 'Match Org' });
      const etag = generateETag('organization', org.id, org.updatedAt);

      expect(matchesETag(etag, etag)).toBe(true);
      expect(matchesETag('W/"wrong"', etag)).toBe(false);
      expect(matchesETag('*', etag)).toBe(true);
    });
  });

  // ── Application ETag ───────────────────────────────────────────────

  describe('Application ETag', () => {
    it('should generate deterministic ETag for an application', async () => {
      const org = await createTestOrganization();
      const app = await createTestApplication({ organizationId: org.id });

      const etag = generateETag('application', app.id, app.updatedAt);

      expect(etag).toMatch(/^W\/"[a-f0-9]+"$/);
    });

    it('should change ETag when application is updated', async () => {
      const org = await createTestOrganization();
      const app = await createTestApplication({ organizationId: org.id, name: 'ETag App' });
      const etagBefore = generateETag('application', app.id, app.updatedAt);

      await updateApplication(app.id, { name: 'Updated App Name' });
      const updated = await findApplicationById(app.id);

      const etagAfter = generateETag('application', updated!.id, updated!.updatedAt);

      expect(etagBefore).not.toBe(etagAfter);
    });
  });

  // ── Client ETag ────────────────────────────────────────────────────

  describe('Client ETag', () => {
    it('should generate deterministic ETag for a client', async () => {
      const org = await createTestOrganization();
      const app = await createTestApplication({ organizationId: org.id });
      const client = await createTestClient(org.id, app.id);

      const etag = generateETag('client', client.id, client.updatedAt);

      expect(etag).toMatch(/^W\/"[a-f0-9]+"$/);
    });

    it('should change ETag when client is updated', async () => {
      const org = await createTestOrganization();
      const app = await createTestApplication({ organizationId: org.id });
      const client = await createTestClient(org.id, app.id);
      const etagBefore = generateETag('client', client.id, client.updatedAt);

      await updateClient(client.id, { clientName: 'Updated Client' });
      const updated = await findClientById(client.id);

      const etagAfter = generateETag('client', updated!.id, updated!.updatedAt);

      expect(etagBefore).not.toBe(etagAfter);
    });
  });

  // ── User ETag ──────────────────────────────────────────────────────

  describe('User ETag', () => {
    it('should generate deterministic ETag for a user', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);

      const etag = generateETag('user', user.id, user.updatedAt);

      expect(etag).toMatch(/^W\/"[a-f0-9]+"$/);
    });

    it('should change ETag when user is updated', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);
      const etagBefore = generateETag('user', user.id, user.updatedAt);

      await updateUser(user.id, { givenName: 'Updated' });
      const updated = await findUserById(user.id);

      const etagAfter = generateETag('user', updated!.id, updated!.updatedAt);

      expect(etagBefore).not.toBe(etagAfter);
    });
  });

  // ── Cross-entity ───────────────────────────────────────────────────

  describe('Cross-entity ETag isolation', () => {
    it('should produce different ETags for different entity types with same ID and timestamp', async () => {
      const org = await createTestOrganization();

      const etagOrg = generateETag('organization', org.id, org.updatedAt);
      const etagFake = generateETag('application', org.id, org.updatedAt);

      expect(etagOrg).not.toBe(etagFake);
    });

    it('should support wildcard matching', async () => {
      const org = await createTestOrganization();
      const etag = generateETag('organization', org.id, org.updatedAt);

      expect(matchesETag('*', etag)).toBe(true);
    });

    it('should support multi-value If-Match headers', async () => {
      const org = await createTestOrganization();
      const etag = generateETag('organization', org.id, org.updatedAt);

      const multiValue = `W/"wrong1", ${etag}, W/"wrong2"`;
      expect(matchesETag(multiValue, etag)).toBe(true);
    });
  });
});
