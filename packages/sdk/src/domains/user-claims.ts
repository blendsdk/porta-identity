/**
 * User Claims domain — get/set/remove claim values for a user.
 *
 * @module domains/user-claims
 */

import type { HttpTransport } from '../transport/types.js';
import type { UserClaimEntry } from '../types/index.js';
import { unwrapData } from './helpers.js';

export interface UserClaimsDomain {
  list(orgId: string, userId: string): Promise<UserClaimEntry[]>;
  set(orgId: string, userId: string, claimId: string, value: unknown): Promise<void>;
  remove(orgId: string, userId: string, claimId: string): Promise<void>;
}

export function createUserClaimsDomain(transport: HttpTransport): UserClaimsDomain {
  function base(orgId: string, userId: string) {
    return `/organizations/${orgId}/users/${userId}/claims`;
  }

  return {
    async list(orgId, userId) {
      const res = await transport.request({ method: 'GET', path: base(orgId, userId) });
      return unwrapData<UserClaimEntry[]>(res.body);
    },
    async set(orgId, userId, claimId, value) {
      await transport.request({ method: 'PUT', path: `${base(orgId, userId)}/${claimId}`, body: { value } });
    },
    async remove(orgId, userId, claimId) {
      await transport.request({ method: 'DELETE', path: `${base(orgId, userId)}/${claimId}` });
    },
  };
}
