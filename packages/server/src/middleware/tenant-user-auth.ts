/**
 * Tenant-scoped actor authentication.
 *
 * The tenant user API accepts service clients for CRUD and either a service
 * client or a tenant user for invitation. A caller must present a valid OAuth
 * token, belong to the route organization, pass the tenant boundary, and hold
 * the scope or permission required by the route.
 *
 * Control-plane clients and the super-admin organization are rejected. The
 * middleware stores a normalized `TenantActor` on the request for route
 * handlers, rate limiting, and audit attribution.
 *
 * @module middleware/tenant-user-auth
 */

import type { Middleware } from 'koa';
import { getApplicationBySlug } from '../applications/service.js';
import { getClientByClientId } from '../clients/service.js';
import { logger } from '../lib/logger.js';
import { findSuperAdminOrganization } from '../organizations/repository.js';
import { buildPermissionClaims } from '../rbac/user-role-service.js';
import type {
  SecurityDecisionEvent,
  SecurityDecisionReasonCode,
} from '../security/decision-event.js';
import { recordSecurityDecision, recordSecurityReference } from '../security/decision-context.js';
import { findUserForOidc } from '../users/service.js';

// ---------------------------------------------------------------------------
// Public constants and contracts
// ---------------------------------------------------------------------------

/** Minimal provider boundary needed to resolve both supported token types. */
export interface TenantTokenProvider {
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

/** Caller kinds supported by the tenant surface. */
export type TenantActorKind = 'service' | 'user';

/** Authenticated tenant actor. */
export type TenantActor =
  | {
      /** Tenant service client. */
      readonly kind: 'service';
      /** Client identifier used for audit and rate limiting. */
      readonly clientId: string;
      /** Human-readable client name used for audit attribution. */
      readonly clientName: string;
      /** Application that owns the client's roles and claims. */
      readonly applicationId: string;
      /** Route organization. */
      readonly organizationId: string;
      /** Safe display name used by invitation and audit flows. */
      readonly displayName: string;
    }
  | {
      /** Tenant user. */
      readonly kind: 'user';
      /** User identifier used for audit and rate limiting. */
      readonly userId: string;
      /** Application that owns the user's roles and claims. */
      readonly applicationId: string;
      /** Route organization. */
      readonly organizationId: string;
      /** Safe display name used by invitation and audit flows. */
      readonly displayName: string;
      /** Live permissions used to enforce the delegation ceiling. */
      readonly permissions: ReadonlySet<string>;
    };

/** Per-route tenant authentication policy. */
export interface TenantAuthOptions {
  /** OIDC provider token models, or undefined to fail closed. */
  readonly provider?: TenantTokenProvider;
  /** Caller kinds permitted by the route. */
  readonly allowedActorKinds: readonly TenantActorKind[];
  /** OAuth scope required by the route. */
  readonly requiredScope: string;
  /** Permission required for user actors; defaults to the required scope. */
  readonly requiredPermission?: string;
}

// ---------------------------------------------------------------------------
// Koa state augmentation
// ---------------------------------------------------------------------------

declare module 'koa' {
  interface DefaultState {
    /** Set by requireTenantActorAuth after a successful caller check. */
    tenantActor?: TenantActor;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Return whether a token carries the required scope. */
function hasScope(scopes: ReadonlySet<string> | undefined, requiredScope: string): boolean {
  return scopes?.has(requiredScope) === true;
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

/** Reject the super-admin organization and the canonical admin application. */
async function isTenantBoundary(organizationId: string, applicationId: string): Promise<boolean> {
  const [adminApplicationId, superAdminOrganizationId] = await Promise.all([
    loadAdminApplicationId(),
    loadSuperAdminOrganizationId(),
  ]);
  if (!adminApplicationId || !superAdminOrganizationId) return false;
  return applicationId !== adminApplicationId && organizationId !== superAdminOrganizationId;
}

/** Write one fixed denial and record its security decision. */
function deny(
  ctx: Parameters<Middleware>[0],
  decisionPoint: SecurityDecisionEvent['decisionPoint'],
  reasonCode: SecurityDecisionReasonCode,
  status: 401 | 403,
  body: Record<string, unknown>,
): undefined {
  recordSecurityDecision(ctx, {
    decisionPoint,
    reasonCode,
    outcome: 'deny',
  });
  ctx.status = status;
  ctx.body = body;
  return undefined;
}

/** Fixed forbidden body shared by every boundary denial. */
const FORBIDDEN_BODY = {
  error: 'Forbidden',
  message: 'The requested operation is not permitted',
} as const;

/**
 * Authorize a client-credentials token.
 *
 * @returns The service actor, or undefined after writing a denial response.
 */
async function authorizeService(
  ctx: Parameters<Middleware>[0],
  organizationId: string,
  token: { readonly clientId?: string; readonly scopes: ReadonlySet<string> },
  requiredScope: string,
): Promise<Extract<TenantActor, { kind: 'service' }> | undefined> {
  if (!token.clientId || !hasScope(token.scopes, requiredScope)) {
    return deny(ctx, 'permission', 'permission-required', 403, FORBIDDEN_BODY);
  }

  const client = await getClientByClientId(token.clientId);
  if (
    !client ||
    client.status !== 'active' ||
    client.clientType !== 'confidential' ||
    client.organizationId !== organizationId ||
    !client.scope.split(' ').includes(requiredScope)
  ) {
    return deny(ctx, 'membership', 'membership-required', 403, FORBIDDEN_BODY);
  }

  if (!(await isTenantBoundary(organizationId, client.applicationId))) {
    return deny(ctx, 'membership', 'membership-required', 403, FORBIDDEN_BODY);
  }

  return {
    kind: 'service',
    clientId: client.clientId,
    clientName: client.clientName,
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
  requiredPermission: string,
): Promise<Extract<TenantActor, { kind: 'user' }> | undefined> {
  if (!token.accountId || !token.clientId) {
    return deny(ctx, 'authentication', 'authentication-required', 401, {
      error: 'Invalid token',
      message: 'Token validation failed',
    });
  }

  const client = await getClientByClientId(token.clientId);
  if (!client || client.status !== 'active' || client.organizationId !== organizationId) {
    return deny(ctx, 'membership', 'membership-required', 403, FORBIDDEN_BODY);
  }

  if (!(await isTenantBoundary(organizationId, client.applicationId))) {
    return deny(ctx, 'membership', 'membership-required', 403, FORBIDDEN_BODY);
  }

  const user = await findUserForOidc(token.accountId);
  if (!user || user.organizationId !== organizationId) {
    return deny(ctx, 'membership', 'membership-required', 403, FORBIDDEN_BODY);
  }

  const permissions = await buildPermissionClaims(user.id, client.applicationId);
  if (!permissions.includes(requiredPermission)) {
    return deny(ctx, 'permission', 'permission-required', 403, FORBIDDEN_BODY);
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
 * Create middleware that authenticates a tenant caller for one route policy.
 *
 * @param options - Provider, allowed actor kinds, and required scope/permission
 * @returns Koa middleware that sets `ctx.state.tenantActor`
 */
export function requireTenantActorAuth(options: TenantAuthOptions): Middleware {
  return async function tenantActorAuthMiddleware(ctx, next) {
    const { provider, allowedActorKinds, requiredScope } = options;
    const requiredPermission = options.requiredPermission ?? requiredScope;

    if (!provider) {
      logger.error('Tenant actor auth: OIDC provider not initialized');
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
      deny(ctx, 'resource', 'resource-not-found', 403, FORBIDDEN_BODY);
      return;
    }

    const authHeader = ctx.get('Authorization');
    if (!authHeader.startsWith('Bearer ')) {
      deny(ctx, 'authentication', 'authentication-required', 401, {
        error: 'Authentication required',
        message: 'Missing or invalid Authorization header',
      });
      return;
    }

    const token = authHeader.slice(7);
    if (token.length === 0) {
      deny(ctx, 'authentication', 'authentication-required', 401, {
        error: 'Invalid token',
        message: 'Token validation failed',
      });
      return;
    }

    let serviceToken:
      { readonly clientId?: string; readonly scopes: ReadonlySet<string> } | undefined;
    try {
      serviceToken = await provider.ClientCredentials.find(token);
    } catch {
      logger.debug(
        { event: 'tenant-user-service-token-unavailable' },
        'Tenant user service token lookup failed',
      );
    }

    if (serviceToken) {
      if (!allowedActorKinds.includes('service')) {
        deny(ctx, 'permission', 'permission-required', 403, FORBIDDEN_BODY);
        return;
      }
      const actor = await authorizeService(ctx, organizationId, serviceToken, requiredScope);
      if (!actor) return;
      recordSecurityReference(ctx, 'actor', actor.clientId);
      recordSecurityReference(ctx, 'tenant', organizationId);
      ctx.state.tenantActor = actor;
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
        { event: 'tenant-user-user-token-unavailable' },
        'Tenant user user-token lookup failed',
      );
    }

    if (userToken) {
      if (!allowedActorKinds.includes('user')) {
        deny(ctx, 'permission', 'permission-required', 403, FORBIDDEN_BODY);
        return;
      }
      const actor = await authorizeUser(ctx, organizationId, userToken, requiredPermission);
      if (!actor) return;
      recordSecurityReference(ctx, 'actor', actor.userId);
      recordSecurityReference(ctx, 'tenant', organizationId);
      ctx.state.tenantActor = actor;
      await next();
      return;
    }

    deny(ctx, 'authentication', 'authentication-required', 401, {
      error: 'Invalid token',
      message: 'Token validation failed',
    });
  };
}
