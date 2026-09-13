/**
 * Data export API routes.
 *
 * Provides admin endpoints for exporting entity data in CSV or JSON format.
 * Exports exclude sensitive data (passwords, secrets, keys).
 *
 * Route structure:
 *   POST /api/admin/export/manifest    — Export a selective portability manifest
 *   GET  /api/admin/export/:entityType — Export legacy report data
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

import Router, { type RouterContext } from '@koa/router';
import { z } from 'zod';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import { exportData, ExportOperationError } from '../lib/data-export.js';
import type { ExportEntityType } from '../lib/data-export.js';
import { logger } from '../lib/logger.js';
import {
  exportManifestRequestSchema,
  PortabilityError,
  requirePortabilityAuthorization,
  type ExportManifestRequest,
  type PortabilityActor,
} from '../portability/index.js';
import { exportPortabilityManifest } from '../portability/export.js';

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

  router.use(async (ctx, next) => {
    ctx.set('Cache-Control', 'no-store');
    await next();
  });
  router.use(requireAdminAuth());

  router.post('/manifest', requirePermission(ADMIN_PERMISSIONS.EXPORT_READ), async (ctx) => {
    const parsed = exportManifestRequestSchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid export request', code: 'export_request_invalid' };
      return;
    }

    await requirePortabilityAuthorization('export', () => parsed.data.categories)(ctx, async () => {
      await handleManifestExport(ctx, parsed.data);
    });
  });

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

/** Export a validated manifest and map only fixed safe failures to HTTP. */
async function handleManifestExport(
  ctx: RouterContext,
  request: ExportManifestRequest,
): Promise<void> {
  try {
    const actor = portabilityActor(ctx);
    const result = await exportPortabilityManifest(request, actor);
    ctx.set('Content-Disposition', `attachment; filename="${result.filename}"`);
    ctx.type = 'application/json; charset=utf-8';
    ctx.body = result.manifest;
  } catch (error) {
    if (error instanceof PortabilityError) {
      if (error.code === 'export_manifest_too_large') {
        ctx.status = 413;
        ctx.body = { error: 'Export manifest is too large', code: error.code };
        return;
      }
      if (error.code === 'export_scope_rejected') {
        ctx.status = 409;
        ctx.body = { error: 'Export scope rejected', code: error.code };
        return;
      }
    }
    const requestId = ctx.state.requestId;
    logger.error(
      { operation: 'export', code: 'export_failed', request_id: requestId },
      'Portability export failed',
    );
    ctx.status = 503;
    ctx.body = { error: 'Export failed', code: 'export_failed', request_id: requestId };
  }
}

/** Build the audit actor from the authenticated Admin identity. */
function portabilityActor(ctx: RouterContext): PortabilityActor {
  const adminUser = ctx.state.adminUser;
  if (!adminUser) throw new Error('Admin identity is unavailable');
  return {
    userId: adminUser.id,
    controlPlaneOrganizationId: adminUser.organizationId,
  };
}
