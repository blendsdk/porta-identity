/** Owned regular files are bounded, strictly decoded and closed, including read-time growth. */
import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCliError } from '../src/error-format.js';
import { createEmptyHome, expectErrorEnvelope, removeEmptyHome, runExecutable } from './helpers/json-error-contract.js';

const limit = 1_048_576;
const invalid = { code: 'VALIDATION_ERROR', message: 'The command input is invalid.' };
const org = '11111111-1111-4111-8111-111111111111';
const execute = promisify(execFile);
let root: string;

/** Keep native platform qualification independent while delegating every read to the real reader. */
async function readRecipients(path: string) {
  const { readBulkRecipients } = await import('../src/bulk-invite-input.js');
  return readBulkRecipients(path);
}

/** Keep bytes valid independently of their size, so the boundary—not email syntax—is tested. */
function bytes(length: number): Buffer {
  const prefix = 'alice@example.com\n';
  return Buffer.from(prefix + ' '.repeat(length - Buffer.byteLength(prefix)));
}

/** Observe the owned external descriptor without prescribing the reader's chunking algorithm. */
function observeDescriptors(growPath?: string) {
  const open = fs.open.bind(fs);
  const closes: ReturnType<typeof vi.spyOn>[] = [];
  const opens = vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
    const handle = await open(...args);
    closes.push(vi.spyOn(handle, 'close'));
    if (growPath) {
      const stat = handle.stat.bind(handle);
      vi.spyOn(handle, 'stat').mockImplementation(async () => {
        const initial = await stat();
        // Growth happens after descriptor metadata is obtained but before reading can begin.
        await fs.appendFile(growPath, ' ');
        return initial;
      });
    }
    return handle;
  });
  syncBuiltinESMExports();
  return { opens, closes };
}

beforeEach(async () => { root = await createEmptyHome(); });
afterEach(async () => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  await removeEmptyHome(root);
});

