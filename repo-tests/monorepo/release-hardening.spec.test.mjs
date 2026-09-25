import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');

/**
 * Reads a UTF-8 repository file by its root-relative path.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {string} File contents.
 */
function readRepositoryFile(repositoryPath) {
  return readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8');
}

// Release preparation must choose the bump from conventional commits instead of forcing every release to be minor.
test('should let Lockstep select the normal release bump from conventional commits', () => {
  const manifest = JSON.parse(readRepositoryFile('package.json'));

  assert.match(manifest.scripts?.['release:prepare'] ?? '', /lockstep version --type auto/);
});

// Publication must bind tested source, package bytes, and provenance without exposing write credentials to builds.
test('should fail closed when source identity or published package integrity differs', () => {
  const workflow = readRepositoryFile('.github/workflows/release.yml');

  assert.match(workflow, /persist-credentials:\s*false/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /dist\.integrity/);
  assert.match(workflow, /dist\.attestations\.provenance\.predicateType/);
  assert.doesNotMatch(workflow, /bootstrap|publish_if_absent|NPM_TOKEN|NODE_AUTH_TOKEN/);
});

// A release must only run for a revision that already passed the main CI gate.
test('should require a successful Build and Test for the released revision', () => {
  const workflow = readRepositoryFile('.github/workflows/release.yml');

  assert.match(workflow, /Build and Test/);
  assert.match(workflow, /conclusion/);
});

// The bump lands on main; develop must receive it without any history rewrite.
test('should sync develop without force-pushing or rewriting history', () => {
  const workflow = readRepositoryFile('.github/workflows/release.yml');

  assert.match(workflow, /merge-base --is-ancestor/);
  assert.match(workflow, /cherry-pick/);
  assert.match(workflow, /gh issue create/);
  assert.doesNotMatch(workflow, /--force\b|force-with-lease|--rebase/);
});

// Trusted Publisher setup must use the pinned npm CLI and a real ownership check.
test('should document pinned Trusted Publisher and npm ownership commands', () => {
  const guide = readRepositoryFile('techdocs/guides/releasing.md');

  assert.match(guide, /node_modules\/\.bin\/npm trust github @portaidentity\/server/);
  assert.match(guide, /node_modules\/\.bin\/npm owner ls @portaidentity\/sdk/);
  assert.doesNotMatch(guide, /npm view @portaidentity\/(?:sdk|cli) access/);
});
