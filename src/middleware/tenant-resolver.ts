/**
 * Multi-tenant resolver middleware.
 *
 * Extracts the organization slug from the URL path, validates that the
 * organization exists and is active in the database, and sets tenant
 * context on ctx.state for downstream middleware and the OIDC provider.
 *
 * This middleware is applied to routes under /:orgSlug/* — it does NOT
 * apply to root-level routes like /health.
 *
 * Sets on ctx.state:
 *   organization — { id, slug, name, status }
 *   issuer       — Full issuer URL for this organization
 *
 * Returns 404 if the organization is not found or not active.
 */

import type { Middleware } from 'koa';
import { getPool } from '../lib/database.js';
import { config } from '../config/index.js';

/** Organization data set on ctx.state by the tenant resolver */
export interface TenantOrganization {
  id: string;
  slug: string;
  name: string;
  status: string;
}

/**
 * Create the tenant resolver middleware.
 *
 * Expects the route to have an `:orgSlug` parameter (e.g., `/:orgSlug/*`).
 * Looks up the organization by slug and validates it's active.
 *
 * @returns Koa middleware function
 */
export function tenantResolver(): Middleware {
  return async (ctx, next) => {
    const orgSlug = ctx.params?.orgSlug;

    if (!orgSlug) {
      ctx.throw(404, 'Organization not found');
    }

    // Look up organization by slug in the database
    const pool = getPool();
    const result = await pool.query<{
      id: string;
      slug: string;
      name: string;
      status: string;
    }>(
      `SELECT id, slug, name, status FROM organizations
       WHERE slug = $1 AND status = 'active'
       LIMIT 1`,
      [orgSlug],
    );

    if (result.rows.length === 0) {
      ctx.throw(404, 'Organization not found');
    }

    const org = result.rows[0];

    // Set tenant context for downstream middleware and OIDC provider
    ctx.state.organization = org;
    ctx.state.issuer = `${config.issuerBaseUrl}/${org.slug}`;

    await next();
  };
}
