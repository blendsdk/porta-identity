/**
 * Admin resource-server routes.
 *
 * Mounted at `/api/admin/applications/:appId/resource-servers`. Every route requires a human
 * administrator and the existing application read/update permission. Responses never expose
 * provider internals, SQL, or row values from another application.
 */

import Router from '@koa/router';
import { z } from 'zod';

import { ApplicationNotFoundError } from '../applications/errors.js';
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import { logger } from '../lib/logger.js';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import {
  ResourceServerConflictError,
  ResourceServerNotFoundError,
  ResourceServerValidationError,
} from '../resource-servers/errors.js';
import {
  createResourceServerForApplication,
  deleteResourceServerForApplication,
  getResourceServerForApplication,
  listResourceServersForApplication,
  updateResourceServerForApplication,
} from '../resource-servers/service.js';
import {
  applicationPathSchema,
  createResourceServerSchema,
  resourceServerPathSchema,
  updateResourceServerSchema,
} from '../resource-servers/validators.js';

/** Minimal context shape needed for fixed route failures. */
interface RouteContext {
  status: number;
  body: unknown;
}

/** Map validation, domain, and storage failures to fixed public bodies. */
function handleError(ctx: RouteContext, error: unknown): void {
  if (error instanceof z.ZodError) {
    ctx.status = 400;
    ctx.body = { error: 'Resource server request is invalid' };
    return;
  }
  if (error instanceof ApplicationNotFoundError) {
    ctx.status = 404;
    ctx.body = { error: 'Application not found' };
    return;
  }
  if (error instanceof ResourceServerNotFoundError) {
    ctx.status = 404;
    ctx.body = { error: 'Resource server not found' };
    return;
  }
  if (error instanceof ResourceServerValidationError) {
    ctx.status = 400;
    ctx.body = { error: 'Resource server request is invalid' };
    return;
  }
  if (error instanceof ResourceServerConflictError) {
    ctx.status = 409;
    ctx.body = { error: 'Resource server conflicts with an existing identifier, audience, or slug' };
    return;
  }
  logger.error(
    {
      event: 'resource_server_operation_failed',
      errorName: error instanceof Error ? error.name : 'unknown',
    },
    'Resource-server operation failed',
  );
  ctx.status = 503;
  ctx.body = { error: 'Resource server operation failed' };
}

/** Create the application-scoped resource-server router. */
export function createResourceServerRouter(): Router {
  const router = new Router({
    prefix: '/api/admin/applications/:appId/resource-servers',
  });

  router.use(requireAdminAuth());

  // GET / — list resource servers for the application.
  router.get(
    '/',
    requirePermission(ADMIN_PERMISSIONS.APP_READ),
    async (ctx) => {
      try {
        const { appId } = applicationPathSchema.parse(ctx.params);
        ctx.body = { data: await listResourceServersForApplication(appId) };
      } catch (error) {
        handleError(ctx, error);
      }
    },
  );

  // POST / — create a resource server.
  router.post(
    '/',
    requirePermission(ADMIN_PERMISSIONS.APP_UPDATE),
    async (ctx) => {
      try {
        const { appId } = applicationPathSchema.parse(ctx.params);
        const body = createResourceServerSchema.parse(ctx.request.body);
        ctx.status = 201;
        ctx.body = { data: await createResourceServerForApplication(appId, body) };
      } catch (error) {
        handleError(ctx, error);
      }
    },
  );

  // GET /:resourceServerId — show one resource server.
  router.get(
    '/:resourceServerId',
    requirePermission(ADMIN_PERMISSIONS.APP_READ),
    async (ctx) => {
      try {
        const params = resourceServerPathSchema.parse(ctx.params);
        ctx.body = {
          data: await getResourceServerForApplication(params.appId, params.resourceServerId),
        };
      } catch (error) {
        handleError(ctx, error);
      }
    },
  );

  // PUT /:resourceServerId — replace the definition and scope registry.
  router.put(
    '/:resourceServerId',
    requirePermission(ADMIN_PERMISSIONS.APP_UPDATE),
    async (ctx) => {
      try {
        const params = resourceServerPathSchema.parse(ctx.params);
        const body = updateResourceServerSchema.parse(ctx.request.body);
        ctx.body = {
          data: await updateResourceServerForApplication(
            params.appId,
            params.resourceServerId,
            body,
          ),
        };
      } catch (error) {
        handleError(ctx, error);
      }
    },
  );

  // DELETE /:resourceServerId — hard-delete the resource server and its registry.
  router.delete(
    '/:resourceServerId',
    requirePermission(ADMIN_PERMISSIONS.APP_UPDATE),
    async (ctx) => {
      try {
        const params = resourceServerPathSchema.parse(ctx.params);
        await deleteResourceServerForApplication(params.appId, params.resourceServerId);
        ctx.status = 204;
      } catch (error) {
        handleError(ctx, error);
      }
    },
  );

  return router;
}
