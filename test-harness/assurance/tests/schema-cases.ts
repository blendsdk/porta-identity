import assert from 'node:assert/strict';
import test from 'node:test';

import { completeClaim, completeSliceProfile } from './assurance-fixtures.js';

type SchemaModule = typeof import('../schema.js');

/** Registers field-preservation and completeness specifications for assurance schemas. */
export function registerSchemaCases(schema: SchemaModule): void {
  test('accepts a complete claim and preserves every required field', () => {
    assert.deepEqual(schema.claimSchema.parse(completeClaim), completeClaim);
  });

  test('accepts complete result, gap, and fault records without discarding provenance', () => {
    const result = {
      id: 'protocol-verification',
      command: 'yarn verify',
      status: 'passed',
      startedAt: '2026-08-10T09:59:00.000Z',
      completedAt: '2026-08-10T10:00:00.000Z',
      buildIdentity: 'commit:0123456789abcdef',
      fixtureIdentity: 'fixture:alpha-v1',
      redactedLog: 'verification passed',
    };
    const gap = {
      id: 'protocol-retry-behavior',
      name: 'unverified retry behavior',
      reason: 'No exact public-boundary case exists.',
      owner: 'identity-security',
      blocksClaims: ['CLAIM-R1-01'],
    };
    const fault = {
      id: 'protocol-client-binding',
      claimId: 'CLAIM-R1-01',
      sentinelId: 'ST-01',
      expectedSignature: 'cross-client-redemption-accepted',
      targetRevision: '0123456789abcdef',
      patch: 'test-harness/assurance/faults/protocol-client-binding.patch',
      buildCommand: 'yarn build',
      executionCommand: 'yarn assurance:test --select ST-01',
      cleanupVerification: 'primary-worktree-clean',
    };

    assert.deepEqual(schema.resultSchema.parse(result), result);
    assert.deepEqual(schema.gapSchema.parse(gap), gap);
    assert.deepEqual(schema.faultSchema.parse(fault), fault);
  });

  test('requires complete typed slice actors, actions, resources, results, and boundaries', () => {
    assert.deepEqual(schema.sliceProfileSchema.parse(completeSliceProfile), completeSliceProfile);

    for (const field of [
      'actors',
      'actions',
      'resources',
      'results',
      'entryPoints',
      'trustBoundaries',
      'rejectionClasses',
      'abuseClasses',
      'prohibitedSideEffects',
      'privacySafeLogs',
      'recoveryExpectations',
    ]) {
      const incomplete = structuredClone(completeSliceProfile) as Record<string, unknown>;
      delete incomplete[field];
      assert.throws(
        () => schema.sliceProfileSchema.parse(incomplete),
        new RegExp(field, 'i'),
        `missing ${field} must reject the slice profile`,
      );
    }
  });
}
