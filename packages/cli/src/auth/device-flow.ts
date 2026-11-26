/**
 * Device authorization coordinator for `porta login --device-code`.
 *
 * The coordinator validates discovery metadata, requests a device code,
 * presents the user code, polls the token endpoint, verifies the ID token
 * without an OIDC nonce, fetches UserInfo and persists the existing credential
 * shape. It never prints or stores the device code.
 */

import { fetchVerifiedUserInfo } from '../admin/session-service.js';
import { fetchIssuerJwks, verifyDeviceIdToken } from './id-token-verifier.js';
import { fetchAdminMetadata } from './metadata.js';
import { DeviceLoginError, pollDeviceToken } from './device-poll.js';
import type { AuthFlowResult, CliAuthOperationOptions } from './types.js';
import type { CancelledLogin, VerifiedSession } from './login-coordinator.js';

/** Full RFC 8628 grant value. */
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

/** Scopes requested by the CLI device login. */
const DEVICE_SCOPES = 'openid profile email offline_access';

/** Provider user-code alphabet and mask. */
const USER_CODE_PATTERN = /^[BCDFGHJKLMNPQRSTVWXZ]{1,32}-?[BCDFGHJKLMNPQRSTVWXZ]{1,32}$/;

/** Maximum accepted server field lengths. */
const MAX_DEVICE_CODE_LENGTH = 4096;
const MAX_USER_CODE_LENGTH = 64;
const MAX_URL_LENGTH = 2048;

/** Re-export the terminal failure type for command and test consumers. */
export { DeviceLoginError } from './device-poll.js';
export type { DeviceLoginErrorCode } from './device-poll.js';

/** Validated device discovery values. */
export interface DeviceMetadata {
  /** Exact issuer. */
  readonly issuer: string;
  /** Absolute device authorization endpoint. */
  readonly deviceAuthorizationEndpoint: string;
  /** Absolute token endpoint. */
  readonly tokenEndpoint: string;
}

/** Validated device authorization response. */
export interface DeviceAuthorization {
  /** Opaque device code, never printed. */
  readonly deviceCode: string;
  /** User-facing code shown on the device. */
  readonly userCode: string;
  /** Absolute verification URL. */
  readonly verificationUri: string;
  /** Optional complete verification URL. */
  readonly verificationUriComplete?: string;
  /** Lifetime in seconds. */
  readonly expiresIn: number;
  /** Advertised polling interval in seconds. */
  readonly interval: number;
}

/** UI interactions needed by the device authorization coordinator. */
export interface DeviceCodeLoginInteraction {
  /** Prints or otherwise presents the verification URL and code. */
  readonly presentDeviceCode: (
    verificationUri: URL,
    userCode: string,
    expiresAt: Date,
    signal: AbortSignal,
  ) => Promise<void>;
  /** Confirms replacement of credentials belonging to another origin. */
  readonly confirmCredentialReplacement: (
    currentServer: URL,
    nextServer: URL,
    signal: AbortSignal,
  ) => Promise<boolean>;
}

/** Inputs for one device authorization login. */
export interface DeviceCodeLoginRequest {
  /** Selected Porta server origin. */
  readonly server: URL;
  /** Optional public client override. */
  readonly clientId?: string;
  /** Existing credential origin, when one is stored. */
  readonly currentServer?: URL;
  /** Persists the verified credential shape. */
  readonly persistCredentials?: (credentials: AuthFlowResult) => Promise<void> | void;
}

/** Return true only for a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Return a bounded non-empty string. */
function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

