import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assembleFunctionalCaseObservation,
  functionalBodyFingerprint,
  functionalHeaderFingerprint,
} from './human-auth-functional-observations.js';

import type {
  HumanAuthFunctionalCaseRequirement,
  HumanAuthFunctionalStepObservation,
} from './human-auth-functional-contract.js';

const requirement: HumanAuthFunctionalCaseRequirement = Object.freeze({
  sentinelId: 'ST-42',
  profileIds: Object.freeze(['functional-enumeration']),
  prerequisites: Object.freeze([]),
  controls: Object.freeze([
    Object.freeze({
      id: 'control',
      kind: 'control',
      controlId: null,
      setupControlIds: Object.freeze([]),
      boundary: 'raw-http',
      action: 'login',
      target: 'account',
      variation: 'valid',
      response: Object.freeze({
        status: 'redirect',
        bodySchemaId: 'authorization-callback',
        headerSetId: 'redirect',
      }),
      publicState: Object.freeze([]),
    }),
  ]),
  negatives: Object.freeze([]),
});

function observation(status: number | 'redirect'): HumanAuthFunctionalStepObservation {
  return Object.freeze({
    id: 'control',
    response: Object.freeze({
      status,
      bodySchemaId: status === 'redirect' ? 'authorization-callback' : 'unexpected-response',
      headerSetId: status === 'redirect' ? 'redirect' : null,
    }),
    publicState: Object.freeze([]),
  });
}

test('should preserve a live response that contradicts the requirement', () => {
  const result = assembleFunctionalCaseObservation(
    requirement,
    '2bf5feca-a298-443a-a532-0e24c2d05db4',
    new Map([['control', observation(403)]]),
  );
  assert.equal(result.controls[0]?.response.status, 403);
  assert.notDeepEqual(result.controls[0]?.response, requirement.controls[0]?.response);
});

test('should reject missing or undeclared live observations', () => {
  assert.throws(
    () =>
      assembleFunctionalCaseObservation(
        requirement,
        '2bf5feca-a298-443a-a532-0e24c2d05db4',
        new Map(),
      ),
    /incomplete or undeclared/u,
  );
  assert.throws(
    () =>
      assembleFunctionalCaseObservation(
        requirement,
        '2bf5feca-a298-443a-a532-0e24c2d05db4',
        new Map([
          ['control', observation('redirect')],
          ['extra', { ...observation(403), id: 'extra' }],
        ]),
      ),
    /incomplete or undeclared/u,
  );
});

test('should preserve identity-revealing body and public-header differences', () => {
  assert.notEqual(
    functionalBodyFingerprint('Invalid credentials'),
    functionalBodyFingerprint('No account exists for absent@example.test'),
  );
  assert.equal(
    functionalBodyFingerprint(' Invalid\n credentials '),
    functionalBodyFingerprint('Invalid credentials'),
  );
  assert.notEqual(
    functionalHeaderFingerprint({ 'cache-control': 'no-store' }),
    functionalHeaderFingerprint({ 'cache-control': 'private' }),
  );
  assert.equal(
    functionalHeaderFingerprint({
      location: '/volatile-one',
      'set-cookie': 'secret-one',
      'content-type': 'text/html',
    }),
    functionalHeaderFingerprint({
      location: '/volatile-two',
      'set-cookie': 'secret-two',
      'content-type': 'text/html',
    }),
  );
});
