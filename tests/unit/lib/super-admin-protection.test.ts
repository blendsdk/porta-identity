import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the system-config module before importing the module under test
vi.mock('../../../src/lib/system-config.js', () => ({
  getSystemConfigString: vi.fn(),
}));

import { getSystemConfigString } from '../../../src/lib/system-config.js';
import {
  SUPER_ADMIN_USER_ID_KEY,
  PROTECTED_OPERATIONS,
  isSuperAdminUser,
  guardSuperAdmin,
  SuperAdminProtectionError,
} from '../../../src/lib/super-admin-protection.js';
import type { ProtectedOperation } from '../../../src/lib/super-admin-protection.js';

const mockGetConfig = getSystemConfigString as ReturnType<typeof vi.fn>;

describe('super-admin-protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Constants
  // ==========================================================================

  describe('SUPER_ADMIN_USER_ID_KEY', () => {
    it('should be the expected system_config key', () => {
      expect(SUPER_ADMIN_USER_ID_KEY).toBe('super_admin_user_id');
    });
  });

  describe('PROTECTED_OPERATIONS', () => {
    it('should include all expected protected operations', () => {
      expect(PROTECTED_OPERATIONS).toContain('delete');
      expect(PROTECTED_OPERATIONS).toContain('suspend');
      expect(PROTECTED_OPERATIONS).toContain('archive');
      expect(PROTECTED_OPERATIONS).toContain('lock');
      expect(PROTECTED_OPERATIONS).toContain('deactivate');
      expect(PROTECTED_OPERATIONS).toContain('remove-super-admin-role');
    });

    it('should have exactly 6 operations', () => {
      expect(PROTECTED_OPERATIONS.length).toBe(6);
    });
  });

  // ==========================================================================
  // isSuperAdminUser
  // ==========================================================================

  describe('isSuperAdminUser', () => {
    it('should return true when userId matches the stored super-admin ID', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      mockGetConfig.mockResolvedValue(userId);

      const result = await isSuperAdminUser(userId);

      expect(result).toBe(true);
      expect(mockGetConfig).toHaveBeenCalledWith(SUPER_ADMIN_USER_ID_KEY, '');
    });

    it('should return false when userId does not match', async () => {
      mockGetConfig.mockResolvedValue('550e8400-e29b-41d4-a716-446655440000');

      const result = await isSuperAdminUser('different-user-id');

      expect(result).toBe(false);
    });

    it('should return false when no super-admin is configured (empty string)', async () => {
      mockGetConfig.mockResolvedValue('');

      const result = await isSuperAdminUser('any-user-id');

      expect(result).toBe(false);
    });

    it('should pass the correct config key and fallback', async () => {
      mockGetConfig.mockResolvedValue('');

      await isSuperAdminUser('test-id');

      expect(mockGetConfig).toHaveBeenCalledWith('super_admin_user_id', '');
    });

    it('should handle concurrent calls correctly', async () => {
      const superAdminId = 'admin-uuid';
      mockGetConfig.mockResolvedValue(superAdminId);

      const results = await Promise.all([
        isSuperAdminUser(superAdminId),
        isSuperAdminUser('other-user'),
        isSuperAdminUser(superAdminId),
      ]);

      expect(results).toEqual([true, false, true]);
    });
  });

  // ==========================================================================
  // SuperAdminProtectionError
  // ==========================================================================

  describe('SuperAdminProtectionError', () => {
    it('should have status 403', () => {
      const error = new SuperAdminProtectionError('delete');
      expect(error.status).toBe(403);
    });

    it('should have name SuperAdminProtectionError', () => {
      const error = new SuperAdminProtectionError('suspend');
      expect(error.name).toBe('SuperAdminProtectionError');
    });

    it('should store the operation', () => {
      const error = new SuperAdminProtectionError('archive');
      expect(error.operation).toBe('archive');
    });

    it('should have a descriptive message for each operation', () => {
      for (const op of PROTECTED_OPERATIONS) {
        const error = new SuperAdminProtectionError(op);
        expect(error.message).toBe(`Cannot ${op} the super-admin user`);
      }
    });

    it('should be an instance of Error', () => {
      const error = new SuperAdminProtectionError('delete');
      expect(error).toBeInstanceOf(Error);
    });
  });

  // ==========================================================================
  // guardSuperAdmin
  // ==========================================================================

  describe('guardSuperAdmin', () => {
    const superAdminId = '550e8400-e29b-41d4-a716-446655440000';

    it('should throw SuperAdminProtectionError when user is the super-admin', async () => {
      mockGetConfig.mockResolvedValue(superAdminId);

      await expect(guardSuperAdmin(superAdminId, 'delete')).rejects.toThrow(
        SuperAdminProtectionError,
      );
    });

    it('should not throw when user is not the super-admin', async () => {
      mockGetConfig.mockResolvedValue(superAdminId);

      // Should resolve without error for a different user
      await expect(guardSuperAdmin('other-user-id', 'delete')).resolves.toBeUndefined();
    });

    it('should not throw when no super-admin is configured', async () => {
      mockGetConfig.mockResolvedValue('');

      await expect(guardSuperAdmin('any-user-id', 'suspend')).resolves.toBeUndefined();
    });

    it('should throw with correct operation for each protected operation', async () => {
      mockGetConfig.mockResolvedValue(superAdminId);

      for (const operation of PROTECTED_OPERATIONS) {
        try {
          await guardSuperAdmin(superAdminId, operation);
          // Should not reach here
          expect.fail(`guardSuperAdmin should have thrown for operation: ${operation}`);
        } catch (error) {
          expect(error).toBeInstanceOf(SuperAdminProtectionError);
          expect((error as SuperAdminProtectionError).operation).toBe(operation);
          expect((error as SuperAdminProtectionError).status).toBe(403);
        }
      }
    });

    it('should throw with 403 status for suspend operation', async () => {
      mockGetConfig.mockResolvedValue(superAdminId);

      try {
        await guardSuperAdmin(superAdminId, 'suspend');
        expect.fail('Should have thrown');
      } catch (error) {
        const e = error as SuperAdminProtectionError;
        expect(e.status).toBe(403);
        expect(e.message).toBe('Cannot suspend the super-admin user');
      }
    });

    it('should throw with 403 status for archive operation', async () => {
      mockGetConfig.mockResolvedValue(superAdminId);

      try {
        await guardSuperAdmin(superAdminId, 'archive');
        expect.fail('Should have thrown');
      } catch (error) {
        const e = error as SuperAdminProtectionError;
        expect(e.status).toBe(403);
        expect(e.message).toBe('Cannot archive the super-admin user');
      }
    });

    it('should throw with 403 status for remove-super-admin-role operation', async () => {
      mockGetConfig.mockResolvedValue(superAdminId);

      try {
        await guardSuperAdmin(superAdminId, 'remove-super-admin-role');
        expect.fail('Should have thrown');
      } catch (error) {
        const e = error as SuperAdminProtectionError;
        expect(e.status).toBe(403);
        expect(e.message).toBe('Cannot remove-super-admin-role the super-admin user');
      }
    });
  });
});
