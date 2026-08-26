import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

/** UUID format used for the campaign run and individual signal cases. */
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** Runs one isolated resource owner until the campaign sends its registered signal. */
async function main(arguments_: readonly string[]): Promise<void> {
  if (arguments_.length !== 3) throw new Error('command signal probe arguments are invalid');
  const [runtimeParent, runId, caseId] = arguments_;
  if (
    runtimeParent === undefined ||
    !uuidPattern.test(runId ?? '') ||
    !uuidPattern.test(caseId ?? '')
  ) {
    throw new Error('command signal probe ownership is invalid');
  }
  const canonicalParent = realpathSync(runtimeParent);
  const expectedSuffix = resolve('test-harness/.assurance-runtime/command-outcomes');
  if (!canonicalParent.endsWith(expectedSuffix)) {
    throw new Error('command signal probe root is outside the assurance runtime');
  }
  const caseRoot = resolve(canonicalParent, runId, 'cases', caseId);
  mkdirSync(caseRoot, { recursive: true, mode: 0o700 });
  const resourcePath = resolve(caseRoot, 'owned-resource');
  const readyPath = resolve(caseRoot, 'ready');
  writeFileSync(resourcePath, 'owned\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  const descendant = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
    detached: false,
    stdio: 'ignore',
  });

  let finalizing = false;
  const finalize = (exitCode: 130 | 143): void => {
    if (finalizing) return;
    finalizing = true;
    rmSync(caseRoot, { recursive: true, force: true });
    process.exit(exitCode);
  };
  process.once('SIGINT', () => finalize(130));
  process.once('SIGTERM', () => finalize(143));
  process.once('disconnect', () => finalize(143));
  writeFileSync(readyPath, `${descendant.pid ?? 0}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  while (existsSync(resourcePath)) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }
}

await main(process.argv.slice(2));
