/**
 * Specification tests for device discovery validation and polling.
 *
 * The CLI must fail closed on incomplete or foreign discovery metadata,
 * poll at the advertised interval, consume 429/Retry-After safely, and never
 * retry an exchange after the request was dispatched.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  DeviceLoginError,
  validateDeviceMetadata,
} from '../../src/auth/device-flow.js';
import {
  DeviceRequestNotSentError,
  pollDeviceToken,
} from '../../src/auth/device-poll.js';
import type { DevicePollOptions } from '../../src/auth/device-poll.js';

/** Full RFC 8628 grant value. */
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
const ISSUER = 'https://porta.example.test/acme';

/** Build a JSON response with optional headers. */
function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** Build a valid discovery document. */
function metadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    issuer: ISSUER,
    device_authorization_endpoint: `${ISSUER}/device/auth`,
    grant_types_supported: ['authorization_code', DEVICE_GRANT],
    token_endpoint: `${ISSUER}/token`,
    jwks_uri: `${ISSUER}/jwks`,
    ...overrides,
  };
}

/** Build poll options with an injected clock, sleep and transport. */
interface PollHarness {
  readonly options: DevicePollOptions;
  readonly sleeps: number[];
  readonly requests: () => number;
}

function pollOptions(
  responses: Array<() => Promise<Response>>,
  overrides: Partial<DevicePollOptions> = {},
): PollHarness {
  let now = 0;
  let requests = 0;
  const sleeps: number[] = [];
  const options: DevicePollOptions = {
    intervalSeconds: 5,
    expiresInSeconds: 600,
    now: () => now,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      now += milliseconds;
    },
    request: async () => {
      const next = responses[requests];
      requests += 1;
      if (!next) throw new Error('Unexpected extra poll');
      return next();
    },
    signal: new AbortController().signal,
    ...overrides,
  };
  return { options, sleeps, requests: () => requests };
}

/** One successful token response. */
const TOKENS = {
  access_token: 'access-token',
  id_token: 'header.payload.signature',
  token_type: 'Bearer',
  expires_in: 3600,
  refresh_token: 'refresh-token',
};

describe('validateDeviceMetadata', () => {
  it('accepts exact issuer, endpoint, grant and token endpoint', () => {
    const result = validateDeviceMetadata(metadata(), new URL('https://porta.example.test'), ISSUER);
    expect(result.deviceAuthorizationEndpoint).toBe(`${ISSUER}/device/auth`);
    expect(result.tokenEndpoint).toBe(`${ISSUER}/token`);
  });

  it('rejects a missing endpoint, missing grant, or foreign URL', () => {
    expect(() =>
      validateDeviceMetadata(
        metadata({ device_authorization_endpoint: undefined }),
        new URL('https://porta.example.test'),
        ISSUER,
      ),
    ).toThrow(DeviceLoginError);

    expect(() =>
      validateDeviceMetadata(
        metadata({ grant_types_supported: ['authorization_code'] }),
        new URL('https://porta.example.test'),
        ISSUER,
      ),
    ).toThrow(DeviceLoginError);

    expect(() =>
      validateDeviceMetadata(
        metadata({ device_authorization_endpoint: 'https://evil.example/device/auth' }),
        new URL('https://porta.example.test'),
        ISSUER,
      ),
    ).toThrow(DeviceLoginError);
  });
});

