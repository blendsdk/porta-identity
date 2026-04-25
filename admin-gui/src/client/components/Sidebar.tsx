/**
 * Sidebar navigation component.
 * Renders navigation items from the navigation config, filtered by the
 * current user's roles. Supports collapse/expand, active state highlighting,
 * and nested sub-menu items.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Tooltip,
  mergeClasses,
} from '@fluentui/react-components';
import {
  NavigationRegular,
  ChevronDownRegular,
  ChevronRightRegular,
} from '@fluentui/react-icons';
import { useNavigate, useLocation } from 'react-router';

import { useAuth } from '../hooks/useAuth';
import { NAV_ITEMS } from '../config/navigation';
import { filterNavByRoles, isNavItemActive } from '../utils/nav-utils';
import type { NavItem } from '../types';

/** Sidebar width constants */
const SIDEBAR_WIDTH_EXPANDED = '240px';
const SIDEBAR_WIDTH_COLLAPSED = '48px';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    overflowY: 'auto',
    overflowX: 'hidden',
    transition: 'width 200ms ease, min-width 200ms ease',
  },
  expanded: {
    width: SIDEBAR_WIDTH_EXPANDED,
    minWidth: SIDEBAR_WIDTH_EXPANDED,
  },
  collapsed: {
    width: SIDEBAR_WIDTH_COLLAPSED,
    minWidth: SIDEBAR_WIDTH_COLLAPSED,
  },

  /* Header with collapse toggle */
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
  },
  headerCollapsed: {
    justifyContent: 'center',
    paddingLeft: tokens.spacingHorizontalXS,
    paddingRight: tokens.spacingHorizontalXS,
  },
  collapseButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    color: tokens.colorNeutralForeground2,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingHorizontalXS,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },

  /* Navigation list */
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
    paddingBottom: tokens.spacingVerticalM,
  },

  /* Navigation item button */
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    color: tokens.colorNeutralForeground2,
    border: 'none',
    backgroundColor: 'transparent',
    width: '100%',
    textAlign: 'left',
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      color: tokens.colorNeutralForeground1,
    },
    ':focus-visible': {
      outlineStyle: 'solid',
      outlineWidth: '2px',
      outlineColor: tokens.colorStrokeFocus2,
      outlineOffset: '-2px',
    },
  },
  navItemActive: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Selected,
    },
  },
  navItemCollapsed: {
    justifyContent: 'center',
    paddingLeft: tokens.spacingHorizontalXS,
    paddingRight: tokens.spacingHorizontalXS,
  },

  /* Icon container */
  navIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    flexShrink: 0,
  },

  /* Label text (hidden when collapsed) */
  navLabel: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: 1,
  },

  /* Expand/collapse chevron for sub-menus */
  chevron: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
  },

  /* Sub-menu container */
  subMenu: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    paddingLeft: tokens.spacingHorizontalXL,
  },
});

/** Props for the Sidebar component */
export interface SidebarProps {
  /** Whether the sidebar starts in collapsed state */
  defaultCollapsed?: boolean;
}

/**
 * Sidebar navigation with role-based filtering, collapse/expand toggle,
 * active state highlighting, and nested sub-menu support.
 */
export function Sidebar({ defaultCollapsed = false }: SidebarProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());

  // Filter nav items by the current user's roles
  const visibleItems = useMemo(
    () => filterNavByRoles(NAV_ITEMS, user?.roles ?? []),
    [user?.roles],
  );

  /** Toggle the sidebar between collapsed and expanded states */
  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  /** Toggle a sub-menu's expanded state */
  const toggleSubMenu = useCallback((key: string) => {
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  /** Handle clicking a nav item — navigate or toggle sub-menu */
  const handleNavClick = useCallback(
    (item: NavItem) => {
      if (item.children && item.children.length > 0) {
        toggleSubMenu(item.key);
      } else {
        navigate(item.path);
      }
    },
    [navigate, toggleSubMenu],
  );

  /** Render a single navigation item (and its children recursively) */
  const renderNavItem = (item: NavItem, depth = 0) => {
    const active = isNavItemActive(item, location.pathname);
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedMenus.has(item.key);

    // Choose the filled icon variant for the active state
    const Icon = active ? item.iconFilled : item.icon;

    const button = (
      <button
        key={item.key}
        type="button"
        className={mergeClasses(
          styles.navItem,
          active && styles.navItemActive,
          collapsed && depth === 0 && styles.navItemCollapsed,
        )}
        onClick={() => handleNavClick(item)}
        aria-current={active && !hasChildren ? 'page' : undefined}
        aria-expanded={hasChildren ? isExpanded : undefined}
        title={collapsed ? item.label : undefined}
        data-testid={`nav-item-${item.key}`}
      >
        <span className={styles.navIcon}>
          <Icon />
        </span>
        {!collapsed && (
          <>
            <span className={styles.navLabel}>{item.label}</span>
            {hasChildren && (
              <span className={styles.chevron}>
                {isExpanded ? <ChevronDownRegular /> : <ChevronRightRegular />}
              </span>
            )}
          </>
        )}
      </button>
    );

    // Wrap collapsed items in a tooltip showing the label
    const wrappedButton = collapsed && depth === 0 ? (
      <Tooltip content={item.label} relationship="label" positioning="after" key={item.key}>
        {button}
      </Tooltip>
    ) : (
      button
    );

    return (
      <div key={item.key}>
        {wrappedButton}
        {/* Render sub-menu when expanded (and sidebar is not collapsed) */}
        {hasChildren && isExpanded && !collapsed && (
          <div className={styles.subMenu}>
            {item.children!.map((child) => renderNavItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className={mergeClasses(
        styles.root,
        collapsed ? styles.collapsed : styles.expanded,
      )}
      aria-label="Main navigation"
      data-testid="sidebar"
    >
      {/* Header with collapse toggle */}
      <div
        className={mergeClasses(
          styles.header,
          collapsed && styles.headerCollapsed,
        )}
      >
        {!collapsed && (
          <Text size={200} weight="semibold">
            Navigation
          </Text>
        )}
        <Tooltip
          content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          relationship="label"
        >
          <button
            type="button"
            className={styles.collapseButton}
            onClick={toggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            data-testid="sidebar-toggle"
          >
            <NavigationRegular />
          </button>
        </Tooltip>
      </div>

      {/* Navigation items */}
      <nav className={styles.nav} data-testid="sidebar-nav">
        {visibleItems.map((item) => renderNavItem(item))}
      </nav>
    </aside>
  );
}
