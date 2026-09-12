/**
 * Public organization branding image delivery.
 *
 * Authentication pages reference this route for uploaded logos and favicons. The route resolves
 * the organization directly because suspended organizations must retain their branding while
 * administrators repair or reactivate them.
 */

import Router from '@koa/router';
import { getAsset, type AssetType } from '../lib/branding-assets.js';
import { setETagHeader } from '../lib/etag.js';
import { findOrganizationBySlug } from '../organizations/repository.js';

/** Restrictive policy used when an SVG is opened as a document instead of rendered as an image. */
const SVG_CONTENT_SECURITY_POLICY =
  "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:";

/** Return whether a route value identifies a supported public branding slot. */
function isAssetType(value: string): value is AssetType {
  return value === 'logo' || value === 'favicon';
}

/**
 * Create the anonymous router that serves one exact organization branding asset.
 *
 * Missing organizations, unsupported slots, and empty slots intentionally use one response so
 * callers cannot distinguish tenant existence from asset configuration.
 */
export function createPublicBrandingRouter(): Router {
  const router = new Router({ prefix: '/:orgSlug/branding' });

  router.get('/:type', async (ctx) => {
    const { orgSlug, type } = ctx.params;
    if (!isAssetType(type)) {
      ctx.throw(404);
      return;
    }

    const organization = await findOrganizationBySlug(orgSlug);
    if (organization === null) {
      ctx.throw(404);
      return;
    }

    const asset = await getAsset(organization.id, type);
    if (asset === null) {
      ctx.throw(404);
      return;
    }

    ctx.type = asset.contentType;
    ctx.set('Cache-Control', 'public, no-cache');
    setETagHeader(ctx, 'branding-asset', asset.id, asset.updatedAt);
    if (asset.contentType === 'image/svg+xml') {
      ctx.set('Content-Security-Policy', SVG_CONTENT_SECURITY_POLICY);
    }
    ctx.body = asset.data;
  });

  return router;
}
