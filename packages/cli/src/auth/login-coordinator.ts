/** UI-neutral coordination for the CLI Authorization Code + PKCE flow. */

import open from 'open';
import { MANUAL_REDIRECT_URI, startCallbackServer } from './callback-server.js';
import { exchangeAuthorizationCode } from './browser-flow.js';
import { fetchIssuerJwks, verifyCliIdToken } from './id-token-verifier.js';
import { fetchAdminMetadata } from './metadata.js';
import { generateCodeChallenge, generateCodeVerifier, generateState } from './pkce.js';
import { fetchVerifiedUserInfo } from '../admin/session-service.js';
import type { AuthFlowResult, CliAuthOperationOptions, VerifiedIdentity } from './types.js';

const AUTHORIZATION_SCOPES = 'openid profile email offline_access';

/** Keeps a definite credential-write failure distinct from cancellation. */
class CredentialPersistenceError extends Error {
  /** Creates a sanitized persistence failure while retaining its internal cause. */
  constructor(cause: unknown) {
    super('Unable to save credentials.', { cause });
    this.name = 'CredentialPersistenceError';
  }
}

/** Parameters used to create one authorization request. */
export interface AuthorizationRequestOptions {
  /** Exact organization issuer. */
  readonly issuer: string;
  /** Public CLI client identifier. */
  readonly clientId: string;
  /** Redirect URI registered for the native CLI. */
  readonly redirectUri?: string;
}

/** Security values bound to one authorization request and callback. */
export interface AuthorizationRequest {
  /** Complete browser authorization URL. */
  readonly url: URL;
  /** CSRF state value. */
  readonly state: string;
  /** OIDC nonce value. */
  readonly nonce: string;
  /** PKCE verifier retained for the token exchange. */
  readonly codeVerifier: string;
  /** Exact redirect URI included in the request. */
  readonly redirectUri: string;
}

/** UI interactions needed by the authentication coordinator. */
export interface LoginInteraction {
  /** Shows a browser URL when automatic opening is unavailable. */
  readonly presentAuthorizationUrl: (url: URL, signal: AbortSignal) => Promise<void>;
  /** Reads one complete callback URL from the owning UI. */
  readonly requestManualCallback: (signal: AbortSignal) => Promise<string>;
  /** Confirms replacement of credentials belonging to another origin. */
  readonly confirmCredentialReplacement: (
    currentServer: URL,
    nextServer: URL,
    signal: AbortSignal,
  ) => Promise<boolean>;
}

/** Injectable boundaries used by a CLI authentication attempt. */
export interface LoginRequest {
  /** Selected Porta server origin. */
  readonly server: URL;
  /** Optional public client override retained for existing CLI usage. */
  readonly clientId?: string;
  /** Uses pasted callback completion instead of a local listener. */
  readonly noBrowser?: boolean;
  /** Browser opener, injectable for tests and alternate UIs. */
  readonly openBrowser?: (url: URL) => Promise<unknown>;
  /** Existing profile origin, used to prevent silent cross-server replacement. */
  readonly currentServer?: URL;
  /** Persists only a fully authenticated credential result. */
  readonly persistCredentials?: (credentials: AuthFlowResult) => Promise<void> | void;
}

/** Result returned after a successful authenticated login. */
export interface VerifiedSession {
  /** Successful login discriminator. */
  readonly status: 'authenticated';
  /** Fully verified identity accepted from the ID token. */
  readonly identity: VerifiedIdentity;
  /** Credentials committed by the coordinator. */
  readonly credentials: AuthFlowResult;
}

/** Typed cancellation returned without persisting partial authentication state. */
export interface CancelledLogin {
  /** Cancellation discriminator. */
  readonly status: 'cancelled';
}

/** Creates fresh state, PKCE, and nonce values for one browser request. */
export async function createAuthorizationRequest(
  options: AuthorizationRequestOptions,
): Promise<AuthorizationRequest> {
  const state = generateState();
  const nonce = generateState();
  const codeVerifier = generateCodeVerifier();
  const redirectUri = options.redirectUri ?? MANUAL_REDIRECT_URI;
  const url = new URL(`${options.issuer.replace(/\/+$/, '')}/auth`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', options.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', AUTHORIZATION_SCOPES);
  url.searchParams.set('code_challenge', generateCodeChallenge(codeVerifier));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('prompt', 'login consent');
  return { url, state, nonce, codeVerifier, redirectUri };
}

/** Validates one callback URL against its exact request state. */
export function validateAuthorizationCallback(
  callbackUrl: string,
  request: AuthorizationRequest,
): string {
  try {
    const url = new URL(callbackUrl);
    const expected = new URL(request.redirectUri);
    const code = url.searchParams.get('code');
    if (
      url.origin !== expected.origin ||
      url.pathname !== expected.pathname ||
      url.username ||
      url.password ||
      url.hash ||
      url.searchParams.get('state') !== request.state ||
      !code ||
      code.length > 4_096
    ) {
      throw new Error('Invalid callback');
    }
    return code;
  } catch {
    throw new Error('Authentication failed');
  }
}

