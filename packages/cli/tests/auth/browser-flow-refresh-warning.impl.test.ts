/**
 * Implementation tests for the CLI no-refresh-token warning.
 *
 * Verifies the exact approved warning text (AR-8) and that the warning is
 * delivered through the injected `log` callback. Source:
 * plans/auth-session-token-fixes/07-testing-strategy.md (impl tests).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  decodeJwt: vi.fn().mockReturnValue({ sub: 'u', email: 'a@b.c' }),
}));

import { executeBrowserFlow } from '../../src/auth/browser-flow.js';
import { fetchAdminMetadata } from '../../src/auth/metadata.js';
import { parseCallbackUrl, isContainerized } from '../../src/auth/callback-server.js';
import { question } from '../../src/prompt.js';

/** Exact approved warning text (AR-8). */
const EXPECTED_WARNING =
  "Warning: the server did not issue a refresh token. You'll need to run 'porta login' " +
  'again when the access token expires (~1h). Ensure the client allows the ' +
  "'refresh_token' grant and the 'offline_access' scope.";

describe('browser-flow no-refresh-token warning (impl)', () => {
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
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'a',
          id_token: 'i',
          expires_in: 3600,
          // no refresh_token
        }),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('logs the EXACT approved warning text via the log callback', async () => {
    const logs: string[] = [];
    await executeBrowserFlow(
      { server: 'https://porta.local:3443', noBrowser: true },
      (msg) => logs.push(msg),
    );

    expect(logs).toContain(EXPECTED_WARNING);
  });
});
