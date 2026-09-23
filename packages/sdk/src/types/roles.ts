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
  /** Exact role claim value emitted to the application. */
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoleInput {
  name: string;
  /** Optional exact claim value; Porta derives a kebab-case value from `name` when omitted. */
  slug?: string;
  description?: string;
}

export interface UpdateRoleInput {
  name?: string;
  /** Replacement exact claim value. */
  slug?: string;
  description?: string | null;
}

/** Role with its assigned permissions (full Permission objects) */
export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}
