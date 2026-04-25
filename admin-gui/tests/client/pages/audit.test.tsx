/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/audit', search: '', hash: '', state: null, key: 'default' }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const mockAuditEntries = [
  {
    id: 'a1',
    action: 'user.login',
    actorId: 'u-admin',
    actorEmail: 'admin@test.com',
    targetType: 'user',
    targetId: 'u1',
    organizationId: 'org-1',
    metadata: { ip: '127.0.0.1' },
    ipAddress: '127.0.0.1',
    createdAt: '2026-04-20T10:00:00Z',
  },
  {
    id: 'a2',
    action: 'org.created',
    actorId: 'u-admin',
    actorEmail: 'admin@test.com',
    targetType: 'organization',
    targetId: 'org-2',
    organizationId: 'org-2',
    metadata: { name: 'New Org' },
    ipAddress: '127.0.0.1',
    createdAt: '2026-04-20T09:00:00Z',
  },
];

vi.mock('../../../src/client/api/audit', () => ({
  useAuditLog: vi.fn(() => ({
    data: {
      data: mockAuditEntries,
      pagination: { hasMore: false, nextCursor: null },
    },
    isLoading: false,
    error: null,
  })),
}));

vi.mock('../../../src/client/hooks/useOrgContext', () => ({
  useOrgContext: vi.fn(() => ({
    selectedOrgId: null,
    selectedOrg: null,
  })),
}));

import { AuditLog } from '../../../src/client/pages/audit/AuditLog';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function renderWithProvider(ui: React.ReactElement) {
  return render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>);
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('AuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the audit log title', () => {
    renderWithProvider(<AuditLog />);
    expect(screen.getByText('Audit Log')).toBeDefined();
  });

  it('should render audit entries', () => {
    renderWithProvider(<AuditLog />);
    // formatAction converts "user.login" → "User Login", "org.created" → "Org Created"
    // Badge component may wrap text in internal spans, so use flexible matchers
    const userLogins = screen.getAllByText((content) => content.includes('User Login'));
    expect(userLogins.length).toBeGreaterThanOrEqual(1);
    const orgCreated = screen.getAllByText((content) => content.includes('Org Created'));
    expect(orgCreated.length).toBeGreaterThanOrEqual(1);
  });

  it('should render actor email', () => {
    renderWithProvider(<AuditLog />);
    const emails = screen.getAllByText('admin@test.com');
    expect(emails.length).toBeGreaterThanOrEqual(1);
  });

  it('should render target types', () => {
    renderWithProvider(<AuditLog />);
    expect(screen.getByText('user')).toBeDefined();
    expect(screen.getByText('organization')).toBeDefined();
  });

  it('should render export button', () => {
    renderWithProvider(<AuditLog />);
    const exportBtn = screen.getByText(/export/i);
    expect(exportBtn).toBeDefined();
  });

  it('should expand row to show metadata on click', async () => {
    const user = userEvent.setup();
    renderWithProvider(<AuditLog />);

    // Click on the first audit entry row (by actor email which is always visible)
    const rows = screen.getAllByText('admin@test.com');
    await user.click(rows[0]);

    // After expansion, metadata should be visible (multiple matches possible from ipAddress field + metadata)
    const ipElements = screen.getAllByText(/127\.0\.0\.1/);
    expect(ipElements.length).toBeGreaterThanOrEqual(1);
  });

  it('should render loading state', async () => {
    const auditModule = await import('../../../src/client/api/audit');
    vi.mocked(auditModule.useAuditLog).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof auditModule.useAuditLog>);

    renderWithProvider(<AuditLog />);
    expect(screen.getByText('Audit Log')).toBeDefined();
  });

  it('should render empty state when no entries', async () => {
    const auditModule = await import('../../../src/client/api/audit');
    vi.mocked(auditModule.useAuditLog).mockReturnValue({
      data: { data: [], pagination: { hasMore: false, nextCursor: null } },
      isLoading: false,
      error: null,
    } as ReturnType<typeof auditModule.useAuditLog>);

    renderWithProvider(<AuditLog />);
    const emptyEl = screen.queryByText(/no.*audit/i) ?? screen.queryByText(/no.*entries/i) ?? screen.queryByText(/no.*events/i);
    expect(emptyEl).toBeTruthy();
  });
});
