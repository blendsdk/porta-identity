import assert from 'node:assert/strict';
import test from 'node:test';

import {
  functionalEnumerationTimingPolicy,
  humanAuthClaimRequirements,
  humanAuthProfileCatalogVersion,
  humanAuthRequirementSources,
  humanAuthSliceProfiles,
  type HumanAuthSentinelId,
  type HumanAuthSliceId,
} from './human-auth-slice-profile-requirements.js';

const exactSlices: readonly HumanAuthSliceId[] = [
  'functional-enumeration',
  'login-method-enforcement',
  'failed-login-lockout-rate-limit',
  'session-lifecycle',
  'cookie-csrf',
  'magic-link',
  'password-reset',
  'invitation',
  'email-otp',
  'totp',
  'recovery-code',
];

const exactSentinels: readonly HumanAuthSentinelId[] = [
  'ST-42',
  'ST-43',
  'ST-44',
  'ST-45',
  'ST-46',
  'ST-47',
  'ST-48',
  'ST-63',
];

test('defines the exact versioned human-authentication slice catalog', () => {
  assert.equal(humanAuthProfileCatalogVersion, 1);
  assert.deepEqual(
    humanAuthSliceProfiles.map((profile) => profile.id),
    exactSlices,
  );
  assert.equal(new Set(exactSlices).size, exactSlices.length);

  for (const profile of humanAuthSliceProfiles) {
    assert.equal(profile.schemaVersion, 1, profile.id);
    assert.equal(profile.profileVersion, '2026-08-19', profile.id);
    assert.ok(profile.actors.length > 0, `${profile.id}: actors`);
    assert.ok(profile.assets.length > 0, `${profile.id}: assets`);
    assert.ok(profile.actions.length > 0, `${profile.id}: actions`);
    assert.ok(profile.resources.length > 0, `${profile.id}: resources`);
    assert.ok(profile.entryPoints.length > 0, `${profile.id}: entry points`);
    assert.ok(
      profile.entryPoints.every((entry) => entry.id.length > 0 && entry.trustBoundary.length > 0),
      `${profile.id}: trust boundaries`,
    );
    assert.ok(profile.abuseCases.length > 0, `${profile.id}: abuse cases`);
    assert.ok(profile.allowedOutcomes.length > 0, `${profile.id}: allowed outcomes`);
    assert.ok(profile.exactRejections.length > 0, `${profile.id}: exact rejections`);
    assert.ok(profile.prohibitedSideEffects.length > 0, `${profile.id}: prohibited effects`);
    assert.ok(profile.privacySafeLogs.length > 0, `${profile.id}: privacy-safe logs`);
    assert.ok(profile.recoveryExpectations.length > 0, `${profile.id}: recovery`);
    assert.ok(profile.sourceIds.length > 0, `${profile.id}: sources`);
  }
});

test('blocks unapproved timing work while freezing only functional enumeration fields', () => {
  assert.deepEqual(functionalEnumerationTimingPolicy, {
    gapId: 'enumeration-timing-contract-unapproved',
    status: 'blocked',
    allowedObservationFields: [
      'public-status',
      'public-body-schema',
      'security-relevant-response-headers',
    ],
    forbiddenActivities: [
      'latency-sampling',
      'timing-distribution-comparison',
      'post-observation-threshold-selection',
      'effect-size-estimation',
      'power-rule-selection',
    ],
    unblockAuthority:
      'product/security authority must approve the hypothesis, material effect-size bound, sample-size/power rule, clock/environment controls, and noise/invalid-run rule before measurement',
  });

  const enumeration = humanAuthSliceProfiles.find(
    (profile) => profile.id === 'functional-enumeration',
  );
  assert.ok(enumeration);
  assert.deepEqual(enumeration.allowedOutcomes, [
    'existing-and-absent-pairs-produce-the-same-public-status',
    'existing-and-absent-pairs-produce-the-same-public-body-schema',
    'existing-and-absent-pairs-produce-the-same-security-relevant-header-set',
  ]);
  assert.ok(
    enumeration.abuseCases.every(
      (abuse) =>
        abuse.endsWith('-status') ||
        abuse.endsWith('-body-schema') ||
        abuse.endsWith('-response-headers'),
    ),
  );
});

test('binds ST-42 through ST-48 and ST-63 to independent requirement-only claims', () => {
  assert.deepEqual(
    humanAuthClaimRequirements.map((claim) => claim.sentinelId),
    exactSentinels,
  );
  assert.equal(
    new Set(humanAuthClaimRequirements.map((claim) => claim.id)).size,
    humanAuthClaimRequirements.length,
  );

  const slices = new Set(humanAuthSliceProfiles.map((profile) => profile.id));
  const mappedSlices = new Set(humanAuthClaimRequirements.flatMap((claim) => claim.sliceIds));
  assert.deepEqual([...mappedSlices].sort(), [...slices].sort());

  for (const claim of humanAuthClaimRequirements) {
    assert.equal(claim.schemaVersion, 1, claim.id);
    assert.equal(claim.requirementVersion, '2026-08-19', claim.id);
    assert.ok(claim.claimIds.length > 0, `${claim.id}: claim IDs`);
    assert.ok(claim.sliceIds.length > 0, `${claim.id}: slices`);
    assert.ok(
      claim.sliceIds.every((slice) => slices.has(slice)),
      `${claim.id}: orphan slice`,
    );
    assert.ok(claim.invariant.length > 0, `${claim.id}: invariant`);
    assert.ok(claim.positiveOutcome.length > 0, `${claim.id}: positive outcome`);
    assert.ok(claim.negativeOutcomes.length > 0, `${claim.id}: negative outcomes`);
    assert.equal(claim.oracle, 'approved-requirements-only', claim.id);
    assert.equal(claim.evidenceStatus, 'specification-only', claim.id);
  }
});

