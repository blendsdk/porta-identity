import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
import {
  insertOrganization,
  findOrganizationById,
  findOrganizationBySlug,
  findSuperAdminOrganization,
  updateOrganization,
  listOrganizations,
  slugExists,
} from '../../../src/organizations/repository.js';
import type { OrganizationRow } from '../../../src/organizations/types.js';

/** Helper to create a mock pool with a query function returning given rows */
function mockPool(rows: Record<string, unknown>[] = []) {
  const mockQuery = vi.fn().mockResolvedValue({ rows, rowCount: rows.length });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });
  return mockQuery;
}

/** Standard test organization row (snake_case, as from DB) */
function createTestRow(overrides: Partial<OrganizationRow> = {}): OrganizationRow {
  return {
    id: 'org-uuid-1',
    name: 'Acme Corporation',
    slug: 'acme-corporation',
    status: 'active',
    is_super_admin: false,
    branding_logo_url: null,
    branding_favicon_url: null,
    branding_primary_color: '#3B82F6',
    branding_company_name: 'Acme Corp',
    branding_custom_css: null,
    default_locale: 'en',
    two_factor_policy: 'optional',
    default_login_methods: ['password', 'magic_link'],
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}


describe('organization repository', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // insertOrganization
  // -------------------------------------------------------------------------

  describe('insertOrganization', () => {
    it('should execute INSERT with correct parameters', async () => {
      const row = createTestRow();
      const mockQuery = mockPool([row]);

      await insertOrganization({
        name: 'Acme Corporation',
        slug: 'acme-corporation',
        defaultLocale: 'en',
        brandingPrimaryColor: '#3B82F6',
        brandingCompanyName: 'Acme Corp',
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO organizations');
      expect(sql).toContain('RETURNING *');

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('Acme Corporation');
      expect(params[1]).toBe('acme-corporation');
      expect(params[2]).toBe('en');
    });

    it('should return a mapped Organization object', async () => {
      const row = createTestRow();
      mockPool([row]);

      const org = await insertOrganization({
        name: 'Acme Corporation',
        slug: 'acme-corporation',
        defaultLocale: 'en',
      });

      // Verify camelCase mapping
      expect(org.id).toBe('org-uuid-1');
      expect(org.isSuperAdmin).toBe(false);
      expect(org.brandingPrimaryColor).toBe('#3B82F6');
      expect(org.createdAt).toBeInstanceOf(Date);
    });

    it('should omit default_login_methods column when not provided (DB DEFAULT applies)', async () => {
      // Back-compat path: callers that don't know about the new column
      // should produce SQL that doesn't mention it, so the DB DEFAULT fires.
      const mockQuery = mockPool([createTestRow()]);

      await insertOrganization({
        name: 'Acme Corporation',
        slug: 'acme-corporation',
        defaultLocale: 'en',
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).not.toContain('default_login_methods');

      const params = mockQuery.mock.calls[0][1] as unknown[];
      // Without the column there should be exactly 8 placeholders.
      expect(params).toHaveLength(8);
    });

    it('should include default_login_methods column + value when provided', async () => {
      const mockQuery = mockPool([createTestRow({ default_login_methods: ['password'] })]);

      await insertOrganization({
        name: 'Acme Corporation',
        slug: 'acme-corporation',
        defaultLocale: 'en',
        defaultLoginMethods: ['password'],
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('default_login_methods');

      const params = mockQuery.mock.calls[0][1] as unknown[];
      // 8 base columns + 1 login_methods column = 9 params, login methods last.
      expect(params).toHaveLength(9);
      expect(params[8]).toEqual(['password']);
    });
  });


  // -------------------------------------------------------------------------
  // findOrganizationById
  // -------------------------------------------------------------------------

  describe('findOrganizationById', () => {
    it('should return mapped organization when found', async () => {
      const row = createTestRow();
      mockPool([row]);

      const org = await findOrganizationById('org-uuid-1');

      expect(org).not.toBeNull();
      expect(org!.id).toBe('org-uuid-1');
      expect(org!.slug).toBe('acme-corporation');
    });

    it('should return null when not found', async () => {
      mockPool([]);

      const org = await findOrganizationById('nonexistent');

      expect(org).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findOrganizationBySlug
  // -------------------------------------------------------------------------

  describe('findOrganizationBySlug', () => {
    it('should return mapped organization when found', async () => {
      const row = createTestRow();
      mockPool([row]);

      const org = await findOrganizationBySlug('acme-corporation');

      expect(org).not.toBeNull();
      expect(org!.slug).toBe('acme-corporation');
    });

    it('should return null when not found', async () => {
      mockPool([]);

      const org = await findOrganizationBySlug('nonexistent');

      expect(org).toBeNull();
    });

    it('should not filter by status (returns any status)', async () => {
      const row = createTestRow({ status: 'suspended' });
      const mockQuery = mockPool([row]);

      const org = await findOrganizationBySlug('acme-corporation');

      // Verify the SQL does NOT contain a status filter
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).not.toContain('status');
      expect(org!.status).toBe('suspended');
    });
  });

  // -------------------------------------------------------------------------
  // findSuperAdminOrganization
  // -------------------------------------------------------------------------

  describe('findSuperAdminOrganization', () => {
    it('should return the super-admin organization when found', async () => {
      const row = createTestRow({ is_super_admin: true, slug: 'porta-admin' });
      mockPool([row]);

      const org = await findSuperAdminOrganization();

      expect(org).not.toBeNull();
      expect(org!.isSuperAdmin).toBe(true);
    });

    it('should return null when no super-admin org exists', async () => {
      mockPool([]);

      const org = await findSuperAdminOrganization();

      expect(org).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // updateOrganization
  // -------------------------------------------------------------------------

  describe('updateOrganization', () => {
    it('should build dynamic SQL for partial update', async () => {
      const row = createTestRow({ name: 'Updated Name' });
      const mockQuery = mockPool([row]);

      await updateOrganization('org-uuid-1', { name: 'Updated Name' });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE organizations SET');
      expect(sql).toContain('name = $2');
      expect(sql).toContain('WHERE id = $1');
      expect(sql).toContain('RETURNING *');

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('org-uuid-1');
      expect(params[1]).toBe('Updated Name');
    });

    it('should throw when organization not found', async () => {
      mockPool([]); // No rows returned

      await expect(
        updateOrganization('nonexistent', { name: 'Test' }),
      ).rejects.toThrow('Organization not found');
    });

    it('should throw when no fields provided', async () => {
      mockPool([]);

      await expect(
        updateOrganization('org-uuid-1', {}),
      ).rejects.toThrow('No fields to update');
    });
  });

  // -------------------------------------------------------------------------
  // listOrganizations
  // -------------------------------------------------------------------------

  describe('listOrganizations', () => {
    it('should execute count and data queries with correct pagination', async () => {
      const row = createTestRow();
      // First call: count query, second call: data query
      const mockQuery = vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 });
      (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

      const result = await listOrganizations({ page: 1, pageSize: 10 });

      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].slug).toBe('acme-corporation');
    });

    it('should add WHERE clause when status filter provided', async () => {
      const mockQuery = vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

      await listOrganizations({ page: 1, pageSize: 10, status: 'active' });

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

      await listOrganizations({ page: 1, pageSize: 10, search: 'acme' });

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('ILIKE');

      // Verify the search param has wildcard wrapping
      const countParams = mockQuery.mock.calls[0][1] as unknown[];
      expect(countParams[0]).toBe('%acme%');
    });

    it('should use whitelisted sort column and direction', async () => {
      const mockQuery = vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

      await listOrganizations({
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

      const exists = await slugExists('acme-corporation');

      expect(exists).toBe(true);
    });

    it('should return false when slug does not exist', async () => {
      mockPool([{ exists: false }]);

      const exists = await slugExists('nonexistent');

      expect(exists).toBe(false);
    });

    it('should exclude given ID when excludeId provided', async () => {
      const mockQuery = mockPool([{ exists: false }]);

      await slugExists('acme-corporation', 'org-uuid-1');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('id != $2');

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('acme-corporation');
      expect(params[1]).toBe('org-uuid-1');
    });
  });
});
