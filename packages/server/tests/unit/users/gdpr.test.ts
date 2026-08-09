/**
 * Unit tests for GDPR export/purge service (Phase I).
 *
 * Tests exportUserData and purgeUserData functions with mocked
 * database pool and audit log writer.
 *
 * Test IDs map to requirements in plans/production-hardening/12-gdpr-export-purge.md:
 *   I1  — Export includes all user data tables
 *   I2  — Export excludes 2FA secrets/recovery codes
 *   I3  — Purge anonymizes user record
 *   I4  — Purge deletes 2FA, claims, roles
 *   I5  — Purge anonymizes audit entries
 *   I6  — Purge revokes active sessions
 *   I7  — Purge requires confirmation (caller responsibility — tested at API/CLI level)
 *   I8  — Purge blocks super-admin
 *   I9  — Purge fires audit event
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockConnect = vi.fn();
const mockRelease = vi.fn();

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(() => ({
    query: mockQuery,
    connect: mockConnect,
  })),
}));

vi.mock('../../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
}));

import { exportUserData, purgeUserData } from '../../../src/users/gdpr.js';
import { writeAuditLog } from '../../../src/lib/audit-log.js';
import type { User } from '../../../src/users/types.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Create a test user with sensible defaults */
function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-123',
    organizationId: 'org-456',
    email: 'john@example.com',
    emailVerified: true,
    hasPassword: true,
    passwordChangedAt: null,
    givenName: 'John',
    familyName: 'Doe',
    middleName: null,
    nickname: null,
    preferredUsername: null,
    profileUrl: null,
    pictureUrl: null,
    websiteUrl: null,
    gender: null,
    birthdate: null,
    zoneinfo: null,
    locale: 'en',
    phoneNumber: '+1234567890',
    phoneNumberVerified: false,
    addressStreet: null,
    addressLocality: null,
    addressRegion: null,
    addressPostalCode: null,
    addressCountry: null,
    status: 'active' as const,
    loginCount: 5,
    lastLoginAt: new Date('2026-04-20T10:00:00Z'),
    failedLoginCount: 0,
    lastFailedLoginAt: null,
    twoFactorEnabled: false,
    twoFactorMethod: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-04-20T10:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GDPR Export/Purge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup mock client for transactions
    mockConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockRelease,
    });
  });

  // =========================================================================
  // Export tests
  // =========================================================================

  describe('exportUserData', () => {
    it('should include all user data tables in export (I1)', async () => {
      // Mock parallel queries: org, roles, claims, audit, oidc count
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'org-456', name: 'Acme', slug: 'acme' }] })
        .mockResolvedValueOnce({
          rows: [{ role_id: 'role-1', name: 'Admin', slug: 'admin', application_id: 'app-1', created_at: '2026-01-15' }],
        })
        .mockResolvedValueOnce({
          rows: [{ claim_name: 'department', value: 'Engineering', application_id: 'app-1' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'audit-1', event_type: 'user.login', event_category: 'auth', description: 'Login', created_at: '2026-04-20' }],
        })
        .mockResolvedValueOnce({ rows: [{ count: '2' }] });

      const result = await exportUserData(createTestUser());

      // Verify all sections are present
      expect(result.exportedAt).toBeDefined();
      expect(result.user.id).toBe('user-123');
      expect(result.user.email).toBe('john@example.com');
      expect(result.user.givenName).toBe('John');
      expect(result.user.familyName).toBe('Doe');
      expect(result.organization.name).toBe('Acme');
      expect(result.roles).toHaveLength(1);
      expect(result.roles[0].roleName).toBe('Admin');
      expect(result.customClaims).toHaveLength(1);
      expect(result.customClaims[0].claimName).toBe('department');
      expect(result.auditLog).toHaveLength(1);
      expect(result.auditLog[0].eventType).toBe('user.login');
      expect(result.twoFactor.enabled).toBe(false);
      expect(result.oidcSessions).toBe(2);
    });

    it('should exclude 2FA secrets and recovery codes from export (I2)', async () => {
      // Mock all queries with empty results
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'org-456', name: 'Acme', slug: 'acme' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const user = createTestUser({ twoFactorEnabled: true, twoFactorMethod: 'totp' });
      const result = await exportUserData(user);

      // Should have 2FA status but NOT secrets
      expect(result.twoFactor.enabled).toBe(true);
      expect(result.twoFactor.method).toBe('totp');
      // Verify the export object doesn't contain any secret-like fields
      const exportJson = JSON.stringify(result);
      expect(exportJson).not.toContain('encrypted_secret');
      expect(exportJson).not.toContain('recovery_code');
      expect(exportJson).not.toContain('totp_secret');
    });

    it('should handle user with no related data', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'org-456', name: 'Acme', slug: 'acme' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await exportUserData(createTestUser());

      expect(result.roles).toHaveLength(0);
      expect(result.customClaims).toHaveLength(0);
      expect(result.auditLog).toHaveLength(0);
      expect(result.oidcSessions).toBe(0);
    });

    it('should include user dates as ISO strings', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'org-456', name: 'Acme', slug: 'acme' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await exportUserData(createTestUser());

      expect(result.user.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(result.user.lastLoginAt).toBe('2026-04-20T10:00:00.000Z');
    });
  });

  // =========================================================================
  // Purge tests
  // =========================================================================

  describe('purgeUserData', () => {
    /** Setup mock queries for a successful purge */
    function setupPurgeMocks(isSuperAdmin = false) {
      // org check
      mockQuery.mockResolvedValueOnce({
        rows: [{ is_super_admin: isSuperAdmin }],
      });
      // Transaction queries in order: BEGIN, oidc delete, totp, otp, recovery, claims, roles, audit update, user update, COMMIT
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 3 }) // oidc delete
        .mockResolvedValueOnce({ rowCount: 1 }) // totp
        .mockResolvedValueOnce({ rowCount: 2 }) // otp codes
        .mockResolvedValueOnce({ rowCount: 5 }) // recovery codes
        .mockResolvedValueOnce({ rowCount: 2 }) // claims
        .mockResolvedValueOnce({ rowCount: 3 }) // roles
        .mockResolvedValueOnce({ rowCount: 10 }) // audit update
        .mockResolvedValueOnce({}) // user update
        .mockResolvedValueOnce({}); // COMMIT
    }

    it('should anonymize user record (I3)', async () => {
      setupPurgeMocks();
      const user = createTestUser();
      const result = await purgeUserData(user, 'admin-1');

      expect(result.anonymizedEmail).toBe('purged-user-123@purged.local');
      // Verify the UPDATE query sets the anonymized email
      const updateCall = mockClientQuery.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('UPDATE users SET'),
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![1]).toContain('purged-user-123@purged.local');
    });

    it('should delete 2FA, claims, and roles (I4)', async () => {
      setupPurgeMocks();
      const result = await purgeUserData(createTestUser(), 'admin-1');

      expect(result.deletedRoles).toBe(3);
      expect(result.deletedClaims).toBe(2);
      expect(result.deletedTwoFactor).toBe(5); // recovery codes count

      // Verify delete queries were called for each table
      const deleteQueries = mockClientQuery.mock.calls
        .filter((c) => typeof c[0] === 'string' && c[0].includes('DELETE FROM'))
        .map((c) => c[0] as string);

      expect(deleteQueries.some((q) => q.includes('user_totp'))).toBe(true);
      expect(deleteQueries.some((q) => q.includes('two_factor_otp_codes'))).toBe(true);
      expect(deleteQueries.some((q) => q.includes('two_factor_recovery_codes'))).toBe(true);
      expect(deleteQueries.some((q) => q.includes('user_claim_values'))).toBe(true);
      expect(deleteQueries.some((q) => q.includes('user_roles'))).toBe(true);
    });

    it('should anonymize audit entries (I5)', async () => {
      setupPurgeMocks();
      const result = await purgeUserData(createTestUser(), 'admin-1');

      expect(result.anonymizedAuditEntries).toBe(10);

      // Verify the audit UPDATE query adds purged flag
      const auditUpdate = mockClientQuery.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('UPDATE audit_log'),
      );
      expect(auditUpdate).toBeDefined();
      expect(auditUpdate![0]).toContain('"purged": true');
    });

    it('should revoke active OIDC sessions (I6)', async () => {
      setupPurgeMocks();
      const result = await purgeUserData(createTestUser(), 'admin-1');

      expect(result.deletedOidcPayloads).toBe(3);

      // Verify OIDC payloads delete query
      const oidcDelete = mockClientQuery.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('DELETE FROM oidc_payloads'),
      );
      expect(oidcDelete).toBeDefined();
    });

    it('should block purge of super-admin org users (I8)', async () => {
      // org check returns super-admin
      mockQuery.mockResolvedValueOnce({
        rows: [{ is_super_admin: true }],
      });

      await expect(
        purgeUserData(createTestUser(), 'admin-1'),
      ).rejects.toThrow('Cannot purge users belonging to the super-admin organization');

      // Should not have started a transaction
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('should fire audit event before anonymization (I9)', async () => {
      setupPurgeMocks();
      await purgeUserData(createTestUser(), 'admin-1');

      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'user.purged',
          eventCategory: 'gdpr',
          userId: 'user-123',
          actorId: 'admin-1',
        }),
      );

      // Audit event should be called before transaction starts
      const auditCallOrder = vi.mocked(writeAuditLog).mock.invocationCallOrder[0];
      const connectCallOrder = mockConnect.mock.invocationCallOrder[0];
      expect(auditCallOrder).toBeLessThan(connectCallOrder);
    });

    it('should rollback transaction on error', async () => {
      // org check OK
      mockQuery.mockResolvedValueOnce({
        rows: [{ is_super_admin: false }],
      });
      // Transaction fails mid-way
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('DB connection lost')); // oidc delete fails

      await expect(
        purgeUserData(createTestUser(), 'admin-1'),
      ).rejects.toThrow('DB connection lost');

      // Verify ROLLBACK was called
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should always release the client connection', async () => {
      setupPurgeMocks();
      await purgeUserData(createTestUser(), 'admin-1');

      expect(mockRelease).toHaveBeenCalledTimes(1);
    });
  });
});
