/** Invalid policy input, with a fixed message that cannot echo rejected values or identifiers. */
export class ServiceAccountValidationError extends Error {
  /** Construct the safe validation failure shared by every policy entry point. */
  public constructor() {
    super('Service-account request is invalid');
    this.name = 'ServiceAccountValidationError';
  }
}

/** A requested organization or assignment lies outside the explicit invitation policy. */
export class ServiceAccountAuthorizationError extends Error {
  /** Construct a fixed denial without revealing which target or assignment was rejected. */
  public constructor() {
    super('Service-account invitation is not permitted');
    this.name = 'ServiceAccountAuthorizationError';
  }
}

/** Stored binding data is invalid and cannot be used as fallback or unrestricted authority. */
export class ServiceAccountStorageError extends Error {
  /** Construct a safe failure; an optional cause may contain only an already sanitized domain error. */
  public constructor(options?: ErrorOptions) {
    super('Service-account configuration is unavailable', options);
    this.name = 'ServiceAccountStorageError';
  }
}
