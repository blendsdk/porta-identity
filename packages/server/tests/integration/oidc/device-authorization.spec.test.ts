/**
 * Specification tests for the device authorization grant at the HTTP boundary.
 *
 * These cases cover client authorization, token pending/expiry/replay states,
 * user-code collisions, and the tenant boundary for entry and resume. They run
 * against the real PostgreSQL adapter and Redis cache; the token outcomes are
 * driven by provider-owned state, not by mocks.
 */

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { getRedis } from '../../../src/lib/redis.js';
import { purgeExpired } from '../../../src/oidc/postgres-adapter.js';
import {
  createTestClient,
  createTestOrganization,
} from '../helpers/factories.js';
import {
  DEVICE_CODE_GRANT,
  extractXsrf,
  postForm,
  readJson,
  readString,
  useDeviceFixture,
  type DeviceFixture,
} from './device-fixtures.js';

/** Database row shape needed by the token-state assertions. */
interface DeviceCodeRow {
  readonly payload: Record<string, unknown>;
  readonly consumedAt: Date | null;
}

/** Read one DeviceCode row by its opaque device code. */
async function readDeviceCodeRow(deviceCode: string): Promise<DeviceCodeRow | undefined> {
  const result = await getPool().query<{ payload: Record<string, unknown>; consumed_at: Date | null }>(
    `SELECT payload, consumed_at FROM oidc_payloads WHERE type = 'DeviceCode' AND id = $1`,
    [deviceCode],
  );
  const row = result.rows[0];
  return row ? { payload: row.payload, consumedAt: row.consumed_at } : undefined;
}

/** Count retained DeviceCode rows. */
async function countDeviceCodes(): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM oidc_payloads WHERE type = 'DeviceCode'`,
  );
  return Number(result.rows[0]?.count ?? '0');
}

/** Request one device authorization and return the parsed response. */
async function authorizeDevice(
  current: DeviceFixture,
  clientId = current.client.clientId,
): Promise<Response> {
  return current.request(
    `/${current.organization.slug}/device/auth`,
    postForm({ client_id: clientId, scope: 'openid profile offline_access' }),
  );
}

/** Read one required positive integer response field. */
function readPositiveInteger(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Expected response field ${key} to be a positive integer`);
  }
  return value;
}

/** Poll the token endpoint for one device code. */
async function pollToken(
  current: DeviceFixture,
  deviceCode: string,
  clientId = current.client.clientId,
): Promise<Response> {
  return current.request(
    `/${current.organization.slug}/token`,
    postForm({
      grant_type: DEVICE_CODE_GRANT,
      device_code: deviceCode,
      client_id: clientId,
    }),
  );
}

/**
 * Record an approval on stored provider state.
 *
 * The interactive approval path is covered by the end-to-end and UI suites.
 * Token-state specifications need a deterministic approved DeviceCode without
 * re-implementing the login page in every case, so the provider-owned fields
 * and the matching Grant row are written directly.
 */
async function approveStoredDeviceCode(
  current: DeviceFixture,
  deviceCode: string,
  scope = 'openid profile offline_access',
): Promise<string> {
  const grantId = randomUUID();
  const row = await readDeviceCodeRow(deviceCode);
  if (!row) throw new Error('Cannot approve a missing DeviceCode');
  const exp = typeof row.payload.exp === 'number' ? row.payload.exp : 0;
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    ...row.payload,
    accountId: current.user.id,
    grantId,
    scope,
    authTime: now,
    acr: 'urn:porta:loa:1',
    amr: ['pwd'],
  };
  await getPool().query(
    `UPDATE oidc_payloads SET payload = $2::jsonb WHERE type = 'DeviceCode' AND id = $1`,
    [deviceCode, JSON.stringify(payload)],
  );
  await getPool().query(
    `INSERT INTO oidc_payloads (id, type, payload, grant_id, expires_at)
     VALUES ($1, 'Grant', $2::jsonb, $1, NOW() + interval '1 hour')`,
    [
      grantId,
      JSON.stringify({
        accountId: current.user.id,
        clientId: current.client.clientId,
        iat: now,
        exp: Math.max(now + 3600, exp),
        openid: { scope },
      }),
    ],
  );
  return grantId;
}

/** Wait until a fire-and-forget purge removes the retained row. */
async function waitForDeviceCodeRemoval(deviceCode: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((await readDeviceCodeRow(deviceCode)) === undefined) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Expected purgeExpired to remove the retained DeviceCode row');
}

/** Create a fresh browser session and return the device form XSRF value. */
async function openDeviceEntry(current: DeviceFixture): Promise<string> {
  const response = await current.browserRequest(`/${current.organization.slug}/device`);
  expect(response.status).toBe(200);
  return extractXsrf(await response.text());
}

