/**
 * RBAC module — public API barrel export.
 *
 * Re-exports the types, error classes, slug utilities, and service
 * functions that other modules need. Internal implementation details
 * (repository, cache) are NOT exported — they are consumed only by
 * the service layer.
 */

// Types
export type {
  Role,
  RoleRow,
  CreateRoleInput,
  UpdateRoleInput,
  Permission,
  PermissionRow,
  CreatePermissionInput,
  UpdatePermissionInput,
  UserRole,
  UserRoleRow,
  RoleWithPermissions,
  ListRolesOptions,
  ListPermissionsOptions,
} from './types.js';

// Row mappers
export {
  mapRowToRole,
  mapRowToPermission,
  mapRowToUserRole,
} from './types.js';

// Error types
export {
  RoleNotFoundError,
  PermissionNotFoundError,
  RbacValidationError,
} from './errors.js';

// Slug utilities
export {
  generateRoleSlug,
  validateRoleSlug,
  validatePermissionSlug,
  parsePermissionSlug,
} from './slugs.js';

// Slug types
export type { ParsedPermissionSlug } from './slugs.js';

// Role service
export {
  createRole,
  findRoleById,
  findRoleBySlug,
  updateRole,
  deleteRole,
  listRolesByApplication,
  assignPermissionsToRole,
  removePermissionsFromRole,
  getPermissionsForRole,
} from './role-service.js';

// Permission service
export {
  createPermission,
  findPermissionById,
  findPermissionBySlug,
  updatePermission,
  deletePermission,
  listPermissionsByApplication,
  getRolesWithPermission,
} from './permission-service.js';

// User-role service
export {
  assignRolesToUser,
  removeRolesFromUser,
  getUserRoles,
  getUserPermissions,
  getUsersWithRole,
  buildRoleClaims,
  buildPermissionClaims,
} from './user-role-service.js';
