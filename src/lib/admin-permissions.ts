/**
 * Admin permission constants and role definitions for granular admin access control.
 *
 * Replaces the single porta-admin role with a permission-based model where
 * each admin endpoint requires specific permissions. Five predefined admin
 * roles group permissions by responsibility area.
 *
 * @module admin-permissions
 * @see 03-granular-admin-roles.md
 */

// ============================================================================
// Permission Constants
// ============================================================================

/**
 * Admin permission slugs following the `resource:action` pattern.
 * Used by admin-auth middleware's `requirePermission()` factory
 * and route handlers for endpoint-level authorization.
 *
 * Permissions are seeded into the admin application during `porta init`
 * and resolved at runtime from the user's assigned admin roles.
 */
export const ADMIN_PERMISSIONS = {
  // Organization management
  ORG_CREATE: 'org:create',
  ORG_READ: 'org:read',
  ORG_UPDATE: 'org:update',
  ORG_SUSPEND: 'org:suspend',
  ORG_ARCHIVE: 'org:archive',

  // Application management
  APP_CREATE: 'app:create',
  APP_READ: 'app:read',
  APP_UPDATE: 'app:update',
  APP_ARCHIVE: 'app:archive',

  // Client management
  CLIENT_CREATE: 'client:create',
  CLIENT_READ: 'client:read',
  CLIENT_UPDATE: 'client:update',
  CLIENT_REVOKE: 'client:revoke',

  // User management
  USER_CREATE: 'user:create',
  USER_READ: 'user:read',
  USER_UPDATE: 'user:update',
  USER_SUSPEND: 'user:suspend',
  USER_ARCHIVE: 'user:archive',
  USER_INVITE: 'user:invite',

  // Role management
  ROLE_CREATE: 'role:create',
  ROLE_READ: 'role:read',
  ROLE_UPDATE: 'role:update',
  ROLE_ARCHIVE: 'role:archive',
  ROLE_ASSIGN: 'role:assign',

  // Permission management
  PERMISSION_CREATE: 'permission:create',
  PERMISSION_READ: 'permission:read',
  PERMISSION_ARCHIVE: 'permission:archive',

  // Custom claims management
  CLAIM_CREATE: 'claim:create',
  CLAIM_READ: 'claim:read',
  CLAIM_UPDATE: 'claim:update',
  CLAIM_ARCHIVE: 'claim:archive',

  // System configuration
  CONFIG_READ: 'config:read',
  CONFIG_UPDATE: 'config:update',

  // Signing keys
  KEY_READ: 'key:read',
  KEY_GENERATE: 'key:generate',
  KEY_ROTATE: 'key:rotate',

  // Audit
  AUDIT_READ: 'audit:read',

  // Session management
  SESSION_READ: 'session:read',
  SESSION_REVOKE: 'session:revoke',

  // Dashboard statistics
  STATS_READ: 'stats:read',

  // Import/export
  EXPORT_READ: 'export:read',
  IMPORT_WRITE: 'import:write',
} as const;

/** Union type of all valid admin permission slug values */
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];

/** Array of all admin permission slug values (useful for iteration/validation) */
export const ALL_ADMIN_PERMISSIONS: readonly AdminPermission[] = Object.values(ADMIN_PERMISSIONS);

// ============================================================================
// Role Definitions
// ============================================================================

/**
 * Shape of a predefined admin role definition.
 * Used during `porta init` to seed RBAC for the admin application.
 */
export interface AdminRoleDefinition {
  /** Unique role slug (e.g., 'porta-super-admin') */
  readonly slug: string;
  /** Human-readable role name */
  readonly name: string;
  /** Brief description of the role's purpose */
  readonly description: string;
  /** Permission slugs granted to this role */
  readonly permissions: readonly string[];
}

