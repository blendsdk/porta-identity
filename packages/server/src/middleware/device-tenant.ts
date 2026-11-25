/**
 * Tenant binding for the device authorization verification pages.
 *
 * The provider resolves a user code globally, while Porta serves each
 * organization from its own issuer path. Without an explicit organization
 * check, a code issued for a client in organization A could be confirmed under
 * organization B's branded pages and interaction flow. This middleware closes
 * that gap before the provider loads the code:
 *
 * - `GET /{orgSlug}/device` with a `user_code` resolves the code and compares
 *   its client organization with the request organization.
 * - `POST /{orgSlug}/device` performs the same check for the submitted code.
 * - `GET /{orgSlug}/device/:uid` resolves the interaction's DeviceCode and
 *   applies the same comparison, and verifies the signed resume cookie when it
 *   is present.
 *
 * Malformed, overlong and cross-tenant input receives the same generic 404
 * response. The middleware never reveals a client name, scope, code state or
 * tenant-specific branding for a rejected code.
 */

import type { Context, Middleware } from 'koa';
import type Provider from 'oidc-provider';
import { getClientByClientId } from '../clients/service.js';
import {
  boundedNormalizedUserCode,
  relativeOidcRoute,
  resolveOrganizationId,
  resolveOrganizationSlug,
  type RelativeRouteContext,
} from '../oidc/org-resolution.js';
import { observeProtocolSecurityRejection } from '../oidc/protocol-security-observer.js';

/** Provider-shaped interaction UID: URL-safe nanoid characters only. */
const RESUME_UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** The subset of the provider DeviceCode model used by the binding checks. */
export interface DeviceCodeLookup {
  /** Find a device code by its opaque identifier, optionally ignoring session binding. */
  find(
    identifier: string,
    options?: { ignoreExpiration?: boolean; ignoreSessionBinding?: boolean },
  ): Promise<{ clientId?: string } | undefined>;

  /** Find a device code by its normalized user code. */
  findByUserCode(
    userCode: string,
    options?: { ignoreExpiration?: boolean },
  ): Promise<{ clientId?: string } | undefined>;
}

/** Return true only for a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate the provider model at runtime and expose the narrow lookup surface.
 *
 * The published provider types do not declare the runtime-supported
 * `ignoreSessionBinding` option on `DeviceCode.find`. A runtime shape check
 * gives the middleware a typed wrapper without an unsafe cast or a broad
 * declaration change.
 */
function isDeviceCodeLookup(value: unknown): value is DeviceCodeLookup {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
  return (
    typeof Reflect.get(value, 'find') === 'function' &&
    typeof Reflect.get(value, 'findByUserCode') === 'function'
  );
}

/** Read a submitted value without accepting arrays, objects or duplicates. */
function singleInputValue(value: unknown): { present: boolean; value?: string; malformed: boolean } {
  if (value === undefined) return { present: false, malformed: false };
  if (typeof value !== 'string') return { present: true, malformed: true };
  return { present: true, value, malformed: false };
}

/**
 * Normalize one submitted code and classify the input.
 *
 * Empty values are left to the provider's generic no-code page; malformed or
 * overlong values are rejected before any database lookup.
 */
function classifyUserCode(value: unknown):
  | { kind: 'passthrough' }
  | { kind: 'malformed' }
  | { kind: 'normalized'; code: string } {
  const input = singleInputValue(value);
  if (!input.present) return { kind: 'passthrough' };
  if (input.malformed) return { kind: 'malformed' };
  if (input.value === undefined || input.value.trim().length === 0) return { kind: 'passthrough' };
  const normalized = boundedNormalizedUserCode(input.value);
  return normalized === undefined ? { kind: 'malformed' } : { kind: 'normalized', code: normalized };
}

