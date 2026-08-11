/**
 * Arranges the deterministic retained-harness baseline and writes compatibility configuration.
 *
 * Porta services are imported only after disposable runtime environment variables are installed.
 * Raw credentials remain confined to the ignored runtime configuration consumed by the BFF; the
 * public SPA configuration contains no password, client secret, token, or cookie material.
 */

import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { arrangeFixtureBaseline } from '../fixtures/seed-arrangement.js';

process.env.LOG_LEVEL = 'fatal';
const postgresPort = process.env.HARNESS_POSTGRES_PORT ?? '5432';
const redisPort = process.env.HARNESS_REDIS_PORT ?? '6379';
const mailhogPort = process.env.HARNESS_MAILHOG_PORT ?? '8025';
process.env.DATABASE_URL = `postgres://porta:harness_pr0d_s3cret@localhost:${postgresPort}/porta`;
process.env.REDIS_URL = `redis://localhost:${redisPort}`;
process.env.ISSUER_BASE_URL ??= 'https://porta-harness.ci.portaidentity.com:3443';
process.env.COOKIE_KEYS ??= 'Xk9mQ2vR7pW4tY6bN8cF3jH5sA0dL1eZq,Rm4nT8wK2xJ6yP0qB3vG5fC7hD9sA1eUp';
process.env.SMTP_HOST ??= 'localhost';
process.env.SMTP_PORT ??= process.env.HARNESS_SMTP_PORT ?? '1025';
process.env.SMTP_FROM ??= 'noreply@test-harness.local';
process.env.SIGNING_KEY_ENCRYPTION_KEY ??=
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2';
process.env.TWO_FACTOR_ENCRYPTION_KEY ??=
  'f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2b3a4f5e6d7c8b9a0f1e2';

/** Writes one JSON runtime file with owner-only permissions. */
function writeRuntimeJson(path: string, value: object): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  chmodSync(path, 0o600);
}

/** Arranges fixtures and emits only path-minimal, non-secret progress output. */
async function main(): Promise<void> {
  await (await import('dotenv')).default.config();
  const { connectDatabase, disconnectDatabase } =
    await import('../../packages/server/src/lib/database.js');
  const { connectRedis, disconnectRedis } = await import('../../packages/server/src/lib/redis.js');
  await connectDatabase();
  await connectRedis();

  try {
    const harnessRoot = resolve(import.meta.dirname, '..');
    const portaBaseUrl =
      process.env.HARNESS_PORTA_URL ?? 'https://porta-harness.ci.portaidentity.com:3443';
    const appBaseUrl =
      process.env.HARNESS_APP_URL ?? 'https://app-harness.ci.portaidentity.com:4100';
    const bffBaseUrl =
      process.env.HARNESS_BFF_URL ?? 'http://app-harness.ci.portaidentity.com:4101';
    const runtime = await arrangeFixtureBaseline({ appBaseUrl, bffBaseUrl });
    const sharedScope = 'openid profile email offline_access';
    const privateConfig = {
      orgSlug: runtime.retained.organizationSlug,
      spa: {
        clientId: runtime.retained.publicClientId,
        redirectUri: `${appBaseUrl}/callback.html`,
        postLogoutRedirectUri: `${appBaseUrl}/`,
        scope: sharedScope,
      },
      bff: {
        clientId: runtime.retained.confidentialClientId,
        clientSecret: runtime.retained.confidentialClientSecret,
        redirectUri: `${bffBaseUrl}/callback`,
        postLogoutRedirectUri: `${bffBaseUrl}/`,
        scope: sharedScope,
      },
      user: {
        email: runtime.retained.userEmail,
        password: runtime.retained.userPassword,
      },
      porta: {
        issuer: `${portaBaseUrl}/${runtime.retained.organizationSlug}`,
        baseUrl: portaBaseUrl,
      },
      mailhog: { apiUrl: `http://localhost:${mailhogPort}/api` },
    };
    writeRuntimeJson(resolve(harnessRoot, 'config.generated.json'), privateConfig);

    const spaDirectory = resolve(harnessRoot, 'spa');
    mkdirSync(spaDirectory, { recursive: true, mode: 0o700 });
    writeRuntimeJson(resolve(spaDirectory, 'config.json'), {
      orgSlug: privateConfig.orgSlug,
      spa: privateConfig.spa,
      porta: privateConfig.porta,
    });

    process.stdout.write(
      `HARNESS_FIXTURES_READY: organizations=3 aliases=${runtime.entities.length}\n`,
    );
  } finally {
    await disconnectRedis();
    await disconnectDatabase();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown fixture arrangement failure';
  process.stderr.write(`HARNESS_FIXTURE_SETUP_FAILED: ${message}\n`);
  process.exitCode = 1;
});
