import { describe, it, expect } from 'vitest';
import type { OrganizationRow } from '../../../src/organizations/types.js';
import { mapRowToOrganization } from '../../../src/organizations/types.js';

/**
 * Helper to create a complete OrganizationRow with sensible defaults.
 * Override individual fields as needed in each test.
 */
function createTestRow(overrides: Partial<OrganizationRow> = {}): OrganizationRow {
  return {
    id: 'org-uuid-1',
    name: 'Acme Corporation',
    slug: 'acme-corporation',
    status: 'active',
    is_super_admin: false,
    branding_logo_url: 'https://example.com/logo.png',
    branding_favicon_url: 'https://example.com/favicon.ico',
    branding_primary_color: '#3B82F6',
    branding_company_name: 'Acme Corp',
    branding_custom_css: '.login { color: red; }',
    default_locale: 'en',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-15T12:00:00Z'),
    ...overrides,
  };
}

describe('types', () => {
  describe('mapRowToOrganization', () => {
    it('should correctly map all fields from a full row', () => {
      const row = createTestRow();
      const org = mapRowToOrganization(row);

      expect(org).toEqual({
        id: 'org-uuid-1',
        name: 'Acme Corporation',
        slug: 'acme-corporation',
        status: 'active',
        isSuperAdmin: false,
        brandingLogoUrl: 'https://example.com/logo.png',
        brandingFaviconUrl: 'https://example.com/favicon.ico',
        brandingPrimaryColor: '#3B82F6',
        brandingCompanyName: 'Acme Corp',
        brandingCustomCss: '.login { color: red; }',
        defaultLocale: 'en',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-15T12:00:00Z'),
      });
    });

    it('should preserve null values for branding fields', () => {
      const row = createTestRow({
        branding_logo_url: null,
        branding_favicon_url: null,
        branding_primary_color: null,
        branding_company_name: null,
        branding_custom_css: null,
      });
      const org = mapRowToOrganization(row);

      expect(org.brandingLogoUrl).toBeNull();
      expect(org.brandingFaviconUrl).toBeNull();
      expect(org.brandingPrimaryColor).toBeNull();
      expect(org.brandingCompanyName).toBeNull();
      expect(org.brandingCustomCss).toBeNull();
    });

    it('should cast status string to OrganizationStatus type', () => {
      // The DB CHECK constraint ensures only valid values, but we verify
      // the cast works for all three valid statuses
      for (const status of ['active', 'suspended', 'archived'] as const) {
        const row = createTestRow({ status });
        const org = mapRowToOrganization(row);
        expect(org.status).toBe(status);
      }
    });

    it('should preserve Date objects for timestamp fields', () => {
      const createdAt = new Date('2026-03-15T10:30:00Z');
      const updatedAt = new Date('2026-04-01T14:45:00Z');
      const row = createTestRow({ created_at: createdAt, updated_at: updatedAt });
      const org = mapRowToOrganization(row);

      // Verify they are Date instances, not strings
      expect(org.createdAt).toBeInstanceOf(Date);
      expect(org.updatedAt).toBeInstanceOf(Date);
      expect(org.createdAt.toISOString()).toBe('2026-03-15T10:30:00.000Z');
      expect(org.updatedAt.toISOString()).toBe('2026-04-01T14:45:00.000Z');
    });

    it('should correctly map the is_super_admin boolean flag', () => {
      // Test with true
      const superAdminRow = createTestRow({ is_super_admin: true });
      expect(mapRowToOrganization(superAdminRow).isSuperAdmin).toBe(true);

      // Test with false
      const regularRow = createTestRow({ is_super_admin: false });
      expect(mapRowToOrganization(regularRow).isSuperAdmin).toBe(false);
    });
  });
});
