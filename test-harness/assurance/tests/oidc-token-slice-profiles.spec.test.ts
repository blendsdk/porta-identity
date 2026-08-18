import assert from 'node:assert/strict';
import test from 'node:test';

import {
  oidcTokenClaimRequirements,
  oidcTokenProfileCatalogVersion,
  oidcTokenReferences,
  oidcTokenSliceProfiles,
  type ProtocolBoundary,
  type ProtocolSentinelId,
  type ProtocolSliceId,
} from './oidc-token-slice-profile-requirements.js';

const exactSlices: readonly ProtocolSliceId[] = [
  'redirect-pkce',
  'authorization-code-binding',
  'request-consent-client-integrity',
  'id-token-validation',
  'opaque-token-separation',
  'refresh-rotation-replay',
];
const exactBoundaries: readonly ProtocolBoundary[] = ['spa', 'bff', 'raw-http-jose'];
const exactSentinels: readonly ProtocolSentinelId[] = [
  'ST-33',
  'ST-34',
  'ST-35',
  'ST-36',
  'ST-37',
  'ST-38',
  'ST-39',
  'ST-40',
  'ST-41',
  'ST-63',
];

test('defines exact versioned protocol slices with complete threat profiles', () => {
  assert.equal(oidcTokenProfileCatalogVersion, 1);
  assert.deepEqual(
    oidcTokenSliceProfiles.map((profile) => profile.id),
    exactSlices,
  );

  for (const profile of oidcTokenSliceProfiles) {
    assert.equal(profile.schemaVersion, 1, profile.id);
    assert.equal(profile.profileVersion, '2026-08-18', profile.id);
    assert.deepEqual(profile.boundaries, exactBoundaries, profile.id);
    assert.ok(profile.actors.length > 0, `${profile.id}: actors`);
    assert.ok(profile.assets.length > 0, `${profile.id}: assets`);
    assert.ok(profile.entryPoints.length > 0, `${profile.id}: entry points`);
    assert.ok(
      profile.entryPoints.every((entry) => entry.trustBoundary.length > 0),
      `${profile.id}: trust boundaries`,
    );
    assert.ok(profile.abuseCases.length > 0, `${profile.id}: abuse cases`);
    assert.ok(profile.allowedOutcomes.length > 0, `${profile.id}: allowed outcomes`);
    assert.ok(profile.exactRejections.length > 0, `${profile.id}: exact rejections`);
    assert.ok(profile.prohibitedSideEffects.length > 0, `${profile.id}: prohibited effects`);
    assert.ok(profile.privacySafeLogs.length > 0, `${profile.id}: required logs`);
    assert.ok(profile.recoveryExpectations.length > 0, `${profile.id}: recovery`);
    assert.ok(profile.referenceIds.length > 0, `${profile.id}: references`);
  }
});

test('binds every ST-33 through ST-41 and ST-63 sentinel to stable independent claims', () => {
  assert.deepEqual(
    oidcTokenClaimRequirements.map((claim) => claim.sentinelId),
    exactSentinels,
  );
  assert.equal(
    new Set(oidcTokenClaimRequirements.map((claim) => claim.id)).size,
    oidcTokenClaimRequirements.length,
  );

  const profileIds = new Set(oidcTokenSliceProfiles.map((profile) => profile.id));
  for (const claim of oidcTokenClaimRequirements) {
    assert.equal(claim.schemaVersion, 1, claim.id);
    assert.deepEqual(claim.boundaries, exactBoundaries, claim.id);
    assert.ok(claim.claimIds.length > 0, `${claim.id}: claim IDs`);
    assert.ok(claim.sliceIds.length > 0, `${claim.id}: slices`);
    assert.ok(
      claim.sliceIds.every((sliceId) => profileIds.has(sliceId)),
      `${claim.id}: orphan slice`,
    );
    assert.ok(claim.invariant.length > 0, `${claim.id}: invariant`);
    assert.ok(claim.positiveOutcome.length > 0, `${claim.id}: positive outcome`);
    assert.ok(claim.negativeOutcomes.length > 0, `${claim.id}: negative outcomes`);
    assert.equal(claim.oracle, 'published-standard-and-approved-porta-contract', claim.id);
    assert.ok(claim.independentClientRule.length > 0, `${claim.id}: independent client rule`);
  }
});

test('requires independent JOSE and preserves opaque access-token separation', () => {
  const idTokenClaims = oidcTokenClaimRequirements.filter((claim) =>
    claim.sliceIds.includes('id-token-validation'),
  );
  assert.ok(
    idTokenClaims.some((claim) => claim.independentClientRule.includes('no Porta token helper')),
  );
  assert.ok(
    idTokenClaims.some((claim) => claim.independentClientRule.includes('no shared Porta helper')),
  );

  const separation = oidcTokenClaimRequirements.find((claim) => claim.sentinelId === 'ST-38');
  assert.ok(separation);
  assert.equal(
    separation.independentClientRule,
    'opaque access tokens are never decoded or treated as JWTs',
  );
  assert.ok(
    oidcTokenSliceProfiles
      .find((profile) => profile.id === 'opaque-token-separation')
      ?.prohibitedSideEffects.includes('opaque-token-jwt-interpretation'),
  );
});

test('uses only closed sentinel mappings and version-qualified applicable references', () => {
  const referenceIds = new Set(oidcTokenReferences.map((reference) => reference.id));
  assert.equal(referenceIds.size, oidcTokenReferences.length);
  assert.deepEqual(
    [...new Set(oidcTokenReferences.map((reference) => reference.authority))].sort(),
    ['OWASP ASVS', 'OpenID Connect Core', 'RFC 7636', 'RFC 8725', 'RFC 9700'],
  );
  assert.ok(
    oidcTokenReferences.every(
      (reference) => reference.version.length > 0 && reference.sectionOrControl.length > 0,
    ),
  );
  for (const profile of oidcTokenSliceProfiles) {
    assert.ok(
      profile.referenceIds.every((referenceId) => referenceIds.has(referenceId)),
      `${profile.id}: unknown reference`,
    );
  }
});

test('freezes exact protocol invariants without defining executable observations', () => {
  const bySentinel = new Map(
    oidcTokenClaimRequirements.map((claim) => [claim.sentinelId, claim] as const),
  );
  assert.match(
    bySentinel.get('ST-33')?.invariant ?? '',
    /redirect URI matching is exact.*PKCE S256/,
  );
  assert.match(bySentinel.get('ST-34')?.positiveOutcome ?? '', /exactly one durable redemption/);
  assert.match(
    bySentinel.get('ST-35')?.invariant ?? '',
    /state responsibility.*nonce propagation.*consent context.*client authentication/,
  );
  assert.match(
    bySentinel.get('ST-36')?.invariant ?? '',
    /ES256.*P-256.*kid.*iss.*aud.*sub.*nonce.*exp.*nbf/,
  );
  assert.match(
    bySentinel.get('ST-37')?.negativeOutcomes.join(' ') ?? '',
    /unknown-kid.*jku.*x5u.*embedded-JWK/,
  );
  assert.match(
    bySentinel.get('ST-39')?.invariant ?? '',
    /rotation replaces the predecessor.*replay/,
  );
  assert.match(bySentinel.get('ST-40')?.invariant ?? '', /issuer.*discovery.*JWKS.*never cross/);
  assert.match(
    bySentinel.get('ST-41')?.negativeOutcomes.join(' ') ?? '',
    /no identity.*no consent.*session/,
  );
});
