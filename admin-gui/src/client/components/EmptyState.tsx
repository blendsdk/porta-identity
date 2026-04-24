/**
 * Empty state component.
 * Shown when a list or page has no data to display.
 * Includes an optional icon, title, description, and action button.
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
