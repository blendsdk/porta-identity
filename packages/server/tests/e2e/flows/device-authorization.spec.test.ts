/**
 * End-to-end regression for the device authorization grant.
 *
 * The integration specification owns the protocol oracle. This file re-runs
 * the same behavior through the shared live server, including the real login
 * interaction, to prove the native provider flow works with Porta middleware.
 */

import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { getRedis } from '../../../src/lib/redis.js';
import { buildPollIntervalKey } from '../../../src/middleware/device-rate-limiter.js';
import { purgeExpired } from '../../../src/oidc/postgres-adapter.js';
import { TestHttpClient } from '../helpers/http-client.js';
import { truncateAllTables, seedBaseData } from '../../integration/helpers/database.js';
import {
  createTestApplication,
  createTestClient,
  createTestOrganization,
  createTestUserWithPassword,
} from '../../integration/helpers/factories.js';
import { DEFAULT_TEST_PASSWORD } from '../../helpers/constants.js';
import type { Client } from '../../../src/clients/types.js';
import type { Organization } from '../../../src/organizations/types.js';
import type { User } from '../../../src/users/types.js';

/** Full grant value exercised by the device login. */
const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

/** Shared test identity password. */
const DEFAULT_PASSWORD = DEFAULT_TEST_PASSWORD;

/** One live test identity and client. */
interface LiveFixture {
  readonly organization: Organization;
  readonly client: Client;
  readonly user: User;
  readonly http: TestHttpClient;
}

/** Parsed device authorization response. */
interface DeviceAuthorization {
  readonly deviceCode: string;
  readonly userCode: string;
}

