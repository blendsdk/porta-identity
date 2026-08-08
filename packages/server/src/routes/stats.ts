/**
 * Dashboard statistics API routes.
 *
 * Provides system-wide and per-organization statistics for the admin
 * dashboard. All responses include Cache-Control headers for client-side
 * caching (60s).
 *
 * Route structure:
 *   GET /api/admin/stats/overview              — System-wide statistics
 *   GET /api/admin/stats/organization/:orgId   — Per-organization statistics
 *
 * Both endpoints require `stats:read` permission.
 *
 * @see 05-dashboard-sessions-history.md
 */

import Router from '@koa/router';
import { z } from 'zod';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import * as statsService from '../lib/stats.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/** Schema for org stats path parameter */
const orgIdParamSchema = z.object({
  orgId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create the dashboard statistics router.
 *
 * All routes require admin authentication (Bearer JWT) and `stats:read`
 * permission. Responses are cacheable for 60 seconds.
 *
 * Prefix: /api/admin/stats
 *
 * @returns Configured Koa Router
 */
export function createStatsRouter(): Router {
  const router = new Router({ prefix: '/api/admin/stats' });

  // All routes require admin authentication
  router.use(requireAdminAuth());

  // -------------------------------------------------------------------------
  // GET /overview — System-wide statistics
  // -------------------------------------------------------------------------
  router.get('/overview', requirePermission(ADMIN_PERMISSIONS.STATS_READ), async (ctx) => {
    const stats = await statsService.getStatsOverview();
    ctx.set('Cache-Control', 'private, max-age=60');
    ctx.body = { data: stats };
  });

  // -------------------------------------------------------------------------
  // GET /organization/:orgId — Per-organization statistics
  // -------------------------------------------------------------------------
  router.get('/organization/:orgId', requirePermission(ADMIN_PERMISSIONS.STATS_READ), async (ctx) => {
    const { orgId } = orgIdParamSchema.parse(ctx.params);
    const stats = await statsService.getOrgStats(orgId);
    ctx.set('Cache-Control', 'private, max-age=60');
    ctx.body = { data: stats };
  });

  return router;
}
