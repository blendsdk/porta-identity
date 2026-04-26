/**
 * Dashboard page.
 *
 * Displays system-wide or org-scoped admin dashboard with:
 * - Stats cards row (orgs, apps, clients, users, active sessions, audit events)
 * - Login activity line chart (Recharts, 30-day with day/week/month toggle)
 * - Recent activity feed (last 10 audit events)
 * - Quick action buttons (Create Org, Invite User, View Audit)
 *
 * When an organization is selected via OrgSelector, the dashboard
 * automatically switches to org-scoped stats and activity.
 */

import { useState, useMemo } from 'react';
import {
  Text,
  Button,
  makeStyles,
  tokens,
  Card,
  CardHeader,
  Divider,
  Badge,
  Spinner,
  mergeClasses,
} from '@fluentui/react-components';
import {
  BuildingRegular,
  AppsRegular,
  KeyRegular,
  PeopleRegular,
  PersonRegular,
  ShieldKeyholeRegular,
  ClipboardTextRegular,
  AddRegular,
  PersonAddRegular,
  ArrowRightRegular,
} from '@fluentui/react-icons';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useNavigate } from 'react-router';
import { useOverviewStats, useOrgStats } from '../api/stats';
import { useAuditLog } from '../api/audit';
import { useOrgContext } from '../hooks/useOrgContext';
import { StatsCard } from '../components/StatsCard';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import type { StatsOverview, OrgStats, AuditEntry } from '../types';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXL,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  chartCard: {
    padding: tokens.spacingHorizontalL,
  },
  chartHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacingVerticalM,
  },
  chartToggle: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
  },
  chartContainer: {
    width: '100%',
    height: '280px',
  },
  bottomRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingHorizontalL,
    '@media (max-width: 900px)': {
      gridTemplateColumns: '1fr',
    },
  },
  activityCard: {
    padding: tokens.spacingHorizontalL,
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalM,
  },
  activityItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
    paddingBottom: tokens.spacingVerticalS,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  activityContent: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
  },
  activityTime: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  quickActionsCard: {
    padding: tokens.spacingHorizontalL,
  },
  quickActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalM,
  },
  toggleActive: {
    fontWeight: tokens.fontWeightSemibold,
  },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Time window toggle option for the login chart */
type ChartWindow = '24h' | '7d' | '30d';

/** Single data point for the login activity chart */
interface ChartDataPoint {
  label: string;
  successful: number;
  failed: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a relative timestamp for the activity feed.
 * Shows "Xm ago", "Xh ago", or the date.
 */
function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(isoDate).toLocaleDateString();
}

/**
 * Build chart data points from the login activity windows.
 * The backend provides aggregated windows (24h, 7d, 30d), so we
 * display them as summary bars rather than daily breakdowns.
 */
function buildChartData(
  loginActivity: StatsOverview['loginActivity'],
  window: ChartWindow,
): ChartDataPoint[] {
  const windowData = loginActivity[
    window === '24h' ? 'last24h' : window === '7d' ? 'last7d' : 'last30d'
  ];
  // Show as a single summary point for the selected window
  const labels: Record<ChartWindow, string> = {
    '24h': 'Last 24 Hours',
    '7d': 'Last 7 Days',
    '30d': 'Last 30 Days',
  };
  return [
    {
      label: labels[window],
      successful: windowData.successful,
      failed: windowData.failed,
    },
  ];
}

/**
 * Format an audit action string for display.
 * Converts "org.created" to "Organization Created" etc.
 */
