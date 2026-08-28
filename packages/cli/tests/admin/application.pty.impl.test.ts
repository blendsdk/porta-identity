/** PTY smoke tests for the compiled `porta admin` terminal lifecycle. */

import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const cliRoot = resolve(import.meta.dirname, '../..');
const repositoryRoot = resolve(cliRoot, '../..');
const cliEntry = resolve(cliRoot, 'dist/index.js');
const typescriptCompiler = resolve(repositoryRoot, 'node_modules/@typescript/native/bin/tsc');
const scriptExecutable = '/usr/bin/script';
const enterAlternateScreen = '\u001b[?1049h';
const leaveAlternateScreen = '\u001b[?1049l';

/** Quotes a trusted local path for the fixed command interpreted by `script`. */
function shellPath(path: string): string {
  return `'${path.replaceAll("'", "'\\''")}'`;
}

/** Result captured from one compiled CLI PTY process. */
interface PtyResult {
  /** Child exit status, or null when terminated by the host. */
  readonly code: number | null;
  /** Complete bounded terminal output. */
  readonly output: string;
}

/** Collects one script process without allowing unbounded output. */
function collectProcess(child: ChildProcessWithoutNullStreams): Promise<PtyResult> {
  return new Promise((resolveProcess, rejectProcess) => {
    let output = '';
    const append = (chunk: Buffer): void => {
      if (output.length < 256_000) output += chunk.toString('utf8');
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.once('error', rejectProcess);
    child.once('exit', (code) => resolveProcess({ code, output }));
  });
}

/** Waits briefly for the native host to enter terminal mode. */
async function waitForTerminal(output: () => string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!output().includes(enterAlternateScreen)) {
    if (Date.now() >= deadline) throw new Error('Administration terminal did not start');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
}

/** Starts the compiled CLI under util-linux `script`, which owns a real PTY. */
function startPty(
  home: string,
  pidPath?: string,
  startUndersized = false,
): {
  readonly child: ChildProcessWithoutNullStreams;
  readonly output: () => string;
  readonly result: Promise<PtyResult>;
} {
  const pidPrefix = pidPath ? `printf '%s' "$$" > ${shellPath(pidPath)}; ` : '';
  const sizePrefix = startUndersized ? 'stty rows 6 cols 24; ' : '';
  const command = `${pidPrefix}${sizePrefix}exec ${shellPath(process.execPath)} ${shellPath(cliEntry)} admin --server https://porta.example.test`;
  const child = spawn(scriptExecutable, ['-qfec', command, '/dev/null'], {
    cwd: repositoryRoot,
    env: { ...process.env, HOME: home, TERM: 'xterm-256color' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let captured = '';
  child.stdout.on('data', (chunk: Buffer) => {
    if (captured.length < 256_000) captured += chunk.toString('utf8');
  });
  child.stderr.on('data', (chunk: Buffer) => {
    if (captured.length < 256_000) captured += chunk.toString('utf8');
  });
  return { child, output: () => captured, result: collectProcess(child) };
}

/** Stops an unfinished PTY process during test cleanup. */
function stopProcess(child: ChildProcessWithoutNullStreams): void {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

beforeAll(() => {
  execFileSync(typescriptCompiler, [], { cwd: cliRoot, stdio: 'pipe' });
});

describe.skipIf(process.platform === 'win32')('compiled admin PTY lifecycle', () => {
  it('should restore the terminal after keyboard quit', async () => {
    const home = await mkdtemp(resolve(tmpdir(), 'porta-admin-pty-'));
    const process_ = startPty(home);
    try {
      await waitForTerminal(process_.output);
      process_.child.stdin.write('\u001bx');
      process_.child.stdin.end();
      const result = await process_.result;

      expect(result.code).toBe(0);
      expect(result.output).toContain(enterAlternateScreen);
      expect(result.output.lastIndexOf(leaveAlternateScreen)).toBeGreaterThan(
        result.output.indexOf(enterAlternateScreen),
      );
    } finally {
      stopProcess(process_.child);
      await rm(home, { recursive: true, force: true });
    }
  });

  it('should restore the terminal from the resize-only presentation', async () => {
    const home = await mkdtemp(resolve(tmpdir(), 'porta-admin-small-pty-'));
    const process_ = startPty(home, undefined, true);
    try {
      await waitForTerminal(process_.output);
      process_.child.stdin.write('\u001bx');
      process_.child.stdin.end();
      const result = await process_.result;

      expect(result.code).toBe(0);
      expect(result.output).toContain('Terminal too small');
      expect(result.output.split(leaveAlternateScreen)).toHaveLength(2);
    } finally {
      stopProcess(process_.child);
      await rm(home, { recursive: true, force: true });
    }
  });

  it.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
    ['SIGHUP', 129],
  ] as const)('should restore once after %s with exit %i', async (signal, expectedCode) => {
    const home = await mkdtemp(resolve(tmpdir(), 'porta-admin-signal-'));
    const pidPath = resolve(home, 'porta.pid');
    const process_ = startPty(home, pidPath);
    try {
      await waitForTerminal(process_.output);
      const pid = Number.parseInt(await readFile(pidPath, 'utf8'), 10);
      expect(Number.isSafeInteger(pid)).toBe(true);
      process.kill(pid, signal);
      const result = await process_.result;

      expect(result.code).toBe(expectedCode);
      expect(result.output.split(leaveAlternateScreen)).toHaveLength(2);
    } finally {
      stopProcess(process_.child);
      await rm(home, { recursive: true, force: true });
    }
  });
});
