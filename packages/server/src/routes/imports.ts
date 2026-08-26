/**
 * Data import API routes.
 *
 * Provides admin endpoint for importing configuration from a JSON manifest.
 * Supports three modes: merge (skip existing), overwrite, and dry-run.
 *
 * Route structure:
 *   POST /api/admin/import  — Import configuration manifest
 *
 * @see 07-import-export-invitation.md
 */

import Router from '@koa/router';
import { z } from 'zod';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import { importData, importManifestSchema, ImportOperationError } from '../lib/data-import.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const importRequestSchema = z
  .object({
    mode: z.enum(['merge', 'overwrite', 'dry-run']).default('dry-run'),
    organizationId: z.string().uuid().optional(),
    manifest: importManifestSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create the import router for configuration import.
 * @returns Configured Koa router
 */
export function createImportRouter(): Router {
  const router = new Router({ prefix: '/api/admin/import' });

  router.use(requireAdminAuth());

  // -------------------------------------------------------------------------
  // POST / — Import configuration
  // -------------------------------------------------------------------------
  router.post('/', requirePermission(ADMIN_PERMISSIONS.IMPORT_WRITE), async (ctx) => {
    try {
      const body = importRequestSchema.parse(ctx.request.body);
      const actorId = ctx.state.adminUser?.id;

      const result = await importData(body.manifest, body.mode, actorId, body.organizationId);

      ctx.body = result;
    } catch (err) {
      if (err instanceof z.ZodError) {
        ctx.status = 400;
        ctx.body = { error: 'Import manifest is invalid', code: 'import_manifest_invalid' };
        return;
      }
      if (err instanceof ImportOperationError) {
        ctx.status = err.status;
        ctx.body = {
          error: 'Import request could not be completed',
          code: err.code,
          correlationId: err.correlationId,
        };
        return;
      }
      ctx.status = 503;
      ctx.body = {
        error: 'Import request could not be completed',
        code: 'import_execution_failed',
      };
    }
  });

  return router;
}
