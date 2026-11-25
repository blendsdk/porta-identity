/**
 * Device authorization polling and token-response validation.
 *
 * The poll loop is deliberately conservative. After a token request has been
 * dispatched, a timeout or 5xx is terminal: the provider consumes the device
 * code on success and a replay revokes the first token set. Only a failure
 * proven to occur before dispatch may be retried.
 *
 * Sleep, clock and transport are injectable so the contract can be tested
 * without wall-clock delays.
 */

import type { TokenResponse } from './types.js';

/** Full RFC 8628 grant value. */
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

/** Maximum accepted opaque field lengths. */
const MAX_ACCESS_TOKEN_LENGTH = 8192;
const MAX_ID_TOKEN_LENGTH = 16384;
const MAX_REFRESH_TOKEN_LENGTH = 8192;

/** Maximum `device_code` field length accepted from the server. */
const MAX_DEVICE_CODE_LENGTH = 4096;

/** Terminal and retryable outcomes from the device token endpoint. */
export type DeviceLoginErrorCode =
  | 'unsupported'
  | 'access_denied'
  | 'expired_token'
  | 'invalid_grant'
  | 'rate_limited'
  | 'indeterminate'
  | 'unknown';

/** Client-safe device login failure. */
export class DeviceLoginError extends Error {
  /** Stable failure category used by command and UI mapping. */
  readonly code: DeviceLoginErrorCode;

  constructor(code: DeviceLoginErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DeviceLoginError';
    this.code = code;
  }
}

/**
 * A transport failure known to occur before the request was dispatched.
 *
 * Only this failure may be retried with the same device code. A timeout,
 * connection reset after send, or 5xx is terminal.
 */
export class DeviceRequestNotSentError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DeviceRequestNotSentError';
  }
}

/** Request values retained for one polling attempt. */
export interface DevicePollRequest {
  /** Absolute token endpoint. */
  readonly tokenEndpoint: URL;
  /** Public CLI client identifier. */
  readonly clientId: string;
  /** Opaque device code from the authorization response. */
  readonly deviceCode: string;
}

/** Injectable polling boundaries. */
export interface DevicePollOptions {
  /** Advertised interval in seconds. */
  readonly intervalSeconds: number;
  /** Device-code lifetime in seconds. */
  readonly expiresInSeconds: number;
  /** Monotonic clock in milliseconds. */
  readonly now: () => number;
  /** Abortable sleep for one duration in milliseconds. */
  readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  /** Send one token request; the caller builds the form body and headers. */
  readonly request: (body: URLSearchParams, options: { signal: AbortSignal }) => Promise<Response>;
  /** Cancellation signal. */
  readonly signal: AbortSignal;
}

/** Return true only for a non-empty bounded string. */
function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

/** Parse one positive integer field. */
function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** Return true only for a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Read a JSON object body without exposing parse details. */
async function readJsonObject(response: Response): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await response.json();
    return isRecord(body) ? body : undefined;
  } catch {
    return undefined;
  }
}

/** Validate the complete token response after a successful poll. */
function validateTokenResponse(body: Record<string, unknown>): TokenResponse {
  const accessToken = body['access_token'];
  const idToken = body['id_token'];
  const refreshToken = body['refresh_token'];
  const expiresIn = positiveInteger(body['expires_in']);
  if (
    !boundedString(accessToken, MAX_ACCESS_TOKEN_LENGTH) ||
    !boundedString(idToken, MAX_ID_TOKEN_LENGTH) ||
    idToken.split('.').length !== 3 ||
    expiresIn === undefined ||
    (refreshToken !== undefined && !boundedString(refreshToken, MAX_REFRESH_TOKEN_LENGTH))
  ) {
    throw new DeviceLoginError(
      'indeterminate',
      'The server returned an invalid token response. Start a new login.',
    );
  }
  return {
    access_token: accessToken,
    id_token: idToken,
    expires_in: expiresIn,
    ...(refreshToken === undefined ? {} : { refresh_token: refreshToken }),
  };
}

