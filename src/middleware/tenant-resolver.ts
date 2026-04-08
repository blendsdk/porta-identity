/**
 * Multi-tenant resolver middleware.
 *
 * Extracts the organization slug from the URL path, resolves the
 * organization using Redis cache (with DB fallback), validates the
 * organization status, and sets tenant context on ctx.state.
 *
 * This middleware is applied to routes under /:orgSlug/* — it does NOT
 * apply to root-level routes like /health.
 *
 * Resolution flow:
 *   1. Extract orgSlug from route params
 *   2. Check Redis cache: getCachedOrganizationBySlug(orgSlug)
 *   3. If cache miss, query DB: findOrganizationBySlug(orgSlug)
 *   4. If found from DB, cache it: cacheOrganization(org)
 *   5. Validate status:
 *      - archived → 404 "Organization not found"
 *      - suspended → 403 "Organization is suspended"
 *      - active → continue
 *   6. Set ctx.state.organization (full Organization object)
 *   7. Set ctx.state.issuer
 *
 * Returns:
 *   - 404 if organization not found or archived
 *   - 403 if organization is suspended
 */

import type { Middleware } from 'koa';
import { config } from '../config/index.js';
import {
  getCachedOrganizationBySlug,
  cacheOrganization,
} from '../organizations/cache.js';
import { findOrganizationBySlug } from '../organizations/repository.js';
import type { Organization } from '../organizations/types.js';

/**
 * Create the tenant resolver middleware.
 *
 * Expects the route to have an `:orgSlug` parameter (e.g., `/:orgSlug/*`).
 * Resolves the organization via cache-first strategy and validates status.
 *
 * @returns Koa middleware function
 */
export function tenantResolver(): Middleware {
  return async (ctx, next) => {
    const orgSlug = ctx.params?.orgSlug;

    if (!orgSlug) {
      ctx.throw(404, 'Organization not found');
    }

    // 1. Try Redis cache first
    let org: Organization | null = await getCachedOrganizationBySlug(orgSlug);

    // 2. Cache miss → query database (returns all statuses)
    if (!org) {
      org = await findOrganizationBySlug(orgSlug);

      // 3. Cache the result for subsequent requests
      if (org) {
        await cacheOrganization(org);
      }
    }

    // 4. Not found at all
    if (!org) {
      return ctx.throw(404, 'Organization not found');
    }

    // 5. Status-dependent responses
    if (org.status === 'archived') {
      return ctx.throw(404, 'Organization not found');
    }

    if (org.status === 'suspended') {
      return ctx.throw(403, 'Organization is suspended');
    }

    // 6. Set tenant context for downstream middleware and OIDC provider
    ctx.state.organization = org;
    ctx.state.issuer = `${config.issuerBaseUrl}/${org.slug}`;

    await next();
  };
}
