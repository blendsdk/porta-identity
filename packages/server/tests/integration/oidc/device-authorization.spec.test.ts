/**
 * Specification tests for the device authorization grant at the HTTP boundary.
 *
 * These cases cover client authorization, token pending/expiry/replay states,
 * user-code collisions, and the tenant boundary for entry and resume. They run
 * against the real PostgreSQL adapter and Redis cache; the token outcomes are
 * driven by provider-owned state, not by mocks.
 */

import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { getRedis } from '../../../src/lib/redis.js';
import {
  buildDeviceAuthorizationIpKey,
  buildDevicePollIpKey,
  buildDevicePollKey,
  buildPollIntervalKey,
  buildUserCodeIpKey,
} from '../../../src/middleware/device-rate-limiter.js';
import { revokeConnectedApp } from '../../../src/connected-apps/service.js';
import { PostgresAdapter, purgeExpired } from '../../../src/oidc/postgres-adapter.js';
import {
  createTestClient,
  createTestOrganization,
} from '../helpers/factories.js';
import {
  DEVICE_CODE_GRANT,
  extractInteractionCsrf,
  extractXsrf,
  postForm,
  readJson,
  readString,
  useDeviceFixture,
  type DeviceCookieJar,
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
  const grantId = randomBytes(32).toString('base64url').slice(0, 43);
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
    `UPDATE oidc_payloads SET payload = $2::jsonb, grant_id = $3
      WHERE type = 'DeviceCode' AND id = $1`,
    [deviceCode, JSON.stringify(payload), grantId],
  );
  await getPool().query(
    `INSERT INTO oidc_payloads (id, type, payload, grant_id, expires_at)
     VALUES ($1, 'Grant', $2::jsonb, NULL, NOW() + interval '1 hour')`,
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

    // The replay case isolates provider replay handling from the poll-interval control.
    await getRedis().del(buildPollIntervalKey(current.client.clientId, deviceCode));
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

    // The provider-absence check is independent of the soft polling interval.
    await getRedis().del(buildPollIntervalKey(current.client.clientId, deviceCode));
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
    const existingId = 'E'.repeat(43);
    const existingExpiry = Math.floor(Date.now() / 1000) + 600;
    await getPool().query(
      `INSERT INTO oidc_payloads (id, type, payload, user_code, expires_at)
       VALUES ($3, 'DeviceCode', $1::jsonb, $2, NOW() + interval '900 seconds')`,
      [
        JSON.stringify({
          jti: existingId,
          userCode: existingCode,
          exp: existingExpiry,
        }),
        existingCode,
        existingId,
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
      expect(rows.rows[0]?.id).toBe(existingId);
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
      userCode.replace(/-/g, '_'),
    ];
    const redis = getRedis();
    for (const variant of variants) {
      // A real cross-tenant submission carries a valid foreign-tenant session and XSRF.
      const entry = await current.browserRequest(`/${foreignOrganization.slug}/device`);
      const xsrf = extractXsrf(await entry.text());
      const response = await current.browserRequest(
        `/${foreignOrganization.slug}/device`,
        postForm({ xsrf, user_code: variant }),
      );
      expect(response.status).toBe(404);
      expect(await readJson(response)).toEqual({ error: 'Not Found', status: 404 });
      expect(await redis.keys('interaction:*')).toEqual([]);
      expect(await redis.keys('oidc:Interaction:*')).toEqual([]);
    }

    const overlong = 'A'.repeat(90_000);
    const entry = await current.browserRequest(`/${current.organization.slug}/device`);
    const xsrf = extractXsrf(await entry.text());
    const rejected = await current.browserRequest(
      `/${current.organization.slug}/device`,
      postForm({ xsrf, user_code: overlong }),
    );
    expect(rejected.status).toBe(404);
    expect(await readJson(rejected)).toEqual({ error: 'Not Found', status: 404 });
    expect(await redis.keys('interaction:*')).toEqual([]);
    expect(await redis.keys('oidc:Interaction:*')).toEqual([]);
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
      `/device/%41${uid.slice(1)}`,
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
    const authHead = await current.request(`/${current.organization.slug}/device/auth`, {
      method: 'HEAD',
    });
    expect(authHead.status).toBe(405);
    expect(authHead.headers.get('allow')).toBe('POST');
  });

  it('rejects a mismatched provider XSRF with a valid session', async () => {
    const current = fixture();
    const authorization = await authorizeDevice(current);
    const userCode = readString(await readJson(authorization), 'user_code');
    const entry = await current.browserRequest(`/${current.organization.slug}/device`);
    const xsrf = extractXsrf(await entry.text());
    const response = await current.browserRequest(
      `/${current.organization.slug}/device`,
      postForm({ xsrf: `${xsrf}changed`, user_code: userCode }),
    );
    expect(response.status).toBe(400);
  });

  it('rejects a missing provider XSRF without a session', async () => {
    const current = fixture();
    const response = await current.request(
      `/${current.organization.slug}/device`,
      postForm({ user_code: 'ZZZZ-ZZZZ' }),
    );
    expect(response.status).toBe(400);
  });

  it('does not treat the static device auth path as a resume', async () => {
    const current = fixture();
    const authorization = await authorizeDevice(current);
    const userCode = readString(await readJson(authorization), 'user_code');
    const confirmation = await submitConfirmation(current, current.browser, userCode);
    expect(confirmation.status).toBe(303);

    const response = await current.browserRequest(
      `/${current.organization.slug}/device/auth`,
    );
    expect(response.status).toBe(404);
  });

  it('binds the resume cookie, tolerates an expiresWithSession code and keeps a same-org resume usable', async () => {
    const current = fixture();
    const firstBrowser = current.newBrowser();
    const firstAuthorization = await authorizeDevice(current);
    const firstBody = await readJson(firstAuthorization);
    const firstConfirmation = await submitConfirmation(
      current,
      firstBrowser,
      readString(firstBody, 'user_code'),
    );
    expect(firstConfirmation.status).toBe(303);
    const firstUid = (firstConfirmation.headers.get('location') ?? '')
      .split('/interaction/')[1]
      ?.split(/[/?#]/)[0] ?? '';
    expect(firstUid.length).toBeGreaterThan(20);
    const firstCookie = firstBrowser.get('_interaction_resume');
    const firstSignature = firstBrowser.get('_interaction_resume.sig');
    expect(firstCookie).toBeTruthy();
    expect(firstSignature).toBeTruthy();

    const secondBrowser = current.newBrowser();
    const secondAuthorization = await authorizeDevice(current);
    const secondBody = await readJson(secondAuthorization);
    const secondConfirmation = await submitConfirmation(
      current,
      secondBrowser,
      readString(secondBody, 'user_code'),
    );
    expect(secondConfirmation.status).toBe(303);
    const secondUid = (secondConfirmation.headers.get('location') ?? '')
      .split('/interaction/')[1]
      ?.split(/[/?#]/)[0] ?? '';
    expect(secondUid.length).toBeGreaterThan(20);
    const secondCookie = secondBrowser.get('_interaction_resume');
    const secondSignature = secondBrowser.get('_interaction_resume.sig');
    expect(secondCookie).toBeTruthy();
    expect(secondSignature).toBeTruthy();

    // A correctly signed resume cookie that names another interaction must not resume this one.
    firstBrowser.set('_interaction_resume', secondCookie ?? '');
    firstBrowser.set('_interaction_resume.sig', secondSignature ?? '');
    const mismatched = await current.browserRequestWith(
      firstBrowser,
      `/${current.organization.slug}/device/${firstUid}`,
    );
    expect(mismatched.status).toBe(404);

    // Restoring the matching cookie leaves the same-organization resume usable.
    firstBrowser.set('_interaction_resume', firstCookie ?? '');
    firstBrowser.set('_interaction_resume.sig', firstSignature ?? '');
    const sameOrganization = await current.browserRequestWith(
      firstBrowser,
      `/${current.organization.slug}/device/${firstUid}`,
    );
    expect([200, 302, 303]).toContain(sameOrganization.status);

    // The tenant middleware must resolve a session-bound code and let the provider enforce binding.
    await getPool().query(
      `UPDATE oidc_payloads
          SET payload = payload || '{"expiresWithSession": true, "sessionUid": "missing-session"}'::jsonb
        WHERE type = 'DeviceCode' AND id = $1`,
      [readString(secondBody, 'device_code')],
    );
    const expiresWithSession = await current.browserRequestWith(
      secondBrowser,
      `/${current.organization.slug}/device/${secondUid}`,
    );
    expect([200, 302, 303]).toContain(expiresWithSession.status);
  });
});

/** Audit row fields used by the device audit specifications. */
interface DeviceAuditRow {
  readonly event_type: string;
  readonly event_category: string;
  readonly organization_id: string | null;
  readonly user_id: string | null;
  readonly metadata: Record<string, unknown>;
  readonly ip_address: string | null;
  readonly user_agent: string | null;
}

/** Read every audit row for one event type. */
async function readDeviceAudits(eventType: string): Promise<DeviceAuditRow[]> {
  const result = await getPool().query<DeviceAuditRow>(
    `SELECT event_type, event_category, organization_id, user_id, metadata, ip_address, user_agent
       FROM audit_log
      WHERE event_type = $1
      ORDER BY created_at ASC`,
    [eventType],
  );
  return result.rows;
}

/** Wait for the best-effort audit writer to persist at least one row. */
async function waitForDeviceAudit(eventType: string): Promise<DeviceAuditRow[]> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const rows = await readDeviceAudits(eventType);
    if (rows.length > 0) return rows;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return readDeviceAudits(eventType);
}

/** Read the live loopback address used by the fixture. */
const LOOPBACK_IP = '127.0.0.1';

/** Count the primary user-code keys (the per-IP aggregate is excluded). */
async function primaryUserCodeKeys(): Promise<string[]> {
  const keys = await getRedis().keys('ratelimit:device-user-code:*');
  return keys.filter((key) => !key.includes(':ip:'));
}

/** Confirm a device code in one browser session and return the interaction URL. */
async function submitConfirmation(
  current: DeviceFixture,
  browser: DeviceCookieJar,
  userCode: string,
  extra: Record<string, string> = {},
): Promise<Response> {
  const entry = await current.browserRequestWith(browser, `/${current.organization.slug}/device`);
  expect(entry.status).toBe(200);
  const xsrf = extractXsrf(await entry.text());
  return current.browserRequestWith(
    browser,
    `/${current.organization.slug}/device`,
    postForm({ xsrf, user_code: userCode, confirm: 'yes', ...extra }),
  );
}

/**
 * Complete the login interaction and follow the provider chain.
 *
 * Returns the final HTML response. The chain may stop on a consent page when
 * the client requires consent.
 */
async function completeLogin(
  current: DeviceFixture,
  browser: DeviceCookieJar,
  interactionUrl: string,
): Promise<Response> {
  const loginPage = await current.browserRequestWith(browser, interactionUrl);
  expect(loginPage.status).toBe(200);
  const csrf = extractInteractionCsrf(await loginPage.text());
  const uid = interactionUrl.split('/interaction/')[1]?.split(/[/?#]/)[0] ?? '';
  expect(uid.length).toBeGreaterThan(20);

  const login = await current.browserRequestWith(
    browser,
    `/interaction/${uid}/login`,
    postForm({
      email: current.user.email,
      password: current.password,
      _csrf: csrf,
      _csrfStored: csrf,
    }),
  );
  expect([302, 303]).toContain(login.status);

  let location = login.headers.get('location');
  for (let hop = 0; hop < 15 && location !== null; hop += 1) {
    const response = await current.browserRequestWith(browser, location);
    if (response.status >= 300 && response.status < 400) {
      location = response.headers.get('location');
      continue;
    }
    expect(response.status).toBe(200);
    return response;
  }
  throw new Error('Login interaction did not settle within the redirect budget');
}

describe('Device authorization limits', () => {
  const fixture = useDeviceFixture();

  it('limits device authorization by client and address, once per window', async () => {
    const current = fixture();
    await getRedis().flushdb();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await authorizeDevice(current);
      expect(response.status).toBe(200);
    }
    const eleventh = await authorizeDevice(current);
    expect(eleventh.status).toBe(429);
    expect((await readJson(eleventh)).error).toBe('rate_limit_exceeded');
    expect(eleventh.headers.get('retry-after')).toMatch(/^\d+$/);

    const audits = await waitForDeviceAudit('rate_limit.device_code');
    expect(audits).toHaveLength(1);
    await authorizeDevice(current);
    expect(await readDeviceAudits('rate_limit.device_code')).toHaveLength(1);

    await getRedis().flushdb();
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await current.request(
        `/${current.organization.slug}/device/auth`,
        postForm({ client_id: `unknown-device-${attempt}`, scope: 'openid' }),
      );
    }
    const addressDenied = await current.request(
      `/${current.organization.slug}/device/auth`,
      postForm({ client_id: 'unknown-device-overflow', scope: 'openid' }),
    );
    expect(addressDenied.status).toBe(429);

    await getRedis().flushdb();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await authorizeDevice(current);
    }
    const variant = await current.request(
      `/${current.organization.slug}/DEVICE/Auth`,
      postForm({ client_id: current.client.clientId, scope: 'openid profile offline_access' }),
    );
    expect(variant.status).toBe(429);
    expect(variant.headers.get('retry-after')).toMatch(/^\d+$/);
  });

  it('limits user-code submissions, renders a branded page and fails open on Redis errors', async () => {
    const current = fixture();
    const redis = getRedis();
    await redis.flushdb();

    const entry = await current.browserRequest(`/${current.organization.slug}/device`);
    const xsrf = extractXsrf(await entry.text());
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await current.browserRequest(
        `/${current.organization.slug}/device`,
        postForm({ xsrf, user_code: 'ZZZZ-ZZZZ' }),
      );
    }
    const limited = await current.browserRequest(
      `/${current.organization.slug}/device`,
      postForm({ xsrf, user_code: 'ZZZZ-ZZZZ' }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(limited.headers.get('content-type')).toContain('text/html');
    const limitedHtml = await limited.text();
    expect(limitedHtml).not.toContain('ZZZZ-ZZZZ');
    expect(limitedHtml).toContain('Too many attempts');

    const audits = await waitForDeviceAudit('rate_limit.device_user_code');
    expect(audits).toHaveLength(1);

    await redis.flushdb();
    await redis.set(buildUserCodeIpKey(LOOPBACK_IP), '30', 'EX', 600);
    const addressLimited = await current.browserRequest(
      `/${current.organization.slug}/device?user_code=ZZZZ-ZZZZ`,
    );
    expect(addressLimited.status).toBe(429);
    expect(addressLimited.headers.get('content-type')).toContain('text/html');

    await redis.flushdb();
    await redis.set(buildUserCodeIpKey(LOOPBACK_IP), '30', 'EX', 600);
    const upperVariant = await current.browserRequest(
      `/${current.organization.slug}/DEVICE?user_code=ZZZZ-ZZZZ`,
    );
    expect(upperVariant.status).toBe(429);

    await redis.flushdb();
    const code = readString(await readJson(await authorizeDevice(current)), 'user_code');
    const failure = vi.spyOn(redis, 'incr').mockRejectedValueOnce(new Error('redis unavailable'));
    try {
      const allowed = await current.browserRequest(
        `/${current.organization.slug}/device?user_code=${encodeURIComponent(code)}`,
      );
      expect(allowed.status).toBeLessThan(500);
      expect(allowed.status).not.toBe(429);
    } finally {
      failure.mockRestore();
    }
  });

  it('resets only the primary user-code counter after approval', async () => {
    const current = fixture();
    const redis = getRedis();
    await redis.flushdb();

    const authorization = await authorizeDevice(current);
    const userCode = readString(await readJson(authorization), 'user_code');
    const confirmation = await submitConfirmation(current, current.browser, userCode);
    expect(confirmation.status).toBe(303);
    const interactionUrl = confirmation.headers.get('location') ?? '';

    const primary = await primaryUserCodeKeys();
    expect(primary).toHaveLength(1);
    const primaryKey = primary[0] ?? '';
    await redis.set(primaryKey, '5', 'EX', 600);
    await redis.set(buildUserCodeIpKey(LOOPBACK_IP), '10', 'EX', 600);

    const success = await completeLogin(current, current.browser, interactionUrl);
    expect(success.status).toBe(200);

    expect(await redis.get(primaryKey)).toBeNull();
    expect(await redis.get(buildUserCodeIpKey(LOOPBACK_IP))).toBe('10');
  });

  it('normalizes token paths and enforces the poll interval before the hard budget', async () => {
    const current = fixture();
    const redis = getRedis();
    await redis.flushdb();

    const authorization = await authorizeDevice(current);
    const deviceCode = readString(await readJson(authorization), 'device_code');

    const firstPoll = await pollToken(current, deviceCode);
    expect(firstPoll.status).toBe(400);
    expect((await readJson(firstPoll)).error).toBe('authorization_pending');

    const fastPoll = await pollToken(current, deviceCode);
    expect(fastPoll.status).toBe(400);
    expect((await readJson(fastPoll)).error).toBe('slow_down');
    expect(fastPoll.headers.get('cache-control')).toContain('no-store');

    await redis.flushdb();
    await redis.set(buildDevicePollKey(current.client.clientId, LOOPBACK_IP), '179', 'EX', 900);
    const atBudget = await pollToken(current, deviceCode);
    expect(atBudget.status).toBe(400);
    const overBudget = await pollToken(current, deviceCode);
    expect(overBudget.status).toBe(429);
    expect((await readJson(overBudget)).error).toBe('rate_limit_exceeded');

    await redis.flushdb();
    await redis.set(buildDevicePollIpKey(LOOPBACK_IP), '600', 'EX', 300);
    const ipDenied = await pollToken(current, deviceCode);
    expect(ipDenied.status).toBe(429);

    await redis.flushdb();
    await redis.set(`ratelimit:token:ip:${LOOPBACK_IP}`, '300', 'EX', 300);
    const deviceExempt = await pollToken(current, deviceCode);
    expect(deviceExempt.status).not.toBe(429);

    await redis.flushdb();
    await redis.set(`ratelimit:token:ip:${LOOPBACK_IP}`, '300', 'EX', 300);
    const otherGrant = await current.request(
      `/${current.organization.slug}/token`,
      postForm({ grant_type: 'client_credentials', client_id: current.client.clientId }),
    );
    expect(otherGrant.status).toBe(429);

    await redis.flushdb();
    await redis.set(buildDevicePollKey(current.client.clientId, LOOPBACK_IP), '180', 'EX', 900);
    const variant = await current.request(
      `/${current.organization.slug}/TOKEN`,
      postForm({
        grant_type: DEVICE_CODE_GRANT,
        device_code: deviceCode,
        client_id: current.client.clientId,
      }),
    );
    expect(variant.status).toBe(429);
    expect(variant.headers.get('cache-control')).toContain('no-store');

    await redis.flushdb();
    await redis.set(buildDevicePollKey(current.client.clientId, LOOPBACK_IP), '180', 'EX', 900);
    const trailingVariant = await current.request(
      `/${current.organization.slug}/token/`,
      postForm({
        grant_type: DEVICE_CODE_GRANT,
        device_code: deviceCode,
        client_id: current.client.clientId,
      }),
    );
    expect(trailingVariant.status).toBe(429);

    await redis.flushdb();
    await redis.set(buildDeviceAuthorizationIpKey(LOOPBACK_IP), '30', 'EX', 300);
    const authDenied = await current.request(
      `/${current.organization.slug}/device/auth`,
      postForm({ client_id: current.client.clientId, scope: 'openid' }),
    );
    expect(authDenied.status).toBe(429);
  });
});

describe('Device authorization audit and concurrency', () => {
  const fixture = useDeviceFixture();

  it('writes one authorized audit row without codes, IP or user agent', async () => {
    const current = fixture();
    const authorization = await authorizeDevice(current);
    const authorizationBody = await readJson(authorization);
    const userCode = readString(authorizationBody, 'user_code');
    const confirmation = await submitConfirmation(current, current.browser, userCode);
    const success = await completeLogin(current, current.browser, confirmation.headers.get('location') ?? '');
    expect(success.status).toBe(200);

    const audits = await waitForDeviceAudit('user.device.authorized');
    expect(audits).toHaveLength(1);
    const audit = audits[0];
    expect(audit?.ip_address).toBeNull();
    expect(audit?.user_agent).toBeNull();
    expect(audit?.event_category).toBe('authentication');
    expect(audit?.organization_id).toBe(current.organization.id);
    expect(audit?.user_id).toBe(current.user.id);
    expect(audit?.metadata['clientId']).toBe(current.client.clientId);
    expect(audit?.metadata['scopes']).toEqual(expect.arrayContaining(['openid']));
    const serialized = JSON.stringify(audit?.metadata);
    expect(serialized).not.toContain(readString(authorizationBody, 'device_code'));
    expect(serialized).not.toContain(userCode);
    expect(serialized).not.toContain('device_code');
    expect(serialized).not.toContain('user_code');
  });

  it('records an aborted confirmation as a denied user decision', async () => {
    const current = fixture();
    const authorization = await authorizeDevice(current);
    const authorizationBody = await readJson(authorization);
    const userCode = readString(authorizationBody, 'user_code');
    const aborted = await submitConfirmation(current, current.browser, userCode, { abort: 'yes' });
    expect(aborted.status).toBe(200);

    const audits = await waitForDeviceAudit('user.device.denied');
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata['reason']).toBe('aborted');
    expect(audits[0]?.event_category).toBe('authentication');
    expect(audits[0]?.organization_id).toBe(current.organization.id);
    expect(audits[0]?.ip_address).toBeNull();
    expect(audits[0]?.user_agent).toBeNull();

    const denied = await pollToken(current, readString(authorizationBody, 'device_code'));
    expect(denied.status).toBe(400);
    expect((await readJson(denied)).error).toBe('access_denied');
  });

  it('allows exactly one concurrent confirmation and persists the winner completion', async () => {
    const current = fixture();
    const authorization = await authorizeDevice(current);
    const authorizationBody = await readJson(authorization);
    const userCode = readString(authorizationBody, 'user_code');
    const deviceCode = readString(authorizationBody, 'device_code');

    const first = current.newBrowser();
    const second = current.newBrowser();
    const [firstResponse, secondResponse] = await Promise.all([
      submitConfirmation(current, first, userCode),
      submitConfirmation(current, second, userCode),
    ]);
    const statuses = [firstResponse.status, secondResponse.status].sort((a, b) => a - b);
    expect(statuses.filter((status) => status === 303)).toHaveLength(1);
    expect(statuses.some((status) => status === 303)).toBe(true);
    const loser = firstResponse.status === 303 ? secondResponse : firstResponse;
    expect(loser.status).not.toBe(500);

    const winner = firstResponse.status === 303
      ? { browser: first, response: firstResponse }
      : { browser: second, response: secondResponse };
    const success = await completeLogin(current, winner.browser, winner.response.headers.get('location') ?? '');
    expect(success.status).toBe(200);

    const tokens = await pollToken(current, deviceCode);
    expect(tokens.status).toBe(200);
    const stored = await readDeviceCodeRow(deviceCode);
    expect(stored?.payload.accountId).toBe(current.user.id);
    expect(stored?.payload.error).toBeUndefined();
  });

  it('keeps an approved device grant alive when the same browser reuses its session', async () => {
    const current = fixture();
    const browser = current.newBrowser();

    const first = await authorizeDevice(current);
    const firstBody = await readJson(first);
    const firstCode = readString(firstBody, 'device_code');
    const firstConfirmation = await submitConfirmation(
      current,
      browser,
      readString(firstBody, 'user_code'),
    );
    expect(firstConfirmation.status).toBe(303);
    const success = await completeLogin(
      current,
      browser,
      firstConfirmation.headers.get('location') ?? '',
    );
    expect(success.status).toBe(200);
    expect(await success.text()).toContain('Device connected');

    const second = await authorizeDevice(current);
    const secondBody = await readJson(second);
    const secondConfirmation = await submitConfirmation(
      current,
      browser,
      readString(secondBody, 'user_code'),
    );
    expect(secondConfirmation.status).toBe(303);

    // The browser already has a provider session, so this resume must not require a login.
    let location = secondConfirmation.headers.get('location') ?? '';
    let reused: Response | undefined;
    for (let hop = 0; hop < 15 && location.length > 0; hop += 1) {
      const response = await current.browserRequestWith(browser, location);
      if (response.status >= 300 && response.status < 400) {
        location = response.headers.get('location') ?? '';
        continue;
      }
      reused = response;
      break;
    }
    expect(reused?.status).toBe(200);
    expect(await reused?.text()).toContain('Device connected');

    // Session rotation must not delete the first approval's grant or device code.
    const firstPoll = await pollToken(current, firstCode);
    expect(firstPoll.status).toBe(200);
    expect(readString(await readJson(firstPoll), 'access_token').length).toBeGreaterThan(0);
  });

  it('does not let a late confirmation overwrite a recorded abort', async () => {
    const current = fixture();
    const authorization = await authorizeDevice(current);
    const authorizationBody = await readJson(authorization);
    const userCode = readString(authorizationBody, 'user_code');
    const deviceCode = readString(authorizationBody, 'device_code');

    const aborted = await submitConfirmation(current, current.browser, userCode, { abort: 'yes' });
    expect(aborted.status).toBe(200);

    const late = await submitConfirmation(current, current.newBrowser(), userCode);
    expect(late.status).not.toBe(303);

    const denied = await pollToken(current, deviceCode);
    expect(denied.status).toBe(400);
    expect((await readJson(denied)).error).toBe('access_denied');
  });

  it('rejects a user-code request over the address budget once per window', async () => {
    const current = fixture();
    const redis = getRedis();
    await redis.flushdb();
    await redis.set(buildUserCodeIpKey(LOOPBACK_IP), '30', 'EX', 600);

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = await current.browserRequest(
        `/${current.organization.slug}/device?user_code=ZZZZ-ZZZZ`,
      );
      expect(response.status).toBe(429);
    }
    const audits = await waitForDeviceAudit('rate_limit.device_user_code');
    expect(audits).toHaveLength(1);
    expect(audits[0]?.ip_address).toBe(LOOPBACK_IP);
  });
});

