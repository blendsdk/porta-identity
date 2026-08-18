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
      .object({ sub: z.string().min(1), email: z.string().min(1), name: z.string().optional() })
      .strict(),
  })
  .strict();
const metadataSchema = z
  .object({ issuer: z.string().url(), orgSlug: z.string().min(1), clientId: z.string().min(1) })
  .strict();
const discoverySchema = z.object({ jwks_uri: z.string().url() }).passthrough();

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
): Promise<URL> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.route('http://127.0.0.1:11111/callback**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/plain', body: 'callback received' });
    });
    await page.goto(authorizationUrl.toString(), { waitUntil: 'domcontentloaded' });
    await page.locator('input#email').fill(email);
    await page.locator('input#password').fill(password);
    await page.locator('form[action$="/login"] button[type="submit"]').click();
    const consent = page.locator(
      'button[type="submit"][name="consent"], button:has-text("Allow"), button:has-text("Authorize")',
    );
    if (await consent.isVisible({ timeout: 1_000 }).catch(() => false)) await consent.click();
    await page.waitForURL('http://127.0.0.1:11111/callback**', { timeout: 20_000 });
    return new URL(page.url());
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
      callbackUrl = await completeAuthorization(authorizationUrl, email, password);
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
    const credentials = credentialsSchema.parse(JSON.parse(readFileSync(credentialPath, 'utf8')));
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
      const idToken = verifyIndependentIdToken(credentials.idToken, await jwksResponse.json(), {
        issuer: metadata.issuer,
        audience: metadata.clientId,
        subject,
        now: Math.floor(Date.now() / 1000),
      });
      const observer = await api.get(`${endpoints.porta}/api/admin/organizations`, {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      });
      const authorization = result.authorizationUrl.searchParams;
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
