import { readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getLocalesDirectory,
  getMigrationsDirectory,
  getSeedSqlPath,
  getTemplatesDirectory,
} from '../../../src/lib/runtime-paths.js';

describe('runtime path implementation', () => {
  it('should derive every fixed asset from one package root', () => {
    const migrationsDirectory = getMigrationsDirectory();
    const packageRoot = dirname(migrationsDirectory);

    expect(basename(migrationsDirectory)).toBe('migrations');
    expect(getTemplatesDirectory()).toBe(join(packageRoot, 'templates'));
    expect(getLocalesDirectory()).toBe(join(packageRoot, 'locales'));
    expect(getSeedSqlPath()).toBe(join(migrationsDirectory, '011_seed.sql'));
  });

  it('should expose only fixed no-argument asset accessors', () => {
    for (const accessor of [
      getMigrationsDirectory,
      getSeedSqlPath,
      getTemplatesDirectory,
      getLocalesDirectory,
    ]) {
      expect(accessor.length).toBe(0);
    }
  });

  it('should retain module-relative root derivation in the resolver source', () => {
    const sourcePath = resolve(import.meta.dirname, '../../../src/lib/runtime-paths.ts');
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).toContain("new URL('../..', import.meta.url)");
    expect(source).not.toMatch(/process\.cwd\s*\(/);
  });
});
