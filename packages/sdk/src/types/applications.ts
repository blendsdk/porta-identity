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
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface CreateApplicationInput {
  organizationId: string;
  name: string;
  slug?: string;
  description?: string;
}

export interface UpdateApplicationInput {
  name?: string;
  slug?: string;
  description?: string | null;
}

// ---------------------------------------------------------------------------
// Application Modules
// ---------------------------------------------------------------------------

export interface ApplicationModule {
  id: string;
  applicationId: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateModuleInput {
  name: string;
  slug?: string;
  description?: string;
}

export interface UpdateModuleInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
}
