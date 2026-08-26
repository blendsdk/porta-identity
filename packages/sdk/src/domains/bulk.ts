/**
 * Bulk domain — bulk status operations.
 *
 * Server exposes two separate endpoints:
 *   POST /api/admin/bulk/organizations/status
 *   POST /api/admin/bulk/users/status
 *
 * @module domains/bulk
 */

import type { HttpTransport } from '../transport/types.js';
import type {
  BulkOrgStatusInput,
  BulkUserStatusInput,
  BulkOperationResult,
} from '../types/index.js';

export interface BulkDomain {
  /** Bulk status change for organizations */
  organizationStatus(input: BulkOrgStatusInput): Promise<BulkOperationResult>;
  /** Bulk status change for users */
  userStatus(input: BulkUserStatusInput): Promise<BulkOperationResult>;
}

export function createBulkDomain(transport: HttpTransport): BulkDomain {
  return {
    async organizationStatus(input) {
      const res = await transport.request({
        method: 'POST',
        path: '/bulk/organizations/status',
        body: input,
      });
      return res.body as BulkOperationResult;
    },

    async userStatus(input) {
      const res = await transport.request({
        method: 'POST',
        path: '/bulk/users/status',
        body: input,
      });
      return res.body as BulkOperationResult;
    },
  };
}
