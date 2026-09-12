/**
 * Permission entity types for the Porta SDK.
 *
 * @module types/permissions
 */

/** A permission granted to roles within one application. */
export interface Permission {
  /** Stable permission identifier. */
  id: string;
  /** Application that owns the permission. */
  applicationId: string;
  /** Optional application module that groups the permission. */
  moduleId: string | null;
  /** Human-readable permission name. */
  name: string;
  /** Stable permission key used in authority checks. */
  slug: string;
  /** Optional explanation shown to administrators. */
  description: string | null;
  /** ISO 8601 creation time. */
  createdAt: string;
}

/** Input for creating a permission under the application in the request path. */
export interface CreatePermissionInput {
  /** Human-readable permission name. */
  name: string;
  /** Exact permission claim value expected by the application, such as `CAN_ADD_ORDER`. */
  slug: string;
  /** Optional explanation shown to administrators. */
  description?: string;
  /** Optional application module identifier. */
  moduleId?: string;
}

/** Mutable permission metadata. The permission slug remains immutable. */
export interface UpdatePermissionInput {
  /** Replacement display name. */
  name?: string;
  /** Replacement description, or `null` to clear it. */
  description?: string | null;
}
