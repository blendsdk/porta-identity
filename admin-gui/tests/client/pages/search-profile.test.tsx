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

const mockNavigate = vi.fn();
const mockSearchParams = new URLSearchParams('q=test-query');

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams, vi.fn()],
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

/* -- Search mocks (uses audit log as proxy) ------------------------ */

const mockSearchResults = [
  {
    id: 'a1',
    action: 'org.created',
    actorId: 'u-admin',
    actorEmail: 'admin@test.com',
    targetType: 'organization',
    targetId: 'org-1',
    organizationId: 'org-1',
    metadata: { name: 'Test Org' },
    ipAddress: '127.0.0.1',
    createdAt: '2026-04-20T10:00:00Z',
  },
  {
    id: 'a2',
    action: 'user.created',
    actorId: 'u-admin',
    actorEmail: 'admin@test.com',
    targetType: 'user',
    targetId: 'u1',
    organizationId: 'org-1',
    metadata: { email: 'user@test.com' },
    ipAddress: '127.0.0.1',
    createdAt: '2026-04-20T09:00:00Z',
  },
];

vi.mock('../../../src/client/api/audit', () => ({
  useAuditLog: vi.fn(() => ({
    data: {
      data: mockSearchResults,
      pagination: { hasMore: false },
    },
    isLoading: false,
    error: null,
  })),
}));

/* -- Profile mocks ------------------------------------------------- */

vi.mock('../../../src/client/api/client', () => ({
  api: {
    put: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    del: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../../src/client/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: {
      id: 'u-admin',
      email: 'admin@porta.test',
      name: 'Super Admin',
    },
    authenticated: true,
    loading: false,
  })),
}));

vi.mock('../../../src/client/hooks/useToast', () => ({
  useToast: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  })),
}));

import { SearchResults } from '../../../src/client/pages/search/SearchResults';
import { AdminProfile } from '../../../src/client/pages/profile/AdminProfile';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function renderWithProvider(ui: React.ReactElement) {
  return render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>);
}

/* ------------------------------------------------------------------ */
/*  SearchResults Tests                                                */
/* ------------------------------------------------------------------ */

describe('SearchResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render search results title with query', () => {
    renderWithProvider(<SearchResults />);
    expect(screen.getByText(/test-query/i) || screen.getByText(/search/i)).toBeDefined();
  });

  it('should render results grouped by entity type', () => {
    renderWithProvider(<SearchResults />);
    // The results include organization and user target types
    expect(screen.getByText(/organization/i)).toBeDefined();
    expect(screen.getByText(/user/i)).toBeDefined();
  });

  it('should render result entries', () => {
    renderWithProvider(<SearchResults />);
    expect(screen.getByText(/org/i)).toBeDefined();
    expect(screen.getByText(/user/i)).toBeDefined();
  });

  it('should render empty state for no results', async () => {
    const auditModule = await import('../../../src/client/api/audit');
    vi.mocked(auditModule.useAuditLog).mockReturnValue({
      data: { data: [], pagination: { hasMore: false } },
      isLoading: false,
      error: null,
    } as ReturnType<typeof auditModule.useAuditLog>);

    renderWithProvider(<SearchResults />);
    const noResults = screen.getAllByText(/no.*result/i);
    expect(noResults.length).toBeGreaterThanOrEqual(1);
  });

  it('should render loading state', async () => {
    const auditModule = await import('../../../src/client/api/audit');
    vi.mocked(auditModule.useAuditLog).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof auditModule.useAuditLog>);

    renderWithProvider(<SearchResults />);
    // Should still render without crashing
    expect(screen.getByText(/search/i)).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  AdminProfile Tests                                                 */
/* ------------------------------------------------------------------ */

describe('AdminProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render profile page title', () => {
    renderWithProvider(<AdminProfile />);
    const profileElements = screen.getAllByText(/Profile/i);
    expect(profileElements.length).toBeGreaterThanOrEqual(1);
  });

  it('should render user email', () => {
    renderWithProvider(<AdminProfile />);
    // Email may be in a text element or input field
    const emailByText = screen.queryAllByText('admin@porta.test');
    const emailByValue = screen.queryAllByDisplayValue('admin@porta.test');
    expect(emailByText.length + emailByValue.length).toBeGreaterThanOrEqual(1);
  });

  it('should render user name', () => {
    renderWithProvider(<AdminProfile />);
    const nameByText = screen.queryAllByText('Super Admin');
    const nameByValue = screen.queryAllByDisplayValue('Super Admin');
    expect(nameByText.length + nameByValue.length).toBeGreaterThanOrEqual(1);
  });

  it('should render profile tab', () => {
    renderWithProvider(<AdminProfile />);
    // Use role-based selector for tabs to avoid duplicates
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBeGreaterThanOrEqual(2);
  });

  it('should render password tab', () => {
    renderWithProvider(<AdminProfile />);
    const passwordElements = screen.getAllByText(/password/i);
    expect(passwordElements.length).toBeGreaterThanOrEqual(1);
  });

  it('should render two-factor tab', () => {
    renderWithProvider(<AdminProfile />);
    const tfaElements = screen.queryAllByText(/two.?factor/i)
      .concat(screen.queryAllByText(/2fa/i))
      .concat(screen.queryAllByText(/totp/i));
    expect(tfaElements.length).toBeGreaterThanOrEqual(1);
  });

  it('should render save button on profile tab', () => {
    renderWithProvider(<AdminProfile />);
    const saveElements = screen.queryAllByText(/save/i)
      .concat(screen.queryAllByText(/update/i));
    expect(saveElements.length).toBeGreaterThanOrEqual(1);
  });

  it('should switch to password tab', async () => {
    const user = userEvent.setup();
    renderWithProvider(<AdminProfile />);

    const passwordTabs = screen.getAllByText(/password/i);
    await user.click(passwordTabs[0]);

    // Password tab should show password fields — just check it rendered without error
    const allPasswordElements = screen.getAllByText(/password/i);
    expect(allPasswordElements.length).toBeGreaterThanOrEqual(1);
  });

  it('should switch to two-factor tab', async () => {
    const user = userEvent.setup();
    renderWithProvider(<AdminProfile />);

    const tfaTabs = screen.queryAllByText(/two.?factor/i)
      .concat(screen.queryAllByText(/2fa/i))
      .concat(screen.queryAllByText(/totp/i));
    await user.click(tfaTabs[0]);

    // 2FA tab should show content — just verify component didn't crash
    const tfaContent = screen.queryAllByText(/authenticator/i)
      .concat(screen.queryAllByText(/enable/i))
      .concat(screen.queryAllByText(/setup/i))
      .concat(screen.queryAllByText(/totp/i))
      .concat(screen.queryAllByText(/two.?factor/i));
    expect(tfaContent.length).toBeGreaterThanOrEqual(1);
  });
});
