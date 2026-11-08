/** Implementation diagnostics for secret exclusions and output path validation. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceSelectors } from '../../scripts/security-scan/snapshot.js';
import { stateDirectory } from '../../scripts/security-scan/storage.js';

test('should exclude known secret stores before asking Git for file names or contents', () => {
  for (const selectors of sourceSelectors()) {
    for (const pattern of [
      '**/.env*',
      '**/.npmrc',
      '**/*.pem',
      '**/*.key',
      '**/credentials.json',
      'scripts/pending-invitations.sql',
    ]) {
      // The credentials wildcard intentionally covers both prefixed and plain store names.
      assert.ok(
        selectors.includes(`:(exclude,glob)${pattern}`) ||
          (pattern === '**/credentials.json' &&
            selectors.includes(':(exclude,glob)**/*credentials.json')),
      );
    }
  }
});

test('should reject state paths inside the source tree including dot-prefixed child names', () => {
  for (const path of ['/source', '/source/state', '/source/..state']) {
    assert.throws(() => stateDirectory('/source', path), /outside/);
  }
  assert.throws(() => stateDirectory('/source', '/tmp/../state'), /segments/);
  assert.equal(stateDirectory('/source', '/private/state'), '/private/state');
});

test('should reject output paths inside credential stores before inspecting the filesystem', () => {
  for (const name of ['.ssh', '.aws', '.codex', '.porta', '.git', '.docker', '.kube', '.gnupg']) {
    assert.throws(() => stateDirectory('/source', `/home/operator/${name}/scan`), /store/);
  }
});
