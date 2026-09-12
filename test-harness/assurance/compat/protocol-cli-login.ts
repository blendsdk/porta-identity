import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import process from 'node:process';

import { chromium, request } from '@playwright/test';
import { z } from 'zod';

import {
  readProtectedRuntimeCredential,
  readPublicRuntimeFixtureManifest,
} from '../../fixtures/fixture-runtime-files.js';
import { verifyIndependentIdToken } from '../tests/protocol-live-jose.js';
import {
  PackedCompatibilityExecutionError,
  type PackedCompatibilityFailureStage,
  type PackedSurfaceResult,
  type PreparedPackedConsumer,
} from './model.js';
import type { PackedProtocolCliLoginEvidence } from './protocol.js';

const credentialsSchema = z
  .object({
    server: z.string().url(),
    orgSlug: z.string().min(1),
    clientId: z.string().min(1),
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    idToken: z.string().min(1),
    expiresAt: z.string().datetime(),
    userInfo: z
      .object({ sub: z.string().min(1), email: z.string(), name: z.string().optional() })
      .strict(),
  })
  .strict();
const metadataSchema = z
  .object({ issuer: z.string().url(), orgSlug: z.string().min(1), clientId: z.string().min(1) })
  .strict();
const discoverySchema = z.object({ jwks_uri: z.string().url() }).passthrough();
const manualCallbackPort = 11_111;
const maximumCallbackUrlBytes = 8 * 1024;
const allowedManualCallbackKeys = new Set(['code', 'state', 'iss']);

/**
 * Parses the distributed CLI's credential file without requiring optional identity claims.
 *
 * OIDC guarantees the subject, while the CLI intentionally represents an omitted email claim as
 * an empty string. Tokens and the subject remain mandatory and are verified independently later.
 */
export function parsePackedProtocolCredentials(value: unknown): z.infer<typeof credentialsSchema> {
  return credentialsSchema.parse(value);
}

/** Owner-bound observer for the CLI's fixed manual loopback redirect. */
export interface PackedManualCallbackCapture {
  /** Exact loopback origin bound before the packed CLI starts. */
  readonly origin: string;
  /** Waits a bounded interval for one well-formed authorization callback. */
  readonly waitForCallback: (timeoutMilliseconds?: number) => Promise<string>;
  /** Stops the exact listener and resolves only after its socket closes. */
  readonly close: () => Promise<void>;
}

/** Responds to one local callback without reflecting query values or retaining them on disk. */
function acceptManualCallback(server: Server, callback: (url: string) => boolean): void {
  server.on('request', (incoming, response) => {
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : undefined;
    const origin = port === undefined ? undefined : `http://127.0.0.1:${port}`;
    const rawUrl = incoming.url ?? '';
    const requestUrl = origin === undefined ? undefined : new URL(rawUrl, origin);
    const keys = requestUrl === undefined ? [] : [...requestUrl.searchParams.keys()];
    const codes = requestUrl?.searchParams.getAll('code') ?? [];
    const states = requestUrl?.searchParams.getAll('state') ?? [];
    const accepted =
      incoming.method === 'GET' &&
      incoming.headers.host === `127.0.0.1:${port ?? ''}` &&
      Buffer.byteLength(rawUrl) <= maximumCallbackUrlBytes &&
      requestUrl?.pathname === '/callback' &&
      codes.length === 1 &&
      codes[0]?.length !== 0 &&
      states.length === 1 &&
      states[0]?.length !== 0 &&
      requestUrl.searchParams.getAll('iss').length <= 1 &&
      keys.every((key) => allowedManualCallbackKeys.has(key));
    if (!accepted || requestUrl === undefined) {
      response.writeHead(404, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      response.end('not found');
      return;
    }
    if (!callback(requestUrl.toString())) {
      response.writeHead(409, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      response.end('callback already received');
      return;
    }
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'",
      'Content-Type': 'text/plain; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
    });
    response.end('callback received');
  });
}

/**
 * Binds the CLI's manual callback before login and captures only an exact loopback response.
 *
 * Port zero is accepted solely so implementation tests can ask the kernel for an isolated port;
 * live packed execution always uses the CLI's fixed port 11111.
 */
