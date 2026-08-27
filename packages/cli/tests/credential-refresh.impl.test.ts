/** Focused implementation edges for credential locking and atomic storage. */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCliCredentialPersistence } from '../src/credential-store.js';
import { withCredentialLock } from '../src/credential-lock.js';

const directories: string[] = [];

/** Creates one isolated credential path. */
async function credentialPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'porta-credential-impl-'));
  directories.push(directory);
  return join(directory, 'credentials.json');
}

/** Attempts one lock from a separate process and returns its bounded result. */
async function childLockResult(lockPath: string): Promise<string> {
  const moduleUrl = new URL('../src/credential-lock.ts', import.meta.url).href;
  const script = `
    import { withCredentialLock } from ${JSON.stringify(moduleUrl)};
    try {
      await withCredentialLock(
        { lockPath: process.argv[1], timeoutMs: 80, signal: new AbortController().signal },
        async () => process.stdout.write('acquired'),
      );
    } catch (error) {
      process.stdout.write(error.code ?? 'error');
    }
  `;
  const child = spawn(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '--eval', script, lockPath],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8');
  });
  await new Promise<void>((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', () => resolveExit());
  });
  return output;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('credential persistence implementation edges', () => {
  it('rejects an already-aborted acquisition without running its operation', async () => {
    const path = await credentialPath();
    const controller = new AbortController();
    controller.abort();
    let called = false;
    await expect(
      withCredentialLock(
        { lockPath: `${path}.lock`, timeoutMs: 100, signal: controller.signal },
        async () => {
          called = true;
        },
      ),
    ).rejects.toMatchObject({ code: 'AUTH_CANCELLED' });
    expect(called).toBe(false);
  });

  it('keeps the persistent lock file after successful acquisition', async () => {
    const path = await credentialPath();
    await withCredentialLock(
      { lockPath: `${path}.lock`, timeoutMs: 100, signal: new AbortController().signal },
      async () => undefined,
    );
    await expect(stat(`${path}.lock`)).resolves.toBeDefined();
  });

  it.skipIf(process.platform === 'win32')(
    'keeps the POSIX kernel lock after a same-process waiter aborts',
    async () => {
      const path = await credentialPath();
      const lockPath = `${path}.lock`;
      const holderStarted = Promise.withResolvers<void>();
      const releaseHolder = Promise.withResolvers<void>();
      const holder = withCredentialLock(
        { lockPath, timeoutMs: 1_000, signal: new AbortController().signal },
        async () => {
          holderStarted.resolve();
          await releaseHolder.promise;
        },
      );
      await holderStarted.promise;
      const waitingController = new AbortController();
      const waiter = withCredentialLock(
        { lockPath, timeoutMs: 1_000, signal: waitingController.signal },
        async () => undefined,
      );
      waitingController.abort();
      await expect(waiter).rejects.toMatchObject({ code: 'AUTH_CANCELLED' });

      await expect(childLockResult(lockPath)).resolves.toBe('CREDENTIAL_LOCK_TIMEOUT');
      releaseHolder.resolve();
      await holder;
    },
  );

  it('atomically replaces credentials with owner-only permissions', async () => {
    const path = await credentialPath();
    const previous = {
      server: 'https://porta.example.test',
      orgSlug: 'porta-admin',
      clientId: 'porta-cli',
      accessToken: 'old',
      refreshToken: 'refresh',
      idToken: 'id',
      expiresAt: '2000-01-01T00:00:00.000Z',
      userInfo: { sub: 'subject-1', email: 'admin@example.test' },
    };
    const refreshed = { ...previous, accessToken: 'new' };
    await writeFile(path, JSON.stringify(previous), { mode: 0o600 });
    const persistence = createCliCredentialPersistence({
      credentialsPath: path,
      lockTimeoutMs: 100,
    });
    await persistence.withRefreshLock(() =>
      persistence.persistRefreshedCredentials(previous, refreshed),
    );
    expect(await readFile(path, 'utf8')).toBe(JSON.stringify(refreshed));
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
});
