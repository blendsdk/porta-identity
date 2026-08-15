import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  controlPlaneAuthorityProfile,
  tenantOidcAuthorityProfile,
} from './tenant-admin-profile-requirements.js';
import {
  authorizationResult,
  liveDigest,
  mapObservedSideEffects,
} from './tenant-admin-live-context.js';
import { controlPlaneReachability } from './tenant-admin-live-control.js';
import {
  classifyForeignCredentialState,
  observedOrganizationFromIssuer,
} from './tenant-admin-live-oidc.js';

test('should generate a unique controlled matrix for every compatible authority case', () => {
  for (const profile of [tenantOidcAuthorityProfile, controlPlaneAuthorityProfile]) {
    assert.equal(new Set(profile.cases.map((entry) => entry.id)).size, profile.cases.length);
    for (const entry of profile.cases) {
      assert.ok(
        entry.actor === 'unauthenticated' ||
          profile.actors.some((actor) => actor.id === entry.actor),
        entry.id,
      );
      assert.ok(
        profile.actions.some((action) => action.id === entry.action),
        entry.id,
      );
      assert.ok(
        profile.resources.some((resource) => resource.id === entry.resource),
        entry.id,
      );
      if (entry.result === 'allowed') continue;
      assert.ok(
        profile.cases.some(
          (control) =>
            control.action === entry.action &&
            control.resource === entry.resource &&
            control.result === 'allowed',
        ),
        `missing same-action same-target control for ${entry.id}`,
      );
    }
  }
});

test('should classify exact public statuses and reject ambiguous handler outcomes', () => {
  assert.equal(authorizationResult(200), 'allowed');
  assert.equal(authorizationResult(204), 'allowed');
  assert.equal(authorizationResult(401), 'unauthenticated');
  assert.equal(authorizationResult(403), 'forbidden');
  assert.equal(authorizationResult(404), 'not-found');
  assert.throws(() => authorizationResult(302), /unsupported authorization response status/u);
  assert.throws(() => authorizationResult(500), /unsupported authorization response status/u);
});

test('should classify only an observed login rejection or authenticated continuation', () => {
  assert.equal(
    classifyForeignCredentialState({
      loginVisible: true,
      consentVisible: false,
      callbackHasCode: false,
    }),
    'not-found',
  );
  assert.equal(
    classifyForeignCredentialState({
      loginVisible: false,
      consentVisible: true,
      callbackHasCode: false,
    }),
    'allowed',
  );
  assert.equal(
    classifyForeignCredentialState({
      loginVisible: false,
      consentVisible: false,
      callbackHasCode: true,
    }),
    'allowed',
  );
  assert.throws(
    () =>
      classifyForeignCredentialState({
        loginVisible: false,
        consentVisible: false,
        callbackHasCode: false,
      }),
    /credential outcome is not independently observable/u,
  );
  assert.throws(
    () =>
      classifyForeignCredentialState({
        loginVisible: true,
        consentVisible: true,
        callbackHasCode: false,
      }),
    /credential outcome is not independently observable/u,
  );
});

test('should retain a missing or unknown issuer organization as an observable mismatch', () => {
  assert.equal(observedOrganizationFromIssuer('https://porta.example.test/alpha'), 'alpha');
  assert.equal(observedOrganizationFromIssuer('https://porta.example.test/bravo'), 'bravo');
  assert.equal(observedOrganizationFromIssuer('https://porta.example.test'), 'none');
  assert.equal(observedOrganizationFromIssuer('https://porta.example.test/other'), 'none');
});

test('should distinguish handler permission and resource boundaries after authentication', () => {
  assert.deepEqual(controlPlaneReachability('admin-full', 'allowed'), {
    adminAuthenticationAccepted: true,
    handlerReached: true,
    decisionBoundary: 'handler',
  });
  assert.deepEqual(controlPlaneReachability('admin-limited', 'forbidden'), {
    adminAuthenticationAccepted: true,
    handlerReached: true,
    decisionBoundary: 'permission',
  });
  assert.deepEqual(controlPlaneReachability('admin-full', 'not-found'), {
    adminAuthenticationAccepted: true,
    handlerReached: true,
    decisionBoundary: 'resource',
  });
  assert.deepEqual(controlPlaneReachability('unauthenticated', 'unauthenticated'), {
    adminAuthenticationAccepted: false,
    handlerReached: false,
    decisionBoundary: 'handler',
  });
});

test('should derive target-state and prohibited-side-effect evidence independently', () => {
  const before = liveDigest({ id: 'stable-target', state: 'before' });
  const unchanged = liveDigest({ id: 'stable-target', state: 'before' });
  const after = liveDigest({ id: 'stable-target', state: 'after' });
  assert.equal(before, unchanged);
  assert.notEqual(before, after);
  assert.deepEqual(
    mapObservedSideEffects(
      ['cross-target-mutation', 'target-disclosure', 'stale-token-acceptance', 'cache-reuse'],
      { targetChanged: true, targetDisclosed: false, unauthorizedAccepted: true },
    ),
    {
      'cross-target-mutation': true,
      'target-disclosure': false,
      'stale-token-acceptance': true,
      'cache-reuse': true,
    },
  );
});

test('should warm authority before mutation and retry after a real Porta restart', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'test-harness/assurance/tests/tenant-admin-live-stale.ts'),
    'utf8',
  );
  const warm = source.indexOf('const control = await retryAdminRead(context, token)');
  const mutation = source.indexOf("context.rawRequest(\n          'DELETE'");
  assert.ok(warm >= 0 && mutation > warm, 'authority control must warm before mutation');
  assert.match(source, /retryObservation\('existing-client'/u);
  assert.match(source, /retryObservation\('fresh-client'/u);
  assert.match(source, /await context\.lifecycle\('restart-porta'\)/u);
  assert.match(source, /retryObservation\('fresh-porta-process'/u);
  assert.match(source, /const before = await context\.targetFingerprint\(target\)/u);
  assert.match(source, /const after = await restartedContext\.targetFingerprint\(target\)/u);
});