/** Parse an integer `Retry-After` header in seconds. */
function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (value === null || !/^\d+$/.test(value.trim())) return undefined;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined;
}

/** Throw the terminal error for one OAuth error code. */
function terminalOAuthError(code: string): never {
  switch (code) {
    case 'access_denied':
      throw new DeviceLoginError('access_denied', 'The sign-in request was denied.');
    case 'expired_token':
      throw new DeviceLoginError('expired_token', 'The device code expired. Start a new login.');
    case 'invalid_grant':
      throw new DeviceLoginError(
        'invalid_grant',
        'The device code is invalid or already used. Start a new login.',
      );
    default:
      throw new DeviceLoginError(
        'unknown',
        'The server returned an unexpected OAuth error. Start a new login.',
      );
  }
}

/** Return true when an unknown value is an abort error. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Poll the token endpoint until success, a terminal error or the deadline.
 *
 * @param request - Endpoint, client and device code
 * @param options - Clock, sleep, transport and cancellation boundaries
 * @returns A validated token response
 * @throws {DeviceLoginError} For every terminal or indeterminate outcome
 * @throws {DOMException} When the operation is aborted
 */
export async function pollDeviceToken(
  request: DevicePollRequest,
  options: DevicePollOptions,
): Promise<TokenResponse> {
  const deadline = options.now() + Math.max(1, options.expiresInSeconds) * 1000;
  let interval = Math.max(1, Math.min(60, options.intervalSeconds));

  const sleepWithinDeadline = async (milliseconds: number): Promise<void> => {
    const remaining = deadline - options.now();
    if (remaining <= 0) {
      throw new DeviceLoginError('expired_token', 'The device code expired. Start a new login.');
    }
    await options.sleep(Math.min(milliseconds, remaining), options.signal);
    if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
  };

  await sleepWithinDeadline(interval * 1000);

  for (;;) {
    if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (options.now() >= deadline) {
      throw new DeviceLoginError('expired_token', 'The device code expired. Start a new login.');
    }

    const body = new URLSearchParams({
      grant_type: DEVICE_GRANT,
      device_code: request.deviceCode,
      client_id: request.clientId,
    });

    let response: Response;
    try {
      response = await options.request(body, { signal: options.signal });
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (error instanceof DeviceRequestNotSentError) {
        await sleepWithinDeadline(interval * 1000);
        continue;
      }
      throw new DeviceLoginError(
        'indeterminate',
        'The token request outcome could not be confirmed. Start a new login.',
        { cause: error },
      );
    }

    if (response.status === 200) {
      const responseBody = await readJsonObject(response);
      if (!responseBody) {
        throw new DeviceLoginError(
          'indeterminate',
          'The server returned an invalid token response. Start a new login.',
        );
      }
      return validateTokenResponse(responseBody);
    }

    if (response.status === 400) {
      const errorBody = await readJsonObject(response);
      const error = typeof errorBody?.['error'] === 'string' ? errorBody['error'] : 'unknown';
      if (error === 'authorization_pending') {
        await sleepWithinDeadline(interval * 1000);
        continue;
      }
      if (error === 'slow_down') {
        interval = Math.min(60, interval + 5);
        await sleepWithinDeadline(interval * 1000);
        continue;
      }
      terminalOAuthError(error);
    }

    if (response.status === 429) {
      const retryAfter = retryAfterSeconds(response);
      const waitSeconds = Math.min(60, Math.max(retryAfter ?? interval, interval));
      await sleepWithinDeadline(waitSeconds * 1000);
      continue;
    }

    if (response.status >= 500) {
      throw new DeviceLoginError(
        'indeterminate',
        'The token request outcome could not be confirmed. Start a new login.',
      );
    }

    throw new DeviceLoginError(
      'unknown',
      'The server returned an unexpected response. Start a new login.',
    );
  }
}

/** Return the maximum accepted device-code field length. */
export const MAX_DEVICE_AUTHORIZATION_CODE_LENGTH = MAX_DEVICE_CODE_LENGTH;