test('defines privacy-safe logs and recovery without retaining authentication secrets', () => {
  const requiredFields = [
    'synthetic-correlation-id',
    'event-class',
    'public-method',
    'public-outcome-class',
  ];
  const requiredForbiddenFields = [
    'password',
    'session-cookie',
    'csrf-token',
    'magic-link-token',
    'password-reset-token',
    'invitation-token',
    'email-otp-code',
    'totp-secret',
    'totp-code',
    'recovery-code',
  ];

  for (const profile of humanAuthSliceProfiles) {
    for (const log of profile.privacySafeLogs) {
      assert.deepEqual(log.requiredFields, requiredFields, profile.id);
      assert.ok(
        requiredForbiddenFields.every((field) => log.forbiddenFields.includes(field)),
        `${profile.id}: forbidden log fields`,
      );
    }
    assert.ok(
      profile.recoveryExpectations.every((expectation) => expectation.length > 0),
      `${profile.id}: recovery expectations`,
    );
  }
});

test('freezes exact method, session, cookie, recovery-artifact, and second-factor invariants', () => {
  const profiles = new Map(humanAuthSliceProfiles.map((profile) => [profile.id, profile] as const));

  assert.match(
    profiles.get('login-method-enforcement')?.exactRejections.join(' ') ?? '',
    /configured-disabled-method:method-disabled-public-rejection/,
  );
  assert.match(
    profiles.get('failed-login-lockout-rate-limit')?.exactRejections.join(' ') ?? '',
    /failure-recorded.*locked-account.*public-throttled-rejection/,
  );
  assert.match(
    profiles.get('session-lifecycle')?.allowedOutcomes.join(' ') ?? '',
    /anonymous-session-identifier-is-renewed/,
  );
  assert.match(
    profiles.get('cookie-csrf')?.allowedOutcomes.join(' ') ?? '',
    /secure-httponly-samesite-and-host-only/,
  );

  for (const slice of ['magic-link', 'password-reset', 'invitation', 'email-otp'] as const) {
    const profile = profiles.get(slice);
    assert.match(profile?.allowedOutcomes.join(' ') ?? '', /cryptographically-unpredictable/);
    assert.match(profile?.allowedOutcomes.join(' ') ?? '', /intended-recipient-and-tenant/);
    assert.match(profile?.exactRejections.join(' ') ?? '', /configured-expiry-reached/);
    assert.match(profile?.exactRejections.join(' ') ?? '', /sequential-replay/);
    assert.match(profile?.exactRejections.join(' ') ?? '', /public-throttled-rejection/);
    assert.ok(
      [
        'artifact-in-wrong-mailbox',
        'artifact-in-public-response',
        'artifact-in-redirect',
        'artifact-in-log',
        'artifact-in-audit-event',
        'artifact-in-trace',
        'artifact-in-report',
        'artifact-in-referrer',
        'artifact-in-browser-history',
        'artifact-in-retained-evidence',
      ].every((effect) => profile?.prohibitedSideEffects.includes(effect)),
      slice,
    );
  }

  assert.match(
    profiles.get('totp')?.exactRejections.join(' ') ?? '',
    /second-factor-required-rejection/,
  );
  for (const slice of ['totp', 'recovery-code'] as const) {
    const profile = profiles.get(slice);
    assert.match(profile?.allowedOutcomes.join(' ') ?? '', /cryptographically-unpredictable/);
    assert.match(profile?.allowedOutcomes.join(' ') ?? '', /account-and-tenant/);
    assert.match(profile?.exactRejections.join(' ') ?? '', /configured-expiry-reached/);
    assert.match(profile?.exactRejections.join(' ') ?? '', /sequential-replay/);
    assert.match(profile?.exactRejections.join(' ') ?? '', /public-throttled-rejection/);
  }
});

test('uses only closed, version-qualified requirement sources', () => {
  assert.deepEqual(
    humanAuthRequirementSources.map((source) => source.id),
    ['rd-05-r5.2', 'rd-05-r5.6', 'rd-05-r5.7', 'rd-05-r5.10', 'testing-strategy-st42-st48-st63'],
  );
  assert.ok(
    humanAuthRequirementSources.every(
      (source) => source.version === '2026-08-19' && source.clause.length > 0,
    ),
  );
  const sourceIds = new Set(humanAuthRequirementSources.map((source) => source.id));
  for (const profile of humanAuthSliceProfiles) {
    assert.ok(
      profile.sourceIds.every((sourceId) => sourceIds.has(sourceId)),
      `${profile.id}: orphan source`,
    );
  }
});
