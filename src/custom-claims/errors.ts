/**
 * Custom claims domain error types.
 *
 * Custom error classes for claim-specific business rule violations.
 * API routes map these to appropriate HTTP status codes:
 *   - ClaimNotFoundError    → 404
 *   - ClaimValidationError  → 400
 */

/**
 * Thrown when a claim definition or value cannot be found.
 * Maps to HTTP 404 in route handlers.
 */
export class ClaimNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Custom claim not found: ${identifier}`);
    this.name = 'ClaimNotFoundError';
  }
}

/**
 * Thrown when custom claim validation fails.
 * Examples: reserved claim name, invalid claim name format, duplicate
 * name within application, value type mismatch.
 * Maps to HTTP 400 in route handlers.
 */
export class ClaimValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaimValidationError';
  }
}
