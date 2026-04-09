/**
 * Organization repository integration tests.
 *
 * Verifies CRUD operations against a real PostgreSQL database.
 * Tests cover: insert, find by ID/slug, slug uniqueness,
 * super-admin constraint, update, list with pagination/filter/search/sort,
 * slugExists check, and findSuperAdminOrganization.
 *
 * Each test starts with a clean slate via truncateAllTables() + seedBaseData().
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import {
  createTestOrganization,
  buildOrganizationInput,
} from '../helpers/factories.js';
import {
  insertOrganization,
  findOrganizationById,
  findOrganizationBySlug,
  findSuperAdminOrganization,
  updateOrganization,
  listOrganizations,
  slugExists,
} from '../../../src/organizations/repository.js';

describe('Organization Repository (Integration)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();
  });

  // ── Insert & Find ────────────────────────────────────────────

  it('should insert and retrieve an organization by ID', async () => {
    const org = await createTestOrganization();

    const found = await findOrganizationById(org.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(org.id);
    expect(found!.name).toBe(org.name);
    expect(found!.slug).toBe(org.slug);
    expect(found!.status).toBe('active');
    expect(found!.isSuperAdmin).toBe(false);
    expect(found!.defaultLocale).toBe('en');
    // Timestamps should be Date instances
    expect(found!.createdAt).toBeInstanceOf(Date);
    expect(found!.updatedAt).toBeInstanceOf(Date);
  });

  it('should insert and retrieve an organization by slug', async () => {
    const org = await createTestOrganization();

    const found = await findOrganizationBySlug(org.slug);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(org.id);
    expect(found!.slug).toBe(org.slug);
  });

  it('should return null for non-existent ID', async () => {
    const found = await findOrganizationById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  // ── Slug Uniqueness ──────────────────────────────────────────

  it('should reject duplicate slugs', async () => {
    await createTestOrganization({ slug: 'unique-slug-test' });

    await expect(
      insertOrganization(buildOrganizationInput({ slug: 'unique-slug-test' })),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  // ── Super-admin Constraint ───────────────────────────────────

  it('should enforce only one super-admin organization', async () => {
    // Seed data already includes one super-admin (porta-admin)
    // Inserting another with is_super_admin=TRUE should fail via the partial unique index.
    // We use raw SQL because InsertOrganizationData doesn't expose isSuperAdmin.
    const { getPool } = await import('../../../src/lib/database.js');
    const pool = getPool();

    await expect(
      pool.query(
        `INSERT INTO organizations (name, slug, is_super_admin) VALUES ('Second Admin', 'second-admin', TRUE)`,
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  // ── Update ───────────────────────────────────────────────────

  it('should update organization fields', async () => {
    const org = await createTestOrganization();

    const updated = await updateOrganization(org.id, {
      name: 'Updated Name',
      defaultLocale: 'nl',
      brandingPrimaryColor: '#ff0000',
    });

    expect(updated.name).toBe('Updated Name');
    expect(updated.defaultLocale).toBe('nl');
    expect(updated.brandingPrimaryColor).toBe('#ff0000');
    // Unchanged fields should remain
    expect(updated.slug).toBe(org.slug);
  });

  it('should update organization status', async () => {
    const org = await createTestOrganization();

    // active → suspended
    const suspended = await updateOrganization(org.id, { status: 'suspended' });
    expect(suspended.status).toBe('suspended');

    // suspended → active
    const reactivated = await updateOrganization(org.id, { status: 'active' });
    expect(reactivated.status).toBe('active');

    // active → archived
    const archived = await updateOrganization(org.id, { status: 'archived' });
    expect(archived.status).toBe('archived');
  });

  // ── List with Pagination ─────────────────────────────────────

  it('should list organizations with pagination', async () => {
    // Create 5 test orgs (plus seed porta-admin = 6 total)
    for (let i = 0; i < 5; i++) {
      await createTestOrganization();
    }

    const page1 = await listOrganizations({ page: 1, pageSize: 3 });
    expect(page1.data).toHaveLength(3);
    expect(page1.total).toBe(6);
    expect(page1.totalPages).toBe(2);
    expect(page1.page).toBe(1);

    const page2 = await listOrganizations({ page: 2, pageSize: 3 });
    expect(page2.data).toHaveLength(3);
    expect(page2.total).toBe(6);
  });

  it('should list organizations filtered by status', async () => {
    const org = await createTestOrganization();
    await updateOrganization(org.id, { status: 'suspended' });

    const result = await listOrganizations({
      page: 1,
      pageSize: 50,
      status: 'suspended',
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe(org.id);
    expect(result.data[0].status).toBe('suspended');
  });

  it('should list organizations with search', async () => {
    await createTestOrganization({ name: 'Acme Corp', slug: 'acme-corp' });
    await createTestOrganization({ name: 'Beta Inc', slug: 'beta-inc' });

    const result = await listOrganizations({
      page: 1,
      pageSize: 50,
      search: 'acme',
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Acme Corp');
  });

  it('should list organizations sorted by name ascending', async () => {
    // Clear all and recreate with known names
    await truncateAllTables();
    await insertOrganization(buildOrganizationInput({ name: 'Charlie', slug: 'charlie' }));
    await insertOrganization(buildOrganizationInput({ name: 'Alpha', slug: 'alpha' }));
    await insertOrganization(buildOrganizationInput({ name: 'Bravo', slug: 'bravo' }));

    const result = await listOrganizations({
      page: 1,
      pageSize: 50,
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expect(result.data[0].name).toBe('Alpha');
    expect(result.data[1].name).toBe('Bravo');
    expect(result.data[2].name).toBe('Charlie');
  });

  // ── slugExists ───────────────────────────────────────────────

  it('should check slug existence correctly', async () => {
    const org = await createTestOrganization({ slug: 'existing-slug' });

    // Slug is taken
    expect(await slugExists('existing-slug')).toBe(true);
    // Slug is free
    expect(await slugExists('nonexistent-slug')).toBe(false);
    // Exclude own ID (for update scenarios)
    expect(await slugExists('existing-slug', org.id)).toBe(false);
  });

  // ── findSuperAdminOrganization ───────────────────────────────

  it('should find the super-admin organization from seed', async () => {
    const superAdmin = await findSuperAdminOrganization();
    expect(superAdmin).not.toBeNull();
    expect(superAdmin!.slug).toBe('porta-admin');
    expect(superAdmin!.isSuperAdmin).toBe(true);
  });
});
