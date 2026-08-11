import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

import { z } from 'zod';

import type { HostProcessIdentity } from '../fixtures/lifecycle-planned.js';
import { FileLeaseStateAdapter, linuxProcessIdentity } from '../fixtures/lifecycle-system.js';

/** Fixed client modules that a lifecycle-owned bootstrap may start. */
const clientModules = {
  spa: 'test-harness/spa-server.ts',
  bff: 'test-harness/bff/server.ts',
} as const;

/** Validated bootstrap role supplied only by the lifecycle supervisor. */
const role = z.enum(['spa', 'bff']).parse(process.argv[2]);

/** Required durable lookup identity inherited from the endpoint manifest environment. */
const environment = z
  .object({
    HARNESS_RUN_ID: z.uuid(),
    HARNESS_WORKTREE: z.string().min(1),
  })
  .parse(process.env);

/** Registers this paused process before any client module can bind or serve an endpoint. */
async function registerPausedProcess(): Promise<void> {
  const leases = new FileLeaseStateAdapter();
  const lookup = {
    runId: environment.HARNESS_RUN_ID,
    worktreePath: environment.HARNESS_WORKTREE,
  };
  const persisted = await leases.read(lookup);
  if (typeof persisted === 'string') throw new Error('client bootstrap lease is unavailable');
  if (persisted.hostProcesses.some((identity) => identity.role === role)) {
    throw new Error('client bootstrap role is already registered');
  }
  const identity: HostProcessIdentity = Object.freeze({
    role,
    ...linuxProcessIdentity(process.pid),
  });
  const finalized = await leases.finalizeResources(
    persisted,
    Object.freeze({
      ...persisted,
      hostProcesses: Object.freeze([...persisted.hostProcesses, identity]),
    }),
  );
  if (finalized === 'mismatch') throw new Error('client bootstrap ownership changed');
}

/** Starts one service child beneath the stable, durably registered bootstrap identity. */
function startService(): ChildProcess {
  return spawn(
    process.execPath,
    ['--import', 'tsx', resolve(environment.HARNESS_WORKTREE, clientModules[role])],
    {
      cwd: environment.HARNESS_WORKTREE,
      env: process.env,
      shell: false,
      stdio: 'inherit',
    },
  );
}

await registerPausedProcess();
process.send?.('registered');

let service: ChildProcess | undefined;
let operation: Promise<void> = Promise.resolve();
let expectedExit = false;

/** Stops the current service child and waits until its resources are released. */
async function stopService(): Promise<void> {
  const current = service;
  if (current === undefined) return;
  expectedExit = true;
  if (current.exitCode === null && current.signalCode === null) current.kill('SIGTERM');
  await new Promise<void>((resolveExit) => {
    if (current.exitCode !== null || current.signalCode !== null) resolveExit();
    else current.once('exit', () => resolveExit());
  });
  service = undefined;
  expectedExit = false;
}

/** Launches a new child and fails closed if it exits outside an owned restart. */
function launchService(): void {
  const child = startService();
  service = child;
  child.once('error', () => process.exit(30));
  child.once('exit', () => {
    if (!expectedExit) process.exit(30);
  });
}

process.on('message', (message: unknown) => {
  if (message === 'release' && service === undefined) {
    launchService();
    return;
  }
  if (message !== 'restart') return;
  operation = operation.then(async () => {
    await stopService();
    launchService();
    process.send?.('restarted');
  });
});

// Losing the owning IPC channel terminates the service child before the stable bootstrap exits.
process.once('disconnect', () => {
  void stopService().finally(() => process.exit(30));
});
