/**
 * Permission entity types for the Porta SDK.
 *
 * @module types/permissions
 */

/**
 * A permission — mirrors the server `mapRowToPermission` (src/rbac/types.ts).
 * The server projection has no `updatedAt` field; it was SDK drift (AR-18).
 */
export interface Permission {
  id: string;
  applicationId: string;
  moduleId: string | null;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
}


export interface CreatePermissionInput {
  applicationId: string;
  name: string;
  slug?: string;
  description?: string;
  moduleId?: string;
}
