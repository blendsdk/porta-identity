import assert from 'node:assert/strict';
import test from 'node:test';

import { loadFaultCatalog, resolveFaultFile, selectFault } from '../fault/catalog.js';

test('loads only the versioned foundation fault with two independent tuples', () => {
  const catalog = loadFaultCatalog(process.cwd());
  const fault = selectFault(catalog, 'foundation-smoke');

  assert.equal(catalog.version, 1);
  assert.equal(fault.tuples.length, 2);
  assert.equal(
    new Set(fault.tuples.map(({ claimId, sentinelId }) => `${claimId}/${sentinelId}`)).size,
    2,
  );
  assert.equal(fault.cleanupVerification, 'primary-tree-unchanged-and-no-owned-residue');
});

test('rejects traversal, absolute paths, and non-file fault targets', () => {
  for (const repositoryPath of ['../package.json', '/etc/passwd', 'test-harness/assurance/fault']) {
    assert.throws(() =>
      resolveFaultFile(process.cwd(), repositoryPath, 'test-harness/assurance/fault'),
    );
  }
});
