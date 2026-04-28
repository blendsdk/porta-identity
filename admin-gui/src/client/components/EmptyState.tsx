/**
 * Empty state component.
 *
 * Shown when a list, table, or page has no data to display. Renders a centered
 * layout with an icon, title, optional description, and optional action button
 * (e.g. "Create first organization").
 *
 * **When to use:** Any data-driven view that can be empty — entity lists,
 * search results with no matches, detail pages for missing entities.
 *
 * **Provider requirement:** Must be rendered inside a `FluentProvider`.
 *
 * @example
 * ```tsx
 * import { EmptyState } from '../components/EmptyState';
 * import { PeopleRegular } from '@fluentui/react-icons';
 *
 * function UserList({ users }: { users: User[] }) {
 *   if (users.length === 0) {
 *     return (
 *       <EmptyState
 *         title="No users yet"
 *         description="Create your first user to get started."
 *         icon={<PeopleRegular />}
 *         actionLabel="Create User"
 *         onAction={() => navigate('/users/create')}
 *       />
 *     );
 *   }
 *   return <UserTable users={users} />;
 * }
 * ```
 *
 * @module EmptyState
 */

import type { ReactNode } from 'react';
import { makeStyles, tokens, Text, Title3, Button } from '@fluentui/react-components';
import { DocumentRegular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalXXL,
    textAlign: 'center',
    minHeight: '200px',
  },
  icon: {
    fontSize: '48px',
    color: tokens.colorNeutralForeground3,
  },
  description: {
    color: tokens.colorNeutralForeground3,
    maxWidth: '400px',
  },
});

/** Props for the EmptyState component */
export interface EmptyStateProps {
  /** Title text */
  title: string;
  /** Description text (optional) */
  description?: string;
  /** Custom icon (default: DocumentRegular) */
  icon?: ReactNode;
  /** Action button label */
  actionLabel?: string;
  /** Action button callback */
  onAction?: () => void;
}

/**
 * Empty state placeholder for pages and lists with no data.
 */
export function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <span className={styles.icon}>
        {icon ?? <DocumentRegular />}
      </span>
      <Title3>{title}</Title3>
      {description && (
        <Text className={styles.description}>{description}</Text>
      )}
      {actionLabel && onAction && (
        <Button appearance="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
