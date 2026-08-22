import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

// Initial and reset bootstrap share the owner-only input-file path. Password material cannot
// appear in Docker or host-process argument vectors where another local process can inspect it.
test('should keep initial bootstrap credentials out of process arguments', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, '../../fixtures/lifecycle-runtime.ts'),
    'utf8',
  );

  assert.ok(source.includes('runOwnerOnlyBootstrap(this.runner, manifest, signal)'));
  assert.ok(!source.includes("'--password'"));
  assert.ok(!source.includes('TestPassword123!'));
});

// The launcher owns interruption before it creates the detached supervisor and joins the exact
// child plus stale-run cleanup before publishing an interrupted or failed readiness outcome.
test('should install startup interruption ownership before spawning the supervisor', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../../scripts/lifecycle.ts'), 'utf8');
  const start = source.indexOf('async function start(');
  const signal = source.indexOf("process.once('SIGINT', onSigint)", start);
  const spawn = source.indexOf('child = spawn(', start);
  const join = source.indexOf('await waitForSupervisorExit(child)', spawn);

  assert.ok(start >= 0 && signal > start && spawn > signal && join > spawn);
});

// Reset starts only Porta for private health verification. Nginx remains stopped until the final
// traffic-admission adapter resumes the run after every digest and poison transition succeeds.
test('should keep public ingress stopped until reset finalization resumes traffic', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, '../../fixtures/lifecycle-runtime-reset.ts'),
    'utf8',
  );
  const restart = source.slice(
    source.indexOf('async restartPorta('),
    source.indexOf('state: new FileResetStateAdapter()', source.indexOf('async restartPorta(')),
  );
  const resume = source.slice(
    source.indexOf('async resume('),
    source.indexOf('async restore(', source.indexOf('async resume(')),
  );

  assert.ok(!restart.includes("serviceContainerId(runner, record, 'nginx'"));
  assert.ok(resume.includes("serviceContainerId(runner, record, 'nginx'"));
  assert.ok(resume.includes("['unpause', nginx]"));
});

// Admitted projects inherit the supervisor's abort signal, run inside a bounded process group,
// and preserve product/test/setup classes rather than collapsing every nonzero result to setup.
test('should own project cancellation and preserve project failure classes', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../../scripts/lifecycle.ts'), 'utf8');

  assert.ok(source.includes('activeProjectAbort?.abort()'));
  assert.ok(source.includes('timeoutMilliseconds: 1_800_000'));
  assert.ok(source.includes('signal,'));
  assert.ok(source.includes('exitCode === 20'));
  assert.ok(source.includes("'product-failure'"));
  assert.ok(source.includes('exitCode === 21'));
  assert.ok(source.includes("'test-failure'"));
});