export async function startPackedManualCallbackCapture(
  port: 0 | 11111 = manualCallbackPort,
): Promise<PackedManualCallbackCapture> {
  let resolveCallback: (url: string) => void = () => undefined;
  const observed = new Promise<string>((resolveObserved) => {
    resolveCallback = resolveObserved;
  });
  let settled = false;
  const server = createServer();
  acceptManualCallback(server, (url) => {
    if (settled) return false;
    settled = true;
    resolveCallback(url);
    return true;
  });
  try {
    await new Promise<void>((resolveListening, rejectListening) => {
      server.once('error', rejectListening);
      server.listen(port, '127.0.0.1', resolveListening);
    });
  } catch (error) {
    server.close();
    throw error;
  }
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    server.close();
    throw new Error('manual callback listener address is unavailable');
  }
  const origin = `http://127.0.0.1:${address.port}`;
  return Object.freeze({
    origin,
    async waitForCallback(timeoutMilliseconds = 20_000): Promise<string> {
      let timeout: NodeJS.Timeout | undefined;
      try {
        return await Promise.race([
          observed,
          new Promise<string>((_resolve, reject) => {
            timeout = setTimeout(
              () => reject(new Error('manual callback was not observed')),
              timeoutMilliseconds,
            );
          }),
        ]);
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
    },
    async close(): Promise<void> {
      if (!server.listening) return;
      await new Promise<void>((resolveClosed, rejectClosed) => {
        server.close((error) => (error === undefined ? resolveClosed() : rejectClosed(error)));
      });
    },
  });
}

/** Active harness endpoints required by the packed protocol login owner. */
export interface PackedProtocolEndpoints {
  /** Public Porta origin for the active owned stack. */
  readonly porta: string;
  /** Public redacted fixture manifest for the active run. */
  readonly fixtureManifestPath: string;
  /** Owner-only protected credential manifest for the active run. */
  readonly credentialManifestPath: string;
  /** UUID identifying the active lifecycle run. */
  readonly runId: string;
}

/** Secret-bearing login session retained only until the SDK refresh journey completes. */
export interface PackedProtocolLoginSession {
  /** Sanitized evidence admitted for the CLI half of the adjunct. */
  readonly evidence: PackedProtocolCliLoginEvidence;
  /** Owner-only copied CLI credential path used by the packed SDK. */
  readonly credentialsPath: string;
  /** Refresh token retained in memory for the independent consumed-token retry. */
  readonly originalRefreshToken: string;
  /** Credential fingerprint before the SDK reads the file. */
  readonly credentialsFingerprint: string;
}

/** Result of one bounded interactive CLI process. */
interface InteractiveCliResult {
  readonly exitCode: number | null;
  readonly output: string;
  readonly authorizationUrl: URL;
  readonly callbackUrl: URL;
  readonly forwardedSignal: 'SIGINT' | 'SIGTERM' | null;
  readonly timedOut: boolean;
  readonly cleanupFailed: boolean;
}

/** Returns a content-and-metadata fingerprint without exposing credential bytes. */
export function packedProtocolCredentialFingerprint(path: string): string {
  if (!existsSync(path)) return 'absent';
  const metadata = lstatSync(path);
  const digest = createHash('sha256');
  digest.update(`${metadata.mode & 0o777}:${metadata.size}:`);
  if (metadata.isFile() && !metadata.isSymbolicLink()) digest.update(readFileSync(path));
  else digest.update('non-regular');
  return `sha256:${digest.digest('hex')}`;
}

/** Terminates one isolated process group and ignores an already-exited child. */
function terminateProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error;
  }
}

/** Returns whether the isolated child process group still owns any process. */
function processGroupExists(child: ChildProcess): boolean {
  if (child.pid === undefined) return false;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false;
    throw error;
  }
}

