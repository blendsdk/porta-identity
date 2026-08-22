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
import { exportData, ExportOperationError } from '../lib/data-export.js';
import type { ExportEntityType } from '../lib/data-export.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const exportEntitySchema = z.enum(['users', 'organizations', 'clients', 'roles', 'audit']);

const exportQuerySchema = z
  .object({
    format: z.enum(['json', 'csv']).default('json'),
    organizationId: z.string().uuid().optional(),
    applicationId: z.string().uuid().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  })
  .strict();

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
  router.get('/:entityType', requirePermission(ADMIN_PERMISSIONS.EXPORT_READ), async (ctx) => {
    const entityResult = exportEntitySchema.safeParse(ctx.params.entityType);
    if (!entityResult.success) {
      ctx.status = 400;
      ctx.body = { error: 'Export request is invalid', code: 'export_entity_invalid' };
      return;
    }
    const entityType: ExportEntityType = entityResult.data;
    const permission = ENTITY_PERMISSIONS[entityType];

    const permMiddleware = requirePermission(permission);
    await permMiddleware(ctx, async () => {
      try {
        const query = exportQuerySchema.parse(ctx.query);
        const result = await exportData({
          entityType,
          format: query.format,
          organizationId: query.organizationId,
          applicationId: query.applicationId,
          startDate: query.startDate ? new Date(query.startDate) : undefined,
          endDate: query.endDate ? new Date(query.endDate) : undefined,
          actorId: ctx.state.adminUser?.id,
        });

        ctx.set('Content-Disposition', `attachment; filename="${result.filename}"`);
        ctx.type = result.contentType;
        ctx.body = result.data;
      } catch (error) {
        if (error instanceof z.ZodError) {
          ctx.status = 400;
          ctx.body = { error: 'Export request is invalid', code: 'export_request_invalid' };
          return;
        }
        if (error instanceof ExportOperationError) {
          ctx.status = error.status;
          ctx.body = { error: 'Export request could not be completed', code: error.code };
          return;
        }
        ctx.status = 503;
        ctx.body = { error: 'Export request could not be completed', code: 'export_failed' };
      }
    });
  });

  return router;
}
