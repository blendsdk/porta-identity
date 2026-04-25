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
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const mockRevokeMutate = vi.fn();
const mockBulkRevokeMutate = vi.fn();

const mockSessions = [
  {
    id: 'sess-1',
    userId: 'u1',
    userEmail: 'user1@test.com',
    organizationId: 'org-00001',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0 Chrome/120',
    lastActivityAt: '2026-04-20T10:00:00Z',
    expiresAt: '2026-04-21T10:00:00Z',
    createdAt: '2026-04-20T08:00:00Z',
  },
  {
    id: 'sess-2',
    userId: 'u2',
    userEmail: 'user2@test.com',
    organizationId: 'org-00002',
    ipAddress: '10.0.0.1',
    userAgent: 'Mozilla/5.0 Firefox/121',
    lastActivityAt: '2026-04-20T09:30:00Z',
    expiresAt: '2026-04-21T09:30:00Z',
    createdAt: '2026-04-20T07:00:00Z',
  },
];

vi.mock('../../../src/client/api/sessions', () => ({
  useSessions: vi.fn(() => ({
    data: {
      data: mockSessions,
      pagination: { hasMore: false, nextCursor: null },
    },
    isLoading: false,
    error: null,
  })),
  useRevokeSession: vi.fn(() => ({
    mutate: mockRevokeMutate,
    mutateAsync: mockRevokeMutate,
    isPending: false,
  })),
  useBulkRevokeSessions: vi.fn(() => ({
    mutate: mockBulkRevokeMutate,
    mutateAsync: mockBulkRevokeMutate,
    isPending: false,
  })),
}));

vi.mock('../../../src/client/hooks/useOrgContext', () => ({
  useOrgContext: vi.fn(() => ({
    selectedOrgId: null,
    selectedOrg: null,
  })),
}));

vi.mock('../../../src/client/hooks/useToast', () => ({
  useToast: vi.fn(() => ({
    showToast: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  })),
}));

import { SessionList } from '../../../src/client/pages/sessions/SessionList';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function renderWithProvider(ui: React.ReactElement) {
  return render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>);
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('SessionList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the sessions title', () => {
    renderWithProvider(<SessionList />);
    expect(screen.getByText(/Active Sessions/i)).toBeDefined();
  });

  it('should render session user emails', () => {
    renderWithProvider(<SessionList />);
    expect(screen.getByText('user1@test.com')).toBeDefined();
    expect(screen.getByText('user2@test.com')).toBeDefined();
  });

  it('should render IP addresses', () => {
    renderWithProvider(<SessionList />);
    expect(screen.getByText('192.168.1.1')).toBeDefined();
    expect(screen.getByText('10.0.0.1')).toBeDefined();
  });

  it('should render truncated organization IDs', () => {
    renderWithProvider(<SessionList />);
    // Component renders session.organizationId.slice(0, 8)… — matches both
    const orgIds = screen.getAllByText(/org-0000/);
    expect(orgIds.length).toBe(2);
  });

  it('should render action menu triggers for each session', () => {
    renderWithProvider(<SessionList />);
    // Each session row has a menu trigger button (icon-only)
    const buttons = screen.getAllByRole('button');
    // At minimum: "Revoke All" button + 2 row menu triggers
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it('should render both session rows', () => {
    renderWithProvider(<SessionList />);
    // Verify both sessions are rendered via their emails
    expect(screen.getByText('user1@test.com')).toBeDefined();
    expect(screen.getByText('user2@test.com')).toBeDefined();
  });

  it('should render Revoke All button', () => {
    renderWithProvider(<SessionList />);
    expect(screen.getByText('Revoke All')).toBeDefined();
  });

  it('should render loading state', async () => {
    const sessionsModule = await import('../../../src/client/api/sessions');
    vi.mocked(sessionsModule.useSessions).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof sessionsModule.useSessions>);

    renderWithProvider(<SessionList />);
    expect(screen.getByText(/Active Sessions/i)).toBeDefined();
  });

  it('should render empty state when no sessions', async () => {
    const sessionsModule = await import('../../../src/client/api/sessions');
    vi.mocked(sessionsModule.useSessions).mockReturnValue({
      data: { data: [], pagination: { hasMore: false, nextCursor: null } },
      isLoading: false,
      error: null,
    } as ReturnType<typeof sessionsModule.useSessions>);

    renderWithProvider(<SessionList />);
    expect(screen.getByText('No active sessions')).toBeDefined();
  });
});