describe('Device authorization grant', () => {
  const fixture = useDeviceFixture();

  it('rejects clients without the grant and unknown or foreign clients without issuing a code', async () => {
    const current = fixture();
    const application = current.application;
    const withoutGrant = await createTestClient(current.organization.id, application.id, {
      clientType: 'public',
      applicationType: 'native',
      grantTypes: ['authorization_code', 'refresh_token'],
      redirectUris: ['https://client.example/callback'],
      responseTypes: ['code'],
    });
    const foreignOrganization = await createTestOrganization({ name: 'Foreign Device Org' });
    const foreignClient = await createTestClient(foreignOrganization.id, application.id, {
      clientType: 'public',
      applicationType: 'native',
      grantTypes: [DEVICE_CODE_GRANT],
      redirectUris: [],
      responseTypes: [],
    });

    const noGrant = await authorizeDevice(current, withoutGrant.clientId);
    expect(noGrant.status).toBe(400);
    expect((await readJson(noGrant)).error).toBe('invalid_request');

    const unknown = await authorizeDevice(current, 'unknown-device-client');
    expect(unknown.status).toBe(404);
    expect(await readJson(unknown)).toEqual({ error: 'Not Found', status: 404 });

    const foreign = await authorizeDevice(current, foreignClient.clientId);
    expect(foreign.status).toBe(404);
    expect(await readJson(foreign)).toEqual({ error: 'Not Found', status: 404 });

    expect(await countDeviceCodes()).toBe(0);
  });

  it('keeps polling pending until the user approves', async () => {
    const current = fixture();
    const authorization = await authorizeDevice(current);
    expect(authorization.status).toBe(200);
    const deviceCode = readString(await readJson(authorization), 'device_code');

    const pending = await pollToken(current, deviceCode);
    expect(pending.status).toBe(400);
    const body = await readJson(pending);
    expect(body.error).toBe('authorization_pending');
    expect(body.access_token).toBeUndefined();
  });

  it('issues one token set, consumes the code, and revokes it on replay', async () => {
    const current = fixture();
    const authorization = await authorizeDevice(current);
    const deviceCode = readString(await readJson(authorization), 'device_code');
    const grantId = await approveStoredDeviceCode(current, deviceCode);

    const firstPoll = await pollToken(current, deviceCode);
    expect(firstPoll.status).toBe(200);
    const tokens = await readJson(firstPoll);
    expect(readString(tokens, 'access_token').length).toBeGreaterThan(0);
    expect(readString(tokens, 'id_token')).toContain('.');
    expect(tokens.token_type).toBe('Bearer');
    expect(readPositiveInteger(tokens, 'expires_in')).toBeGreaterThan(0);

    const consumed = await readDeviceCodeRow(deviceCode);
    expect(consumed?.consumedAt).toBeInstanceOf(Date);

    const replay = await pollToken(current, deviceCode);
    expect(replay.status).toBe(400);
    expect((await readJson(replay)).error).toBe('invalid_grant');

    const revoked = await getPool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM oidc_payloads
        WHERE grant_id = $1 AND type = 'AccessToken'`,
      [grantId],
    );
    expect(Number(revoked.rows[0]?.count)).toBe(0);
  });

  it('reports expired_token while the row is retained and invalid_grant after purge', async () => {
    const current = fixture();
    const authorization = await authorizeDevice(current);
    const deviceCode = readString(await readJson(authorization), 'device_code');
    await approveStoredDeviceCode(current, deviceCode);

    const now = Math.floor(Date.now() / 1000);
    await getPool().query(
      `UPDATE oidc_payloads
          SET payload = jsonb_set(payload, '{exp}', to_jsonb($2::bigint)),
              expires_at = NOW() + interval '900 seconds'
        WHERE type = 'DeviceCode' AND id = $1`,
      [deviceCode, now - 10],
    );

    const expired = await pollToken(current, deviceCode);
    expect(expired.status).toBe(400);
    expect((await readJson(expired)).error).toBe('expired_token');

    await getPool().query(
      `UPDATE oidc_payloads SET expires_at = NOW() - interval '1 second'
        WHERE type = 'DeviceCode' AND id = $1`,
      [deviceCode],
    );
    purgeExpired();
    await waitForDeviceCodeRemoval(deviceCode);

    const absent = await pollToken(current, deviceCode);
    expect(absent.status).toBe(400);
    expect((await readJson(absent)).error).toBe('invalid_grant');
  });

  it('rejects a token exchange by a different client', async () => {
    const current = fixture();
    const authorization = await authorizeDevice(current);
    const deviceCode = readString(await readJson(authorization), 'device_code');
    await approveStoredDeviceCode(current, deviceCode);

    const otherClient = await createTestClient(current.organization.id, current.application.id, {
      clientType: 'public',
      applicationType: 'native',
      grantTypes: [DEVICE_CODE_GRANT],
      redirectUris: [],
      responseTypes: [],
    });

    const response = await pollToken(current, deviceCode, otherClient.clientId);
    expect(response.status).toBe(400);
    expect((await readJson(response)).error).toBe('invalid_grant');
  });

  it('maps a user-code collision to a generic 503 without touching the existing row', async () => {
    const current = fixture();
    const existingCode = 'BCDFGHJK';
    const existingExpiry = Math.floor(Date.now() / 1000) + 600;
    await getPool().query(
      `INSERT INTO oidc_payloads (id, type, payload, user_code, expires_at)
       VALUES ('existing-device-code', 'DeviceCode', $1::jsonb, $2, NOW() + interval '900 seconds')`,
      [
        JSON.stringify({
          jti: 'existing-device-code',
          userCode: existingCode,
          exp: existingExpiry,
        }),
        existingCode,
      ],
    );

    // Force every new DeviceCode row onto the retained code so the adapter's unique-index path is
    // deterministic. The trigger changes only the column value; the retained row is untouched.
    await getPool().query(`
      CREATE OR REPLACE FUNCTION test_device_code_collision() RETURNS trigger AS $$
      BEGIN
        IF NEW.type = 'DeviceCode' THEN
          NEW.user_code := 'BCDFGHJK';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_device_code_collision
        BEFORE INSERT ON oidc_payloads
        FOR EACH ROW EXECUTE FUNCTION test_device_code_collision();
    `);

    try {
      const response = await authorizeDevice(current);
      expect(response.status).toBe(503);
      const body = await readJson(response);
      expect(body.error).toBe('temporarily_unavailable');

      const rows = await getPool().query<{ id: string; payload: Record<string, unknown> }>(
        `SELECT id, payload FROM oidc_payloads WHERE type = 'DeviceCode'`,
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.id).toBe('existing-device-code');
      expect(rows.rows[0]?.payload.userCode).toBe(existingCode);
    } finally {
      await getPool().query(
        `DROP TRIGGER IF EXISTS test_device_code_collision ON oidc_payloads;
         DROP FUNCTION IF EXISTS test_device_code_collision();`,
      );
    }
  });

  it('rejects a foreign user code at every normalized entry variant without side effects', async () => {
    const current = fixture();
    const authorization = await authorizeDevice(current);
    const userCode = readString(await readJson(authorization), 'user_code');
    const foreignOrganization = await createTestOrganization({ name: 'Entry Foreign Org' });
    await createTestClient(foreignOrganization.id, current.application.id, {
      clientType: 'public',
      applicationType: 'native',
      grantTypes: [DEVICE_CODE_GRANT],
      redirectUris: [],
      responseTypes: [],
    });

    const variants = [
      userCode,
      userCode.toLowerCase(),
      userCode.replace(/-/g, ''),
      userCode.replace(/-/g, ' '),
      userCode.replace(/-/g, 'ß'),
      userCode.replace(/-/g, '－'),
    ];
    const redis = getRedis();
    for (const variant of variants) {
      const response = await current.request(
        `/${foreignOrganization.slug}/device`,
        postForm({ user_code: variant, xsrf: 'unused' }),
      );
      expect(response.status).toBe(404);
      expect(await readJson(response)).toEqual({ error: 'Not Found', status: 404 });
      expect(await redis.keys('interaction:*')).toEqual([]);
    }

    const overlong = 'A'.repeat(90_000);
    const rejected = await current.request(
      `/${current.organization.slug}/device`,
      postForm({ user_code: overlong }),
    );
    expect(rejected.status).toBe(404);
    expect(await readJson(rejected)).toEqual({ error: 'Not Found', status: 404 });
    expect(await redis.keys('interaction:*')).toEqual([]);
  });

  it('rejects a foreign resume and every path variant, and refuses HEAD probes', async () => {
    const current = fixture();
    const authorization = await authorizeDevice(current);
    const userCode = readString(await readJson(authorization), 'user_code');
    const xsrf = await openDeviceEntry(current);

    const confirmation = await current.browserRequest(
      `/${current.organization.slug}/device`,
      postForm({ xsrf, user_code: userCode, confirm: 'yes' }),
    );
    expect(confirmation.status).toBe(303);
    const interactionLocation = confirmation.headers.get('location') ?? '';
    const uid = interactionLocation.split('/interaction/')[1]?.split(/[/?#]/)[0] ?? '';
    expect(uid.length).toBeGreaterThan(20);

    const foreignOrganization = await createTestOrganization({ name: 'Resume Foreign Org' });
    await createTestClient(foreignOrganization.id, current.application.id, {
      clientType: 'public',
      applicationType: 'native',
      grantTypes: [DEVICE_CODE_GRANT],
      redirectUris: [],
      responseTypes: [],
    });

    const variants = [
      `/device/${uid}`,
      `/DEVICE/${uid}`,
      `/device/${uid}/`,
      `/device/${uid.toUpperCase()}`,
    ];
    for (const variant of variants) {
      const response = await current.browserRequest(
        `/${foreignOrganization.slug}${variant}`,
      );
      expect(response.status).toBe(404);
      expect(await readJson(response)).toEqual({ error: 'Not Found', status: 404 });
    }

    for (const path of [`/${foreignOrganization.slug}/device`, `/${foreignOrganization.slug}/device/${uid}`]) {
      const head = await current.request(path, { method: 'HEAD' });
      expect(head.status).toBe(405);
      expect(head.headers.get('allow')).toBe('GET');
    }
  });
});