describe('bounded regular-file reads', () => {
  it('should accept exactly one mebibyte and close the descriptor', async () => {
    const path = join(root, 'at-limit.txt');
    await fs.writeFile(path, bytes(limit));
    const observed = observeDescriptors();
    expect(await readRecipients(path)).toStrictEqual({
      inputRecords: 1, duplicates: 0, recipients: [{ line: 1, email: 'alice@example.com' }],
    });
    expect(observed.opens).toHaveBeenCalled();
    expect(observed.closes.length).toBeGreaterThan(0);
    for (const close of observed.closes) expect(close).toHaveBeenCalledOnce();
  });

  it.each(['already oversized', 'grows after descriptor stat'])('should reject %s and close the descriptor', async (scenario) => {
    const path = join(root, 'over-limit.txt');
    await fs.writeFile(path, bytes(scenario === 'already oversized' ? limit + 1 : limit));
    const observed = observeDescriptors(scenario === 'grows after descriptor stat' ? path : undefined);
    await expect(readRecipients(path)).rejects.toThrow();
    expect(observed.opens).toHaveBeenCalled();
    expect(observed.closes.length).toBeGreaterThan(0);
    for (const close of observed.closes) expect(close).toHaveBeenCalledOnce();
    if (scenario === 'grows after descriptor stat') expect((await fs.stat(path)).size).toBeGreaterThan(limit);
  });

  it.each([
    [0xc3, 0x28], [0xed, 0xa0, 0x80], [0xf0, 0x9f], [0xff],
  ])('should reject invalid raw UTF-8 %j without replacement decoding and close the descriptor', async (...invalidBytes) => {
    const path = join(root, 'invalid-utf8.txt');
    await fs.writeFile(path, Buffer.concat([Buffer.from('alice@example.com\n'), Buffer.from(invalidBytes)]));
    const observed = observeDescriptors();
    await expect(readRecipients(path)).rejects.toThrow();
    expect(observed.opens).toHaveBeenCalled();
    expect(observed.closes.length).toBeGreaterThan(0);
    for (const close of observed.closes) expect(close).toHaveBeenCalledOnce();
  });

  it('should preserve BOM, CRLF and physical-line normalization through actual byte decoding', async () => {
    const path = join(root, 'recipients.txt');
    await fs.writeFile(path, '\uFEFF Alice@EXAMPLE.com \r\n\r\nalice@example.com\r\nbob@example.com\r\n');
    expect(await readRecipients(path)).toStrictEqual({
      inputRecords: 3, duplicates: 1,
      recipients: [{ line: 1, email: 'Alice@EXAMPLE.com' }, { line: 4, email: 'bob@example.com' }],
    });
  });

  it('should read spaces and shell metacharacters literally without creating a side file', async () => {
    const name = 'recipients with spaces; touch SENSITIVE_MARKER; $(touch SENSITIVE_MARKER) `touch SENSITIVE_MARKER`.txt';
    const path = join(root, name);
    await fs.writeFile(path, 'alice@example.com');
    // An isolated working directory contains even the side effect of an incorrect shell reader.
    const script = `
      const { readBulkRecipients } = await import(${JSON.stringify(new URL('../src/bulk-invite-input.ts', import.meta.url).href)});
      console.log(JSON.stringify(await readBulkRecipients(${JSON.stringify(path)})));
    `;
    const result = await execute(process.execPath, [
      '--import', import.meta.resolve('tsx'), '--input-type=module', '--eval', script,
    ], {
      cwd: root, timeout: 5000,
      env: { HOME: root, XDG_CONFIG_HOME: root, TMPDIR: root, NO_COLOR: '1', TSX_DISABLE_CACHE: '1' },
    });
    expect(JSON.parse(result.stdout).recipients).toStrictEqual([{ line: 1, email: 'alice@example.com' }]);
    expect(result.stderr).toBe('');
    expect(await fs.readdir(root)).toStrictEqual([name]);
  });

  it.each(['missing', 'directory'])('should reject an owned %s path with only a fixed machine diagnostic', async (kind) => {
    const path = join(root, `SENSITIVE_MARKER-${kind}`);
    if (kind === 'directory') await fs.mkdir(path);
    let error: unknown;
    try { await readRecipients(path); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(Error);
    expect(formatCliError(error)).toStrictEqual(invalid);
  });

  it('should bound an external unreadable-file fault without leaking its path', async () => {
    const path = join(root, 'SENSITIVE_MARKER-unreadable.txt');
    await fs.writeFile(path, 'alice@example.com');
    const open = vi.spyOn(fs, 'open').mockRejectedValue(Object.assign(new Error(path), { code: 'EACCES' }));
    syncBuiltinESMExports();
    let error: unknown;
    try { await readRecipients(path); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(Error);
    expect(formatCliError(error)).toStrictEqual(invalid);
    expect(open).toHaveBeenCalled();
  });
});

describe.skipIf(process.platform === 'win32' || !constants.O_NONBLOCK)('qualified POSIX FIFO without a writer', () => {
  it('should demonstrate that this platform opens the FIFO nonblocking and sees a non-regular descriptor', async () => {
    const path = join(root, 'no-writer.fifo');
    await execute('mkfifo', [path]);
    const handle = await fs.open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      expect((await handle.stat()).isFIFO()).toBe(true);
      expect((await handle.stat()).isFile()).toBe(false);
    } finally {
      await handle.close();
    }
  });

  it('should reject the owned descriptor even if a path precheck reports a regular file', async () => {
    const path = join(root, 'no-writer.fifo');
    const regular = join(root, 'regular.txt');
    await execute('mkfifo', [path]);
    await fs.writeFile(regular, 'alice@example.com');
    // A killable child contains a broken blocking open. The forged path metadata models a
    // replacement race; the actual opened descriptor must still be checked and closed.
    const script = `
      import fs from 'node:fs/promises';
      import { syncBuiltinESMExports } from 'node:module';
      const path = ${JSON.stringify(path)};
      const metadata = await fs.stat(${JSON.stringify(regular)});
      const realStat = fs.stat.bind(fs), realLstat = fs.lstat.bind(fs), realOpen = fs.open.bind(fs);
      fs.stat = async (candidate, ...args) => candidate === path ? metadata : realStat(candidate, ...args);
      fs.lstat = async (candidate, ...args) => candidate === path ? metadata : realLstat(candidate, ...args);
      let flags, descriptorChecked = false, closed = false;
      fs.open = async (...args) => {
        flags = args[1];
        const handle = await realOpen(...args);
        const stat = handle.stat.bind(handle), close = handle.close.bind(handle);
        handle.stat = async (...args) => { descriptorChecked = true; return stat(...args); };
        handle.close = async () => { try { return await close(); } finally { closed = true; } };
        return handle;
      };
      syncBuiltinESMExports();
      const { readBulkRecipients } = await import(${JSON.stringify(new URL('../src/bulk-invite-input.ts', import.meta.url).href)});
      const { formatCliError } = await import(${JSON.stringify(new URL('../src/error-format.ts', import.meta.url).href)});
      let failure;
      try { await readBulkRecipients(path); } catch (error) { failure = formatCliError(error); }
      console.log(JSON.stringify({ failure, flags, descriptorChecked, closed }));
    `;
    const result = await execute(process.execPath, [
      '--import', import.meta.resolve('tsx'), '--input-type=module', '--eval', script,
    ], {
      cwd: root, timeout: 5000,
      env: { HOME: root, XDG_CONFIG_HOME: root, TMPDIR: root, NO_COLOR: '1', TSX_DISABLE_CACHE: '1' },
    });
    const observation = JSON.parse(result.stdout);
    expect(observation.failure).toStrictEqual(invalid);
    expect(observation.descriptorChecked).toBe(true);
    expect(observation.closed).toBe(true);
    expect(typeof observation.flags).toBe('number');
    expect(observation.flags & constants.O_NONBLOCK).toBe(constants.O_NONBLOCK);
    expect(result.stderr).toBe('');
  });

  it('should complete local rejection in a killable child rather than block opening a no-writer FIFO', async () => {
    const path = join(root, 'no-writer.fifo');
    await execute('mkfifo', [path]);
    const result = await runExecutable(['bulk', 'invite', '--file', path, '--org', org, '--json']);
    expect(result.status).toBe(3);
    expect(result.stdout).toBe('');
    expectErrorEnvelope(result.stderr, invalid);
    expect((await fs.lstat(path)).isFIFO()).toBe(true);
  });
});
