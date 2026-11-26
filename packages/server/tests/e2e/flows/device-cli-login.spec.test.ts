/**
 * Live CLI device-login end-to-end regression.
 *
 * A real `porta login --device-code` process discovers the server, prints the
 * verification URL and user code, and polls while the test approves the code
 * through the real browser interaction flow. The CLI must store the existing
 * credential shape and never print the device code.
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { getRedis } from '../../../src/lib/redis.js';
import { TestHttpClient } from '../helpers/http-client.js';
import {
  TEST_COOKIE_KEYS,
  TEST_DATABASE_URL,
  TEST_REDIS_URL,
  TEST_SIGNING_KEY_ENCRYPTION_KEY,
} from '../../helpers/constants.js';

/** Default password used for the temporary admin user. */
const ADMIN_PASSWORD = 'TestPassword123!';

/** Output collected from the child CLI process. */
interface CliProcess {
  readonly child: ReturnType<typeof spawn>;
  output(): string;
  waitForExit(timeoutMs: number): Promise<{ code: number | null; signal: string | null }>;
}

/** Start the real CLI login command with an isolated credential home. */
function startCli(baseUrl: string, home: string): CliProcess {
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      'packages/cli/src/index.ts',
      'login',
      '--device-code',
      '--server',
      baseUrl,
    ],
    {
      cwd: join(process.cwd(), '../..'),
      env: {
        ...process.env,
        HOME: home,
        DATABASE_URL: TEST_DATABASE_URL,
        REDIS_URL: TEST_REDIS_URL,
        ISSUER_BASE_URL: baseUrl,
        COOKIE_KEYS: TEST_COOKIE_KEYS,
        SIGNING_KEY_ENCRYPTION_KEY: TEST_SIGNING_KEY_ENCRYPTION_KEY,
        NODE_ENV: 'test',
        LOG_LEVEL: 'fatal',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  return {
    child,
    output: () => output,
    waitForExit: (timeoutMs) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error(`CLI did not exit within ${timeoutMs}ms\n${output}`));
        }, timeoutMs);
        child.once('exit', (code, signal) => {
          clearTimeout(timer);
          resolve({ code, signal });
        });
      }),
  };
}

/** Parse the verification URL and user code from CLI output. */
function parseInstructions(output: string): { url: string; userCode: string } | undefined {
  const url = /https?:\/\/[^\s]+/.exec(output)?.[0];
  const code = /(?:^|\n)\s*([BCDFGHJKLMNPQRSTVWXZ]{1,32}-?[BCDFGHJKLMNPQRSTVWXZ]{1,32})\s*(?:\n|$)/.exec(
    output,
  )?.[1];
  return url && code ? { url, userCode: code } : undefined;
}

