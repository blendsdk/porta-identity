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
