/**
 * Koa application factory.
 *
 * Creates the Koa app with all middleware and routes. Optionally accepts
 * an OIDC provider instance to mount under /:orgSlug/* for multi-tenant
 * OIDC functionality.
 *
 * Route structure:
 *   /health                        — Health check (DB + Redis status)
 *   /api/admin/organizations/*     — Organization management (admin auth)
 *   /api/admin/applications/*      — Application management (admin auth)
 *   /api/admin/clients/*           — Client & secret management (admin auth)
 *   /api/admin/organizations/:orgId/users/* — User management (admin auth)
 *   /api/admin/applications/:appId/roles/* — Role management (admin auth)
 *   /api/admin/applications/:appId/permissions/* — Permission management (admin auth)
 *   /api/admin/organizations/:orgId/users/:userId/roles/* — User-role assignments (admin auth)
 *   /api/admin/applications/:appId/claims/* — Custom claims management (admin auth)
 *   /api/admin/config/*            — System configuration management (admin auth)
 *   /api/admin/keys/*              — Signing key management (admin auth)
 *   /api/admin/audit/*             — Audit log viewer (admin auth)
 *   /interaction/:uid/*            — OIDC interaction routes (login, consent, abort)
 *   /:orgSlug/auth/*               — Auth routes (magic link, password reset, invitation)
 *   /:orgSlug/*                    — OIDC provider endpoints (auth, token, jwks, etc.)
 */

