/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: (props: { children: React.ReactNode; to: string }) =>
    React.createElement('a', { href: props.to }, props.children),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: (props: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'responsive-container' }, props.children),
  LineChart: (props: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'line-chart' }, props.children),
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

const mockOverviewStats = {
  organizations: { total: 5, active: 4, suspended: 1, archived: 0 },
  applications: { total: 10, active: 8, archived: 2 },
  clients: { total: 15, active: 12, revoked: 3 },
  users: { total: 200, active: 180, invited: 10, suspended: 5, locked: 3, archived: 2 },
  activeSessions: 42,
  loginActivity: {
    last24h: { total: 100, successful: 95, failed: 5 },
    last7d: { total: 600, successful: 570, failed: 30 },
    last30d: { total: 2400, successful: 2300, failed: 100 },
  },
};

const mockOrgStats = {
  organizationId: 'org-1',
  organizationName: 'Acme Corp',
  applications: 3,
  clients: 5,
  users: { total: 50, active: 45, invited: 3, suspended: 1, locked: 1, archived: 0 },
  activeSessions: 8,
  loginActivity: {
    last24h: { total: 20, successful: 18, failed: 2 },
    last7d: { total: 120, successful: 110, failed: 10 },
    last30d: { total: 500, successful: 470, failed: 30 },
  },
};

const mockAuditEntries = [
  {
    id: 'a1',
    action: 'user.login',
    actorId: 'u-admin',
    actorEmail: 'admin@test.com',
    targetType: 'user',
    targetId: 'u1',
    organizationId: 'org-1',
    metadata: null,
    ipAddress: '127.0.0.1',
    createdAt: '2026-04-20T10:00:00Z',
  },
];

vi.mock('../../../src/client/api/stats', () => ({
  useOverviewStats: vi.fn(() => ({
    data: mockOverviewStats,
    isLoading: false,
    error: null,
  })),
  useOrgStats: vi.fn((orgId: string | null) => ({
    data: orgId ? mockOrgStats : null,
    isLoading: false,
    error: null,
  })),
  useDashboardStats: vi.fn(() => ({
    data: mockOverviewStats,
    isLoading: false,
    error: null,
  })),
}));

vi.mock('../../../src/client/api/audit', () => ({
  useAuditLog: vi.fn(() => ({
    data: { data: mockAuditEntries, pagination: { hasMore: false } },
    isLoading: false,
    error: null,
  })),
}));

vi.mock('../../../src/client/hooks/useOrgContext', () => ({
  useOrgContext: vi.fn(() => ({
    selectedOrgId: null,
    selectedOrg: null,
    recentOrgs: [],
    selectOrg: vi.fn(),
    clearSelection: vi.fn(),
  })),
}));

vi.mock('../../../src/client/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { email: 'admin@test.com', name: 'Admin' },
    authenticated: true,
    loading: false,
  })),
}));

import { Dashboard } from '../../../src/client/pages/Dashboard';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function renderWithProvider(ui: React.ReactElement) {
  return render(
    React.createElement(FluentProvider, { theme: webLightTheme }, ui),
  );
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the dashboard title', () => {
    renderWithProvider(React.createElement(Dashboard));
    expect(screen.getByText('Dashboard')).toBeDefined();
  });

  it('should render overview stats cards', () => {
    renderWithProvider(React.createElement(Dashboard));
    expect(screen.getByText('Organizations')).toBeDefined();
    expect(screen.getByText('Applications')).toBeDefined();
    expect(screen.getByText('Clients')).toBeDefined();
    expect(screen.getByText('Users')).toBeDefined();
  });

  it('should render login activity chart section', () => {
    renderWithProvider(React.createElement(Dashboard));
    expect(screen.getByText('Login Activity')).toBeDefined();
  });

  it('should render time window toggle buttons', () => {
    renderWithProvider(React.createElement(Dashboard));
    expect(screen.getByText('24h')).toBeDefined();
    expect(screen.getByText('7d')).toBeDefined();
    expect(screen.getByText('30d')).toBeDefined();
  });

  it('should render recent activity section', () => {
    renderWithProvider(React.createElement(Dashboard));
    expect(screen.getByText('Recent Activity')).toBeDefined();
  });

  it('should render quick actions', () => {
    renderWithProvider(React.createElement(Dashboard));
    expect(screen.getByText('Quick Actions')).toBeDefined();
  });

  it('should show org-scoped stats when org is selected', async () => {
    const { useOrgContext } = await import(
      '../../../src/client/hooks/useOrgContext'
    );
    vi.mocked(useOrgContext).mockReturnValue({
      selectedOrgId: 'org-1',
      selectedOrg: { id: 'org-1', name: 'Acme Corp', slug: 'acme' },
      recentOrgs: [],
      selectOrg: vi.fn(),
      clearSelection: vi.fn(),
    } as ReturnType<typeof useOrgContext>);

    renderWithProvider(React.createElement(Dashboard));
    // Title includes "Acme Corp" but may be broken across elements
    const acmeElements = screen.getAllByText((content) => content.includes('Acme Corp'));
    expect(acmeElements.length).toBeGreaterThanOrEqual(1);
  });

  it('should render loading state without crashing', async () => {
    const statsModule = await import('../../../src/client/api/stats');
    vi.mocked(statsModule.useOverviewStats).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof statsModule.useOverviewStats>);

    renderWithProvider(React.createElement(Dashboard));
    // Title may be "Dashboard" or include org name; just verify it renders
    const dashElements = screen.getAllByText((content) => content.includes('Dashboard'));
    expect(dashElements.length).toBeGreaterThanOrEqual(1);
  });
});
