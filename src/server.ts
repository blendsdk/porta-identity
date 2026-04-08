/**
 * Koa application factory.
 *
 * Creates the Koa app with all middleware and routes. Optionally accepts
 * an OIDC provider instance to mount under /:orgSlug/* for multi-tenant
 * OIDC functionality.
 *
 * Route structure:
 *   /health                        — Health check (DB + Redis status)
 *   /api/admin/organizations/*     — Organization management (super-admin)
 *   /api/admin/applications/*      — Application management (super-admin)
 *   /api/admin/clients/*           — Client & secret management (super-admin)
 *   /api/admin/organizations/:orgId/users/* — User management (super-admin)
 *   /:orgSlug/*                    — OIDC provider endpoints (auth, token, jwks, etc.)
 */

import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import Router from '@koa/router';
import type Provider from 'oidc-provider';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthCheck } from './middleware/health.js';
import { tenantResolver } from './middleware/tenant-resolver.js';
import { createOrganizationRouter } from './routes/organizations.js';
import { createApplicationRouter } from './routes/applications.js';
import { createClientRouter } from './routes/clients.js';
import { createUserRouter } from './routes/users.js';

/**
 * Create the Koa application with all middleware and routes.
 *
 * @param oidcProvider - Optional OIDC provider instance. If provided,
 *   OIDC endpoints are mounted under /:orgSlug/* with tenant resolution.
 *   Pass undefined for testing scenarios that don't need OIDC.
 * @returns Configured Koa application
 */
export function createApp(oidcProvider?: Provider): Koa {
  const app = new Koa();

  // Global middleware stack (order matters):
  // 1. Error handler catches all downstream errors
  // 2. Request logger adds X-Request-Id and logs request/response
  // 3. Body parser makes request body available on ctx.request.body
  app.use(errorHandler());
  app.use(requestLogger());
  app.use(bodyParser());

  // Health check route — root level, no tenant context required
  const router = new Router();
  router.get('/health', healthCheck());
  app.use(router.routes());
  app.use(router.allowedMethods());

  // Organization management API — requires super-admin authorization
  // Mounted at /api/admin/organizations (see routes/organizations.ts)
  const orgRouter = createOrganizationRouter();
  app.use(orgRouter.routes());
  app.use(orgRouter.allowedMethods());

  // Application management API — requires super-admin authorization
  // Mounted at /api/admin/applications (see routes/applications.ts)
  const appRouter = createApplicationRouter();
  app.use(appRouter.routes());
  app.use(appRouter.allowedMethods());

  // Client & secret management API — requires super-admin authorization
  // Mounted at /api/admin/clients (see routes/clients.ts)
  const clientRouter = createClientRouter();
  app.use(clientRouter.routes());
  app.use(clientRouter.allowedMethods());

  // User management API — requires super-admin authorization
  // Mounted at /api/admin/organizations/:orgId/users (see routes/users.ts)
  const userRouter = createUserRouter();
  app.use(userRouter.routes());
  app.use(userRouter.allowedMethods());

  // OIDC provider routes — mounted under /:orgSlug prefix
  if (oidcProvider) {
    const oidcRouter = new Router({ prefix: '/:orgSlug' });

    // Tenant resolver validates the org slug and sets ctx.state.organization
    oidcRouter.use(tenantResolver());

    // Delegate all OIDC requests to node-oidc-provider's callback handler.
    // URL rewriting strips the /:orgSlug prefix so the provider sees
    // standard OIDC paths (/auth, /token, /jwks, etc.).
    oidcRouter.all('(.*)', async (ctx) => {
      // Strip the org slug prefix from the URL before passing to the provider.
      // e.g., /acme-corp/token → /token
      ctx.req.url = ctx.req.url!.replace(`/${ctx.params.orgSlug}`, '');

      // Delegate to node-oidc-provider's Koa callback handler
      await oidcProvider.callback()(ctx.req, ctx.res);
    });

    app.use(oidcRouter.routes());
    app.use(oidcRouter.allowedMethods());
  }

  return app;
}
