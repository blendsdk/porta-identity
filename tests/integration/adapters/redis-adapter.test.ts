/**
 * Redis adapter integration tests.
 *
 * Verifies the OIDC Redis adapter against a real Redis instance.
 * This adapter handles short-lived OIDC artifacts: Session, Interaction,
 * AuthorizationCode, ReplayDetection, ClientCredentials, PushedAuthorizationRequest.
 *
 * Tests cover: upsert+find with TTL, consume, destroy (with index cleanup),
 * revokeByGrantId, TTL expiration, findByUid, and non-existent lookups.
 *
 * Each test starts with a flushed Redis via flushTestRedis().
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { flushTestRedis } from '../helpers/redis.js';
import { getRedis } from '../../../src/lib/redis.js';
import { RedisAdapter } from '../../../src/oidc/redis-adapter.js';
import type { AdapterPayload } from '../../../src/oidc/postgres-adapter.js';

describe('Redis Adapter (Integration)', () => {
  beforeEach(async () => {
    await flushTestRedis();
  });

  // ── Upsert & Find ──────────────────────────────────────────────

  it('should upsert and find a Session with TTL', async () => {
    const adapter = new RedisAdapter('Session');
    const payload: AdapterPayload = {
      accountId: 'user-session-1',
      uid: 'uid-session-1',
      iat: Math.floor(Date.now() / 1000),
      kind: 'Session',
    };

    await adapter.upsert('sess-001', payload, 86400);
    const found = await adapter.find('sess-001');

    expect(found).toBeDefined();
    expect(found!.accountId).toBe('user-session-1');
    expect(found!.uid).toBe('uid-session-1');
    expect(found!.kind).toBe('Session');
  });

  it('should upsert and find an Interaction with TTL', async () => {
    const adapter = new RedisAdapter('Interaction');
    const payload: AdapterPayload = {
      uid: 'uid-interaction-1',
      iat: Math.floor(Date.now() / 1000),
      kind: 'Interaction',
      params: { client_id: 'test-client', scope: 'openid' },
    };

    await adapter.upsert('inter-001', payload, 3600);
    const found = await adapter.find('inter-001');

    expect(found).toBeDefined();
    expect(found!.uid).toBe('uid-interaction-1');
    // Nested payload data should be preserved
    expect(found!.params).toEqual({ client_id: 'test-client', scope: 'openid' });
  });

  it('should upsert and find an AuthorizationCode with TTL', async () => {
    const adapter = new RedisAdapter('AuthorizationCode');
    const payload: AdapterPayload = {
      accountId: 'user-authcode-1',
      clientId: 'client-authcode-1',
      grantId: 'grant-authcode-1',
      iat: Math.floor(Date.now() / 1000),
      kind: 'AuthorizationCode',
      scope: 'openid profile',
      redirectUri: 'http://localhost:3001/callback',
      codeChallenge: 'abc123',
      codeChallengeMethod: 'S256',
    };

    await adapter.upsert('ac-001', payload, 600);
    const found = await adapter.find('ac-001');

    expect(found).toBeDefined();
    expect(found!.accountId).toBe('user-authcode-1');
    expect(found!.grantId).toBe('grant-authcode-1');
    expect(found!.scope).toBe('openid profile');
  });

  // ── Consume ────────────────────────────────────────────────────

  it('should mark an artifact as consumed with a timestamp', async () => {
    const adapter = new RedisAdapter('AuthorizationCode');
    const payload: AdapterPayload = {
      accountId: 'user-consume',
      clientId: 'client-consume',
      iat: Math.floor(Date.now() / 1000),
      kind: 'AuthorizationCode',
    };

    await adapter.upsert('ac-consume', payload, 600);

    // Consume the code
    await adapter.consume('ac-consume');

    // Find should show consumed timestamp
    const found = await adapter.find('ac-consume');
    expect(found).toBeDefined();
    expect(found!.consumed).toBeDefined();
    expect(typeof found!.consumed).toBe('number');
    expect(found!.consumed).toBeGreaterThan(0);
  });

  // ── Destroy ────────────────────────────────────────────────────

  it('should destroy an artifact and clean up index keys', async () => {
    const adapter = new RedisAdapter('Session');
    const payload: AdapterPayload = {
      accountId: 'user-destroy',
      uid: 'uid-destroy',
      iat: Math.floor(Date.now() / 1000),
      kind: 'Session',
    };

    await adapter.upsert('sess-destroy', payload, 86400);

    // Verify both main key and uid index exist
    const redis = getRedis();
    expect(await redis.exists('oidc:Session:sess-destroy')).toBe(1);
    expect(await redis.exists('oidc:Session:uid:uid-destroy')).toBe(1);

    // Destroy the session
    await adapter.destroy('sess-destroy');

    // Both main key and uid index should be removed
    expect(await redis.exists('oidc:Session:sess-destroy')).toBe(0);
    expect(await redis.exists('oidc:Session:uid:uid-destroy')).toBe(0);
    // find should return undefined
    expect(await adapter.find('sess-destroy')).toBeUndefined();
  });

  // ── Revoke by Grant ID ─────────────────────────────────────────

  it('should revoke all artifacts associated with a grant', async () => {
    const adapter = new RedisAdapter('AuthorizationCode');
    const sharedGrantId = 'grant-redis-revoke';

    // Insert two artifacts with the same grantId
    await adapter.upsert('ac-revoke-1', {
      accountId: 'user-1',
      clientId: 'client-1',
      grantId: sharedGrantId,
      kind: 'AuthorizationCode',
    }, 600);

    await adapter.upsert('ac-revoke-2', {
      accountId: 'user-1',
      clientId: 'client-1',
      grantId: sharedGrantId,
      kind: 'AuthorizationCode',
    }, 600);

    // Insert an artifact with a DIFFERENT grantId — should survive
    await adapter.upsert('ac-keep', {
      accountId: 'user-2',
      clientId: 'client-2',
      grantId: 'grant-other',
      kind: 'AuthorizationCode',
    }, 600);

    // Revoke all artifacts for the shared grantId
    await adapter.revokeByGrantId(sharedGrantId);

    // Both artifacts should be gone
    expect(await adapter.find('ac-revoke-1')).toBeUndefined();
    expect(await adapter.find('ac-revoke-2')).toBeUndefined();
    // Artifact with different grantId should survive
    expect(await adapter.find('ac-keep')).toBeDefined();
  });

  // ── TTL Expiration ─────────────────────────────────────────────

  it('should expire a key after its TTL elapses', async () => {
    const adapter = new RedisAdapter('AuthorizationCode');

    // Use a very short TTL (1 second) to test expiration
    await adapter.upsert('ac-expire', {
      accountId: 'user-expire',
      kind: 'AuthorizationCode',
    }, 1);

    // Should exist immediately
    const before = await adapter.find('ac-expire');
    expect(before).toBeDefined();

    // Wait for TTL to elapse (1.5 seconds)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Should be expired now
    const after = await adapter.find('ac-expire');
    expect(after).toBeUndefined();
  });

  // ── Find by UID ────────────────────────────────────────────────

  it('should find a session by UID via index key', async () => {
    const adapter = new RedisAdapter('Session');
    const uid = 'uid-lookup-test';
    const payload: AdapterPayload = {
      accountId: 'user-uid-lookup',
      uid,
      iat: Math.floor(Date.now() / 1000),
      kind: 'Session',
    };

    await adapter.upsert('sess-uid-lookup', payload, 86400);

    // findByUid should resolve the UID index → main key → full payload
    const found = await adapter.findByUid(uid);
    expect(found).toBeDefined();
    expect(found!.accountId).toBe('user-uid-lookup');
    expect(found!.uid).toBe(uid);
  });

  // ── Find Non-Existent ──────────────────────────────────────────

  it('should return undefined for a non-existent key', async () => {
    const adapter = new RedisAdapter('Session');
    const found = await adapter.find('non-existent-session');
    expect(found).toBeUndefined();
  });
});
