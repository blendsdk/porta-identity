/**
 * Implementation tests for device token-response bounds and abort handling.
 *
 * The live poll contract is specified separately. These cases pin the
 * malformed-success responses that must become terminal indeterminate errors
 * without a second request.
 */

import { describe, expect, it } from 'vitest';
import { pollDeviceToken } from '../../src/auth/device-poll.js';
import type { DevicePollOptions } from '../../src/auth/device-poll.js';

const ISSUER = 'https://porta.example.test/acme';

/** Build one poll harness with an injected response. */
function harness(response: () => Promise<Response>): {
  options: DevicePollOptions;
  requests: () => number;
} {
  let requests = 0;
  return {
    options: {
      intervalSeconds: 1,
      expiresInSeconds: 60,
      now: () => 0,
      sleep: async () => undefined,
      request: async () => {
        requests += 1;
        return response();
      },
      signal: new AbortController().signal,
    },
    requests: () => requests,
  };
}

/** Build one JSON response. */
function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Poll one request. */
async function poll(harnessValue: ReturnType<typeof harness>) {
  return pollDeviceToken(
    { tokenEndpoint: new URL(`${ISSUER}/token`), clientId: 'client', deviceCode: 'device' },
    harnessValue.options,
  );
}

describe('device token response bounds', () => {
  it.each([
    ['missing access token', { id_token: 'a.b.c', expires_in: 60 }],
    ['malformed id token', { access_token: 'a', id_token: 'not-a-jwt', expires_in: 60 }],
    ['invalid expiry', { access_token: 'a', id_token: 'a.b.c', expires_in: 0 }],
    [
      'overlong access token',
      { access_token: 'a'.repeat(8_193), id_token: 'a.b.c', expires_in: 60 },
    ],
  ])('turns %s into a terminal indeterminate result', async (_case, body) => {
    const value = harness(async () => json(200, body));
    await expect(poll(value)).rejects.toMatchObject({ code: 'indeterminate' });
    expect(value.requests()).toBe(1);
  });

  it('returns a bounded refresh token when present', async () => {
    const value = harness(async () =>
      json(200, {
        access_token: 'access',
        id_token: 'a.b.c',
        expires_in: 60,
        refresh_token: 'refresh',
      }),
    );
    await expect(poll(value)).resolves.toMatchObject({ refresh_token: 'refresh' });
  });

  it('treats an aborted sleep as cancellation', async () => {
    const controller = new AbortController();
    const value = harness(async () => json(400, { error: 'authorization_pending' }));
    const options = {
      ...value.options,
      signal: controller.signal,
      sleep: async () => controller.abort(),
    };
    await expect(
      pollDeviceToken(
        { tokenEndpoint: new URL(`${ISSUER}/token`), clientId: 'client', deviceCode: 'device' },
        options,
      ),
    ).rejects.toBeInstanceOf(DOMException);
  });
});
