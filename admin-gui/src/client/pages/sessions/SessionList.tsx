/**
 * Session management page.
 *
 * Displays active admin sessions with:
 * - DataGrid showing user, org, IP, created, last active, user agent
 * - Single session revoke with ConfirmDialog
 * - Bulk revoke (by user, by org, or all with TypeToConfirm)
 * - Auto-refresh every 30 seconds via React Query refetchInterval
 */

import { useState, useCallback } from 'react';
import {
  Text,
  Button,
  makeStyles,
  tokens,
  Card,
  Badge,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  Tooltip,
} from '@fluentui/react-components';
import {
  DeleteRegular,
  MoreHorizontalRegular,
  ArrowSyncRegular,
  PersonDeleteRegular,
  BuildingRegular,
  DismissCircleRegular,
} from '@fluentui/react-icons';
import {
  useSessions,
  useRevokeSession,
  useBulkRevokeSessions,
} from '../../api/sessions';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TypeToConfirm } from '../../components/TypeToConfirm';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../hooks/useToast';
import type { AdminSession } from '../../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Auto-refresh interval for the session list (30 seconds) */
const REFRESH_INTERVAL_MS = 30_000;

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
  headerActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
  },
  refreshIndicator: {
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
    verticalAlign: 'middle',
  },
  row: {
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  userAgent: {
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
  },
  typeToConfirmWrapper: {
    marginTop: tokens.spacingVerticalM,
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a date string for table display.
 * Shows relative time for recent dates, full date for older ones.
 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Parse user agent string into a short browser/OS label.
 * Falls back to the raw string if unrecognized.
 */
function parseUserAgent(ua: string | null): string {
  if (!ua) return '—';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  if (ua.length > 40) return ua.slice(0, 40) + '…';
  return ua;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Session list page component.
 *
 * Shows all active admin sessions with auto-refresh,
 * supports single and bulk revocation.
 */
export function SessionList() {
  const styles = useStyles();
  const { showToast } = useToast();

  // Pagination
  const [cursor, setCursor] = useState<string | undefined>();
  const params = cursor ? { cursor, limit: '25' } : { limit: '25' };

  // Fetch sessions with 30s auto-refresh
  const { data, isLoading, dataUpdatedAt } = useSessions(
    params,
    REFRESH_INTERVAL_MS,
  );
  const sessions: AdminSession[] = (data as any)?.data ?? [];
  const pagination = (data as any)?.pagination;

  // Mutations
  const revokeMutation = useRevokeSession();
  const bulkRevokeMutation = useBulkRevokeSessions();

  // Dialog state
  const [revokeTarget, setRevokeTarget] = useState<AdminSession | null>(null);
  const [bulkRevokeMode, setBulkRevokeMode] = useState<
    'user' | 'org' | 'all' | null
  >(null);
  const [bulkRevokeConfirmed, setBulkRevokeConfirmed] = useState(false);

  /** Handle single session revoke confirmation */
  const handleRevoke = useCallback(async () => {
    if (!revokeTarget) return;
    try {
      await revokeMutation.mutateAsync(revokeTarget.id);
      showToast('Session revoked successfully', 'success');
    } catch {
      showToast('Failed to revoke session', 'error');
    }
    setRevokeTarget(null);
  }, [revokeTarget, revokeMutation, showToast]);

  /** Handle bulk revoke confirmation */
  const handleBulkRevoke = useCallback(async () => {
    try {
      if (bulkRevokeMode === 'all') {
        await bulkRevokeMutation.mutateAsync({ all: true });
        showToast('All sessions revoked', 'success');
      } else if (bulkRevokeMode === 'user' && revokeTarget) {
        await bulkRevokeMutation.mutateAsync({ userId: revokeTarget.userId });
        showToast(`All sessions for ${revokeTarget.userEmail} revoked`, 'success');
      } else if (bulkRevokeMode === 'org' && revokeTarget) {
        await bulkRevokeMutation.mutateAsync({
          organizationId: revokeTarget.organizationId,
        });
        showToast('All sessions for organization revoked', 'success');
      }
    } catch {
      showToast('Failed to revoke sessions', 'error');
    }
    setBulkRevokeMode(null);
    setBulkRevokeConfirmed(false);
    setRevokeTarget(null);
  }, [bulkRevokeMode, revokeTarget, bulkRevokeMutation, showToast]);

  /** Close all dialogs */
  const closeBulkDialog = useCallback(() => {
    setBulkRevokeMode(null);
    setBulkRevokeConfirmed(false);
    setRevokeTarget(null);
  }, []);

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <Text as="h1" size={800} weight="bold">
            Active Sessions
          </Text>
          {dataUpdatedAt > 0 && (
            <Text className={styles.refreshIndicator}>
              {' '}
              <ArrowSyncRegular /> Auto-refreshes every 30s
            </Text>
          )}
        </div>
        <div className={styles.headerActions}>
          <Button
            appearance="primary"
            icon={<DismissCircleRegular />}
            onClick={() => setBulkRevokeMode('all')}
            disabled={sessions.length === 0}
          >
            Revoke All
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <LoadingSkeleton variant="table" rows={8} />
      ) : sessions.length === 0 ? (
        <EmptyState
          title="No active sessions"
          description="There are no active admin sessions at this time."
          icon={<PersonDeleteRegular />}
        />
      ) : (
        <Card>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>User</th>
                <th className={styles.th}>Organization</th>
                <th className={styles.th}>IP Address</th>
                <th className={styles.th}>Created</th>
                <th className={styles.th}>Last Active</th>
                <th className={styles.th}>User Agent</th>
                <th className={styles.th} style={{ width: '48px' }} />
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className={styles.row}>
                  <td className={styles.td}>
                    <Text size={300} weight="semibold">
                      {session.userEmail}
                    </Text>
                  </td>
                  <td className={styles.td}>
                    <Badge appearance="tint" size="small">
                      {session.organizationId.slice(0, 8)}…
                    </Badge>
                  </td>
                  <td className={styles.td}>
                    <Text size={200}>{session.ipAddress ?? '—'}</Text>
                  </td>
                  <td className={styles.td}>
                    <Text size={200}>{formatDate(session.createdAt)}</Text>
                  </td>
                  <td className={styles.td}>
                    <Text size={200}>
                      {formatDate(session.lastActivityAt)}
                    </Text>
                  </td>
                  <td className={styles.td}>
                    <Tooltip
                      content={session.userAgent ?? '—'}
                      relationship="description"
                    >
                      <span className={styles.userAgent}>
                        {parseUserAgent(session.userAgent)}
                      </span>
                    </Tooltip>
                  </td>
                  <td className={styles.td}>
                    <Menu>
                      <MenuTrigger>
                        <Button
                          icon={<MoreHorizontalRegular />}
                          appearance="subtle"
                          size="small"
                        />
                      </MenuTrigger>
                      <MenuPopover>
                        <MenuList>
                          <MenuItem
                            icon={<DeleteRegular />}
                            onClick={() => setRevokeTarget(session)}
                          >
                            Revoke Session
                          </MenuItem>
                          <MenuItem
                            icon={<PersonDeleteRegular />}
                            onClick={() => {
                              setRevokeTarget(session);
                              setBulkRevokeMode('user');
                            }}
                          >
                            Revoke All for User
                          </MenuItem>
                          <MenuItem
                            icon={<BuildingRegular />}
                            onClick={() => {
                              setRevokeTarget(session);
                              setBulkRevokeMode('org');
                            }}
                          >
                            Revoke All for Org
                          </MenuItem>
                        </MenuList>
                      </MenuPopover>
                    </Menu>
                  </td>
                </tr>
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

      {/* Single revoke confirm dialog */}
      <ConfirmDialog
        open={!!revokeTarget && !bulkRevokeMode}
        onDismiss={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
        title="Revoke Session"
        destructive
        loading={revokeMutation.isPending}
      >
        <Text>
          Are you sure you want to revoke the session for{' '}
          <strong>{revokeTarget?.userEmail}</strong>? The user will be
          logged out immediately.
        </Text>
      </ConfirmDialog>

      {/* Bulk revoke by user/org dialog */}
      <ConfirmDialog
        open={bulkRevokeMode === 'user' || bulkRevokeMode === 'org'}
        onDismiss={closeBulkDialog}
        onConfirm={handleBulkRevoke}
        title={
          bulkRevokeMode === 'user'
            ? 'Revoke All Sessions for User'
            : 'Revoke All Sessions for Organization'
        }
        destructive
        loading={bulkRevokeMutation.isPending}
      >
        <Text>
          {bulkRevokeMode === 'user'
            ? `This will revoke ALL sessions for ${revokeTarget?.userEmail}. They will be logged out everywhere.`
            : `This will revoke ALL sessions for the organization. All users in the organization will be logged out.`}
        </Text>
      </ConfirmDialog>

      {/* Bulk revoke ALL dialog with TypeToConfirm */}
      <ConfirmDialog
        open={bulkRevokeMode === 'all'}
        onDismiss={closeBulkDialog}
        onConfirm={handleBulkRevoke}
        title="Revoke ALL Sessions"
        destructive
        confirmDisabled={!bulkRevokeConfirmed}
        loading={bulkRevokeMutation.isPending}
      >
        <Text>
          This will terminate <strong>ALL active sessions</strong> across
          the entire system. Every user will be logged out immediately.
        </Text>
        <div className={styles.typeToConfirmWrapper}>
          <TypeToConfirm
            confirmText="REVOKE ALL"
            onConfirmed={setBulkRevokeConfirmed}
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
