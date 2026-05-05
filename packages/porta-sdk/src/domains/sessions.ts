/**
 * Sessions domain — session management and revocation.
 *
 * Note: revokeForUser maps to DELETE /users/:userId/sessions (standalone router).
 *
 * @module domains/sessions
 */

import type { HttpTransport } from '../transport/types.js';
import type { AdminSession, SessionListParams, PaginatedResponse } from '../types/index.js';
import { listAll } from '../pagination/index.js';
import { toQueryParams } from './helpers.js';

export interface SessionsDomain {
  list(params?: SessionListParams): Promise<PaginatedResponse<AdminSession>>;
  listAll(params?: Omit<SessionListParams, 'page'>): Promise<AdminSession[]>;
  revoke(sessionId: string): Promise<void>;
  revokeForUser(userId: string): Promise<void>;
}

export function createSessionsDomain(transport: HttpTransport): SessionsDomain {
  return {
    async list(params?) {
      const res = await transport.request({ method: 'GET', path: '/sessions', params: toQueryParams(params) });
      return res.body as PaginatedResponse<AdminSession>;
    },
    listAll(params?) {
      return listAll((p) => this.list({ ...params, ...p }), params);
    },
    async revoke(sessionId) {
      await transport.request({ method: 'DELETE', path: `/sessions/${sessionId}` });
    },
    async revokeForUser(userId) {
      // Special path: not under /sessions/ but /users/:userId/sessions
      await transport.request({ method: 'DELETE', path: `/users/${userId}/sessions` });
    },
  };
}
