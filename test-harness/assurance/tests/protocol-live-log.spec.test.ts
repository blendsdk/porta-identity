/** Focused behavior specs for structured protocol-security log parsing. */

import assert from 'node:assert/strict';
import test from 'node:test';

import { parseProtocolSecurityLog } from './protocol-live-log.js';

const requestId = 'request-11111111-1111-4111-8111-111111111111';

/** One complete structured rejection record as emitted by the harness logger. */
function record(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    level: 40,
    time: 1_700_000_000_000,
    pid: 1,
    hostname: 'porta',
    event: 'protocol-security-rejection',
    'synthetic-correlation-id': requestId,
    'event-class': 'token-grant-rejected',
    'public-client-id-digest': 'digest',
    msg: 'protocol-security-rejection',
    ...overrides,
  });
}

test('returns the actual field names of exactly one correlated event', () => {
  const parsed = parseProtocolSecurityLog(
    `porta-1  | ${record()}\nporta-1  | ${JSON.stringify({ level: 30, msg: 'unrelated' })}`,
    requestId,
    [],
  );

  assert.equal(parsed.event, 'protocol-security-rejection');
  for (const field of [
    'event',
    'synthetic-correlation-id',
    'event-class',
    'public-client-id-digest',
    'msg',
  ]) {
    assert.ok(parsed.fields.includes(field), field);
  }
});

test('rejects a missing correlated event', () => {
  assert.throws(
    () => parseProtocolSecurityLog(record({ 'synthetic-correlation-id': 'other' }), requestId, []),
    /absent or ambiguous/,
  );
});

test('rejects more than one correlated event', () => {
  assert.throws(
    () => parseProtocolSecurityLog(`${record()}\n${record()}`, requestId, []),
    /absent or ambiguous/,
  );
});

test('rejects a malformed JSON line even when it contains the request id', () => {
  assert.throws(
    () => parseProtocolSecurityLog(`not-json ${requestId}`, requestId, []),
    /absent or ambiguous/,
  );
});

test('rejects a forbidden artifact anywhere in the raw logs', () => {
  assert.throws(
    () => parseProtocolSecurityLog(`${record()} authorization-code=secret`, requestId, ['secret']),
    /forbidden artifact/,
  );
});

test('rejects an absent request correlation', () => {
  assert.throws(() => parseProtocolSecurityLog(record(), '', []), /omitted correlation/);
});
