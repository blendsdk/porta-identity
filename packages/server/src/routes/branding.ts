/**
 * Branding assets API routes.
 *
 * Manages organization logo and favicon image uploads. Images are transported
 * as bounded base64 JSON and stored as validated PostgreSQL binary data.
 *
 * Route structure:
 *   GET    /api/admin/organizations/:orgId/branding         — List assets
 *   GET    /api/admin/organizations/:orgId/branding/:type   — Get asset (binary)
 *   PUT    /api/admin/organizations/:orgId/branding/:type   — Upload asset
 *   DELETE /api/admin/organizations/:orgId/branding/:type   — Delete asset
 *
 */

import Router from '@koa/router';
import { z } from 'zod';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import * as brandingAssets from '../lib/branding-assets.js';
import type { AssetType } from '../lib/branding-assets.js';

const brandingUploadSchema = z
  .object({
    data: z.base64().min(1),
    contentType: z.enum([
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/x-icon',
      'image/vnd.microsoft.icon',
      'image/svg+xml',
    ]),
  })
  .strict();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return whether a route value names one supported branding slot. */
function validateAssetType(type: string): type is AssetType {
  return type === 'logo' || type === 'favicon';
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/** Create the authenticated Admin API router for organization branding assets. */
export function createBrandingRouter(): Router {
  const router = new Router({ prefix: '/api/admin/organizations/:orgId/branding' });

  router.use(requireAdminAuth());

  // -------------------------------------------------------------------------
  // GET / — List branding assets (metadata only)
  // -------------------------------------------------------------------------
  router.get('/', requirePermission(ADMIN_PERMISSIONS.ORG_READ), async (ctx) => {
    const assets = await brandingAssets.listAssets(ctx.params.orgId);
    ctx.body = { data: assets };
  });

  // -------------------------------------------------------------------------
  // GET /:type — Get branding asset (serves binary image)
  // -------------------------------------------------------------------------
  router.get('/:type', requirePermission(ADMIN_PERMISSIONS.ORG_READ), async (ctx) => {
    const { type } = ctx.params;
    if (!validateAssetType(type)) {
      ctx.throw(400, 'Invalid asset type. Must be "logo" or "favicon"');
      return;
    }

    const asset = await brandingAssets.getAsset(ctx.params.orgId, type);
    if (!asset) {
      ctx.throw(404, `No ${type} asset found`);
      return;
    }

    ctx.type = asset.contentType;
    ctx.set('Cache-Control', 'public, max-age=3600');
    ctx.body = asset.data;
  });

  // -------------------------------------------------------------------------
  // PUT /:type — Upload/replace branding asset
  //
  // Accepts one JSON/base64 envelope:
  //   { "data": "<base64>", "contentType": "image/png" }
  // -------------------------------------------------------------------------
  router.put('/:type', requirePermission(ADMIN_PERMISSIONS.ORG_UPDATE), async (ctx) => {
    const { type } = ctx.params;
    if (!validateAssetType(type)) {
      ctx.throw(400, 'Invalid asset type. Must be "logo" or "favicon"');
      return;
    }

    const parsed = brandingUploadSchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.throw(400, 'Branding upload is invalid');
      return;
    }

    try {
      const decoded = Buffer.from(parsed.data.data, 'base64');
      const asset = await brandingAssets.uploadAsset(
        ctx.params.orgId,
        type,
        parsed.data.contentType,
        decoded,
      );
      ctx.body = { data: asset };
    } catch {
      ctx.throw(400, 'Branding upload is invalid');
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /:type — Delete branding asset
  // -------------------------------------------------------------------------
  router.delete('/:type', requirePermission(ADMIN_PERMISSIONS.ORG_UPDATE), async (ctx) => {
    const { type } = ctx.params;
    if (!validateAssetType(type)) {
      ctx.throw(400, 'Invalid asset type. Must be "logo" or "favicon"');
      return;
    }

    const deleted = await brandingAssets.deleteAsset(ctx.params.orgId, type);
    if (!deleted) {
      ctx.throw(404, `No ${type} asset found`);
      return;
    }

    ctx.status = 204;
  });

  return router;
}
