/**
 * Unit tests for CLI authentication commands (logout, whoami).
 *
 * Tests the logout and whoami command handlers by mocking the token store
 * and verifying correct output and exit codes. The login command is not
 * tested here due to its browser/server dependencies — it requires
 * integration testing with a running Porta server.
 *
 * @module tests/unit/cli/commands/auth
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — set up before importing the modules under test
// ---------------------------------------------------------------------------

// Mock the token store module
vi.mock('../../../../src/cli/token-store.js', () => ({
  readCredentials: vi.fn(),
  clearCredentials: vi.fn(),
  isTokenExpired: vi.fn(),
  writeCredentials: vi.fn(),
}));

// Mock the CLI output module to capture output
vi.mock('../../../../src/cli/output.js', () => ({
  success: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  printJson: vi.fn(),
}));

// Capture process.exit and console.log — re-mocked in beforeEach
let mockExit: ReturnType<typeof vi.spyOn>;
let mockConsoleLog: ReturnType<typeof vi.spyOn>;

// ---------------------------------------------------------------------------
// Import modules under test and mocked dependencies
// ---------------------------------------------------------------------------
import { logoutCommand } from '../../../../src/cli/commands/logout.js';
import { whoamiCommand } from '../../../../src/cli/commands/whoami.js';
import {
  readCredentials,
  clearCredentials,
  isTokenExpired,
} from '../../../../src/cli/token-store.js';
import { success, warn, printJson } from '../../../../src/cli/output.js';
import type { StoredCredentials } from '../../../../src/cli/token-store.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Creates a valid StoredCredentials object for testing */
function createTestCredentials(overrides: Partial<StoredCredentials> = {}): StoredCredentials {
  return {
    server: 'http://localhost:3000',
    orgSlug: 'porta-admin',
    clientId: 'test-client-id-abc123',
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    idToken: 'test-id-token',
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    userInfo: {
      sub: 'user-uuid-123',
      email: 'admin@example.com',
      name: 'Admin User',
    },
    ...overrides,
  };
}

/** Creates a minimal argv object matching GlobalOptions */
function createArgv(overrides: Record<string, unknown> = {}) {
  return {
    json: false,
    verbose: false,
    force: false,
    'dry-run': false,
    _: [],
    $0: 'porta',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('logout command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply process.exit mock each test — throw to stop execution flow
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should clear credentials and show success message', async () => {
    const creds = createTestCredentials();
    vi.mocked(readCredentials).mockReturnValue(creds);

    // The handler calls process.exit(0) which we mock to throw
    await expect(logoutCommand.handler(createArgv() as never))
      .rejects.toThrow('process.exit called');

    expect(clearCredentials).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledWith(
      expect.stringContaining('Logged out'),
    );
    expect(success).toHaveBeenCalledWith(
      expect.stringContaining('admin@example.com'),
    );
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('should show warning when not logged in', async () => {
    vi.mocked(readCredentials).mockReturnValue(null);

    await expect(logoutCommand.handler(createArgv() as never))
      .rejects.toThrow('process.exit called');

    expect(clearCredentials).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in'),
    );
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('should show "Logged out" without email if email is empty', async () => {
    const creds = createTestCredentials({
      userInfo: { sub: 'user-123', email: '', name: undefined },
    });
    vi.mocked(readCredentials).mockReturnValue(creds);

    await expect(logoutCommand.handler(createArgv() as never))
      .rejects.toThrow('process.exit called');

    expect(clearCredentials).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledWith('Logged out');
  });
});

describe('whoami command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should display user identity in human-readable format', async () => {
    const creds = createTestCredentials();
    vi.mocked(readCredentials).mockReturnValue(creds);
    vi.mocked(isTokenExpired).mockReturnValue(false);

    await expect(whoamiCommand.handler(createArgv() as never))
      .rejects.toThrow('process.exit called');

    // Verify console.log was called with the expected fields
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('admin@example.com'),
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('Admin User'),
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('user-uuid-123'),
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('porta-admin'),
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('localhost:3000'),
    );
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('should display JSON output when --json flag is set', async () => {
    const creds = createTestCredentials();
    vi.mocked(readCredentials).mockReturnValue(creds);
    vi.mocked(isTokenExpired).mockReturnValue(false);

    await expect(whoamiCommand.handler(createArgv({ json: true }) as never))
      .rejects.toThrow('process.exit called');

    expect(printJson).toHaveBeenCalledWith(
      expect.objectContaining({
        server: 'http://localhost:3000',
        orgSlug: 'porta-admin',
        sub: 'user-uuid-123',
        email: 'admin@example.com',
        expired: false,
      }),
    );
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('should warn when access token is expired', async () => {
    const creds = createTestCredentials();
    vi.mocked(readCredentials).mockReturnValue(creds);
    vi.mocked(isTokenExpired).mockReturnValue(true);

    await expect(whoamiCommand.handler(createArgv() as never))
      .rejects.toThrow('process.exit called');

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('expired'),
    );
    // Should still display the user info
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('EXPIRED'),
    );
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('should show "(not set)" when name is undefined', async () => {
    const creds = createTestCredentials({
      userInfo: { sub: 'user-123', email: 'test@test.com', name: undefined },
    });
    vi.mocked(readCredentials).mockReturnValue(creds);
    vi.mocked(isTokenExpired).mockReturnValue(false);

    await expect(whoamiCommand.handler(createArgv() as never))
      .rejects.toThrow('process.exit called');

    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('(not set)'),
    );
  });

  it('should exit with code 1 when not logged in', async () => {
    vi.mocked(readCredentials).mockReturnValue(null);

    await expect(whoamiCommand.handler(createArgv() as never))
      .rejects.toThrow('process.exit called');

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in'),
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should include expired flag in JSON output when token is expired', async () => {
    const creds = createTestCredentials();
    vi.mocked(readCredentials).mockReturnValue(creds);
    vi.mocked(isTokenExpired).mockReturnValue(true);

    await expect(whoamiCommand.handler(createArgv({ json: true }) as never))
      .rejects.toThrow('process.exit called');

    expect(printJson).toHaveBeenCalledWith(
      expect.objectContaining({
        expired: true,
      }),
    );
  });
});
