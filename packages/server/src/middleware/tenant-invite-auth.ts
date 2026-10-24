/**
 * Tenant-scoped invitation authentication.
 *
 * The tenant invitation route accepts two caller types:
 *
 *   - A confidential client using the OAuth `client_credentials` grant. The
 *     token must carry the `org:user:invite` scope, the client must be active
 *     and confidential, and the client must belong to the route organization.
 *   - A tenant user's access token. The user must be active, belong to the
 *     route organization, and hold the `org:user:invite` permission in the
 *     token client's application.
 *
 * Control-plane clients and the super-admin organization are rejected. This
 * route is deliberately separate from `/api/admin/*`; a Porta administrator
 * uses the existing admin invitation route instead.
 *
 * @module middleware/tenant-invite-auth
 */

import type { Middleware } from 'koa';
import { getApplicationBySlug } from '../applications/service.js';
import { getClientByClientId } from '../clients/service.js';
import { logger } from '../lib/logger.js';
import { TENANT_INVITE_PERMISSION, TENANT_INVITE_SCOPE } from '../oidc/scopes.js';
import { findSuperAdminOrganization } from '../organizations/repository.js';
import { buildPermissionClaims } from '../rbac/user-role-service.js';
import { recordSecurityDecision, recordSecurityReference } from '../security/decision-context.js';
import { findUserForOidc } from '../users/service.js';

// ---------------------------------------------------------------------------
// Public constants and contracts
// ---------------------------------------------------------------------------

export { TENANT_INVITE_PERMISSION, TENANT_INVITE_SCOPE };

/** Minimal provider boundary needed to resolve both supported token types. */
export interface TenantInviteTokenProvider {
  /** Opaque user access-token model. */
  readonly AccessToken: {
    /** Resolve one user access token. */
    find(token: string): Promise<
      | {
          readonly accountId?: string;
          readonly clientId?: string;
          readonly scopes: ReadonlySet<string>;
        }
      | undefined
    >;
  };
  /** Opaque client-credentials token model. */
  readonly ClientCredentials: {
    /** Resolve one service access token. */
    find(token: string): Promise<
      | {
          readonly clientId?: string;
          readonly scopes: ReadonlySet<string>;
        }
      | undefined
    >;
  };
}

/** Authenticated tenant invitation actor. */
export type TenantInviteActor =
  | {
      /** Tenant service client. */
      readonly kind: 'service';
      /** Client identifier used for audit and rate limiting. */
      readonly clientId: string;
      /** Application that owns the invite's roles and claims. */
      readonly applicationId: string;
      /** Route organization. */
      readonly organizationId: string;
      /** Safe display name used in the invitation email. */
      readonly displayName: string;
    }
  | {
      /** Tenant user. */
      readonly kind: 'user';
      /** User identifier used for audit and rate limiting. */
      readonly userId: string;
      /** Application that owns the invite's roles and claims. */
      readonly applicationId: string;
      /** Route organization. */
      readonly organizationId: string;
      /** Safe display name used in the invitation email. */
      readonly displayName: string;
      /** Live permissions used to enforce the delegation ceiling. */
      readonly permissions: ReadonlySet<string>;
    };

// ---------------------------------------------------------------------------
// Koa state augmentation
// ---------------------------------------------------------------------------

