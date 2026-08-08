/**
 * Specification tests for the graceful SessionNotFound recovery in renderErrorHook.
 *
 * Source: plans/auth-session-token-fixes/07-testing-strategy.md (ST-15, ST-16,
 * ST-18), 03-02-prompt-login-session-reset.md, AR-4.
 *
 * Behavior under test: when the OIDC error rendered by `renderErrorHook` is a
 * SessionNotFound (error code `invalid_request` per node-oidc-provider, with an
 * error_description indicating a missing/mismatched session), the hook clears
 * the stale `_session`/`_session.sig` cookies and renders a recovery message
 * (instead of the generic terminal error). For any other error, behavior is
 * unchanged (no cookie clearing).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted ensures these are initialized before vi.mock factories run.
const { mockRenderPage, mockT } = vi.hoisted(() => ({
  mockRenderPage: vi.fn(async () => '<html><body>Page</body></html>'),
  mockT: vi.fn((key: string) => key),
}));

vi.mock('../../../src/config/index.js', () => ({
  config: { issuerBaseUrl: 'https://porta.local:3443' },
}));
vi.mock('../../../src/auth/template-engine.js', () => ({
  renderPage: mockRenderPage,
}));
vi.mock('../../../src/auth/i18n.js', () => ({
  resolveLocale: vi.fn(async () => 'en'),
  getTranslationFunction: vi.fn(() => mockT),
}));
vi.mock('../../../src/users/service.js', () => ({ getUserById: vi.fn(async () => undefined) }));
vi.mock('../../../src/organizations/service.js', () => ({ getOrganizationById: vi.fn(async () => undefined) }));
vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('../../../src/middleware/security-headers.js', () => ({
  HTML_CSP: "default-src 'none'",
}));

import { renderErrorHook } from '../../../src/oidc/configuration.js';

/** Build a fake provider ctx with a recording cookies.set. */
function makeCtx() {
  const setCalls: Array<{ name: string; value: unknown; opts: Record<string, unknown> }> = [];
  return {
    type: '',
    body: '' as unknown,
    set: vi.fn(),
    cookies: {
      set: (name: string, value: unknown, opts: Record<string, unknown>) =>
        setCalls.push({ name, value, opts }),
    },
    oidc: {
      session: undefined,
      client: undefined,
      provider: { cookieName: (_t: string) => '_session' },
    },
    _setCalls: setCalls,
  };
}

/** A SessionNotFound-like error (node-oidc-provider: name SessionNotFound, error invalid_request). */
function sessionNotFoundError(message = 'interaction session not found'): Error {
  const err = new Error(message);
  err.name = 'SessionNotFound';
  return err;
}

describe('renderErrorHook SessionNotFound recovery (spec)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRenderPage.mockResolvedValue('<html><body>Page</body></html>');
    mockT.mockImplementation((key: string) => key);
  });

  // ST-15
  it('ST-15: clears _session and _session.sig and renders recovery on SessionNotFound', async () => {
    const ctx = makeCtx();
    await renderErrorHook(
      ctx as never,
      { error: 'invalid_request', error_description: 'interaction session not found' },
      sessionNotFoundError(),
    );

    const cleared = ctx._setCalls.map((c) => c.name);
    expect(cleared).toContain('_session');
    expect(cleared).toContain('_session.sig');

    // Still renders an HTML page (recovery) and sets CSP.
    expect(ctx.type).toBe('text/html');
    expect(mockRenderPage).toHaveBeenCalled();
  });

  // ST-16
  it('ST-16: does NOT clear cookies for a non-SessionNotFound error', async () => {
    const ctx = makeCtx();
    await renderErrorHook(
      ctx as never,
      { error: 'invalid_client' },
      new Error('client authentication failed'),
    );

    expect(ctx._setCalls).toHaveLength(0);
    expect(mockRenderPage).toHaveBeenCalledWith('error', expect.any(Object));
  });

  // ST-18: recovery does not accept any session — it only clears + re-renders.
  it('ST-18: recovery path does not set any session/account state', async () => {
    const ctx = makeCtx();
    await renderErrorHook(
      ctx as never,
      { error: 'invalid_request', error_description: 'interaction session and authentication session mismatch' },
      sessionNotFoundError('interaction session and authentication session mismatch'),
    );

    // The hook must not mutate oidc.session into an authenticated state.
    expect(ctx.oidc.session).toBeUndefined();
    // Cookies were cleared (dead session removed), proving no acceptance.
    expect(ctx._setCalls.map((c) => c.name)).toContain('_session');
  });
});
