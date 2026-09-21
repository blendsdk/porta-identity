import assert from 'node:assert/strict';
import test from 'node:test';

import {
  correlateByRequestId,
  findExposedForbiddenFields,
  parseDecisionLog,
  projectObservedFields,
  readSymbolicField,
  unprojectedFields,
} from '../p1/decision-log.js';

const REQUEST_ID = '11111111-1111-1111-1111-111111111111';
const ACTOR_REF = `hmac-sha256:${'a'.repeat(64)}`;
const TARGET_REF = `hmac-sha256:${'b'.repeat(64)}`;

/** One covered admin permission-denial decision line with a protected target digest. */
const adminDenialLine = JSON.stringify({
  level: 30,
  time: 1_789_980_000_000,
  securityDecision: {
    schemaVersion: 1,
    eventName: 'security.decision.v1',
    occurredAt: '2026-09-21T00:00:00.000Z',
    requestId: REQUEST_ID,
    surface: 'admin-api',
    method: 'GET',
    routeTemplate: '/api/admin/audit',
    statusCode: 403,
    outcome: 'deny',
    decisionPoint: 'permission',
    reasonCode: 'permission-required',
    referenceKeyId: 'sha256:aaaaaaaaaaaaaaaa',
    actorRef: ACTOR_REF,
    resourceRef: TARGET_REF,
    detail: { permissions: ['admin:audit:read'] },
  },
  msg: 'security.decision.v1',
});

/** One operational completion line for a request outside the security decision surfaces. */
const completionLine = JSON.stringify({
  level: 30,
  time: 1_789_980_000_001,
  requestId: '22222222-2222-2222-2222-222222222222',
  method: 'GET',
  routeTemplate: '/health',
  status: 200,
  msg: 'HTTP request completed',
});

const ADMIN_FIELDS = [
  'synthetic-correlation-id',
  'actor-id',
  'action',
  'target-id-digest',
  'result',
] as const;
const GENERIC_FIELDS = [
  'synthetic-correlation-id',
  'event-class',
  'public-method',
  'public-route-class',
  'public-outcome-class',
] as const;

test('projects every administrative denial field from one correlated decision', () => {
  const records = parseDecisionLog(adminDenialLine);
  assert.equal(records.length, 1);
  const [record] = records;
  assert.equal(record.kind, 'security-decision');
  assert.equal(record.requestId, REQUEST_ID);

  assert.deepEqual(projectObservedFields(record, ADMIN_FIELDS), [...ADMIN_FIELDS]);
  assert.equal(readSymbolicField(record, 'actor-id'), ACTOR_REF);
  assert.equal(readSymbolicField(record, 'target-id-digest'), TARGET_REF);
  assert.equal(readSymbolicField(record, 'action'), 'admin:audit:read');
  assert.equal(readSymbolicField(record, 'result'), 'deny');
});

test('reports only the fields a record actually carries', () => {
  const withoutTarget = parseDecisionLog(
    JSON.stringify({
      securityDecision: {
        eventName: 'security.decision.v1',
        requestId: REQUEST_ID,
        surface: 'admin-api',
        method: 'GET',
        routeTemplate: '/api/admin/audit',
        statusCode: 403,
        outcome: 'deny',
        reasonCode: 'permission-required',
        actorRef: ACTOR_REF,
      },
    }),
  );
  assert.equal(withoutTarget.length, 1);
  assert.deepEqual(unprojectedFields(withoutTarget[0], ADMIN_FIELDS), ['target-id-digest']);
  assert.deepEqual(projectObservedFields(withoutTarget[0], ADMIN_FIELDS), [
    'synthetic-correlation-id',
    'actor-id',
    'action',
    'result',
  ]);
});

test('projects generic correlation fields from an operational completion record', () => {
  const records = parseDecisionLog(completionLine);
  assert.equal(records.length, 1);
  const [record] = records;
  assert.equal(record.kind, 'request-completion');
  assert.deepEqual(projectObservedFields(record, GENERIC_FIELDS), [...GENERIC_FIELDS]);
  assert.equal(readSymbolicField(record, 'public-outcome-class'), 'allow');
});

test('correlates records only by the exact request identifier', () => {
  const records = parseDecisionLog(`${adminDenialLine}\n${completionLine}`);
  assert.equal(correlateByRequestId(records, REQUEST_ID).length, 1);
  assert.equal(correlateByRequestId(records, 'other').length, 0);
  assert.equal(correlateByRequestId(records, '').length, 0);
});

test('skips human-readable and malformed lines without throwing', () => {
  const text = ['[00:00:00.000] INFO: starting porta', '{not json', adminDenialLine, ''].join('\n');
  const records = parseDecisionLog(text);
  assert.equal(records.length, 1);
  assert.equal(records[0].requestId, REQUEST_ID);
});

test('reports forbidden fields whose pattern matches retained text', () => {
  const exposed = findExposedForbiddenFields('leaked PRIVATE KEY and token abc', {
    'private-signing-key': /PRIVATE KEY/u,
    'opaque-token': /token [a-z]+/u,
    'personal-data': /@example\.com/u,
  });
  assert.deepEqual(exposed, ['opaque-token', 'private-signing-key']);
});
