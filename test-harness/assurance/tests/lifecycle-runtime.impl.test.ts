import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRuntimeDependencies,
  RuntimeCommandRunner,
} from '../../fixtures/lifecycle-runtime.js';

// An already-aborted operation must terminate its child group instead of missing the one-shot
// listener and waiting for the child's ordinary timeout.
test('should terminate a child when its signal was already aborted', async () => {
  const runner = new RuntimeCommandRunner();
  const startedAt = Date.now();

  await assert.rejects(
    runner.run(process.execPath, ['-e', 'setInterval(() => undefined, 60_000)'], {
      cwd: process.cwd(),
      environment: {},
      signal: AbortSignal.abort(),
    }),
    /deadline/u,
  );

  assert.ok(Date.now() - startedAt < 5_000);
});

// Deadline expiry waits for cooperative cleanup to settle, then rejects even when the work tries
// to return a normal value after observing cancellation.
test('should join aborted work and never publish late success', async () => {
  const externalAbort = new AbortController();
  const dependencies = createRuntimeDependencies(process.cwd(), externalAbort.signal);
  let cleanupSettled = false;
  const execution = dependencies.deadlines.run('startup', async (signal) => {
    await new Promise<void>((resolveCleanup) => {
      signal.addEventListener(
        'abort',
        () => {
          setTimeout(() => {
            cleanupSettled = true;
            resolveCleanup();
          }, 10);
        },
        { once: true },
      );
    });
    return 'late-success';
  });

  externalAbort.abort();

  await assert.rejects(execution, /deadline/u);
  assert.equal(cleanupSettled, true);
});
