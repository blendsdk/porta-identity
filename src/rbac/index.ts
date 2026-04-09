/**
 * RBAC module — public API barrel export.
 *
 * Re-exports the types, error classes, and slug utilities that other
 * modules need. Internal implementation details (repository, cache)
 * are NOT exported — they are consumed only by the service layer.
 *
 * Note: Service functions will be added here as they are implemented
 * in later phases (Phase 3).
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
