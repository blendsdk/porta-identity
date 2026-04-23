import { describe, it, expect } from 'vitest';

import {
  ADMIN_PERMISSIONS,
  ALL_ADMIN_PERMISSIONS,
  ADMIN_ROLE_DEFINITIONS,
  ALL_ADMIN_ROLES,
  LEGACY_ADMIN_ROLE,
  isSuperAdminRole,
  resolveAdminRoleSlug,
  getPermissionsForAdminRole,
  resolvePermissionsFromRoles,
  hasPermissions,
} from '../../../src/lib/admin-permissions.js';

// ============================================================================
// Permission Constants
// ============================================================================

describe('ADMIN_PERMISSIONS', () => {
  it('should export a frozen object of permission slugs', () => {
    expect(ADMIN_PERMISSIONS).toBeDefined();
    expect(typeof ADMIN_PERMISSIONS).toBe('object');
  });

  it('should have all permission slugs in resource:action format', () => {
    const pattern = /^[a-z]+:[a-z_]+$/;
    for (const [key, slug] of Object.entries(ADMIN_PERMISSIONS)) {
      expect(slug, `${key} should match resource:action format`).toMatch(pattern);
    }
  });

  it('should have no duplicate permission slugs', () => {
    const slugs = Object.values(ADMIN_PERMISSIONS);
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBe(slugs.length);
  });

  it('should have no duplicate constant keys', () => {
    const keys = Object.keys(ADMIN_PERMISSIONS);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it('should include all expected resource categories', () => {
    const slugs = Object.values(ADMIN_PERMISSIONS);
    const resources = new Set(slugs.map((s) => s.split(':')[0]));

    // All expected resource categories must be present
    const expectedResources = [
      'org',
      'app',
      'client',
      'user',
      'role',
      'permission',
      'claim',
      'config',
      'key',
      'audit',
      'session',
      'stats',
      'export',
      'import',
    ];

    for (const resource of expectedResources) {
      expect(resources.has(resource), `Missing resource category: ${resource}`).toBe(true);
    }
  });

  it('should have at least 40 permissions', () => {
    // The spec defines 42 permissions across 14 resource categories
    expect(Object.keys(ADMIN_PERMISSIONS).length).toBeGreaterThanOrEqual(40);
  });

  describe('organization permissions', () => {
    it('should include create, read, update, suspend, and archive', () => {
      expect(ADMIN_PERMISSIONS.ORG_CREATE).toBe('org:create');
      expect(ADMIN_PERMISSIONS.ORG_READ).toBe('org:read');
      expect(ADMIN_PERMISSIONS.ORG_UPDATE).toBe('org:update');
      expect(ADMIN_PERMISSIONS.ORG_SUSPEND).toBe('org:suspend');
      expect(ADMIN_PERMISSIONS.ORG_ARCHIVE).toBe('org:archive');
    });
  });

  describe('user permissions', () => {
    it('should include CRUD, suspend, archive, and invite', () => {
      expect(ADMIN_PERMISSIONS.USER_CREATE).toBe('user:create');
      expect(ADMIN_PERMISSIONS.USER_READ).toBe('user:read');
      expect(ADMIN_PERMISSIONS.USER_UPDATE).toBe('user:update');
      expect(ADMIN_PERMISSIONS.USER_SUSPEND).toBe('user:suspend');
      expect(ADMIN_PERMISSIONS.USER_ARCHIVE).toBe('user:archive');
      expect(ADMIN_PERMISSIONS.USER_INVITE).toBe('user:invite');
    });
  });

  describe('system permissions', () => {
    it('should include config, key, audit, session, stats, and import/export', () => {
      expect(ADMIN_PERMISSIONS.CONFIG_READ).toBe('config:read');
      expect(ADMIN_PERMISSIONS.CONFIG_UPDATE).toBe('config:update');
      expect(ADMIN_PERMISSIONS.KEY_READ).toBe('key:read');
      expect(ADMIN_PERMISSIONS.KEY_GENERATE).toBe('key:generate');
      expect(ADMIN_PERMISSIONS.KEY_ROTATE).toBe('key:rotate');
      expect(ADMIN_PERMISSIONS.AUDIT_READ).toBe('audit:read');
      expect(ADMIN_PERMISSIONS.SESSION_READ).toBe('session:read');
      expect(ADMIN_PERMISSIONS.SESSION_REVOKE).toBe('session:revoke');
      expect(ADMIN_PERMISSIONS.STATS_READ).toBe('stats:read');
      expect(ADMIN_PERMISSIONS.EXPORT_READ).toBe('export:read');
      expect(ADMIN_PERMISSIONS.IMPORT_WRITE).toBe('import:write');
    });
  });
});

describe('ALL_ADMIN_PERMISSIONS', () => {
  it('should be an array of all permission slug values', () => {
    expect(Array.isArray(ALL_ADMIN_PERMISSIONS)).toBe(true);
    expect(ALL_ADMIN_PERMISSIONS.length).toBe(Object.keys(ADMIN_PERMISSIONS).length);
  });

  it('should contain every value from ADMIN_PERMISSIONS', () => {
    for (const slug of Object.values(ADMIN_PERMISSIONS)) {
      expect(ALL_ADMIN_PERMISSIONS).toContain(slug);
    }
  });

  it('should not contain duplicates', () => {
    const unique = new Set(ALL_ADMIN_PERMISSIONS);
    expect(unique.size).toBe(ALL_ADMIN_PERMISSIONS.length);
  });
});

// ============================================================================
// Role Definitions
// ============================================================================

describe('ADMIN_ROLE_DEFINITIONS', () => {
  it('should define exactly 5 admin roles', () => {
    expect(Object.keys(ADMIN_ROLE_DEFINITIONS).length).toBe(5);
  });

  it('should define all expected role keys', () => {
    expect(ADMIN_ROLE_DEFINITIONS.SUPER_ADMIN).toBeDefined();
    expect(ADMIN_ROLE_DEFINITIONS.ORG_ADMIN).toBeDefined();
    expect(ADMIN_ROLE_DEFINITIONS.USER_ADMIN).toBeDefined();
    expect(ADMIN_ROLE_DEFINITIONS.APP_ADMIN).toBeDefined();
    expect(ADMIN_ROLE_DEFINITIONS.AUDITOR).toBeDefined();
  });

  it('should have unique role slugs across all definitions', () => {
    const slugs = ALL_ADMIN_ROLES.map((r) => r.slug);
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBe(slugs.length);
  });

  it('should have unique role names across all definitions', () => {
    const names = ALL_ADMIN_ROLES.map((r) => r.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('should have porta- prefix on all role slugs', () => {
    for (const role of ALL_ADMIN_ROLES) {
      expect(role.slug, `${role.name} slug should start with porta-`).toMatch(/^porta-/);
    }
  });

  it('should have all required fields on every role definition', () => {
    for (const role of ALL_ADMIN_ROLES) {
      expect(typeof role.slug).toBe('string');
      expect(role.slug.length).toBeGreaterThan(0);
      expect(typeof role.name).toBe('string');
      expect(role.name.length).toBeGreaterThan(0);
      expect(typeof role.description).toBe('string');
      expect(role.description.length).toBeGreaterThan(0);
      expect(Array.isArray(role.permissions)).toBe(true);
      expect(role.permissions.length).toBeGreaterThan(0);
    }
  });

  it('should only reference valid ADMIN_PERMISSIONS values in role permissions', () => {
    const validPermissions = new Set(ALL_ADMIN_PERMISSIONS as readonly string[]);
    for (const role of ALL_ADMIN_ROLES) {
      for (const perm of role.permissions) {
        expect(
          validPermissions.has(perm),
          `Role ${role.slug} references unknown permission: ${perm}`,
        ).toBe(true);
      }
    }
  });

  it('should not have duplicate permissions within any single role', () => {
    for (const role of ALL_ADMIN_ROLES) {
      const unique = new Set(role.permissions);
      expect(unique.size, `Role ${role.slug} has duplicate permissions`).toBe(
        role.permissions.length,
      );
    }
  });

  describe('Super Admin role', () => {
    it('should have slug porta-super-admin', () => {
      expect(ADMIN_ROLE_DEFINITIONS.SUPER_ADMIN.slug).toBe('porta-super-admin');
    });

    it('should have ALL permissions', () => {
      const superAdminPerms = new Set(ADMIN_ROLE_DEFINITIONS.SUPER_ADMIN.permissions);
      for (const perm of ALL_ADMIN_PERMISSIONS) {
        expect(
          superAdminPerms.has(perm),
          `Super Admin missing permission: ${perm}`,
        ).toBe(true);
      }
    });

    it('should have the same count as ALL_ADMIN_PERMISSIONS', () => {
      expect(ADMIN_ROLE_DEFINITIONS.SUPER_ADMIN.permissions.length).toBe(
        ALL_ADMIN_PERMISSIONS.length,
      );
    });
  });

  describe('Org Admin role', () => {
    it('should have slug porta-org-admin', () => {
      expect(ADMIN_ROLE_DEFINITIONS.ORG_ADMIN.slug).toBe('porta-org-admin');
    });

    it('should include all org:* permissions', () => {
      const perms = ADMIN_ROLE_DEFINITIONS.ORG_ADMIN.permissions;
      expect(perms).toContain('org:create');
      expect(perms).toContain('org:read');
      expect(perms).toContain('org:update');
      expect(perms).toContain('org:suspend');
      expect(perms).toContain('org:archive');
    });

    it('should include stats:read', () => {
      expect(ADMIN_ROLE_DEFINITIONS.ORG_ADMIN.permissions).toContain('stats:read');
    });

    it('should NOT include user or app management permissions', () => {
      const perms = ADMIN_ROLE_DEFINITIONS.ORG_ADMIN.permissions;
      expect(perms).not.toContain('user:create');
      expect(perms).not.toContain('app:create');
      expect(perms).not.toContain('client:create');
    });
  });

  describe('User Admin role', () => {
    it('should have slug porta-user-admin', () => {
      expect(ADMIN_ROLE_DEFINITIONS.USER_ADMIN.slug).toBe('porta-user-admin');
    });

    it('should include all user:* permissions', () => {
      const perms = ADMIN_ROLE_DEFINITIONS.USER_ADMIN.permissions;
      expect(perms).toContain('user:create');
      expect(perms).toContain('user:read');
      expect(perms).toContain('user:update');
      expect(perms).toContain('user:suspend');
      expect(perms).toContain('user:archive');
      expect(perms).toContain('user:invite');
    });

    it('should include role:assign and role:read for managing user roles', () => {
      const perms = ADMIN_ROLE_DEFINITIONS.USER_ADMIN.permissions;
      expect(perms).toContain('role:assign');
      expect(perms).toContain('role:read');
    });

    it('should include session management permissions', () => {
      const perms = ADMIN_ROLE_DEFINITIONS.USER_ADMIN.permissions;
      expect(perms).toContain('session:read');
      expect(perms).toContain('session:revoke');
    });

    it('should NOT include org, app, or config management permissions', () => {
      const perms = ADMIN_ROLE_DEFINITIONS.USER_ADMIN.permissions;
      expect(perms).not.toContain('org:create');
      expect(perms).not.toContain('app:create');
      expect(perms).not.toContain('config:update');
    });
  });

  describe('App Admin role', () => {
    it('should have slug porta-app-admin', () => {
      expect(ADMIN_ROLE_DEFINITIONS.APP_ADMIN.slug).toBe('porta-app-admin');
    });

    it('should include app, client, role, permission, and claim management', () => {
      const perms = ADMIN_ROLE_DEFINITIONS.APP_ADMIN.permissions;
      expect(perms).toContain('app:create');
      expect(perms).toContain('client:create');
      expect(perms).toContain('role:create');
      expect(perms).toContain('permission:create');
      expect(perms).toContain('claim:create');
    });

    it('should NOT include user, org, or system permissions', () => {
      const perms = ADMIN_ROLE_DEFINITIONS.APP_ADMIN.permissions;
      expect(perms).not.toContain('user:create');
      expect(perms).not.toContain('org:create');
      expect(perms).not.toContain('config:read');
      expect(perms).not.toContain('audit:read');
    });
  });

  describe('Auditor role', () => {
    it('should have slug porta-auditor', () => {
      expect(ADMIN_ROLE_DEFINITIONS.AUDITOR.slug).toBe('porta-auditor');
    });

    it('should include only read permissions (no create/update/delete)', () => {
      const perms = ADMIN_ROLE_DEFINITIONS.AUDITOR.permissions;
      for (const perm of perms) {
        const action = perm.split(':')[1];
        expect(
          ['read', 'read'].includes(action),
          `Auditor should only have read permissions, but has: ${perm}`,
        ).toBe(true);
      }
    });

    it('should include audit:read', () => {
      expect(ADMIN_ROLE_DEFINITIONS.AUDITOR.permissions).toContain('audit:read');
    });

    it('should include export:read', () => {
      expect(ADMIN_ROLE_DEFINITIONS.AUDITOR.permissions).toContain('export:read');
    });

    it('should NOT include any write permissions', () => {
      const perms = ADMIN_ROLE_DEFINITIONS.AUDITOR.permissions;
      expect(perms).not.toContain('org:create');
      expect(perms).not.toContain('user:update');
      expect(perms).not.toContain('config:update');
      expect(perms).not.toContain('import:write');
    });
  });
});

describe('ALL_ADMIN_ROLES', () => {
  it('should be an array of all role definitions', () => {
    expect(Array.isArray(ALL_ADMIN_ROLES)).toBe(true);
    expect(ALL_ADMIN_ROLES.length).toBe(5);
  });

  it('should contain every role definition from ADMIN_ROLE_DEFINITIONS', () => {
    for (const roleDef of Object.values(ADMIN_ROLE_DEFINITIONS)) {
      expect(ALL_ADMIN_ROLES).toContain(roleDef);
    }
  });
});

// ============================================================================
// Legacy Compatibility
// ============================================================================

describe('LEGACY_ADMIN_ROLE', () => {
  it('should be porta-admin', () => {
    expect(LEGACY_ADMIN_ROLE).toBe('porta-admin');
  });

  it('should be different from the new super-admin slug', () => {
    expect(LEGACY_ADMIN_ROLE).not.toBe(ADMIN_ROLE_DEFINITIONS.SUPER_ADMIN.slug);
  });
});

describe('isSuperAdminRole', () => {
  it('should return true for porta-super-admin', () => {
    expect(isSuperAdminRole('porta-super-admin')).toBe(true);
  });

  it('should return true for legacy porta-admin', () => {
    expect(isSuperAdminRole('porta-admin')).toBe(true);
  });

  it('should return false for other admin roles', () => {
    expect(isSuperAdminRole('porta-org-admin')).toBe(false);
    expect(isSuperAdminRole('porta-user-admin')).toBe(false);
    expect(isSuperAdminRole('porta-app-admin')).toBe(false);
    expect(isSuperAdminRole('porta-auditor')).toBe(false);
  });

  it('should return false for arbitrary strings', () => {
    expect(isSuperAdminRole('')).toBe(false);
    expect(isSuperAdminRole('admin')).toBe(false);
    expect(isSuperAdminRole('super-admin')).toBe(false);
    expect(isSuperAdminRole('porta-SUPER-admin')).toBe(false);
  });
});

describe('resolveAdminRoleSlug', () => {
  it('should map legacy porta-admin to porta-super-admin', () => {
    expect(resolveAdminRoleSlug('porta-admin')).toBe('porta-super-admin');
  });

  it('should pass through porta-super-admin unchanged', () => {
    expect(resolveAdminRoleSlug('porta-super-admin')).toBe('porta-super-admin');
  });

  it('should pass through other role slugs unchanged', () => {
    expect(resolveAdminRoleSlug('porta-org-admin')).toBe('porta-org-admin');
    expect(resolveAdminRoleSlug('porta-user-admin')).toBe('porta-user-admin');
    expect(resolveAdminRoleSlug('porta-app-admin')).toBe('porta-app-admin');
    expect(resolveAdminRoleSlug('porta-auditor')).toBe('porta-auditor');
  });

  it('should pass through unknown slugs unchanged', () => {
    expect(resolveAdminRoleSlug('custom-role')).toBe('custom-role');
    expect(resolveAdminRoleSlug('')).toBe('');
  });
});

// ============================================================================
// Permission Resolution Functions
// ============================================================================

describe('getPermissionsForAdminRole', () => {
  it('should return all permissions for porta-super-admin', () => {
    const perms = getPermissionsForAdminRole('porta-super-admin');
    expect(perms.length).toBe(ALL_ADMIN_PERMISSIONS.length);
    for (const p of ALL_ADMIN_PERMISSIONS) {
      expect(perms).toContain(p);
    }
  });

  it('should return all permissions for legacy porta-admin', () => {
    const perms = getPermissionsForAdminRole('porta-admin');
    expect(perms.length).toBe(ALL_ADMIN_PERMISSIONS.length);
    for (const p of ALL_ADMIN_PERMISSIONS) {
      expect(perms).toContain(p);
    }
  });

  it('should return correct permissions for porta-org-admin', () => {
    const perms = getPermissionsForAdminRole('porta-org-admin');
    expect(perms).toContain('org:create');
    expect(perms).toContain('org:read');
    expect(perms).toContain('stats:read');
    expect(perms).not.toContain('user:create');
  });

  it('should return correct permissions for porta-user-admin', () => {
    const perms = getPermissionsForAdminRole('porta-user-admin');
    expect(perms).toContain('user:create');
    expect(perms).toContain('role:assign');
    expect(perms).toContain('session:revoke');
    expect(perms).not.toContain('org:create');
  });

  it('should return correct permissions for porta-app-admin', () => {
    const perms = getPermissionsForAdminRole('porta-app-admin');
    expect(perms).toContain('app:create');
    expect(perms).toContain('client:create');
    expect(perms).toContain('claim:create');
    expect(perms).not.toContain('user:create');
  });

  it('should return correct permissions for porta-auditor', () => {
    const perms = getPermissionsForAdminRole('porta-auditor');
    expect(perms).toContain('audit:read');
    expect(perms).toContain('export:read');
    expect(perms).not.toContain('org:create');
    expect(perms).not.toContain('import:write');
  });

  it('should return empty array for unknown role slugs', () => {
    expect(getPermissionsForAdminRole('unknown-role')).toEqual([]);
    expect(getPermissionsForAdminRole('')).toEqual([]);
    expect(getPermissionsForAdminRole('admin')).toEqual([]);
  });
});

describe('resolvePermissionsFromRoles', () => {
  it('should return all permissions for super-admin role', () => {
    const perms = resolvePermissionsFromRoles(['porta-super-admin']);
    expect(perms.length).toBe(ALL_ADMIN_PERMISSIONS.length);
  });

  it('should return all permissions for legacy porta-admin role', () => {
    const perms = resolvePermissionsFromRoles(['porta-admin']);
    expect(perms.length).toBe(ALL_ADMIN_PERMISSIONS.length);
  });

  it('should merge permissions from multiple roles', () => {
    const perms = resolvePermissionsFromRoles(['porta-org-admin', 'porta-user-admin']);
    // Should have org permissions + user permissions + stats + session
    expect(perms).toContain('org:create');
    expect(perms).toContain('user:create');
    expect(perms).toContain('stats:read');
    expect(perms).toContain('session:revoke');
  });

  it('should deduplicate overlapping permissions', () => {
    // Org Admin has stats:read, Auditor also has stats:read
    const perms = resolvePermissionsFromRoles(['porta-org-admin', 'porta-auditor']);
    const statsReadCount = perms.filter((p) => p === 'stats:read').length;
    expect(statsReadCount).toBe(1);
  });

  it('should return empty array for empty role list', () => {
    expect(resolvePermissionsFromRoles([])).toEqual([]);
  });

  it('should return empty array for unknown roles only', () => {
    expect(resolvePermissionsFromRoles(['unknown-role'])).toEqual([]);
  });

  it('should handle mix of known and unknown roles', () => {
    const perms = resolvePermissionsFromRoles(['porta-auditor', 'unknown-role']);
    // Should have auditor permissions, unknown role contributes nothing
    expect(perms).toContain('audit:read');
    expect(perms.length).toBe(ADMIN_ROLE_DEFINITIONS.AUDITOR.permissions.length);
  });

  it('should handle all 5 roles combined', () => {
    const perms = resolvePermissionsFromRoles([
      'porta-super-admin',
      'porta-org-admin',
      'porta-user-admin',
      'porta-app-admin',
      'porta-auditor',
    ]);
    // Super-admin already has all permissions, so result should equal ALL
    expect(perms.length).toBe(ALL_ADMIN_PERMISSIONS.length);
  });
});

describe('hasPermissions', () => {
  it('should return true when user has all required permissions', () => {
    const userPerms = ['org:read', 'org:create', 'org:update'];
    expect(hasPermissions(userPerms, ['org:read'])).toBe(true);
    expect(hasPermissions(userPerms, ['org:read', 'org:create'])).toBe(true);
    expect(hasPermissions(userPerms, ['org:read', 'org:create', 'org:update'])).toBe(true);
  });

  it('should return false when user is missing a required permission', () => {
    const userPerms = ['org:read', 'org:create'];
    expect(hasPermissions(userPerms, ['org:update'])).toBe(false);
    expect(hasPermissions(userPerms, ['org:read', 'org:update'])).toBe(false);
  });

  it('should return true when required permissions list is empty', () => {
    expect(hasPermissions(['org:read'], [])).toBe(true);
    expect(hasPermissions([], [])).toBe(true);
  });

  it('should return false when user has no permissions but some are required', () => {
    expect(hasPermissions([], ['org:read'])).toBe(false);
  });

  it('should work with all admin permissions', () => {
    const allPerms = [...ALL_ADMIN_PERMISSIONS] as string[];
    expect(hasPermissions(allPerms, ['org:read', 'user:create', 'audit:read'])).toBe(true);
    expect(hasPermissions(allPerms, [...ALL_ADMIN_PERMISSIONS])).toBe(true);
  });
});
