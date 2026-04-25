/**
 * Entity detail page layout component.
 * Provides a consistent layout for all entity detail pages with:
 * - Header area with title, status badge, and action buttons
 * - Tab navigation for switching between detail sections
 * - Content area rendering the active tab's content
 *
 * Used by OrganizationDetail, ApplicationDetail, ClientDetail,
 * UserDetail, RoleDetail, PermissionDetail, and ClaimDefinitionDetail.
 */

import { useState, type ReactNode } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  TabList,
  Tab,
  Spinner,
} from '@fluentui/react-components';
import { ArrowLeftRegular } from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';
import { StatusBadge, type EntityStatus } from './StatusBadge';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    minWidth: 0,
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
  },
  titleText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexShrink: 0,
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
  },
  tabContent: {
    minHeight: '200px',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '200px',
  },
});

/** Definition of a single tab in the entity detail layout */
export interface EntityTab {
  /** Unique identifier for the tab */
  key: string;
  /** Display label shown in the tab navigation */
  label: string;
  /** Tab content rendered when this tab is active */
  content: ReactNode;
  /** Optional icon for the tab */
  icon?: React.ReactElement;
}

/** Action button displayed in the entity detail header */
export interface EntityAction {
  /** Unique key for the action button */
  key: string;
  /** Button label text */
  label: string;
  /** Click handler */
  onClick: () => void;
  /** Button appearance (default: "secondary") */
  appearance?: 'primary' | 'secondary' | 'subtle' | 'outline';
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Optional icon */
  icon?: React.ReactElement;
}

/** Props for the EntityDetailTabs component */
export interface EntityDetailTabsProps {
  /** Entity display name shown as the page title */
  title: string;
  /** Optional subtitle (e.g., slug, email) shown below the title */
  subtitle?: string;
  /** Entity status displayed as a badge next to the title */
  status?: EntityStatus | string;
  /** Action buttons displayed in the header area */
  actions?: EntityAction[];
  /** Tab definitions with content */
  tabs: EntityTab[];
  /** Initial active tab key (defaults to first tab) */
  defaultTab?: string;
  /** Whether data is still loading */
  loading?: boolean;
  /** Back navigation path (shows back arrow when provided) */
  backPath?: string;
}

/**
 * Reusable entity detail page layout with title, status, actions, and tabs.
 * Handles tab state internally with optional default tab override.
 */
export function EntityDetailTabs({
  title,
  subtitle,
  status,
  actions = [],
  tabs,
  defaultTab,
  loading = false,
  backPath,
}: EntityDetailTabsProps) {
  const styles = useStyles();
  const navigate = useNavigate();

  // Use the first tab key as default if not specified
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.key ?? '');

  // Find the content for the currently active tab
  const activeTabContent = tabs.find((tab) => tab.key === activeTab)?.content;

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size="large" label="Loading..." />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* Header: back button, title + status, and actions */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {backPath && (
            <Button
              appearance="subtle"
              icon={<ArrowLeftRegular />}
              onClick={() => navigate(backPath)}
              aria-label="Go back"
            />
          )}
          <div>
            <div className={styles.title}>
              <Text size={600} weight="semibold" className={styles.titleText}>
                {title}
              </Text>
              {status && <StatusBadge status={status} />}
            </div>
            {subtitle && (
              <Text size={200} className={styles.subtitle}>
                {subtitle}
              </Text>
            )}
          </div>
        </div>
        {actions.length > 0 && (
          <div className={styles.headerActions}>
            {actions.map((action) => (
              <Button
                key={action.key}
                appearance={action.appearance ?? 'secondary'}
                onClick={action.onClick}
                disabled={action.disabled}
                icon={action.icon}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Tab navigation */}
      <TabList
        selectedValue={activeTab}
        onTabSelect={(_ev, data) => setActiveTab(data.value as string)}
      >
        {tabs.map((tab) => (
          <Tab key={tab.key} value={tab.key} icon={tab.icon}>
            {tab.label}
          </Tab>
        ))}
      </TabList>

      {/* Active tab content */}
      <div className={styles.tabContent}>{activeTabContent}</div>
    </div>
  );
}
