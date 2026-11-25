/**
 * Shared organization and path resolution helpers for the OIDC boundary.
 *
 * Porta serves every organization from the same Koa application under a
 * `/{orgSlug}` prefix. The provider's issuer includes that prefix, but the
 * provider itself receives a rewritten path without it. Middleware that must
 * classify a request by route therefore has to strip exactly the resolved
 * tenant prefix first. Keeping one implementation avoids a case or
 * trailing-slash difference between tenant binding and rate limiting that an
 * attacker could use to bypass either control.
 *
 * The module also owns the exact user-code normalizer copied from the pinned
 * provider version. The tenant lookup and the provider must agree byte for
 * byte, otherwise one boundary could resolve a code the other rejects.
 */

/** Maximum normalized user-code length accepted before any database lookup. */
export const MAX_NORMALIZED_USER_CODE_LENGTH = 64;

/** Minimal Koa context surface required by {@link relativeOidcRoute}. */
export interface RelativeRouteContext {
  /** Raw request path, including the organization prefix. */
  readonly path: string;
  /** HTTP method used to distinguish the device authorization endpoint. */
  readonly method: string;
  /** Router parameters, when the matched route already populated them. */
  readonly params?: Record<string, string | undefined>;
  /** Tenant state populated by the tenant resolver. */
  readonly state?: { organization?: unknown };
}

/** Return true only for a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Read a non-empty string organization identifier from an unknown value.
 *
 * The tenant resolver stores the full organization object on `ctx.state`.
 * Provider hooks receive a different request shape. Both callers need the
 * same defensive narrowing so a malformed value cannot be treated as a
 * tenant decision.
 *
 * @param candidate - Value that may carry an `id` property
 * @returns The identifier, or undefined when the value is absent or malformed
 */
export function resolveOrganizationId(candidate: unknown): string | undefined {
  if (!isRecord(candidate)) return undefined;
  const id = candidate['id'];
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/**
 * Read a non-empty organization slug from an unknown value.
 *
 * @param candidate - Value that may carry a `slug` property
 * @returns The slug, or undefined when the value is absent or malformed
 */
export function resolveOrganizationSlug(candidate: unknown): string | undefined {
  if (!isRecord(candidate)) return undefined;
  const slug = candidate['slug'];
  return typeof slug === 'string' && slug.length > 0 ? slug : undefined;
}

/**
 * Resolve the organization stored on the provider request by the outer app.
 *
 * The provider callback receives the raw Node request, not the outer Koa
 * context. The outer middleware stores the validated tenant on that request as
 * `_portaOrganization` so the provider can keep the interaction bound to the
 * client's organization.
 *
 * @param request - Raw request or provider hook input
 * @returns An object carrying the organization identifier, or undefined
 */
export function resolveOrgForProviderHook(request: unknown): { id: string } | undefined {
  if (!isRecord(request)) return undefined;
  const id = resolveOrganizationId(request['_portaOrganization']);
  return id === undefined ? undefined : { id };
}

/**
 * Strip the resolved organization prefix and normalize the route shape.
 *
 * The returned value is one of the small set of route labels the device
 * middleware and limiters understand: `/device`, `/device/auth`,
 * `/device/:uid`, `/token`, or another lowercased relative path. Only route
 * segments are lowercased; a resume UID is never read from this string.
 *
 * @param ctx - Context carrying the raw path and tenant state
 * @returns The organization-relative, segment-normalized route
 * @example
 * relativeOidcRoute({ path: '/acme/Device/Auth', method: 'POST', state: { organization: { slug: 'acme' } } });
 * // '/device/auth'
 */
export function relativeOidcRoute(ctx: RelativeRouteContext): string {
  const orgSlug =
    resolveOrganizationSlug(ctx.state?.organization) ?? ctx.params?.['orgSlug'];
  const prefix = orgSlug === undefined ? undefined : `/${orgSlug}`;

  let path = ctx.path;
  if (
    prefix !== undefined &&
    (path === prefix || path.startsWith(`${prefix}/`))
  ) {
    path = path.slice(prefix.length);
  }

  const segments = path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.toLowerCase());

  if (
    segments.length === 2 &&
    segments[0] === 'device' &&
    segments[1] === 'auth' &&
    ctx.method === 'POST'
  ) {
    return '/device/auth';
  }
  if (segments[0] === 'device' && segments.length === 2) {
    return '/device/:uid';
  }
  return `/${segments.join('/')}`;
}

/**
 * Normalize a submitted user code exactly as the pinned provider does.
 *
 * The provider uppercases ASCII lowercase letters and then removes every
 * non-word character. `\W` keeps underscores and removes non-ASCII letters,
 * so `ß`, `İ` and fullwidth characters disappear instead of being folded.
 * Using `toUpperCase()` here would change the result for those characters and
 * make the two boundaries disagree.
 *
 * @param input - Raw user-entered code
 * @returns The provider-compatible normalized code
 */
export function normalizeUserCode(input: string): string {
  return input.replace(/[a-z]/g, (character) => character.toUpperCase()).replace(/\W/g, '');
}

/**
 * Normalize one untrusted user-code value and enforce the lookup bound.
 *
 * Arrays, objects, empty values and normalized codes longer than
 * {@link MAX_NORMALIZED_USER_CODE_LENGTH} are rejected before any database
 * access. The caller treats `undefined` as malformed input.
 *
 * @param value - Untrusted form or query value
 * @returns The bounded normalized code, or undefined when it cannot be looked up
 */
export function boundedNormalizedUserCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = normalizeUserCode(value);
  if (normalized.length === 0 || normalized.length > MAX_NORMALIZED_USER_CODE_LENGTH) {
    return undefined;
  }
  return normalized;
}
