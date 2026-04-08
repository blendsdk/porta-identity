import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Organization } from '../../../src/organizations/types.js';

// Mock all dependencies the service uses
vi.mock('../../../src/organizations/repository.js', () => ({
  insertOrganization: vi.fn(),
  findOrganizationById: vi.fn(),
  findOrganizationBySlug: vi.fn(),
  updateOrganization: vi.fn(),
  listOrganizations: vi.fn(),
  slugExists: vi.fn(),
}));

vi.mock('../../../src/organizations/cache.js', () => ({
  getCachedOrganizationById: vi.fn(),
  getCachedOrganizationBySlug: vi.fn(),
  cacheOrganization: vi.fn(),
  invalidateOrganizationCache: vi.fn(),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
}));

import {
  insertOrganization,
  findOrganizationById,
  findOrganizationBySlug,
  updateOrganization as repoUpdate,
  listOrganizations as repoList,
  slugExists,
} from '../../../src/organizations/repository.js';
import {
  getCachedOrganizationById,
  getCachedOrganizationBySlug,
  cacheOrganization,
  invalidateOrganizationCache,
} from '../../../src/organizations/cache.js';
import { writeAuditLog } from '../../../src/lib/audit-log.js';
import {
  createOrganization,
  getOrganizationById,
  getOrganizationBySlug,
  updateOrganization,
  updateOrganizationBranding,
  suspendOrganization,
  activateOrganization,
  archiveOrganization,
  restoreOrganization,
  listOrganizations,
  validateSlugAvailability,
} from '../../../src/organizations/service.js';
import { OrganizationNotFoundError, OrganizationValidationError } from '../../../src/organizations/errors.js';

