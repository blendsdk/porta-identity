/**
 * Unit tests for organization destroy functionality.
 *
 * Tests the repository hardDelete + getCascadeCounts, and the service
 * destroyOrganization with super-admin protection, audit logging,
 * and cache invalidation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
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

import { getPool } from '../../../src/lib/database.js';
import {
  hardDeleteOrganization,
  getCascadeCounts,
} from '../../../src/organizations/repository.js';
import {
  destroyOrganization,
  getCascadeCounts as serviceGetCascadeCounts,
} from '../../../src/organizations/service.js';
import { invalidateOrganizationCache } from '../../../src/organizations/cache.js';
import { writeAuditLog } from '../../../src/lib/audit-log.js';
import { OrganizationNotFoundError, OrganizationValidationError } from '../../../src/organizations/errors.js';
import type { OrganizationRow } from '../../../src/organizations/types.js';

// ============================================================================
// Helpers
// ============================================================================

function mockPool(rows: Record<string, unknown>[] = [], rowCount?: number) {
  const mockQuery = vi.fn().mockResolvedValue({
    rows,
    rowCount: rowCount ?? rows.length,
  });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });
  return mockQuery;
}

function createTestRow(overrides: Partial<OrganizationRow> = {}): OrganizationRow {
  return {
    id: 'org-uuid-1',
    name: 'Test Org',
    slug: 'test-org',
    status: 'active',
    is_super_admin: false,
    branding_logo_url: null,
    branding_favicon_url: null,
    branding_primary_color: null,
    branding_company_name: null,
    branding_custom_css: null,
    default_locale: 'en',
    two_factor_policy: 'optional',
    default_login_methods: ['password', 'magic_link'],
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ============================================================================
// Repository: hardDeleteOrganization
// ============================================================================

describe('hardDeleteOrganization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when a non-super-admin org is deleted', async () => {
    const mockQuery = mockPool([{ id: 'org-uuid-1' }], 1);

    const result = await hardDeleteOrganization('org-uuid-1');

    expect(result).toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM organizations'),
      ['org-uuid-1'],
    );
    // Verify the SQL includes the super-admin safety guard
    expect(mockQuery.mock.calls[0][0]).toContain('is_super_admin = FALSE');
  });

  it('returns false when org is not found or is super-admin', async () => {
    mockPool([], 0);

    const result = await hardDeleteOrganization('nonexistent-id');

    expect(result).toBe(false);
  });

  it('includes RETURNING id in the query', async () => {
    const mockQuery = mockPool([{ id: 'org-uuid-1' }], 1);

    await hardDeleteOrganization('org-uuid-1');

    expect(mockQuery.mock.calls[0][0]).toContain('RETURNING id');
  });
});

// ============================================================================
// Repository: getCascadeCounts
// ============================================================================

describe('getCascadeCounts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns counts from a single aggregate query', async () => {
    const countRow = {
      applications: 3,
      clients: 5,
      users: 10,
      roles: 4,
      permissions: 8,
      claim_definitions: 2,
    };
    mockPool([countRow]);

    const result = await getCascadeCounts('org-uuid-1');

    expect(result).toEqual(countRow);
  });

  it('returns zero counts for an empty org', async () => {
    const countRow = {
      applications: 0,
      clients: 0,
      users: 0,
      roles: 0,
      permissions: 0,
      claim_definitions: 0,
    };
    mockPool([countRow]);

    const result = await getCascadeCounts('org-uuid-1');

    expect(result.applications).toBe(0);
    expect(result.users).toBe(0);
  });

  it('passes the org ID as a parameterized query', async () => {
    const mockQuery = mockPool([{
      applications: 0, clients: 0, users: 0, roles: 0, permissions: 0, claim_definitions: 0,
    }]);

    await getCascadeCounts('my-org-id');

    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      ['my-org-id'],
    );
  });
});

// ============================================================================
// Service: destroyOrganization
// ============================================================================

describe('destroyOrganization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws OrganizationNotFoundError if org does not exist', async () => {
    // Mock pool to return empty results for both findById and findBySlug
    const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

    await expect(destroyOrganization('nonexistent')).rejects.toThrow(
      OrganizationNotFoundError,
    );
  });

  it('throws OrganizationValidationError for super-admin org', async () => {
    const superAdminRow = createTestRow({ is_super_admin: true });
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [superAdminRow],
      rowCount: 1,
    });
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

    await expect(destroyOrganization('org-uuid-1')).rejects.toThrow(
      OrganizationValidationError,
    );
    await expect(destroyOrganization('org-uuid-1')).rejects.toThrow(
      /super-admin/i,
    );
  });

  it('writes audit log BEFORE deletion', async () => {
    const testRow = createTestRow();
    const countRow = {
      applications: 1, clients: 2, users: 3, roles: 1, permissions: 2, claim_definitions: 0,
    };
    let auditCalled = false;
    let deleteCalled = false;

    const mockQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('DELETE FROM organizations')) {
        deleteCalled = true;
        // Audit should have been called before delete
        expect(auditCalled).toBe(true);
        return { rows: [{ id: 'org-uuid-1' }], rowCount: 1 };
      }
      if (sql.includes('SELECT') && sql.includes('COUNT(*)')) {
        return { rows: [countRow], rowCount: 1 };
      }
      // findById
      return { rows: [testRow], rowCount: 1 };
    });
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });
    (writeAuditLog as ReturnType<typeof vi.fn>).mockImplementation(() => {
      auditCalled = true;
      return Promise.resolve();
    });

    await destroyOrganization('org-uuid-1', 'actor-1');

    expect(auditCalled).toBe(true);
    expect(deleteCalled).toBe(true);
  });

  it('returns organization and cascade counts on success', async () => {
    const testRow = createTestRow();
    const countRow = {
      applications: 2, clients: 5, users: 10, roles: 3, permissions: 6, claim_definitions: 1,
    };

    const mockQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('DELETE FROM organizations')) {
        return { rows: [{ id: 'org-uuid-1' }], rowCount: 1 };
      }
      if (sql.includes('SELECT') && sql.includes('COUNT(*)')) {
        return { rows: [countRow], rowCount: 1 };
      }
      return { rows: [testRow], rowCount: 1 };
    });
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

    const result = await destroyOrganization('org-uuid-1');

    expect(result.organization.id).toBe('org-uuid-1');
    expect(result.organization.name).toBe('Test Org');
    expect(result.cascadeCounts).toEqual(countRow);
  });

  it('invalidates cache after successful deletion', async () => {
    const testRow = createTestRow();
    const countRow = {
      applications: 0, clients: 0, users: 0, roles: 0, permissions: 0, claim_definitions: 0,
    };

    const mockQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('DELETE FROM organizations')) {
        return { rows: [{ id: 'org-uuid-1' }], rowCount: 1 };
      }
      if (sql.includes('SELECT') && sql.includes('COUNT(*)')) {
        return { rows: [countRow], rowCount: 1 };
      }
      return { rows: [testRow], rowCount: 1 };
    });
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

    await destroyOrganization('org-uuid-1');

    expect(invalidateOrganizationCache).toHaveBeenCalledWith('test-org', 'org-uuid-1');
  });

  it('resolves org by slug when UUID lookup fails', async () => {
    const testRow = createTestRow();
    const countRow = {
      applications: 0, clients: 0, users: 0, roles: 0, permissions: 0, claim_definitions: 0,
    };
    let queryCount = 0;

    const mockQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('DELETE FROM organizations')) {
        return { rows: [{ id: 'org-uuid-1' }], rowCount: 1 };
      }
      if (sql.includes('SELECT') && sql.includes('COUNT(*)')) {
        return { rows: [countRow], rowCount: 1 };
      }
      // First findById returns empty, second findBySlug returns the org
      queryCount++;
      if (queryCount === 1) {
        return { rows: [], rowCount: 0 }; // findById miss
      }
      return { rows: [testRow], rowCount: 1 }; // findBySlug hit
    });
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

    const result = await destroyOrganization('test-org');
    expect(result.organization.slug).toBe('test-org');
  });

  it('includes actor ID in audit log', async () => {
    const testRow = createTestRow();
    const countRow = {
      applications: 0, clients: 0, users: 0, roles: 0, permissions: 0, claim_definitions: 0,
    };

    const mockQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('DELETE FROM organizations')) {
        return { rows: [{ id: 'org-uuid-1' }], rowCount: 1 };
      }
      if (sql.includes('SELECT') && sql.includes('COUNT(*)')) {
        return { rows: [countRow], rowCount: 1 };
      }
      return { rows: [testRow], rowCount: 1 };
    });
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });

    await destroyOrganization('org-uuid-1', 'admin-actor-uuid');

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-actor-uuid',
        eventType: 'org.destroyed',
      }),
    );
  });
});

// ============================================================================
// Service: getCascadeCounts (service wrapper)
// ============================================================================

describe('service getCascadeCounts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates to repository getCascadeCounts', async () => {
    const countRow = {
      applications: 5, clients: 10, users: 20, roles: 8, permissions: 16, claim_definitions: 3,
    };
    mockPool([countRow]);

    const result = await serviceGetCascadeCounts('org-uuid-1');

    expect(result).toEqual(countRow);
  });
});
