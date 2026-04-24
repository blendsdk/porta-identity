/**
 * Audit timeline component.
 * Renders a vertical timeline of audit/history events.
 * Used on entity detail pages to show change history.
 */

import { makeStyles, tokens, Text } from '@fluentui/react-components';
import { CircleRegular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  entry: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    position: 'relative',
    paddingBottom: tokens.spacingVerticalL,
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '20px',
    flexShrink: 0,
  },
  dot: {
    fontSize: '12px',
    color: tokens.colorBrandForeground1,
    zIndex: 1,
  },
  line: {
    flex: 1,
    width: '2px',
    backgroundColor: tokens.colorNeutralStroke2,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    paddingTop: '1px',
    flex: 1,
  },
  action: {
    fontWeight: tokens.fontWeightSemibold,
  },
  meta: {
    color: tokens.colorNeutralForeground3,
  },
  empty: {
    padding: tokens.spacingVerticalL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
});

/** Single timeline entry */
export interface TimelineEntry {
  /** Unique key */
  id: string;
  /** Action description (e.g., "Organization created") */
  action: string;
  /** Actor name (who performed the action) */
  actor: string;
  /** Timestamp string */
  timestamp: string;
  /** Optional additional details */
  details?: string;
}

/** Props for the AuditTimeline component */
export interface AuditTimelineProps {
  /** Timeline entries (most recent first) */
  entries: TimelineEntry[];
  /** Message when no entries exist */
  emptyMessage?: string;
}

/**
 * Vertical timeline for audit log / entity history display.
 */
export function AuditTimeline({
  entries,
  emptyMessage = 'No history available',
}: AuditTimelineProps) {
  const styles = useStyles();

  if (entries.length === 0) {
    return (
      <div className={styles.empty}>
        <Text>{emptyMessage}</Text>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {entries.map((entry, index) => (
        <div key={entry.id} className={styles.entry}>
          {/* Timeline indicator */}
          <div className={styles.timeline}>
            <span className={styles.dot}>
              <CircleRegular />
            </span>
            {index < entries.length - 1 && <div className={styles.line} />}
          </div>

          {/* Content */}
          <div className={styles.content}>
            <Text size={300} className={styles.action}>
              {entry.action}
            </Text>
            <Text size={200} className={styles.meta}>
              {entry.actor} · {entry.timestamp}
            </Text>
            {entry.details && (
              <Text size={200} className={styles.meta}>
                {entry.details}
              </Text>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
