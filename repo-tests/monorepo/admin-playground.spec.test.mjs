import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');

/**
 * Reads a repository JSON file and reports its path when parsing fails.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {Record<string, unknown>} Parsed JSON object.
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
 * Reports whether a repository-relative path exists as a regular file.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {boolean} Whether the path exists and is a regular file.
 */
function isRepositoryFile(repositoryPath) {
  try {
    return statSync(resolve(repositoryRoot, repositoryPath)).isFile();
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

/**
 * Reports whether a repository-relative path exists as a directory.
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

/**
 * Recursively reads source files selected by an extension pattern.
 *
 * @param {string} repositoryPath Directory relative to the repository root.
 * @param {RegExp} extensionPattern File-name pattern to include.
 * @returns {Array<{ path: string, contents: string }>} Selected source files and their contents.
 */
function readRepositorySources(repositoryPath, extensionPattern) {
  const absoluteDirectory = resolve(repositoryRoot, repositoryPath);
  const sources = [];

  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const entryPath = `${repositoryPath}/${entry.name}`;

    if (entry.isDirectory()) {
      sources.push(...readRepositorySources(entryPath, extensionPattern));
    } else if (entry.isFile() && extensionPattern.test(entry.name)) {
      sources.push({
        path: entryPath,
        contents: readFileSync(resolve(repositoryRoot, entryPath), 'utf8'),
      });
    }
  }

  return sources;
}

test('should declare the lockstep JSVision dependencies when the admin shell belongs to the CLI', () => {
  const cliManifest = readRepositoryJson('packages/cli/package.json');
  const dependencyGroups = [
    cliManifest.dependencies ?? {},
    cliManifest.devDependencies ?? {},
    cliManifest.optionalDependencies ?? {},
    cliManifest.peerDependencies ?? {},
  ];
  const jsVisionDeclarations = dependencyGroups.flatMap((dependencies) =>
    Object.entries(dependencies).filter(([name]) => name.startsWith('@jsvision/')),
  );

  assert.deepEqual(
    jsVisionDeclarations.map(([name]) => name).sort(),
    ['@jsvision/core', '@jsvision/ui'],
    'the CLI must directly own exactly the JSVision core and UI packages',
  );
  assert.equal(
    cliManifest.dependencies?.['@jsvision/core'],
    cliManifest.dependencies?.['@jsvision/ui'],
    'the JSVision core and UI packages must select the same release',
  );
  assert.match(
    cliManifest.dependencies?.['@jsvision/core'] ?? '',
    /^\d+\.\d+\.\d+$/,
    'the JSVision release must be an exact stable version',
  );
  assert.equal(
    cliManifest.dependencies?.['fs-ext-extra-prebuilt'],
    '2.2.13',
    'the native credential-lock dependency must remain exactly pinned',
  );
});

test('should expose the approved admin source boundary when the shell is implemented in the CLI', () => {
  assert.equal(
    isRepositoryFile('packages/cli/src/commands/admin.ts'),
    true,
    'the CLI must provide the porta admin command module',
  );
  assert.equal(
    isRepositoryDirectory('packages/cli/src/admin'),
    true,
    'the CLI must keep admin shell implementation under src/admin/',
  );
});

test('should remove retired GUI discovery when the admin shell is loaded directly', () => {
  const cliSources = readRepositorySources('packages/cli/src', /\.ts$/);

  assert.equal(
    isRepositoryFile('packages/cli/src/commands/gui.ts'),
    false,
    'the retired gui command module must be absent',
  );

  for (const source of cliSources) {
    assert.doesNotMatch(
      source.contents,
      /@portaidentity\/admin-gui|\bguiCommand\b|commands\/gui(?:\.js)?/,
      `${source.path} must not discover or register the retired admin GUI`,
    );
  }
});

test('should avoid a separate admin workflow when the admin shell follows the existing CLI workflow', () => {
  const workflowNames = readdirSync(resolve(repositoryRoot, '.github/workflows'));

  assert.deepEqual(
    workflowNames.filter((name) => /admin|jsvision/i.test(name)),
    [],
    'admin verification must remain in the existing repository workflow',
  );
  assert.equal(
    existsSync(resolve(repositoryRoot, 'packages/admin-ui')) ||
      existsSync(resolve(repositoryRoot, 'packages/porta-admin-ui')) ||
      existsSync(resolve(repositoryRoot, 'packages/porta-admin-gui')),
    false,
    'the admin shell must not create a separate workspace package',
  );
});
