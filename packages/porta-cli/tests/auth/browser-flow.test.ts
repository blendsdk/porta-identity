/**
 * Tests for the OIDC browser flow orchestration.
 *
 * Verifies the authorization URL construction, including the `prompt=login`
 * parameter that forces fresh credential entry on every `porta login`.
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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { executeBrowserFlow } from '../../src/auth/browser-flow.js';
import { fetchAdminMetadata } from '../../src/auth/metadata.js';
import { parseCallbackUrl, isContainerized } from '../../src/auth/callback-server.js';
import { question } from '../../src/prompt.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('browser-flow', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Admin metadata discovery
    vi.mocked(fetchAdminMetadata).mockResolvedValue({
      clientId: 'test-cli-client',
      orgSlug: 'porta-admin',
      issuer: 'https://porta.local:3443/porta-admin',
    });

    // Callback server helpers
    vi.mocked(isContainerized).mockReturnValue(false);
    vi.mocked(parseCallbackUrl).mockReturnValue('test-auth-code');

    // Manual-mode prompt returns a callback URL
    vi.mocked(question).mockResolvedValue(
      'http://127.0.0.1:11111/callback?code=test-auth-code&state=test-state',
    );

    // Mock fetch for the token exchange
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          id_token: 'test-id-token',
          expires_in: 3600,
        }),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  /**
   * Helper: run the flow in manual (noBrowser) mode and capture the
   * authorization URL that gets printed to the log output.
   */
  async function runFlowCapturingUrl(
    options: { noBrowser?: boolean; clientId?: string } = {},
  ): Promise<{ url: URL; result: Awaited<ReturnType<typeof executeBrowserFlow>> }> {
    const logMessages: string[] = [];
    const log = (msg: string): void => {
      logMessages.push(msg);
    };

    const result = await executeBrowserFlow(
      { server: 'https://porta.local:3443', noBrowser: true, ...options },
      log,
    );

    // The URL is printed in the second log message (index 1)
    const urlLine = logMessages.find((m) => m.includes('porta.local:3443/porta-admin'));
    expect(urlLine).toBeDefined();
    const url = new URL(urlLine!.trim());

    return { url, result };
  }

  describe('authorization URL construction', () => {
    it('includes prompt=login to force fresh credentials', async () => {
      const { url } = await runFlowCapturingUrl();
      expect(url.searchParams.get('prompt')).toBe('login');
    });

    it('includes all required OIDC parameters', async () => {
      const { url } = await runFlowCapturingUrl();

      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('client_id')).toBe('test-cli-client');
      expect(url.searchParams.get('scope')).toBe('openid profile email offline_access');
      expect(url.searchParams.get('code_challenge')).toBe('test-challenge');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('state')).toBe('test-state');
    });

    it('uses the discovered org slug in the auth path', async () => {
      const { url } = await runFlowCapturingUrl();
      expect(url.pathname).toBe('/porta-admin/auth');
    });

    it('uses override client ID when provided', async () => {
      const { url } = await runFlowCapturingUrl({ clientId: 'custom-client' });
      expect(url.searchParams.get('client_id')).toBe('custom-client');
    });
  });

  describe('flow result', () => {
    it('returns a complete auth flow result', async () => {
      const { result } = await runFlowCapturingUrl();

      expect(result).toEqual({
        server: 'https://porta.local:3443',
        orgSlug: 'porta-admin',
        clientId: 'test-cli-client',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        idToken: 'test-id-token',
        expiresAt: expect.any(String),
        userInfo: {
          sub: 'user-123',
          email: 'admin@example.com',
          name: 'Admin User',
        },
      });
    });
  });
});
