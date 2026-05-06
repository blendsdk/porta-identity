/**
 * User-role assignment types for the Porta SDK.
 *
 * @module types/user-roles
 */

export interface UserRoleAssignment {
  userId: string;
  roleId: string;
  roleName: string;
  roleSlug: string;
  applicationId: string;
  assignedAt: string;
}

export interface AssignRoleInput {
  roleId: string;
}
