import { mkdtempSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getLocalesDirectory,
  getMigrationsDirectory,
  getSeedSqlPath,
  getTemplatesDirectory,
} from '../../../src/lib/runtime-paths.js';

const physicalPackageRoot = realpathSync(resolve(import.meta.dirname, '../../..'));

/**
 * Determines whether a path stays below a parent directory after both paths are resolved.
 * The relative-path check avoids unsafe string-prefix comparisons between sibling directories.
 *
 * @param parentDirectory Physical directory that must contain the candidate.
 * @param candidatePath Physical path expected below the parent directory.
 * @returns Whether the candidate remains inside the parent directory.
 */
function isWithinDirectory(parentDirectory: string, candidatePath: string): boolean {
  const relativePath = relative(parentDirectory, candidatePath);

  return (
    relativePath !== '' &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

describe('server runtime paths', () => {
  // Runtime assets resolve from the installed server package, even when the process starts elsewhere.
  it('should resolve existing package assets independently of the working directory', () => {
    const originalWorkingDirectory = process.cwd();
    const unrelatedWorkingDirectory = mkdtempSync(join(tmpdir(), 'porta-runtime-paths-'));

    try {
      process.chdir(unrelatedWorkingDirectory);

      const runtimePaths = [
        {
          label: 'migrations directory',
          returnedPath: getMigrationsDirectory(),
          expectedPath: resolve(physicalPackageRoot, 'migrations'),
          expectedKind: 'directory',
        },
        {
          label: 'seed SQL file',
          returnedPath: getSeedSqlPath(),
          expectedPath: resolve(physicalPackageRoot, 'migrations/011_seed.sql'),
          expectedKind: 'file',
        },
        {
          label: 'templates directory',
          returnedPath: getTemplatesDirectory(),
          expectedPath: resolve(physicalPackageRoot, 'templates'),
          expectedKind: 'directory',
        },
        {
          label: 'locales directory',
          returnedPath: getLocalesDirectory(),
          expectedPath: resolve(physicalPackageRoot, 'locales'),
          expectedKind: 'directory',
        },
      ] as const;

      for (const runtimePath of runtimePaths) {
        expect(isAbsolute(runtimePath.returnedPath), `${runtimePath.label} must be absolute`).toBe(
          true,
        );

        const physicalRuntimePath = realpathSync(runtimePath.returnedPath);
        expect(
          isWithinDirectory(physicalPackageRoot, physicalRuntimePath),
          `${runtimePath.label} must remain inside the physical server package`,
        ).toBe(true);
        expect(
          isWithinDirectory(realpathSync(unrelatedWorkingDirectory), physicalRuntimePath),
          `${runtimePath.label} must not resolve inside the unrelated working directory`,
        ).toBe(false);
        expect(
          physicalRuntimePath,
          `${runtimePath.label} must target the expected package asset`,
        ).toBe(realpathSync(runtimePath.expectedPath));

        const assetStats = statSync(physicalRuntimePath);
        if (runtimePath.expectedKind === 'directory') {
          expect(assetStats.isDirectory(), `${runtimePath.label} must be a directory`).toBe(true);
        } else {
          expect(assetStats.isFile(), `${runtimePath.label} must be a file`).toBe(true);
        }
      }
    } finally {
      process.chdir(originalWorkingDirectory);
      rmSync(unrelatedWorkingDirectory, { recursive: true });
    }
  });
});
