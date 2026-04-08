# API Routes: Organization Management

> **Document**: 06-api-routes.md
> **Parent**: [Index](00-index.md)

## Overview

Implement Koa API routes for organization management, Zod input validation schemas,
super-admin authorization middleware, and the enhanced tenant resolver. These are
the HTTP-facing components that expose the organization service to API consumers.

## Architecture

### Module Structure

```
src/middleware/
├── super-admin.ts         — Super-admin authorization middleware
└── tenant-resolver.ts     — Enhanced with Redis cache + status differentiation

src/routes/
└── organizations.ts       — Organization management API routes

src/server.ts              — Mount organization routes
```

### Route Overview

All organization management routes are under `/api/admin/organizations` and
require the super-admin authorization middleware. The super-admin context is
established by the tenant resolver on a separate route prefix.

**Note:** Since these are admin-only routes, they require the calling user to
be authenticated within the super-admin organization. For RD-04, we implement
the route structure and super-admin org check. Full user authentication
middleware will be added in RD-07 (Auth Workflows).

### API Endpoints

| Method | Path                                     | Description                        |
|--------|------------------------------------------|------------------------------------|
| POST   | `/api/admin/organizations`               | Create a new organization          |
| GET    | `/api/admin/organizations`               | List organizations (paginated)     |
| GET    | `/api/admin/organizations/:id`           | Get organization by ID             |
| PUT    | `/api/admin/organizations/:id`           | Update organization                |
| PUT    | `/api/admin/organizations/:id/branding`  | Update branding                    |
| POST   | `/api/admin/organizations/:id/suspend`   | Suspend organization               |
| POST   | `/api/admin/organizations/:id/activate`  | Activate organization              |
| POST   | `/api/admin/organizations/:id/archive`   | Archive organization               |
| POST   | `/api/admin/organizations/:id/restore`   | Restore organization               |
| GET    | `/api/admin/organizations/validate-slug` | Validate slug availability         |

## Implementation Details

### Super-Admin Authorization Middleware (src/middleware/super-admin.ts)

```typescript
import type { Middleware } from 'koa';

/**
 * Middleware that requires the requesting organization to be the super-admin org.
 *
 * For RD-04, this checks ctx.state.organization.isSuperAdmin.
 * In future RDs, this will also check the authenticated user's permissions.
 *
 * Must be applied AFTER tenant resolver has set ctx.state.organization.
 *
 * @returns Koa middleware that rejects non-super-admin requests with 403
 */
export function requireSuperAdmin(): Middleware {
  return async (ctx, next) => {
    const org = ctx.state.organization;

    if (!org || !org.isSuperAdmin) {
      ctx.throw(403, 'Super-admin access required');
    }

    await next();
  };
}
```

### Enhanced Tenant Resolver (src/middleware/tenant-resolver.ts)

Update the existing middleware to:
1. Check Redis cache before querying the database
2. Return the full Organization object (not just 4 fields)
3. Differentiate suspended (403) vs archived (404)
4. Cache the organization in Redis on cache miss

The `TenantOrganization` interface will be replaced with the full `Organization` type
from `src/organizations/types.ts`.

```typescript
// Updated flow:
// 1. Extract orgSlug from route params
// 2. Check Redis cache: getCachedOrganizationBySlug(orgSlug)
// 3. If cache miss, query DB: findOrganizationBySlug(orgSlug) — ALL statuses
// 4. If found from DB, cache it: cacheOrganization(org)
// 5. Validate status:
//    - archived → 404 "Organization not found"
//    - suspended → 403 "Organization is suspended"
//    - active → continue
// 6. Set ctx.state.organization (full Organization object)
// 7. Set ctx.state.issuer
```

### Input Validation Schemas

Zod schemas for API request validation, defined in the routes file:

```typescript
import { z } from 'zod';

const createOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(3).max(100).optional(),
  defaultLocale: z.string().min(2).max(10).optional(),
  branding: z.object({
    logoUrl: z.string().url().nullable().optional(),
    faviconUrl: z.string().url().nullable().optional(),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
    companyName: z.string().max(255).nullable().optional(),
    customCss: z.string().max(10000).nullable().optional(),
  }).optional(),
});

const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  defaultLocale: z.string().min(2).max(10).optional(),
  branding: z.object({
    logoUrl: z.string().url().nullable().optional(),
    faviconUrl: z.string().url().nullable().optional(),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
    companyName: z.string().max(255).nullable().optional(),
    customCss: z.string().max(10000).nullable().optional(),
  }).optional(),
});

const updateBrandingSchema = z.object({
  logoUrl: z.string().url().nullable().optional(),
  faviconUrl: z.string().url().nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  companyName: z.string().max(255).nullable().optional(),
  customCss: z.string().max(10000).nullable().optional(),
});

const listOrganizationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'suspended', 'archived']).optional(),
  search: z.string().max(255).optional(),
  sortBy: z.enum(['name', 'created_at']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const validateSlugSchema = z.object({
  slug: z.string().min(1),
});
```

### Route Handlers (src/routes/organizations.ts)

