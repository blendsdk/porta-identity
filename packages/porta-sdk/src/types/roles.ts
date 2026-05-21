/**
 * Role entity types for the Porta SDK.
 *
 * @module types/roles
 */

import type { Permission } from './permissions.js';

export interface Role {
  id: string;
  applicationId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoleInput {
  applicationId: string;
  name: string;
  slug?: string;
  description?: string;
}

export interface UpdateRoleInput {
  name?: string;
  slug?: string;
  description?: string | null;
}

/** Role with its assigned permissions (full Permission objects) */
export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}
