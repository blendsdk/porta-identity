/**
 * Data export API routes.
 *
 * Provides admin endpoints for exporting entity data in CSV or JSON format.
 * Exports exclude sensitive data (passwords, secrets, keys).
 *
 * Route structure:
 *   GET /api/admin/export/:entityType  — Export entity data
 *
 * Query parameters:
 *   format: 'json' | 'csv' (default: json)
 *   organizationId: UUID (required for users, clients, audit)
 *   applicationId: UUID (required for roles)
 *   startDate: ISO date (audit only)
 *   endDate: ISO date (audit only)
 *
 * @see 07-import-export-invitations.md
 */

import Router from '@koa/router';
import { z } from 'zod';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import { exportData } from '../lib/data-export.js';
import type { ExportEntityType, ExportFormat } from '../lib/data-export.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const exportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  organizationId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const ENTITY_PERMISSIONS: Record<string, string> = {
  users: ADMIN_PERMISSIONS.USER_READ,
  organizations: ADMIN_PERMISSIONS.ORG_READ,
  clients: ADMIN_PERMISSIONS.CLIENT_READ,
  roles: ADMIN_PERMISSIONS.ROLE_READ,
  audit: ADMIN_PERMISSIONS.AUDIT_READ,
};

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createExportRouter(): Router {
  const router = new Router({ prefix: '/api/admin/export' });

  router.use(requireAdminAuth());

  // -------------------------------------------------------------------------
  // GET /:entityType — Export data
  // -------------------------------------------------------------------------
  router.get('/:entityType', async (ctx, next) => {
    const entityType = ctx.params.entityType as ExportEntityType;
    const permission = ENTITY_PERMISSIONS[entityType];
    if (!permission) {
      ctx.throw(400, `Unsupported entity type: ${entityType}`);
      return;
    }

    // Check permission dynamically based on entity type
    const permMiddleware = requirePermission(permission);
    await permMiddleware(ctx, async () => {
      const query = exportQuerySchema.parse(ctx.query);

      try {
        const result = await exportData({
          entityType,
          format: query.format as ExportFormat,
          organizationId: query.organizationId,
          applicationId: query.applicationId,
          startDate: query.startDate ? new Date(query.startDate) : undefined,
          endDate: query.endDate ? new Date(query.endDate) : undefined,
        });

        ctx.set('Content-Disposition', `attachment; filename="${result.filename}"`);
        ctx.type = result.contentType;
        ctx.body = result.data;
      } catch (err) {
        ctx.throw(400, err instanceof Error ? err.message : 'Export failed');
      }
    });
    await next();
  });

  return router;
}
