import { pathToFileURL } from 'node:url';
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

// Losing the owning IPC channel is an immediate fail-closed shutdown. Durable registration lets
// stale cleanup distinguish this absence from an unrelated process that later reuses the PID.
process.once('disconnect', () => process.exit(30));

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

/** Waits in a non-serving state until the owner confirms durable registration was observed. */
function waitForRelease(): Promise<void> {
  const keepAlive = setInterval(() => undefined, 60_000);
  return new Promise((resolveRelease) => {
    process.on('message', (message: unknown) => {
      if (message !== 'release') return;
      clearInterval(keepAlive);
      resolveRelease();
    });
  });
}

await registerPausedProcess();
process.send?.('registered');
await waitForRelease();
await import(pathToFileURL(resolve(environment.HARNESS_WORKTREE, clientModules[role])).href);
