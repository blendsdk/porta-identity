import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module before importing the repository
vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
import {
  insertApplication,
  findApplicationById,
  findApplicationBySlug,
  updateApplication,
  listApplications,
  slugExists,
  insertModule,
  findModuleById,
  updateModule,
  listModules,
  moduleSlugExists,
} from '../../../src/applications/repository.js';
import type { ApplicationRow, ApplicationModuleRow } from '../../../src/applications/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Helper to create a mock pool with a query function returning given rows */
function mockPool(rows: Record<string, unknown>[] = []) {
  const mockQuery = vi.fn().mockResolvedValue({ rows, rowCount: rows.length });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });
  return mockQuery;
}

/** Standard test application row (snake_case, as from DB) */
function createAppRow(overrides: Partial<ApplicationRow> = {}): ApplicationRow {
  return {
    id: 'app-uuid-1',
    name: 'BusinessSuite',
    slug: 'business-suite',
    description: 'A comprehensive business suite',
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Standard test module row (snake_case, as from DB) */
function createModuleRow(overrides: Partial<ApplicationModuleRow> = {}): ApplicationModuleRow {
  return {
    id: 'mod-uuid-1',
    application_id: 'app-uuid-1',
    name: 'CRM',
    slug: 'crm',
    description: 'Customer relationship management',
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('application repository', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // insertApplication
  // -------------------------------------------------------------------------

  describe('insertApplication', () => {
    it('should execute INSERT with correct parameters', async () => {
      const row = createAppRow();
      const mockQuery = mockPool([row]);

      await insertApplication({
        name: 'BusinessSuite',
        slug: 'business-suite',
        description: 'A comprehensive business suite',
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO applications');
      expect(sql).toContain('RETURNING *');

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('BusinessSuite');
      expect(params[1]).toBe('business-suite');
      expect(params[2]).toBe('A comprehensive business suite');
    });

    it('should return a mapped Application object', async () => {
      const row = createAppRow();
      mockPool([row]);

      const app = await insertApplication({
        name: 'BusinessSuite',
        slug: 'business-suite',
      });

      // Verify camelCase mapping
      expect(app.id).toBe('app-uuid-1');
      expect(app.name).toBe('BusinessSuite');
      expect(app.slug).toBe('business-suite');
      expect(app.status).toBe('active');
      expect(app.createdAt).toBeInstanceOf(Date);
      expect(app.updatedAt).toBeInstanceOf(Date);
    });

    it('should default description to null when not provided', async () => {
      const row = createAppRow({ description: null });
      const mockQuery = mockPool([row]);

      await insertApplication({ name: 'Test', slug: 'test' });

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[2]).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findApplicationById
  // -------------------------------------------------------------------------

  describe('findApplicationById', () => {
    it('should return mapped application when found', async () => {
      const row = createAppRow();
      mockPool([row]);

      const app = await findApplicationById('app-uuid-1');

      expect(app).not.toBeNull();
      expect(app!.id).toBe('app-uuid-1');
      expect(app!.slug).toBe('business-suite');
    });

    it('should return null when not found', async () => {
      mockPool([]);

      const app = await findApplicationById('nonexistent');

      expect(app).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findApplicationBySlug
  // -------------------------------------------------------------------------

  describe('findApplicationBySlug', () => {
    it('should return mapped application when found', async () => {
      const row = createAppRow();
      mockPool([row]);

      const app = await findApplicationBySlug('business-suite');

      expect(app).not.toBeNull();
      expect(app!.slug).toBe('business-suite');
    });

    it('should return null when not found', async () => {
      mockPool([]);

      const app = await findApplicationBySlug('nonexistent');

      expect(app).toBeNull();
    });

    it('should not filter by status (returns any status)', async () => {
      const row = createAppRow({ status: 'archived' });
      const mockQuery = mockPool([row]);

      const app = await findApplicationBySlug('business-suite');

      // Verify the SQL does NOT contain a status filter
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).not.toContain('status');
      expect(app!.status).toBe('archived');
    });
  });

  // -------------------------------------------------------------------------
  // updateApplication
  // -------------------------------------------------------------------------

  describe('updateApplication', () => {
    it('should build dynamic SQL for partial update', async () => {
      const row = createAppRow({ name: 'Updated Name' });
      const mockQuery = mockPool([row]);

      await updateApplication('app-uuid-1', { name: 'Updated Name' });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE applications SET');
      expect(sql).toContain('name = $2');
      expect(sql).toContain('WHERE id = $1');
      expect(sql).toContain('RETURNING *');

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('app-uuid-1');
      expect(params[1]).toBe('Updated Name');
    });

    it('should include multiple fields in SET clause', async () => {
      const row = createAppRow({ name: 'New', description: 'New desc' });
      const mockQuery = mockPool([row]);

      await updateApplication('app-uuid-1', {
        name: 'New',
        description: 'New desc',
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('name = $2');
      expect(sql).toContain('description = $3');
    });

    it('should throw when application not found', async () => {
      mockPool([]); // No rows returned

      await expect(
        updateApplication('nonexistent', { name: 'Test' }),
      ).rejects.toThrow('Application not found');
    });

    it('should throw when no fields provided', async () => {
      mockPool([]);

      await expect(
        updateApplication('app-uuid-1', {}),
      ).rejects.toThrow('No fields to update');
    });
  });

  // -------------------------------------------------------------------------
  // listApplications
  // -------------------------------------------------------------------------

  describe('listApplications', () => {
    it('should execute count and data queries with correct pagination', async () => {
      const row = createAppRow();
      // First call: count query, second call: data query
      const mockQuery = vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 });
      (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

      const result = await listApplications({ page: 1, pageSize: 10 });

      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].slug).toBe('business-suite');
    });

    it('should add WHERE clause when status filter provided', async () => {
      const mockQuery = vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

      await listApplications({ page: 1, pageSize: 10, status: 'active' });

      // Both queries should contain status filter
      const countSql = mockQuery.mock.calls[0][0] as string;
      const dataSql = mockQuery.mock.calls[1][0] as string;
      expect(countSql).toContain('status = $1');
      expect(dataSql).toContain('status = $1');
    });

    it('should add ILIKE clause when search provided', async () => {
      const mockQuery = vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

      await listApplications({ page: 1, pageSize: 10, search: 'suite' });

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('ILIKE');

      // Verify the search param has wildcard wrapping
      const countParams = mockQuery.mock.calls[0][1] as unknown[];
      expect(countParams[0]).toBe('%suite%');
    });

    it('should use whitelisted sort column and direction', async () => {
      const mockQuery = vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

      await listApplications({
        page: 1,
        pageSize: 10,
        sortBy: 'name',
        sortOrder: 'asc',
      });

      const dataSql = mockQuery.mock.calls[1][0] as string;
      expect(dataSql).toContain('ORDER BY name ASC');
    });
  });

  // -------------------------------------------------------------------------
  // slugExists
  // -------------------------------------------------------------------------

  describe('slugExists', () => {
    it('should return true when slug exists', async () => {
      mockPool([{ exists: true }]);

      const exists = await slugExists('business-suite');

      expect(exists).toBe(true);
    });

    it('should return false when slug does not exist', async () => {
      mockPool([{ exists: false }]);

      const exists = await slugExists('nonexistent');

      expect(exists).toBe(false);
    });

    it('should exclude given ID when excludeId provided', async () => {
      const mockQuery = mockPool([{ exists: false }]);

      await slugExists('business-suite', 'app-uuid-1');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('id != $2');

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('business-suite');
      expect(params[1]).toBe('app-uuid-1');
    });
  });

  // =========================================================================
  // Module CRUD
  // =========================================================================

  // -------------------------------------------------------------------------
  // insertModule
  // -------------------------------------------------------------------------

  describe('insertModule', () => {
    it('should execute INSERT with correct parameters', async () => {
      const row = createModuleRow();
      const mockQuery = mockPool([row]);

      await insertModule({
        applicationId: 'app-uuid-1',
        name: 'CRM',
        slug: 'crm',
        description: 'Customer relationship management',
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO application_modules');
      expect(sql).toContain('RETURNING *');

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('app-uuid-1');
      expect(params[1]).toBe('CRM');
      expect(params[2]).toBe('crm');
      expect(params[3]).toBe('Customer relationship management');
    });

    it('should return a mapped ApplicationModule object', async () => {
      const row = createModuleRow();
      mockPool([row]);

      const mod = await insertModule({
        applicationId: 'app-uuid-1',
        name: 'CRM',
        slug: 'crm',
      });

      // Verify camelCase mapping
      expect(mod.id).toBe('mod-uuid-1');
      expect(mod.applicationId).toBe('app-uuid-1');
      expect(mod.name).toBe('CRM');
      expect(mod.slug).toBe('crm');
      expect(mod.status).toBe('active');
      expect(mod.createdAt).toBeInstanceOf(Date);
    });
  });

  // -------------------------------------------------------------------------
  // findModuleById
  // -------------------------------------------------------------------------

  describe('findModuleById', () => {
    it('should return mapped module when found', async () => {
      const row = createModuleRow();
      mockPool([row]);

      const mod = await findModuleById('mod-uuid-1');

      expect(mod).not.toBeNull();
      expect(mod!.id).toBe('mod-uuid-1');
      expect(mod!.applicationId).toBe('app-uuid-1');
    });

    it('should return null when not found', async () => {
      mockPool([]);

      const mod = await findModuleById('nonexistent');

      expect(mod).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // updateModule
  // -------------------------------------------------------------------------

  describe('updateModule', () => {
    it('should build dynamic SQL for partial update', async () => {
      const row = createModuleRow({ name: 'Updated CRM' });
      const mockQuery = mockPool([row]);

      await updateModule('mod-uuid-1', { name: 'Updated CRM' });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE application_modules SET');
      expect(sql).toContain('name = $2');
      expect(sql).toContain('WHERE id = $1');
      expect(sql).toContain('RETURNING *');
    });

    it('should throw when module not found', async () => {
      mockPool([]);

      await expect(
        updateModule('nonexistent', { name: 'Test' }),
      ).rejects.toThrow('Module not found');
    });

    it('should throw when no fields provided', async () => {
      mockPool([]);

      await expect(
        updateModule('mod-uuid-1', {}),
      ).rejects.toThrow('No fields to update');
    });
  });

  // -------------------------------------------------------------------------
  // listModules
  // -------------------------------------------------------------------------

  describe('listModules', () => {
    it('should return all modules for an application ordered by name', async () => {
      const rows = [
        createModuleRow({ id: 'mod-1', name: 'CRM', slug: 'crm' }),
        createModuleRow({ id: 'mod-2', name: 'Invoicing', slug: 'invoicing' }),
      ];
      const mockQuery = mockPool(rows);

      const modules = await listModules('app-uuid-1');

      expect(modules).toHaveLength(2);
      expect(modules[0].name).toBe('CRM');
      expect(modules[1].name).toBe('Invoicing');

      // Verify the SQL filters by application_id and orders by name
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('WHERE application_id = $1');
      expect(sql).toContain('ORDER BY name ASC');
    });

    it('should return empty array when no modules exist', async () => {
      mockPool([]);

      const modules = await listModules('app-uuid-1');

      expect(modules).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // moduleSlugExists
  // -------------------------------------------------------------------------

  describe('moduleSlugExists', () => {
    it('should return true when module slug exists within application', async () => {
      mockPool([{ exists: true }]);

      const exists = await moduleSlugExists('app-uuid-1', 'crm');

      expect(exists).toBe(true);
    });

    it('should return false when module slug does not exist', async () => {
      mockPool([{ exists: false }]);

      const exists = await moduleSlugExists('app-uuid-1', 'nonexistent');

      expect(exists).toBe(false);
    });

    it('should scope check to application_id', async () => {
      const mockQuery = mockPool([{ exists: false }]);

      await moduleSlugExists('app-uuid-1', 'crm');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('application_id = $1');
      expect(sql).toContain('slug = $2');

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('app-uuid-1');
      expect(params[1]).toBe('crm');
    });

    it('should exclude given ID when excludeId provided', async () => {
      const mockQuery = mockPool([{ exists: false }]);

      await moduleSlugExists('app-uuid-1', 'crm', 'mod-uuid-1');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('id != $3');

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('app-uuid-1');
      expect(params[1]).toBe('crm');
      expect(params[2]).toBe('mod-uuid-1');
    });
  });
});
