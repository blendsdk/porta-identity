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
  assert.match(workflow, /github\.sha/);
  assert.match(workflow, /github\.event\.workflow_run\.head_sha/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /dist\.integrity/);
  assert.match(workflow, /dist\.attestations\.provenance\.predicateType/);
  assert.match(workflow, /automatic bootstrap stops; use exact-SHA recovery/);
  for (const packageName of ['server', 'sdk', 'cli']) {
    assert.ok(
      workflow.includes(
        `publish_if_absent '@portaidentity/${packageName}' './release-artifacts/portaidentity-${packageName}-1.7.0.tgz'`,
      ),
    );
  }
  assert.doesNotMatch(workflow, /git push origin/);
});

// Trusted Publisher setup must use the pinned npm CLI and a real ownership check.
test('should document pinned Trusted Publisher and npm ownership commands', () => {
  const guide = readRepositoryFile('techdocs/guides/releasing.md');

  assert.match(guide, /node_modules\/\.bin\/npm trust github @portaidentity\/server/);
  assert.match(guide, /node_modules\/\.bin\/npm owner ls @portaidentity\/sdk/);
  assert.doesNotMatch(guide, /npm view @portaidentity\/(?:sdk|cli) access/);
});
