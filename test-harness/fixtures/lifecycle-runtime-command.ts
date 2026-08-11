import { spawn, type ChildProcess } from 'node:child_process';

interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs fixed executables with argument arrays, bounded output, and no shell interpretation. */
export class RuntimeCommandRunner {
  /** Executes a command and rejects on timeout, spawn failure, output overflow, or non-zero exit. */
  public async checked(
    command: string,
    args: readonly string[],
    options: {
      readonly cwd: string;
      readonly environment: Readonly<Record<string, string>>;
      readonly timeoutMilliseconds?: number;
      readonly signal?: AbortSignal;
    },
  ): Promise<CommandResult> {
    const result = await this.run(command, args, options);
    if (result.exitCode !== 0) {
      process.stderr.write(
        `HARNESS_RUNTIME_COMMAND_FAILED: command=${command} exit=${result.exitCode}\n`,
      );
      throw new Error(`${command} failed with exit ${result.exitCode}`);
    }
    return result;
  }

  /** Executes a bounded command and returns sanitized process facts to the caller. */
  public run(
    command: string,
    args: readonly string[],
    options: {
      readonly cwd: string;
      readonly environment: Readonly<Record<string, string>>;
      readonly timeoutMilliseconds?: number;
      readonly signal?: AbortSignal;
    },
  ): Promise<CommandResult> {
    return new Promise((resolveResult, rejectResult) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.environment,
        detached: process.platform !== 'win32',
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      let pendingError: Error | undefined;
      let escalation: NodeJS.Timeout | undefined;
      const fail = (error: Error): void => {
        if (settled || pendingError !== undefined) return;
        pendingError = error;
        clearTimeout(timeout);
        signalChildProcessGroup(child, 'SIGTERM');
        escalation = setTimeout(() => signalChildProcessGroup(child, 'SIGKILL'), 5_000);
      };
      const timeout = setTimeout(() => {
        if (settled) return;
        fail(new RuntimeTimeoutError());
      }, options.timeoutMilliseconds ?? 120_000);
      const abort = (): void => fail(new RuntimeTimeoutError());
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted === true) abort();
      child.stdout?.on('data', (chunk: Buffer) => {
        const appended = appendBounded(stdout, chunk);
        if (appended === undefined) fail(new Error('runtime child output exceeded its bound'));
        else stdout = appended;
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        const appended = appendBounded(stderr, chunk);
        if (appended === undefined) fail(new Error('runtime child output exceeded its bound'));
        else stderr = appended;
      });
      child.once('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', abort);
        if (escalation !== undefined) clearTimeout(escalation);
        rejectResult(error);
      });
      child.once('exit', (code) => {
        if (settled) return;
        void (async () => {
          if (pendingError !== undefined && child.pid !== undefined) {
            await waitForProcessGroupAbsence(child.pid);
          }
          settled = true;
          clearTimeout(timeout);
          options.signal?.removeEventListener('abort', abort);
          if (escalation !== undefined) clearTimeout(escalation);
          if (pendingError !== undefined) rejectResult(pendingError);
          else resolveResult({ exitCode: code ?? 30, stdout, stderr });
        })().catch((error: unknown) => {
          settled = true;
          clearTimeout(timeout);
          options.signal?.removeEventListener('abort', abort);
          if (escalation !== undefined) clearTimeout(escalation);
          rejectResult(error);
        });
      });
    });
  }
}

/** Timeout error carrying only the stable discriminator consumed by the controller. */
export class RuntimeTimeoutError extends Error {
  /** Stable interruption kind used by lifecycle classification. */
  public readonly kind = 'timeout';

  /** Creates one non-secret timeout error. */
  public constructor() {
    super('runtime command exceeded its deadline');
    this.name = 'RuntimeTimeoutError';
  }
}

/** Appends child output while enforcing the fixed in-memory byte bound. */
function appendBounded(previous: string, chunk: Buffer): string | undefined {
  const next = previous + chunk.toString('utf8');
  return Buffer.byteLength(next, 'utf8') > 256 * 1024 ? undefined : next;
}

/** Signals the complete detached process group while tolerating a concurrent natural exit. */
export function signalChildProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    if (process.platform === 'win32') {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    } else process.kill(-child.pid, signal);
  } catch {
    // A concurrent natural exit is already the desired terminal state.
  }
}

/** Waits until an aborted command's complete process group is absent, with bounded escalation. */
async function waitForProcessGroupAbsence(processGroupId: number): Promise<void> {
  if (process.platform === 'win32') return;
  const gracefulDeadline = Date.now() + 5_000;
  while (Date.now() < gracefulDeadline) {
    if (!processGroupExists(processGroupId)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  try {
    process.kill(-processGroupId, 'SIGKILL');
  } catch (error) {
    if (!hasNodeErrorCode(error, 'ESRCH')) throw error;
  }
  const forcedDeadline = Date.now() + 5_000;
  while (Date.now() < forcedDeadline) {
    if (!processGroupExists(processGroupId)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('runtime child process group did not terminate');
}

/** Checks one process-group identity without interpreting permission failures as absence. */
function processGroupExists(processGroupId: number): boolean {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    if (hasNodeErrorCode(error, 'ESRCH')) return false;
    throw error;
  }
}

/** Narrows an unknown platform error to one exact operating-system error code. */
export function hasNodeErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code === code
  );
}
