/**
 * Two-Factor domain — admin 2FA status and management.
 *
 * @module domains/two-factor
 */

import type { HttpTransport } from '../transport/types.js';
import type { TwoFactorStatus } from '../types/index.js';
import { unwrapData } from './helpers.js';

export interface TwoFactorDomain {
  getStatus(orgId: string, userId: string): Promise<TwoFactorStatus>;
  disable(orgId: string, userId: string): Promise<void>;
  reset(orgId: string, userId: string): Promise<void>;
}

export function createTwoFactorDomain(transport: HttpTransport): TwoFactorDomain {
  function base(orgId: string, userId: string) {
    return `/organizations/${orgId}/users/${userId}/two-factor`;
  }

  return {
    async getStatus(orgId, userId) {
      const res = await transport.request({ method: 'GET', path: base(orgId, userId) });
      return unwrapData<TwoFactorStatus>(res.body);
    },
    async disable(orgId, userId) {
      await transport.request({ method: 'POST', path: `${base(orgId, userId)}/disable` });
    },
    async reset(orgId, userId) {
      await transport.request({ method: 'POST', path: `${base(orgId, userId)}/reset` });
    },
  };
}
