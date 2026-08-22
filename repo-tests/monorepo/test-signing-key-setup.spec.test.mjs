import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const uiSetupPath = 'packages/server/tests/ui/setup/global-setup.ts';

/**
 * Reads a UTF-8 source file from the repository without executing test setup code.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {string} Exact source text stored in the repository.
 */
function readRepositorySource(repositoryPath) {
  return readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8');
}

// Every suite sharing the test database must use one encryption key for persisted signing keys.
test('should use the shared signing-key encryption constant in UI setup', () => {
  const uiSetup = readRepositorySource(uiSetupPath);

  assert.match(
    uiSetup,
    /TEST_SIGNING_KEY_ENCRYPTION_KEY[\s\S]*from '\.\.\/\.\.\/helpers\/constants\.js';/,
    `${uiSetupPath} must import the shared signing-key encryption constant`,
  );
  assert.match(
    uiSetup,
    /process\.env\.SIGNING_KEY_ENCRYPTION_KEY\s*=\s*TEST_SIGNING_KEY_ENCRYPTION_KEY;/,
    `${uiSetupPath} must assign the shared signing-key encryption constant`,
  );
  assert.doesNotMatch(
    uiSetup,
    /SIGNING_KEY_ENCRYPTION_KEY\s*=\s*['"][a-f\d]{64}['"]/i,
    `${uiSetupPath} must not define a suite-specific signing-key encryption value`,
  );
});

// UI setup owns a clean database and must discard old encrypted rows before reading signing keys.
test('should truncate UI test state before generating signing keys', () => {
  const uiSetup = readRepositorySource(uiSetupPath);
  const truncateIndex = uiSetup.indexOf('await truncateAllTables();');
  const signingKeyIndex = uiSetup.indexOf('await ensureSigningKeys();');

  assert.notEqual(truncateIndex, -1, `${uiSetupPath} must truncate the shared test database`);
  assert.notEqual(signingKeyIndex, -1, `${uiSetupPath} must generate signing keys`);
  assert.ok(
    truncateIndex < signingKeyIndex,
    `${uiSetupPath} must truncate persisted state before generating signing keys`,
  );
});
