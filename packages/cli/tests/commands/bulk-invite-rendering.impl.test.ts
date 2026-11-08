/** Maximum-size human reports stay bounded even when authentication stops before HTTP dispatch. */
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { createEmptyHome, removeEmptyHome } from '../helpers/json-error-contract.js';

it('should render the exact file and recipient limits in a memory-bounded isolated child', async () => {
  const home = await createEmptyHome();
  try {
    const emails = Array.from({ length: 999 }, (_, index) => `recipient-${index}@example.com`);
    const suffix = `\n${emails.join('\n')}\n`;
    const domain = '@example.com';
    const longEmail = 'a'.repeat(1_048_576 - Buffer.byteLength(domain + suffix)) + domain;
    const source = longEmail + suffix;
    expect(Buffer.byteLength(source)).toBe(1_048_576);
    const file = join(home, 'recipients.txt');
    await writeFile(file, source);
    const entry = fileURLToPath(new URL('../../src/index.ts', import.meta.url));
    // Keep a future regression killable and memory-bounded instead of risking the test worker.
    // Empty credentials establish a normal authentication stop; any unexpected HTTP is blocked.
    const script = `
      globalThis.fetch = async () => { throw new Error('Unexpected HTTP call'); };
      process.argv = [process.execPath, ${JSON.stringify(entry)}, 'bulk', 'invite',
        '--file', ${JSON.stringify(file)}, '--org', '11111111-1111-4111-8111-111111111111',
        '--server', 'https://porta.example.test'];
      await import(${JSON.stringify(new URL('../../src/index.ts', import.meta.url).href)});
    `;
    const result = await new Promise<{ stdout: string; stderr: string; status: number }>(
      (resolve, reject) => {
        execFile(
          process.execPath,
          [
            '--max-old-space-size=128',
            '--import',
            fileURLToPath(import.meta.resolve('tsx')),
            '--input-type=module',
            '--eval',
            script,
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
            timeout: 15_000,
            maxBuffer: 2 * 1_048_576,
            encoding: 'utf8',
          },
          (error, stdout, stderr) => {
            if (error && (error.killed || typeof error.code !== 'number')) {
              reject(new Error('Memory-bounded human-report child did not finish normally'));
              return;
            }
            resolve({ stdout, stderr, status: error?.code ?? 0 });
          },
        );
      },
    );
    expect(result.status).toBe(2);
    expect(result.stdout).toContain(longEmail);
    expect(result.stdout.indexOf(longEmail)).toBeLessThan(result.stdout.indexOf(emails[0]!));
    expect(result.stdout).toContain(emails[998]);
    expect(result.stdout).toContain('unattempted');
    expect(result.stdout).toMatch(/uniqueRecipients[^\w\r\n]*1000\b/);
    expect(Buffer.byteLength(result.stdout)).toBeLessThan(1_048_576 + 1000 * 100 + 10_000);
    expect(result.stderr).toContain('Authentication is required.');
    expect(result.stderr).not.toContain(file);
  } finally {
    await removeEmptyHome(home);
  }
}, 20_000);
