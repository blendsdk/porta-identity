import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';

import { request } from '@playwright/test';
import { z } from 'zod';

import { runManagedChild } from '../scripts/managed-child.js';
import type { PreparedPackedConsumer } from './model.js';
import {
  packedProtocolCredentialFingerprint,
  type PackedProtocolEndpoints,
  type PackedProtocolLoginSession,
} from './protocol-cli-login.js';
import type { PackedProtocolSdkRefreshEvidence } from './protocol.js';

const credentialSchema = z
  .object({
    server: z.string().url(),
    orgSlug: z.string().min(1),
    clientId: z.string().min(1),
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
  })
  .passthrough();
const probeSchema = z
  .object({
    sdkEntry: z.literal('@portaidentity/sdk/node'),
    refreshedAccessTokenChanged: z.boolean(),
    refreshedAccessTokenAcceptedByRawObserver: z.boolean(),
  })
  .strict();
const tokenErrorSchema = z.object({ error: z.string() }).passthrough();

/**
 * Uses the installed SDK's public Node entry to refresh the exact credentials written by the CLI.
 *
 * The child reports booleans only. A separate raw request then retries the original refresh token,
 * proving single-use consumption without trusting SDK error mapping or exposing token bytes.
 */
export async function executePackedProtocolSdkRefresh(
  consumer: PreparedPackedConsumer,
  endpoints: PackedProtocolEndpoints,
  login: PackedProtocolLoginSession,
): Promise<PackedProtocolSdkRefreshEvidence> {
  const credentials = credentialSchema.parse(
    JSON.parse(readFileSync(login.credentialsPath, 'utf8')),
  );
  if (credentials.refreshToken !== login.originalRefreshToken) {
    throw new Error('packed SDK credential input differs from CLI output');
  }
  const inputPath = resolve(consumer.consumerPath, `.protocol-sdk-input-${randomUUID()}.json`);
  const probePath = resolve(consumer.consumerPath, `.protocol-sdk-probe-${randomUUID()}.mjs`);
  copyFileSync(
    resolve(process.cwd(), 'test-harness/consumers/protocol-sdk-refresh-probe.mjs'),
    probePath,
  );
  writeFileSync(
    inputPath,
    JSON.stringify({
      credentialsPath: login.credentialsPath,
      observerUrl: `${endpoints.porta}/api/admin/organizations`,
    }),
    { flag: 'wx', mode: 0o600 },
  );
  try {
    const result = await runManagedChild(process.execPath, [probePath, inputPath], {
      cwd: consumer.consumerPath,
      env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' },
      stdio: 'pipe',
      maxOutputBytes: 64 * 1024,
      timeoutMilliseconds: 30_000,
      terminationGraceMilliseconds: 2_000,
      cleanup: () => undefined,
    });
    if (
      result.code !== 0 ||
      result.signal !== null ||
      result.setupFailed ||
      result.cleanupFailed ||
      result.timedOut ||
      result.outputTruncated
    ) {
      throw new Error('packed SDK refresh probe failed');
    }
    const probe = probeSchema.parse(JSON.parse(result.stdout));
    const api = await request.newContext({ ignoreHTTPSErrors: true });
    try {
      const retry = await api.post(`${credentials.server}/${credentials.orgSlug}/token`, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        form: {
          grant_type: 'refresh_token',
          client_id: credentials.clientId,
          refresh_token: login.originalRefreshToken,
        },
      });
      const retryBody = tokenErrorSchema.parse(await retry.json());
      const fingerprintAfter = packedProtocolCredentialFingerprint(login.credentialsPath);
      return {
        sdkEntry: probe.sdkEntry,
        credentialsFingerprintUnchanged: fingerprintAfter === login.credentialsFingerprint,
        refreshedAccessTokenChanged: probe.refreshedAccessTokenChanged,
        refreshedAccessTokenAcceptedByRawObserver: probe.refreshedAccessTokenAcceptedByRawObserver,
        consumedRefreshRetryStatus: retry.status(),
        consumedRefreshRetryError: retryBody.error,
        outputRedacted: [
          credentials.accessToken,
          credentials.refreshToken,
          login.originalRefreshToken,
        ].every((secret) => !`${result.stdout}${result.stderr}`.includes(secret)),
      };
    } finally {
      await api.dispose();
    }
  } finally {
    rmSync(inputPath, { force: true });
    rmSync(probePath, { force: true });
  }
}
