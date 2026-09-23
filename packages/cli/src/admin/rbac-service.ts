/** Validated SDK boundary for application roles, permissions, mappings, and user assignments. */

import {
  PortaAuthenticationError,
  PortaConflictError,
  PortaForbiddenError,
  PortaValidationError,
} from '@portaidentity/sdk';
import type {
  CreatePermissionInput,
  CreateRoleInput,
  PermissionsDomain,
  RolesDomain,
  UpdatePermissionInput,
  UpdateRoleInput,
  UserRolesDomain,
} from '@portaidentity/sdk';

import {
  validateAdminAuthorityReduction,
  validateAdminPermission,
  validateAdminPermissionCollection,
  validateAdminRole,
  validateAdminRoleCollection,
  validateAdminRoleUpdate,
} from './rbac-state.js';
import type {
  AdminPermission,
  AdminRbacMutationResult,
  AdminRbacReadResult,
  AdminRbacReductionResult,
  AdminRole,
} from './rbac-state.js';

export type * from './rbac-state.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Feature-local SDK domains obtained from one authenticated Porta client. */
export interface AdminRbacDomains {
  /** Application role operations. */
  readonly roles: Pick<
    RolesDomain,
    | 'list'
    | 'create'
    | 'update'
    | 'delete'
    | 'listPermissions'
    | 'assignPermissions'
    | 'removePermissions'
  >;
  /** Application permission operations. */
  readonly permissions: Pick<PermissionsDomain, 'list' | 'create' | 'update' | 'delete'>;
  /** Selected-user role assignment operations. */
  readonly userRoles: Pick<UserRolesDomain, 'list' | 'assign' | 'remove'>;
}

/** Direct validated operations consumed by the Application and User RBAC controllers. */
export interface AdminRbacOperations {
  /** Lists every role owned by one application. */
  readonly listRoles: (
    applicationId: string,
    signal?: AbortSignal,
  ) => Promise<AdminRbacReadResult<readonly AdminRole[]>>;
  /** Lists every permission owned by one application. */
  readonly listPermissions: (
    applicationId: string,
    signal?: AbortSignal,
  ) => Promise<AdminRbacReadResult<readonly AdminPermission[]>>;
  /** Lists permissions directly assigned to one role. */
  readonly listRolePermissions: (
    applicationId: string,
    roleId: string,
    signal?: AbortSignal,
  ) => Promise<AdminRbacReadResult<readonly AdminPermission[]>>;
  /** Creates one role beneath its application. */
  readonly createRole: (
    applicationId: string,
    input: CreateRoleInput,
    signal?: AbortSignal,
  ) => Promise<AdminRbacMutationResult<AdminRole>>;
  /** Updates mutable role values and reports a definite authentication effect. */
  readonly updateRole: (
    applicationId: string,
    roleId: string,
    input: UpdateRoleInput,
    signal?: AbortSignal,
  ) => Promise<AdminRbacReductionResult<AdminRole>>;
  /** Permanently deletes one role and reports a definite authentication effect. */
  readonly deleteRole: (
    applicationId: string,
    roleId: string,
    signal?: AbortSignal,
  ) => Promise<AdminRbacReductionResult>;
  /** Creates one permission beneath its application. */
  readonly createPermission: (
    applicationId: string,
    input: CreatePermissionInput,
    signal?: AbortSignal,
  ) => Promise<AdminRbacMutationResult<AdminPermission>>;
  /** Updates mutable permission metadata. */
  readonly updatePermission: (
    applicationId: string,
    permissionId: string,
    input: UpdatePermissionInput,
    signal?: AbortSignal,
  ) => Promise<AdminRbacMutationResult<AdminPermission>>;
  /** Permanently deletes one permission and reports a definite authentication effect. */
  readonly deletePermission: (
    applicationId: string,
    permissionId: string,
    signal?: AbortSignal,
  ) => Promise<AdminRbacReductionResult>;
  /** Assigns the supplied permissions to one role. */
  readonly assignPermissions: (
    applicationId: string,
    roleId: string,
    permissionIds: readonly string[],
    signal?: AbortSignal,
  ) => Promise<AdminRbacMutationResult>;
  /** Removes the supplied permissions and reports a definite authentication effect. */
  readonly removePermissions: (
    applicationId: string,
    roleId: string,
    permissionIds: readonly string[],
    signal?: AbortSignal,
  ) => Promise<AdminRbacReductionResult>;
  /** Lists complete roles assigned to one selected user. */
  readonly listUserRoles: (
    organizationId: string,
    userId: string,
    signal?: AbortSignal,
  ) => Promise<AdminRbacReadResult<readonly AdminRole[]>>;
  /** Assigns one or more role IDs to one selected user. */
  readonly assignUserRoles: (
    organizationId: string,
    userId: string,
    roleIds: readonly string[],
    signal?: AbortSignal,
  ) => Promise<AdminRbacMutationResult>;
  /** Removes role IDs from one selected user and reports a definite authentication effect. */
  readonly removeUserRoles: (
    organizationId: string,
    userId: string,
    roleIds: readonly string[],
    signal?: AbortSignal,
  ) => Promise<AdminRbacReductionResult>;
}

