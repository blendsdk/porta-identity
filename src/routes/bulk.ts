/**
 * Bulk operations API routes.
 *
 * Provides endpoints for performing bulk status changes on organizations
 * and users. Designed for admin UI batch operations.
 *
 * Route structure:
 *   POST /api/admin/bulk/organizations/status — Bulk org status change
 *   POST /api/admin/bulk/users/status         — Bulk user status change
 *
 * @see 06-bulk-operations-branding.md
 */

import Router from '@koa/router';
import { z } from 'zod';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import { bulkStatusChange } from '../lib/bulk-operations.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const bulkOrgStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(['activate', 'suspend', 'archive']),
  reason: z.string().max(500).optional(),
});

const bulkUserStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(['activate', 'deactivate', 'suspend', 'lock', 'unlock']),
  reason: z.string().max(500).optional(),
  organizationId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createBulkRouter(): Router {
  const router = new Router({ prefix: '/api/admin/bulk' });

  router.use(requireAdminAuth());

  // -------------------------------------------------------------------------
  // POST /organizations/status — Bulk organization status change
  // -------------------------------------------------------------------------
  router.post('/organizations/status', requirePermission(ADMIN_PERMISSIONS.ORG_UPDATE), async (ctx) => {
    const body = bulkOrgStatusSchema.parse(ctx.request.body);
    const result = await bulkStatusChange({
      entityType: 'organization',
      entityIds: body.ids,
      action: body.action,
      reason: body.reason,
    });
    ctx.body = result;
  });

  // -------------------------------------------------------------------------
  // POST /users/status — Bulk user status change
  // -------------------------------------------------------------------------
  router.post('/users/status', requirePermission(ADMIN_PERMISSIONS.USER_SUSPEND), async (ctx) => {
    const body = bulkUserStatusSchema.parse(ctx.request.body);
    const result = await bulkStatusChange({
      entityType: 'user',
      entityIds: body.ids,
      action: body.action,
      reason: body.reason,
      organizationId: body.organizationId,
    });
    ctx.body = result;
  });

  return router;
}
