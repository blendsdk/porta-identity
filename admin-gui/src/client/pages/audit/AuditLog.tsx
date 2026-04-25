/**
 * Audit Log page.
 *
 * Displays a filterable, paginated audit trail with:
 * - Date range picker, event type dropdown, actor search, entity type filter
 * - DataGrid with columns: timestamp, event type, actor, entity, details summary
 * - Row expand to show full event details as formatted JSON
 * - CSV export of currently filtered results
 * - Cursor pagination
 */

import { useState, useMemo, useCallback } from 'react';
import {
  Text,
  Button,
  Input,
  Select,
  makeStyles,
  tokens,
  Card,
  Badge,
  Spinner,
  Tooltip,
} from '@fluentui/react-components';
import {
  ArrowDownloadRegular,
  FilterRegular,
  DismissRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  SearchRegular,
} from '@fluentui/react-icons';
import { useAuditLog, type AuditFilters } from '../../api/audit';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import type { AuditEntry } from '../../types';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
  filters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    alignItems: 'flex-end',
  },
  filterField: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  filterLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `2px solid ${tokens.colorNeutralStroke1}`,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
  },
  td: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    fontSize: tokens.fontSizeBase300,
    verticalAlign: 'top',
  },
  expandRow: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  expandedDetails: {
    backgroundColor: tokens.colorNeutralBackground3,
    padding: tokens.spacingHorizontalL,
    borderRadius: tokens.borderRadiusMedium,
    fontFamily: 'monospace',
    fontSize: tokens.fontSizeBase200,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '300px',
    overflowY: 'auto',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
  },
  timestamp: {
    whiteSpace: 'nowrap',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Known event type categories for the filter dropdown */
const EVENT_TYPES = [
  '',
  'user.created',
  'user.updated',
  'user.deleted',
  'user.login',
  'user.login_failed',
  'user.password_changed',
  'user.invited',
  'org.created',
  'org.updated',
  'org.suspended',
  'org.activated',
  'org.archived',
  'app.created',
  'app.updated',
  'client.created',
  'client.updated',
  'client.revoked',
  'role.created',
  'role.updated',
  'permission.created',
  'claim.created',
  'config.updated',
  'key.generated',
  'key.rotated',
  'session.revoked',
  'security.login_method_disabled',
];

/** Known entity types for the filter dropdown */
const ENTITY_TYPES = [
  '',
  'user',
  'organization',
  'application',
  'client',
  'role',
  'permission',
  'claim',
  'config',
  'key',
  'session',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format an ISO date string for display in the audit table.
 * Shows date and time in local timezone.
 */
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Format an audit action string for display.
 * Converts "org.created" → "Organization Created".
 */
function formatAction(action: string): string {
  return action
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Export audit entries to CSV format and trigger download.
 * Generates a Blob with CSV content and opens a download link.
 */
function exportToCsv(entries: AuditEntry[]): void {
  const headers = [
    'Timestamp',
    'Event Type',
    'Actor',
    'Entity Type',
    'Entity ID',
    'IP Address',
    'Details',
  ];
  const rows = entries.map((e) => [
    e.createdAt,
    e.action,
    e.actorEmail ?? '',
    e.targetType ?? '',
    e.targetId ?? '',
    e.ipAddress ?? '',
    e.metadata ? JSON.stringify(e.metadata) : '',
  ]);

  // Escape CSV fields that contain commas, quotes, or newlines
  const escape = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map(escape).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Audit Log page component.
 *
 * Provides a filterable, paginated view of all audit events.
 * Supports expanding rows to see full JSON metadata and
 * exporting filtered results to CSV.
 */
export function AuditLog() {
  const styles = useStyles();

  // Filter state
  const [eventType, setEventType] = useState('');
  const [actorSearch, setActorSearch] = useState('');
  const [targetType, setTargetType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination state
  const [cursor, setCursor] = useState<string | undefined>();

  // Row expansion state
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Build filter params — only include non-empty values
  const params = useMemo<AuditFilters>(() => {
    const p: AuditFilters = { limit: '25' };
    if (eventType) p.eventType = eventType;
    if (actorSearch) p.actorEmail = actorSearch;
    if (targetType) p.targetType = targetType;
    if (startDate) p.startDate = new Date(startDate).toISOString();
    if (endDate) p.endDate = new Date(endDate).toISOString();
    if (cursor) (p as Record<string, string>).cursor = cursor;
    return p;
  }, [eventType, actorSearch, targetType, startDate, endDate, cursor]);

  const { data, isLoading } = useAuditLog(params);
  const entries: AuditEntry[] = (data as any)?.data ?? [];
  const pagination = (data as any)?.pagination;

  /** Reset all filters to defaults */
  const clearFilters = useCallback(() => {
    setEventType('');
    setActorSearch('');
    setTargetType('');
    setStartDate('');
    setEndDate('');
    setCursor(undefined);
  }, []);

  /** Toggle row expansion */
  const toggleRow = useCallback(
    (id: string) => setExpandedId((prev) => (prev === id ? null : id)),
    [],
  );

  const hasFilters = eventType || actorSearch || targetType || startDate || endDate;

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <Text as="h1" size={800} weight="bold">
          Audit Log
        </Text>
        <div className={styles.actions}>
          <Button
            icon={<ArrowDownloadRegular />}
            appearance="outline"
            disabled={entries.length === 0}
            onClick={() => exportToCsv(entries)}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className={styles.filters}>
          <div className={styles.filterField}>
            <Text className={styles.filterLabel}>Event Type</Text>
            <Select
              value={eventType}
              onChange={(_e, d) => {
                setEventType(d.value);
                setCursor(undefined);
              }}
            >
              <option value="">All events</option>
              {EVENT_TYPES.filter(Boolean).map((t) => (
                <option key={t} value={t}>
                  {formatAction(t)}
                </option>
              ))}
            </Select>
          </div>

          <div className={styles.filterField}>
            <Text className={styles.filterLabel}>Actor</Text>
            <Input
              placeholder="Search by email..."
              contentBefore={<SearchRegular />}
              value={actorSearch}
              onChange={(_e, d) => {
                setActorSearch(d.value);
                setCursor(undefined);
              }}
            />
          </div>

          <div className={styles.filterField}>
            <Text className={styles.filterLabel}>Entity Type</Text>
            <Select
              value={targetType}
              onChange={(_e, d) => {
                setTargetType(d.value);
                setCursor(undefined);
              }}
            >
              <option value="">All entities</option>
              {ENTITY_TYPES.filter(Boolean).map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </Select>
          </div>

          <div className={styles.filterField}>
            <Text className={styles.filterLabel}>From</Text>
            <Input
              type="date"
              value={startDate}
              onChange={(_e, d) => {
                setStartDate(d.value);
                setCursor(undefined);
              }}
            />
          </div>

          <div className={styles.filterField}>
            <Text className={styles.filterLabel}>To</Text>
            <Input
              type="date"
              value={endDate}
              onChange={(_e, d) => {
                setEndDate(d.value);
                setCursor(undefined);
              }}
            />
          </div>

          {hasFilters && (
            <Button
              icon={<DismissRegular />}
              appearance="subtle"
              onClick={clearFilters}
            >
              Clear
            </Button>
          )}
        </div>
      </Card>

      {/* Table */}
      {isLoading ? (
        <LoadingSkeleton variant="table" rows={10} />
      ) : entries.length === 0 ? (
        <EmptyState
          title="No audit events found"
          description={
            hasFilters
              ? 'Try adjusting your filters.'
              : 'No events have been recorded yet.'
          }
          icon={<FilterRegular />}
        />
      ) : (
        <Card>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th} style={{ width: '32px' }} />
                <th className={styles.th}>Timestamp</th>
                <th className={styles.th}>Event</th>
                <th className={styles.th}>Actor</th>
                <th className={styles.th}>Entity</th>
                <th className={styles.th}>IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <>
                  <tr
                    key={entry.id}
                    className={styles.expandRow}
                    onClick={() => toggleRow(entry.id)}
                  >
                    <td className={styles.td}>
                      {expandedId === entry.id ? (
                        <ChevronDownRegular />
                      ) : (
                        <ChevronRightRegular />
                      )}
                    </td>
                    <td className={styles.td}>
                      <span className={styles.timestamp}>
                        {formatTimestamp(entry.createdAt)}
                      </span>
                    </td>
                    <td className={styles.td}>
                      <Badge appearance="outline" size="small">
                        {formatAction(entry.action)}
                      </Badge>
                    </td>
                    <td className={styles.td}>
                      {entry.actorEmail ?? (
                        <Text italic size={200}>
                          system
                        </Text>
                      )}
                    </td>
                    <td className={styles.td}>
                      {entry.targetType && (
                        <Tooltip
                          content={entry.targetId ?? ''}
                          relationship="description"
                        >
                          <Badge appearance="tint" size="small">
                            {entry.targetType}
                          </Badge>
                        </Tooltip>
                      )}
                    </td>
                    <td className={styles.td}>
                      <Text size={200}>{entry.ipAddress ?? '—'}</Text>
                    </td>
                  </tr>
                  {expandedId === entry.id && (
                    <tr key={`${entry.id}-detail`}>
                      <td colSpan={6} className={styles.td}>
                        <div className={styles.expandedDetails}>
                          {JSON.stringify(
                            {
                              id: entry.id,
                              action: entry.action,
                              actorId: entry.actorId,
                              actorEmail: entry.actorEmail,
                              targetType: entry.targetType,
                              targetId: entry.targetId,
                              organizationId: entry.organizationId,
                              ipAddress: entry.ipAddress,
                              metadata: entry.metadata,
                              createdAt: entry.createdAt,
                            },
                            null,
                            2,
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Pagination */}
      {pagination && (
        <div className={styles.pagination}>
          <Button
            appearance="subtle"
            disabled={!cursor}
            onClick={() => setCursor(undefined)}
          >
            First
          </Button>
          <Button
            appearance="outline"
            disabled={!pagination.nextCursor}
            onClick={() => setCursor(pagination.nextCursor)}
          >
            Next Page
          </Button>
        </div>
      )}
    </div>
  );
}