import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import Router from '@koa/router';
import type Provider from 'oidc-provider';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { securityHeaders } from './middleware/security-headers.js';
import { healthCheck } from './middleware/health.js';
import { readyHandler } from './middleware/ready.js';
import { createRootPageRouter } from './middleware/root-page.js';
import { tenantResolver } from './middleware/tenant-resolver.js';
import { clientSecretHash } from './middleware/client-secret-hash.js';
import { createOrganizationRouter } from './routes/organizations.js';
import { createApplicationRouter } from './routes/applications.js';
import { createClientRouter } from './routes/clients.js';
import { createUserRouter } from './routes/users.js';
import { createInteractionRouter } from './routes/interactions.js';
import { createMagicLinkRouter } from './routes/magic-link.js';
import { createPasswordResetRouter } from './routes/password-reset.js';
import { createInvitationRouter } from './routes/invitation.js';
import { createRoleRouter } from './routes/roles.js';
import { createPermissionRouter } from './routes/permissions.js';
import { createUserRoleRouter } from './routes/user-roles.js';
import { createCustomClaimRouter } from './routes/custom-claims.js';
import { createTwoFactorRouter } from './routes/two-factor.js';
import { createConfigRouter } from './routes/config.js';
import { createKeysRouter } from './routes/keys.js';
import { createAuditRouter } from './routes/audit.js';
import { createStatsRouter } from './routes/stats.js';
import { createSessionRouter, createUserSessionRouter } from './routes/sessions.js';
import { createBulkRouter } from './routes/bulk.js';
import { createExportRouter } from './routes/exports.js';
import { createBrandingRouter } from './routes/branding.js';
import { adminCors } from './middleware/admin-cors.js';
import { metricsCounter, metricsHandler } from './middleware/metrics.js';
import { tokenRateLimiter, introspectionRateLimiter } from './middleware/token-rate-limiter.js';
import { adminRateLimiter } from './middleware/admin-rate-limiter.js';
import { setAdminAuthProvider } from './middleware/admin-auth.js';
import { findSuperAdminOrganization } from './organizations/repository.js';
import { getApplicationBySlug } from './applications/index.js';
import { listClientsByApplication } from './clients/index.js';
import { config } from './config/index.js';

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

  // Trust proxy headers (X-Forwarded-Proto, X-Forwarded-For, etc.) when
  // running behind a TLS-terminating reverse proxy. This makes ctx.secure,
  // ctx.ip, and ctx.protocol reflect the client's real connection, which is
  // required for secure cookie flags and correct IP-based rate limiting.
  if (config.trustProxy) {
    app.proxy = true;
  }

  // Global middleware stack (order matters):
  // 1. Error handler catches all downstream errors
  // 2. Request logger adds X-Request-Id and logs request/response
  // 3. Security headers (CSP, HSTS, X-Frame-Options, etc.)
  // 4. Selective body parser — only routes that need it (NOT OIDC routes)
  app.use(errorHandler());
  app.use(requestLogger());
  app.use(securityHeaders());

  // Prometheus metrics counter — increments porta_http_requests_total per response.
  // Only active when METRICS_ENABLED=true; otherwise no overhead.
  if (config.metricsEnabled) {
    app.use(metricsCounter());
  }

  // Selective body parser: apply only to admin API, interaction, and auth routes.
  // OIDC provider routes (/:orgSlug/*) must NOT have pre-parsed bodies because
  // oidc-provider uses its own internal body parser (selective_body.js).
  // Pre-parsing the body consumes the request stream, which causes
  // client_secret_post authentication to fail at the token endpoint with
  // "no client authentication mechanism provided".
  //
  // Routes that NEED body parsing:
  //   /api/*           — Admin API routes (JSON request bodies)
  //   /interaction/*   — OIDC interaction routes (login/consent form submissions)
  //   /:orgSlug/auth/* — Auth workflow routes (magic-link, password-reset, invitation)
  //   /health          — GET-only, no body needed, but harmless to parse
  //
  // Routes that must NOT be body-parsed:
  //   /:orgSlug/*      — OIDC provider endpoints (token, revocation, introspection, etc.)
  const bp = bodyParser({
    jsonLimit: '100kb',    // Defence-in-depth: limit JSON body size (default was 1mb)
    formLimit: '100kb',    // Limit form body size
    textLimit: '100kb',    // Limit text body size
  });
  app.use(async (ctx, next) => {
    if (
      ctx.path.startsWith('/api/') ||
      ctx.path.startsWith('/interaction/') ||
      ctx.path.startsWith('/health') ||
      ctx.path.includes('/auth/')
    ) {
      return bp(ctx, next);
    }
    return next();
  });

  // Health check (liveness) and readiness probe — root level, no tenant context.
  // Kubernetes / container orchestrators map:
  //   livenessProbe  → GET /health
  //   readinessProbe → GET /ready
  const router = new Router();
  router.get('/health', healthCheck());
  router.get('/ready', readyHandler());
  // Prometheus metrics endpoint — only registered when METRICS_ENABLED=true.
  // When disabled, GET /metrics falls through to 404 (no route match).
  if (config.metricsEnabled) {
    router.get('/metrics', metricsHandler());
  }
  app.use(router.routes());
  app.use(router.allowedMethods());

  // Public-surface handlers — neutral response at GET /, robots.txt, favicon.
  // Prevents the default Koa "Not Found" page at the public root without
  // disclosing any product information to unauthenticated visitors. See
  // src/middleware/root-page.ts for the security posture.
  const rootPageRouter = createRootPageRouter();
  app.use(rootPageRouter.routes());
  app.use(rootPageRouter.allowedMethods());

  // Admin metadata endpoint — unauthenticated, provides OIDC discovery
  // info needed by the CLI to initiate the login flow. Returns the issuer
  // URL, client_id, and org slug for the admin CLI PKCE client.
  // The client_id is looked up from the database (created by `porta init`)
  // rather than hardcoded, since client IDs are randomly generated.
  const metadataRouter = new Router();
  metadataRouter.get('/api/admin/metadata', async (ctx) => {
    const superAdminOrg = await findSuperAdminOrganization();
    if (!superAdminOrg) {
      ctx.status = 503;
      ctx.body = {
        error: 'Not initialized',
        message: 'Run porta init to set up the admin system',
      };
      return;
    }

    // Look up the admin application and its CLI client
    const adminApp = await getApplicationBySlug('porta-admin');
    if (!adminApp) {
      ctx.status = 503;
      ctx.body = {
        error: 'Not initialized',
        message: 'Run porta init to set up the admin system',
      };
      return;
    }

    // Find the CLI client (native, public PKCE client) in the admin app.
    // Only need the first page — porta init creates exactly one client.
    const clients = await listClientsByApplication(adminApp.id, {
      page: 1,
      pageSize: 10,
    });
    const cliClient = clients.data.find(
      (c) => c.applicationType === 'native',
    );

    ctx.body = {
      issuer: `${config.issuerBaseUrl}/${superAdminOrg.slug}`,
      orgSlug: superAdminOrg.slug,
      clientId: cliClient?.clientId ?? null,
    };
  });
  app.use(metadataRouter.routes());
  app.use(metadataRouter.allowedMethods());

  // Admin CORS allow-list — emits CORS headers for /api/admin/* only when
  // ADMIN_CORS_ORIGINS is configured.  Mounted before admin-auth because
  // preflight OPTIONS requests don't carry Authorization headers.
  // Default (empty config) = deny all cross-origin requests.
  app.use(adminCors(config));

  // Admin API rate limiter — protects state-changing admin endpoints
  // (POST/PUT/PATCH/DELETE /api/admin/*) against brute-force and abuse.
  // Per-IP key, 60 req / 60s.  GET requests pass through unmetered.
  // Mounted before admin routes so it fires before route handlers.
  app.use(adminRateLimiter());

  // Set the OIDC provider for admin auth middleware — enables opaque access
  // token validation via provider.AccessToken.find() for all /api/admin/* routes.
  if (oidcProvider) {
    setAdminAuthProvider(oidcProvider);
  }

  // Organization management API — requires admin authentication
  // Mounted at /api/admin/organizations (see routes/organizations.ts)
  const orgRouter = createOrganizationRouter();
  app.use(orgRouter.routes());
  app.use(orgRouter.allowedMethods());

  // Application management API — requires admin authentication
  // Mounted at /api/admin/applications (see routes/applications.ts)
  const appRouter = createApplicationRouter();
  app.use(appRouter.routes());
  app.use(appRouter.allowedMethods());

  // Client & secret management API — requires admin authentication
  // Mounted at /api/admin/clients (see routes/clients.ts)
  const clientRouter = createClientRouter();
  app.use(clientRouter.routes());
  app.use(clientRouter.allowedMethods());

  // User management API — requires admin authentication
  // Mounted at /api/admin/organizations/:orgId/users (see routes/users.ts)
  const userRouter = createUserRouter();
  app.use(userRouter.routes());
  app.use(userRouter.allowedMethods());

  // RBAC & Custom Claims admin APIs (RD-08) — requires admin authentication
  // Role management at /api/admin/applications/:appId/roles
  const roleRouter = createRoleRouter();
  app.use(roleRouter.routes());
  app.use(roleRouter.allowedMethods());

  // Permission management at /api/admin/applications/:appId/permissions
  const permissionRouter = createPermissionRouter();
  app.use(permissionRouter.routes());
  app.use(permissionRouter.allowedMethods());

  // User-role assignments at /api/admin/organizations/:orgId/users/:userId/roles
  const userRoleRouter = createUserRoleRouter();
  app.use(userRoleRouter.routes());
  app.use(userRoleRouter.allowedMethods());

  // Custom claims at /api/admin/applications/:appId/claims
  const customClaimRouter = createCustomClaimRouter();
  app.use(customClaimRouter.routes());
  app.use(customClaimRouter.allowedMethods());

  // System config management API — requires admin authentication
  // Mounted at /api/admin/config (see routes/config.ts)
  const configRouter = createConfigRouter();
  app.use(configRouter.routes());
  app.use(configRouter.allowedMethods());

  // Signing key management API — requires admin authentication
  // Mounted at /api/admin/keys (see routes/keys.ts)
  const keysRouter = createKeysRouter();
  app.use(keysRouter.routes());
  app.use(keysRouter.allowedMethods());

  // Audit log API — requires admin authentication
  // Mounted at /api/admin/audit (see routes/audit.ts)
  const auditRouter = createAuditRouter();
  app.use(auditRouter.routes());
  app.use(auditRouter.allowedMethods());

  // Dashboard statistics API — requires admin authentication
  // Mounted at /api/admin/stats (see routes/stats.ts)
  const statsRouter = createStatsRouter();
  app.use(statsRouter.routes());
  app.use(statsRouter.allowedMethods());

  // Session management API — requires admin authentication
  // Mounted at /api/admin/sessions (see routes/sessions.ts)
  const sessionRouter = createSessionRouter();
  app.use(sessionRouter.routes());
  app.use(sessionRouter.allowedMethods());

  // User session revocation — requires admin authentication
  // Mounted at /api/admin/users/:userId/sessions (see routes/sessions.ts)
  const userSessionRouter = createUserSessionRouter();
  app.use(userSessionRouter.routes());
  app.use(userSessionRouter.allowedMethods());

  // Bulk operations API — requires admin authentication
  // Mounted at /api/admin/bulk (see routes/bulk.ts)
  const bulkRouter = createBulkRouter();
  app.use(bulkRouter.routes());
  app.use(bulkRouter.allowedMethods());

  // Branding assets API — requires admin authentication
  // Mounted at /api/admin/organizations/:orgId/branding (see routes/branding.ts)
  const brandingRouter = createBrandingRouter();
  app.use(brandingRouter.routes());
  app.use(brandingRouter.allowedMethods());

  // Data export API — requires admin authentication
  // Mounted at /api/admin/export (see routes/exports.ts)
  const exportRouter = createExportRouter();
  app.use(exportRouter.routes());
  app.use(exportRouter.allowedMethods());

  // OIDC interaction routes — mounted at /interaction/:uid/* (root level).
  // These must be at the root (not under /:orgSlug) because the provider sets
  // interaction cookie paths relative to /interaction/{uid}, and the browser
  // must send those cookies when navigating to the interaction URL.
  // Organization context is resolved from the interaction's client_id.
  if (oidcProvider) {
    const interactionRouter = createInteractionRouter(oidcProvider);
    app.use(interactionRouter.routes());
    app.use(interactionRouter.allowedMethods());

    // Two-factor authentication routes — mounted at /interaction/:uid/two-factor/*
    // Must be after the main interaction router for proper routing precedence.
    const twoFactorRouter = createTwoFactorRouter(oidcProvider);
    app.use(twoFactorRouter.routes());
    app.use(twoFactorRouter.allowedMethods());
  }

  // Auth routes — magic link, password reset, invitation
  // These are org-scoped via /:orgSlug/auth/* and use tenant resolution.
  // Mounted before the OIDC catch-all to prevent it from swallowing auth paths.
  // Magic link no longer needs the provider — authentication is completed via
  // the _ml_session cookie and the interaction login handler.
  const magicLinkRouter = createMagicLinkRouter();
  app.use(magicLinkRouter.routes());
  app.use(magicLinkRouter.allowedMethods());

  // Password reset and invitation routes don't need the provider
  const passwordResetRouter = createPasswordResetRouter();
  app.use(passwordResetRouter.routes());
  app.use(passwordResetRouter.allowedMethods());

  const invitationRouter = createInvitationRouter();
  app.use(invitationRouter.routes());
  app.use(invitationRouter.allowedMethods());

  // Token endpoint rate limiter — protects POST /:orgSlug/oidc/token against
  // flooding and brute-force.  Uses per-IP + per-client_id composite key,
  // 30 req / 5 min.  Returns 429 with Retry-After when exceeded.
  // Mounted before the OIDC provider so it fires before token processing.
  app.use(tokenRateLimiter());

  // Introspection endpoint rate limiter — protects POST
  // /:orgSlug/oidc/token/introspection against token enumeration.
  // Per-IP + per-client_id key, 100 req / 60s (higher than token endpoint
  // since resource servers introspect on every API call).
  app.use(introspectionRateLimiter());

  // OIDC provider routes — mounted under /:orgSlug prefix
  // This is the catch-all for OIDC protocol endpoints (auth, token, jwks, etc.)
  // MUST be last because /:orgSlug/* matches everything.
  if (oidcProvider) {
    const oidcRouter = new Router({ prefix: '/:orgSlug' });

    // Tenant resolver validates the org slug and sets ctx.state.organization
    oidcRouter.use(tenantResolver());

    // Body parser for OIDC routes — parses application/x-www-form-urlencoded
    // and JSON bodies before they reach our middleware.
    //
    // When the body is already parsed, oidc-provider's selective_body.js detects
    // ctx.req.readable === false and falls back to reading ctx.req.body.
    //
    // IMPORTANT: We must copy the parsed body to ctx.req.body (Node's IncomingMessage)
    // because oidcProvider.callback() receives ctx.req/ctx.res (raw Node objects),
    // and oidc-provider creates its own internal Koa context — so it can NOT access
    // our Koa app's ctx.request.body. Setting ctx.req.body makes the parsed body
    // available via the fallback path in selective_body.js.
    const oidcBodyParser = bodyParser();
    oidcRouter.use(async (ctx, next) => {
      await oidcBodyParser(ctx, next);
    });
    oidcRouter.use(async (ctx, next) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = (ctx.request as any).body;
      if (body && typeof body === 'object' && Object.keys(body).length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ctx.req as any).body = body;
      }
      await next();
    });

    // Pre-hash client secrets with SHA-256 before oidc-provider processes them.
    // This enables secure secret storage: we store SHA-256 hashes in the DB,
    // the middleware hashes the presented secret, and oidc-provider compares them.
    // Requires body parser above so ctx.request.body.client_secret is available.
    oidcRouter.use(clientSecretHash());

    // Delegate all OIDC requests to node-oidc-provider's callback handler.
    // URL rewriting strips the /:orgSlug prefix so the provider sees
    // standard OIDC paths (/auth, /token, /jwks, etc.).
    oidcRouter.all('/{*path}', async (ctx) => {
      // Preserve the original URL so the provider can detect the mount path
      // and generate correct endpoint URLs (e.g., /playground/auth instead of /auth).
      // node-oidc-provider compares originalUrl vs url to extract the mount prefix.
      const originalUrl = ctx.req.url!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx.req as any).originalUrl = originalUrl;

      // Strip the org slug prefix from the URL before passing to the provider.
      // e.g., /acme-corp/token → /token
      ctx.req.url = originalUrl.replace(`/${ctx.params.orgSlug}`, '');

      // Pass the tenant-resolved org to the provider's internal context.
      // The interactionUrl callback (provider.ts) reads this to store the
      // auth-flow org in Redis, preserving the correct tenant for interaction
      // handlers (important for third-party / cross-org clients).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx.req as any)._portaOrganization = ctx.state.organization;

      // Delegate to node-oidc-provider's Koa callback handler
      await oidcProvider.callback()(ctx.req, ctx.res);
    });

    app.use(oidcRouter.routes());
    app.use(oidcRouter.allowedMethods());
  }

  return app;
}