describe('pollDeviceToken', () => {
  it('continues on authorization_pending and returns tokens', async () => {
    const options = pollOptions([
      async () => jsonResponse(400, { error: 'authorization_pending' }),
      async () => jsonResponse(200, TOKENS),
    ]);
    const tokens = await pollDeviceToken(
      { tokenEndpoint: new URL(`${ISSUER}/token`), clientId: 'client', deviceCode: 'device' },
      options.options,
    );

    expect(tokens.access_token).toBe('access-token');
    expect(options.requests()).toBe(2);
    expect(options.sleeps).toEqual([5000, 5000]);
  });

  it('increases the interval by five seconds on slow_down and caps it at sixty', async () => {
    const options = pollOptions(
      [
        async () => jsonResponse(400, { error: 'slow_down' }),
        async () => jsonResponse(400, { error: 'slow_down' }),
        async () => jsonResponse(200, TOKENS),
      ],
      { intervalSeconds: 55 },
    );
    await pollDeviceToken(
      { tokenEndpoint: new URL(`${ISSUER}/token`), clientId: 'client', deviceCode: 'device' },
      options.options,
    );
    expect(options.sleeps).toEqual([55_000, 60_000, 60_000]);
  });

  it.each([
    ['5', 5000],
    ['120', 60_000],
    [undefined, 5000],
  ])('waits within [interval, 60] for Retry-After %s', async (retryAfter, expectedWait) => {
    const headers: Record<string, string> =
      retryAfter === undefined ? {} : { 'retry-after': retryAfter };
    const options = pollOptions([
      async () => jsonResponse(429, { error: 'rate_limit_exceeded' }, headers),
      async () => jsonResponse(200, TOKENS),
    ]);
    await pollDeviceToken(
      { tokenEndpoint: new URL(`${ISSUER}/token`), clientId: 'client', deviceCode: 'device' },
      options.options,
    );
    expect(options.sleeps[0]).toBe(5000);
    expect(options.sleeps[1]).toBeGreaterThanOrEqual(5000);
    expect(options.sleeps[1]).toBeLessThanOrEqual(60_000);
    expect(options.sleeps[1]).toBe(expectedWait);
  });

  it.each(['access_denied', 'expired_token', 'invalid_grant'])(
    'stops on terminal OAuth error %s',
    async (error) => {
      const options = pollOptions([async () => jsonResponse(400, { error })]);
      await expect(
        pollDeviceToken(
          { tokenEndpoint: new URL(`${ISSUER}/token`), clientId: 'client', deviceCode: 'device' },
          options.options,
        ),
      ).rejects.toMatchObject({ code: error });
      expect(options.requests()).toBe(1);
    },
  );

  it('does not retry a 5xx or a network timeout after the request was dispatched', async () => {
    const serverError = pollOptions([async () => jsonResponse(503, { error: 'server_error' })]);
    await expect(
      pollDeviceToken(
        { tokenEndpoint: new URL(`${ISSUER}/token`), clientId: 'client', deviceCode: 'device' },
        serverError.options,
      ),
    ).rejects.toMatchObject({ code: 'indeterminate' });
    expect(serverError.requests()).toBe(1);

    const timeout = pollOptions([
      async () => {
        throw new Error('request timed out');
      },
    ]);
    await expect(
      pollDeviceToken(
        { tokenEndpoint: new URL(`${ISSUER}/token`), clientId: 'client', deviceCode: 'device' },
        timeout.options,
      ),
    ).rejects.toMatchObject({ code: 'indeterminate' });
    expect(timeout.requests()).toBe(1);
  });

  it('retries a provably pre-dispatch connection failure', async () => {
    const options = pollOptions([
      async () => {
        throw new DeviceRequestNotSentError('connection refused');
      },
      async () => jsonResponse(200, TOKENS),
    ]);
    await pollDeviceToken(
      { tokenEndpoint: new URL(`${ISSUER}/token`), clientId: 'client', deviceCode: 'device' },
      options.options,
    );
    expect(options.requests()).toBe(2);
  });

  it('treats unknown OAuth errors and statuses as terminal', async () => {
    const oauth = pollOptions([async () => jsonResponse(400, { error: 'unexpected_error' })]);
    await expect(
      pollDeviceToken(
        { tokenEndpoint: new URL(`${ISSUER}/token`), clientId: 'client', deviceCode: 'device' },
        oauth.options,
      ),
    ).rejects.toMatchObject({ code: 'unknown' });

    const status = pollOptions([async () => jsonResponse(418, { error: 'teapot' })]);
    await expect(
      pollDeviceToken(
        { tokenEndpoint: new URL(`${ISSUER}/token`), clientId: 'client', deviceCode: 'device' },
        status.options,
      ),
    ).rejects.toMatchObject({ code: 'unknown' });
  });

  it('never sleeps past the deadline', async () => {
    const options = pollOptions(
      [
        async () => jsonResponse(400, { error: 'authorization_pending' }),
        async () => jsonResponse(400, { error: 'authorization_pending' }),
      ],
      { expiresInSeconds: 10 },
    );
    await expect(
      pollDeviceToken(
        { tokenEndpoint: new URL(`${ISSUER}/token`), clientId: 'client', deviceCode: 'device' },
        options.options,
      ),
    ).rejects.toMatchObject({ code: 'expired_token' });
    expect(options.sleeps).toEqual([5000, 5000]);
  });

  it('stops when the operation signal is aborted', async () => {
    const controller = new AbortController();
    const options = pollOptions(
      [async () => jsonResponse(400, { error: 'authorization_pending' })],
      {
        signal: controller.signal,
        sleep: vi.fn(async () => {
          controller.abort();
        }),
      },
    );
    await expect(
      pollDeviceToken(
        { tokenEndpoint: new URL(`${ISSUER}/token`), clientId: 'client', deviceCode: 'device' },
        options.options,
      ),
    ).rejects.toBeInstanceOf(DOMException);
  });
});