/** Standard test organization */
function createTestOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-uuid-1',
    name: 'Acme Corporation',
    slug: 'acme-corporation',
    status: 'active',
    isSuperAdmin: false,
    brandingLogoUrl: null,
    brandingFaviconUrl: null,
    brandingPrimaryColor: null,
    brandingCompanyName: null,
    brandingCustomCss: null,
    defaultLocale: 'en',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('organization service', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // createOrganization
  // -------------------------------------------------------------------------

  describe('createOrganization', () => {
    it('should auto-generate slug from name', async () => {
      const org = createTestOrg();
      (slugExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (insertOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      const result = await createOrganization({ name: 'Acme Corporation' });

      expect(result.slug).toBe('acme-corporation');
      expect(insertOrganization).toHaveBeenCalled();
    });

    it('should use provided custom slug', async () => {
      const org = createTestOrg({ slug: 'custom-slug' });
      (slugExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (insertOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      await createOrganization({ name: 'Acme', slug: 'custom-slug' });

      const insertCall = (insertOrganization as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(insertCall.slug).toBe('custom-slug');
    });

    it('should throw validation error for invalid slug', async () => {
      await expect(
        createOrganization({ name: 'Acme', slug: 'ab' }), // too short
      ).rejects.toThrow(OrganizationValidationError);
    });

    it('should throw validation error when slug is taken', async () => {
      (slugExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await expect(
        createOrganization({ name: 'Acme' }),
      ).rejects.toThrow('Slug already in use');
    });

    it('should cache the created organization', async () => {
      const org = createTestOrg();
      (slugExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (insertOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      await createOrganization({ name: 'Acme Corporation' });

      expect(cacheOrganization).toHaveBeenCalledWith(org);
    });

    it('should write audit log on creation', async () => {
      const org = createTestOrg();
      (slugExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      (insertOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      await createOrganization({ name: 'Acme Corporation' }, 'actor-1');

      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'org.created',
          actorId: 'actor-1',
          organizationId: org.id,
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // getOrganizationById
  // -------------------------------------------------------------------------

  describe('getOrganizationById', () => {
    it('should return cached org on cache hit (no DB query)', async () => {
      const org = createTestOrg();
      (getCachedOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      const result = await getOrganizationById('org-uuid-1');

      expect(result).toEqual(org);
      expect(findOrganizationById).not.toHaveBeenCalled();
    });

    it('should query DB on cache miss and cache the result', async () => {
      const org = createTestOrg();
      (getCachedOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (findOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      const result = await getOrganizationById('org-uuid-1');

      expect(result).toEqual(org);
      expect(cacheOrganization).toHaveBeenCalledWith(org);
    });

    it('should return null when not found', async () => {
      (getCachedOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (findOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await getOrganizationById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getOrganizationBySlug
  // -------------------------------------------------------------------------

  describe('getOrganizationBySlug', () => {
    it('should return cached org on cache hit', async () => {
      const org = createTestOrg();
      (getCachedOrganizationBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      const result = await getOrganizationBySlug('acme-corporation');

      expect(result).toEqual(org);
      expect(findOrganizationBySlug).not.toHaveBeenCalled();
    });

    it('should query DB on cache miss and cache the result', async () => {
      const org = createTestOrg();
      (getCachedOrganizationBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (findOrganizationBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      const result = await getOrganizationBySlug('acme-corporation');

      expect(result).toEqual(org);
      expect(cacheOrganization).toHaveBeenCalledWith(org);
    });
  });

  // -------------------------------------------------------------------------
  // updateOrganization
  // -------------------------------------------------------------------------

  describe('updateOrganization', () => {
    it('should update via repo and invalidate + re-cache', async () => {
      const org = createTestOrg({ name: 'Updated' });
      (repoUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      const result = await updateOrganization('org-uuid-1', { name: 'Updated' });

      expect(result.name).toBe('Updated');
      expect(invalidateOrganizationCache).toHaveBeenCalledWith(org.slug, org.id);
      expect(cacheOrganization).toHaveBeenCalledWith(org);
    });

    it('should throw OrganizationNotFoundError when not found', async () => {
      (repoUpdate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Organization not found'));

      await expect(
        updateOrganization('nonexistent', { name: 'Test' }),
      ).rejects.toThrow(OrganizationNotFoundError);
    });

    it('should write audit log on update', async () => {
      const org = createTestOrg();
      (repoUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      await updateOrganization('org-uuid-1', { name: 'Updated' }, 'actor-1');

      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'org.updated' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // updateOrganizationBranding
  // -------------------------------------------------------------------------

  describe('updateOrganizationBranding', () => {
    it('should update branding and write audit log', async () => {
      const org = createTestOrg({ brandingPrimaryColor: '#FF0000' });
      (repoUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      const result = await updateOrganizationBranding(
        'org-uuid-1',
        { primaryColor: '#FF0000' },
        'actor-1',
      );

      expect(result.brandingPrimaryColor).toBe('#FF0000');
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'org.branding.updated' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // suspendOrganization
  // -------------------------------------------------------------------------

  describe('suspendOrganization', () => {
    it('should suspend an active organization', async () => {
      const org = createTestOrg({ status: 'active' });
      (findOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(org);
      (repoUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({ ...org, status: 'suspended' });

      await suspendOrganization('org-uuid-1', 'Violation', 'actor-1');

      expect(repoUpdate).toHaveBeenCalledWith('org-uuid-1', { status: 'suspended' });
      expect(invalidateOrganizationCache).toHaveBeenCalled();
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'org.suspended' }),
      );
    });

    it('should reject suspension of super-admin org', async () => {
      const org = createTestOrg({ isSuperAdmin: true });
      (findOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      await expect(
        suspendOrganization('org-uuid-1'),
      ).rejects.toThrow('Super-admin organization cannot be suspended');
    });

    it('should reject if already suspended', async () => {
      const org = createTestOrg({ status: 'suspended' });
      (findOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      await expect(
        suspendOrganization('org-uuid-1'),
      ).rejects.toThrow('already suspended');
    });
  });

  // -------------------------------------------------------------------------
  // activateOrganization
  // -------------------------------------------------------------------------

  describe('activateOrganization', () => {
    it('should activate a suspended organization', async () => {
      const org = createTestOrg({ status: 'suspended' });
      (findOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(org);
      (repoUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({ ...org, status: 'active' });

      await activateOrganization('org-uuid-1');

      expect(repoUpdate).toHaveBeenCalledWith('org-uuid-1', { status: 'active' });
    });

    it('should reject if not suspended', async () => {
      const org = createTestOrg({ status: 'active' });
      (findOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      await expect(
        activateOrganization('org-uuid-1'),
      ).rejects.toThrow('Cannot activate');
    });
  });

  // -------------------------------------------------------------------------
  // archiveOrganization
  // -------------------------------------------------------------------------

  describe('archiveOrganization', () => {
    it('should archive an active organization', async () => {
      const org = createTestOrg({ status: 'active' });
      (findOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(org);
      (repoUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({ ...org, status: 'archived' });

      await archiveOrganization('org-uuid-1');

      expect(repoUpdate).toHaveBeenCalledWith('org-uuid-1', { status: 'archived' });
    });

    it('should reject archiving super-admin org', async () => {
      const org = createTestOrg({ isSuperAdmin: true });
      (findOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      await expect(
        archiveOrganization('org-uuid-1'),
      ).rejects.toThrow('Super-admin organization cannot be archived');
    });
  });

  // -------------------------------------------------------------------------
  // restoreOrganization
  // -------------------------------------------------------------------------

  describe('restoreOrganization', () => {
    it('should restore an archived organization', async () => {
      const org = createTestOrg({ status: 'archived' });
      (findOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(org);
      (repoUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({ ...org, status: 'active' });

      await restoreOrganization('org-uuid-1');

      expect(repoUpdate).toHaveBeenCalledWith('org-uuid-1', { status: 'active' });
    });

    it('should reject if not archived', async () => {
      const org = createTestOrg({ status: 'active' });
      (findOrganizationById as ReturnType<typeof vi.fn>).mockResolvedValue(org);

      await expect(
        restoreOrganization('org-uuid-1'),
      ).rejects.toThrow('Cannot restore');
    });
  });

  // -------------------------------------------------------------------------
  // listOrganizations
  // -------------------------------------------------------------------------

  describe('listOrganizations', () => {
    it('should delegate to repository', async () => {
      const mockResult = { data: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
      (repoList as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const result = await listOrganizations({ page: 1, pageSize: 10 });

      expect(repoList).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
      expect(result).toEqual(mockResult);
    });
  });

  // -------------------------------------------------------------------------
  // validateSlugAvailability
  // -------------------------------------------------------------------------

  describe('validateSlugAvailability', () => {
    it('should return valid when slug is valid and available', async () => {
      (slugExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const result = await validateSlugAvailability('acme-corp');

      expect(result).toEqual({ isValid: true });
    });

    it('should return error when slug format is invalid', async () => {
      const result = await validateSlugAvailability('ab'); // too short

      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error when slug is already taken', async () => {
      (slugExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await validateSlugAvailability('taken-slug');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('already in use');
    });
  });
});
