import assert from 'node:assert/strict';
import test from 'node:test';

import {
  configuredLifetimeObserved,
  humanAuthDiagnostic,
  independentTotpValue,
  pollForExactHumanAuthMailValue,
  publicStateUnchanged,
} from './human-auth-live-observers.js';

test('should poll until one exact mailbox value is available', async () => {
  let reads = 0;
  const result = await pollForExactHumanAuthMailValue({
    timeoutMilliseconds: 100,
    intervalMilliseconds: 1,
    read: async () => {
      reads += 1;
      return reads === 1 ? { count: 0, bodies: [] } : { count: 1, bodies: ['Code 123456'] };
    },
    extract: (body) => [...body.matchAll(/\b(\d{6})\b/gu)].flatMap((match) => match[1] ?? []),
  });
  assert.deepEqual(result, { value: '123456', deliveryCount: 1 });
  assert.equal(reads, 2);
});

test('should reject duplicate messages and ambiguous values without disclosing them', async () => {
  await assert.rejects(
    pollForExactHumanAuthMailValue({
      timeoutMilliseconds: 20,
      intervalMilliseconds: 1,
      read: async () => ({ count: 2, bodies: ['Code 111111', 'Code 222222'] }),
      extract: () => [],
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, 'HUMAN_AUTH_LIVE_OBSERVER_FAILED: mail-cardinality-invalid');
      assert.doesNotMatch(error.message, /111111|222222/u);
      return true;
    },
  );
});

test('should compare only canonical public-state fingerprints', () => {
  const first = `sha256:${'a'.repeat(64)}`;
  const second = `sha256:${'b'.repeat(64)}`;
  assert.equal(publicStateUnchanged(first, first), true);
  assert.equal(publicStateUnchanged(first, second), false);
  assert.throws(() => publicStateUnchanged('raw-public-state', first), /public-state-unavailable/u);
});

test('should validate configured lifetimes against predeclared clock tolerance', () => {
  const issued = Date.UTC(2026, 7, 20, 0, 0, 0);
  assert.equal(configuredLifetimeObserved(issued, issued + 600_000, 600, 1), true);
  assert.equal(configuredLifetimeObserved(issued, issued + 605_000, 600, 1), false);
  assert.throws(
    () => configuredLifetimeObserved(issued, issued + 600_000, 0, 1),
    /configured-window-invalid/u,
  );
});

test('should generate distinct current and expired-window authenticator values', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const now = Date.UTC(2026, 7, 20, 0, 0, 0);
  const current = independentTotpValue(secret, now);
  const expired = independentTotpValue(secret, now - 120_000);
  assert.match(current, /^\d{6}$/u);
  assert.match(expired, /^\d{6}$/u);
  assert.notEqual(current, expired);
});

test('should emit only the closed diagnostic vocabulary', () => {
  assert.equal(
    humanAuthDiagnostic('mail-value-invalid'),
    'HUMAN_AUTH_LIVE_OBSERVER_FAILED: mail-value-invalid',
  );
  assert.doesNotMatch(humanAuthDiagnostic('public-state-unavailable'), /password|token|secret/iu);
});
