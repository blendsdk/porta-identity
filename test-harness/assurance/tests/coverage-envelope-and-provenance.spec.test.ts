import assert from 'node:assert/strict';
import test from 'node:test';

import { createCoverageAttributionContract } from './coverage-attribution-planned.js';
import {
  coverageSeed,
  expectedCoverageProvenance,
  trustedRawEnvelope,
} from './coverage-spec-fixtures.js';

// Raw V8 coverage is enabled and mounted only for the Dockerized Porta Node process. Other harness
// services never receive NODE_V8_COVERAGE, and the raw directory is repository-ignored.
test('should scope the fixed-seed raw capture envelope to the Porta container', async () => {
  const contract = createCoverageAttributionContract();

  const plan = await contract.prepareCapture(coverageSeed);

  assert.equal(plan.seed, coverageSeed);
  assert.equal(plan.rawMount.container, 'porta');
  assert.equal(plan.rawMount.repositoryIgnored, true);
  assert.ok(plan.rawMount.containerPath.length > 0);
  assert.equal(plan.containerEnvironments.porta?.NODE_V8_COVERAGE, plan.rawMount.containerPath);
  for (const [container, environment] of Object.entries(plan.containerEnvironments)) {
    if (container !== 'porta') assert.equal(environment.NODE_V8_COVERAGE, undefined, container);
  }
});

// Every raw script is provenance-bound and classified before conversion, and at least one eligible
// first-party script beneath `/app/dist` proves that the Porta server process was observed.
test('should provenance-bind and exhaustively classify every raw script', async () => {
  const contract = createCoverageAttributionContract();
  const envelope = await contract.captureKnownRun('graceful');

  const result = await contract.classify(envelope);

  assert.equal(envelope.seed, coverageSeed);
  assert.equal(envelope.flushStatus, 'complete');
  assert.equal(result.rejected, false);
  assert.equal(result.scripts.length, envelope.scripts.length);
  assert.ok(result.scripts.every((script) => script.provenance !== undefined));
  assert.deepEqual(
    result.scripts.map((script) => script.classification),
    ['first-party', 'node-internal', 'dependency'],
  );
  assert.ok(
    result.scripts.some(
      (script) =>
        script.classification === 'first-party' &&
        script.eligible &&
        script.url.startsWith('/app/dist/'),
    ),
  );
  assert.ok(result.scripts.every((script) => script.classification !== 'unexpected-local'));
});

// Graceful Node termination is the only complete flush eligible for evidence. Forced termination
// is invalid or incomplete and can never become a baseline.
test('should reject forced termination while accepting a complete graceful flush', async () => {
  const contract = createCoverageAttributionContract();

  const graceful = await contract.captureKnownRun('graceful');
  const forced = await contract.captureKnownRun('forced');
  const gracefulClassification = await contract.classify(graceful);
  const forcedClassification = await contract.classify(forced);

  assert.equal(graceful.flushStatus, 'complete');
  assert.equal(gracefulClassification.rejected, false);
  assert.ok(forced.flushStatus === 'incomplete' || forced.flushStatus === 'invalid');
  assert.equal(forcedClassification.rejected, true);
  assert.equal(forcedClassification.rejectionReason, 'incomplete-flush');
});

// Declared Node internals and dependencies are excluded explicitly; an unexpected local path is
// neither silently excluded nor treated as first-party and rejects the complete envelope.
test('should reject unexpected local scripts after exhaustive stable classification', async () => {
  const contract = createCoverageAttributionContract();
  const trusted = trustedRawEnvelope();
  const envelope = {
    ...trusted,
    scripts: [
      ...trusted.scripts,
      {
        url: '/tmp/unexpected-injected.js',
        provenance: expectedCoverageProvenance,
        ranges: [{ startOffset: 0, endOffset: 10, count: 1 }],
      },
    ],
  };

  const result = await contract.classify(envelope);

  assert.equal(result.scripts.length, envelope.scripts.length);
  assert.equal(result.scripts.at(-1)?.classification, 'unexpected-local');
  assert.equal(result.rejected, true);
  assert.equal(result.rejectionReason, 'unexpected-local-script');
});

// An otherwise eligible local script without exact process/build provenance is rejected rather
// than attributed to whichever container happened to write the raw directory.
test('should reject an eligible script whose provenance is missing', async () => {
  const contract = createCoverageAttributionContract();
  const envelope = trustedRawEnvelope();
  const unprovenanced = {
    ...envelope,
    scripts: envelope.scripts.map((script, index) =>
      index === 0 ? { url: script.url, ranges: script.ranges } : script,
    ),
  };

  const result = await contract.classify(unprovenanced);

  assert.equal(result.rejected, true);
  assert.equal(result.rejectionReason, 'missing-provenance');
});