declare module 'koa' {
  interface DefaultState {
    /** Set by requireTenantInviteAuth after a successful caller check. */
    tenantInviteActor?: TenantInviteActor;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Return the authenticated permission set when the scope is granted. */
function hasInviteScope(scopes: ReadonlySet<string> | undefined): boolean {
  return scopes?.has(TENANT_INVITE_SCOPE) === true;
}

/** Build a safe display name from optional profile fields. */
function displayName(
  givenName: string | null | undefined,
  familyName: string | null | undefined,
  fallback: string,
): string {
  const name = [givenName, familyName].filter((part): part is string => Boolean(part)).join(' ');
  return name.length > 0 ? name : fallback;
}

/** Resolve the canonical control-plane application or fail closed. */
async function loadAdminApplicationId(): Promise<string | null> {
  const application = await getApplicationBySlug('porta-admin');
  return application?.id ?? null;
}

/** Resolve the control-plane organization or fail closed. */
async function loadSuperAdminOrganizationId(): Promise<string | null> {
  const organization = await findSuperAdminOrganization();
  return organization?.id ?? null;
}

/**
 * Reject the super-admin organization and the canonical admin application.
 *
 * @returns A fixed denial status when the route is not a tenant surface.
 */
async function isTenantBoundary(organizationId: string, applicationId: string): Promise<boolean> {
  const [adminApplicationId, superAdminOrganizationId] = await Promise.all([
    loadAdminApplicationId(),
    loadSuperAdminOrganizationId(),
  ]);
  if (!adminApplicationId || !superAdminOrganizationId) return false;
  return applicationId !== adminApplicationId && organizationId !== superAdminOrganizationId;
}

/**
 * Authorize a client-credentials token.
 *
 * @returns The service actor, or undefined after writing a denial response.
 */
async function authorizeService(
  ctx: Parameters<Middleware>[0],
  organizationId: string,
  token: { readonly clientId?: string; readonly scopes: ReadonlySet<string> },
): Promise<Extract<TenantInviteActor, { kind: 'service' }> | undefined> {
  if (!token.clientId || !hasInviteScope(token.scopes)) {
    recordSecurityDecision(ctx, {
      decisionPoint: 'permission',
      reasonCode: 'permission-required',
      outcome: 'deny',
    });
    ctx.status = 403;
    ctx.body = { error: 'Forbidden', message: 'The requested operation is not permitted' };
    return undefined;
  }

  const client = await getClientByClientId(token.clientId);
  if (
    !client ||
    client.status !== 'active' ||
    client.clientType !== 'confidential' ||
    client.organizationId !== organizationId ||
    !client.scope.split(' ').includes(TENANT_INVITE_SCOPE)
  ) {
    recordSecurityDecision(ctx, {
      decisionPoint: 'membership',
      reasonCode: 'membership-required',
      outcome: 'deny',
    });
    ctx.status = 403;
    ctx.body = { error: 'Forbidden', message: 'The requested operation is not permitted' };
    return undefined;
  }

  if (!(await isTenantBoundary(organizationId, client.applicationId))) {
    recordSecurityDecision(ctx, {
      decisionPoint: 'membership',
      reasonCode: 'membership-required',
      outcome: 'deny',
    });
    ctx.status = 403;
    ctx.body = { error: 'Forbidden', message: 'The requested operation is not permitted' };
    return undefined;
  }

  return {
    kind: 'service',
    clientId: client.clientId,
    applicationId: client.applicationId,
    organizationId,
    displayName: client.clientName,
  };
}

/**
 * Authorize a user access token.
 *
 * @returns The user actor, or undefined after writing a denial response.
 */
async function authorizeUser(
  ctx: Parameters<Middleware>[0],
  organizationId: string,
  token: { readonly accountId?: string; readonly clientId?: string },
): Promise<Extract<TenantInviteActor, { kind: 'user' }> | undefined> {
  if (!token.accountId || !token.clientId) {
    recordSecurityDecision(ctx, {
      decisionPoint: 'authentication',
      reasonCode: 'authentication-required',
      outcome: 'deny',
    });
    ctx.status = 401;
    ctx.body = { error: 'Invalid token', message: 'Token validation failed' };
    return undefined;
  }

  const client = await getClientByClientId(token.clientId);
  if (!client || client.status !== 'active' || client.organizationId !== organizationId) {
    recordSecurityDecision(ctx, {
      decisionPoint: 'membership',
      reasonCode: 'membership-required',
      outcome: 'deny',
    });
    ctx.status = 403;
    ctx.body = { error: 'Forbidden', message: 'The requested operation is not permitted' };
    return undefined;
  }

  if (!(await isTenantBoundary(organizationId, client.applicationId))) {
    recordSecurityDecision(ctx, {
      decisionPoint: 'membership',
      reasonCode: 'membership-required',
      outcome: 'deny',
    });
    ctx.status = 403;
    ctx.body = { error: 'Forbidden', message: 'The requested operation is not permitted' };
    return undefined;
  }

  const user = await findUserForOidc(token.accountId);
  if (!user || user.organizationId !== organizationId) {
    recordSecurityDecision(ctx, {
      decisionPoint: 'membership',
      reasonCode: 'membership-required',
      outcome: 'deny',
    });
    ctx.status = 403;
    ctx.body = { error: 'Forbidden', message: 'The requested operation is not permitted' };
    return undefined;
  }

  const permissions = await buildPermissionClaims(user.id, client.applicationId);
  if (!permissions.includes(TENANT_INVITE_PERMISSION)) {
    recordSecurityDecision(ctx, {
      decisionPoint: 'permission',
      reasonCode: 'permission-required',
      outcome: 'deny',
    });
    ctx.status = 403;
    ctx.body = { error: 'Forbidden', message: 'The requested operation is not permitted' };
    return undefined;
  }

  return {
    kind: 'user',
    userId: user.id,
    applicationId: client.applicationId,
    organizationId,
    displayName: displayName(user.givenName, user.familyName, user.email),
    permissions: new Set(permissions),
  };
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Create middleware that authenticates a tenant invitation caller.
 *
 * @param provider - OIDC provider token models, or undefined to fail closed
 * @returns Koa middleware that sets `ctx.state.tenantInviteActor`
 */
export function requireTenantInviteAuth(provider?: TenantInviteTokenProvider): Middleware {
  return async function tenantInviteAuthMiddleware(ctx, next) {
    if (!provider) {
      logger.error('Tenant invite auth: OIDC provider not initialized');
      recordSecurityDecision(ctx, {
        decisionPoint: 'handler',
        reasonCode: 'handler-failed',
        outcome: 'error',
      });
      ctx.status = 500;
      ctx.body = { error: 'Server configuration error' };
      return;
    }

    const organizationId = ctx.params.orgId;
    if (typeof organizationId !== 'string' || organizationId.length === 0) {
      recordSecurityDecision(ctx, {
        decisionPoint: 'resource',
        reasonCode: 'resource-not-found',
        outcome: 'deny',
      });
      ctx.status = 404;
      ctx.body = { error: 'Organization not found' };
      return;
    }

    const authHeader = ctx.get('Authorization');
    if (!authHeader.startsWith('Bearer ')) {
      recordSecurityDecision(ctx, {
        decisionPoint: 'authentication',
        reasonCode: 'authentication-required',
        outcome: 'deny',
      });
      ctx.status = 401;
      ctx.body = {
        error: 'Authentication required',
        message: 'Missing or invalid Authorization header',
      };
      return;
    }

    const token = authHeader.slice(7);
    if (token.length === 0) {
      ctx.status = 401;
      ctx.body = { error: 'Invalid token', message: 'Token validation failed' };
      return;
    }

    let serviceToken:
      { readonly clientId?: string; readonly scopes: ReadonlySet<string> } | undefined;
    try {
      serviceToken = await provider.ClientCredentials.find(token);
    } catch {
      logger.debug(
        { event: 'tenant-invite-service-token-unavailable' },
        'Tenant invite service token lookup failed',
      );
    }

    if (serviceToken) {
      const actor = await authorizeService(ctx, organizationId, serviceToken);
      if (!actor) return;
      recordSecurityReference(ctx, 'actor', actor.clientId);
      recordSecurityReference(ctx, 'tenant', organizationId);
      ctx.state.tenantInviteActor = actor;
      await next();
      return;
    }

    let userToken:
      | {
          readonly accountId?: string;
          readonly clientId?: string;
          readonly scopes: ReadonlySet<string>;
        }
      | undefined;
    try {
      userToken = await provider.AccessToken.find(token);
    } catch {
      logger.debug(
        { event: 'tenant-invite-user-token-unavailable' },
        'Tenant invite user token lookup failed',
      );
    }

    if (userToken) {
      const actor = await authorizeUser(ctx, organizationId, userToken);
      if (!actor) return;
      recordSecurityReference(ctx, 'actor', actor.userId);
      recordSecurityReference(ctx, 'tenant', organizationId);
      ctx.state.tenantInviteActor = actor;
      await next();
      return;
    }

    recordSecurityDecision(ctx, {
      decisionPoint: 'authentication',
      reasonCode: 'authentication-required',
      outcome: 'deny',
    });
    ctx.status = 401;
    ctx.body = { error: 'Invalid token', message: 'Token validation failed' };
  };
}
