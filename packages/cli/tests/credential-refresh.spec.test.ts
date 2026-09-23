/**
 * Durable credential refresh specifications at the CLI/SDK boundary.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCliAuth } from '@portaidentity/sdk/node';
import type { CliCredentialPersistence, StoredCredentials } from '@portaidentity/sdk/node';

const temporaryDirectories: string[] = [];

/** Creates an isolated credential directory owned by this test process. */
async function temporaryCredentialPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'porta-credential-refresh-'));
  temporaryDirectories.push(directory);
  return join(directory, 'credentials.json');
}

/** Creates an expired credential snapshot suitable for a refresh grant. */
function expiredCredentials(): StoredCredentials {
  return {
    server: 'https://porta.example.test',
    orgSlug: 'porta-admin',
    clientId: 'porta-cli',
    accessToken: 'old-access-token',
    refreshToken: 'old-refresh-token',
    idToken: 'old-id-token',
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
    userInfo: { sub: 'subject-1', email: 'admin@example.test', name: 'Admin' },
  };
}

/** Waits for one complete newline-delimited message from a child process. */
async function readChildLine(child: ReturnType<typeof spawn>): Promise<string> {
  return new Promise((resolveLine, reject) => {
    let buffered = '';
    child.stdout.on('data', (chunk: Buffer) => {
      buffered += chunk.toString('utf8');
      const newline = buffered.indexOf('\n');
      if (newline >= 0) {
        resolveLine(buffered.slice(0, newline));
      }
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (!buffered.includes('\n')) {
        reject(new Error(`Lock holder exited before readiness with code ${String(code)}`));
      }
    });
  });
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('CLI credential refresh durability', () => {
  it('should serialize processes and release a persistent kernel lock when its owner exits', async () => {
    const credentialsPath = await temporaryCredentialPath();
    const lockPath = `${credentialsPath}.lock`;
    const moduleUrl = new URL('../src/credential-lock.ts', import.meta.url).href;
    const childScript = `
      import { withCredentialLock } from ${JSON.stringify(moduleUrl)};
      await withCredentialLock(
        { lockPath: process.argv[1], timeoutMs: 5000, signal: new AbortController().signal },
        async () => { process.stdout.write('locked\\n'); await new Promise(() => {}); },
      );
    `;
    const holder = spawn(
      process.execPath,
      ['--experimental-strip-types', '--input-type=module', '--eval', childScript, lockPath],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    await expect(readChildLine(holder)).resolves.toBe('locked');
    const { withCredentialLock } = await import('../src/credential-lock.js');

    await expect(
      withCredentialLock(
        { lockPath, timeoutMs: 50, signal: new AbortController().signal },
        async () => undefined,
      ),
    ).rejects.toMatchObject({ code: 'CREDENTIAL_LOCK_TIMEOUT' });

    holder.kill('SIGKILL');
    await new Promise<void>((resolveExit) => holder.once('exit', () => resolveExit()));
    await expect(
      withCredentialLock(
        { lockPath, timeoutMs: 1000, signal: new AbortController().signal },
        async () => 'acquired-after-exit',
      ),
    ).resolves.toBe('acquired-after-exit');
    await expect(stat(lockPath)).resolves.toBeDefined();
  });

  it('should fail a waiting kernel lock closed when its operation is aborted', async () => {
    const credentialsPath = await temporaryCredentialPath();
    const lockPath = `${credentialsPath}.lock`;
    const { withCredentialLock } = await import('../src/credential-lock.js');
    const holder = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const first = withCredentialLock(
      { lockPath, timeoutMs: 1000, signal: new AbortController().signal },
      async () => {
        holder.resolve();
        await release.promise;
      },
    );
    await holder.promise;
    const controller = new AbortController();
    const waiting = withCredentialLock(
      { lockPath, timeoutMs: 1000, signal: controller.signal },
      async () => undefined,
    );
    controller.abort();

    await expect(waiting).rejects.toMatchObject({ code: 'AUTH_CANCELLED' });
    release.resolve();
    await first;
  });

  it('should atomically persist owner-only refreshed credentials without unlinking the lock file', async () => {
    const credentialsPath = await temporaryCredentialPath();
    const previous = expiredCredentials();
    const refreshed = {
      ...previous,
      accessToken: 'committed-access-token',
      refreshToken: 'rotated-refresh-token',
    };
    await writeFile(credentialsPath, JSON.stringify(previous), { mode: 0o600 });
    const { createCliCredentialPersistence } = await import('../src/credential-store.js');
    const persistence = createCliCredentialPersistence({ credentialsPath, lockTimeoutMs: 1000 });

    await persistence.withRefreshLock(async () =>
      persistence.persistRefreshedCredentials(previous, refreshed),
    );

    await expect(readFile(credentialsPath, 'utf8')).resolves.toBe(JSON.stringify(refreshed));
    expect((await stat(credentialsPath)).mode & 0o777).toBe(0o600);
    await expect(stat(`${credentialsPath}.lock`)).resolves.toBeDefined();
  });

  it('should never replay a refresh grant after a post-dispatch response loss', async () => {
    const credentialsPath = await temporaryCredentialPath();
    await writeFile(credentialsPath, JSON.stringify(expiredCredentials()), { mode: 0o600 });
    const persistence: CliCredentialPersistence = {
      withRefreshLock: async (operation) => operation(),
      persistRefreshedCredentials: vi.fn(),
    };
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('socket closed after dispatch'));
    vi.stubGlobal('fetch', fetchMock);
    const auth = createCliAuth({ credentialsPath, credentialPersistence: persistence });

    await expect(auth.getToken()).rejects.toMatchObject({ code: 'REFRESH_INDETERMINATE' });
    await expect(auth.getToken()).rejects.toMatchObject({ code: 'REFRESH_INDETERMINATE' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(persistence.persistRefreshedCredentials).not.toHaveBeenCalled();
  });

  it('should retry the identical validated write without another grant after persistence fails', async () => {
    const credentialsPath = await temporaryCredentialPath();
    const previous = expiredCredentials();
    const previousBytes = JSON.stringify(previous);
    await writeFile(credentialsPath, previousBytes, { mode: 0o600 });
    const attemptedWrites: string[] = [];
    const persistence: CliCredentialPersistence = {
      withRefreshLock: async (operation) => operation(),
      persistRefreshedCredentials: vi
        .fn()
        .mockImplementationOnce(async (_previous, refreshed) => {
          attemptedWrites.push(JSON.stringify(refreshed));
          throw new Error('simulated atomic rename failure');
        })
        .mockImplementationOnce(async (_previous, refreshed) => {
          attemptedWrites.push(JSON.stringify(refreshed));
        }),
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'validated-access-token',
          refresh_token: 'rotated-refresh-token',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const auth = createCliAuth({ credentialsPath, credentialPersistence: persistence });

    await expect(auth.getToken()).rejects.toThrow('simulated atomic rename failure');
    await expect(readFile(credentialsPath, 'utf8')).resolves.toBe(previousBytes);
    await expect(auth.getToken()).resolves.toBe('validated-access-token');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(attemptedWrites).toHaveLength(2);
    expect(attemptedWrites[1]).toBe(attemptedWrites[0]);
  });
});
