/** External diagnostics and opaque authentication failures never become machine-readable secrets. */
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { PortaAuthenticationError, PortaHttpError, PortaValidationError } from '@portaidentity/sdk';
import { createCliAuth } from '@portaidentity/sdk/node';
import type { StoredCredentials } from '@portaidentity/sdk/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCliError } from '../../src/error-format.js';
import { handleError } from '../../src/error-handler.js';
import {
  captureCommandOutput,
  CommandExit,
  createEmptyHome,
  expectErrorEnvelope,
  removeEmptyHome,
} from '../helpers/json-error-contract.js';

const marker = 'SENSITIVE_MARKER';
let home: string;
let output: ReturnType<typeof captureCommandOutput>;

beforeEach(async () => {
  home = await createEmptyHome();
  vi.stubEnv('HOME', home);
  output = captureCommandOutput();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected HTTP request')));
});
afterEach(async () => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await removeEmptyHome(home);
});

/** An expired in-memory snapshot; no credential file is ever created. */
function expiredCredentials(): StoredCredentials {
  return {
    server: 'https://porta.example.test',
    orgSlug: 'porta-admin',
    clientId: 'porta-cli',
    accessToken: `${marker}_access`,
    refreshToken: `${marker}_refresh`,
    idToken: `${marker}_id`,
    expiresAt: '2000-01-01T00:00:00.000Z',
    userInfo: { sub: 'synthetic-subject', email: 'operator@example.test' },
  };
}

describe('verbose JSON redaction', () => {
  // Fixed messages must survive controls, forged codes, nested details, causes and stacks.
  it.each([
    marker,
    `${marker}\nforged line`,
    `${marker}\r\n`,
    `${marker}\u001b[31m`,
    `${marker}\u0000`,
  ])('should discard external diagnostic payload %j even with verbose enabled', (payload) => {
    const error = Object.assign(
      new PortaHttpError(503, payload, {
        error: payload,
        details: [{ path: payload, message: payload }],
        code: payload,
      }),
      { cause: new Error(payload), stack: payload, name: payload },
    );
    expect(() => handleError(error, true, true)).toThrow(CommandExit);
    expectErrorEnvelope(output.stderr, {
      code: 'SERVER_ERROR',
      message: 'The server could not complete the request.',
      status: 503,
    });
    expect(output.stdout).toBe('');
    expect(`${output.stderr}${output.stdout}`).not.toContain(marker);
    expect(process.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('should discard validation field names, rejected values and nested diagnostics', () => {
    const error = new PortaValidationError({
      error: marker,
      details: [{ path: `${marker}.claim`, message: marker, code: marker, value: marker }],
    });
    expect(() => handleError(error, true, true)).toThrow(CommandExit);
    expectErrorEnvelope(output.stderr, {
      code: 'VALIDATION_ERROR',
      message: 'The request failed validation.',
      status: 400,
    });
    expect(output.stdout).toBe('');
    expect(output.stderr).not.toContain(marker);
  });
});

describe('public SDK authentication provenance', () => {
  it.each(['missing', 'refresh400', 'refresh500', 'transport'] as const)(
    'should omit fabricated HTTP status for %s through real createCliAuth/getToken',
    async (scenario) => {
      const credentialsPath = join(home, 'never-created-credentials.json');
      const read = vi.spyOn(fs, 'readFile');
      if (scenario === 'missing') {
        read.mockRejectedValue(Object.assign(new Error(marker), { code: 'ENOENT' }));
      } else {
        read.mockResolvedValue(JSON.stringify(expiredCredentials()));
      }
      // Native SDK imports must see the same external filesystem stub, even when externalized.
      syncBuiltinESMExports();
      const fetch = vi.fn();
      if (scenario === 'transport') {
        fetch.mockRejectedValue(new TypeError(marker));
      } else {
        fetch.mockResolvedValue(
          new Response(JSON.stringify({ error: marker, details: marker }), {
            status: scenario === 'refresh500' ? 500 : 400,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      vi.stubGlobal('fetch', fetch);
      const auth = createCliAuth({ credentialsPath });
      let failure: unknown;
      try {
        await auth.getToken();
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(PortaAuthenticationError);
      const expected = { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' };
      expect(formatCliError(failure)).toStrictEqual(expected);
      expect(() => handleError(failure, true, true)).toThrow(CommandExit);
      expectErrorEnvelope(output.stderr, expected);
      expect(output.stdout).toBe('');
      expect(output.stderr).not.toContain(marker);
      expect(process.exit).toHaveBeenCalledExactlyOnceWith(2);
      expect(read).toHaveBeenCalled();
      for (const [path] of read.mock.calls) expect(path).toBe(credentialsPath);
      expect(fetch).toHaveBeenCalledTimes(scenario === 'missing' ? 0 : 1);
    },
  );
});
