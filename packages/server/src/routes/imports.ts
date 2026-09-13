/**
 * Data import API routes.
 *
 * Provides the Admin endpoint for previewing or atomically applying a strict portability manifest.
 * Supports dry-run, keep-existing, and update-existing behavior.
 *
 * Route structure:
 *   POST /api/admin/import  — Import configuration manifest
 *
 * @see 07-import-export-invitation.md
 */

import Router, { type RouterContext } from '@koa/router';
import bodyParser from 'koa-bodyparser';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import { logger } from '../lib/logger.js';
import { applyPortabilityManifest } from '../portability/apply.js';
import {
  importManifestRequestSchema,
  PortabilityError,
  requirePortabilityAuthorization,
  type ImportManifestRequest,
  type PortabilityActor,
} from '../portability/index.js';
import { buildPortabilityPlan } from '../portability/plan.js';

/** Route-owned JSON parser used only after authentication and the base import permission. */
const importManifestBodyParser = bodyParser({
  enableTypes: ['json'],
  jsonLimit: '64mb',
});

/** Return the public status carried by a body-parser error, when present. */
function bodyParserStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = Reflect.get(error, 'status');
  return typeof status === 'number' ? status : undefined;
}

/** Parse one protected manifest body and map parser failures to fixed safe responses. */
async function parseImportManifestBody(
  ctx: RouterContext,
  next: () => Promise<unknown>,
): Promise<void> {
  try {
    await importManifestBodyParser(ctx, next);
  } catch (error) {
    const status = bodyParserStatus(error);
    if (status === 413) {
      ctx.status = 413;
      ctx.body = { error: 'Import manifest is too large', code: 'import_manifest_too_large' };
      return;
    }
    if (status === 400) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid import manifest', code: 'import_manifest_invalid' };
      return;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create the import router for configuration import.
 * @returns Configured Koa router
 */
export function createImportRouter(): Router {
  const router = new Router({ sensitive: false, strict: false });

  // -------------------------------------------------------------------------
  // POST / — Import configuration
  // -------------------------------------------------------------------------
  router.post(
    '/api/admin/import',
    async (ctx, next) => {
      ctx.set('Cache-Control', 'no-store');
      await next();
    },
    requireAdminAuth(),
    requirePermission(ADMIN_PERMISSIONS.IMPORT_WRITE),
    parseImportManifestBody,
    async (ctx) => {
      const parsed = importManifestRequestSchema.safeParse(ctx.request.body);
      if (!parsed.success) {
        ctx.status = 400;
        ctx.body = { error: 'Invalid import manifest', code: 'import_manifest_invalid' };
        return;
      }

      await requirePortabilityAuthorization('import', () => parsed.data.manifest.categories)(
        ctx,
        async () => {
          await handleManifestImport(ctx, parsed.data);
        },
      );
    },
  );

  return router;
}

/** Preview or apply a validated manifest and expose only fixed safe failures. */
async function handleManifestImport(
  ctx: RouterContext,
  request: ImportManifestRequest,
): Promise<void> {
  try {
    ctx.body =
      request.mode === 'dry-run'
        ? await buildPortabilityPlan(request.manifest, request.mode)
        : await applyPortabilityManifest(request.manifest, request.mode, portabilityActor(ctx));
  } catch (error) {
    if (error instanceof PortabilityError && error.code === 'import_plan_rejected') {
      ctx.status = 409;
      ctx.body = {
        error: 'Import plan rejected',
        code: error.code,
        result: error.result,
      };
      return;
    }
    const requestId = ctx.state.requestId;
    logger.error(
      {
        operation: 'import',
        code: 'import_execution_failed',
        request_id: requestId,
        mode: request.mode,
      },
      'Portability import failed',
    );
    ctx.status = 503;
    ctx.body = { error: 'Import failed', code: 'import_execution_failed', request_id: requestId };
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