describe('Device authorization refresh tokens', () => {
  const fixture = useDeviceFixture({ grantTypes: [DEVICE_CODE_GRANT, 'refresh_token'] });

  it('issues a refresh token when offline_access is granted', async () => {
    const current = fixture();
    const authorization = await authorizeDevice(current);
    const deviceCode = readString(await readJson(authorization), 'device_code');
    await approveStoredDeviceCode(current, deviceCode);

    const poll = await pollToken(current, deviceCode);
    expect(poll.status).toBe(200);
    const tokens = await readJson(poll);
    expect(readString(tokens, 'refresh_token').length).toBeGreaterThan(0);
  });
});

describe('Device stale authority and cleanup', () => {
  const fixture = useDeviceFixture();

  it('removes a retained DeviceCode when its grant is revoked', async () => {
    const current = fixture();
    const authorization = await authorizeDevice(current);
    const deviceCode = readString(await readJson(authorization), 'device_code');
    const grantId = await approveStoredDeviceCode(current, deviceCode);

    const revoked = await revokeConnectedApp(
      current.organization.id,
      current.user.id,
      grantId,
    );
    expect(revoked).toBe(true);
    expect(await readDeviceCodeRow(deviceCode)).toBeUndefined();

    const poll = await pollToken(current, deviceCode);
    expect(poll.status).toBe(400);
    expect((await readJson(poll)).error).toBe('invalid_grant');
  });

  it('rejects a token when the client was deleted after approval', async () => {
    const current = fixture();
    const authorization = await authorizeDevice(current);
    const deviceCode = readString(await readJson(authorization), 'device_code');
    await approveStoredDeviceCode(current, deviceCode);
    await getPool().query('DELETE FROM clients WHERE id = $1', [current.client.id]);

    const poll = await pollToken(current, deviceCode);
    expect(poll.status).toBeGreaterThanOrEqual(400);
    expect((await readJson(poll)).access_token).toBeUndefined();
  });

  it('rejects a token when the user was deleted after approval', async () => {
    const current = fixture();
    const authorization = await authorizeDevice(current);
    const deviceCode = readString(await readJson(authorization), 'device_code');
    await approveStoredDeviceCode(current, deviceCode);
    await getPool().query('DELETE FROM users WHERE id = $1', [current.user.id]);

    const poll = await pollToken(current, deviceCode);
    expect(poll.status).toBe(400);
    expect((await readJson(poll)).error).toBe('invalid_grant');
  });

  it('rejects a token when the organization is deleted after approval', async () => {
    const current = fixture();
    const authorization = await authorizeDevice(current);
    const deviceCode = readString(await readJson(authorization), 'device_code');
    await approveStoredDeviceCode(current, deviceCode);
    await getPool().query('DELETE FROM organizations WHERE id = $1', [current.organization.id]);

    // Deleting the organization cascades the client, so the provider rejects the
    // unauthenticated public client before it reaches the grant.
    const poll = await pollToken(current, deviceCode);
    expect(poll.status).toBeGreaterThanOrEqual(400);
    const body = await readJson(poll);
    expect(body.access_token).toBeUndefined();
    expect(['invalid_client', 'invalid_grant']).toContain(body.error);
  });

  it.each([
    ['client', "UPDATE clients SET status = 'inactive' WHERE id = $1", (current: DeviceFixture) => current.client.id],
    ['user', "UPDATE users SET status = 'inactive' WHERE id = $1", (current: DeviceFixture) => current.user.id],
  ])('rejects a token when the %s is deactivated after approval', async (_name, sql, id) => {
    const current = fixture();
    const authorization = await authorizeDevice(current);
    const deviceCode = readString(await readJson(authorization), 'device_code');
    await approveStoredDeviceCode(current, deviceCode);
    await getPool().query(sql, [id(current)]);

    const poll = await pollToken(current, deviceCode);
    expect(poll.status).toBeGreaterThanOrEqual(400);
    const body = await readJson(poll);
    expect(body.access_token).toBeUndefined();
    expect(['invalid_client', 'invalid_grant']).toContain(body.error);
  });

  it('removes the DeviceCode when logout revokes its grant', async () => {
    const current = fixture();
    const authorization = await authorizeDevice(current);
    const deviceCode = readString(await readJson(authorization), 'device_code');
    const grantId = await approveStoredDeviceCode(current, deviceCode);

    // The provider's end-session action calls revokeByGrantId for the DeviceCode model and then
    // destroys the Grant itself; the bare Grant row carries no grant_id column value.
    await new PostgresAdapter('DeviceCode').revokeByGrantId(grantId);
    await new PostgresAdapter('Grant').destroy(grantId);
    expect(await readDeviceCodeRow(deviceCode)).toBeUndefined();

    const poll = await pollToken(current, deviceCode);
    expect(poll.status).toBe(400);
    expect((await readJson(poll)).error).toBe('invalid_grant');
  });
});

