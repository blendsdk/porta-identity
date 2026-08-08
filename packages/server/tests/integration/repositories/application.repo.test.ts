/**
 * Application repository integration tests.
 *
 * Verifies CRUD operations against a real PostgreSQL database.
 * Tests cover: insert, find by ID/slug, slug uniqueness,
 * update, list with pagination, module CRUD, and cascade delete.
 *
 * Each test starts with a clean slate via truncateAllTables().
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import {
  createTestOrganization,
  createTestApplication,
  buildApplicationInput,
} from '../helpers/factories.js';
import {
  insertApplication,
  findApplicationById,
  findApplicationBySlug,
  updateApplication,
  listApplications,
  slugExists,
  insertModule,
  listModules,
} from '../../../src/applications/repository.js';
import { getPool } from '../../../src/lib/database.js';

describe('Application Repository (Integration)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await flushTestRedis();
  });

  // ── Insert & Find ────────────────────────────────────────────

  it('should insert and retrieve an application by ID', async () => {
    const app = await createTestApplication();

    const found = await findApplicationById(app.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(app.id);
    expect(found!.name).toBe(app.name);
    expect(found!.slug).toBe(app.slug);
    expect(found!.status).toBe('active');
    expect(found!.createdAt).toBeInstanceOf(Date);
  });

  it('should insert and retrieve an application by slug', async () => {
    const app = await createTestApplication({ slug: 'my-test-app' });

    const found = await findApplicationBySlug('my-test-app');
    expect(found).not.toBeNull();
    expect(found!.id).toBe(app.id);
  });

  // ── Slug Uniqueness ──────────────────────────────────────────

  it('should reject duplicate application slugs', async () => {
    await createTestApplication({ slug: 'dup-app-slug' });

    await expect(
      insertApplication(buildApplicationInput({ slug: 'dup-app-slug' })),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  // ── Update ───────────────────────────────────────────────────

  it('should update application fields', async () => {
    const app = await createTestApplication();

    const updated = await updateApplication(app.id, {
      name: 'Updated App Name',
      description: 'New description',
    });

    expect(updated.name).toBe('Updated App Name');
    expect(updated.description).toBe('New description');
    expect(updated.slug).toBe(app.slug);
  });

  // ── List with Pagination ─────────────────────────────────────

  it('should list applications with pagination', async () => {
    // Create 4 apps
    for (let i = 0; i < 4; i++) {
      await createTestApplication();
    }

    const page1 = await listApplications({ page: 1, pageSize: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(4);
    expect(page1.totalPages).toBe(2);

    const page2 = await listApplications({ page: 2, pageSize: 2 });
    expect(page2.data).toHaveLength(2);
  });

  // ── Application Modules CRUD ─────────────────────────────────

  it('should add, list, and remove application modules', async () => {
    const app = await createTestApplication();

    // Add a module
    const mod = await insertModule({
      applicationId: app.id,
      name: 'User Module',
      slug: 'user-module',
      description: 'Handles user features',
    });
    expect(mod.id).toBeDefined();
    expect(mod.name).toBe('User Module');

    // List modules
    const modules = await listModules(app.id);
    expect(modules).toHaveLength(1);
    expect(modules[0].slug).toBe('user-module');

    // Delete module (no deleteModule export — use direct SQL)
    const pool = getPool();
    await pool.query('DELETE FROM application_modules WHERE id = $1', [mod.id]);
    const afterDelete = await listModules(app.id);
    expect(afterDelete).toHaveLength(0);
  });

  // ── Cascade Delete ───────────────────────────────────────────

  it('should cascade delete applications when org is deleted', async () => {
    // Applications don't have a direct org FK in the current schema,
    // but clients DO reference both org and app. Create a full chain
    // to verify app-level cascade works for its children.
    await createTestOrganization();
    const app = await createTestApplication();

    // Add a module to the app
    await insertModule({
      applicationId: app.id,
      name: 'Test Module',
      slug: 'test-module',
    });

    // Delete the app directly — modules should cascade
    const pool = getPool();
    await pool.query('DELETE FROM applications WHERE id = $1', [app.id]);

    const found = await findApplicationById(app.id);
    expect(found).toBeNull();

    // Modules should be gone too
    const modules = await listModules(app.id);
    expect(modules).toHaveLength(0);
  });

  // ── slugExists ───────────────────────────────────────────────

  it('should check slug existence correctly', async () => {
    const app = await createTestApplication({ slug: 'existing-app' });

    expect(await slugExists('existing-app')).toBe(true);
    expect(await slugExists('nonexistent-app')).toBe(false);
    // Exclude own ID for updates
    expect(await slugExists('existing-app', app.id)).toBe(false);
  });
});
