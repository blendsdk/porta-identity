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

/** A live human Super Admin is required; supplied role/permission snapshots do not grant it. */
export class ServiceAccountManagementError extends Error {
  /** Construct a fixed authorization denial without identifying the rejected account. */
  public constructor() {
    super('Service-account management is not permitted');
    this.name = 'ServiceAccountManagementError';
  }
}

/** The requested client or binding is absent from authoritative storage. */
export class ServiceAccountNotFoundError extends Error {
  /** Construct a safe missing-resource error with no caller-supplied identifier. */
  public constructor() {
    super('Service-account resource was not found');
    this.name = 'ServiceAccountNotFoundError';
  }
}

/** Existing or physically lost ownership prevents the requested lifecycle transition. */
export class ServiceAccountConflictError extends Error {
  /** Construct the same fixed conflict for every lost-owner email variant. */
  public constructor() {
    super('Service-account ownership conflicts with this operation');
    this.name = 'ServiceAccountConflictError';
  }
}
