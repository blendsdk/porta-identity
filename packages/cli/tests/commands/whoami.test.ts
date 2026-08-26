/**
 * Tests for the whoami command.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock credential-store
vi.mock('../../src/credential-store.js', () => ({
  loadCredentials: vi.fn(),
  isTokenExpired: vi.fn(),
}));

// Mock output
vi.mock('../../src/output.js', () => ({
  printJson: vi.fn(),
  warn: vi.fn(),
}));

import { loadCredentials, isTokenExpired } from '../../src/credential-store.js';
import { printJson, warn } from '../../src/output.js';

/** Sentinel error thrown by our process.exit mock */
class ExitError extends Error {
  constructor(public code: number) {
    super(`process.exit(${code})`);
  }
}

describe('whoami command', () => {
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  const mockCreds = {
    server: 'https://porta.local:3443',
    orgSlug: 'porta-admin',
    clientId: 'test-client',
    accessToken: 'token',
    refreshToken: 'refresh',
    idToken: 'id',
    expiresAt: '2099-01-01T00:00:00Z',
    userInfo: { sub: 'user-1', email: 'admin@example.com', name: 'Admin' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation((code) => { throw new ExitError(code as number); });
  });

  it('displays user identity in table format', async () => {
    vi.mocked(loadCredentials).mockReturnValue(mockCreds);
    vi.mocked(isTokenExpired).mockReturnValue(false);

    const { whoamiCommand } = await import('../../src/commands/whoami.js');
    await expect(
      whoamiCommand.handler({ json: false, verbose: false, insecure: false, force: false, _: ['whoami'], $0: 'porta' }),
    ).rejects.toThrow(ExitError);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('admin@example.com'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Admin'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('user-1'));
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('displays user identity in JSON format', async () => {
    vi.mocked(loadCredentials).mockReturnValue(mockCreds);
    vi.mocked(isTokenExpired).mockReturnValue(false);

    const { whoamiCommand } = await import('../../src/commands/whoami.js');
    await expect(
      whoamiCommand.handler({ json: true, verbose: false, insecure: false, force: false, _: ['whoami'], $0: 'porta' }),
    ).rejects.toThrow(ExitError);

    expect(printJson).toHaveBeenCalledWith(
      expect.objectContaining({
        server: 'https://porta.local:3443',
        email: 'admin@example.com',
        expired: false,
      }),
    );
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('warns when not logged in', async () => {
    vi.mocked(loadCredentials).mockReturnValue(null);

    const { whoamiCommand } = await import('../../src/commands/whoami.js');
    await expect(
      whoamiCommand.handler({ json: false, verbose: false, insecure: false, force: false, _: ['whoami'], $0: 'porta' }),
    ).rejects.toThrow(ExitError);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Not logged in'));
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('warns when token is expired', async () => {
    vi.mocked(loadCredentials).mockReturnValue(mockCreds);
    vi.mocked(isTokenExpired).mockReturnValue(true);

    const { whoamiCommand } = await import('../../src/commands/whoami.js');
    await expect(
      whoamiCommand.handler({ json: false, verbose: false, insecure: false, force: false, _: ['whoami'], $0: 'porta' }),
    ).rejects.toThrow(ExitError);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('expired'));
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('includes expired flag in JSON output when token expired', async () => {
    vi.mocked(loadCredentials).mockReturnValue(mockCreds);
    vi.mocked(isTokenExpired).mockReturnValue(true);

    const { whoamiCommand } = await import('../../src/commands/whoami.js');
    await expect(
      whoamiCommand.handler({ json: true, verbose: false, insecure: false, force: false, _: ['whoami'], $0: 'porta' }),
    ).rejects.toThrow(ExitError);

    expect(printJson).toHaveBeenCalledWith(
      expect.objectContaining({ expired: true }),
    );
  });
});
