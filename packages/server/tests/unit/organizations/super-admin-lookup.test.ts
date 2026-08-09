/**
 * Focused unit tests for findSuperAdminOrganization().
 *
 * Complements the basic found/not-found tests in repository.test.ts
 * with query-level verification: SQL structure, parameter safety,
 * and full field mapping from OrganizationRow to Organization.
 *
 * These tests are particularly important for the admin-auth feature,
 * where findSuperAdminOrganization() is the entry point for the
 * `porta init` bootstrap command (03-bootstrap-init.md).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module before importing the repository
vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
import { findSuperAdminOrganization } from '../../../src/organizations/repository.js';
import type { OrganizationRow } from '../../../src/organizations/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock pool and capture the query call.
 * Returns the mock query function for assertion.
 */
function mockPool(rows: Record<string, unknown>[] = []) {
  const mockQuery = vi.fn().mockResolvedValue({ rows, rowCount: rows.length });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });
  return mockQuery;
}

/**
 * Complete super-admin OrganizationRow with all fields populated.
 * Used for verifying the full snake_case → camelCase mapping.
 */
function createSuperAdminRow(
  overrides: Partial<OrganizationRow> = {},
): OrganizationRow {
  return {
    id: 'sa-org-uuid',
    name: 'Porta Admin',
    slug: 'porta-admin',
    status: 'active',
    is_super_admin: true,
    branding_logo_url: 'https://example.com/logo.png',
    branding_favicon_url: 'https://example.com/favicon.ico',
    branding_primary_color: '#1E40AF',
    branding_company_name: 'Porta',
    branding_custom_css: '.custom { color: red; }',
    default_locale: 'en',
    two_factor_policy: 'optional',
    default_login_methods: ['password', 'magic_link'],
    created_at: new Date('2026-01-15T10:00:00Z'),
    updated_at: new Date('2026-03-20T14:30:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('findSuperAdminOrganization — query & mapping details', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── SQL query structure ──────────────────────────────────────

  describe('SQL query structure', () => {
    it('should query with is_super_admin = TRUE filter', async () => {
      const mockQuery = mockPool([]);

      await findSuperAdminOrganization();

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('is_super_admin = TRUE');
    });

    it('should use LIMIT 1 to ensure at most one result', async () => {
      const mockQuery = mockPool([]);

      await findSuperAdminOrganization();

      // The partial unique index on is_super_admin ensures uniqueness,
      // but LIMIT 1 is a defensive measure in case of data corruption.
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('LIMIT 1');
    });

    it('should not pass any query parameters (no user input)', async () => {
      const mockQuery = mockPool([]);

      await findSuperAdminOrganization();

      // The function takes no arguments and the query has no parameterized
      // values — the WHERE clause uses a literal boolean, not $1.
      // This makes it safe from SQL injection by design.
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0]).toHaveLength(1); // SQL only, no params
    });
  });

  // ── Full field mapping ───────────────────────────────────────

  describe('row-to-Organization field mapping', () => {
    it('should map all snake_case fields to camelCase Organization', async () => {
      const row = createSuperAdminRow();
      mockPool([row]);

      const org = await findSuperAdminOrganization();

      expect(org).not.toBeNull();
      // Core identity fields
      expect(org!.id).toBe('sa-org-uuid');
      expect(org!.name).toBe('Porta Admin');
      expect(org!.slug).toBe('porta-admin');
      expect(org!.status).toBe('active');
      // Super-admin flag — critical for admin-auth bootstrap
      expect(org!.isSuperAdmin).toBe(true);
      // Branding fields (snake_case → camelCase)
      expect(org!.brandingLogoUrl).toBe('https://example.com/logo.png');
      expect(org!.brandingFaviconUrl).toBe('https://example.com/favicon.ico');
      expect(org!.brandingPrimaryColor).toBe('#1E40AF');
      expect(org!.brandingCompanyName).toBe('Porta');
      expect(org!.brandingCustomCss).toBe('.custom { color: red; }');
      // Configuration fields
      expect(org!.defaultLocale).toBe('en');
      // Timestamps — must be Date instances, not strings
      expect(org!.createdAt).toBeInstanceOf(Date);
      expect(org!.updatedAt).toBeInstanceOf(Date);
      expect(org!.createdAt).toEqual(new Date('2026-01-15T10:00:00Z'));
      expect(org!.updatedAt).toEqual(new Date('2026-03-20T14:30:00Z'));
    });

    it('should handle null branding fields correctly', async () => {
      // Super-admin org may have minimal branding (all nulls)
      const row = createSuperAdminRow({
        branding_logo_url: null,
        branding_favicon_url: null,
        branding_primary_color: null,
        branding_company_name: null,
        branding_custom_css: null,
      });
      mockPool([row]);

      const org = await findSuperAdminOrganization();

      expect(org).not.toBeNull();
      expect(org!.brandingLogoUrl).toBeNull();
      expect(org!.brandingFaviconUrl).toBeNull();
      expect(org!.brandingPrimaryColor).toBeNull();
      expect(org!.brandingCompanyName).toBeNull();
      expect(org!.brandingCustomCss).toBeNull();
    });
  });
});
