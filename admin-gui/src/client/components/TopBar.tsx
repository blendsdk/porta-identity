/**
 * Top bar component.
 * Contains the brand logo, org selector, search trigger (Cmd+K),
 * notification bell, and user menu. Replaces the RD-22 stub.
 */

import { useState, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Tooltip,
  Badge,
} from '@fluentui/react-components';
import {
  SearchRegular,
  AlertRegular,
} from '@fluentui/react-icons';

import { OrgSelector } from './OrgSelector';
import { UserMenu } from './UserMenu';
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '48px',
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  searchButton: {
    position: 'relative',
  },
  searchShortcut: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusSmall,
    padding: '0 4px',
    marginLeft: tokens.spacingHorizontalXS,
  },
  notificationButton: {
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: '2px',
    right: '2px',
  },
});

/**
 * Full top bar with brand, org selector, search, notifications, and user menu.
 * The search overlay and notification panel are stub integrations —
 * they trigger state flags that advanced components will consume.
 */
export function TopBar() {
  const styles = useStyles();
  const [_searchOpen, setSearchOpen] = useState(false);
  const [_notificationsOpen, setNotificationsOpen] = useState(false);

  /** Toggle the search overlay (Cmd+K / Ctrl+K) */
  const toggleSearch = useCallback(() => {
    setSearchOpen((prev) => !prev);
  }, []);

  /** Toggle the notification panel */
  const toggleNotifications = useCallback(() => {
    setNotificationsOpen((prev) => !prev);
  }, []);

  // Register Cmd+K / Ctrl+K shortcut for search
  useKeyboardShortcut('mod+k', toggleSearch);

  return (
    <header className={styles.root}>
      {/* Left section: brand + org selector */}
      <div className={styles.left}>
        <div className={styles.brand}>
          <Text size={500} weight="bold">
            Porta Admin
          </Text>
        </div>
        {/* Org selector — organizations are passed empty for now;
            will be connected to React Query hooks in Phase 6 */}
        <OrgSelector organizations={[]} />
      </div>

      {/* Right section: search, notifications, user menu */}
      <div className={styles.right}>
        {/* Search trigger */}
        <Tooltip content="Search (⌘K)" relationship="label">
          <Button
            appearance="subtle"
            icon={<SearchRegular />}
            onClick={toggleSearch}
            aria-label="Search"
            className={styles.searchButton}
          />
        </Tooltip>

        {/* Notification bell */}
        <Tooltip content="Notifications" relationship="label">
          <Button
            appearance="subtle"
            icon={<AlertRegular />}
            onClick={toggleNotifications}
            aria-label="Notifications"
            className={styles.notificationButton}
          >
            {/* Notification count badge (placeholder — 0 for now) */}
            <Badge
              size="tiny"
              color="danger"
              className={styles.notificationBadge}
              style={{ display: 'none' }}
            />
          </Button>
        </Tooltip>

        {/* User menu */}
        <UserMenu />
      </div>
    </header>
  );
}
