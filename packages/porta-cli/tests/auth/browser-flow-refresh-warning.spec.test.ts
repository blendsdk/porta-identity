/**
 * Specification tests for the CLI "no refresh token" login warning.
 *
 * Source: plans/auth-session-token-fixes/07-testing-strategy.md (ST-7, ST-8),
 * 03-01-cli-refresh-token.md, AR-8.
 *
 * Behavior under test: when the token exchange response does NOT include a
 * `refresh_token`, `executeBrowserFlow` must log the approved warning but still
 * return a complete (login-succeeded) result. When a refresh token IS present,
 * no warning is logged.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

vi.mock('../../src/auth/metadata.js', () => ({
  fetchAdminMetadata: vi.fn(),
}));

vi.mock('../../src/auth/pkce.js', () => ({
  generateCodeVerifier: vi.fn().mockReturnValue('test-verifier'),
  generateCodeChallenge: vi.fn().mockReturnValue('test-challenge'),
  generateState: vi.fn().mockReturnValue('test-state'),
}));

vi.mock('../../src/auth/callback-server.js', () => ({
  startCallbackServer: vi.fn(),
  parseCallbackUrl: vi.fn().mockReturnValue('test-auth-code'),
  MANUAL_REDIRECT_URI: 'http://127.0.0.1:11111/callback',
  isContainerized: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/prompt.js', () => ({
  question: vi.fn(),
}));

vi.mock('jose', () => ({
  decodeJwt: vi.fn().mockReturnValue({
    sub: 'user-123',
    email: 'admin@example.com',
    name: 'Admin User',
  }),
}));

import { executeBrowserFlow } from '../../src/auth/browser-flow.js';
import { fetchAdminMetadata } from '../../src/auth/metadata.js';
import { parseCallbackUrl, isContainerized } from '../../src/auth/callback-server.js';
import { question } from '../../src/prompt.js';

/** The substring that identifies the approved no-refresh-token warning (AR-8). */
const WARNING_SUBSTRING = 'did not issue a refresh token';

describe('browser-flow no-refresh-token warning (spec)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.mocked(fetchAdminMetadata).mockResolvedValue({
      clientId: 'test-cli-client',
      orgSlug: 'porta-admin',
      issuer: 'https://porta.local:3443/porta-admin',
    });
    vi.mocked(isContainerized).mockReturnValue(false);
    vi.mocked(parseCallbackUrl).mockReturnValue('test-auth-code');
    vi.mocked(question).mockResolvedValue(
      'http://127.0.0.1:11111/callback?code=test-auth-code&state=test-state',
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockTokenResponse(body: Record<string, unknown>): void {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(body),
    });
  }

  async function runFlow(): Promise<{
    logs: string[];
    result: Awaited<ReturnType<typeof executeBrowserFlow>>;
  }> {
    const logs: string[] = [];
    const result = await executeBrowserFlow(
      { server: 'https://porta.local:3443', noBrowser: true },
      (msg: string) => logs.push(msg),
    );
    return { logs, result };
  }

  // ST-7
  it('ST-7: logs the warning and still returns a result when no refresh_token is present', async () => {
    mockTokenResponse({
      access_token: 'test-access-token',
      id_token: 'test-id-token',
      expires_in: 3600,
      // no refresh_token
    });

    const { logs, result } = await runFlow();

    expect(logs.some((m) => m.includes(WARNING_SUBSTRING))).toBe(true);
    // Login still "succeeds": a full result is returned.
    expect(result.accessToken).toBe('test-access-token');
    expect(result.refreshToken).toBeUndefined();
  });

  // ST-8
  it('ST-8: does NOT log the warning when a refresh_token is present', async () => {
    mockTokenResponse({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      id_token: 'test-id-token',
      expires_in: 3600,
    });

    const { logs, result } = await runFlow();

    expect(logs.some((m) => m.includes(WARNING_SUBSTRING))).toBe(false);
    expect(result.refreshToken).toBe('test-refresh-token');
  });
});
