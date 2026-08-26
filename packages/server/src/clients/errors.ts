/**
 * Client domain error classes.
 *
 * Used by the service layer to signal business rule violations.
 * The API route layer maps these to appropriate HTTP status codes:
 *   - ClientNotFoundError → 404
 *   - ClientValidationError → 400
 */

/**
 * Thrown when a client or secret cannot be found by the given identifier.
 */
export class ClientNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Client not found: ${identifier}`);
    this.name = 'ClientNotFoundError';
  }
}

/**
 * Thrown when a client operation violates business rules.
 *
 * Examples:
 * - Invalid redirect URI
 * - Organization/application not active
 * - Invalid status transition
 * - Secret already revoked
 */
export class ClientValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClientValidationError';
  }
}
