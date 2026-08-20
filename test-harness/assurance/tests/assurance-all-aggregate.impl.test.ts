import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  aggregateChildRegistry,
  aggregateKnownIncompleteCollectors,
  aggregateRegistryDigest,
  runAssuranceAggregate,
  validateAggregateEvidence,
  type AggregateRunnerDependencies,
} from '../aggregate/index.js';
import type { AssuranceAllInvocationRegistration } from './assurance-all-aggregate-contract.js';
import { assuranceAllAggregateEvidenceFixture } from './assurance-all-aggregate-requirements.js';
import type { ManagedChildOutcome } from '../scripts/managed-child.js';

const fixedProvenance = Object.freeze({
  commitIdentity: `commit:${'a'.repeat(40)}`,
  treeIdentity: `tree:${'b'.repeat(40)}`,
  assuranceToolDigest: `sha256:${'c'.repeat(64)}`,
});

/** Creates one clean managed-child observation with optional bounded output. */
function outcome(code = 0, stdout = ''): ManagedChildOutcome {
  return {
    code,
    signal: null,
    forwardedSignal: null,
    timedOut: false,
    setupFailed: false,
    cleanupFailed: false,
    stdout,
    stderr: '',
    outputTruncated: false,
  };
}

/** Creates deterministic injected dependencies and records exact invocation order. */
function dependencies(
  calls: AssuranceAllInvocationRegistration[],
  terminalAt?: string,
  terminalCode = 70,
): AggregateRunnerDependencies {
  return {
    inspectProvenance: () => fixedProvenance,
    execute(invocation) {
      calls.push(invocation);
      if (invocation.id === terminalAt) return Promise.resolve(outcome(terminalCode));
      if (invocation.command === 'assurance:validate') {
        return Promise.resolve(
          outcome(0, 'ASSURANCE_RUN_ID=11111111-1111-4111-8111-111111111111\n'),
        );
      }
      if (invocation.id === 'coverage-security-production-security') {
        return Promise.resolve(
          outcome(
            0,
            'ASSURANCE_COVERAGE_CAPTURE=test-harness/.assurance-results/33333333-3333-4333-8333-333333333333/coverage/security/production-security/capture-manifest.json\n',
          ),
        );
      }
      return Promise.resolve(outcome());
    },
  };
}

