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
import { importData, importManifestSchema } from '../lib/data-import.js';
import type { ImportMode } from '../lib/data-import.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const importRequestSchema = z.object({
  mode: z.enum(['merge', 'overwrite', 'dry-run']).default('dry-run'),
  manifest: importManifestSchema,
});

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

      const result = await importData(
        body.manifest,
        body.mode as ImportMode,
        actorId,
      );

      ctx.body = result;
    } catch (err) {
      if (err instanceof z.ZodError) {
        ctx.throw(400, `Invalid import manifest: ${err.issues.map((e: z.ZodIssue) => e.message).join(', ')}`);
      }
      if (err instanceof Error && err.message.includes('Unsupported manifest version')) {
        ctx.throw(400, err.message);
      }
      ctx.throw(500, err instanceof Error ? err.message : 'Import failed');
    }
  });

  return router;
}
