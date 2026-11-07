/** Focused behavior specs for fail-closed recovery observations. */

import assert from 'node:assert/strict';
import test from 'node:test';

import { requireRecovery, withRecovery } from './oidc-token-cases-live-support.js';
import {
  clientStateRejected,
  PROTOCOL_RECOVERY,
  newGrant,
  requireStateUnchanged,
  sameGrant,
  sessionEnded,
  tenantTokenContextsValid,
} from './protocol-live-recovery.js';
import type { LiveUserState } from './protocol-live-http.js';

/** One bounded state with a session and one connected app. */
function state(overrides: Partial<LiveUserState> = {}): LiveUserState {
  return {
    activeSessions: [
      {
        sessionId: 'session-1',
        userId: '22222222-2222-4222-8222-222222222222',
        clientId: null,
        organizationId: null,
        grantId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-01-02T00:00:00.000Z',
        revokedAt: null,
      },
    ],
    connectedApps: [
      {
        grantId: 'grant-1',
        clientId: 'client-1',
        clientName: 'Client',
        applicationId: '33333333-3333-4333-8333-333333333333',
        scopes: ['openid', 'profile'],
        createdAt: '2026-01-01T00:00:00.000Z',
        expiresAt: null,
      },
    ],
    ...overrides,
  };
}

test('requireRecovery fails closed when a probe has no verified recovery', () => {
  assert.throws(() => requireRecovery({ facts: {} }), /recovery observation is absent/);
  assert.equal(
    requireRecovery(withRecovery({ facts: {} }, PROTOCOL_RECOVERY.originalInteraction)),
    PROTOCOL_RECOVERY.originalInteraction,
  );
});

test('newGrant accepts exactly one new grant and rejects zero or two', () => {
  const before = state();
  const one = state({
    connectedApps: [
      ...before.connectedApps,
      {
        ...before.connectedApps[0]!,
        grantId: 'grant-2',
        createdAt: '2026-01-01T00:00:01.000Z',
      },
    ],
  });
  assert.equal(newGrant(before, one, 'client-1').grantId, 'grant-2');
  assert.throws(() => newGrant(before, before, 'client-1'), /exactly one new/);
  const two = state({
    connectedApps: [
      ...one.connectedApps,
      {
        ...before.connectedApps[0]!,
        grantId: 'grant-3',
        createdAt: '2026-01-01T00:00:02.000Z',
      },
    ],
  });
  assert.throws(() => newGrant(before, two, 'client-1'), /exactly one new/);
});

test('sameGrant compares every stable field', () => {
  const grant = state().connectedApps[0]!;
  assert.equal(sameGrant(grant, grant), true);
  assert.equal(sameGrant(grant, undefined), false);
  assert.equal(sameGrant(grant, { ...grant, grantId: 'other' }), false);
  assert.equal(sameGrant(grant, { ...grant, scopes: ['openid'] }), false);
});

test('sessionEnded requires a non-empty before set and no surviving session', () => {
  assert.equal(sessionEnded(['a'], ['b']), true);
  assert.equal(sessionEnded(['a'], ['a']), false);
  assert.equal(sessionEnded([], []), false);
});

test('tenant token contexts reject any cross-context acceptance', () => {
  assert.equal(tenantTokenContextsValid(true, false, true, false), true);
  assert.equal(tenantTokenContextsValid(false, false, true, false), false);
  assert.equal(tenantTokenContextsValid(true, true, true, false), false);
  assert.equal(tenantTokenContextsValid(true, false, false, false), false);
  assert.equal(tenantTokenContextsValid(true, false, true, true), false);
});

test('requireStateUnchanged accepts an identical session and grant state', () => {
  assert.doesNotThrow(() => requireStateUnchanged(state(), state()));
});

test('client state comparison rejects only a mismatching callback', () => {
  assert.equal(clientStateRejected('client-expected', 'attacker-state'), true);
  assert.equal(clientStateRejected('client-expected', 'client-expected'), false);
});

test('requireStateUnchanged rejects a changed session set', () => {
  assert.throws(
    () => requireStateUnchanged(state(), state({ activeSessions: [] })),
    /session state/,
  );
});

test('requireStateUnchanged rejects a changed grant scope set', () => {
  const changed = state({
    connectedApps: [
      {
        ...state().connectedApps[0]!,
        scopes: ['openid', 'profile', 'email'],
      },
    ],
  });
  assert.throws(() => requireStateUnchanged(state(), changed), /consent state/);
});
