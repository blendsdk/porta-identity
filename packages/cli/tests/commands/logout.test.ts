/**
 * Tests for the logout command.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock credential-store before importing
vi.mock('../../src/credential-store.js', () => ({
  loadCredentials: vi.fn(),
  clearCredentials: vi.fn(),
}));

// Mock output
vi.mock('../../src/output.js', () => ({
  success: vi.fn(),
  warn: vi.fn(),
}));

import { loadCredentials, clearCredentials } from '../../src/credential-store.js';
import { success, warn } from '../../src/output.js';

/** Sentinel error thrown by our process.exit mock */
class ExitError extends Error {
  constructor(public code: number) {
    super(`process.exit(${code})`);
  }
}

describe('logout command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation((code) => { throw new ExitError(code as number); });
  });

  it('clears credentials and shows success when logged in', async () => {
    const mockCreds = {
      server: 'https://porta.local:3443',
      orgSlug: 'porta-admin',
      clientId: 'test-client',
      accessToken: 'token',
      refreshToken: 'refresh',
      idToken: 'id',
      expiresAt: '2099-01-01T00:00:00Z',
      userInfo: { sub: 'user-1', email: 'admin@example.com' },
    };

    vi.mocked(loadCredentials).mockReturnValue(mockCreds);

    const { logoutCommand } = await import('../../src/commands/logout.js');
    await expect(
      logoutCommand.handler({ json: false, verbose: false, insecure: false, force: false, _: ['logout'], $0: 'porta' }),
    ).rejects.toThrow(ExitError);

    expect(clearCredentials).toHaveBeenCalled();
    expect(success).toHaveBeenCalledWith(expect.stringContaining('admin@example.com'));
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('shows warning when not logged in', async () => {
    vi.mocked(loadCredentials).mockReturnValue(null);

    const { logoutCommand } = await import('../../src/commands/logout.js');
    await expect(
      logoutCommand.handler({ json: false, verbose: false, insecure: false, force: false, _: ['logout'], $0: 'porta' }),
    ).rejects.toThrow(ExitError);

    expect(clearCredentials).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Not logged in'));
    expect(process.exit).toHaveBeenCalledWith(0);
  });
});
