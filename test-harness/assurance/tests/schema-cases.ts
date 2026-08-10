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

  test('accepts schema-complete foundation results and manifests with immutable provenance', () => {
    const result = {
      id: 'foundation-validation',
      command: 'yarn assurance:validate',
      status: 'passed',
      startedAt: '2026-08-10T09:59:00.000Z',
      completedAt: '2026-08-10T10:00:00.000Z',
      buildIdentity: 'commit:0123456789abcdef',
      fixtureIdentity: 'not-applicable:definition-validation',
      redactedLog: 'validated assurance foundation definitions',
      metrics: {
        requirementCount: 79,
        caseCount: 97,
        taskCount: 92,
        claimCount: 79,
        redSignatureCount: 1,
        commandContractVersion: 1,
      },
    };
    const manifest = {
      runId: '00000000-0000-4000-8000-000000000001',
      status: 'passed',
      command: 'yarn assurance:validate',
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      buildIdentity: result.buildIdentity,
      treeIdentity: 'tree:fedcba9876543210',
      fixtureIdentity: result.fixtureIdentity,
      executionArtifact: { kind: 'source-tree', digest: 'sha256:0123456789abcdef' },
      dependencyLockDigest: 'sha256:0123456789abcdef',
      assuranceToolDigest: 'sha256:fedcba9876543210',
      definitionDigests: {
        traceability: 'sha256:0123456789abcdef',
        redSignatures: 'sha256:0123456789abcdef',
        testInventory: 'sha256:0123456789abcdef',
      },
      toolVersions: { node: 'v22.0.0', commandContract: 1 },
      results: [{ command: result.command, status: result.status }],
      killedFaultIds: [],
      artifacts: ['validation/result.json'],
      accessPolicy: 'restricted synthetic evidence',
      retentionPolicy: 'disposable',
    };

    assert.deepEqual(schema.foundationValidationResultSchema.parse(result), result);
    assert.deepEqual(schema.foundationManifestSchema.parse(manifest), manifest);
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
