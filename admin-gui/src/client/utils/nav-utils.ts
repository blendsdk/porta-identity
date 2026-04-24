/**
 * Navigation utility functions.
 * Provides role-based filtering for sidebar navigation items.
 */

import type { NavItem } from '../types';
import { SUPER_ADMIN_ROLE } from '../config/navigation';

/**
 * Filter navigation items based on the user's roles.
 * - Items without `requiredRoles` are visible to all authenticated users.
 * - Items with `requiredRoles` require at least one matching role.
 * - Users with the `porta-admin` (super-admin) role see all items.
 * - Children are filtered recursively; parent items with no visible
 *   children after filtering are excluded.
 *
 * @param items - Full list of navigation items
 * @param userRoles - Roles assigned to the current user
 * @returns Filtered navigation items the user is authorized to see
 */
export function filterNavByRoles(
  items: NavItem[],
  userRoles: string[],
): NavItem[] {
  // Super-admin sees everything
  if (userRoles.includes(SUPER_ADMIN_ROLE)) {
    return items;
  }

  return items.reduce<NavItem[]>((visible, item) => {
    // Check if user has at least one required role (or no restriction)
    const hasAccess =
      !item.requiredRoles ||
      item.requiredRoles.length === 0 ||
      item.requiredRoles.some((role) => userRoles.includes(role));

    if (!hasAccess) {
      return visible;
    }

    // Recursively filter children if present
    if (item.children && item.children.length > 0) {
      const filteredChildren = filterNavByRoles(item.children, userRoles);

      // Only include parent if at least one child is visible
      if (filteredChildren.length > 0) {
        visible.push({ ...item, children: filteredChildren });
      }
    } else {
      visible.push(item);
    }

    return visible;
  }, []);
}

/**
 * Check if a navigation item (or any of its children) matches
 * the current route path. Used for active state highlighting.
 *
 * @param item - Navigation item to check
 * @param pathname - Current browser location pathname
 * @returns True if this item or a child matches the current path
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  // Exact match for dashboard (root path)
  if (item.path === '/') {
    return pathname === '/';
  }

  // Prefix match for all other routes
  if (pathname.startsWith(item.path)) {
    return true;
  }

  // Check children for nested active state
  if (item.children) {
    return item.children.some((child) => isNavItemActive(child, pathname));
  }

  return false;
}
