/** The real parser selects error mode without leaking rejected arguments. */
import yargs from 'yargs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureCommandOutput,
  expectErrorEnvelope,
  runExecutable,
} from './helpers/json-error-contract.js';

const marker = 'SENSITIVE_MARKER';
const argumentError = { code: 'ARGUMENT_ERROR', message: 'Invalid command arguments.' };

/** Installed Boolean parsing is the authority, including invalid spellings and repetition. */
function installedJsonMode(args: readonly string[]): boolean {
  return (
    yargs([...args])
      .option('json', { type: 'boolean', default: false })
      .help(false)
      .version(false)
      .exitProcess(false)
      .parseSync().json === true
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('early JSON mode selection', () => {
  // The probe parses only flags: it must not execute commands, show help, or exit.
  it.each(
    [
      ['--json', 'health'],
      ['health', '--json'],
      ['health', '--json=true'],
      ['health', '--json', 'true'],
      ['health', '--json=false'],
      ['health', '--json', 'false'],
      ['health', '--no-json'],
      ['health', '--json', '--no-json'],
      ['health', '--no-json', '--json'],
      ['health', '--json=false', '--json=true'],
      ['health', '--json=true', '--json=false'],
      ['health', '--', '--json'],
      ['--json', 'health', '--', '--no-json'],
      ['health', '--json=invalid'],
      ['health', '--json', 'invalid'],
      ['health', '--help', '--json'],
      ['health', '--version', '--json'],
    ].map((args) => ({ args })),
  )('should match installed Boolean semantics for $args', async ({ args }) => {
    const { resolveJsonMode } = await import('../src/cli.js');
    const output = captureCommandOutput();
    const fetch = vi.fn(() => {
      throw new Error('The probe must not access HTTP');
    });
    vi.stubGlobal('fetch', fetch);
    expect(resolveJsonMode(args)).toBe(installedJsonMode(args));
    expect(fetch).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    expect(output).toStrictEqual({ stdout: '', stderr: '' });
  });

  it.each(
    [
      ['--json', `unknown-${marker}`],
      [`unknown-${marker}`, '--json'],
      [`unknown-${marker}`, '--json=true'],
      [`unknown-${marker}`, '--json', 'true'],
      [`unknown-${marker}`, '--json=false'],
      [`unknown-${marker}`, '--json', 'false'],
      [`unknown-${marker}`, '--no-json'],
      [`unknown-${marker}`, '--json', '--no-json'],
      [`unknown-${marker}`, '--no-json', '--json'],
      [`unknown-${marker}`, '--json=true', '--json=false'],
      [`unknown-${marker}`, '--json=false', '--json=true'],
      [`unknown-${marker}`, '--', '--json'],
      [`unknown-${marker}`, '--json=invalid'],
    ].map((args) => ({ args })),
  )('should select the same failure mode in the executable for $args', async ({ args }) => {
    const result = await runExecutable(args);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    if (installedJsonMode(args)) {
      expectErrorEnvelope(result.stderr, argumentError);
      expect(result.stderr).not.toContain(marker);
    } else {
      expect(result.stderr.length).toBeGreaterThan(0);
      expect(result.stderr).not.toContain('"code":"ARGUMENT_ERROR"');
      expect(() => JSON.parse(result.stderr)).toThrow();
    }
  });
});

describe('executable parser failures', () => {
  it.each(
    [
      ['--json', `unknown-${marker}`],
      ['health', '--json', `--unknown-${marker}`, marker],
      ['config', 'set', marker, '--json'],
      ['bulk', 'execute', '--entity-type', 'users', '--json', '--reason', marker],
    ].map((args) => ({ args })),
  )('should emit only an argument envelope for $args', async ({ args }) => {
    const result = await runExecutable(args);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expectErrorEnvelope(result.stderr, argumentError);
    expect(result.stderr).not.toContain(marker);
    expect(result.stderr).not.toMatch(/Usage:|Options:|Commands:/);
  });
});

describe('unchanged non-error entry behaviour', () => {
  it('should retain an existing JSON success body without an error wrapper', async () => {
    const { createCli } = await import('../src/cli.js');
    const output = captureCommandOutput();
    const body = { status: 'healthy', checks: { database: 'ok', redis: 'ok' } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    await createCli(['health', '--server', 'https://porta.example.test', '--json']).parseAsync();
    expect(JSON.parse(output.stdout)).toStrictEqual(body);
    expect(output.stderr).toBe('');
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('should retain the interactive Admin JSON rejection rather than enter the UI', async () => {
    const { runAdminCommand } = await import('../src/commands/admin.js');
    const output = captureCommandOutput();
    const dependencies = {
      stdinIsTTY: true,
      stdoutIsTTY: true,
      writeStderr: vi.fn(),
      runApplication: vi.fn().mockResolvedValue(0),
    };
    const status = await runAdminCommand(
      {
        json: true,
        verbose: false,
        insecure: false,
        force: false,
        _: ['admin'],
        $0: 'porta',
      },
      dependencies,
    );
    expect(status).toBe(2);
    expect(dependencies.runApplication).not.toHaveBeenCalled();
    expect(dependencies.writeStderr).toHaveBeenCalledOnce();
    const message = dependencies.writeStderr.mock.calls[0]?.[0];
    expect(message).toContain('--json');
    expect(message).not.toContain('"code"');
    expect(output.stdout).toBe('');
    expect(process.exit).not.toHaveBeenCalled();
  });
});
