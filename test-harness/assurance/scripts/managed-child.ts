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
}

/** Options for one shell-free child with signal, timeout, and cleanup ownership. */
export interface ManagedChildOptions {
  /** Working directory inherited by the child. */
  cwd: string;
  /** Environment inherited by the child. */
  env?: NodeJS.ProcessEnv;
  /** Output behavior for the child process. */
  stdio: 'inherit' | 'ignore';
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

/** Runs a child in an isolated process group and always resolves after cleanup. */
export async function runManagedChild(
  command: string,
  arguments_: readonly string[],
  options: ManagedChildOptions,
): Promise<ManagedChildOutcome> {
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
  let terminationTimer: NodeJS.Timeout | undefined;

  const forward = (signal: 'SIGINT' | 'SIGTERM'): void => {
    forwardedSignal ??= signal;
    signalProcessGroup(child.pid, signal);
  };
  const onSigint = (): void => forward('SIGINT');
  const onSigterm = (): void => forward('SIGTERM');
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  const timeout = setTimeout(() => {
    timedOut = true;
    signalProcessGroup(child.pid, 'SIGTERM');
    terminationTimer = setTimeout(
      () => signalProcessGroup(child.pid, 'SIGKILL'),
      options.terminationGraceMilliseconds,
    );
  }, options.timeoutMilliseconds);

  try {
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolveClose) => {
        child.once('error', () => {
          setupFailed = true;
        });
        child.once('close', (code, signal) => resolveClose({ code, signal }));
      },
    );
    try {
      await options.cleanup();
    } catch {
      cleanupFailed = true;
    }
    return { ...result, forwardedSignal, timedOut, setupFailed, cleanupFailed };
  } finally {
    clearTimeout(timeout);
    if (terminationTimer !== undefined) clearTimeout(terminationTimer);
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  }
}
