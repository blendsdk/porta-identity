/**
 * Resource-server Admin domain errors.
 *
 * Routes map these to fixed public bodies so storage details never reach the caller.
 */

/** The requested resource server does not exist in the owning application. */
export class ResourceServerNotFoundError extends Error {
  constructor() {
    super('Resource server not found');
    this.name = 'ResourceServerNotFoundError';
  }
}

/** A unique identifier, audience, or application-local slug is already taken. */
export class ResourceServerConflictError extends Error {
  constructor() {
    super('Resource server conflicts with an existing identifier, audience, or slug');
    this.name = 'ResourceServerConflictError';
  }
}

/** A resource-server field failed a business rule before persistence. */
export class ResourceServerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResourceServerValidationError';
  }
}
