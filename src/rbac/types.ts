/**
 * RBAC types and interfaces.
 *
 * Defines the data structures for roles, permissions, and user-role
 * assignments. Includes full database record interfaces, input types
 * for create/update, pagination helpers, and mapping functions to
 * convert snake_case database rows to camelCase TypeScript objects.
 *
 * These types are the foundation that all other RBAC modules depend
 * on (repository, cache, service, routes).
 *
 * Database tables: roles, permissions, role_permissions, user_roles
 * (see migrations 006_roles_permissions.sql)
 */

// ---------------------------------------------------------------------------
// Role types
// ---------------------------------------------------------------------------

/**
 * Full role record as stored in the database.
 * Maps to the `roles` table columns (see migration 006).
 * Roles are defined globally per application — assigned to users via user_roles.
 */
export interface Role {
  id: string;
  applicationId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Raw database row from the roles table (snake_case columns).
 * Used by the repository layer; mapped to Role via mapRowToRole().
 */
export interface RoleRow {
  id: string;
  application_id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Input for creating a new role.
 * Slug is auto-generated from name if not provided.
 */
export interface CreateRoleInput {
  applicationId: string;
  name: string;
  slug?: string;
  description?: string;
}

/**
 * Input for updating an existing role (partial).
 * Only provided fields are updated.
 */
export interface UpdateRoleInput {
  name?: string;
  slug?: string;
  description?: string | null;
}

// ---------------------------------------------------------------------------
// Permission types
// ---------------------------------------------------------------------------

/**
 * Full permission record as stored in the database.
 * Maps to the `permissions` table columns (see migration 006).
 * Permissions are defined globally per application, optionally scoped
 * to a module. The slug follows the module:resource:action format
 * (e.g., "crm:contacts:read").
 */
export interface Permission {
  id: string;
  applicationId: string;
  moduleId: string | null;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
}

/**
 * Raw database row from the permissions table (snake_case columns).
 * Used by the repository layer; mapped to Permission via mapRowToPermission().
 */
export interface PermissionRow {
  id: string;
  application_id: string;
  module_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  created_at: Date;
}

/**
 * Input for creating a new permission.
 * The slug must follow the module:resource:action format and is
 * validated by the service layer before insert.
 */
export interface CreatePermissionInput {
  applicationId: string;
  moduleId?: string;
  name: string;
  slug: string;
  description?: string;
}

/**
 * Input for updating an existing permission (partial).
 * Note: slug is NOT updatable — it is the permission's identity.
 */
export interface UpdatePermissionInput {
  name?: string;
  description?: string | null;
}

// ---------------------------------------------------------------------------
// User-Role types (assignment join table)
// ---------------------------------------------------------------------------

/**
 * User-role assignment record.
 * Maps to the `user_roles` join table (see migration 006).
 * Tracks which user has which role, and who assigned it.
 */
export interface UserRole {
  userId: string;
  roleId: string;
  assignedBy: string | null;
  createdAt: Date;
}

/**
 * Raw database row from the user_roles table (snake_case columns).
 * Used by the repository layer; mapped to UserRole via mapRowToUserRole().
 */
export interface UserRoleRow {
  user_id: string;
  role_id: string;
  assigned_by: string | null;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Composite types (joined query results)
// ---------------------------------------------------------------------------

/**
 * Role with its assigned permissions — result of a joined query.
 * Used when fetching a role with all its permission details.
 */
export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/** Options for listing roles (paginated). */
export interface ListRolesOptions {
  applicationId: string;
  page: number;
  pageSize: number;
  search?: string;
  sortBy?: 'name' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}

/** Options for listing permissions (paginated). */
export interface ListPermissionsOptions {
  applicationId: string;
  page: number;
  pageSize: number;
  moduleId?: string;
  search?: string;
  sortBy?: 'name' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// Database row mapping functions
// ---------------------------------------------------------------------------

/**
 * Map a database row to a Role object.
 *
 * Converts snake_case column names from PostgreSQL to camelCase
 * TypeScript properties.
 *
 * @param row - Raw database row from the roles table
 * @returns Mapped Role object with camelCase properties
 */
export function mapRowToRole(row: RoleRow): Role {
  return {
    id: row.id,
    applicationId: row.application_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Map a database row to a Permission object.
 *
 * Converts snake_case column names from PostgreSQL to camelCase
 * TypeScript properties.
 *
 * @param row - Raw database row from the permissions table
 * @returns Mapped Permission object with camelCase properties
 */
export function mapRowToPermission(row: PermissionRow): Permission {
  return {
    id: row.id,
    applicationId: row.application_id,
    moduleId: row.module_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    createdAt: row.created_at,
  };
}

/**
 * Map a database row to a UserRole object.
 *
 * Converts snake_case column names from PostgreSQL to camelCase
 * TypeScript properties.
 *
 * @param row - Raw database row from the user_roles table
 * @returns Mapped UserRole object with camelCase properties
 */
export function mapRowToUserRole(row: UserRoleRow): UserRole {
  return {
    userId: row.user_id,
    roleId: row.role_id,
    assignedBy: row.assigned_by,
    createdAt: row.created_at,
  };
}
