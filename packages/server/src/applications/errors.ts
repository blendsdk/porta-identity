/**
 * Application domain error types.
 *
 * Custom error classes for application-specific business rule violations.
 * API routes map these to appropriate HTTP status codes:
 *   - ApplicationNotFoundError → 404
 *   - ApplicationValidationError → 400
 */

/**
 * Thrown when an application cannot be found by ID or slug.
 * Maps to HTTP 404 in route handlers.
 */
export class ApplicationNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Application not found: ${identifier}`);
    this.name = 'ApplicationNotFoundError';
  }
}

/**
 * Thrown when an operation violates application business rules.
 * Examples: invalid slug, slug already taken, invalid status transition,
 * module slug collision within application.
 * Maps to HTTP 400 in route handlers.
 */
export class ApplicationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApplicationValidationError';
  }
}