/** Writes one complete operational observer-gap artifact beneath the owned result root. */
function writeKnownIncompleteArtifact(
  root: string,
  unobservedStateObservations: readonly string[] = [
    'configured-public-origin-unchanged',
    'cookie-policy-unchanged',
    'rate-limit-key-uses-direct-peer-not-spoofed-value',
  ],
): string {
  const runId = '22222222-2222-4222-8222-222222222222';
  const relativePath = `test-harness/.assurance-results/${runId}/production-exposure/operational/observation.json`;
  const path = join(root, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  const forwardingCaseIds = [
    'st53-untrusted-forwarded-host',
    'st53-untrusted-forwarded-proto',
    'st53-untrusted-forwarded-client-ip',
  ];
  const productCaseIds = [
    'st56-operational-database-error-exposure',
    'st56-operational-cache-error-exposure',
    'st56-operational-mail-error-exposure',
  ];
  const common = {
    expectedStatus: 200,
    observedStatus: 200,
    expectedBodyContract: 'generic-public-response',
    observedBodyContract: 'generic-public-response',
    failedControlObservations: [],
    failedHeaderContracts: [],
    failedStateObservations: [],
    observedProhibitedEffects: [],
    recoveryPassed: true,
    recoveryMode: 'none',
  } as const;
  writeFileSync(
    path,
    `${JSON.stringify({
      version: 1,
      runId,
      profile: 'operational',
      sourceCommit: fixedProvenance.commitIdentity,
      sourceTree: fixedProvenance.treeIdentity,
      assuranceToolDigest: fixedProvenance.assuranceToolDigest,
      fixtureDigest: `sha256:${'d'.repeat(64)}`,
      correlatedLogCredit: false,
      correlatedLogGap: 'correlated-security-decision-event-unavailable',
      cases: [
        ...forwardingCaseIds.map((caseId) => ({
          ...common,
          caseId,
          outcome: 'incomplete',
          unobservedStateObservations,
          unobservedProhibitedEffects: ['rate-limit-budget-split-by-spoofed-ip'],
        })),
        ...productCaseIds.map((caseId) => ({
          ...common,
          caseId,
          outcome: 'product-failure',
          unobservedStateObservations: [],
          unobservedProhibitedEffects: [],
        })),
      ],
    })}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
  return relativePath;
}

/** Creates an executor whose only incomplete result is the registered forwarding observer gap. */
function knownIncompleteDependencies(
  root: string,
  calls: AssuranceAllInvocationRegistration[],
  unobservedStateObservations?: readonly string[],
): AggregateRunnerDependencies {
  return {
    inspectProvenance: () => fixedProvenance,
    execute(invocation) {
      calls.push(invocation);
      if (invocation.command === 'assurance:validate') {
        return Promise.resolve(
          outcome(0, 'ASSURANCE_RUN_ID=11111111-1111-4111-8111-111111111111\n'),
        );
      }
      if (invocation.id === 'coverage-security-production-security') {
        return Promise.resolve(
          outcome(
            0,
            'ASSURANCE_COVERAGE_CAPTURE=test-harness/.assurance-results/33333333-3333-4333-8333-333333333333/coverage/security/production-security/capture-manifest.json\n',
          ),
        );
      }
      if (invocation.id === 'harness-security-operational') {
        const artifact = writeKnownIncompleteArtifact(root, unobservedStateObservations);
        return Promise.resolve(
          outcome(
            40,
            `ASSURANCE_PRODUCTION_EXPOSURE_RESULT: passed=0 productFailures=3 incomplete=3 executionFailures=0 artifact=${artifact}\n`,
          ),
        );
      }
      return Promise.resolve(outcome());
    },
  };
}

test('keeps the executable registry independent and identical to the immutable contract', () => {
  assert.deepEqual(
    aggregateChildRegistry.flatMap((child) => child.invocations.map((entry) => entry.id)),
    [
      'validate-registered-surface',
      'internal-deduplicated-suite',
      'harness-spa-operational',
      'harness-bff-operational',
      'harness-protocol-operational',
      'harness-security-operational',
      'harness-compatibility-operational',
      'harness-security-production-security',
      'coverage-protocol-operational',
      'coverage-security-production-security',
      'fault-full-catalog',
      'compat-tenant-admin',
      'compat-protocol',
      'compat-p1-admin',
      'compat-compatibility',
      'report-aggregate-run',
    ],
  );
  assert.deepEqual(
    aggregateKnownIncompleteCollectors.map((entry) => [
      entry.invocationId,
      entry.profile,
      entry.gapId,
      Object.keys(entry.incompleteCases),
    ]),
    [
      [
        'harness-security-operational',
        'operational',
        'forwarding-context-observer-incomplete',
        [
          'st53-untrusted-forwarded-host',
          'st53-untrusted-forwarded-proto',
          'st53-untrusted-forwarded-client-ip',
        ],
      ],
      [
        'harness-security-production-security',
        'production-security',
        'forwarding-context-observer-incomplete',
        [
          'st53-untrusted-forwarded-host',
          'st53-untrusted-forwarded-proto',
          'st53-untrusted-forwarded-client-ip',
        ],
      ],
    ],
  );
  assert.match(aggregateRegistryDigest(), /^sha256:[a-f0-9]{64}$/);
});

test('rejects nested unknown fields and summaries that contradict invocation facts', () => {
  const nestedUnknown = structuredClone(assuranceAllAggregateEvidenceFixture);
  Object.assign(nestedUnknown.children[0]!.invocations[0]!, { password: 'forbidden' });
  assert.throws(() => validateAggregateEvidence(nestedUnknown), /ASSURANCE_ALL_SCHEMA_INVALID/);

  const contradicted = structuredClone(assuranceAllAggregateEvidenceFixture);
  Object.assign(contradicted.children[5]!.invocations[0]!, { cleanupComplete: false });
  assert.throws(
    () => validateAggregateEvidence(contradicted),
    /ASSURANCE_ALL_CHILD_OUTCOME_INVALID/,
  );
});

test('executes every child sequentially and publishes a truthful owner-only roll-up', async () => {
  const root = mkdtempSync(join(tmpdir(), 'porta-assurance-all-'));
  const calls: AssuranceAllInvocationRegistration[] = [];
  try {
    const result = await runAssuranceAggregate(root, dependencies(calls));
    assert.equal(calls.length, 16);
    assert.deepEqual(calls.at(-1)?.arguments, [
      '--run',
      '11111111-1111-4111-8111-111111111111',
      '--coverage-run',
      '33333333-3333-4333-8333-333333333333',
    ]);
    assert.equal(result.exitCode, 50);
    assert.ok(result.counts.assured > 0);
    assert.ok(result.counts.blocked > 0);
    assert.ok(result.counts.unqualified > 0);
    const artifact = join(root, result.artifactPath);
    assert.equal(statSync(artifact).mode & 0o077, 0);
    const parsed: unknown = JSON.parse(readFileSync(artifact, 'utf8'));
    assert.equal(validateAggregateEvidence(parsed).exitCode, 50);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('stops after a terminal child and accounts for every remaining invocation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'porta-assurance-all-stop-'));
  const calls: AssuranceAllInvocationRegistration[] = [];
  try {
    const result = await runAssuranceAggregate(
      root,
      dependencies(calls, 'harness-protocol-operational'),
    );
    assert.equal(result.exitCode, 70);
    assert.equal(calls.at(-1)?.id, 'harness-protocol-operational');
    const parsed: unknown = JSON.parse(readFileSync(join(root, result.artifactPath), 'utf8'));
    const evidence = validateAggregateEvidence(parsed);
    assert.ok(
      evidence.children
        .flatMap((child) => child.invocations)
        .some((invocation) => invocation.executionStatus === 'not-run'),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('continues only after an exact registered incomplete observer artifact', async () => {
  const root = mkdtempSync(join(tmpdir(), 'porta-assurance-all-known-incomplete-'));
  const calls: AssuranceAllInvocationRegistration[] = [];
  try {
    const result = await runAssuranceAggregate(root, knownIncompleteDependencies(root, calls));
    assert.equal(calls.length, 16);
    assert.equal(result.exitCode, 50);
    const parsed: unknown = JSON.parse(readFileSync(join(root, result.artifactPath), 'utf8'));
    const evidence = validateAggregateEvidence(parsed);
    const invocation = evidence.items.find(
      (item) => item.id === 'invocation:harness-security-operational',
    );
    assert.equal(invocation?.observation, 'evidence-incomplete');
    assert.equal(invocation?.conclusion, 'incomplete');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('stops on an unregistered incomplete observation or another incomplete child', async () => {
  const tamperedRoot = mkdtempSync(join(tmpdir(), 'porta-assurance-all-tampered-incomplete-'));
  const otherRoot = mkdtempSync(join(tmpdir(), 'porta-assurance-all-other-incomplete-'));
  try {
    const tamperedCalls: AssuranceAllInvocationRegistration[] = [];
    const tampered = await runAssuranceAggregate(
      tamperedRoot,
      knownIncompleteDependencies(tamperedRoot, tamperedCalls, ['unexpected-observation']),
    );
    assert.equal(tamperedCalls.at(-1)?.id, 'harness-security-operational');
    assert.equal(tampered.exitCode, 50);

    const otherCalls: AssuranceAllInvocationRegistration[] = [];
    const other = await runAssuranceAggregate(
      otherRoot,
      dependencies(otherCalls, 'harness-protocol-operational', 40),
    );
    assert.equal(otherCalls.at(-1)?.id, 'harness-protocol-operational');
    assert.equal(other.exitCode, 50);
  } finally {
    rmSync(tamperedRoot, { recursive: true, force: true });
    rmSync(otherRoot, { recursive: true, force: true });
  }
});
