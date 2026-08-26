/**
 * Audit domain — audit log viewing.
 *
 * @module domains/audit
 */

import type { HttpTransport } from '../transport/types.js';
import type { AuditEntry, AuditListParams, PaginatedResponse } from '../types/index.js';
import { listAll } from '../pagination/index.js';
import { toQueryParams } from './helpers.js';

export interface AuditDomain {
  list(params?: AuditListParams): Promise<PaginatedResponse<AuditEntry>>;
  listAll(params?: Omit<AuditListParams, 'page' | 'cursor'>): Promise<AuditEntry[]>;
}

export function createAuditDomain(transport: HttpTransport): AuditDomain {
  return {
    async list(params?) {
      const res = await transport.request({ method: 'GET', path: '/audit', params: toQueryParams(params) });
      return res.body as PaginatedResponse<AuditEntry>;
    },
    listAll(params?) {
      return listAll((p) => this.list({ ...params, ...p }), params);
    },
  };
}
