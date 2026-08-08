/**
 * Organization domain error types.
 *
 * Custom error classes for organization-specific business rule violations.
 * API routes map these to appropriate HTTP status codes:
 *   - OrganizationNotFoundError → 404
 *   - OrganizationValidationError → 400
 */

/**
 * Thrown when an organization cannot be found by ID or slug.
 * Maps to HTTP 404 in route handlers.
 */
export class OrganizationNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Organization not found: ${identifier}`);
    this.name = 'OrganizationNotFoundError';
  }
}

/**
 * Thrown when an operation violates organization business rules.
 * Examples: invalid slug, slug already taken, invalid status transition,
 * super-admin protection violation.
 * Maps to HTTP 400 in route handlers.
 */
export class OrganizationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrganizationValidationError';
  }
}
