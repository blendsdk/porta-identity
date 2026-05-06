/**
 * Permission entity types for the Porta SDK.
 *
 * @module types/permissions
 */

export interface Permission {
  id: string;
  applicationId: string;
  moduleId: string | null;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePermissionInput {
  applicationId: string;
  name: string;
  slug?: string;
  description?: string;
  moduleId?: string;
}
