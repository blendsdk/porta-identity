/**
 * Branding assets API routes.
 *
 * Manages organization logo and favicon image uploads. Images are stored
 * as PostgreSQL bytea for simplicity (images are small, <512KB).
 *
 * Route structure:
 *   GET    /api/admin/organizations/:orgId/branding         — List assets
 *   GET    /api/admin/organizations/:orgId/branding/:type   — Get asset (binary)
 *   PUT    /api/admin/organizations/:orgId/branding/:type   — Upload asset
 *   DELETE /api/admin/organizations/:orgId/branding/:type   — Delete asset
 *
 * @see 06-bulk-operations-branding.md
 */

import Router from '@koa/router';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import * as brandingAssets from '../lib/branding-assets.js';
import type { AssetType } from '../lib/branding-assets.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateAssetType(type: string): type is AssetType {
  return type === 'logo' || type === 'favicon';
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

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
  // Expects raw binary body with appropriate Content-Type header.
  // For JSON-based uploads, accepts base64-encoded body:
  //   { "data": "<base64>", "contentType": "image/png" }
  // -------------------------------------------------------------------------
  router.put('/:type', requirePermission(ADMIN_PERMISSIONS.ORG_UPDATE), async (ctx) => {
    const { type } = ctx.params;
    if (!validateAssetType(type)) {
      ctx.throw(400, 'Invalid asset type. Must be "logo" or "favicon"');
      return;
    }

    // Support JSON-encoded base64 uploads for admin UI convenience
    const body = ctx.request.body as Record<string, unknown> | undefined;
    if (body && typeof body.data === 'string' && typeof body.contentType === 'string') {
      try {
        const buffer = Buffer.from(body.data, 'base64');
        const asset = await brandingAssets.uploadAsset(
          ctx.params.orgId,
          type,
          body.contentType,
          buffer,
        );
        ctx.body = { data: asset };
        return;
      } catch (err) {
        ctx.throw(400, err instanceof Error ? err.message : 'Upload failed');
        return;
      }
    }

    ctx.throw(400, 'Request body must include "data" (base64) and "contentType" fields');
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