```typescript
import Router from '@koa/router';
import { requireSuperAdmin } from '../middleware/super-admin.js';
import * as organizationService from '../organizations/service.js';

/**
 * Create the organization management router.
 *
 * All routes require super-admin authorization.
 * Prefix: /api/admin/organizations
 */
export function createOrganizationRouter(): Router {
  const router = new Router({ prefix: '/api/admin/organizations' });

  // All routes require super-admin access
  router.use(requireSuperAdmin());

  // POST / — Create organization
  router.post('/', async (ctx) => {
    const body = createOrganizationSchema.parse(ctx.request.body);
    const org = await organizationService.createOrganization(body);
    ctx.status = 201;
    ctx.body = { data: org };
  });

  // GET / — List organizations
  router.get('/', async (ctx) => {
    const query = listOrganizationsSchema.parse(ctx.query);
    const result = await organizationService.listOrganizations(query);
    ctx.body = result;
  });

  // GET /:id — Get organization by ID
  router.get('/:id', async (ctx) => {
    const org = await organizationService.getOrganizationById(ctx.params.id);
    if (!org) ctx.throw(404, 'Organization not found');
    ctx.body = { data: org };
  });

  // PUT /:id — Update organization
  router.put('/:id', async (ctx) => {
    const body = updateOrganizationSchema.parse(ctx.request.body);
    const org = await organizationService.updateOrganization(ctx.params.id, body);
    ctx.body = { data: org };
  });

  // PUT /:id/branding — Update branding
  router.put('/:id/branding', async (ctx) => {
    const body = updateBrandingSchema.parse(ctx.request.body);
    const org = await organizationService.updateOrganizationBranding(ctx.params.id, body);
    ctx.body = { data: org };
  });

  // POST /:id/suspend — Suspend organization
  router.post('/:id/suspend', async (ctx) => {
    const { reason } = ctx.request.body as { reason?: string };
    await organizationService.suspendOrganization(ctx.params.id, reason);
    ctx.status = 204;
  });

  // POST /:id/activate — Activate organization
  router.post('/:id/activate', async (ctx) => {
    await organizationService.activateOrganization(ctx.params.id);
    ctx.status = 204;
  });

  // POST /:id/archive — Archive organization
  router.post('/:id/archive', async (ctx) => {
    await organizationService.archiveOrganization(ctx.params.id);
    ctx.status = 204;
  });

  // POST /:id/restore — Restore organization
  router.post('/:id/restore', async (ctx) => {
    await organizationService.restoreOrganization(ctx.params.id);
    ctx.status = 204;
  });

  // GET /validate-slug?slug=xxx — Validate slug availability
  router.get('/validate-slug', async (ctx) => {
    const { slug } = validateSlugSchema.parse(ctx.query);
    const result = await organizationService.validateSlugAvailability(slug);
    ctx.body = result;
  });

  return router;
}
```

### Server Integration (src/server.ts)

Mount the organization routes in the server factory:

```typescript
// After health check route, before OIDC routes:
// Organization management API (requires super-admin context)
const orgRouter = createOrganizationRouter();
app.use(orgRouter.routes());
app.use(orgRouter.allowedMethods());
```

**Note:** The admin routes at `/api/admin/organizations` use the `requireSuperAdmin()`
middleware within the router itself. For RD-04, the super-admin check only verifies
the organization flag. Full user-level authentication is added in RD-07.

### Error Response Mapping

The routes catch domain errors and map them to HTTP responses:

```typescript
// In each route handler (or via a route-level error handler):
try {
  // ... operation
} catch (err) {
  if (err instanceof OrganizationNotFoundError) {
    ctx.throw(404, err.message);
  }
  if (err instanceof OrganizationValidationError) {
    ctx.throw(400, err.message);
  }
  // ZodError from validation → 400
  if (err instanceof z.ZodError) {
    ctx.status = 400;
    ctx.body = { error: 'Validation failed', details: err.errors };
    return;
  }
  throw err; // Re-throw unexpected errors for global handler
}
```

## Testing Requirements

### Super-Admin Middleware (~5 tests)

- Allows request when `ctx.state.organization.isSuperAdmin` is true
- Rejects with 403 when `isSuperAdmin` is false
- Rejects with 403 when no organization on ctx.state
- Calls next() on success

### Enhanced Tenant Resolver (~10 tests)

- Cache hit: returns cached org, does not query DB
- Cache miss: queries DB, caches result, returns org
- Suspended org: returns 403
- Archived org: returns 404
- Not found: returns 404
- Sets full Organization object on ctx.state
- Sets issuer on ctx.state
- Redis error: falls back to DB query

### Route Handlers (~15 tests)

- Create: valid input → 201, invalid input → 400, slug taken → 400
- List: pagination params, status filter, default sort
- Get by ID: found → 200, not found → 404
- Update: valid → 200, not found → 404
- Branding: valid → 200
- Suspend: success → 204, super-admin → 400
- Activate: success → 204
- Archive: success → 204
- Restore: success → 204
- Validate slug: valid → `{ isValid: true }`, reserved → `{ isValid: false, error: ... }`