/** Read one required string field. */
function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expected ${key} to be a non-empty string`);
  }
  return value;
}

describe('Device authorization grant (E2E)', () => {
  let baseUrl: string;

  beforeAll(() => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'https://porta-harness.ci.portaidentity.com:3443';
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
  });

  /** Create one device-enabled client and user for a test. */
  async function createFixture(
    options: { requireConsent?: boolean; applicationType?: 'native' | 'web' } = {},
  ): Promise<LiveFixture> {
    const organization = await createTestOrganization({ name: 'Device E2E Org' });
    const application = await createTestApplication();
    const client = await createTestClient(organization.id, application.id, {
      clientType: 'public',
      applicationType: options.applicationType ?? 'web',
      grantTypes: [DEVICE_CODE_GRANT],
      redirectUris: [],
      responseTypes: [],
      scope: 'openid profile email offline_access',
      requirePkce: true,
      requireConsent: options.requireConsent ?? false,
      tokenEndpointAuthMethod: 'none',
    });
    const { user } = await createTestUserWithPassword(organization.id);
    return { organization, client, user, http: new TestHttpClient(baseUrl) };
  }

  /** Request a device code. */
  async function authorize(
    fixture: LiveFixture,
    clientId = fixture.client.clientId,
  ): Promise<DeviceAuthorization> {
    const response = await fixture.http.post(
      `/${fixture.organization.slug}/device/auth`,
      { client_id: clientId, scope: 'openid profile email offline_access' },
    );
    expect(response.status).toBe(200);
    const body = response.json as Record<string, unknown>;
    return {
      deviceCode: readString(body, 'device_code'),
      userCode: readString(body, 'user_code'),
    };
  }

  /** Poll the token endpoint. */
  async function poll(
    fixture: LiveFixture,
    deviceCode: string,
    clientId = fixture.client.clientId,
  ): Promise<ReturnType<TestHttpClient['post']>> {
    return fixture.http.post(`/${fixture.organization.slug}/token`, {
      grant_type: DEVICE_CODE_GRANT,
      device_code: deviceCode,
      client_id: clientId,
    });
  }

  /** Open the provider code-entry page and return its XSRF value. */
  async function openEntry(fixture: LiveFixture): Promise<string> {
    const entry = await fixture.http.get(`/${fixture.organization.slug}/device`);
    expect(entry.status).toBe(200);
    return entry.body.match(/name="xsrf"\s+value="([^"]+)"/)?.[1] ?? '';
  }

  /** Confirm a valid code and return the interaction URL. */
  async function confirmCode(
    fixture: LiveFixture,
    xsrf: string,
    userCode: string,
    extra: Record<string, string> = {},
  ): Promise<string> {
    const confirmation = await fixture.http.post(`/${fixture.organization.slug}/device`, {
      xsrf,
      user_code: userCode,
      confirm: 'yes',
      ...extra,
    });
    if (![302, 303].includes(confirmation.status)) {
      throw new Error(`Device confirmation failed: ${confirmation.status}`);
    }
    expect([302, 303]).toContain(confirmation.status);
    return confirmation.location ?? '';
  }

  /** Complete login and any auto-consent redirect chain after confirming a code. */
  async function loginAndApprove(fixture: LiveFixture, interactionUrl: string): Promise<string> {
    const loginPage = await fixture.http.get(interactionUrl);
    expect(loginPage.status).toBe(200);
    const csrf = fixture.http.extractCsrfToken(loginPage.body);
    if (!csrf) throw new Error('Login page did not contain a CSRF token');
    const uid = interactionUrl.split('/interaction/')[1]?.split(/[/?#]/)[0] ?? '';
    expect(uid.length).toBeGreaterThan(20);

    const login = await fixture.http.post(`/interaction/${uid}/login`, {
      email: fixture.user.email,
      password: DEFAULT_PASSWORD,
      _csrf: csrf,
      _csrfStored: csrf,
    });
    expect([302, 303]).toContain(login.status);
    const chain = await fixture.http.followRedirects(login.location ?? '', 20);
    return chain.finalResponse.body;
  }

  it('authorizes, approves through the login interaction, and polls a token set', async () => {
    const fixture = await createFixture();
    const authorization = await authorize(fixture);

    const xsrf = await openEntry(fixture);
    expect(xsrf.length).toBeGreaterThan(0);
    const interactionUrl = await confirmCode(fixture, xsrf, authorization.userCode);
    expect(interactionUrl).toContain('/interaction/');

    const body = await loginAndApprove(fixture, interactionUrl);
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toContain(authorization.deviceCode);

    const tokenResponse = await poll(fixture, authorization.deviceCode);
    expect(tokenResponse.status).toBe(200);
    const tokens = tokenResponse.json as Record<string, unknown>;
    expect(readString(tokens, 'access_token').length).toBeGreaterThan(0);
    expect(readString(tokens, 'id_token')).toContain('.');
    expect(tokens.token_type).toBe('Bearer');
  });

  it('keeps the first poll pending before approval', async () => {
    const fixture = await createFixture();
    const authorization = await authorize(fixture);

    const pending = await poll(fixture, authorization.deviceCode);
    expect(pending.status).toBe(400);
    expect((pending.json as Record<string, unknown>).error).toBe('authorization_pending');
  });

  it('rejects a second token exchange and revokes the first token set', async () => {
    const fixture = await createFixture();
    const authorization = await authorize(fixture);
    const xsrf = await openEntry(fixture);
    const interactionUrl = await confirmCode(fixture, xsrf, authorization.userCode);
    await loginAndApprove(fixture, interactionUrl);

    const first = await poll(fixture, authorization.deviceCode);
    expect(first.status).toBe(200);

    const stored = await getPool().query<{ grant_id: string | null }>(
      `SELECT grant_id FROM oidc_payloads WHERE type = 'DeviceCode' AND id = $1`,
      [authorization.deviceCode],
    );
    const grantId = stored.rows[0]?.grant_id;
    expect(grantId).toBeTypeOf('string');

    await getRedis().del(buildPollIntervalKey(fixture.client.clientId, authorization.deviceCode));
    const replay = await poll(fixture, authorization.deviceCode);
    expect(replay.status).toBe(400);
    expect((replay.json as Record<string, unknown>).error).toBe('invalid_grant');

    const tokens = await getPool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM oidc_payloads
        WHERE grant_id = $1 AND type = 'AccessToken'`,
      [grantId],
    );
    expect(Number(tokens.rows[0]?.count)).toBe(0);
  });

  it('reports expired_token during retention and invalid_grant after purge', async () => {
    const fixture = await createFixture();
    const authorization = await authorize(fixture);
    const now = Math.floor(Date.now() / 1000);
    await getPool().query(
      `UPDATE oidc_payloads
          SET payload = jsonb_set(payload, '{exp}', to_jsonb($2::bigint)),
              expires_at = NOW() + interval '900 seconds'
        WHERE type = 'DeviceCode' AND id = $1`,
      [authorization.deviceCode, now - 10],
    );

    const expired = await poll(fixture, authorization.deviceCode);
    expect(expired.status).toBe(400);
    expect((expired.json as Record<string, unknown>).error).toBe('expired_token');

    await getPool().query(
      `UPDATE oidc_payloads SET expires_at = NOW() - interval '1 second'
        WHERE type = 'DeviceCode' AND id = $1`,
      [authorization.deviceCode],
    );
    purgeExpired();
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const row = await getPool().query(
        `SELECT 1 FROM oidc_payloads WHERE type = 'DeviceCode' AND id = $1`,
        [authorization.deviceCode],
      );
      if (row.rowCount === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    await getRedis().del(buildPollIntervalKey(fixture.client.clientId, authorization.deviceCode));
    const absent = await poll(fixture, authorization.deviceCode);
    expect(absent.status).toBe(400);
    expect((absent.json as Record<string, unknown>).error).toBe('invalid_grant');
  });

  it('rejects a token exchange from another client', async () => {
    const fixture = await createFixture();
    const authorization = await authorize(fixture);
    const xsrf = await openEntry(fixture);
    const interactionUrl = await confirmCode(fixture, xsrf, authorization.userCode);
    await loginAndApprove(fixture, interactionUrl);

    const otherClient = await createTestClient(
      fixture.organization.id,
      (await createTestApplication()).id,
      {
        clientType: 'public',
        applicationType: 'web',
        grantTypes: [DEVICE_CODE_GRANT],
        redirectUris: [],
        responseTypes: [],
        tokenEndpointAuthMethod: 'none',
      },
    );

    const response = await poll(fixture, authorization.deviceCode, otherClient.clientId);
    expect(response.status).toBe(400);
    expect((response.json as Record<string, unknown>).error).toBe('invalid_grant');
  });

  it('handles unknown, expired, used and aborted codes with an invalid state and denies aborts', async () => {
    const fixture = await createFixture();

    const unknownXsrf = await openEntry(fixture);
    const unknown = await fixture.http.post(`/${fixture.organization.slug}/device`, {
      xsrf: unknownXsrf,
      user_code: 'BCDF-GHJK',
    });
    expect(unknown.status).toBe(200);

    const expiredAuthorization = await authorize(fixture);
    const now = Math.floor(Date.now() / 1000);
    await getPool().query(
      `UPDATE oidc_payloads
          SET payload = jsonb_set(payload, '{exp}', to_jsonb($2::bigint)),
              expires_at = NOW() + interval '900 seconds'
        WHERE type = 'DeviceCode' AND id = $1`,
      [expiredAuthorization.deviceCode, now - 10],
    );
    const expiredXsrf = await openEntry(fixture);
    const expired = await fixture.http.post(`/${fixture.organization.slug}/device`, {
      xsrf: expiredXsrf,
      user_code: expiredAuthorization.userCode,
    });
    expect(expired.status).toBe(200);

    const usedAuthorization = await authorize(fixture);
    const usedXsrf = await openEntry(fixture);
    const usedInteraction = await confirmCode(fixture, usedXsrf, usedAuthorization.userCode);
    await loginAndApprove(fixture, usedInteraction);
    const replayXsrf = await openEntry(fixture);
    const used = await fixture.http.post(`/${fixture.organization.slug}/device`, {
      xsrf: replayXsrf,
      user_code: usedAuthorization.userCode,
    });
    expect(used.status).toBe(200);

    const abortedAuthorization = await authorize(fixture);
    const abortXsrf = await openEntry(fixture);
    const aborted = await fixture.http.post(`/${fixture.organization.slug}/device`, {
      xsrf: abortXsrf,
      user_code: abortedAuthorization.userCode,
      abort: 'yes',
    });
    expect(aborted.status).toBe(200);
    const denied = await poll(fixture, abortedAuthorization.deviceCode);
    expect(denied.status).toBe(400);
    expect((denied.json as Record<string, unknown>).error).toBe('access_denied');

    const missingXsrf = await fixture.http.post(`/${fixture.organization.slug}/device`, {
      user_code: abortedAuthorization.userCode,
    });
    expect(missingXsrf.status).toBe(400);
    expect(missingXsrf.body).not.toContain(abortedAuthorization.deviceCode);
  });
});
