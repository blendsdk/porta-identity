/**
 * Command wiring regression for `porta login --device-code`.
 *
 * The command must choose the device coordinator, present only the
 * verification URL and user code, and keep the existing browser flow when the
 * flag is absent.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockDeviceLogin = vi.fn();
const mockBrowserLogin = vi.fn();
const mockLoadCredentials = vi.fn();
const mockSaveCredentials = vi.fn();
const mockSuccess = vi.fn();

vi.mock('../../src/auth/device-flow.js', () => ({
  authenticateDeviceCodeSession: (...args: unknown[]) => mockDeviceLogin(...args),
}));

vi.mock('../../src/auth/login-coordinator.js', () => ({
  authenticateCliSession: (...args: unknown[]) => mockBrowserLogin(...args),
}));

vi.mock('../../src/auth/callback-server.js', () => ({
  isContainerized: () => false,
}));

vi.mock('../../src/credential-store.js', () => ({
  loadCredentials: () => mockLoadCredentials(),
  saveCredentialsDurably: (...args: unknown[]) => mockSaveCredentials(...args),
}));

vi.mock('../../src/output.js', () => ({
  success: (...args: unknown[]) => mockSuccess(...args),
}));

vi.mock('../../src/error-handler.js', () => ({
  handleError: vi.fn(),
}));

vi.mock('../../src/prompt.js', () => ({
  confirm: vi.fn(),
  question: vi.fn(),
}));

/** Invoke the real login command through yargs. */
async function invokeLogin(extraArgs: string[]): Promise<void> {
  const yargs = (await import('yargs')).default;
  const { loginCommand } = await import('../../src/commands/login.js');
  const args = ['login', ...extraArgs];
  try {
    await yargs(args)
      .command(loginCommand)
      .option('json', { type: 'boolean', default: false })
      .option('verbose', { type: 'boolean', default: false })
      .option('insecure', { type: 'boolean', default: false })
      .fail(false)
      .parse();
  } catch {
    // The handler is the unit under test; yargs failures are not the oracle.
  }
}

describe('porta login --device-code', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadCredentials.mockReturnValue(null);
    mockSaveCredentials.mockResolvedValue(undefined);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('chooses the device coordinator and prints only the URL and user code', async () => {
    mockDeviceLogin.mockImplementation(async (_request, interaction) => {
      await interaction.presentDeviceCode(
        new URL('https://porta.example.test/acme/device'),
        'BCDF-GHJK',
        new Date(Date.now() + 600_000),
        new AbortController().signal,
      );
      return {
        status: 'authenticated',
        identity: { sub: 'subject-1', email: 'admin@example.test' },
        capabilities: {},
        credentials: { accessToken: 'access', idToken: 'id' },
      };
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let output: string;
    try {
      await invokeLogin(['--device-code', '--server', 'https://porta.example.test']);
      output = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    expect(mockBrowserLogin).not.toHaveBeenCalled();
    expect(mockDeviceLogin).toHaveBeenCalledOnce();
    const request = mockDeviceLogin.mock.calls[0]?.[0] as { server: URL };
    expect(request.server.origin).toBe('https://porta.example.test');
    expect(output).toContain('https://porta.example.test/acme/device');
    expect(output).toContain('BCDF-GHJK');
    expect(mockSuccess).toHaveBeenCalledWith('Logged in as admin@example.test');
  });

  it('keeps the authorization-code flow when only --no-browser is used', async () => {
    mockBrowserLogin.mockResolvedValue({ status: 'cancelled' });
    await invokeLogin(['--no-browser', '--server', 'https://porta.example.test']);

    expect(mockBrowserLogin).toHaveBeenCalledOnce();
    expect(mockDeviceLogin).not.toHaveBeenCalled();
  });
});
