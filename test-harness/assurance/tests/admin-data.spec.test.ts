import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adminDataActors,
  adminDataCaseRequirements as adminDataMutationCaseRequirements,
  adminDataCatalogVersion,
  adminDataReferences,
  adminDataRequirementVersion,
  type AdminDataSentinelId,
  type AdminDataSurface,
} from './admin-data-case-requirements.js';
import { adminDataReadControlRequirements } from './admin-data-read-control-requirements.js';

const adminDataCaseRequirements = [
  ...adminDataMutationCaseRequirements,
  ...adminDataReadControlRequirements,
];

const exactSentinels: readonly AdminDataSentinelId[] = [
  'ST-57',
  'ST-58',
  'ST-59',
  'ST-60',
  'ST-61',
];
const exactSurfaces: readonly AdminDataSurface[] = [
  'pagination',
  'audit',
  'signing-key',
  'session-administration',
  'configuration',
];

test('freezes the exact administrative actor and surface catalog', () => {
  assert.equal(adminDataCatalogVersion, 1);
  assert.equal(adminDataRequirementVersion, '2026-08-20');
  assert.deepEqual(adminDataActors, [
    { id: 'admin-full', organization: 'super-admin', role: 'porta-super-admin' },
    { id: 'admin-limited', organization: 'super-admin', role: 'porta-auditor' },
    {
      id: 'admin-unprivileged',
      organization: 'super-admin',
      role: 'porta-assurance-unprivileged',
    },
  ]);
  assert.deepEqual(
    [...new Set(adminDataCaseRequirements.map((entry) => entry.sentinelId))],
    exactSentinels,
  );
  assert.deepEqual(
    [...new Set(adminDataCaseRequirements.map((entry) => entry.surface))],
    exactSurfaces,
  );
});

test('pairs every negative with an authenticated same-action and same-target control', () => {
  const negative = adminDataCaseRequirements.filter((entry) => entry.expectedResult !== 'allowed');
  assert.ok(negative.length > 0);
  for (const entry of negative) {
    assert.equal(entry.control.request.actor, 'admin-full', entry.id);
    assert.equal(entry.control.expectedResult, 'allowed', entry.id);
    assert.equal(entry.control.request.method, entry.probe.method, `${entry.id}: action`);
    assert.equal(
      entry.control.request.requiredPermission,
      entry.probe.requiredPermission,
      `${entry.id}: permission`,
    );
    assert.ok(entry.target.length > 0, `${entry.id}: semantic target`);
    assert.deepEqual(entry.control.reachabilityObservations.slice(0, 2), [
      'admin-authentication-succeeded',
      'intended-handler-reached',
    ]);
    assert.notEqual(entry.expectedResult, 'unexpected-success', entry.id);
    assert.ok([400, 403, 404].includes(entry.expectedStatus), entry.id);
  }
});

test('requires exact independent non-effects, privacy-safe logs, and recovery', () => {
  const exactLogFields = [
    'synthetic-correlation-id',
    'actor-id',
    'action',
    'target-id-digest',
    'result',
  ];
  const exactForbiddenFields = [
    'opaque-token',
    'session-cookie',
    'private-signing-key',
    'configuration-secret-value',
    'audit-sensitive-payload',
    'personal-data',
    'stack-trace',
  ];
  for (const entry of adminDataCaseRequirements) {
    assert.equal(entry.schemaVersion, 1, entry.id);
    assert.equal(entry.requirementVersion, adminDataRequirementVersion, entry.id);
    assert.equal(entry.evidenceStatus, 'specification-only', entry.id);
    assert.equal(entry.probe.transport, 'raw-http', entry.id);
    assert.ok(entry.exactPublicOutcome.length > 0, `${entry.id}: public outcome`);
    assert.ok(entry.independentObservations.length > 0, `${entry.id}: independent observations`);
    assert.ok(entry.prohibitedSideEffects.length > 0, `${entry.id}: prohibited effects`);
    assert.deepEqual(entry.requiredLogFields, exactLogFields, entry.id);
    assert.deepEqual(entry.forbiddenLogFields, exactForbiddenFields, entry.id);
    assert.ok(entry.recoveryExpectations.length > 0, `${entry.id}: recovery`);
  }
});

test('freezes pagination membership, ordering, and cardinality isolation', () => {
  const pagination = adminDataCaseRequirements.filter((entry) => entry.sentinelId === 'ST-57');
  assert.equal(pagination.length, 2);
  assert.ok(
    pagination.every((entry) =>
      entry.independentObservations.some((observation) => /count|cardinality/.test(observation)),
    ),
  );
  assert.ok(
    pagination.every((entry) =>
      entry.prohibitedSideEffects.some((effect) => /bravo|cross-tenant|global-count/.test(effect)),
    ),
  );
});

