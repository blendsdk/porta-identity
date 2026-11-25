/**
 * Implementation tests for DeviceCode adapter retention and collision mapping.
 *
 * These tests pin internals that the HTTP specification cannot observe
 * deterministically: the extra retention window, the never-expiring zero-TTL
 * guard, the exact unique-index mapping, and the interval listener's
 * single-field mutation.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
import {
  DEVICE_CODE_RETENTION_SECONDS,
  DeviceCodeCollisionError,
  PostgresAdapter,
} from '../../../src/oidc/postgres-adapter.js';
import { applyDeviceAuthorizationInterval } from '../../../src/oidc/provider.js';

/** Replace the pool with one resolving query. */
function mockResolvedQuery(rows: Record<string, unknown>[] = []): ReturnType<typeof vi.fn> {
  const query = vi.fn().mockResolvedValue({ rows, rowCount: rows.length });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query });
  return query;
}

/** Read the expires_at argument from an upsert call. */
function expiresArgument(query: ReturnType<typeof vi.fn>): unknown {
  const params = query.mock.calls[0]?.[1];
  if (!Array.isArray(params)) throw new Error('Expected upsert parameters');
  return params[6];
}

describe('DeviceCode adapter retention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retains a DeviceCode row for 900 seconds beyond the provider lifetime', async () => {
    const query = mockResolvedQuery();
    const adapter = new PostgresAdapter('DeviceCode');
    const before = Date.now();
    await adapter.upsert('device-1', { userCode: 'BCDFGHJK' }, 600);
    const after = Date.now();

    const expiresAt = expiresArgument(query);
    expect(expiresAt).toBeInstanceOf(Date);
    if (!(expiresAt instanceof Date)) throw new Error('Expected a Date');
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + (600 + DEVICE_CODE_RETENTION_SECONDS) * 1000,
    );
    expect(expiresAt.getTime()).toBeLessThanOrEqual(
      after + (600 + DEVICE_CODE_RETENTION_SECONDS) * 1000,
    );
  });

  it.each([0, -10, Number.NaN, Number.POSITIVE_INFINITY])(
    'never stores a non-expiring DeviceCode for TTL %s',
    async (ttl) => {
      const query = mockResolvedQuery();
      const adapter = new PostgresAdapter('DeviceCode');
      const before = Date.now();
      await adapter.upsert('device-1', { userCode: 'BCDFGHJK' }, ttl);

      const expiresAt = expiresArgument(query);
      expect(expiresAt).toBeInstanceOf(Date);
      if (!(expiresAt instanceof Date)) throw new Error('Expected a Date');
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + DEVICE_CODE_RETENTION_SECONDS * 1000,
      );
      expect(expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + DEVICE_CODE_RETENTION_SECONDS * 1000,
      );
    },
  );

  it('keeps the existing null-expiry behavior for other models', async () => {
    const query = mockResolvedQuery();
    const adapter = new PostgresAdapter('AccessToken');
    await adapter.upsert('token-1', {}, 0);
    expect(expiresArgument(query)).toBeNull();
  });

  it('maps only the DeviceCode user-code index violation to the public 503', async () => {
    const adapter = new PostgresAdapter('DeviceCode');
    const collision = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      constraint: 'idx_oidc_payloads_device_user_code',
    });
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue({
      query: vi.fn().mockRejectedValue(collision),
    });

    await expect(adapter.upsert('device-1', { userCode: 'BCDFGHJK' }, 600)).rejects.toBeInstanceOf(
      DeviceCodeCollisionError,
    );

    const other = new PostgresAdapter('AccessToken');
    await expect(other.upsert('token-1', {}, 600)).rejects.toBe(collision);
  });

  it('does not map an unrelated unique violation on a DeviceCode row', async () => {
    const adapter = new PostgresAdapter('DeviceCode');
    const collision = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      constraint: 'some_other_index',
    });
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue({
      query: vi.fn().mockRejectedValue(collision),
    });

    await expect(adapter.upsert('device-1', { userCode: 'BCDFGHJK' }, 600)).rejects.toBe(collision);
  });

  it('keeps the retained-row filter on find and findByUserCode', async () => {
    const query = mockResolvedQuery();
    const adapter = new PostgresAdapter('DeviceCode');
    await adapter.find('device-1');
    await adapter.findByUserCode('BCDFGHJK');

    for (const call of query.mock.calls) {
      expect(String(call[0])).toContain('expires_at > NOW()');
    }
  });
});

describe('device authorization interval listener', () => {
  it('mutates only the interval field', () => {
    const body = { device_code: 'opaque', user_code: 'BCDF-GHJK', expires_in: 600, interval: 1 };
    applyDeviceAuthorizationInterval({}, body);
    expect(body).toEqual({
      device_code: 'opaque',
      user_code: 'BCDF-GHJK',
      expires_in: 600,
      interval: 5,
    });
  });

  it('ignores a non-record response body', () => {
    expect(() => applyDeviceAuthorizationInterval({}, undefined)).not.toThrow();
    expect(() => applyDeviceAuthorizationInterval({}, 'unexpected')).not.toThrow();
    expect(() => applyDeviceAuthorizationInterval({}, null)).not.toThrow();
  });
});
