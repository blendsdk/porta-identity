/**
 * Two-Factor domain — admin 2FA status and management.
 *
 * Maps to the server `two-factor-admin` routers:
 *   - User-level:  /api/admin/organizations/:orgId/users/:userId/two-factor
 *   - Org-level:   /api/admin/organizations/:orgId/two-factor
 *
 * @module domains/two-factor
 */

import type { HttpTransport } from '../transport/types.js';
import type {
  TwoFactorStatus,
  TwoFactorPolicy,
  TwoFactorPolicyResult,
  TwoFactorSummary,
  RegenerateRecoveryCodesResult,
} from '../types/index.js';
import { unwrapData } from './helpers.js';

export interface TwoFactorDomain {
  /** Get a user's 2FA status — GET .../users/:userId/two-factor/status */
  getStatus(orgId: string, userId: string): Promise<TwoFactorStatus>;
  /** Disable 2FA for a user — POST .../users/:userId/two-factor/disable */
  disable(orgId: string, userId: string): Promise<void>;
  /** Reset 2FA for a user (force re-enrollment) — POST .../two-factor/reset */
  reset(orgId: string, userId: string): Promise<void>;
  /** Regenerate a user's recovery codes — POST .../two-factor/recovery-codes/regenerate */
  regenerateRecoveryCodes(orgId: string, userId: string): Promise<RegenerateRecoveryCodesResult>;
  /** Get the org 2FA policy — GET .../organizations/:orgId/two-factor/policy */
  getPolicy(orgId: string): Promise<TwoFactorPolicyResult>;
  /** Set the org 2FA policy — PUT .../organizations/:orgId/two-factor/policy */
  setPolicy(orgId: string, policy: TwoFactorPolicy): Promise<TwoFactorPolicyResult>;
  /** Get the org 2FA enrollment summary — GET .../organizations/:orgId/two-factor/summary */
  getSummary(orgId: string): Promise<TwoFactorSummary>;
}

export function createTwoFactorDomain(transport: HttpTransport): TwoFactorDomain {
  function userBase(orgId: string, userId: string) {
    return `/organizations/${orgId}/users/${userId}/two-factor`;
  }
  function orgBase(orgId: string) {
    return `/organizations/${orgId}/two-factor`;
  }

  return {
    async getStatus(orgId, userId) {
      const res = await transport.request({ method: 'GET', path: `${userBase(orgId, userId)}/status` });
      return unwrapData<TwoFactorStatus>(res.body);
    },

    async disable(orgId, userId) {
      await transport.request({ method: 'POST', path: `${userBase(orgId, userId)}/disable` });
    },

    async reset(orgId, userId) {
      await transport.request({ method: 'POST', path: `${userBase(orgId, userId)}/reset` });
    },

    async regenerateRecoveryCodes(orgId, userId) {
      const res = await transport.request({
        method: 'POST', path: `${userBase(orgId, userId)}/recovery-codes/regenerate`,
      });
      return unwrapData<RegenerateRecoveryCodesResult>(res.body);
    },

    async getPolicy(orgId) {
      const res = await transport.request({ method: 'GET', path: `${orgBase(orgId)}/policy` });
      return unwrapData<TwoFactorPolicyResult>(res.body);
    },

    async setPolicy(orgId, policy) {
      const res = await transport.request({
        method: 'PUT', path: `${orgBase(orgId)}/policy`, body: { twoFactorPolicy: policy },
      });
      return unwrapData<TwoFactorPolicyResult>(res.body);
    },

    async getSummary(orgId) {
      const res = await transport.request({ method: 'GET', path: `${orgBase(orgId)}/summary` });
      return unwrapData<TwoFactorSummary>(res.body);
    },
  };
}
