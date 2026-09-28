/**
 * Specification tests for the doctor server-health contract.
 *
 * These tests derive from the documented `GET /health` contract: Porta reports
 * `200 { status: 'healthy', checks }` while all dependencies respond and
 * `503 { status: 'unhealthy', checks }` when one is degraded. `porta doctor`
 * must classify those responses correctly instead of treating a healthy server
 * as a warning.
 *
 * The health HTTP boundary is real: each case starts a loopback server, so the
 * tests fail if the CLI and server contracts drift apart again.
 */

import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/credential-store.js', () => ({
  loadCredentials: vi.fn(),
  isTokenExpired: vi.fn().mockReturnValue(false),
  getCredentialsPath: vi.fn().mockReturnValue('/home/test/.porta/credentials.json'),
  hasCredentials: vi.fn().mockReturnValue(true),
}));

vi.mock('../../src/auth/metadata.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/auth/metadata.js')>();
  return {
    ...actual,
    fetchAdminMetadata: vi.fn().mockResolvedValue({
      issuer: 'https://porta.local:3443/porta-admin',
      clientId: 'test-client-id-long',
      orgSlug: 'porta-admin',
    }),
  };
});

vi.mock('../../src/output.js', () => ({
  printJson: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { loadCredentials } from '../../src/credential-store.js';
import { printJson, success, warn } from '../../src/output.js';

/** Sentinel error thrown by the process.exit mock. */
class ExitError extends Error {
  constructor(public code: number) {
    super(`process.exit(${code})`);
  }
}

/** A `CheckResult` as printed by the doctor command. */
interface PrintedCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

/**
 * Start a loopback health server that answers every request with a fixed
 * status code and JSON body, then return its base URL and a stop function.
 */
async function startHealthServer(
  statusCode: number,
  body: unknown,
): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(statusCode, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('health server did not bind a TCP port');
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

/** Stop a loopback server started by {@link startHealthServer}. */
async function stopHealthServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

/** Credential record that points the doctor command at a server URL. */
function credentialsFor(serverBaseUrl: string) {
  return {
    server: serverBaseUrl,
    orgSlug: 'porta-admin',
    clientId: 'test-client-id-long',
    accessToken: 'token',
    refreshToken: 'refresh',
    idToken: 'id',
    expiresAt: '2099-01-01T00:00:00Z',
    userInfo: { sub: 'user-1', email: 'admin@example.com' },
  };
}

/** Run the doctor handler against a server URL and return the printed checks. */
async function runDoctor(serverBaseUrl: string): Promise<PrintedCheck[]> {
  vi.mocked(loadCredentials).mockReturnValue(credentialsFor(serverBaseUrl));

  const { doctorCommand } = await import('../../src/commands/doctor.js');
  await expect(
    doctorCommand.handler({
      json: true,
      verbose: false,
      insecure: false,
      force: false,
      _: ['doctor'],
      $0: 'porta',
    }),
  ).rejects.toThrow(ExitError);

  const printed = vi.mocked(printJson).mock.calls[0]?.[0];
  if (!Array.isArray(printed)) throw new Error('doctor did not print check results');
  return printed as PrintedCheck[];
}

/** Find the Server health check in a printed result list. */
function serverHealth(checks: PrintedCheck[]): PrintedCheck {
  const check = checks.find((entry) => entry.name === 'Server health');
  if (!check) throw new Error('Server health check missing from doctor output');
  return check;
}

describe('doctor server-health contract', () => {
  const servers: Server[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadCredentials).mockReturnValue(null);
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new ExitError(code as number);
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(servers.splice(0).map((server) => stopHealthServer(server)));
  });

  it('passes when /health returns 200 with status healthy', async () => {
    const { server, baseUrl } = await startHealthServer(200, {
      status: 'healthy',
      checks: { server: 'ok', database: 'ok', redis: 'ok' },
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    servers.push(server);

    const health = serverHealth(await runDoctor(baseUrl));

    expect(health.status).toBe('pass');
    expect(health.message).toContain('healthy');
    expect(health.message).toContain('database=ok');
  });

  it('reports the summary as fully passed for a healthy server', async () => {
    const { server, baseUrl } = await startHealthServer(200, {
      status: 'healthy',
      checks: { server: 'ok', database: 'ok', redis: 'ok' },
    });
    servers.push(server);
    vi.mocked(loadCredentials).mockReturnValue(credentialsFor(baseUrl));

    const { doctorCommand } = await import('../../src/commands/doctor.js');
    await expect(
      doctorCommand.handler({
        json: false,
        verbose: false,
        insecure: false,
        force: false,
        _: ['doctor'],
        $0: 'porta',
      }),
    ).rejects.toThrow(ExitError);

    expect(success).toHaveBeenCalledWith('All checks passed');
    expect(warn).not.toHaveBeenCalled();
  });

  it('fails and names the degraded dependencies when /health returns 503 with status unhealthy', async () => {
    const { server, baseUrl } = await startHealthServer(503, {
      status: 'unhealthy',
      checks: { server: 'ok', database: 'error', redis: 'ok' },
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    servers.push(server);

    const health = serverHealth(await runDoctor(baseUrl));

    expect(health.status).toBe('fail');
    expect(health.message).toContain('database=error');
  });

  it('keeps passing for the legacy 200 status ok and services shape', async () => {
    const { server, baseUrl } = await startHealthServer(200, {
      status: 'ok',
      services: { database: 'ok', redis: 'ok' },
    });
    servers.push(server);

    const health = serverHealth(await runDoctor(baseUrl));

    expect(health.status).toBe('pass');
    expect(health.message).toContain('database=ok');
  });

  it('fails when the health endpoint is unreachable', async () => {
    const { server, baseUrl } = await startHealthServer(200, { status: 'healthy' });
    await stopHealthServer(server);

    const health = serverHealth(await runDoctor(baseUrl));

    expect(health.status).toBe('fail');
  });
});
