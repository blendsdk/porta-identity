/**
 * User domain error types.
 *
 * Custom error classes for user-specific business rule violations.
 * API routes map these to appropriate HTTP status codes:
 *   - UserNotFoundError → 404
 *   - UserValidationError → 400
 */

/**
 * Thrown when a user cannot be found by ID or email.
 * Maps to HTTP 404 in route handlers.
 */
export class UserNotFoundError extends Error {
  constructor(identifier: string) {
    super(`User not found: ${identifier}`);
    this.name = 'UserNotFoundError';
  }
}

/**
 * Thrown when an operation violates user business rules.
 * Examples: duplicate email within org, invalid status transition,
 * invalid password format, missing required fields.
 * Maps to HTTP 400 in route handlers.
 */
export class UserValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserValidationError';
  }
}

/**
 * Thrown when a create would duplicate an email already owned by the organization.
 *
 * The Admin route keeps its historical `400` response; the tenant route maps
 * this conflict to `409`.
 */
export class UserEmailConflictError extends Error {
  constructor() {
    super('Email already exists in this organization');
    this.name = 'UserEmailConflictError';
  }
}
