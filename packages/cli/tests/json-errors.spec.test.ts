/** Machine-readable failures have a closed vocabulary and never inherit external prose. */
import {
  PortaAuthenticationError,
  PortaConflictError,
  PortaError,
  PortaForbiddenError,
  PortaHttpError,
  PortaNotFoundError,
  PortaRateLimitError,
  PortaServerError,
  PortaValidationError,
} from '@portaidentity/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCliError } from '../src/error-format.js';
import { handleError, withErrorHandling } from '../src/error-handler.js';
import {
  captureCommandOutput,
  CommandExit,
  expectErrorEnvelope,
} from './helpers/json-error-contract.js';

const marker = 'SENSITIVE_MARKER';
const requestId = '11111111-1111-4111-8111-111111111111';
let output: ReturnType<typeof captureCommandOutput>;

beforeEach(() => {
  output = captureCommandOutput();
});
afterEach(() => vi.restoreAllMocks());

describe('classified JSON command errors', () => {
  // Opaque authentication failures cannot establish an observed HTTP status.
  it.each([
    [
      new PortaValidationError({ error: marker }),
      'VALIDATION_ERROR',
      'The request failed validation.',
      400,
      3,
    ],
    [
      new PortaAuthenticationError({ error: marker }),
      'AUTHENTICATION_REQUIRED',
      'Authentication is required.',
      undefined,
      2,
    ],
    [new PortaForbiddenError(), 'FORBIDDEN', 'This operation is not permitted.', 403, 2],
    [new PortaNotFoundError(), 'NOT_FOUND', 'The requested resource was not found.', 404, 1],
    [new PortaConflictError(), 'CONFLICT', 'The request conflicts with existing state.', 409, 1],
    [new PortaRateLimitError(), 'RATE_LIMITED', 'The request was rate limited.', 429, 1],
    [
      new PortaServerError(503),
      'SERVER_ERROR',
      'The server could not complete the request.',
      503,
      1,
    ],
    [new PortaHttpError(418, marker), 'HTTP_ERROR', 'The HTTP request failed.', 418, 1],
  ] as const)(
    'should emit one safe %s envelope and preserve the shared-handler exit',
    (error, code, message, status, exit) => {
      const expected = status === undefined ? { code, message } : { code, message, status };
      expect(formatCliError(error)).toStrictEqual(expected);
      expect(() => handleError(error, false, true)).toThrow(CommandExit);
      expect(process.exit).toHaveBeenCalledExactlyOnceWith(exit);
      expect(output.stdout).toBe('');
      expectErrorEnvelope(output.stderr, expected);
    },
  );

  it('should retain only a validated server request identifier', () => {
    expect(
      formatCliError(new PortaServerError(503, { request_id: requestId, extra: marker })),
    ).toStrictEqual({
      code: 'SERVER_ERROR',
      message: 'The server could not complete the request.',
      status: 503,
      requestId,
    });
  });

  it.each(['not-a-uuid', `${requestId}\n${marker}`, '', marker])(
    'should omit invalid request metadata %s',
    (request_id) => {
      expect(formatCliError(new PortaServerError(503, { request_id }))).toStrictEqual({
        code: 'SERVER_ERROR',
        message: 'The server could not complete the request.',
        status: 503,
      });
    },
  );

  it.each([0, 30, 2_147_483_647])('should retain bounded retry seconds %s', (retryAfter) => {
    expect(formatCliError(new PortaRateLimitError({ extra: marker }, retryAfter))).toStrictEqual({
      code: 'RATE_LIMITED',
      message: 'The request was rate limited.',
      status: 429,
      retryAfter,
    });
  });

  it.each([-1, NaN, Infinity, -Infinity, 0.5, 2_147_483_648])(
    'should omit invalid retry seconds %s',
    (retryAfter) => {
      expect(formatCliError(new PortaRateLimitError(undefined, retryAfter))).toStrictEqual({
        code: 'RATE_LIMITED',
        message: 'The request was rate limited.',
        status: 429,
      });
    },
  );

  it.each([
    new Error(`${marker} HTTP 503`, { cause: new Error(marker) }),
    new PortaError(marker, { cause: { body: marker } }),
    Object.assign(new Error(marker), { name: marker, status: 503 }),
    marker,
    null,
  ])('should classify a non-HTTP failure without inferring status or echoing names', (error) => {
    const expected = { code: 'COMMAND_FAILED', message: 'The command failed.' };
    expect(formatCliError(error)).toStrictEqual(expected);
    expect(() => handleError(error, true, true)).toThrow(CommandExit);
    expect(process.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(output.stdout).toBe('');
    expectErrorEnvelope(output.stderr, expected);
  });

  it('should use the same error contract in the additive async wrapper', async () => {
    const wrapped = withErrorHandling(
      async () => {
        throw new PortaConflictError();
      },
      false,
      true,
    );
    await expect(wrapped()).rejects.toThrow(CommandExit);
    expect(process.exit).toHaveBeenCalledExactlyOnceWith(1);
    expectErrorEnvelope(output.stderr, {
      code: 'CONFLICT',
      message: 'The request conflicts with existing state.',
      status: 409,
    });
    expect(output.stdout).toBe('');
  });

  // False JSON mode must keep the established public human text and exit.
  it.each([undefined, false])('should retain human conflict output when JSON is %s', (json) => {
    const error = new PortaConflictError({ error: 'Conflict' });
    expect(() =>
      json === undefined ? handleError(error, false) : handleError(error, false, json),
    ).toThrow(CommandExit);
    expect(process.exit).toHaveBeenCalledExactlyOnceWith(1);
    // eslint-disable-next-line no-control-regex -- Strip ANSI colours only to compare the unchanged human text.
    expect(output.stderr.replace(/\u001b\[[0-9;]*m/g, '')).toContain('Conflict: Conflict');
    expect(output.stderr).not.toContain('"code"');
    expect(output.stdout).toBe('');
  });
});
