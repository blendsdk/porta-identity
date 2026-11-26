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
  DeviceCodeConflictError,
  PostgresAdapter,
} from '../../../src/oidc/postgres-adapter.js';
import {
  applyDeviceAuthorizationInterval,
  resolveInteractionOrganization,
} from '../../../src/oidc/provider.js';

/** Replace the pool with one resolving query. */
function mockResolvedQuery(rows: Record<string, unknown>[] = []): ReturnType<typeof vi.fn> {
  const query = vi.fn().mockResolvedValue({ rows, rowCount: rows.length });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query });
  return query;
}

/** Replace the pool with one query returning a controlled row count. */
function mockRowCountQuery(rowCount: number): ReturnType<typeof vi.fn> {
  const query = vi.fn().mockResolvedValue({ rows: rowCount > 0 ? [{ id: 'row' }] : [], rowCount });
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

describe('DeviceCode conditional confirmation write', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('guards only the pre-approval confirmation transition', async () => {
    const query = mockRowCountQuery(1);
    const adapter = new PostgresAdapter('DeviceCode');
    await adapter.upsert('device-1', { inFlight: true }, 600);

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('UPDATE oidc_payloads');
    expect(sql).toContain("payload->>'inFlight' IS DISTINCT FROM 'true'");
    expect(sql).toContain('consumed_at IS NULL');
    expect(sql).toContain("payload->>'error' IS NULL");
    expect(sql).not.toContain('INSERT INTO oidc_payloads');
  });

  it('rejects the second pre-approval transition with a re-render conflict', async () => {
    mockRowCountQuery(0);
    const adapter = new PostgresAdapter('DeviceCode');
    await expect(adapter.upsert('device-1', { inFlight: true }, 600)).rejects.toBeInstanceOf(
      DeviceCodeConflictError,
    );
  });

  it('allows the completion save with an account and grant through the generic upsert', async () => {
    const query = mockRowCountQuery(1);
    const adapter = new PostgresAdapter('DeviceCode');
    await adapter.upsert(
      'device-1',
      { inFlight: true, accountId: 'user-1', grantId: 'grant-1' },
      600,
    );

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('INSERT INTO oidc_payloads');
    expect(sql).toContain('ON CONFLICT');
  });

  it('allows a pre-approval error save and ignores it after approval', async () => {
    const query = mockRowCountQuery(0);
    const adapter = new PostgresAdapter('DeviceCode');
    await expect(
      adapter.upsert(
        'device-1',
        { inFlight: true, error: 'access_denied', errorDescription: 'denied' },
        600,
      ),
    ).resolves.toBeUndefined();

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("payload->>'accountId' IS NULL");
    expect(sql).toContain("payload->>'grantId' IS NULL");
    // The approved concurrent-approval policy lets a user denial replace a pending confirmation
    // claim while the code is still unapproved; only an approved row is protected.
    expect(sql).not.toContain("payload->>'inFlight' IS DISTINCT FROM 'true'");
    expect(sql).not.toContain('INSERT INTO oidc_payloads');
  });
});

describe('interaction organization resolution', () => {
  it('prefers the provider-shaped client organization string', () => {
    expect(
      resolveInteractionOrganization({
        oidc: { client: { organizationId: 'client-organization' } },
        req: { _portaOrganization: { id: 'request-organization' } },
      }),
    ).toBe('client-organization');
  });

  it('falls back to the request organization when no client is loaded', () => {
    expect(
      resolveInteractionOrganization({
        req: { _portaOrganization: { id: 'request-organization' } },
      }),
    ).toBe('request-organization');
    expect(
      resolveInteractionOrganization({
        oidc: { client: { organizationId: 42 } },
        req: { _portaOrganization: { id: 'request-organization' } },
      }),
    ).toBe('request-organization');
  });

  it('returns undefined when neither source is valid', () => {
    expect(resolveInteractionOrganization(undefined)).toBeUndefined();
    expect(resolveInteractionOrganization({ oidc: {} })).toBeUndefined();
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
