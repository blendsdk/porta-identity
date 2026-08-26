/**
 * Playwright global setup — runs once before the test suite.
 * Requests the active typed lifecycle supervisor to reset required scenario prerequisites.
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export default async function globalSetup(): Promise<void> {
  // The assurance supervisor resets immediately before admitting a project and serializes the
  // project until completion. Asking that same supervisor to prepare again from Playwright's
  // child process would wait on the project that is waiting on this setup hook.
  if (process.env.HARNESS_PROJECT_ADMITTED === '1') return;
  const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', resolve(import.meta.dirname, '../scripts/lifecycle.ts'), 'prepare'],
      {
        cwd: resolve(import.meta.dirname, '../..'),
        env: process.env,
        shell: false,
        stdio: 'inherit',
      },
    );
    child.once('error', rejectExit);
    child.once('exit', (code) => resolveExit(code ?? 30));
  });
  if (exitCode !== 0) throw new Error(`Harness preparation failed with exit ${exitCode}`);
}
