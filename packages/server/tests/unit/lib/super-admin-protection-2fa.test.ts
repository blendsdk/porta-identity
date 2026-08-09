/**
 * Unit tests for the 'manage-2fa' protected operation added in RD-28.
 *
 * Verifies that 'manage-2fa' is a valid ProtectedOperation and that
 * guardSuperAdmin correctly blocks 2FA management operations on the
 * super-admin user while allowing them on normal users.
 *
 * @module tests/unit/lib/super-admin-protection-2fa
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the system-config module before importing the module under test
vi.mock('../../../src/lib/system-config.js', () => ({
  getSystemConfigString: vi.fn(),
}));

import { getSystemConfigString } from '../../../src/lib/system-config.js';
import {
  PROTECTED_OPERATIONS,
  guardSuperAdmin,
  SuperAdminProtectionError,
} from '../../../src/lib/super-admin-protection.js';

const mockGetConfig = getSystemConfigString as ReturnType<typeof vi.fn>;

describe('manage-2fa protected operation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // PROTECTED_OPERATIONS includes 'manage-2fa'
  // ==========================================================================

  describe('PROTECTED_OPERATIONS', () => {
    it('should include "manage-2fa"', () => {
      expect(PROTECTED_OPERATIONS).toContain('manage-2fa');
    });

    it('should include "manage-2fa" alongside the original 6 operations', () => {
      // Verify all original operations are still present after adding manage-2fa
      expect(PROTECTED_OPERATIONS).toContain('delete');
      expect(PROTECTED_OPERATIONS).toContain('suspend');
      expect(PROTECTED_OPERATIONS).toContain('archive');
      expect(PROTECTED_OPERATIONS).toContain('lock');
      expect(PROTECTED_OPERATIONS).toContain('deactivate');
      expect(PROTECTED_OPERATIONS).toContain('remove-super-admin-role');
      expect(PROTECTED_OPERATIONS).toContain('manage-2fa');
    });
  });

  // ==========================================================================
  // guardSuperAdmin with 'manage-2fa' operation
  // ==========================================================================

  describe('guardSuperAdmin with manage-2fa', () => {
    const superAdminId = '550e8400-e29b-41d4-a716-446655440000';
    const normalUserId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    it('should throw SuperAdminProtectionError for super-admin user', async () => {
      mockGetConfig.mockResolvedValue(superAdminId);

      await expect(guardSuperAdmin(superAdminId, 'manage-2fa')).rejects.toThrow(
        SuperAdminProtectionError,
      );
    });

    it('should throw with status 403 for manage-2fa on super-admin', async () => {
      mockGetConfig.mockResolvedValue(superAdminId);

      try {
        await guardSuperAdmin(superAdminId, 'manage-2fa');
        expect.fail('Should have thrown SuperAdminProtectionError');
      } catch (error) {
        const e = error as SuperAdminProtectionError;
        expect(e.status).toBe(403);
        expect(e.operation).toBe('manage-2fa');
        expect(e.message).toBe('Cannot manage-2fa the super-admin user');
      }
    });

    it('should NOT throw for a normal user', async () => {
      mockGetConfig.mockResolvedValue(superAdminId);

      // Normal user should not be blocked
      await expect(
        guardSuperAdmin(normalUserId, 'manage-2fa'),
      ).resolves.toBeUndefined();
    });

    it('should NOT throw when no super-admin is configured', async () => {
      // Pre-init state: no super-admin user ID in system_config
      mockGetConfig.mockResolvedValue('');

      await expect(
        guardSuperAdmin(normalUserId, 'manage-2fa'),
      ).resolves.toBeUndefined();
    });
  });

  // ==========================================================================
  // SuperAdminProtectionError for manage-2fa
  // ==========================================================================

  describe('SuperAdminProtectionError for manage-2fa', () => {
    it('should create a valid error with manage-2fa operation', () => {
      const error = new SuperAdminProtectionError('manage-2fa');

      expect(error.name).toBe('SuperAdminProtectionError');
      expect(error.status).toBe(403);
      expect(error.operation).toBe('manage-2fa');
      expect(error.message).toBe('Cannot manage-2fa the super-admin user');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
