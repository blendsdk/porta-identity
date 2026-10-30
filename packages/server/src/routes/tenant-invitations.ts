/** Tenant application-bound cancellation of pending invitations. */

import Router from '@koa/router';
import { z } from 'zod';
import { tenantActorToAuditActor } from '../lib/audit-log.js';
import { requireTenantActorAuth } from '../middleware/tenant-user-auth.js';
import type { TenantTokenProvider } from '../middleware/tenant-user-auth.js';
import { tenantUserDeleteRateLimiter } from '../middleware/tenant-user-rate-limiter.js';
import { TENANT_INVITE_PERMISSION, TENANT_INVITE_SCOPE } from '../oidc/scopes.js';
import { revokeInvitation } from '../users/invitation-revocation-service.js';
import { handleUserRouteError } from './user-error-handler.js';

/** Validate route identifiers before any invitation query can receive them. */
const revocationParamsSchema = z.object({
  orgId: z.string().uuid(),
  invitationId: z.string().uuid(),
});

/**
 * Build the tenant-only invitation revocation route.
 *
 * Authentication uses the same authority as invitation creation. The shared
 * strict delete budget covers real and no-op requests alike. A normal 204
 * intentionally discloses neither existence nor the previous artifact state.
 *
 * @param provider - Provider token models; omission fails authentication closed.
 * @returns Router mounted independently of the control-plane Admin API.
 * @example
 * const router = createTenantInvitationsRouter(provider);
 * app.use(router.routes()).use(router.allowedMethods());
 */
export function createTenantInvitationsRouter(provider?: TenantTokenProvider): Router {
  const router = new Router({ prefix: '/api/organizations/:orgId/invitations' });
  router.delete(
    '/:invitationId',
    requireTenantActorAuth({
      provider,
      allowedActorKinds: ['service', 'user'],
      requiredScope: TENANT_INVITE_SCOPE,
      requiredPermission: TENANT_INVITE_PERMISSION,
    }),
    tenantUserDeleteRateLimiter(),
    async (ctx) => {
      try {
        const params = revocationParamsSchema.parse(ctx.params);
        const actor = ctx.state.tenantActor;
        if (!actor) {
          ctx.status = 401;
          ctx.body = { error: 'Authentication required' };
          return;
        }
        const userAgent = ctx.get('user-agent');
        await revokeInvitation({
          organizationId: actor.organizationId,
          applicationId: actor.applicationId,
          invitationId: params.invitationId,
          actor: tenantActorToAuditActor(actor),
          auditContext: {
            ...(ctx.ip ? { ipAddress: ctx.ip } : {}),
            ...(userAgent ? { userAgent } : {}),
          },
        });
        ctx.status = 204;
      } catch (error) {
        handleUserRouteError(ctx, error);
      }
    },
  );
  return router;
}
