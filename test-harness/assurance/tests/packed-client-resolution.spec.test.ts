import assert from 'node:assert/strict';
import test from 'node:test';

import { createPackedClientFoundationsContract } from './packed-client-foundations-planned.js';

// Before any live operation, the SDK resolved from inside the packed CLI must have the path and
// content digest proven from the exact local SDK archive installed by the external consumer.
test('should accept the CLI SDK only when its local archive path and content digest match', async () => {
  const contract = createPackedClientFoundationsContract();
  const consumer = await contract.prepareCurrentConsumer();

  const result = await contract.verifyCliSdkResolution(consumer, 'local-archive');

  assert.equal(result.accepted, true);
  assert.equal(result.rejectionReason, undefined);
  assert.equal(result.resolvedContentSha256, result.packedContentSha256);
  assert.match(result.resolvedContentSha256, /^[a-f0-9]{64}$/);
  assert.match(result.resolvedPath, /(?:^|\/)node_modules\/@portaidentity\/sdk(?:\/|$)/);
  assert.equal(result.liveJourneyAllowed, true);
});

// Registry, workspace, source, alias, and symlink resolution are distinct invalid provenance
// classes and must block the compatibility journey before the client can contact Porta.
test('should reject every non-archive CLI SDK resolution before live journeys', async () => {
  const contract = createPackedClientFoundationsContract();
  const consumer = await contract.prepareCurrentConsumer();
  const forbiddenSources = ['registry', 'workspace', 'source', 'alias', 'symlink'] as const;

  for (const source of forbiddenSources) {
    const result = await contract.verifyCliSdkResolution(consumer, source);

    assert.equal(result.accepted, false, source);
    assert.equal(result.rejectionReason, source, source);
    assert.equal(result.liveJourneyAllowed, false, source);
  }
});
