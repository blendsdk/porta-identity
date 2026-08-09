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
