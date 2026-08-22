import assert from 'node:assert/strict';
import test from 'node:test';

import { materializeRawRequest, renderRawHttpRequest } from '../p1/request-material.js';
import { validationExposureRawCases } from './validation-exposure-raw-case-requirements.js';

const fixtureValues = Object.freeze({
  'synthetic-full-authority-token': 'synthetic-token',
  alphaOrgId: '11111111-1111-4111-8111-111111111111',
  alphaUserId: '22222222-2222-4222-8222-222222222222',
  bravoUserId: '33333333-3333-4333-8333-333333333333',
  alphaClientId: 'alpha-client',
  validS256Challenge: 'A'.repeat(43),
});

/** Returns one exact immutable raw case or fails the implementation test. */
function rawCase(id: string) {
  const requirement = validationExposureRawCases.find((candidate) => candidate.id === id);
  assert.ok(requirement, id);
  return requirement.request;
}

test('should preserve the requirement-owned CRLF octets without a normalizing client', () => {
  const request = materializeRawRequest(rawCase('st52-header-crlf'), fixtureValues, 1_024);
  const rendered = renderRawHttpRequest(request, 'porta-harness.ci.portaidentity.com:443');
  assert.ok(
    rendered.includes(Buffer.from('x-request-id: synthetic\r\nX-Assurance-Injected: true')),
  );
  assert.match(rendered.toString('utf8'), /^GET \/api\/admin\/organizations\//u);
});

test('should generate a valid limit-plus-one JSON body with exact byte cardinality', () => {
  const configuredLimit = 1_024;
  const request = materializeRawRequest(
    rawCase('st54-oversized-json'),
    fixtureValues,
    configuredLimit,
  );
  assert.equal(request.body.byteLength, configuredLimit + 1);
  assert.doesNotThrow(() => JSON.parse(request.body.toString('utf8')));
  assert.match(
    renderRawHttpRequest(request, '127.0.0.1:8443').toString('utf8'),
    /Content-Length: 1025\r\n/u,
  );
});

test('should reject unresolved placeholders and transport framing overrides', () => {
  assert.throws(
    () => materializeRawRequest(rawCase('st52-cross-tenant-slug-and-id'), {}, 1_024),
    /replacement|placeholder/u,
  );
  const request = materializeRawRequest(rawCase('st52-sql-query-value'), fixtureValues, 1_024);
  assert.throws(
    () => renderRawHttpRequest(request, 'attacker.invalid\r\nInjected: true'),
    /authority/u,
  );
});
