/** Bounded cross-process kernel locking for the CLI credential file. */

import {
  constants as nativeConstants,
  fcntlSync,
  lockFileExSync,
  unlockFileExSync,
} from 'fs-ext-extra-prebuilt';
import { open, type FileHandle } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Options controlling one bounded credential lock acquisition. */
export interface CredentialLockOptions {
  /** Persistent lock-file path; the file is never unlinked. */
  readonly lockPath: string;
  /** Maximum wait before failing closed. */
  readonly timeoutMs: number;
  /** Caller-owned cancellation signal. */
  readonly signal: AbortSignal;
}

/** Categorized error returned by credential lock acquisition. */
export class CredentialLockError extends Error {
  /** Stable machine-readable failure category. */
  readonly code: 'AUTH_CANCELLED' | 'CREDENTIAL_LOCK_TIMEOUT';

  /** Creates a bounded, non-sensitive lock error. */
  constructor(code: CredentialLockError['code'], message: string) {
    super(message);
    this.name = 'CredentialLockError';
    this.code = code;
  }
}

const RETRY_DELAY_MS = 10;
const activeProcessLocks = new Set<string>();

/** Returns true only for documented non-blocking contention failures. */
function isContention(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return error.code === 'EACCES' || error.code === 'EAGAIN' || error.code === 'EBUSY';
}

/** Applies the platform's exclusive non-blocking one-byte kernel lock. */
function tryLock(descriptor: number): void {
  if (process.platform === 'win32') {
    lockFileExSync(
      descriptor,
      nativeConstants.LOCKFILE_EXCLUSIVE_LOCK | nativeConstants.LOCKFILE_FAIL_IMMEDIATELY,
      0,
      0,
      1,
      0,
    );
    return;
  }
  fcntlSync(descriptor, 'setlk', nativeConstants.F_WRLCK, 0, 1);
}

/** Releases the platform's one-byte kernel lock. */
function unlock(descriptor: number): void {
  if (process.platform === 'win32') {
    unlockFileExSync(descriptor, 0, 0, 1, 0);
    return;
  }
  fcntlSync(descriptor, 'setlk', nativeConstants.F_UNLCK, 0, 1);
}

/** Waits briefly while remaining immediately cancellable. */
async function waitForRetry(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    throw new CredentialLockError('AUTH_CANCELLED', 'Authentication was cancelled.');
  }
  await new Promise<void>((resolveWait, rejectWait) => {
    const complete = (): void => {
      signal.removeEventListener('abort', abort);
      resolveWait();
    };
    const timeout = setTimeout(complete, RETRY_DELAY_MS);
    const abort = (): void => {
      clearTimeout(timeout);
      rejectWait(new CredentialLockError('AUTH_CANCELLED', 'Authentication was cancelled.'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Runs an operation under a bounded exclusive lock that survives as a file. */
export async function withCredentialLock<T>(
  options: CredentialLockOptions,
  operation: () => Promise<T>,
): Promise<T> {
  const lockPath = resolve(options.lockPath);
  const deadline = performance.now() + options.timeoutMs;
  let handle: FileHandle | undefined;
  let processReservation = false;
  let acquired = false;
  let keepProcessAlive: ReturnType<typeof setInterval> | undefined;
  try {
    // POSIX record locks are released when this process closes any descriptor
    // for the same file. Reserve the path in-process before opening it so a
    // local waiter can never release the active operation's kernel lock.
    while (!processReservation) {
      if (options.signal.aborted) {
        throw new CredentialLockError('AUTH_CANCELLED', 'Authentication was cancelled.');
      }
      if (!activeProcessLocks.has(lockPath)) {
        activeProcessLocks.add(lockPath);
        processReservation = true;
        break;
      }
      if (performance.now() >= deadline) {
        throw new CredentialLockError(
          'CREDENTIAL_LOCK_TIMEOUT',
          'Credential storage is busy. Try again.',
        );
      }
      await waitForRetry(options.signal);
    }

    const activeHandle = await open(lockPath, 'a+', 0o600);
    handle = activeHandle;
    while (!acquired) {
      if (options.signal.aborted) {
        throw new CredentialLockError('AUTH_CANCELLED', 'Authentication was cancelled.');
      }
      try {
        tryLock(activeHandle.fd);
        acquired = true;
        break;
      } catch (error) {
        if (!isContention(error)) throw error;
      }
      if (performance.now() >= deadline) {
        throw new CredentialLockError(
          'CREDENTIAL_LOCK_TIMEOUT',
          'Credential storage is busy. Try again.',
        );
      }
      await waitForRetry(options.signal);
    }
    // A pending promise alone does not keep Node alive. The referenced timer
    // ensures the process cannot exit normally while its operation still owns
    // the kernel lock; crashes and signals still release the lock in-kernel.
    keepProcessAlive = setInterval(() => void activeHandle.fd, 60_000);
    return await operation();
  } finally {
    if (keepProcessAlive) clearInterval(keepProcessAlive);
    try {
      if (acquired && handle) unlock(handle.fd);
    } finally {
      try {
        await handle?.close();
      } finally {
        if (processReservation) activeProcessLocks.delete(lockPath);
      }
    }
  }
}
