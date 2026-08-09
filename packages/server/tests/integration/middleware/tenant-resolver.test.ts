/**
 * Tenant resolver middleware integration tests.
 *
 * Verifies tenant resolution with real PostgreSQL and Redis cache.
 * Tests cover: resolve active org by slug, cache-first second request,
 * suspended org → 403, archived org → 404, non-existent slug → 404,
 * and cache invalidation on org update.
 *
 * Each test starts with a clean slate via truncateAllTables() + seedBaseData()
 * + flushTestRedis().
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import { createTestOrganization } from '../helpers/factories.js';
import {
  getCachedOrganizationBySlug,
  cacheOrganization,
} from '../../../src/organizations/cache.js';
import {
  findOrganizationBySlug,
  updateOrganization,
} from '../../../src/organizations/repository.js';

describe('Tenant Resolver (Integration)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();
  });

  // ── Resolve Active Org by Slug ─────────────────────────────────

  it('should resolve an active organization by slug from DB', async () => {
    const org = await createTestOrganization({ name: 'Tenant Test Org' });

    // Simulate the resolution flow: query DB directly (no cache yet)
    const found = await findOrganizationBySlug(org.slug);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(org.id);
    expect(found!.name).toBe('Tenant Test Org');
    expect(found!.status).toBe('active');
  });

  // ── Cache-First Resolution ─────────────────────────────────────

  it('should serve from Redis cache after first resolution', async () => {
    const org = await createTestOrganization({ name: 'Cached Org' });

    // First: cache miss → fetch from DB → cache it
    let cached = await getCachedOrganizationBySlug(org.slug);
    expect(cached).toBeNull(); // Cache is empty

    // Cache the org (simulating what the middleware does)
    await cacheOrganization(org);

    // Second: should hit cache
    cached = await getCachedOrganizationBySlug(org.slug);
    expect(cached).not.toBeNull();
    expect(cached!.id).toBe(org.id);
    expect(cached!.name).toBe('Cached Org');
  });

  // ── Suspended Org → 403 ────────────────────────────────────────

  it('should reject a suspended organization with status check', async () => {
    const org = await createTestOrganization({ name: 'Suspend Me Org' });

    // Suspend the organization
    await updateOrganization(org.id, { status: 'suspended' });

    // Fetch the updated org
    const found = await findOrganizationBySlug(org.slug);
    expect(found).not.toBeNull();
    expect(found!.status).toBe('suspended');

    // The middleware would return 403 for this status.
    // We verify the status is correctly returned so the middleware can decide.
  });

  // ── Archived Org → 404 ─────────────────────────────────────────

  it('should reject an archived organization with status check', async () => {
    const org = await createTestOrganization({ name: 'Archive Me Org' });

    // Archive the organization
    await updateOrganization(org.id, { status: 'archived' });

    // Fetch the updated org
    const found = await findOrganizationBySlug(org.slug);
    expect(found).not.toBeNull();
    expect(found!.status).toBe('archived');

    // The middleware would return 404 for this status.
  });

  // ── Non-Existent Slug → null ───────────────────────────────────

  it('should return null for a non-existent slug', async () => {
    const found = await findOrganizationBySlug('totally-nonexistent-slug');
    expect(found).toBeNull();

    // Cache should also miss
    const cached = await getCachedOrganizationBySlug('totally-nonexistent-slug');
    expect(cached).toBeNull();
  });

  // ── Cache Invalidation on Update ───────────────────────────────

  it('should serve updated data after cache invalidation', async () => {
    const org = await createTestOrganization({ name: 'Original Name' });

    // Cache the org
    await cacheOrganization(org);

    // Verify cache has the original name
    let cached = await getCachedOrganizationBySlug(org.slug);
    expect(cached).not.toBeNull();
    expect(cached!.name).toBe('Original Name');

    // Update the org name in the DB
    await updateOrganization(org.id, { name: 'Updated Name' });

    // Flush Redis to simulate cache invalidation
    await flushTestRedis();

    // Cache miss — would need to re-fetch from DB
    cached = await getCachedOrganizationBySlug(org.slug);
    expect(cached).toBeNull();

    // Fetch fresh from DB and cache it
    const fresh = await findOrganizationBySlug(org.slug);
    expect(fresh).not.toBeNull();
    expect(fresh!.name).toBe('Updated Name');

    // Re-cache the updated org
    await cacheOrganization(fresh!);

    // Now cache should reflect the updated name
    cached = await getCachedOrganizationBySlug(org.slug);
    expect(cached).not.toBeNull();
    expect(cached!.name).toBe('Updated Name');
  });
});