function formatAction(action: string | undefined | null): string {
  if (!action) return 'Unknown Action';
  return action
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Stats cards for system-wide overview */
function OverviewStatsCards({ stats }: { stats: StatsOverview }) {
  return (
    <>
      <StatsCard
        title="Organizations"
        value={stats.organizations.total}
        icon={<BuildingRegular />}
      />
      <StatsCard
        title="Applications"
        value={stats.applications.total}
        icon={<AppsRegular />}
      />
      <StatsCard
        title="Clients"
        value={stats.clients.total}
        icon={<KeyRegular />}
      />
      <StatsCard
        title="Users"
        value={stats.users.total}
        icon={<PeopleRegular />}
        trend={
          stats.users.newLast7d > 0
            ? { value: stats.users.newLast7d, direction: 'up' as const }
            : undefined
        }
        trendLabel="new this week"
      />
      <StatsCard
        title="Active Sessions"
        value={stats.loginActivity.last24h.successful}
        icon={<ShieldKeyholeRegular />}
      />
      <StatsCard
        title="Failed Logins (24h)"
        value={stats.loginActivity.last24h.failed}
        icon={<PersonRegular />}
        trend={
          stats.loginActivity.last24h.failed > 10
            ? {
                value: stats.loginActivity.last24h.failed,
                direction: 'up' as const,
              }
            : undefined
        }
      />
    </>
  );
}

/** Stats cards for org-scoped view */
function OrgStatsCards({ stats }: { stats: OrgStats }) {
  return (
    <>
      <StatsCard
        title="Users"
        value={stats.users.total}
        icon={<PeopleRegular />}
        trend={
          stats.users.newLast7d > 0
            ? { value: stats.users.newLast7d, direction: 'up' as const }
            : undefined
        }
        trendLabel="new this week"
      />
      <StatsCard
        title="Clients"
        value={stats.clients.total}
        icon={<KeyRegular />}
      />
      <StatsCard
        title="Applications"
        value={stats.applications}
        icon={<AppsRegular />}
      />
      <StatsCard
        title="Logins (24h)"
        value={stats.loginActivity.last24h.successful}
        icon={<ShieldKeyholeRegular />}
      />
      <StatsCard
        title="Failed Logins (24h)"
        value={stats.loginActivity.last24h.failed}
        icon={<PersonRegular />}
      />
    </>
  );
}

/** Login activity chart with time window toggle */
function LoginActivityChart({
  loginActivity,
}: {
  loginActivity: StatsOverview['loginActivity'];
}) {
  const styles = useStyles();
  const [window, setWindow] = useState<ChartWindow>('30d');
  const data = useMemo(
    () => buildChartData(loginActivity, window),
    [loginActivity, window],
  );

  return (
    <Card className={styles.chartCard}>
      <div className={styles.chartHeader}>
        <Text size={500} weight="semibold">
          Login Activity
        </Text>
        <div className={styles.chartToggle}>
          {(['24h', '7d', '30d'] as ChartWindow[]).map((w) => (
            <Button
              key={w}
              size="small"
              appearance={window === w ? 'primary' : 'subtle'}
              className={window === w ? styles.toggleActive : undefined}
              onClick={() => setWindow(w)}
            >
              {w}
            </Button>
          ))}
        </div>
      </div>
      <div className={styles.chartContainer}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="successful"
              stroke="#0f6cbd"
              strokeWidth={2}
              name="Successful"
            />
            <Line
              type="monotone"
              dataKey="failed"
              stroke="#c4314b"
              strokeWidth={2}
              name="Failed"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/** Recent activity feed showing last audit events */
function ActivityFeed({ entries }: { entries: AuditEntry[] }) {
  const styles = useStyles();

  if (entries.length === 0) {
    return (
      <Text size={300} italic>
        No recent activity.
      </Text>
    );
  }

  return (
    <div className={styles.activityList}>
      {entries.map((entry) => (
        <div key={entry.id} className={styles.activityItem}>
          <Badge appearance="outline" size="small">
            {entry.eventCategory ?? 'system'}
          </Badge>
          <div className={styles.activityContent}>
            <Text size={300} weight="semibold">
              {formatAction(entry.eventType)}
            </Text>
            <Text size={200} className={styles.activityTime}>
              {entry.actorId ?? 'system'} &middot;{' '}
              {formatRelativeTime(entry.createdAt)}
            </Text>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Quick action buttons for common admin tasks */
function QuickActions() {
  const styles = useStyles();
  const navigate = useNavigate();

  return (
    <div className={styles.quickActions}>
      <Button
        appearance="primary"
        icon={<AddRegular />}
        onClick={() => navigate('/organizations/new')}
      >
        Create Organization
      </Button>
      <Button
        appearance="outline"
        icon={<PersonAddRegular />}
        onClick={() => navigate('/users/invite')}
      >
        Invite User
      </Button>
      <Button
        appearance="subtle"
        icon={<ArrowRightRegular />}
        iconPosition="after"
        onClick={() => navigate('/audit')}
      >
        View Audit Log
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

/**
 * Admin dashboard page.
 *
 * Automatically switches between system-wide and org-scoped views
 * based on the organization context selection. Shows loading skeletons
 * while data is being fetched.
 */
export function Dashboard() {
  const styles = useStyles();
  const { selectedOrg, selectedOrgId } = useOrgContext();
  const isOrgScoped = !!selectedOrgId;

  // Fetch system-wide stats (always, for the chart and fallback)
  const overviewQuery = useOverviewStats();
  // Fetch org-scoped stats when an org is selected
  const orgQuery = useOrgStats(selectedOrgId);

  // Fetch recent audit events for the activity feed (last 10)
  const auditParams = useMemo(
    () => ({
      limit: '10',
      ...(selectedOrgId ? { organizationId: selectedOrgId } : {}),
    }),
    [selectedOrgId],
  );
  const auditQuery = useAuditLog(auditParams);

  // Determine loading state
  const isLoading = isOrgScoped
    ? orgQuery.isLoading
    : overviewQuery.isLoading;

  // Title reflects the current scope
  const title = isOrgScoped
    ? `Dashboard — ${selectedOrg?.name ?? 'Organization'}`
    : 'Dashboard';

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <Text as="h1" size={800} weight="bold">
          {title}
        </Text>
        {overviewQuery.data?.systemHealth && (
          <Badge
            appearance="filled"
            color={
              overviewQuery.data.systemHealth.database &&
              overviewQuery.data.systemHealth.redis
                ? 'success'
                : 'danger'
            }
          >
            System{' '}
            {overviewQuery.data.systemHealth.database &&
            overviewQuery.data.systemHealth.redis
              ? 'Healthy'
              : 'Degraded'}
          </Badge>
        )}
      </div>

      {/* Stats Cards Row */}
      <div className={styles.statsRow}>
        {isLoading ? (
          <LoadingSkeleton variant="card" count={6} />
        ) : isOrgScoped && orgQuery.data ? (
          <OrgStatsCards stats={orgQuery.data} />
        ) : overviewQuery.data ? (
          <OverviewStatsCards stats={overviewQuery.data} />
        ) : null}
      </div>

      {/* Login Activity Chart — only shown for system-wide view */}
      {!isOrgScoped && overviewQuery.data?.loginActivity && (
        <LoginActivityChart loginActivity={overviewQuery.data.loginActivity} />
      )}

      {/* Org-scoped chart */}
      {isOrgScoped && orgQuery.data?.loginActivity && (
        <LoginActivityChart
          loginActivity={
            // OrgStats has the same loginActivity shape
            orgQuery.data.loginActivity as StatsOverview['loginActivity']
          }
        />
      )}

      {/* Bottom Row: Activity Feed + Quick Actions */}
      <div className={styles.bottomRow}>
        <Card className={styles.activityCard}>
          <CardHeader
            header={
              <Text size={500} weight="semibold">
                Recent Activity
              </Text>
            }
          />
          <Divider />
          {auditQuery.isLoading ? (
            <LoadingSkeleton variant="table" rows={5} />
          ) : (
            <ActivityFeed
              entries={(auditQuery.data as any)?.data ?? []}
            />
          )}
        </Card>

        <Card className={styles.quickActionsCard}>
          <CardHeader
            header={
              <Text size={500} weight="semibold">
                Quick Actions
              </Text>
            }
          />
          <Divider />
          <QuickActions />
        </Card>
      </div>
    </div>
  );
}