/** Return a positive safe integer. */
function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** Return one exact HTTPS URL under the issuer origin. */
function validateHttpsUrl(
  value: unknown,
  expectedOrigin: string,
  issuerPath: string,
): URL | undefined {
  if (!boundedString(value, MAX_URL_LENGTH)) return undefined;
  try {
    const parsed = new URL(value);
    const loopback =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '[::1]';
    if (
      (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) ||
      parsed.origin !== expectedOrigin ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      !parsed.pathname.startsWith(issuerPath)
    ) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Validate the discovery document for device login.
 *
 * @param metadata - Parsed discovery JSON
 * @param selectedServer - Selected server origin
 * @param adminIssuer - Exact issuer returned by `/api/admin/metadata`
 * @returns Validated endpoints
 * @throws {DeviceLoginError} With code `unsupported` for any mismatch
 */
export function validateDeviceMetadata(
  metadata: unknown,
  selectedServer: URL,
  adminIssuer: string,
): DeviceMetadata {
  if (!isRecord(metadata) || metadata['issuer'] !== adminIssuer) {
    throw new DeviceLoginError('unsupported', 'Server does not support device login.');
  }
  const issuer = new URL(adminIssuer);
  const endpoint = validateHttpsUrl(
    metadata['device_authorization_endpoint'],
    selectedServer.origin,
    issuer.pathname,
  );
  const grants = metadata['grant_types_supported'];
  if (
    endpoint === undefined ||
    !Array.isArray(grants) ||
    !grants.includes(DEVICE_GRANT)
  ) {
    throw new DeviceLoginError('unsupported', 'Server does not support device login.');
  }
  const tokenEndpointValue = metadata['token_endpoint'];
  const tokenEndpoint =
    typeof tokenEndpointValue === 'string'
      ? tokenEndpointValue.replace(/\/+$/, '')
      : undefined;
  if (tokenEndpoint !== `${adminIssuer.replace(/\/+$/, '')}/token`) {
    throw new DeviceLoginError('unsupported', 'Server does not support device login.');
  }
  return {
    issuer: adminIssuer.replace(/\/+$/, ''),
    deviceAuthorizationEndpoint: endpoint.toString(),
    tokenEndpoint,
  };
}

/** Read and validate the device authorization response. */
function parseDeviceAuthorization(
  value: unknown,
  metadata: DeviceMetadata,
  selectedServer: URL,
): DeviceAuthorization {
  if (!isRecord(value)) {
    throw new DeviceLoginError('unknown', 'The server returned an invalid device response.');
  }
  const deviceCode = value['device_code'];
  const userCode = value['user_code'];
  const verificationUri = value['verification_uri'];
  const completeUri = value['verification_uri_complete'];
  const expiresIn = positiveInteger(value['expires_in']);
  const intervalValue = value['interval'];
  const interval =
    intervalValue === undefined ? 5 : positiveInteger(intervalValue) ?? 5;
  const issuerPath = new URL(metadata.issuer).pathname;
  const verification = validateHttpsUrl(verificationUri, selectedServer.origin, issuerPath);
  const complete =
    completeUri === undefined
      ? undefined
      : validateHttpsUrl(completeUri, selectedServer.origin, issuerPath);

  if (
    !boundedString(deviceCode, MAX_DEVICE_CODE_LENGTH) ||
    !boundedString(userCode, MAX_USER_CODE_LENGTH) ||
    !USER_CODE_PATTERN.test(userCode) ||
    verification === undefined ||
    verification.pathname !== `${issuerPath.replace(/\/+$/, '')}/device` ||
    (completeUri !== undefined && complete === undefined) ||
    expiresIn === undefined ||
    expiresIn > 3600 ||
    interval < 1 ||
    interval > 60
  ) {
    throw new DeviceLoginError('unknown', 'The server returned an invalid device response.');
  }

  return {
    deviceCode,
    userCode,
    verificationUri: verification.toString(),
    ...(complete === undefined ? {} : { verificationUriComplete: complete.toString() }),
    expiresIn,
    interval,
  };
}

/** Request one device authorization from the validated endpoint. */
async function requestDeviceAuthorization(
  metadata: DeviceMetadata,
  selectedServer: URL,
  clientId: string,
  options: CliAuthOperationOptions,
): Promise<DeviceAuthorization> {
  let response: Response;
  try {
    response = await fetch(metadata.deviceAuthorizationEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, scope: DEVICE_SCOPES }).toString(),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new DeviceLoginError(
      'unknown',
      'Could not reach the device authorization endpoint.',
      { cause: error },
    );
  }

  if (response.status === 400 || response.status === 401) {
    throw new DeviceLoginError(
      'unsupported',
      'The admin CLI client does not have the device authorization grant. Enable it through the Admin API, SDK, CLI or Admin terminal, then retry.',
    );
  }
  if (!response.ok) {
    throw new DeviceLoginError('unknown', 'The server rejected the device authorization request.');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DeviceLoginError('unknown', 'The server returned an invalid device response.');
  }
  return parseDeviceAuthorization(body, metadata, selectedServer);
}

/** Default abortable sleep used by the live CLI. */
function defaultSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/**
 * Authenticate through the RFC 8628 device authorization grant.
 *
 * @param request - Server, optional client and credential callbacks
 * @param interaction - Code presentation and credential replacement confirmation
 * @param options - Cancellation boundary
 * @returns A verified session or a typed cancellation
 */
export async function authenticateDeviceCodeSession(
  request: DeviceCodeLoginRequest,
  interaction: DeviceCodeLoginInteraction,
  options: CliAuthOperationOptions,
): Promise<VerifiedSession | CancelledLogin> {
  try {
    const metadata = await fetchAdminMetadata(request.server.origin, options);
    const discoveryResponse = await fetch(
      `${metadata.issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`,
      { signal: options.signal },
    );
    if (!discoveryResponse.ok) {
      throw new DeviceLoginError('unsupported', 'Server does not support device login.');
    }
    const discovery: unknown = await discoveryResponse.json();
    const deviceMetadata = validateDeviceMetadata(discovery, request.server, metadata.issuer);
    const clientId = request.clientId ?? metadata.clientId;

    const authorization = await requestDeviceAuthorization(
      deviceMetadata,
      request.server,
      clientId,
      options,
    );
    await interaction.presentDeviceCode(
      new URL(authorization.verificationUri),
      authorization.userCode,
      new Date(Date.now() + authorization.expiresIn * 1000),
      options.signal,
    );

    const tokens = await pollDeviceToken(
      {
        tokenEndpoint: new URL(deviceMetadata.tokenEndpoint),
        clientId,
        deviceCode: authorization.deviceCode,
      },
      {
        intervalSeconds: authorization.interval,
        expiresInSeconds: authorization.expiresIn,
        now: () => Date.now(),
        sleep: defaultSleep,
        request: async (body, { signal }) =>
          fetch(deviceMetadata.tokenEndpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            signal,
          }),
        signal: options.signal,
      },
    );

    const jwks = await fetchIssuerJwks(`${deviceMetadata.issuer}/jwks`, options);
    const idTokenIdentity = await verifyDeviceIdToken({
      token: tokens.id_token,
      issuer: deviceMetadata.issuer,
      clientId,
      jwks,
    });
    const profile = await fetchVerifiedUserInfo(
      {
        selectedServer: request.server,
        orgSlug: metadata.orgSlug,
        accessToken: tokens.access_token,
        originalSubject: idTokenIdentity.sub,
      },
      options,
    );
    const { identity } = profile;
    const credentials: AuthFlowResult = {
      server: request.server.origin,
      orgSlug: metadata.orgSlug,
      clientId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      userInfo: {
        sub: identity.sub,
        email: identity.email ?? '',
        name: identity.name,
      },
    };

    if (request.currentServer && request.currentServer.origin !== request.server.origin) {
      const approved = await interaction.confirmCredentialReplacement(
        request.currentServer,
        request.server,
        options.signal,
      );
      if (!approved) return { status: 'cancelled' };
    }
    if (options.signal.aborted) return { status: 'cancelled' };
    await request.persistCredentials?.(credentials);
    return { status: 'authenticated', identity, capabilities: profile.capabilities, credentials };
  } catch (error) {
    if (options.signal.aborted) return { status: 'cancelled' };
    if (error instanceof DOMException && error.name === 'AbortError') return { status: 'cancelled' };
    if (error instanceof DeviceLoginError) throw error;
    throw new DeviceLoginError(
      'unknown',
      'Device login could not be completed. Start a new login.',
      { cause: error },
    );
  }
}