/** Maps a read exception to one fixed safe result. */
function readError(error: unknown): AdminRbacReadResult<never> {
  if (error instanceof PortaAuthenticationError) return { kind: 'session-invalid' };
  if (error instanceof PortaValidationError) return { kind: 'failure', failure: 'validation' };
  if (error instanceof PortaForbiddenError) return { kind: 'failure', failure: 'unauthorized' };
  if (error instanceof PortaConflictError) return { kind: 'failure', failure: 'conflict' };
  return { kind: 'failure', failure: 'unavailable' };
}

/** Maps a mutation exception without exposing its message. */
function mutationError(
  error: unknown,
): Exclude<AdminRbacMutationResult, { readonly kind: 'success' }> {
  if (error instanceof PortaAuthenticationError) return { kind: 'session-invalid' };
  if (error instanceof PortaValidationError) return { kind: 'failure', failure: 'validation' };
  if (error instanceof PortaForbiddenError) return { kind: 'failure', failure: 'unauthorized' };
  if (error instanceof PortaConflictError) return { kind: 'failure', failure: 'conflict' };
  return { kind: 'outcome-unknown' };
}

/** Returns a cancelled result before dispatching work owned by an aborted caller. */
function isCancelled(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

/** Validates one or more UUIDs used by collection mutations. */
function validIdentifiers(...values: readonly string[]): boolean {
  return values.length > 0 && values.every((value) => UUID.test(value));
}

/** Converts a rejected mutation to the matching reduction result union. */
function reductionError(error: unknown): Exclude<AdminRbacReductionResult, { kind: 'success' }> {
  return mutationError(error);
}

/** Creates the small RBAC adapter over one lazy authenticated SDK domain bundle. */
export function createAdminRbacOperations(domain: () => AdminRbacDomains): AdminRbacOperations {
  return {
    async listRoles(applicationId, signal) {
      if (!UUID.test(applicationId)) return { kind: 'failure', failure: 'validation' };
      if (isCancelled(signal)) return { kind: 'failure', failure: 'unavailable' };
      try {
        const roles = validateAdminRoleCollection(
          await domain().roles.list(applicationId),
          applicationId,
        );
        return roles
          ? { kind: 'success', value: roles }
          : { kind: 'failure', failure: 'invalid-response' };
      } catch (error) {
        return readError(error);
      }
    },
    async listPermissions(applicationId, signal) {
      if (!UUID.test(applicationId)) return { kind: 'failure', failure: 'validation' };
      if (isCancelled(signal)) return { kind: 'failure', failure: 'unavailable' };
      try {
        const permissions = validateAdminPermissionCollection(
          await domain().permissions.list(applicationId),
          applicationId,
        );
        return permissions
          ? { kind: 'success', value: permissions }
          : { kind: 'failure', failure: 'invalid-response' };
      } catch (error) {
        return readError(error);
      }
    },
    async listRolePermissions(applicationId, roleId, signal) {
      if (!validIdentifiers(applicationId, roleId))
        return { kind: 'failure', failure: 'validation' };
      if (isCancelled(signal)) return { kind: 'failure', failure: 'unavailable' };
      try {
        const permissions = validateAdminPermissionCollection(
          await domain().roles.listPermissions(applicationId, roleId),
          applicationId,
        );
        return permissions
          ? { kind: 'success', value: permissions }
          : { kind: 'failure', failure: 'invalid-response' };
      } catch (error) {
        return readError(error);
      }
    },
    async createRole(applicationId, input, signal) {
      if (!UUID.test(applicationId)) return { kind: 'failure', failure: 'validation' };
      if (isCancelled(signal)) return { kind: 'cancelled' };
      try {
        const role = validateAdminRole(
          await domain().roles.create(applicationId, input),
          applicationId,
        );
        return role ? { kind: 'success', value: role } : { kind: 'outcome-unknown' };
      } catch (error) {
        return mutationError(error);
      }
    },
    async updateRole(applicationId, roleId, input, signal) {
      if (!validIdentifiers(applicationId, roleId))
        return { kind: 'failure', failure: 'validation' };
      if (isCancelled(signal)) return { kind: 'cancelled' };
      try {
        const result = validateAdminRoleUpdate(
          await domain().roles.update(applicationId, roleId, input),
          applicationId,
        );
        return result
          ? {
              kind: 'success',
              value: result.role,
              reauthenticationRequired: result.reauthenticationRequired,
            }
          : { kind: 'outcome-unknown' };
      } catch (error) {
        return reductionError(error);
      }
    },
    async deleteRole(applicationId, roleId, signal) {
      if (!validIdentifiers(applicationId, roleId))
        return { kind: 'failure', failure: 'validation' };
      if (isCancelled(signal)) return { kind: 'cancelled' };
      try {
        const result = validateAdminAuthorityReduction(
          await domain().roles.delete(applicationId, roleId),
        );
        return result ? { kind: 'success', ...result } : { kind: 'outcome-unknown' };
      } catch (error) {
        return reductionError(error);
      }
    },
    async createPermission(applicationId, input, signal) {
      if (!UUID.test(applicationId)) return { kind: 'failure', failure: 'validation' };
      if (isCancelled(signal)) return { kind: 'cancelled' };
      try {
        const permission = validateAdminPermission(
          await domain().permissions.create(applicationId, input),
          applicationId,
        );
        return permission ? { kind: 'success', value: permission } : { kind: 'outcome-unknown' };
      } catch (error) {
        return mutationError(error);
      }
    },
    async updatePermission(applicationId, permissionId, input, signal) {
      if (!validIdentifiers(applicationId, permissionId))
        return { kind: 'failure', failure: 'validation' };
      if (isCancelled(signal)) return { kind: 'cancelled' };
      try {
        const permission = validateAdminPermission(
          await domain().permissions.update(applicationId, permissionId, input),
          applicationId,
        );
        return permission ? { kind: 'success', value: permission } : { kind: 'outcome-unknown' };
      } catch (error) {
        return mutationError(error);
      }
    },
    async deletePermission(applicationId, permissionId, signal) {
      if (!validIdentifiers(applicationId, permissionId))
        return { kind: 'failure', failure: 'validation' };
      if (isCancelled(signal)) return { kind: 'cancelled' };
      try {
        const result = validateAdminAuthorityReduction(
          await domain().permissions.delete(applicationId, permissionId),
        );
        return result ? { kind: 'success', ...result } : { kind: 'outcome-unknown' };
      } catch (error) {
        return reductionError(error);
      }
    },
    async assignPermissions(applicationId, roleId, permissionIds, signal) {
      if (!validIdentifiers(applicationId, roleId, ...permissionIds)) {
        return { kind: 'failure', failure: 'validation' };
      }
      if (isCancelled(signal)) return { kind: 'cancelled' };
      try {
        await domain().roles.assignPermissions(applicationId, roleId, [...permissionIds]);
        return { kind: 'success' };
      } catch (error) {
        return mutationError(error);
      }
    },
    async removePermissions(applicationId, roleId, permissionIds, signal) {
      if (!validIdentifiers(applicationId, roleId, ...permissionIds)) {
        return { kind: 'failure', failure: 'validation' };
      }
      if (isCancelled(signal)) return { kind: 'cancelled' };
      try {
        const result = validateAdminAuthorityReduction(
          await domain().roles.removePermissions(applicationId, roleId, [...permissionIds]),
        );
        return result ? { kind: 'success', ...result } : { kind: 'outcome-unknown' };
      } catch (error) {
        return reductionError(error);
      }
    },
    async listUserRoles(organizationId, userId, signal) {
      if (!validIdentifiers(organizationId, userId))
        return { kind: 'failure', failure: 'validation' };
      if (isCancelled(signal)) return { kind: 'failure', failure: 'unavailable' };
      try {
        const rawRoles = await domain().userRoles.list(organizationId, userId);
        if (!Array.isArray(rawRoles)) return { kind: 'failure', failure: 'invalid-response' };
        const roles: AdminRole[] = [];
        for (const rawRole of rawRoles) {
          if (
            !rawRole ||
            typeof rawRole !== 'object' ||
            typeof rawRole.applicationId !== 'string'
          ) {
            return { kind: 'failure', failure: 'invalid-response' };
          }
          const role = validateAdminRole(rawRole, rawRole.applicationId);
          if (!role) return { kind: 'failure', failure: 'invalid-response' };
          roles.push(role);
        }
        return { kind: 'success', value: Object.freeze(roles) };
      } catch (error) {
        return readError(error);
      }
    },
    async assignUserRoles(organizationId, userId, roleIds, signal) {
      if (!validIdentifiers(organizationId, userId, ...roleIds)) {
        return { kind: 'failure', failure: 'validation' };
      }
      if (isCancelled(signal)) return { kind: 'cancelled' };
      try {
        await domain().userRoles.assign(organizationId, userId, [...roleIds]);
        return { kind: 'success' };
      } catch (error) {
        return mutationError(error);
      }
    },
    async removeUserRoles(organizationId, userId, roleIds, signal) {
      if (!validIdentifiers(organizationId, userId, ...roleIds)) {
        return { kind: 'failure', failure: 'validation' };
      }
      if (isCancelled(signal)) return { kind: 'cancelled' };
      try {
        const result = validateAdminAuthorityReduction(
          await domain().userRoles.remove(organizationId, userId, [...roleIds]),
        );
        return result ? { kind: 'success', ...result } : { kind: 'outcome-unknown' };
      } catch (error) {
        return reductionError(error);
      }
    },
  };
}