describe('Device authorization consent denial', () => {
  const fixture = useDeviceFixture({ requireConsent: true });

  it('records a consent denial as denied and denies the device poll', async () => {
    const current = fixture();
    const authorization = await authorizeDevice(current);
    const authorizationBody = await readJson(authorization);
    const userCode = readString(authorizationBody, 'user_code');
    const confirmation = await submitConfirmation(current, current.browser, userCode);
    expect(confirmation.status).toBe(303);

    const consentPage = await completeLogin(
      current,
      current.browser,
      confirmation.headers.get('location') ?? '',
    );
    expect(consentPage.status).toBe(200);
    const csrf = extractInteractionCsrf(await consentPage.text());
    const consentUid = new URL(consentPage.url).pathname.split('/interaction/')[1]?.split('/')[0] ?? '';
    expect(consentUid.length).toBeGreaterThan(20);

    const denied = await current.browserRequest(
      `/interaction/${consentUid}/confirm`,
      postForm({ decision: 'deny', _csrf: csrf }),
    );
    expect([302, 303]).toContain(denied.status);
    const resumeLocation = denied.headers.get('location');
    expect(resumeLocation).toBeTruthy();
    // Following the resume route runs the provider's error-save path and the denial hook.
    await current.browserRequest(resumeLocation ?? '');

    const audits = await waitForDeviceAudit('user.device.denied');
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata['reason']).toBe('denied');

    const poll = await pollToken(current, readString(authorizationBody, 'device_code'));
    expect(poll.status).toBe(400);
    expect((await readJson(poll)).error).toBe('access_denied');
  });
});

describe('Device page organization locale default', () => {
  const fixture = useDeviceFixture({ defaultLocale: 'nl' });

  it('uses the organization default when the browser locale is unsupported', async () => {
    const current = fixture();
    const response = await current.request(`/${current.organization.slug}/device`, {
      headers: { 'accept-language': 'xx-YY' },
    });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('lang="nl"');
    expect(html).toContain('Voer je apparaatcode in');
  });
});
