/**
 * RBAC domain error types.
 *
 * Custom error classes for RBAC-specific business rule violations.
 * API routes map these to appropriate HTTP status codes:
 *   - RoleNotFoundError       → 404
 *   - PermissionNotFoundError → 404
 *   - RbacValidationError     → 400
 */

/**
 * Thrown when a role cannot be found by ID or slug.
 * Maps to HTTP 404 in route handlers.
 */
export class RoleNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Role not found: ${identifier}`);
    this.name = 'RoleNotFoundError';
  }
}

/**
 * Thrown when a permission cannot be found by ID or slug.
 * Maps to HTTP 404 in route handlers.
 */
export class PermissionNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Permission not found: ${identifier}`);
    this.name = 'PermissionNotFoundError';
  }
}

/**
 * Thrown when an RBAC operation violates business rules.
 * Examples: duplicate slug in same application, invalid permission
 * slug format, role still has assigned users (deletion guard),
 * permission still assigned to roles (deletion guard).
 * Maps to HTTP 400 in route handlers.
 */
export class RbacValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RbacValidationError';
  }
}
