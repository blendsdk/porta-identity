/** Exercise executable and login glue without browser interaction or real credentials. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCli } from '../src/cli.js';
import { loginCommand } from '../src/commands/login.js';
import { captureCommandOutput, CommandExit } from './helpers/json-error-contract.js';

const boundary = vi.hoisted(() => ({
  credentials: vi.fn(),
  confirm: vi.fn(),
  question: vi.fn(),
  save: vi.fn(),
}));
vi.mock('../src/credential-store.js', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  loadCredentials: boundary.credentials,
  saveCredentialsDurably: boundary.save,
}));
vi.mock('../src/prompt.js', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  confirm: boundary.confirm,
  question: boundary.question,
}));

let output: ReturnType<typeof captureCommandOutput>;
const originalArgs = process.argv;

beforeEach(() => {
  vi.resetAllMocks();
  output = captureCommandOutput();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected HTTP request')));
  boundary.credentials.mockReturnValue(undefined);
  vi.stubEnv('NODE_TLS_REJECT_UNAUTHORIZED', '1');
});
afterEach(() => {
  process.argv = originalArgs;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('login external boundaries', () => {
  it('should reject an invalid manual callback without exchanging tokens or persisting credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            issuer: 'https://next.example.test/porta-admin',
            orgSlug: 'porta-admin',
            clientId: 'public-cli',
          }),
        ),
      ),
    );
    boundary.question.mockResolvedValue('https://invalid.example.test/callback');
    await expect(
      loginCommand.handler({
        server: 'https://next.example.test',
        'no-browser': true,
        json: false,
        verbose: false,
        insecure: true,
        force: false,
        _: ['login'],
        $0: 'porta',
      }),
    ).rejects.toThrow(CommandExit);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      'https://next.example.test/api/admin/metadata',
      expect.any(Object),
    );
    expect(boundary.question).toHaveBeenCalledOnce();
    expect(boundary.confirm).not.toHaveBeenCalled();
    expect(boundary.save).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(output.stdout).toContain('Open this URL in your browser');
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe('0');
  });

  it('should emit a safe JSON login failure before any credential or HTTP access', async () => {
    await expect(
      createCli([
        'login',
        '--server',
        'http://invalid.example.test/private',
        '--json',
      ]).parseAsync(),
    ).rejects.toThrow(CommandExit);
    expect(process.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(JSON.parse(output.stderr)).toStrictEqual({
      code: 'COMMAND_FAILED',
      message: 'The command failed.',
    });
    expect(output.stdout).toBe('');
    expect(boundary.credentials).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('source executable adapter', () => {
  it('should run a real successful parser through the adapter without changing its stdout body', async () => {
    vi.resetModules();
    const body = { status: 'healthy' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    process.argv = [
      process.execPath,
      'porta',
      'health',
      '--server',
      'https://porta.example.test',
      '--json',
    ];
    await import('../src/index.js');
    await vi.waitFor(() => expect(output.stdout).toContain('healthy'));
    expect(JSON.parse(output.stdout)).toStrictEqual(body);
    expect(output.stderr).toBe('');
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('should retain human top-level error handling when a filesystem boundary throws', async () => {
    vi.resetModules();
    boundary.credentials.mockImplementation(() => {
      throw new Error('Controlled filesystem failure');
    });
    // Suppress the final OS exit. There is no command code after this adapter's exit call.
    const exit = vi.spyOn(process, 'exit').mockImplementation(vi.fn<typeof process.exit>());
    process.argv = [process.execPath, 'porta', 'whoami'];
    await import('../src/index.js');
    // With the OS exit suppressed, yargs can also reach the adapter's outer catch.
    // Both boundaries must retain the general failure code, with no real process termination.
    await vi.waitFor(() => expect(output.stderr).toContain('Controlled filesystem failure'));
    expect(exit).toHaveBeenCalledWith(1);
    expect(exit.mock.calls.every(([code]) => code === 1)).toBe(true);
    expect(output.stderr).toContain('Controlled filesystem failure');
    expect(output.stderr).not.toContain('"code"');
    expect(output.stdout).toBe('');
  });
});