/** Approve one device code through the existing login interaction. */
async function approveDevice(
  http: TestHttpClient,
  orgSlug: string,
  url: string,
  userCode: string,
  email: string,
  password: string,
): Promise<void> {
  const entry = await http.get(url);
  expect(entry.status).toBe(200);
  const xsrf = entry.body.match(/name="xsrf"\s+value="([^"]+)"/)?.[1];
  expect(xsrf).toBeTruthy();

  const confirmation = await http.post(`/${orgSlug}/device`, {
    xsrf: xsrf ?? '',
    user_code: userCode,
    confirm: 'yes',
  });
  expect([302, 303]).toContain(confirmation.status);
  const interactionUrl = confirmation.location ?? '';

  const loginPage = await http.get(interactionUrl);
  expect(loginPage.status).toBe(200);
  const csrf = http.extractCsrfToken(loginPage.body);
  expect(csrf).toBeTruthy();
  const uid = interactionUrl.split('/interaction/')[1]?.split(/[/?#]/)[0] ?? '';
  expect(uid.length).toBeGreaterThan(20);

  const login = await http.post(`/interaction/${uid}/login`, {
    email,
    password,
    _csrf: csrf ?? '',
    _csrfStored: csrf ?? '',
  });
  expect([302, 303]).toContain(login.status);
  const chain = await http.followRedirects(login.location ?? '', 20);
  expect(chain.finalResponse.status).toBe(200);
  expect(chain.finalResponse.body).not.toContain('Sign in to your account');
}

describe('Live CLI device login', () => {
  let baseUrl: string;
  let adminEmail: string;

  beforeAll(async () => {
    baseUrl = process.env.TEST_SERVER_URL ?? 'https://porta-harness.ci.portaidentity.com:3443';
    adminEmail = `device-cli-${Date.now()}@test.local`;

    const pool = getPool();
    await pool.query(
      `INSERT INTO organizations (name, slug, status, is_super_admin, branding_company_name, default_locale)
       VALUES ('Porta Admin', 'porta-admin', 'active', TRUE, 'Porta', 'en')
       ON CONFLICT (slug) DO NOTHING`,
    );
    // Replace any prior admin application so init can run non-interactively.
    await pool.query("DELETE FROM applications WHERE slug = 'porta-admin'");
    await getRedis().flushdb();

    const init = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'packages/server/src/cli/index.ts',
        'init',
        '--email',
        adminEmail,
        '--given-name',
        'Device',
        '--family-name',
        'Admin',
        '--password',
        ADMIN_PASSWORD,
      ],
      {
        cwd: join(process.cwd(), '../..'),
        env: {
          ...process.env,
          DATABASE_URL: TEST_DATABASE_URL,
          REDIS_URL: TEST_REDIS_URL,
          ISSUER_BASE_URL: baseUrl,
          COOKIE_KEYS: TEST_COOKIE_KEYS,
          SIGNING_KEY_ENCRYPTION_KEY: TEST_SIGNING_KEY_ENCRYPTION_KEY,
          NODE_ENV: 'test',
          LOG_LEVEL: 'fatal',
        },
        encoding: 'utf8',
        timeout: 120_000,
      },
    );
    if (init.status !== 0) {
      throw new Error(`Porta init failed: ${init.stdout}\n${init.stderr}`);
    }
  }, 180_000);

  it('completes discovery, approval, polling, verification and persistence', async () => {
    const home = await mkdtemp(join(tmpdir(), 'porta-device-cli-'));
    const cli = startCli(baseUrl, home);
    try {
      const deadline = Date.now() + 30_000;
      let instructions: { url: string; userCode: string } | undefined;
      while (Date.now() < deadline && instructions === undefined) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        instructions = parseInstructions(cli.output());
      }
      if (!instructions) throw new Error(`CLI did not print instructions:\n${cli.output()}`);

      await approveDevice(
        new TestHttpClient(baseUrl),
        'porta-admin',
        instructions.url,
        instructions.userCode,
        adminEmail,
        ADMIN_PASSWORD,
      );

      const exit = await cli.waitForExit(30_000);
      expect(exit.code).toBe(0);
      expect(cli.output()).toContain(`Logged in as ${adminEmail}`);
      expect(cli.output()).not.toContain('device_code');

      const stored = JSON.parse(
        await readFile(join(home, '.porta', 'credentials.json'), 'utf8'),
      ) as Record<string, unknown>;
      expect(stored['server']).toBe(baseUrl);
      expect(stored['accessToken']).toBeTypeOf('string');
      expect(stored['idToken']).toBeTypeOf('string');
      expect(stored['refreshToken']).toBeTypeOf('string');
      const userInfo = stored['userInfo'];
      if (userInfo === null || typeof userInfo !== 'object') {
        throw new Error('Stored credential has no userInfo');
      }
      expect((userInfo as Record<string, unknown>)['email']).toBe(adminEmail);
    } finally {
      cli.child.kill('SIGKILL');
      await rm(home, { recursive: true, force: true });
    }
  }, 90_000);
});
