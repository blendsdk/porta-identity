import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChildExecutionAdapter, SpawnRequest } from '../../fixtures/lifecycle-planned.js';
import { runCompatibilityCommand } from '../../fixtures/lifecycle-planned.js';

/** Creates an execution recorder returning a selected child exit status. */
function createChildRecorder(exitCode: number): {
  readonly adapter: ChildExecutionAdapter;
  readonly requests: readonly SpawnRequest[];
} {
  const requests: SpawnRequest[] = [];
  return {
    adapter: {
      async spawn(request) {
        requests.push(request);
        return exitCode;
      },
    },
    requests,
  };
}

// Compatibility callers pass an argument vector and explicit environment directly to the
// TypeScript entry point; shell parsing is never enabled.
test('should preserve argv and environment with shell execution disabled', async () => {
  const recorder = createChildRecorder(0);
  const args = [
    '--run-id',
    '8f41b7d1-89b5-4ea9-a248-d1807f370888',
    '--worktree',
    '/worktrees/porta a',
  ];
  const environment = { PORTA_HARNESS_ENVIRONMENT: 'assurance-a' };

  const outcome = await runCompatibilityCommand(
    { action: 'start', args, environment },
    recorder.adapter,
  );

  assert.equal(outcome.exitCode, 0);
  assert.equal(recorder.requests.length, 1);
  assert.deepEqual(recorder.requests[0]?.args.slice(-args.length), args);
  assert.deepEqual(recorder.requests[0]?.environment, environment);
  assert.equal(recorder.requests[0]?.shell, false);
});

// Setup, cleanup, and timeout results retain the lifecycle's stable process semantics.
for (const exitCode of [30, 60, 70] as const) {
  test(`should preserve lifecycle exit code ${exitCode} through the compatibility boundary`, async () => {
    const recorder = createChildRecorder(exitCode);

    const outcome = await runCompatibilityCommand(
      { action: 'stop', args: [], environment: {} },
      recorder.adapter,
    );

    assert.equal(outcome.exitCode, exitCode);
    assert.equal(outcome.primaryExitCode, exitCode);
    if (exitCode === 70) assert.equal(outcome.classification, 'timeout');
  });
}

// A signal received after successful cleanup exits using conventional signal semantics.
for (const [signal, exitCode] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
] as const) {
  test(`should classify ${signal} as ${exitCode} after successful cleanup`, async () => {
    const recorder = createChildRecorder(0);

    const outcome = await runCompatibilityCommand(
      { action: 'stop', args: [], environment: {}, signal },
      recorder.adapter,
    );

    assert.equal(outcome.exitCode, exitCode);
    assert.equal(outcome.classification, 'interrupted');
    assert.equal(outcome.primaryExitCode, 0);
  });
}

// Cleanup failure has precedence over a signal because incomplete ownership cleanup is unsafe.
test('should preserve cleanup failure precedence when a signal is also present', async () => {
  const recorder = createChildRecorder(60);

  const outcome = await runCompatibilityCommand(
    { action: 'stop', args: [], environment: {}, signal: 'SIGTERM' },
    recorder.adapter,
  );

  assert.equal(outcome.exitCode, 60);
  assert.equal(outcome.classification, 'cleanup-failure');
});
