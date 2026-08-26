/**
 * PostgreSQL adapter integration tests.
 *
 * Verifies the OIDC PostgreSQL adapter against a real PostgreSQL instance.
 * This adapter handles long-lived OIDC artifacts: AccessToken, RefreshToken, Grant.
 *
 * Tests cover: upsert+find, consume, destroy, revokeByGrantId, non-existent
 * lookups, and upsert-replaces-existing behavior.
 *
 * Each test starts with a clean slate via truncateAllTables() + seedBaseData().
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { PostgresAdapter } from '../../../src/oidc/postgres-adapter.js';
import type { AdapterPayload } from '../../../src/oidc/postgres-adapter.js';

describe('PostgreSQL Adapter (Integration)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
  });

  // ── Upsert & Find ──────────────────────────────────────────────

  it('should upsert and find an AccessToken by ID', async () => {
    const adapter = new PostgresAdapter('AccessToken');
    const payload: AdapterPayload = {
      accountId: 'user-123',
      clientId: 'client-abc',
      grantId: 'grant-001',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      kind: 'AccessToken',
      scope: 'openid profile',
    };

    await adapter.upsert('at-001', payload, 3600);
    const found = await adapter.find('at-001');

    expect(found).toBeDefined();
    expect(found!.accountId).toBe('user-123');
    expect(found!.clientId).toBe('client-abc');
    expect(found!.grantId).toBe('grant-001');
    expect(found!.scope).toBe('openid profile');
  });

  it('should upsert and find a RefreshToken by ID', async () => {
    const adapter = new PostgresAdapter('RefreshToken');
    const payload: AdapterPayload = {
      accountId: 'user-456',
      clientId: 'client-def',
      grantId: 'grant-002',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 2592000,
      kind: 'RefreshToken',
      scope: 'openid',
    };

    await adapter.upsert('rt-001', payload, 2592000);
    const found = await adapter.find('rt-001');

    expect(found).toBeDefined();
    expect(found!.accountId).toBe('user-456');
    expect(found!.kind).toBe('RefreshToken');
  });

  it('should upsert and find a Grant by ID', async () => {
    const adapter = new PostgresAdapter('Grant');
    const payload: AdapterPayload = {
      accountId: 'user-789',
      clientId: 'client-ghi',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 2592000,
      kind: 'Grant',
      openid: { scope: 'openid profile email' },
    };

    await adapter.upsert('grant-003', payload, 2592000);
    const found = await adapter.find('grant-003');

    expect(found).toBeDefined();
    expect(found!.accountId).toBe('user-789');
    expect(found!.kind).toBe('Grant');
    // Verify nested payload data preserved
    expect(found!.openid).toEqual({ scope: 'openid profile email' });
  });

  // ── Consume ────────────────────────────────────────────────────

  it('should mark a token as consumed and reflect consumed timestamp', async () => {
    const adapter = new PostgresAdapter('AccessToken');
    const payload: AdapterPayload = {
      accountId: 'user-consume',
      clientId: 'client-consume',
      iat: Math.floor(Date.now() / 1000),
      kind: 'AccessToken',
    };

    await adapter.upsert('at-consume', payload, 3600);

    // Consume the token
    await adapter.consume('at-consume');

    // Find should return the payload with a `consumed` timestamp
    const found = await adapter.find('at-consume');
    expect(found).toBeDefined();
    expect(found!.consumed).toBeDefined();
    // consumed should be an epoch timestamp (seconds)
    expect(typeof found!.consumed).toBe('number');
    expect(found!.consumed).toBeGreaterThan(0);
  });

  // ── Destroy ────────────────────────────────────────────────────

  it('should destroy a token by ID so find returns undefined', async () => {
    const adapter = new PostgresAdapter('AccessToken');
    const payload: AdapterPayload = {
      accountId: 'user-destroy',
      clientId: 'client-destroy',
      iat: Math.floor(Date.now() / 1000),
      kind: 'AccessToken',
    };

    await adapter.upsert('at-destroy', payload, 3600);

    // Verify it exists
    const before = await adapter.find('at-destroy');
    expect(before).toBeDefined();

    // Destroy it
    await adapter.destroy('at-destroy');

    // Verify it's gone
    const after = await adapter.find('at-destroy');
    expect(after).toBeUndefined();
  });

  // ── Revoke by Grant ID ─────────────────────────────────────────

  it('should revoke all tokens associated with a grant', async () => {
    const adapter = new PostgresAdapter('AccessToken');
    const sharedGrantId = 'grant-revoke-test';

    // Insert two tokens sharing the same grantId
    await adapter.upsert('at-revoke-1', {
      accountId: 'user-1',
      clientId: 'client-1',
      grantId: sharedGrantId,
      kind: 'AccessToken',
    }, 3600);

    await adapter.upsert('at-revoke-2', {
      accountId: 'user-1',
      clientId: 'client-1',
      grantId: sharedGrantId,
      kind: 'AccessToken',
    }, 3600);

    // Insert a token with a DIFFERENT grantId — should NOT be revoked
    await adapter.upsert('at-keep', {
      accountId: 'user-2',
      clientId: 'client-2',
      grantId: 'grant-other',
      kind: 'AccessToken',
    }, 3600);

    // Revoke by the shared grant ID
    await adapter.revokeByGrantId(sharedGrantId);

    // Both tokens with the shared grantId should be gone
    expect(await adapter.find('at-revoke-1')).toBeUndefined();
    expect(await adapter.find('at-revoke-2')).toBeUndefined();
    // Token with a different grantId should survive
    expect(await adapter.find('at-keep')).toBeDefined();
  });

  // ── Find Non-Existent ──────────────────────────────────────────

  it('should return undefined for a non-existent token', async () => {
    const adapter = new PostgresAdapter('AccessToken');
    const found = await adapter.find('non-existent-id');
    expect(found).toBeUndefined();
  });

  // ── Upsert Replaces Existing ───────────────────────────────────

  it('should replace payload when upserting with the same ID', async () => {
    const adapter = new PostgresAdapter('AccessToken');

    // First upsert
    await adapter.upsert('at-replace', {
      accountId: 'user-original',
      clientId: 'client-original',
      kind: 'AccessToken',
      scope: 'openid',
    }, 3600);

    // Second upsert with same ID — should overwrite
    await adapter.upsert('at-replace', {
      accountId: 'user-updated',
      clientId: 'client-updated',
      kind: 'AccessToken',
      scope: 'openid profile email',
    }, 7200);

    const found = await adapter.find('at-replace');
    expect(found).toBeDefined();
    // Payload should reflect the second upsert
    expect(found!.accountId).toBe('user-updated');
    expect(found!.clientId).toBe('client-updated');
    expect(found!.scope).toBe('openid profile email');
  });
});
