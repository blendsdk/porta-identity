/**
 * Initialization guidance specification for the supported administration command.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('initialization administration guidance', () => {
  it('should name porta admin and omit porta gui when initialization succeeds', async () => {
    const initCommandPath = resolve(import.meta.dirname, '../../../../src/cli/commands/init.ts');
    const source = await readFile(initCommandPath, 'utf8');

    expect(source).toContain('porta admin');
    expect(source).not.toContain('porta gui');
  });
});
