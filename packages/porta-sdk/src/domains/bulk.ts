/**
 * Bulk domain — bulk status operations.
 *
 * @module domains/bulk
 */

import type { HttpTransport } from '../transport/types.js';
import type { BulkOperationInput, BulkOperationResult } from '../types/index.js';

export interface BulkDomain {
  execute(input: BulkOperationInput): Promise<BulkOperationResult>;
}

export function createBulkDomain(transport: HttpTransport): BulkDomain {
  return {
    async execute(input) {
      const res = await transport.request({ method: 'POST', path: '/bulk', body: input });
      return res.body as BulkOperationResult;
    },
  };
}