/** Waits a bounded interval for the complete isolated process group to disappear. */
async function awaitProcessGroupExit(child: ChildProcess): Promise<boolean> {
  const deadline = Date.now() + 2_000;
  while (processGroupExists(child) && Date.now() < deadline) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
  }
  if (processGroupExists(child)) terminateProcessGroup(child, 'SIGKILL');
  const killDeadline = Date.now() + 2_000;
  while (processGroupExists(child) && Date.now() < killDeadline) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
  }
  return !processGroupExists(child);
}

/** Extracts the single bounded authorization URL printed by the CLI. */
export function extractPackedCliAuthorizationUrl(output: string): URL | undefined {
  const matches = output.match(/https:\/\/[^\s]+\/porta-admin\/auth\?[^\s]+/gu) ?? [];
  if (matches.length === 0) return undefined;
  if (matches.length !== 1) throw new Error('packed CLI printed multiple authorization URLs');
  return new URL(matches[0]);
}

/** Waits until the CLI prints its authorization URL or exits before becoming interactive. */
async function waitForAuthorizationUrl(child: ChildProcess, output: () => string): Promise<URL> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const authorizationUrl = extractPackedCliAuthorizationUrl(output());
    if (authorizationUrl !== undefined) return authorizationUrl;
    if (child.exitCode !== null || child.signalCode !== null) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  throw new Error('packed CLI authorization URL was not observed');
}

/** Completes the CLI authorization request with the full synthetic administrator. */
async function completeAuthorization(
  authorizationUrl: URL,
  email: string,
  password: string,
  callbackCapture: PackedManualCallbackCapture,
): Promise<URL> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.goto(authorizationUrl.toString(), { waitUntil: 'domcontentloaded' });
    await page.locator('input#email').fill(email);
    await page.locator('input#password').fill(password);
    await page.locator('form[action$="/login"] button[type="submit"]').click();
    const consent = page.locator(
      'button[type="submit"][name="consent"], button:has-text("Allow"), button:has-text("Authorize")',
    );
    if (await consent.isVisible({ timeout: 1_000 }).catch(() => false)) await consent.click();
    return new URL(await callbackCapture.waitForCallback());
  } finally {
    await browser.close();
  }
}

