/**
 * Tests for the version command.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock credential-store
vi.mock('../../src/credential-store.js', () => ({
  loadCredentials: vi.fn(),
}));

// Mock metadata
vi.mock('../../src/auth/metadata.js', () => ({
  fetchHealthStatus: vi.fn(),
}));

// Mock output
vi.mock('../../src/output.js', () => ({
  printJson: vi.fn(),
}));

import { loadCredentials } from '../../src/credential-store.js';
import { fetchHealthStatus } from '../../src/auth/metadata.js';
import { printJson } from '../../src/output.js';
import { CLI_VERSION } from '../../src/commands/version.js';

/** Sentinel error thrown by our process.exit mock */
class ExitError extends Error {
  constructor(public code: number) {
    super(`process.exit(${code})`);
  }
}

describe('version command', () => {
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation((code) => { throw new ExitError(code as number); });
  });

  it('exports a CLI_VERSION constant', () => {
    expect(CLI_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('displays version info in table format', async () => {
    vi.mocked(loadCredentials).mockReturnValue(null);

    const { versionCommand } = await import('../../src/commands/version.js');
    await expect(
      versionCommand.handler({ json: false, verbose: false, insecure: false, force: false, _: ['version'], $0: 'porta' }),
    ).rejects.toThrow(ExitError);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Porta CLI'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Porta SDK'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Node.js'));
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('displays version info in JSON format', async () => {
    vi.mocked(loadCredentials).mockReturnValue(null);

    const { versionCommand } = await import('../../src/commands/version.js');
    await expect(
      versionCommand.handler({ json: true, verbose: false, insecure: false, force: false, _: ['version'], $0: 'porta' }),
    ).rejects.toThrow(ExitError);

    expect(printJson).toHaveBeenCalledWith(
      expect.objectContaining({
        cli: CLI_VERSION,
        sdk: expect.any(String),
        node: expect.stringMatching(/^v\d+/),
        server: 'not configured',
      }),
    );
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('checks server health when credentials exist', async () => {
    vi.mocked(loadCredentials).mockReturnValue({
      server: 'https://porta.local:3443',
      orgSlug: 'porta-admin',
      clientId: 'test',
      accessToken: 'token',
      refreshToken: 'refresh',
      idToken: 'id',
      expiresAt: '2099-01-01T00:00:00Z',
      userInfo: { sub: 'user-1', email: 'admin@test.com' },
    });
    vi.mocked(fetchHealthStatus).mockResolvedValue({ status: 'ok' });

    const { versionCommand } = await import('../../src/commands/version.js');
    await expect(
      versionCommand.handler({ json: true, verbose: false, insecure: false, force: false, _: ['version'], $0: 'porta' }),
    ).rejects.toThrow(ExitError);

    expect(fetchHealthStatus).toHaveBeenCalledWith('https://porta.local:3443');
    expect(printJson).toHaveBeenCalledWith(
      expect.objectContaining({ server: 'reachable', serverUrl: 'https://porta.local:3443' }),
    );
  });

  it('shows unreachable when server cannot be reached', async () => {
    vi.mocked(loadCredentials).mockReturnValue({
      server: 'https://porta.local:3443',
      orgSlug: 'porta-admin',
      clientId: 'test',
      accessToken: 'token',
      refreshToken: 'refresh',
      idToken: 'id',
      expiresAt: '2099-01-01T00:00:00Z',
      userInfo: { sub: 'user-1', email: 'admin@test.com' },
    });
    vi.mocked(fetchHealthStatus).mockResolvedValue(null);

    const { versionCommand } = await import('../../src/commands/version.js');
    await expect(
      versionCommand.handler({ json: true, verbose: false, insecure: false, force: false, _: ['version'], $0: 'porta' }),
    ).rejects.toThrow(ExitError);

    expect(printJson).toHaveBeenCalledWith(expect.objectContaining({ server: 'unreachable' }));
  });

  it('respects --server flag over credentials', async () => {
    vi.mocked(loadCredentials).mockReturnValue(null);
    vi.mocked(fetchHealthStatus).mockResolvedValue({ status: 'ok' });

    const { versionCommand } = await import('../../src/commands/version.js');
    await expect(
      versionCommand.handler({ server: 'https://custom-server.example.com', json: true, verbose: false, insecure: false, force: false, _: ['version'], $0: 'porta' }),
    ).rejects.toThrow(ExitError);

    expect(fetchHealthStatus).toHaveBeenCalledWith('https://custom-server.example.com');
  });
});
