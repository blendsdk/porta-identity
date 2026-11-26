import type { Context } from 'koa';

/**
 * Reject HEAD on GET routes that consume single-use authentication state.
 *
 * Register this as an explicit HEAD handler before the GET handler: the router otherwise
 * runs GET handlers for HEAD too. Link checkers must not redeem tokens, consume sessions,
 * or abort an interaction. Do not inspect bearer values or resolve their owners here.
 *
 * @param ctx - Request context for an explicitly registered HEAD route.
 */
export function rejectHeadProbe(ctx: Context): void {
  ctx.set('Allow', 'GET');
  ctx.set('Cache-Control', 'no-store');
  ctx.status = 405;
}

/**
 * Reject HEAD on POST-only OIDC endpoints.
 *
 * The device authorization endpoint shares the `/device` prefix with the verification pages, so
 * without an explicit route it would match `HEAD /device/:uid` and advertise GET. It accepts only
 * POST, and a HEAD probe must not create an authorization request.
 *
 * @param ctx - Request context for an explicitly registered HEAD route.
 */
export function rejectHeadPostProbe(ctx: Context): void {
  ctx.set('Allow', 'POST');
  ctx.set('Cache-Control', 'no-store');
  ctx.status = 405;
}
