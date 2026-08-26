/**
 * Unit tests for the admin:user:2fa permission added in RD-28.
 *
 * Verifies the new USER_2FA permission is correctly defined, included
 * in the right roles (super-admin, user-admin, legacy), and excluded
 * from roles that should not have it (org-admin, app-admin, auditor).
 *
 * @module tests/unit/lib/admin-permissions-2fa
 */
import { describe, it, expect } from 'vitest';

import {
  ADMIN_PERMISSIONS,
  ALL_ADMIN_PERMISSIONS,
  ADMIN_ROLE_DEFINITIONS,
  getPermissionsForAdminRole,
} from '../../../src/lib/admin-permissions.js';

// ============================================================================
// USER_2FA Permission Constant
// ============================================================================

describe('ADMIN_PERMISSIONS.USER_2FA', () => {
  it('should equal "admin:user:2fa"', () => {
    expect(ADMIN_PERMISSIONS.USER_2FA).toBe('admin:user:2fa');
  });

  it('should follow the module:resource:action format', () => {
    expect(ADMIN_PERMISSIONS.USER_2FA).toMatch(/^[a-z]+:[a-z]+:[a-z0-9_]+$/);
  });

  it('should be in the user resource category', () => {
    const resource = ADMIN_PERMISSIONS.USER_2FA.split(':')[1];
    expect(resource).toBe('user');
  });
});

// ============================================================================
// ALL_ADMIN_PERMISSIONS includes USER_2FA
// ============================================================================

describe('ALL_ADMIN_PERMISSIONS with USER_2FA', () => {
  it('should include admin:user:2fa', () => {
    expect(ALL_ADMIN_PERMISSIONS).toContain('admin:user:2fa');
  });

  it('should have exactly 43 permissions', () => {
    // 42 original + 1 new USER_2FA = 43
    expect(ALL_ADMIN_PERMISSIONS.length).toBe(43);
  });
});

// ============================================================================
// Role Assignments — which roles get USER_2FA
// ============================================================================

describe('USER_2FA role assignments', () => {
  describe('Super Admin role', () => {
    it('should include admin:user:2fa via ALL_ADMIN_PERMISSIONS', () => {
      // Super Admin uses ALL_ADMIN_PERMISSIONS directly, so it automatically
      // gets any new permission added to the ADMIN_PERMISSIONS constant
      const perms = ADMIN_ROLE_DEFINITIONS.SUPER_ADMIN.permissions;
      expect(perms).toContain('admin:user:2fa');
    });
  });

  describe('User Admin role', () => {
    it('should include admin:user:2fa explicitly', () => {
      const perms = ADMIN_ROLE_DEFINITIONS.USER_ADMIN.permissions;
      expect(perms).toContain('admin:user:2fa');
    });

    it('should have USER_2FA positioned after USER_INVITE', () => {
      // Verify ordering: USER_INVITE should come before USER_2FA in the array
      const perms = ADMIN_ROLE_DEFINITIONS.USER_ADMIN.permissions;
      const inviteIdx = perms.indexOf(ADMIN_PERMISSIONS.USER_INVITE);
      const tfaIdx = perms.indexOf(ADMIN_PERMISSIONS.USER_2FA);
      expect(inviteIdx).toBeGreaterThanOrEqual(0);
      expect(tfaIdx).toBeGreaterThanOrEqual(0);
      expect(tfaIdx).toBe(inviteIdx + 1);
    });
  });

  describe('Legacy porta-admin role', () => {
    it('should include admin:user:2fa via getPermissionsForAdminRole', () => {
      // Legacy porta-admin gets ALL permissions for backward compatibility
      const perms = getPermissionsForAdminRole('porta-admin');
      expect(perms).toContain('admin:user:2fa');
    });
  });

  // ============================================================================
  // Role Exclusions — which roles should NOT get USER_2FA
  // ============================================================================

  describe('Org Admin role', () => {
    it('should NOT include admin:user:2fa', () => {
      const perms = ADMIN_ROLE_DEFINITIONS.ORG_ADMIN.permissions;
      expect(perms).not.toContain('admin:user:2fa');
    });
  });

  describe('App Admin role', () => {
    it('should NOT include admin:user:2fa', () => {
      const perms = ADMIN_ROLE_DEFINITIONS.APP_ADMIN.permissions;
      expect(perms).not.toContain('admin:user:2fa');
    });
  });

  describe('Auditor role', () => {
    it('should NOT include admin:user:2fa', () => {
      // Auditor is read-only; 2FA management is a write operation
      const perms = ADMIN_ROLE_DEFINITIONS.AUDITOR.permissions;
      expect(perms).not.toContain('admin:user:2fa');
    });
  });
});

// ============================================================================
// getPermissionsForAdminRole — USER_2FA resolution
// ============================================================================

describe('getPermissionsForAdminRole with USER_2FA', () => {
  it('should include admin:user:2fa for porta-super-admin', () => {
    const perms = getPermissionsForAdminRole('porta-super-admin');
    expect(perms).toContain('admin:user:2fa');
  });

  it('should include admin:user:2fa for porta-user-admin', () => {
    const perms = getPermissionsForAdminRole('porta-user-admin');
    expect(perms).toContain('admin:user:2fa');
  });

  it('should include admin:user:2fa for legacy porta-admin', () => {
    const perms = getPermissionsForAdminRole('porta-admin');
    expect(perms).toContain('admin:user:2fa');
  });

  it('should NOT include admin:user:2fa for porta-org-admin', () => {
    const perms = getPermissionsForAdminRole('porta-org-admin');
    expect(perms).not.toContain('admin:user:2fa');
  });

  it('should NOT include admin:user:2fa for porta-app-admin', () => {
    const perms = getPermissionsForAdminRole('porta-app-admin');
    expect(perms).not.toContain('admin:user:2fa');
  });

  it('should NOT include admin:user:2fa for porta-auditor', () => {
    const perms = getPermissionsForAdminRole('porta-auditor');
    expect(perms).not.toContain('admin:user:2fa');
  });
});
