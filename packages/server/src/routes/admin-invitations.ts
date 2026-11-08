import Router from '@koa/router';
import type { Middleware } from 'koa';
import bodyParser from 'koa-bodyparser';
import { z } from 'zod';
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import { runDatabaseTransaction } from '../lib/database.js';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import { adminMutationAudit } from '../middleware/admin-mutation-audit.js';
import {
  authorizeServiceAccountInvitation, requireServiceAccountAuthority, SERVICE_ACCOUNT_INVITE_SCOPE,
  ServiceAccountAuthorizationError, ServiceAccountStorageError, ServiceAccountValidationError,
} from '../service-accounts/index.js';
import { validateServiceAccountInvitationJson } from '../service-accounts/invitation-input.js';
import { limitServiceAccountInvitation } from '../service-accounts/rate-limit.js';
import { inviteUser, inviteUserSchema } from '../users/invite-service.js';
import { handleUserRouteError } from './user-error-handler.js';

/**
 * The one real invitation handler, shared with the standalone human router for compatibility.
 * Only the dedicated router opts into machine authentication; no other operation uses this lane.
 */
export const adminInvitationHandler: Middleware = async (ctx) => {
  try {
    const machine = ctx.state.serviceAccount;
    if (machine) validateServiceAccountInvitationJson(ctx.request.body);
    const input = inviteUserSchema.parse(ctx.request.body);
    if (machine) {
      if (!z.string().uuid().safeParse(ctx.params.orgId).success) throw new ServiceAccountValidationError();
      await runDatabaseTransaction(async () => {
        const authority = await requireServiceAccountAuthority(machine.authority.publicClientId, machine.identity);
        await authorizeServiceAccountInvitation(authority, ctx.params.orgId, input);
        // Both checks above may wait on locks or live references. Native expiry is a point-in-time
        // admission decision, so recheck it here, under the same transaction, before the budget or
        // any invitation, user, audit or delivery effect.
        if (machine.tokenExpiresAt <= Date.now() / 1000) {
          ctx.status = 401;
          ctx.body = { error: 'Invalid token', message: 'Token validation failed' };
          return;
        }
        const limit = await limitServiceAccountInvitation(authority.clientId);
        if (!limit.allowed) {
          ctx.status = 429;
          ctx.set('Retry-After', String(limit.retryAfter));
          ctx.body = { error: 'Too many invitation requests' };
          return;
        }
        ctx.state.serviceAccount = { identity: machine.identity, authority,
          tokenExpiresAt: machine.tokenExpiresAt };
        const result = await inviteUser({
          organizationId: ctx.params.orgId, input,
          actor: {
            kind: 'service', clientId: authority.publicClientId,
            displayName: authority.clientName,
            permissions: new Set([SERVICE_ACCOUNT_INVITE_SCOPE]),
          },
          serviceAccountAuthority: authority,
        });
        ctx.status = 201;
        ctx.body = { data: result };
      });
      return;
    }
    const admin = ctx.state.adminUser;
    if (!admin) { ctx.throw(401, 'Authentication required'); return; }
    // Role pre-assignment is an assignment authority, not a side effect of invitation authority.
    // Machine accounts remain governed by their approved binding policy and the delegation check in
    // the shared invitation workflow.
    if (!canAssignRolesOnInvite(input, admin.permissions)) {
      ctx.throw(403, 'Forbidden');
      return;
    }
    const result = await inviteUser({
      organizationId: ctx.params.orgId, input,
      actor: {
        kind: 'admin', userId: admin.id, displayName: admin.email ?? 'Admin',
        permissions: new Set(admin.permissions),
      },
    });
    ctx.status = 201;
    ctx.body = { data: result };
  } catch (error) {
    if (ctx.state.serviceAccount && (error instanceof ServiceAccountAuthorizationError ||
        error instanceof ServiceAccountValidationError || error instanceof ServiceAccountStorageError)) {
      ctx.status = error instanceof ServiceAccountAuthorizationError ? 403 : error instanceof ServiceAccountValidationError ? 400 : 503;
      ctx.body = { error: ctx.status === 403 ? 'Forbidden' : ctx.status === 400 ? 'Invitation request is invalid' : 'Service unavailable' };
      return;
    }
    handleUserRouteError(ctx, error);
  }
};