/**
 * Predefined admin role definitions with their permission sets.
 *
 * These roles are seeded during `porta init` into the admin application's
 * RBAC system. Each role groups permissions by administrative responsibility:
 *
 * - **Super Admin** — Full access to all admin operations (all permissions)
 * - **Org Admin** — Organization lifecycle management and statistics
 * - **User Admin** — User management, invitations, role assignment, sessions
 * - **App Admin** — Application/client/RBAC/claims management
 * - **Auditor** — Read-only access across all resources plus audit log
 */
export const ADMIN_ROLE_DEFINITIONS: Record<string, AdminRoleDefinition> = {
  SUPER_ADMIN: {
    slug: 'porta-super-admin',
    name: 'Super Admin',
    description: 'Full system access, cannot be deleted',
    permissions: ALL_ADMIN_PERMISSIONS,
  },
  ORG_ADMIN: {
    slug: 'porta-org-admin',
    name: 'Organization Admin',
    description: 'Manage organizations, branding, settings',
    permissions: [
      ADMIN_PERMISSIONS.ORG_CREATE,
      ADMIN_PERMISSIONS.ORG_READ,
      ADMIN_PERMISSIONS.ORG_UPDATE,
      ADMIN_PERMISSIONS.ORG_SUSPEND,
      ADMIN_PERMISSIONS.ORG_ARCHIVE,
      ADMIN_PERMISSIONS.STATS_READ,
    ],
  },
  USER_ADMIN: {
    slug: 'porta-user-admin',
    name: 'User Admin',
    description: 'Manage users, send invitations, manage roles',
    permissions: [
      ADMIN_PERMISSIONS.USER_CREATE,
      ADMIN_PERMISSIONS.USER_READ,
      ADMIN_PERMISSIONS.USER_UPDATE,
      ADMIN_PERMISSIONS.USER_SUSPEND,
      ADMIN_PERMISSIONS.USER_ARCHIVE,
      ADMIN_PERMISSIONS.USER_INVITE,
      ADMIN_PERMISSIONS.ROLE_ASSIGN,
      ADMIN_PERMISSIONS.ROLE_READ,
      ADMIN_PERMISSIONS.CLAIM_READ,
      ADMIN_PERMISSIONS.SESSION_READ,
      ADMIN_PERMISSIONS.SESSION_REVOKE,
    ],
  },
  APP_ADMIN: {
    slug: 'porta-app-admin',
    name: 'Application Admin',
    description: 'Manage applications, clients, RBAC definitions',
    permissions: [
      ADMIN_PERMISSIONS.APP_CREATE,
      ADMIN_PERMISSIONS.APP_READ,
      ADMIN_PERMISSIONS.APP_UPDATE,
      ADMIN_PERMISSIONS.APP_ARCHIVE,
      ADMIN_PERMISSIONS.CLIENT_CREATE,
      ADMIN_PERMISSIONS.CLIENT_READ,
      ADMIN_PERMISSIONS.CLIENT_UPDATE,
      ADMIN_PERMISSIONS.CLIENT_REVOKE,
      ADMIN_PERMISSIONS.ROLE_CREATE,
      ADMIN_PERMISSIONS.ROLE_READ,
      ADMIN_PERMISSIONS.ROLE_UPDATE,
      ADMIN_PERMISSIONS.ROLE_ARCHIVE,
      ADMIN_PERMISSIONS.PERMISSION_CREATE,
      ADMIN_PERMISSIONS.PERMISSION_READ,
      ADMIN_PERMISSIONS.PERMISSION_ARCHIVE,
      ADMIN_PERMISSIONS.CLAIM_CREATE,
      ADMIN_PERMISSIONS.CLAIM_READ,
      ADMIN_PERMISSIONS.CLAIM_UPDATE,
      ADMIN_PERMISSIONS.CLAIM_ARCHIVE,
    ],
  },
  AUDITOR: {
    slug: 'porta-auditor',
    name: 'Auditor',
    description: 'Read-only access to everything, full audit log access',
    permissions: [
      ADMIN_PERMISSIONS.ORG_READ,
      ADMIN_PERMISSIONS.APP_READ,
      ADMIN_PERMISSIONS.CLIENT_READ,
      ADMIN_PERMISSIONS.USER_READ,
      ADMIN_PERMISSIONS.ROLE_READ,
      ADMIN_PERMISSIONS.PERMISSION_READ,
      ADMIN_PERMISSIONS.CLAIM_READ,
      ADMIN_PERMISSIONS.CONFIG_READ,
      ADMIN_PERMISSIONS.KEY_READ,
      ADMIN_PERMISSIONS.AUDIT_READ,
      ADMIN_PERMISSIONS.SESSION_READ,
      ADMIN_PERMISSIONS.STATS_READ,
      ADMIN_PERMISSIONS.EXPORT_READ,
    ],
  },
} as const;

