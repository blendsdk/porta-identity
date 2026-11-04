/** Shared observations for command errors; the formatter and parser remain real. */
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';
import { expect, vi } from 'vitest';

/** Exit sentinel used only to stop a terminating command inside the test process. */
export class CommandExit extends Error {
  /** Construct an identifiable exit without disguising unrelated command exceptions. */
  constructor() {
    super('Command terminated');
  }
}

/** Capture both console calls and direct writes, without prescribing either transport. */
export function captureCommandOutput() {
  const output = { stdout: '', stderr: '' };
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output.stdout += `${format(...args)}\n`;
  });
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    output.stderr += `${format(...args)}\n`;
  });
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    output.stderr += `${format(...args)}\n`;
  });
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output.stdout += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    output.stderr += String(chunk);
    return true;
  });
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new CommandExit();
  });
  return output;
}

/** Require exactly one newline-terminated JSON value, with no help or human prefix. */
export function expectErrorEnvelope(stderr: string, expected: object): void {
  expect(stderr.endsWith('\n')).toBe(true);
  expect(stderr.split('\n')).toHaveLength(2);
  expect(JSON.parse(stderr)).toStrictEqual(expected);
}

/** Create an empty owned home; callers must remove it in their teardown. */
export function createEmptyHome(): Promise<string> {
  return mkdtemp(join(process.env.CODEOPS_TMPDIR ?? tmpdir(), 'porta-json-errors-'));
}

/** Remove only an exact directory returned by createEmptyHome. */
export function removeEmptyHome(home: string): Promise<void> {
  return rm(home, { recursive: true, force: true });
}

/** Run the source executable with synthetic arguments and no inherited operator configuration. */
export async function runExecutable(args: readonly string[]) {
  const home = await createEmptyHome();
  try {
    return await new Promise<{ stdout: string; stderr: string; status: number }>(
      (resolve, reject) => {
        execFile(
          process.execPath,
          [
            '--import',
            fileURLToPath(import.meta.resolve('tsx')),
            fileURLToPath(new URL('../../src/index.ts', import.meta.url)),
            ...args,
          ],
          {
            cwd: home,
            env: {
              HOME: home,
              XDG_CONFIG_HOME: home,
              TMPDIR: home,
              NO_COLOR: '1',
              TSX_DISABLE_CACHE: '1',
            },
            timeout: 10_000,
            maxBuffer: 1024 * 1024,
            encoding: 'utf8',
          },
          (error, stdout, stderr) => {
            if (error && (error.killed || typeof error.code !== 'number')) {
              reject(error);
              return;
            }
            resolve({ stdout, stderr, status: error?.code ?? 0 });
          },
        );
      },
    );
  } finally {
    await removeEmptyHome(home);
  }
}