/** Read the device resume UID from the raw path while preserving its case. */
function resumeUid(ctx: RelativeRouteContext): string | undefined {
  const parameterUid = ctx.params?.['uid'];
  if (typeof parameterUid === 'string' && RESUME_UID_PATTERN.test(parameterUid)) {
    return parameterUid;
  }

  const slug =
    resolveOrganizationSlug(ctx.state?.organization) ?? ctx.params?.['orgSlug'];
  let path = ctx.path;
  if (slug !== undefined && (path === `/${slug}` || path.startsWith(`/${slug}/`))) {
    path = path.slice(slug.length + 1);
  }
  const segments = path.split('/').filter((segment) => segment.length > 0);
  if (segments[0]?.toLowerCase() !== 'device' || segments.length !== 2) return undefined;
  const uid = segments[1];
  return uid !== undefined && RESUME_UID_PATTERN.test(uid) ? uid : undefined;
}

/** Send the single generic rejection response used by every binding failure. */
function rejectGeneric(ctx: Context, clientId: string | undefined): never {
  observeProtocolSecurityRejection({
    request: ctx.req,
    eventClass: 'client-tenant-binding-rejected',
    clientId,
  });
  return ctx.throw(404, 'Device verification not found');
}

/**
 * Create the device tenant-binding middleware.
 *
 * @param provider - Configured provider used to resolve DeviceCode and Interaction records
 * @returns Koa middleware mounted after body parsing and before the provider callback
 */
export function deviceTenantBinding(provider: Provider): Middleware {
  const deviceCodeModel: unknown = provider.DeviceCode;
  if (!isDeviceCodeLookup(deviceCodeModel)) {
    throw new Error('The configured provider does not expose DeviceCode lookups');
  }
  const deviceCodes = deviceCodeModel;

  /** Resolve a client and require it to belong to the request organization. */
  async function requireTenant(
    ctx: Context,
    clientId: string | undefined,
    organizationId: string,
  ): Promise<void> {
    if (clientId === undefined) return rejectGeneric(ctx, undefined);
    const client = await getClientByClientId(clientId);
    if (client === null || client.organizationId !== organizationId) {
      return rejectGeneric(ctx, clientId);
    }
  }

  return async function deviceTenantBindingMiddleware(ctx, next) {
    const organizationId = resolveOrganizationId(ctx.state.organization);
    if (organizationId === undefined) {
      return ctx.throw(500, 'Tenant context unavailable');
    }

    const route = relativeOidcRoute(ctx);

    // HEAD probes are rejected by the explicit HEAD routes; never perform a lookup for them.
    if (ctx.method === 'HEAD') return next();

    if (route === '/device') {
      if (ctx.method === 'GET') {
        const classified = classifyUserCode(ctx.query.user_code);
        if (classified.kind === 'malformed') return rejectGeneric(ctx, undefined);
        if (classified.kind === 'normalized') {
          const code = await deviceCodes.findByUserCode(classified.code, {
            ignoreExpiration: true,
          });
          if (code !== undefined) await requireTenant(ctx, code.clientId, organizationId);
        }
        return next();
      }

      if (ctx.method === 'POST') {
        const body = ctx.request.body;
        if (!isRecord(body)) return next();
        const classified = classifyUserCode(body['user_code']);
        if (classified.kind === 'malformed') return rejectGeneric(ctx, undefined);
        if (classified.kind === 'normalized') {
          const code = await deviceCodes.findByUserCode(classified.code, {
            ignoreExpiration: true,
          });
          if (code !== undefined) await requireTenant(ctx, code.clientId, organizationId);
        }
        return next();
      }

      return next();
    }

    if (route === '/device/:uid') {
      if (ctx.method !== 'GET') return next();
      const uid = resumeUid(ctx);
      if (uid === undefined) return rejectGeneric(ctx, undefined);

      const interaction = await provider.Interaction.find(uid);
      const deviceCodeId = interaction?.deviceCode;
      if (typeof deviceCodeId !== 'string' || deviceCodeId.length === 0) {
        return rejectGeneric(ctx, undefined);
      }

      const code = await deviceCodes.find(deviceCodeId, {
        ignoreExpiration: true,
        ignoreSessionBinding: true,
      });
      if (code === undefined) return rejectGeneric(ctx, undefined);

      const resumeCookie = ctx.cookies.get(provider.cookieName('resume'), { signed: true });
      if (resumeCookie !== undefined && resumeCookie !== uid) {
        return rejectGeneric(ctx, code.clientId);
      }

      await requireTenant(ctx, code.clientId, organizationId);
      return next();
    }

    return next();
  };
}
