/**
 * Specification tests for RFC 8628 provider discovery and DeviceCode storage.
 *
 * These assertions derive from the approved device-authorization requirements:
 * the native provider feature must advertise the device authorization endpoint
 * and grant, return the fixed authorization response, and persist a retained
 * DeviceCode without device-network metadata.
 */

import { describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import {
  DEVICE_CODE_GRANT,
  postForm,
  readJson,
  readString,
  useDeviceFixture,
} from './device-fixtures.js';

/** Discovery documents that must advertise the same device endpoint. */
const DISCOVERY_PATHS = [
  '.well-known/openid-configuration',
  '.well-known/oauth-authorization-server',
] as const;

/** Provider user-code alphabet and mask. */
const USER_CODE_PATTERN = /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/;

/** Normalized user code stored in the adapter column. */
const NORMALIZED_USER_CODE_PATTERN = /^[BCDFGHJKLMNPQRSTVWXZ]{8}$/;

/** Database row shape needed by the storage assertions. */
interface StoredDeviceCode {
  readonly payload: Record<string, unknown>;
  readonly userCode: string;
  readonly expiresAt: Date;
  readonly secondsUntilExpiry: number;
}

/** Read one required finite number from a stored provider payload. */
function readPayloadNumber(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Expected DeviceCode payload field ${key} to be a finite number`);
  }
  return value;
}

/** Read the stored DeviceCode row by its normalized user code. */
async function readStoredDeviceCode(normalizedUserCode: string): Promise<StoredDeviceCode> {
  const result = await getPool().query<{
    payload: Record<string, unknown>;
    user_code: string;
    expires_at: Date;
    seconds_until_expiry: string;
  }>(
    `SELECT payload, user_code, expires_at,
            EXTRACT(EPOCH FROM (expires_at - NOW()))::text AS seconds_until_expiry
       FROM oidc_payloads
      WHERE type = 'DeviceCode' AND user_code = $1`,
    [normalizedUserCode],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Expected the device authorization to store a DeviceCode row');
  return {
    payload: row.payload,
    userCode: row.user_code,
    expiresAt: row.expires_at,
    secondsUntilExpiry: Number(row.seconds_until_expiry),
  };
}

describe('Device authorization discovery and storage', () => {
  const fixture = useDeviceFixture();

  it('advertises the device authorization endpoint and grant in both discovery documents', async () => {
    const current = fixture();
    for (const discoveryPath of DISCOVERY_PATHS) {
      const response = await current.request(`/${current.organization.slug}/${discoveryPath}`);
      expect(response.status).toBe(200);
      const document = await readJson(response);

      expect(document.issuer).toBe(current.issuer);
      expect(document.device_authorization_endpoint).toBe(`${current.issuer}/device/auth`);
      expect(document.grant_types_supported).toEqual(
        expect.arrayContaining([DEVICE_CODE_GRANT]),
      );
      expect(document.authorization_endpoint).toBe(`${current.issuer}/auth`);
      expect(document.token_endpoint).toBe(`${current.issuer}/token`);
    }
  });

  it('returns the RFC 8628 device authorization response with a fixed interval', async () => {
    const current = fixture();
    const response = await current.request(
      `/${current.organization.slug}/device/auth`,
      postForm({ client_id: current.client.clientId, scope: 'openid profile offline_access' }),
    );

    if (response.status !== 200) {
      throw new Error(`Device authorization failed: ${await response.clone().text()}`);
    }
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(readString(body, 'device_code').length).toBeGreaterThan(0);
    expect(readString(body, 'user_code')).toMatch(USER_CODE_PATTERN);
    expect(body.expires_in).toBe(600);
    expect(body.interval).toBe(5);
    expect(body.verification_uri).toBe(`${current.issuer}/device`);
    expect(body.verification_uri_complete).toBe(
      `${current.issuer}/device?user_code=${encodeURIComponent(readString(body, 'user_code'))}`,
    );
  });

  it('stores a normalized, retained DeviceCode without IP or user-agent metadata', async () => {
    const current = fixture();
    const response = await current.request(
      `/${current.organization.slug}/device/auth`,
      postForm({ client_id: current.client.clientId, scope: 'openid profile offline_access' }),
    );
    expect(response.status).toBe(200);
    const body = await readJson(response);
    const userCode = readString(body, 'user_code');
    const normalized = userCode.replace(/-/g, '');

    expect(normalized).toMatch(NORMALIZED_USER_CODE_PATTERN);
    const stored = await readStoredDeviceCode(normalized);
    expect(stored.userCode).toBe(normalized);

    // The adapter keeps the row 900 seconds beyond the provider's 600-second payload lifetime.
    expect(stored.secondsUntilExpiry).toBeGreaterThan(1400);
    expect(stored.secondsUntilExpiry).toBeLessThanOrEqual(1510);

    const nowSeconds = Math.floor(Date.now() / 1000);
    const payloadExpiry = readPayloadNumber(stored.payload, 'exp');
    expect(payloadExpiry).toBeGreaterThanOrEqual(nowSeconds + 590);
    expect(payloadExpiry).toBeLessThanOrEqual(nowSeconds + 610);

    const serialized = JSON.stringify(stored.payload);
    expect(serialized).not.toContain('"ip"');
    expect(serialized).not.toContain('"ua"');
    expect(stored.payload.deviceInfo).toEqual({});

    const index = await getPool().query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'idx_oidc_payloads_device_user_code'`,
    );
    expect(index.rows.map((row) => row.indexname)).toEqual([
      'idx_oidc_payloads_device_user_code',
    ]);
  });
});
