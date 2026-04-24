/**
 * Breadcrumb hook.
 * Builds breadcrumb trail from React Router's matched routes.
 * Each route can define a `handle.breadcrumb` string in its route config
 * to provide a label for the breadcrumb trail.
 */

import { useMatches } from 'react-router';

/** Single breadcrumb entry */
export interface BreadcrumbItem {
  /** Display label */
  label: string;
  /** Route path (for navigation) */
  path: string;
}

/**
 * Route handle with optional breadcrumb metadata.
 * Routes define this via the `handle` property in route config.
 */
interface RouteHandle {
  breadcrumb?: string;
}

/**
 * Build breadcrumb items from the current route matches.
 * Only routes that define `handle.breadcrumb` are included.
 *
 * @returns Array of breadcrumb items from root to current route
 *
 * @example
 * ```tsx
 * // In route config:
 * { path: '/organizations', handle: { breadcrumb: 'Organizations' } }
 * { path: '/organizations/:id', handle: { breadcrumb: 'Detail' } }
 *
 * // In component:
 * const breadcrumbs = useBreadcrumbs();
 * // → [{ label: 'Organizations', path: '/organizations' },
 * //    { label: 'Detail', path: '/organizations/abc123' }]
 * ```
 */
export function useBreadcrumbs(): BreadcrumbItem[] {
  const matches = useMatches();

  return matches
    .filter((match) => {
      const handle = match.handle as RouteHandle | undefined;
      return handle?.breadcrumb != null;
    })
    .map((match) => {
      const handle = match.handle as RouteHandle;
      return {
        label: handle.breadcrumb!,
        path: match.pathname,
      };
    });
}
