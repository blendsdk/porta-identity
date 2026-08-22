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
  selectNewAuthenticatedSession,
  sessionRenewalObserved,
} from './tenant-admin-live-context.js';
import {
  assertAuthorizedRouteProof,
  authorizedRouteProof,
  controlPlaneReachability,
} from './tenant-admin-live-control.js';
import {
  cacheIsolationResult,
  classifyForeignCredentialState,
  concurrentJourneysOverlap,
  observedOrganizationFromIssuer,
  tenantCrossTalkDetected,
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

test('should classify only a valid tenant authorization continuation or exact rejection', () => {
  assert.equal(cacheIsolationResult(200, true), 'allowed');
  assert.equal(cacheIsolationResult(404, false), 'not-found');
  assert.throws(() => cacheIsolationResult(200, false), /cache-isolation response/u);
  assert.throws(() => cacheIsolationResult(302, false), /cache-isolation response/u);
  assert.throws(() => cacheIsolationResult(500, false), /cache-isolation response/u);
});

test('should distinguish handler permission and resource boundaries after authentication', () => {
  const allowedCase = controlPlaneAuthorityProfile.cases.find(
    (entry) => entry.result === 'allowed' && entry.action === 'read-target-user',
  );
  assert.ok(allowedCase);
  const target = {
    catalogId: allowedCase.resource,
    surface: 'user' as const,
    organization: 'alpha' as const,
    readPath: '/api/admin/users/target',
    mutationPath: '/api/admin/users/target',
  };
  const allowedResponse = { status: 200, body: { data: { id: 'target' } } };
  const proof = authorizedRouteProof(allowedCase, target, allowedResponse);
  const deniedCase = controlPlaneAuthorityProfile.cases.find(
    (entry) => entry.authorizedControl === allowedCase.id,
  );
  assert.ok(deniedCase);
  assert.doesNotThrow(() => assertAuthorizedRouteProof(deniedCase, target, proof));
  assert.throws(
    () => assertAuthorizedRouteProof(deniedCase, { ...target, catalogId: 'other-target' }, proof),
    /does not match the denied route/u,
  );
  assert.deepEqual(controlPlaneReachability('admin-full', allowedResponse), {
    adminAuthenticationAccepted: true,
    handlerReached: true,
    decisionBoundary: 'handler',
  });
  assert.deepEqual(
    controlPlaneReachability(
      'admin-limited',
      {
        status: 403,
        body: {
          error: 'Forbidden',
          message: 'The requested operation is not permitted',
        },
      },
      proof,
    ),
    {
      adminAuthenticationAccepted: true,
      handlerReached: true,
      decisionBoundary: 'permission',
    },
  );
  assert.deepEqual(
    controlPlaneReachability(
      'admin-full',
      { status: 404, body: { error: 'User not found' } },
      proof,
    ),
    {
      adminAuthenticationAccepted: true,
      handlerReached: true,
      decisionBoundary: 'resource',
    },
  );
  assert.deepEqual(controlPlaneReachability('unauthenticated', { status: 401 }), {
    adminAuthenticationAccepted: false,
    handlerReached: false,
    decisionBoundary: 'handler',
  });
  assert.throws(
    () => controlPlaneReachability('admin-limited', { status: 403 }),
    /authorized control proof/u,
  );
  assert.throws(
    () =>
      controlPlaneReachability(
        'admin-limited',
        { status: 403, body: { error: 'Forbidden' } },
        proof,
      ),
    /expected public decision boundary/u,
  );
  assert.throws(
    () =>
      controlPlaneReachability(
        'admin-limited',
        {
          status: 403,
          body: {
            error: 'Forbidden',
            message: 'Administrative access is not permitted',
          },
        },
        proof,
      ),
    /expected public decision boundary/u,
  );
  assert.throws(
    () =>
      controlPlaneReachability('admin-full', { status: 404, body: { error: 'ambiguous' } }, proof),
    /expected public decision boundary/u,
  );
  assert.throws(
    () =>
      controlPlaneReachability('admin-full', { status: 404, body: { error: 'Not Found' } }, proof),
    /expected public decision boundary/u,
  );
});

test('should select only a newly created authenticated session for a concurrent journey', () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  const clientId = '00000000-0000-4000-8000-000000000002';
  const prior = {
    sessionId: 'prior',
    userId,
    clientId,
    organizationId: '00000000-0000-4000-8000-000000000003',
    createdAt: '2026-08-18T10:00:00.000Z',
  };
  const created = {
    ...prior,
    sessionId: 'created',
    createdAt: '2026-08-18T10:00:01.000Z',
  };
  assert.deepEqual(
    selectNewAuthenticatedSession([prior, created], new Set(['prior']), userId, clientId),
    created,
  );
  assert.throws(
    () => selectNewAuthenticatedSession([prior], new Set(['prior']), userId, clientId),
    /new tracked tenant session is absent/u,
  );
});

