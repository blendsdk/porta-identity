import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';

import { runManagedChild } from '../scripts/managed-child.js';
import { requireCanonicalChild } from './filesystem.js';
import type { PreparedPackedConsumer } from './model.js';

/** Terminal outcomes exercised against the compiled packed CLI. */
export type PackedCliOutcome = 'success' | 'failure' | 'timeout' | 'sigint' | 'sigterm';

/** Credential isolation evidence for one compiled CLI subprocess. */
export interface PackedCliIsolationResult {
  /** Requested terminal outcome. */
  readonly outcome: PackedCliOutcome;
  /** Unique temporary HOME supplied to the CLI subprocess. */
  readonly temporaryHomePath: string;
  /** Exact owner-only mode observed before execution. */
  readonly temporaryHomeMode: number;
  /** Whether the temporary credential location was removed afterward. */
  readonly temporaryResourcesRemoved: boolean;
  /** Caller credential fingerprint before subprocess creation. */
  readonly callerCredentialFingerprintBefore: string;
  /** Caller credential fingerprint after subprocess cleanup. */
  readonly callerCredentialFingerprintAfter: string;
}

/** Returns a content-and-metadata fingerprint without exposing credential bytes. */
function credentialFingerprint(path: string): string {
  if (!existsSync(path)) return 'absent';
  const metadata = lstatSync(path);
  const digest = createHash('sha256');
  digest.update(`${metadata.mode & 0o777}:${metadata.size}:`);
  if (metadata.isFile() && !metadata.isSymbolicLink()) digest.update(readFileSync(path));
  else digest.update('non-regular');
  return `sha256:${digest.digest('hex')}`;
}

/** Returns the exact compiled CLI path from the installed package manifest. */
function packedCliBin(consumer: PreparedPackedConsumer): string {
  const cliRoot = requireCanonicalChild(
    consumer.consumerPath,
    resolve(consumer.consumerPath, 'node_modules/@portaidentity/cli'),
  );
  const manifest = JSON.parse(readFileSync(resolve(cliRoot, 'package.json'), 'utf8')) as {
    bin?: { porta?: string };
  };
  if (manifest.bin?.porta !== './dist/index.js') throw new Error('packed CLI bin is invalid');
  return requireCanonicalChild(cliRoot, resolve(cliRoot, manifest.bin.porta));
}

/** Waits for a direct child to close, with bounded forced cleanup on failure. */
async function runSignalledProbe(
  command: string,
  arguments_: readonly string[],
  cwd: string,
  environment: NodeJS.ProcessEnv,
  signal: 'SIGINT' | 'SIGTERM',
): Promise<void> {
  const child = spawn(command, arguments_, {
    cwd,
    env: environment,
    detached: true,
    shell: false,
    stdio: 'ignore',
  });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolveClose, rejectClose) => {
      child.once('error', rejectClose);
      child.once('close', (code, closeSignal) => resolveClose({ code, signal: closeSignal }));
    },
  );
  await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  if (child.pid === undefined) throw new Error('packed CLI signal probe did not start');
  process.kill(-child.pid, signal);
  let deadlineHandle: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, rejectDeadline) => {
    deadlineHandle = setTimeout(
      () => rejectDeadline(new Error('packed CLI signal probe did not stop')),
      5_000,
    );
  });
  try {
    const result = await Promise.race([closed, deadline]);
    if (result.signal !== signal)
      throw new Error('packed CLI signal outcome did not match request');
  } catch (error) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // The process group may already be absent after a concurrent close.
    }
    await closed.catch(() => undefined);
    throw error;
  } finally {
    if (deadlineHandle !== undefined) clearTimeout(deadlineHandle);
  }
}

/** Runs the compiled packed CLI under one newly created owner-only HOME. */
export async function runPackedCliWithIsolatedHome(
  consumer: PreparedPackedConsumer,
  outcome: PackedCliOutcome,
): Promise<PackedCliIsolationResult> {
  const callerCredentialPath = resolve(homedir(), '.porta/credentials.json');
  const before = credentialFingerprint(callerCredentialPath);
  const runRoot = resolve(consumer.consumerPath, '..');
  const homesRoot = resolve(runRoot, 'homes');
  mkdirSync(homesRoot, { recursive: true, mode: 0o700 });
  chmodSync(homesRoot, 0o700);
  const temporaryHomePath = resolve(homesRoot, randomUUID());
  mkdirSync(temporaryHomePath, { mode: 0o700 });
  chmodSync(temporaryHomePath, 0o700);
  const temporaryHomeMode = statSync(temporaryHomePath).mode & 0o777;
  const cliBinPath = packedCliBin(consumer);
  const probePath = resolve(process.cwd(), 'test-harness/consumers/cli-outcome-probe.mjs');
  const environment = { ...process.env, HOME: temporaryHomePath, USERPROFILE: temporaryHomePath };

  try {
    if (outcome === 'sigint' || outcome === 'sigterm') {
      await runSignalledProbe(
        process.execPath,
        [probePath, outcome, cliBinPath],
        consumer.consumerPath,
        environment,
        outcome === 'sigint' ? 'SIGINT' : 'SIGTERM',
      );
    } else {
      const result = await runManagedChild(process.execPath, [probePath, outcome, cliBinPath], {
        cwd: consumer.consumerPath,
        env: environment,
        stdio: 'pipe',
        maxOutputBytes: 256 * 1024,
        timeoutMilliseconds: outcome === 'timeout' ? 250 : 30_000,
        terminationGraceMilliseconds: 2_000,
        cleanup: () => undefined,
      });
      if (outcome === 'success' && result.code !== 0) {
        throw new Error('packed CLI success probe failed');
      }
      if (outcome === 'failure' && (result.code === null || result.code === 0)) {
        throw new Error('packed CLI failure probe did not fail');
      }
      if (outcome === 'timeout' && !result.timedOut) {
        throw new Error('packed CLI timeout probe did not time out');
      }
      if (result.cleanupFailed || result.outputTruncated || result.setupFailed) {
        throw new Error('packed CLI probe cleanup or setup failed');
      }
    }
  } finally {
    rmSync(temporaryHomePath, { recursive: true, force: true });
  }

  const after = credentialFingerprint(callerCredentialPath);
  if (after !== before) throw new Error('caller credential fingerprint changed');
  return Object.freeze({
    outcome,
    temporaryHomePath,
    temporaryHomeMode,
    temporaryResourcesRemoved: !existsSync(temporaryHomePath),
    callerCredentialFingerprintBefore: before,
    callerCredentialFingerprintAfter: after,
  });
}