/** All admin role definition values as an array (for iteration) */
export const ALL_ADMIN_ROLES: readonly AdminRoleDefinition[] = Object.values(ADMIN_ROLE_DEFINITIONS);

// ============================================================================
// Legacy Compatibility
// ============================================================================

/**
 * Legacy admin role slug from pre-granular auth.
 * Users with this role are automatically treated as super-admins
 * for backward compatibility during the transition period.
 */
export const LEGACY_ADMIN_ROLE = 'porta-admin';

/**
 * Check if a role slug represents a super-admin role.
 * Recognizes both the new `porta-super-admin` and legacy `porta-admin` slugs.
 *
 * @param roleSlug - The role slug to check
 * @returns true if the role grants super-admin level access
 */
export function isSuperAdminRole(roleSlug: string): boolean {
  return (
    roleSlug === ADMIN_ROLE_DEFINITIONS.SUPER_ADMIN.slug || roleSlug === LEGACY_ADMIN_ROLE
  );
}

/**
 * Resolve the effective admin role slug, mapping legacy roles to their
 * modern equivalents.
 *
 * @param roleSlug - The role slug to resolve
 * @returns The effective role slug (legacy porta-admin → porta-super-admin)
 */
export function resolveAdminRoleSlug(roleSlug: string): string {
  if (roleSlug === LEGACY_ADMIN_ROLE) {
    return ADMIN_ROLE_DEFINITIONS.SUPER_ADMIN.slug;
  }
  return roleSlug;
}

/**
 * Get the permission set for an admin role slug.
 * Returns all permissions for super-admin roles (including legacy).
 * Returns an empty array for unrecognized role slugs.
 *
 * @param roleSlug - The admin role slug to look up
 * @returns Array of permission slugs granted by this role
 */
export function getPermissionsForAdminRole(roleSlug: string): readonly string[] {
  // Legacy porta-admin gets all permissions (backward compatible)
  if (roleSlug === LEGACY_ADMIN_ROLE) {
    return ALL_ADMIN_PERMISSIONS;
  }

  // Find matching role definition
  const roleDef = ALL_ADMIN_ROLES.find((r) => r.slug === roleSlug);
  return roleDef ? roleDef.permissions : [];
}

/**
 * Resolve the union of all permissions from multiple admin role slugs.
 * Deduplicates the result. Handles legacy role mapping automatically.
 *
 * @param roleSlugs - Array of admin role slugs assigned to a user
 * @returns Deduplicated array of all permission slugs
 */
export function resolvePermissionsFromRoles(roleSlugs: readonly string[]): string[] {
  const permissionSet = new Set<string>();

  for (const slug of roleSlugs) {
    const permissions = getPermissionsForAdminRole(slug);
    for (const p of permissions) {
      permissionSet.add(p);
    }
  }

  return [...permissionSet];
}

/**
 * Check if a set of permissions includes all required permissions.
 *
 * @param userPermissions - The user's resolved permission set
 * @param requiredPermissions - The permissions required for an operation
 * @returns true if all required permissions are present
 */
export function hasPermissions(
  userPermissions: readonly string[],
  requiredPermissions: readonly string[],
): boolean {
  return requiredPermissions.every((p) => userPermissions.includes(p));
}