test('freezes audit authorization, cleanup integrity, and redaction', () => {
  const audit = adminDataCaseRequirements.filter((entry) => entry.sentinelId === 'ST-58');
  assert.equal(audit.length, 4);
  const cleanup = audit.find((entry) => entry.id === 'audit-cleanup-without-permission');
  assert.ok(
    cleanup?.control.reachabilityObservations.includes(
      'only-events-older-than-approved-retention-removed',
    ),
  );
  assert.ok(
    cleanup?.control.reachabilityObservations.includes(
      'all-protected-recent-event-digests-unchanged',
    ),
  );
  const redaction = audit.find((entry) => entry.id === 'audit-read-redaction-integrity');
  assert.equal(redaction?.expectedResult, 'allowed');
  assert.ok(redaction?.prohibitedSideEffects.includes('secret-or-token-disclosed'));
  assert.ok(redaction?.independentObservations.includes('stored-audit-digests-unchanged'));
});

test('freezes signing-key authorization and lifecycle effects without private material', () => {
  const keys = adminDataCaseRequirements.filter((entry) => entry.sentinelId === 'ST-59');
  assert.equal(keys.length, 4);
  const generate = keys.find((entry) => entry.id === 'key-generate-without-permission');
  const rotate = keys.find((entry) => entry.id === 'key-rotate-without-permission');
  assert.ok(generate?.control.reachabilityObservations.includes('one-new-key-added'));
  assert.ok(generate?.control.reachabilityObservations.includes('private-key-material-absent'));
  assert.ok(rotate?.control.reachabilityObservations.includes('new-active-key-is-distinct'));
  assert.ok(
    rotate?.control.reachabilityObservations.includes(
      'predecessor-retains-declared-verification-lifecycle',
    ),
  );
  assert.ok(rotate?.prohibitedSideEffects.includes('existing-signature-invalidated'));
});

test('freezes session tenant scope and the declared revoke cascade', () => {
  const sessions = adminDataCaseRequirements.filter((entry) => entry.sentinelId === 'ST-60');
  assert.equal(sessions.length, 5);
  const filtered = sessions.find((entry) => entry.id === 'session-list-alpha-filter-isolation');
  assert.equal(filtered?.expectedResult, 'allowed');
  assert.ok(filtered?.independentObservations.includes('alpha-total-count-excludes-bravo'));
  const detail = sessions.find((entry) => entry.id === 'session-detail-without-permission');
  assert.equal(detail?.expectedResult, 'forbidden');
  assert.equal(detail?.expectedStatus, 403);
  assert.match(detail?.control.request.path ?? '', /bravoSessionId/);
  const revoke = sessions.find((entry) => entry.id === 'session-revoke-without-permission');
  assert.ok(revoke?.control.reachabilityObservations.includes('one-alpha-session-revoked'));
  assert.ok(revoke?.control.reachabilityObservations.includes('derived-protected-access-denied'));
  assert.ok(
    revoke?.control.reachabilityObservations.includes('unrelated-session-digests-unchanged'),
  );
});

test('freezes configuration read and update authorization with exact restoration', () => {
  const config = adminDataCaseRequirements.filter((entry) => entry.sentinelId === 'ST-61');
  assert.equal(config.length, 3);
  assert.deepEqual(
    config.map((entry) => [entry.probe.requiredPermission, entry.expectedResult]),
    [
      ['admin:config:read', 'forbidden'],
      ['admin:config:update', 'forbidden'],
      ['admin:config:read', 'allowed'],
    ],
  );
  const update = config.find((entry) => entry.id === 'configuration-update-without-permission');
  assert.ok(
    update?.control.reachabilityObservations.includes(
      'configuration-value-and-version-change-once',
    ),
  );
  assert.ok(
    update?.control.reachabilityObservations.includes('owned-value-restored-after-control'),
  );
});

test('uses only closed version-qualified authorities without claiming certification', () => {
  const references = new Set(adminDataReferences.map((reference) => reference.id));
  assert.equal(references.size, adminDataReferences.length);
  assert.ok(
    adminDataReferences.every(
      (reference) => reference.version.length > 0 && reference.sectionOrControl.length > 0,
    ),
  );
  assert.ok(
    adminDataReferences
      .filter((reference) => reference.authority === 'OWASP ASVS')
      .every(
        (reference) =>
          reference.version === '5.0.0' && /^\d+\.\d+\.\d+$/.test(reference.sectionOrControl),
      ),
  );
  assert.ok(
    adminDataCaseRequirements.every((entry) =>
      entry.referenceIds.every((reference) => references.has(reference)),
    ),
  );
  assert.doesNotMatch(JSON.stringify(adminDataCaseRequirements), /certified|certification/i);
});
