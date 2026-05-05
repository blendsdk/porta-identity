/**
 * Stats domain — dashboard statistics.
 *
 * @module domains/stats
 */

import type { HttpTransport } from '../transport/types.js';
import type { DashboardStats } from '../types/index.js';

export interface StatsDomain {
  get(): Promise<DashboardStats>;
}

export function createStatsDomain(transport: HttpTransport): StatsDomain {
  return {
    async get() {
      const res = await transport.request({ method: 'GET', path: '/stats' });
      return res.body as DashboardStats;
    },
  };
}