/** Runs the packed CLI in manual mode while a real browser completes the authorization. */
async function runInteractiveCli(
  consumer: PreparedPackedConsumer,
  surfaces: PackedSurfaceResult,
  endpoints: PackedProtocolEndpoints,
  home: string,
  email: string,
  password: string,
): Promise<InteractiveCliResult> {
  let callbackCapture: PackedManualCallbackCapture;
  try {
    callbackCapture = await startPackedManualCallbackCapture();
  } catch {
    throw new PackedCompatibilityExecutionError(30, undefined, 'protocol-cli-browser');
  }
  const child = spawn(
    process.execPath,
    [surfaces.cliBinPath, 'login', '--server', endpoints.porta, '--insecure'],
    {
      cwd: consumer.consumerPath,
      detached: true,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        PORTA_CONTAINER: '1',
      },
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  let output = '';
  let outputBytes = 0;
  const capture = (chunk: Buffer): void => {
    outputBytes += chunk.byteLength;
    if (outputBytes > 256 * 1024) terminateProcessGroup(child, 'SIGTERM');
    else output += chunk.toString('utf8');
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  let forwardedSignal: 'SIGINT' | 'SIGTERM' | null = null;
  let timedOut = false;
  const closed = new Promise<number | null>((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('close', (code) => resolveExit(code));
  });
  const timeout = setTimeout(() => {
    timedOut = true;
    terminateProcessGroup(child, 'SIGTERM');
  }, 60_000);
  const forward = (signal: 'SIGINT' | 'SIGTERM'): void => {
    forwardedSignal ??= signal;
    terminateProcessGroup(child, signal);
  };
  const onSigint = (): void => forward('SIGINT');
  const onSigterm = (): void => forward('SIGTERM');
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  let result: InteractiveCliResult | undefined;
  let primaryError: unknown;
  let cleanupSucceeded: boolean;
  try {
    let authorizationUrl: URL;
    try {
      authorizationUrl = await waitForAuthorizationUrl(child, () => output);
    } catch {
      throw new PackedCompatibilityExecutionError(30, undefined, 'protocol-cli-request');
    }
    let callbackUrl: URL;
    try {
      callbackUrl = await completeAuthorization(authorizationUrl, email, password, callbackCapture);
    } catch {
      throw new PackedCompatibilityExecutionError(30, undefined, 'protocol-cli-browser');
    }
    child.stdin?.end(`${callbackUrl.toString()}\n`);
    const exitCode = await closed;
    result = {
      exitCode,
      output,
      authorizationUrl,
      callbackUrl,
      forwardedSignal,
      timedOut,
      cleanupFailed: false,
    };
  } catch (error) {
    primaryError = error;
  } finally {
    clearTimeout(timeout);
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    terminateProcessGroup(child, 'SIGTERM');
    cleanupSucceeded = await awaitProcessGroupExit(child);
    try {
      await callbackCapture.close();
    } catch {
      cleanupSucceeded = false;
    }
    if (!cleanupSucceeded) await closed.catch(() => undefined);
  }
  if (!cleanupSucceeded) throw new PackedCompatibilityExecutionError(60);
  if (primaryError !== undefined) throw primaryError;
  if (result === undefined) throw new Error('packed CLI result is absent');
  return result;
}

/**
 * Executes the packed CLI login, validates its tokens independently, and removes its temporary HOME.
 *
 * The credential bytes are copied into a separate owner-only file before HOME removal so the SDK
 * can consume the exact public CLI credential contract without weakening CLI cleanup evidence.
 */
export async function executePackedProtocolCliLogin(
  consumer: PreparedPackedConsumer,
  surfaces: PackedSurfaceResult,
  endpoints: PackedProtocolEndpoints,
): Promise<PackedProtocolLoginSession> {
  const runtime = readPublicRuntimeFixtureManifest(endpoints.fixtureManifestPath);
  if (runtime.runId !== endpoints.runId) throw new Error('packed protocol fixture is not active');
  const entities = new Map(runtime.entities.map((entry) => [entry.alias, entry.id]));
  const subject = entities.get('admin-actor-full');
  if (subject === undefined) throw new Error('packed protocol administrator identity is absent');
  const password = readProtectedRuntimeCredential(
    endpoints.credentialManifestPath,
    'credential:super-admin:password:full',
  );
  const callerCredentialPath = resolve(homedir(), '.porta/credentials.json');
  const callerBefore = packedProtocolCredentialFingerprint(callerCredentialPath);
  const home = resolve(consumer.consumerPath, '..', 'homes', randomUUID());
  mkdirSync(home, { recursive: true, mode: 0o700 });
  chmodSync(home, 0o700);
  const credentialPath = resolve(home, '.porta/credentials.json');
  const retainedCredentialPath = resolve(
    consumer.consumerPath,
    `.protocol-credentials-${randomUUID()}.json`,
  );
  let session: PackedProtocolLoginSession | undefined;
  let primaryError: unknown;
  let homeCleanupFailed = false;
  let failureStage: PackedCompatibilityFailureStage = 'protocol-cli-process';
  try {
    const result = await runInteractiveCli(
      consumer,
      surfaces,
      endpoints,
      home,
      'admin-actor-full@test-harness.local',
      password,
    );
    if (result.forwardedSignal === 'SIGINT') throw new PackedCompatibilityExecutionError(130);
    if (result.forwardedSignal === 'SIGTERM') throw new PackedCompatibilityExecutionError(143);
    if (result.timedOut || result.cleanupFailed) {
      throw new PackedCompatibilityExecutionError(result.cleanupFailed ? 60 : 70);
    }
    failureStage = 'protocol-cli-credentials';
    if (result.exitCode !== 0 || !existsSync(credentialPath)) {
      throw new Error('packed CLI login did not complete');
    }
    const credentials = parsePackedProtocolCredentials(
      JSON.parse(readFileSync(credentialPath, 'utf8')),
    );
    copyFileSync(credentialPath, retainedCredentialPath, 0);
    chmodSync(retainedCredentialPath, 0o600);
    failureStage = 'protocol-cli-observation';
    const api = await request.newContext({ ignoreHTTPSErrors: true });
    try {
      const metadataResponse = await api.get(`${endpoints.porta}/api/admin/metadata`);
      if (!metadataResponse.ok()) throw new Error('packed protocol metadata was unavailable');
      const metadata = metadataSchema.parse(await metadataResponse.json());
      const discoveryResponse = await api.get(
        `${metadata.issuer}/.well-known/openid-configuration`,
      );
      if (!discoveryResponse.ok()) throw new Error('packed protocol discovery was unavailable');
      const discovery = discoverySchema.parse(await discoveryResponse.json());
      const jwksResponse = await api.get(discovery.jwks_uri);
      if (!jwksResponse.ok()) throw new Error('packed protocol JWKS was unavailable');
      const authorization = result.authorizationUrl.searchParams;
      const idToken = verifyIndependentIdToken(credentials.idToken, await jwksResponse.json(), {
        issuer: metadata.issuer,
        audience: metadata.clientId,
        subject,
        nonce: authorization.get('nonce') ?? undefined,
        now: Math.floor(Date.now() / 1000),
      });
      const observer = await api.get(`${endpoints.porta}/api/admin/organizations`, {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      });
      const callback = result.callbackUrl.searchParams;
      const outputRedacted = [
        password,
        credentials.accessToken,
        credentials.refreshToken,
        credentials.idToken,
      ].every((secret) => !result.output.includes(secret));
      const evidence: PackedProtocolCliLoginEvidence = {
        exitCode: result.exitCode,
        temporaryHomeMode: statSync(home).mode & 0o777,
        credentialsMode: statSync(credentialPath).mode & 0o777,
        temporaryHomeRemoved: false,
        callerCredentialUnchanged: false,
        browserCompleted: callback.get('code') !== null,
        responseType: authorization.get('response_type') ?? '',
        codeChallengeMethod: authorization.get('code_challenge_method') ?? '',
        stateRoundTrip: callback.get('state') === authorization.get('state'),
        requestedOfflineAccess: (authorization.get('scope') ?? '')
          .split(' ')
          .includes('offline_access'),
        promptedForLoginAndConsent: ['login', 'consent'].every((value) =>
          (authorization.get('prompt') ?? '').split(' ').includes(value),
        ),
        accessTokenOpaque: credentials.accessToken.split('.').length === 1,
        refreshTokenPresent: credentials.refreshToken.length > 0,
        idTokenIndependentlyVerified: idToken.accepted,
        idTokenAudienceExact: idToken.facts.audExact === true,
        idTokenSubjectExact: idToken.facts.subExact === true,
        accessTokenAcceptedByRawObserver: observer.status() === 200,
        outputRedacted,
      };
      session = {
        evidence: {
          ...evidence,
          temporaryHomeRemoved: false,
          callerCredentialUnchanged: false,
        },
        credentialsPath: retainedCredentialPath,
        originalRefreshToken: credentials.refreshToken,
        credentialsFingerprint: packedProtocolCredentialFingerprint(retainedCredentialPath),
      };
    } finally {
      await api.dispose();
    }
  } catch (error) {
    primaryError =
      error instanceof PackedCompatibilityExecutionError
        ? error
        : new PackedCompatibilityExecutionError(30, undefined, failureStage);
  } finally {
    try {
      rmSync(home, { recursive: true, force: true });
    } catch {
      homeCleanupFailed = true;
    }
  }
  if (homeCleanupFailed) {
    rmSync(retainedCredentialPath, { force: true });
    throw new PackedCompatibilityExecutionError(60);
  }
  if (primaryError !== undefined) {
    rmSync(retainedCredentialPath, { force: true });
    throw primaryError;
  }
  const callerAfter = packedProtocolCredentialFingerprint(callerCredentialPath);
  if (callerAfter !== callerBefore || session === undefined || existsSync(home)) {
    rmSync(retainedCredentialPath, { force: true });
    throw new Error('packed CLI credential isolation failed');
  }
  return {
    ...session,
    evidence: {
      ...session.evidence,
      temporaryHomeRemoved: true,
      callerCredentialUnchanged: true,
    },
  };
}