/** Returns true only for cancellation raised by a caller-owned signal. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Ignores late UI completions once the owning operation is cancelled. */
async function waitForInteraction<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new DOMException('The operation was aborted', 'AbortError');
  return new Promise<T>((resolveInteraction, rejectInteraction) => {
    const abort = (): void =>
      rejectInteraction(new DOMException('The operation was aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    operation.then(resolveInteraction, rejectInteraction).finally(() => {
      signal.removeEventListener('abort', abort);
    });
  });
}

/** Waits for a callback while ensuring cancellation closes its listener. */
async function waitForBrowserCallback(
  callback: Promise<string>,
  close: () => void,
  signal: AbortSignal,
): Promise<string> {
  if (signal.aborted) {
    close();
    throw new DOMException('The operation was aborted', 'AbortError');
  }
  return new Promise<string>((resolveCallback, rejectCallback) => {
    const abort = (): void => {
      close();
      rejectCallback(new DOMException('The operation was aborted', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    callback.then(resolveCallback, rejectCallback).finally(() => {
      signal.removeEventListener('abort', abort);
    });
  });
}

/** Completes one authentication attempt and persists only verified credentials. */
export async function authenticateCliSession(
  request: LoginRequest,
  interaction: LoginInteraction,
  options: CliAuthOperationOptions,
): Promise<VerifiedSession | CancelledLogin> {
  if (options.signal.aborted) return { status: 'cancelled' };
  try {
    const server = request.server.toString().replace(/\/$/, '');
    const metadata = await fetchAdminMetadata(server, options);
    let authorization = await createAuthorizationRequest({
      issuer: metadata.issuer,
      clientId: request.clientId ?? metadata.clientId,
    });
    let code: string;
    if (request.noBrowser) {
      await waitForInteraction(
        interaction.presentAuthorizationUrl(authorization.url, options.signal),
        options.signal,
      );
      code = validateAuthorizationCallback(
        await waitForInteraction(interaction.requestManualCallback(options.signal), options.signal),
        authorization,
      );
    } else {
      const callbackServer = await startCallbackServer(authorization.state);
      const redirectUri = `http://127.0.0.1:${callbackServer.port}/callback`;
      authorization.url.searchParams.set('redirect_uri', redirectUri);
      authorization = { ...authorization, redirectUri };
      const openBrowser = request.openBrowser ?? (async (url: URL) => open(url.toString()));
      try {
        await waitForInteraction(openBrowser(authorization.url), options.signal);
      } catch (error) {
        callbackServer.close();
        if (isAbortError(error) || options.signal.aborted) throw error;
        await waitForInteraction(
          interaction.presentAuthorizationUrl(authorization.url, options.signal),
          options.signal,
        );
        code = validateAuthorizationCallback(
          await waitForInteraction(
            interaction.requestManualCallback(options.signal),
            options.signal,
          ),
          authorization,
        );
        return await finishAuthentication(
          request,
          interaction,
          options,
          metadata,
          authorization,
          code,
          server,
        );
      }
      code = await waitForBrowserCallback(
        callbackServer.authCode,
        callbackServer.close,
        options.signal,
      );
    }
    return await finishAuthentication(
      request,
      interaction,
      options,
      metadata,
      authorization,
      code,
      server,
    );
  } catch (error) {
    if (error instanceof CredentialPersistenceError) throw error;
    if (options.signal.aborted || isAbortError(error)) return { status: 'cancelled' };
    throw error;
  }
}

/** Completes token verification, replacement approval, and persistence. */
async function finishAuthentication(
  request: LoginRequest,
  interaction: LoginInteraction,
  options: CliAuthOperationOptions,
  metadata: Awaited<ReturnType<typeof fetchAdminMetadata>>,
  authorization: AuthorizationRequest,
  code: string,
  server: string,
): Promise<VerifiedSession | CancelledLogin> {
  const clientId = request.clientId ?? metadata.clientId;
  const tokens = await exchangeAuthorizationCode(
    {
      tokenEndpoint: `${metadata.issuer.replace(/\/+$/, '')}/token`,
      clientId,
      code,
      codeVerifier: authorization.codeVerifier,
      redirectUri: authorization.redirectUri,
    },
    options,
  );
  const jwks = await fetchIssuerJwks(`${metadata.issuer.replace(/\/+$/, '')}/jwks`, options);
  const idTokenIdentity = await verifyCliIdToken({
    token: tokens.id_token,
    issuer: metadata.issuer,
    clientId,
    nonce: authorization.nonce,
    jwks,
  });
  const identity = await fetchVerifiedUserInfo(
    {
      selectedServer: request.server,
      orgSlug: metadata.orgSlug,
      accessToken: tokens.access_token,
      originalSubject: idTokenIdentity.sub,
    },
    options,
  );
  const credentials: AuthFlowResult = {
    server,
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
    const approved = await waitForInteraction(
      interaction.confirmCredentialReplacement(
        request.currentServer,
        request.server,
        options.signal,
      ),
      options.signal,
    );
    if (!approved) return { status: 'cancelled' };
  }
  if (options.signal.aborted) return { status: 'cancelled' };
  try {
    await request.persistCredentials?.(credentials);
  } catch (error) {
    throw new CredentialPersistenceError(error);
  }
  return { status: 'authenticated', identity, credentials };
}