test('should derive target-state and prohibited-side-effect evidence independently', () => {
  const before = liveDigest({ id: 'stable-target', state: 'before' });
  const unchanged = liveDigest({ id: 'stable-target', state: 'before' });
  const after = liveDigest({ id: 'stable-target', state: 'after' });
  assert.equal(before, unchanged);
  assert.notEqual(before, after);
  assert.deepEqual(
    mapObservedSideEffects(
      [
        'foreign-state-mutation',
        'foreign-data-disclosure',
        'foreign-token-acceptance',
        'foreign-session-renewal',
        'cross-target-cache-reuse',
        'sensitive-audit-content',
      ],
      {
        targetChanged: true,
        targetDisclosed: false,
        unauthorizedAccepted: true,
        sessionRenewed: false,
        crossTargetCacheReuse: true,
        sensitiveAuditContent: false,
      },
    ),
    {
      'foreign-state-mutation': true,
      'foreign-data-disclosure': false,
      'foreign-token-acceptance': true,
      'foreign-session-renewal': false,
      'cross-target-cache-reuse': true,
      'sensitive-audit-content': false,
    },
  );
  assert.throws(
    () =>
      mapObservedSideEffects(['foreign-session-renewal'], {
        targetChanged: false,
        targetDisclosed: false,
        unauthorizedAccepted: false,
      }),
    /session renewal observation is required/u,
  );
  assert.throws(
    () =>
      mapObservedSideEffects(['undeclared-side-effect'], {
        targetChanged: false,
        targetDisclosed: false,
        unauthorizedAccepted: false,
      }),
    /unsupported tenant\/admin side-effect observation/u,
  );
});

test('should distinguish session renewal from activity and revocation', () => {
  const before = [{ identity: 'session-a', renewalFingerprint: 'expiry-a' }];
  assert.equal(sessionRenewalObserved(before, []), false);
  assert.equal(sessionRenewalObserved(before, before), false);
  assert.equal(
    sessionRenewalObserved(before, [
      { identity: 'session-a', renewalFingerprint: 'expiry-extended' },
    ]),
    true,
  );
  assert.equal(
    sessionRenewalObserved(before, [
      ...before,
      { identity: 'session-b', renewalFingerprint: 'expiry-b' },
    ]),
    true,
  );
});

test('should require real overlap and preserve independent tenant identity mismatches', () => {
  assert.equal(
    concurrentJourneysOverlap([
      { startedAt: 1, completedAt: 5 },
      { startedAt: 2, completedAt: 4 },
    ]),
    true,
  );
  assert.equal(
    concurrentJourneysOverlap([
      { startedAt: 1, completedAt: 2 },
      { startedAt: 2, completedAt: 3 },
    ]),
    false,
  );
  assert.throws(
    () => concurrentJourneysOverlap([{ startedAt: 1, completedAt: 1 }]),
    /intervals are invalid/u,
  );
  assert.equal(
    tenantCrossTalkDetected([
      {
        requestOrganization: 'alpha',
        issuerOrganization: 'alpha',
        cacheOrganization: 'bravo',
        sessionOrganization: 'alpha',
        responseOrganization: 'alpha',
        cacheKeyFingerprint: 'cache-observation',
        sessionFingerprint: 'session-observation',
      },
    ]),
    true,
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
