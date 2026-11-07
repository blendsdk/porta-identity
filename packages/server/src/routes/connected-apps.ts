/**
 * Admin connected-apps routes.
 *
 * Mounted at `/api/admin/organizations/:orgId/users/:userId/connected-apps`. Every route requires
 * a human administrator, the existing user permission, and membership of the target user in the
 * requested organization. Responses contain no token, secret or provider internals.
 */

import Router from '@koa/router';
import { z } from 'zod';

import { listConnectedApps, revokeConnectedApp } from '../connected-apps/service.js';
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import { requireUserOrganization } from '../middleware/require-user-organization.js';

/** Target user route parameters. */
const userParams = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
});

/** One connected-app grant route parameters. */
const grantParams = userParams.extend({ grantId: z.string().uuid() });

/** Minimal context shape needed for fixed route failures. */
interface RouteContext {
  status: number;
  body: unknown;
}

/** Map validation and storage failures to fixed public bodies. */
function handleError(ctx: RouteContext, error: unknown): void {
  if (error instanceof z.ZodError) {
    ctx.status = 400;
    ctx.body = { error: 'Connected app request is invalid' };
    return;
  }
  ctx.status = 503;
  ctx.body = { error: 'Connected app operation failed' };
}

/** Create the organization/user-scoped connected-apps router. */
export function createConnectedAppsRouter(): Router {
  const router = new Router({
    prefix: '/api/admin/organizations/:orgId/users/:userId/connected-apps',
  });
  router.use(requireAdminAuth());

  // GET / — list live connected applications for the selected user.
  router.get(
    '/',
    requirePermission(ADMIN_PERMISSIONS.USER_READ),
    requireUserOrganization(),
    async (ctx) => {
      try {
        const params = userParams.parse(ctx.params);
        ctx.body = { data: await listConnectedApps(params.orgId, params.userId) };
      } catch (error) {
        handleError(ctx, error);
      }
    },
  );

  // DELETE /:grantId — revoke one connected application and its linked artifacts.
  router.delete(
    '/:grantId',
    requirePermission(ADMIN_PERMISSIONS.USER_UPDATE),
    requireUserOrganization(),
    async (ctx) => {
      try {
        const params = grantParams.parse(ctx.params);
        const removed = await revokeConnectedApp(
          params.orgId,
          params.userId,
          params.grantId,
        );
        if (!removed) {
          ctx.status = 404;
          ctx.body = { error: 'Connected app not found' };
          return;
        }
        ctx.status = 204;
      } catch (error) {
        handleError(ctx, error);
      }
    },
  );

  return router;
}
