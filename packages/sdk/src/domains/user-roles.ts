/**
 * User Roles domain — assign/remove/list roles for a user.
 *
 * @module domains/user-roles
 */

import type { HttpTransport } from '../transport/types.js';
import type { Role, UserRoleRemovalResult } from '../types/index.js';
import { isRecord, requireData } from './helpers.js';

/** Validate one role returned by the Admin API. */
function isRole(value: unknown): value is Role {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.applicationId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.slug === 'string' &&
    (typeof value.description === 'string' || value.description === null) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

/** Validate the explicit result of a committed user-role removal. */
function isUserRoleRemovalResult(value: unknown): value is UserRoleRemovalResult {
  return isRecord(value) && typeof value.reauthenticationRequired === 'boolean';
}

/** User-role collection operations scoped by organization and user. */
export interface UserRolesDomain {
  /** List the complete set of roles assigned to a user. */
  list(orgId: string, userId: string): Promise<Role[]>;
  /** Assign one or more roles in a single collection request. */
  assign(orgId: string, userId: string, roleIds: string[]): Promise<void>;
  /** Remove one or more roles and report whether the caller must authenticate again. */
  remove(orgId: string, userId: string, roleIds: string[]): Promise<UserRoleRemovalResult>;
}

/** Create user-role operations backed by one HTTP transport. */
export function createUserRolesDomain(transport: HttpTransport): UserRolesDomain {
  /** Build the organization- and user-qualified role collection path. */
  function base(orgId: string, userId: string): string {
    return `/organizations/${orgId}/users/${userId}/roles`;
  }

  return {
    async list(orgId, userId) {
      const res = await transport.request({ method: 'GET', path: base(orgId, userId) });
      return requireData(
        res.body,
        (value): value is Role[] => Array.isArray(value) && value.every(isRole),
      );
    },
    async assign(orgId, userId, roleIds) {
      await transport.request({
        method: 'PUT',
        path: base(orgId, userId),
        body: { roleIds },
      });
    },
    async remove(orgId, userId, roleIds) {
      const res = await transport.request({
        method: 'DELETE',
        path: base(orgId, userId),
        body: { roleIds },
      });
      return requireData(res.body, isUserRoleRemovalResult);
    },
  };
}
