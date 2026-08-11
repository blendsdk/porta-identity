import { spawn } from 'node:child_process';

/** Stable outcomes returned after a managed child and its process group terminate. */
export interface ManagedChildOutcome {
  /** Child exit status when it exited normally. */
  code: number | null;
  /** Signal that terminated the child when no numeric status exists. */
  signal: NodeJS.Signals | null;
  /** Signal received directly by the dispatcher and forwarded to the child group. */
  forwardedSignal: 'SIGINT' | 'SIGTERM' | null;
  /** Whether the contract timeout initiated termination. */
  timedOut: boolean;
  /** Whether spawning the child failed before execution. */
  setupFailed: boolean;
  /** Whether owned-resource cleanup failed after child termination. */
  cleanupFailed: boolean;
  /** Bounded standard output captured when pipe mode is selected. */
  stdout: string;
  /** Bounded standard error captured when pipe mode is selected. */
  stderr: string;
  /** Whether output exceeded the configured ceiling and forced termination. */
  outputTruncated: boolean;
}

/** Options for one shell-free child with signal, timeout, and cleanup ownership. */
export interface ManagedChildOptions {
  /** Working directory inherited by the child. */
  cwd: string;
  /** Environment inherited by the child. */
  env?: NodeJS.ProcessEnv;
  /** Output behavior for the child process. */
  stdio: 'inherit' | 'ignore' | 'pipe';
  /** Maximum combined stdout/stderr bytes accepted in pipe mode. */
  maxOutputBytes?: number;
  /** Maximum execution time before group termination begins. */
  timeoutMilliseconds: number;
  /** Grace period between SIGTERM and SIGKILL during timeout handling. */
  terminationGraceMilliseconds: number;
  /** Cleanup for resources owned by the command. */
  cleanup: () => void | Promise<void>;
}

/** Sends one signal to the complete child process group without using a shell. */
function signalProcessGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error;
  }
}

/** Returns whether any process remains in the isolated child process group. */
function processGroupExists(pid: number | undefined): boolean {
  if (pid === undefined) return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false;
    throw error;
  }
}

/** Waits for a bounded interval without blocking signal delivery. */
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

/** Runs a child in an isolated process group and always resolves after cleanup. */
export async function runManagedChild(
  command: string,
  arguments_: readonly string[],
  options: ManagedChildOptions,
): Promise<ManagedChildOutcome> {
  if (
    options.stdio === 'pipe' &&
    (options.maxOutputBytes === undefined ||
      !Number.isSafeInteger(options.maxOutputBytes) ||
      options.maxOutputBytes <= 0)
  ) {
    throw new Error('pipe mode requires a positive safe maxOutputBytes value');
  }
  const child = spawn(command, arguments_, {
    cwd: options.cwd,
    detached: true,
    env: options.env,
    shell: false,
    stdio: options.stdio,
  });
  let forwardedSignal: 'SIGINT' | 'SIGTERM' | null = null;
  let timedOut = false;
  let setupFailed = false;
  let cleanupFailed = false;
  let stdout = '';
  let stderr = '';
  let capturedBytes = 0;
  let outputTruncated = false;
  let terminationPromise: Promise<boolean> | undefined;

  const terminateGroup = (signal: 'SIGINT' | 'SIGTERM'): Promise<boolean> => {
    if (terminationPromise !== undefined) return terminationPromise;
    signalProcessGroup(child.pid, signal);
    terminationPromise = (async () => {
      await delay(options.terminationGraceMilliseconds);
      if (processGroupExists(child.pid)) signalProcessGroup(child.pid, 'SIGKILL');
      const killDeadline = Date.now() + Math.max(100, options.terminationGraceMilliseconds);
      while (processGroupExists(child.pid) && Date.now() < killDeadline) await delay(10);
      return !processGroupExists(child.pid);
    })();
    return terminationPromise;
  };

  const forward = (signal: 'SIGINT' | 'SIGTERM'): void => {
    forwardedSignal ??= signal;
    void terminateGroup(signal);
  };
  const onSigint = (): void => forward('SIGINT');
  const onSigterm = (): void => forward('SIGTERM');
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  const timeout = setTimeout(() => {
    timedOut = true;
    void terminateGroup('SIGTERM');
  }, options.timeoutMilliseconds);

  const capture = (channel: 'stdout' | 'stderr', chunk: Buffer): void => {
    if (outputTruncated) return;
    capturedBytes += chunk.byteLength;
    if (capturedBytes > (options.maxOutputBytes ?? 0)) {
      outputTruncated = true;
      void terminateGroup('SIGTERM');
      return;
    }
    if (channel === 'stdout') stdout += chunk.toString('utf8');
    else stderr += chunk.toString('utf8');
  };
  if (options.stdio === 'pipe') {
    child.stdout?.on('data', (chunk: Buffer) => capture('stdout', chunk));
    child.stderr?.on('data', (chunk: Buffer) => capture('stderr', chunk));
  }

  try {
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolveClose) => {
        child.once('error', () => {
          setupFailed = true;
        });
        child.once('close', (code, signal) => resolveClose({ code, signal }));
      },
    );
    if (terminationPromise !== undefined) {
      if (!(await terminationPromise)) cleanupFailed = true;
    } else if (processGroupExists(child.pid)) {
      if (!(await terminateGroup('SIGTERM'))) cleanupFailed = true;
    }
    try {
      await options.cleanup();
    } catch {
      cleanupFailed = true;
    }
    return {
      ...result,
      forwardedSignal,
      timedOut,
      setupFailed,
      cleanupFailed,
      stdout,
      stderr,
      outputTruncated,
    };
  } finally {
    clearTimeout(timeout);
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  }
}
