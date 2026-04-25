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

/* -- Config mocks -------------------------------------------------- */

const mockUpdateConfig = vi.fn();

const mockConfigEntries = [
  { key: 'session_ttl', value: '3600', description: 'Session time-to-live in seconds' },
  { key: 'max_login_attempts', value: '5', description: 'Maximum login attempts before lockout' },
  { key: 'enable_registration', value: 'true', description: 'Allow self-registration' },
];

vi.mock('../../../src/client/api/config', () => ({
  useSystemConfig: vi.fn(() => ({
    data: mockConfigEntries,
    isLoading: false,
    error: null,
  })),
  useUpdateConfig: vi.fn(() => ({
    mutateAsync: mockUpdateConfig,
    isPending: false,
  })),
}));

/* -- Keys mocks ---------------------------------------------------- */

const mockGenerateKey = vi.fn();
const mockRotateKey = vi.fn();

const mockSigningKeys = [
  {
    id: 'key-1',
    kid: 'abc123def456',
    algorithm: 'ES256',
    status: 'active',
    createdAt: '2026-04-01T00:00:00Z',
  },
  {
    id: 'key-2',
    kid: 'xyz789ghi012',
    algorithm: 'ES256',
    status: 'rotated',
    createdAt: '2026-03-01T00:00:00Z',
  },
];

vi.mock('../../../src/client/api/keys', () => ({
  useSigningKeys: vi.fn(() => ({
    data: mockSigningKeys,
    isLoading: false,
    error: null,
  })),
  useGenerateKey: vi.fn(() => ({
    mutateAsync: mockGenerateKey,
    isPending: false,
  })),
  useRotateKey: vi.fn(() => ({
    mutateAsync: mockRotateKey,
    isPending: false,
  })),
}));

import { ConfigEditor } from '../../../src/client/pages/config/ConfigEditor';
import { SigningKeys } from '../../../src/client/pages/keys/SigningKeys';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function renderWithProvider(ui: React.ReactElement) {
  return render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>);
}

/* ------------------------------------------------------------------ */
/*  ConfigEditor Tests                                                 */
/* ------------------------------------------------------------------ */

describe('ConfigEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the config title', () => {
    renderWithProvider(<ConfigEditor />);
    expect(screen.getByText(/System Configuration/i)).toBeDefined();
  });

  it('should render config entries in a table', () => {
    renderWithProvider(<ConfigEditor />);
    expect(screen.getByText('session_ttl')).toBeDefined();
    expect(screen.getByText('max_login_attempts')).toBeDefined();
    expect(screen.getByText('enable_registration')).toBeDefined();
  });

  it('should render config values', () => {
    renderWithProvider(<ConfigEditor />);
    expect(screen.getByText('3600')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
    expect(screen.getByText('true')).toBeDefined();
  });

  it('should render type badges', () => {
    renderWithProvider(<ConfigEditor />);
    // Type inference: 3600 → number, 5 → number, true → boolean
    const badges = screen.getAllByText(/number|boolean|duration|string/i);
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('should enter edit mode when clicking edit icon button', async () => {
    const user = userEvent.setup();
    renderWithProvider(<ConfigEditor />);

    // Edit buttons are icon-only buttons in the action column
    const allButtons = screen.getAllByRole('button');
    // Click the first action button (edit icon for session_ttl row)
    await user.click(allButtons[0]);

    // Should show an input field or save/cancel buttons after entering edit mode
    const input = screen.queryByDisplayValue('3600');
    const saveBtn = screen.queryByText(/save/i);
    const cancelBtn = screen.queryByText(/cancel/i);
    expect(input || saveBtn || cancelBtn).toBeTruthy();
  });

  it('should render loading state', async () => {
    const configModule = await import('../../../src/client/api/config');
    vi.mocked(configModule.useSystemConfig).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof configModule.useSystemConfig>);

    renderWithProvider(<ConfigEditor />);
    expect(screen.getByText(/System Configuration/i)).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  SigningKeys Tests                                                   */
/* ------------------------------------------------------------------ */

describe('SigningKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the signing keys title', () => {
    renderWithProvider(<SigningKeys />);
    expect(screen.getByText(/Signing Keys/i)).toBeDefined();
  });

  it('should render key entries', () => {
    renderWithProvider(<SigningKeys />);
    // Key IDs should be rendered (possibly truncated)
    expect(screen.getByText(/abc123/)).toBeDefined();
    expect(screen.getByText(/xyz789/)).toBeDefined();
  });

  it('should render algorithm labels', () => {
    renderWithProvider(<SigningKeys />);
    const es256Labels = screen.getAllByText('ES256');
    expect(es256Labels.length).toBeGreaterThanOrEqual(1);
  });

  it('should render key status', () => {
    renderWithProvider(<SigningKeys />);
    expect(screen.getByText(/active/i)).toBeDefined();
    expect(screen.getByText(/rotated/i)).toBeDefined();
  });

  it('should render generate key button', () => {
    renderWithProvider(<SigningKeys />);
    expect(screen.getByText(/Generate/i)).toBeDefined();
  });

  it('should render rotate keys button', () => {
    renderWithProvider(<SigningKeys />);
    expect(screen.getByText('Rotate Keys')).toBeDefined();
  });

  it('should show confirm dialog when generating a key', async () => {
    const user = userEvent.setup();
    renderWithProvider(<SigningKeys />);

    await user.click(screen.getByText(/Generate/i));
    // Confirm dialog should appear
    expect(
      screen.getByText(/confirm/i) || screen.getByText(/generate.*key/i),
    ).toBeDefined();
  });

  it('should render JWKS endpoint label', () => {
    renderWithProvider(<SigningKeys />);
    expect(screen.getByText('JWKS Endpoint:')).toBeDefined();
  });

  it('should render loading state', async () => {
    const keysModule = await import('../../../src/client/api/keys');
    vi.mocked(keysModule.useSigningKeys).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof keysModule.useSigningKeys>);

    renderWithProvider(<SigningKeys />);
    expect(screen.getByText(/Signing Keys/i)).toBeDefined();
  });
});
