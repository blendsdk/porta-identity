/**
 * Stats domain — dashboard statistics.
 *
 * @module domains/stats
 */

import type { HttpTransport } from '../transport/types.js';
import type { DashboardStats, OrgStats } from '../types/index.js';
import { unwrapData } from './helpers.js';

export interface StatsDomain {
  /** System-wide dashboard statistics — GET /stats/overview. */
  get(): Promise<DashboardStats>;
  /** Per-organization dashboard statistics — GET /stats/organization/:orgId. */
  getOrganizationStats(orgId: string): Promise<OrgStats>;
}

export function createStatsDomain(transport: HttpTransport): StatsDomain {
  return {
    async get() {
      // Source: src/routes/stats.ts — GET /stats/overview, { data }-wrapped.
      const res = await transport.request({ method: 'GET', path: '/stats/overview' });
      return unwrapData<DashboardStats>(res.body);
    },

    async getOrganizationStats(orgId) {
      // Source: src/routes/stats.ts — GET /stats/organization/:orgId, { data }-wrapped.
      const res = await transport.request({ method: 'GET', path: `/stats/organization/${orgId}` });
      return unwrapData<OrgStats>(res.body);
    },
  };
}
