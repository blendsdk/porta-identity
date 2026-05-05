/**
 * User Roles domain — assign/remove/list roles for a user.
 *
 * @module domains/user-roles
 */

import type { HttpTransport } from '../transport/types.js';
import type { UserRoleAssignment } from '../types/index.js';
import { unwrapData } from './helpers.js';

export interface UserRolesDomain {
  list(orgId: string, userId: string): Promise<UserRoleAssignment[]>;
  assign(orgId: string, userId: string, roleId: string): Promise<void>;
  remove(orgId: string, userId: string, roleId: string): Promise<void>;
}

export function createUserRolesDomain(transport: HttpTransport): UserRolesDomain {
  function base(orgId: string, userId: string) {
    return `/organizations/${orgId}/users/${userId}/roles`;
  }

  return {
    async list(orgId, userId) {
      const res = await transport.request({ method: 'GET', path: base(orgId, userId) });
      return unwrapData<UserRoleAssignment[]>(res.body);
    },
    async assign(orgId, userId, roleId) {
      await transport.request({ method: 'POST', path: base(orgId, userId), body: { roleId } });
    },
    async remove(orgId, userId, roleId) {
      await transport.request({ method: 'DELETE', path: `${base(orgId, userId)}/${roleId}` });
    },
  };
}
