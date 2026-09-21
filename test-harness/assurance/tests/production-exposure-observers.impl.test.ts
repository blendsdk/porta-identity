/**
 * Implementation tests for the forwarding-context helper observers.
 *
 * These cover the pure decision logic that the live observers depend on: the
 * normalization of the public cookie policy and the interpretation of two
 * token-budget readings. They protect the boundary cases that the live suite
 * cannot reliably exercise, such as an exhausted rate-limit budget.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cookiePolicyKey,
  directPeerBudgetDecision,
  expectedPublicCookiePolicy,
} from '../production-exposure/forwarded-context-observers.js';

test('normalizes the security attributes of a public cookie', () => {
  const secureCookie = '_csrf=token; Path=/; HttpOnly; SameSite=Lax; Secure';
  assert.equal(cookiePolicyKey(secureCookie), expectedPublicCookiePolicy);

  assert.equal(cookiePolicyKey(''), 'absent');

  const missingSecure = '_csrf=token; Path=/; HttpOnly; SameSite=Lax';
  assert.equal(
    cookiePolicyKey(missingSecure),
    'secure=false;httponly=true;samesite-lax=true;domain=false',
  );

  const withDomain = '_csrf=token; Path=/; HttpOnly; SameSite=Lax; Secure; Domain=example.test';
  assert.equal(
    cookiePolicyKey(withDomain),
    'secure=true;httponly=true;samesite-lax=true;domain=true',
  );

  const sameSiteNone = '_csrf=token; Path=/; HttpOnly; SameSite=None; Secure';
  assert.equal(
    cookiePolicyKey(sameSiteNone),
    'secure=true;httponly=true;samesite-lax=false;domain=false',
  );
});

test('decides the rate-limit identity from two token-budget readings', () => {
  // The same peer with different forwarded values shares one decreasing budget.
  assert.equal(
    directPeerBudgetDecision({ status: 400, remaining: 29 }, { status: 400, remaining: 28 }),
    true,
  );

  // A client-controlled key restarts the budget, so the reading does not fall.
  assert.equal(
    directPeerBudgetDecision({ status: 400, remaining: 29 }, { status: 400, remaining: 29 }),
    false,
  );

  // An exhausted budget, a throttled response, a missing header, and a window
  // rollover are all inconclusive rather than a false identity failure.
  assert.equal(
    directPeerBudgetDecision({ status: 400, remaining: 0 }, { status: 400, remaining: 0 }),
    null,
  );
  assert.equal(
    directPeerBudgetDecision({ status: 429, remaining: 0 }, { status: 429, remaining: 0 }),
    null,
  );
  assert.equal(
    directPeerBudgetDecision(
      { status: 400, remaining: undefined },
      { status: 400, remaining: 28 },
    ),
    null,
  );
  assert.equal(
    directPeerBudgetDecision({ status: 400, remaining: 28 }, { status: 400, remaining: 29 }),
    null,
  );
});
