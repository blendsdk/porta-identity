/**
 * Application entity types for the Porta SDK.
 *
 * @module types/applications
 */

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type ApplicationStatus = 'active' | 'inactive' | 'archived';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface Application {
  /** Internal application UUID used by mutation routes. */
  id: string;
  /** Deployment-global display name. */
  name: string;
  /** Stable deployment-global slug. */
  slug: string;
  /** Optional product description. */
  description: string | null;
  /** Current application lifecycle state. */
  status: ApplicationStatus;
  /** ISO timestamp for creation. */
  createdAt: string;
  /** ISO timestamp for the latest change. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface CreateApplicationInput {
  /** Display name for the global application definition. */
  name: string;
  /** Optional stable slug; the server derives one when omitted. */
  slug?: string;
  /** Optional product description. */
  description?: string;
}

export interface UpdateApplicationInput {
  /** Replacement display name. */
  name?: string;
  /** Replacement description, or null to clear it. */
  description?: string | null;
}

// ---------------------------------------------------------------------------
// Application Modules
// ---------------------------------------------------------------------------

export interface ApplicationModule {
  /** Internal module UUID. */
  id: string;
  /** Internal UUID of the owning application. */
  applicationId: string;
  /** Module display name. */
  name: string;
  /** Stable slug within the owning application. */
  slug: string;
  /** Optional module description. */
  description: string | null;
  /** Current module lifecycle state. */
  status: 'active' | 'inactive';
  /** ISO timestamp for creation. */
  createdAt: string;
  /** ISO timestamp for the latest change. */
  updatedAt: string;
}

export interface CreateModuleInput {
  /** Module display name. */
  name: string;
  /** Optional stable slug; the server derives one when omitted. */
  slug?: string;
  /** Optional module description. */
  description?: string;
}

export interface UpdateModuleInput {
  /** Replacement display name. */
  name?: string;
  /** Replacement description, or null to clear it. */
  description?: string | null;
}
