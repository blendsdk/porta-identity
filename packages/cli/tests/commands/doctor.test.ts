/**
 * Tests for the doctor command.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock credential-store
vi.mock('../../src/credential-store.js', () => ({
  loadCredentials: vi.fn(),
  isTokenExpired: vi.fn(),
  getCredentialsPath: vi.fn().mockReturnValue('/home/test/.porta/credentials.json'),
  hasCredentials: vi.fn(),
}));

// Mock metadata
vi.mock('../../src/auth/metadata.js', () => ({
  fetchHealthStatus: vi.fn(),
  fetchAdminMetadata: vi.fn(),
}));

// Mock output
vi.mock('../../src/output.js', () => ({
  printJson: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { loadCredentials, isTokenExpired, hasCredentials } from '../../src/credential-store.js';
import { fetchHealthStatus, fetchAdminMetadata } from '../../src/auth/metadata.js';
import { printJson, success } from '../../src/output.js';

/** Sentinel error thrown by our process.exit mock */
class ExitError extends Error {
  constructor(public code: number) {
    super(`process.exit(${code})`);
  }
}

describe('doctor command', () => {
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  const mockCreds = {
    server: 'https://porta.local:3443',
    orgSlug: 'porta-admin',
    clientId: 'test-client-id-long',
    accessToken: 'token',
    refreshToken: 'refresh',
    idToken: 'id',
    expiresAt: '2099-01-01T00:00:00Z',
    userInfo: { sub: 'user-1', email: 'admin@example.com' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation((code) => { throw new ExitError(code as number); });
  });

  it('runs all checks and shows results in table format', async () => {
    vi.mocked(hasCredentials).mockReturnValue(true);
    vi.mocked(loadCredentials).mockReturnValue(mockCreds);
    vi.mocked(isTokenExpired).mockReturnValue(false);
    vi.mocked(fetchHealthStatus).mockResolvedValue({ status: 'ok' });
    vi.mocked(fetchAdminMetadata).mockResolvedValue({
      issuer: 'https://porta.local:3443/porta-admin',
      clientId: 'test-client-id-long',
      orgSlug: 'porta-admin',
    });

    const { doctorCommand } = await import('../../src/commands/doctor.js');
    await expect(
      doctorCommand.handler({ json: false, verbose: false, insecure: false, force: false, _: ['doctor'], $0: 'porta' }),
    ).rejects.toThrow(ExitError);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Diagnostics'));
    expect(success).toHaveBeenCalledWith('All checks passed');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('runs all checks and outputs JSON', async () => {
    vi.mocked(hasCredentials).mockReturnValue(true);
    vi.mocked(loadCredentials).mockReturnValue(mockCreds);
    vi.mocked(isTokenExpired).mockReturnValue(false);
    vi.mocked(fetchHealthStatus).mockResolvedValue({ status: 'ok' });
    vi.mocked(fetchAdminMetadata).mockResolvedValue({
      issuer: 'https://porta.local:3443/porta-admin',
      clientId: 'test-client-id-long',
      orgSlug: 'porta-admin',
    });

    const { doctorCommand } = await import('../../src/commands/doctor.js');
    await expect(
      doctorCommand.handler({ json: true, verbose: false, insecure: false, force: false, _: ['doctor'], $0: 'porta' }),
    ).rejects.toThrow(ExitError);

    expect(printJson).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Node.js version', status: 'pass' }),
        expect.objectContaining({ name: 'Credentials', status: 'pass' }),
        expect.objectContaining({ name: 'Token validity', status: 'pass' }),
        expect.objectContaining({ name: 'Server health', status: 'pass' }),
        expect.objectContaining({ name: 'Admin metadata', status: 'pass' }),
      ]),
    );
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('warns when no credentials found', async () => {
    vi.mocked(hasCredentials).mockReturnValue(false);
    vi.mocked(loadCredentials).mockReturnValue(null);
    vi.mocked(fetchHealthStatus).mockResolvedValue(null);
    vi.mocked(fetchAdminMetadata).mockRejectedValue(new Error('Cannot connect'));

    const { doctorCommand } = await import('../../src/commands/doctor.js');
    await expect(
      doctorCommand.handler({ json: true, verbose: false, insecure: false, force: false, _: ['doctor'], $0: 'porta' }),
    ).rejects.toThrow(ExitError);

    expect(printJson).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Credentials', status: 'warn' }),
        expect.objectContaining({ name: 'Token validity', status: 'warn' }),
      ]),
    );
  });

  it('shows failure when server is unreachable', async () => {
    vi.mocked(hasCredentials).mockReturnValue(true);
    vi.mocked(loadCredentials).mockReturnValue(mockCreds);
    vi.mocked(isTokenExpired).mockReturnValue(false);
    vi.mocked(fetchHealthStatus).mockResolvedValue(null);
    vi.mocked(fetchAdminMetadata).mockRejectedValue(new Error('Cannot connect'));

    const { doctorCommand } = await import('../../src/commands/doctor.js');
    await expect(
      doctorCommand.handler({ json: true, verbose: false, insecure: false, force: false, _: ['doctor'], $0: 'porta' }),
    ).rejects.toThrow(ExitError);

    expect(printJson).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Server health', status: 'fail' }),
        expect.objectContaining({ name: 'Admin metadata', status: 'fail' }),
      ]),
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('warns about expired tokens', async () => {
    vi.mocked(hasCredentials).mockReturnValue(true);
    vi.mocked(loadCredentials).mockReturnValue(mockCreds);
    vi.mocked(isTokenExpired).mockReturnValue(true);
    vi.mocked(fetchHealthStatus).mockResolvedValue({ status: 'ok' });
    vi.mocked(fetchAdminMetadata).mockResolvedValue({
      issuer: 'test',
      clientId: 'test-client-id-long',
      orgSlug: 'porta-admin',
    });

    const { doctorCommand } = await import('../../src/commands/doctor.js');
    await expect(
      doctorCommand.handler({ json: true, verbose: false, insecure: false, force: false, _: ['doctor'], $0: 'porta' }),
    ).rejects.toThrow(ExitError);

    expect(printJson).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Token validity', status: 'warn' }),
      ]),
    );
  });

  it('skips network checks when no server configured', async () => {
    vi.mocked(hasCredentials).mockReturnValue(false);
    vi.mocked(loadCredentials).mockReturnValue(null);

    const { doctorCommand } = await import('../../src/commands/doctor.js');
    await expect(
      doctorCommand.handler({ json: true, verbose: false, insecure: false, force: false, _: ['doctor'], $0: 'porta' }),
    ).rejects.toThrow(ExitError);

    expect(fetchHealthStatus).not.toHaveBeenCalled();
    expect(fetchAdminMetadata).not.toHaveBeenCalled();
    expect(printJson).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Server health', status: 'warn' }),
        expect.objectContaining({ name: 'Admin metadata', status: 'warn' }),
      ]),
    );
  });
});