/**
 * Returns whether a human administrator may include role pre-assignments in an invitation.
 *
 * Invitation authority alone cannot grant roles; the caller must also hold the direct role-assign
 * permission. Machine accounts are evaluated by their binding policy instead and do not use this
 * human gate.
 *
 * @param input - Validated invitation request.
 * @param permissions - Live permissions resolved for the human administrator.
 * @returns True when the request carries no roles or the caller may assign roles.
 * @example canAssignRolesOnInvite({ roles: [] }, ['admin:user:invite']) // true
 */
export function canAssignRolesOnInvite(
  input: { readonly roles?: readonly unknown[] },
  permissions: readonly string[],
): boolean {
  return !input.roles?.length || permissions.includes(ADMIN_PERMISSIONS.ROLE_ASSIGN);
}

/** Register only the real POST with explicit machine opt-in and unchanged human permission checks. */
export function createAdminInvitationRouter(): Router {
  const router = new Router({ prefix: '/api/admin/organizations/:orgId/users' });
  const authenticate = requireAdminAuth({ allowServiceAccountInvitation: true });
  const audit = adminMutationAudit();
  const limits = { jsonLimit: '100kb', formLimit: '100kb', textLimit: '100kb' };
  const humanParser = bodyParser(limits);
  // koa-bodyparser forwards this native co-body option, which its older declarations omit.
  // JSON.parse retains an own __proto__ data key; no claim value is merged into control objects.
  const machineParserOptions = { ...limits, onProtoPoisoning: 'ignore' };
  const machineParser = bodyParser(machineParserOptions);
  const humanPermission = requirePermission(ADMIN_PERMISSIONS.USER_INVITE);

  /** Select parsing without granting mutation authority across an untrusted body upload. */
  const parseInvitation: Middleware = async (ctx, next) => {
    let authenticated = false;
    let authenticationFailed = false;
    let authenticationError: unknown;
    try {
      // Preserve the original transaction-availability failure category even when the provider's
      // human lookup catches its own errors. This short read/authority transaction ends before
      // body parsing and never owns invitation writes or their final audit.
      await runDatabaseTransaction(() => authenticate(ctx, async () => { authenticated = true; }));
    } catch (error) {
      authenticationFailed = true;
      authenticationError = error;
    }
    // Always parse denied requests that the old global parser covered. Syntax/size errors must
    // still win over missing/expired credentials. Uppercase /API aliases had no human parsing;
    // preserve that coverage instead of silently changing their established human responses.
    if (ctx.state.serviceAccount) await machineParser(ctx, async () => {});
    else if (ctx.path.startsWith('/api/')) await humanParser(ctx, async () => {});
    if (authenticationFailed) {
      // Reuse the original error owner after parsing, preserving dependency/error classification.
      await audit(ctx, async () => { throw authenticationError; });
      return;
    }
    if (!authenticated) return;

    // Only a fresh post-upload lookup supplies the final identity. Clear both lanes first so a
    // revoked/expired native artifact cannot reuse the earlier parser-selection identity.
    delete ctx.state.serviceAccount;
    delete ctx.state.adminUser;
    let fresh = false;
    try {
      await authenticate(ctx, async () => { fresh = true; });
    } catch (error) {
      await audit(ctx, async () => { throw error; });
      return;
    }
    if (fresh) await next();
  };

  router.post('/invite', parseInvitation, audit, async (ctx, next) => {
    if (ctx.state.serviceAccount) await next();
    else await humanPermission(ctx, next);
  }, adminInvitationHandler);
  return router;
}
