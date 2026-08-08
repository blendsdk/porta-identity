import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');

/**
 * Reads a repository JSON file and reports its path when parsing fails.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {Record<string, any>} Parsed JSON object.
 */
function readRepositoryJson(repositoryPath) {
  const absolutePath = resolve(repositoryRoot, repositoryPath);

  try {
    return JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    throw new Error(`Expected ${repositoryPath} to contain valid JSON`, { cause: error });
  }
}

/**
 * Reports whether a repository-relative path exists as a directory.
 * Missing paths return false so assertions can provide contract-specific messages.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {boolean} Whether the path exists and is a directory.
 */
function isRepositoryDirectory(repositoryPath) {
  try {
    return statSync(resolve(repositoryRoot, repositoryPath)).isDirectory();
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

// Server source, behavior tests, and runtime assets move together into one self-contained package.
test('should keep all server-owned directories inside the server package', () => {
  for (const directoryName of ['src', 'tests', 'migrations', 'templates', 'locales']) {
    assert.equal(
      isRepositoryDirectory(`packages/server/${directoryName}`),
      true,
      `packages/server/${directoryName}/ must exist after the server migration`,
    );
    assert.equal(
      isRepositoryDirectory(directoryName),
      false,
      `legacy root ${directoryName}/ must be absent after the server migration`,
    );
  }

  assert.equal(
    isRepositoryDirectory('repo-tests'),
    true,
    'root repo-tests/ must remain outside the server package',
  );
});

// The server package retains the synchronized baseline version and exposes its executable entry points.
test('should identify the server package and its executable entry points', () => {
  const serverManifest = readRepositoryJson('packages/server/package.json');

  assert.equal(
    serverManifest.name,
    '@portaidentity/server',
    'server package name must use the retained public scope',
  );
  assert.equal(
    serverManifest.version,
    '1.6.2',
    'server package must remain at the synchronized pre-release baseline version',
  );
  assert.equal(
    serverManifest.bin?.['porta-server'],
    'dist/cli/index.js',
    'porta-server executable must target the compiled server CLI',
  );
  assert.equal(
    serverManifest.scripts?.start,
    'node dist/index.js',
    'server start script must run the compiled server entry point',
  );
});
