import assert from 'node:assert/strict';
import test from 'node:test';

import type { PublicVerificationBoundary } from '../../fixtures/fixture-assurance.js';
import { loadFixtureAssuranceSurface } from '../../fixtures/fixture-assurance.js';
import { publicCredentialRefs, uniqueSorted } from './fixture-spec-helpers.js';

const requiredPublicBoundaries: readonly PublicVerificationBoundary[] = [
  'administration',
  'browser',
  'email',
  'fixtures',
  'http',
  'protocol',
];

/** Recursively returns public-manifest keys that would expose raw credential material. */
function rawSecretKeys(value: object): readonly string[] {
  const forbiddenKey =
    /^(?:raw)?(?:password|clientSecret|accessToken|refreshToken|cookie|totpSecret|recoveryCode)$/i;
  const findings: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKey.test(key)) findings.push(key);
    if (child !== null && typeof child === 'object') findings.push(...rawSecretKeys(child));
  }
  return uniqueSorted(findings);
}

// The generated public manifest exposes stable identifiers and opaque credential references, but
// raw passwords, secrets, tokens, cookies, TOTP seeds, and recovery codes remain outside it.
test('should separate every runtime credential from the generated public manifest', async () => {
  const surface = await loadFixtureAssuranceSurface();
  const publicManifestText = JSON.stringify(surface.publicManifest);
  const representativeSecrets = [
    'Password-Canary-92!',
    'client-secret-canary',
    'raw-access-token-canary',
    'session-cookie-canary',
    'JBSWY3DPEHPK3PXP',
    'recovery-code-canary',
  ];

  assert.deepEqual(rawSecretKeys(surface.publicManifest), []);
  for (const secret of representativeSecrets) assert.ok(!publicManifestText.includes(secret));
  const descriptorsByRef = new Map(
    surface.protectedCredentials.map((descriptor) => [descriptor.ref, descriptor]),
  );
  for (const ref of publicCredentialRefs(surface.publicManifest)) {
    const descriptor = descriptorsByRef.get(ref);
    assert.ok(descriptor, ref);
    assert.equal(descriptor.storage, 'runtime-protected');
    assert.equal(descriptor.rawValueExposed, false);
  }
  assert.deepEqual(
    uniqueSorted(surface.protectedCredentials.map((descriptor) => descriptor.kind)),
    ['client-secret', 'cookie', 'password', 'recovery-code', 'token', 'totp'],
  );
});

// Runtime profile identity is exact: operational evidence is not eligible for environment-bound
// security claims, while production-security requires every production security precondition.
test('should expose only the exact operational and production-security profiles', async () => {
  const { profiles } = await loadFixtureAssuranceSurface();

  assert.deepEqual(uniqueSorted(profiles.map((profile) => profile.id)), [
    'operational',
    'production-security',
  ]);
  assert.equal(profiles.length, 2);
  const operational = profiles.find((profile) => profile.id === 'operational');
  const productionSecurity = profiles.find((profile) => profile.id === 'production-security');
  assert.ok(operational);
  assert.ok(productionSecurity);
  assert.equal(operational.environmentSecurityEvidenceEligible, false);
  assert.deepEqual(
    {
      environmentSecurityEvidenceEligible: productionSecurity.environmentSecurityEvidenceEligible,
      productionModeRequired: productionSecurity.productionModeRequired,
      tlsRequired: productionSecurity.tlsRequired,
      secureCookiesRequired: productionSecurity.secureCookiesRequired,
      minimalErrorsRequired: productionSecurity.minimalErrorsRequired,
      securityHeadersRequired: productionSecurity.securityHeadersRequired,
    },
    {
      environmentSecurityEvidenceEligible: true,
      productionModeRequired: true,
      tlsRequired: true,
      secureCookiesRequired: true,
      minimalErrorsRequired: true,
      securityHeadersRequired: true,
    },
  );
});

// Fixture postconditions are verified through the currently owned HTTP, browser, protocol, and
// email boundaries using immutable public-contract expectations.
for (const profileId of ['operational', 'production-security'] as const) {
  test(`should verify every public postcondition for the ${profileId} profile`, async () => {
    const surface = await loadFixtureAssuranceSurface();

    const results = await surface.verifyPublicPostconditions(profileId);

    assert.deepEqual(
      uniqueSorted(results.map((result) => result.boundary)),
      requiredPublicBoundaries,
    );
    assert.equal(results.length, requiredPublicBoundaries.length);
    assert.ok(results.every((result) => result.status === 'passed'));
    assert.ok(results.every((result) => result.expectationSource === 'public-contract'));
    assert.ok(results.every((result) => result.productionDerived === false));
    const observations = new Set(results.flatMap((result) => result.observations));
    for (const tenant of ['alpha', 'bravo']) {
      for (const kind of ['public', 'confidential']) {
        assert.ok(observations.has(`oidc-login:${tenant}:${kind}`));
      }
      assert.ok(observations.has(`invalid-redirect:${tenant}`));
      assert.ok(
        observations.has(
          profileId === 'production-security'
            ? `invalid-origin:${tenant}`
            : `invalid-origin:${tenant}:profile-not-eligible`,
        ),
      );
      assert.ok(observations.has(`fixture-users:${tenant}`));
      assert.ok(observations.has(`fixture-session-token:${tenant}`));
      assert.ok(observations.has(`fixture-two-factor:${tenant}`));
    }
    assert.ok(observations.has('admin:full-read'));
    assert.ok(observations.has('admin:limited-read'));
    assert.ok(observations.has('admin:limited-write-denied'));
    assert.ok(observations.has('admin:unprivileged-denied'));
  });
}
