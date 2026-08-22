import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

const runner = 'test-harness/assurance/scripts/run-command.ts';

/** Waits for one predicate without extending the command's bounded lifecycle. */
async function waitFor(predicate: () => boolean, timeoutMilliseconds = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('timed out waiting for signal-probe state');
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
}

/** Returns whether a process still exists without changing it. */
function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

for (const [signal, expectedExit] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
] as const) {
  test(`forwards ${signal} to the child group and leaves no descendant`, async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), 'porta-assurance-signal-'));
    const pidFile = resolve(sandbox, 'child.pid');
    const childEnvironment = { ...process.env, PORTA_ASSURANCE_SIGNAL_PROBE_PID_FILE: pidFile };
    Reflect.deleteProperty(childEnvironment, 'NODE_TEST_CONTEXT');
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', runner, 'test', '--select', 'assurance-signal-probe'],
      {
        cwd: process.cwd(),
        env: childEnvironment,
        stdio: 'ignore',
      },
    );

    let descendantPid: number | undefined;
    try {
      await waitFor(() => existsSync(pidFile));
      descendantPid = Number.parseInt(readFileSync(pidFile, 'utf8'), 10);
      assert.ok(Number.isSafeInteger(descendantPid));
      child.kill(signal);
      const outcome = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
        (resolveClose) =>
          child.once('close', (code, closeSignal) => resolveClose({ code, signal: closeSignal })),
      );
      assert.deepEqual(outcome, { code: expectedExit, signal: null });
      await waitFor(() => !processExists(descendantPid!));
    } finally {
      child.kill('SIGKILL');
      if (descendantPid !== undefined && processExists(descendantPid)) {
        process.kill(descendantPid, 'SIGKILL');
      }
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
}
