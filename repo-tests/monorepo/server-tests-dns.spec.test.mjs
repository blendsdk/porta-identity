import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const serverTestsDirectory = 'packages/server/tests';
const reservedHost = 'porta-harness.ci.portaidentity.com';

/**
 * Reads a repository file as UTF-8 text.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {string} File contents.
 */
function readRepositoryFile(repositoryPath) {
  return readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8');
}

/**
 * Recursively finds physical files whose names match a pattern.
 * Symbolic links are not followed, so a test is counted only through its real path.
 *
 * @param {string} repositoryPath Directory relative to the repository root.
 * @param {RegExp} filePattern Pattern matched against each file name.
 * @returns {string[]} Repository-relative file paths.
 */
function findPhysicalFiles(repositoryPath, filePattern) {
  const files = [];

  for (const entry of readdirSync(resolve(repositoryRoot, repositoryPath), {
    withFileTypes: true,
  })) {
    const entryPath = `${repositoryPath}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...findPhysicalFiles(entryPath, filePattern));
    } else if (entry.isFile() && filePattern.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

/** Every TypeScript source file under the server test tree. */
const serverTestFiles = findPhysicalFiles(serverTestsDirectory, /\.ts$/);

// A machine-local host cannot resolve on CI or a fresh checkout, so server tests must not use it.
// Email domains such as `test@porta.local` are allowed because they are addresses, not hosts.
test('should not reference a machine-local host in server tests', () => {
  const offenders = serverTestFiles.filter((filePath) => /(?<!@)porta\.local/.test(readRepositoryFile(filePath)));

  assert.deepEqual(
    offenders,
    [],
    'server tests must not reference the machine-local host porta.local; use the reserved CI loopback host instead',
  );
});

// Live-server suites need a default address that resolves on any machine.
test('should use the reserved CI loopback host in server tests', () => {
  const combinedContents = serverTestFiles.map(readRepositoryFile).join('\n');

  assert.match(
    combinedContents,
    new RegExp(reservedHost.replaceAll('.', '\\.')),
    'server tests must target the reserved CI loopback host without a machine-local default',
  );
});

// DNS drift must fail before an end-to-end or penetration suite starts a server.
test('should preflight the reserved CI loopback host before live-server suites', () => {
  const setupSource = readRepositoryFile('packages/server/tests/helpers/server-setup.ts');

  assert.match(setupSource, /resolve4/, 'live-server setup must resolve the reserved host');
  assert.match(
    setupSource,
    new RegExp(reservedHost.replaceAll('.', '\\.')),
    'live-server setup must preflight the reserved CI loopback host',
  );
  assert.match(
    setupSource,
    /address !== '127\.0\.0\.1'/,
    'live-server setup must reject any address other than IPv4 loopback',
  );
});
