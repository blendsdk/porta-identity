/**
 * Unit tests for OIDC provider rendering hooks.
 *
 * Tests the three custom rendering hooks that replace node-oidc-provider's
 * default bare HTML pages with Porta's styled Handlebars templates:
 *   - logoutSourceHook — logout confirmation page
 *   - postLogoutSuccessSourceHook — post-logout success page
 *   - renderErrorHook — error page
 *
 * Also tests the shared helpers:
 *   - buildDefaultBranding — default branding fallback
 *   - resolveOrgForProviderHook — best-effort org resolution
 *
 * All external dependencies (template engine, i18n, services, logger) are
 * mocked to isolate the hook logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures mock factories run before vi.mock hoisting
// ---------------------------------------------------------------------------

const mockRenderPage = vi.hoisted(() => vi.fn());
const mockResolveLocale = vi.hoisted(() => vi.fn());
const mockGetTranslationFunction = vi.hoisted(() => vi.fn());
const mockGetUserById = vi.hoisted(() => vi.fn());
const mockGetOrganizationById = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

// Mock config — needed because configuration.ts imports config
const mockConfig = vi.hoisted(() => ({
  nodeEnv: 'test' as string,
  port: 3000,
  host: '0.0.0.0',
  databaseUrl: 'postgresql://localhost/porta',
  redisUrl: 'redis://localhost:6379',
  issuerBaseUrl: 'http://localhost:3000',
  cookieKeys: ['test-cookie-key-0123456789'],
  smtp: { host: 'localhost', port: 587, user: '', pass: '', from: 'test@test.com' },
  logLevel: 'info',
  trustProxy: false,
}));

vi.mock('../../../src/config/index.js', () => ({
  config: mockConfig,
}));

vi.mock('../../../src/auth/template-engine.js', () => ({
  renderPage: mockRenderPage,
}));

vi.mock('../../../src/auth/i18n.js', () => ({
  resolveLocale: mockResolveLocale,
  getTranslationFunction: mockGetTranslationFunction,
}));

vi.mock('../../../src/users/service.js', () => ({
  getUserById: mockGetUserById,
}));

vi.mock('../../../src/organizations/service.js', () => ({
  getOrganizationById: mockGetOrganizationById,
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: mockLogger,
}));

// Re-export HTML_CSP so tests can assert the exact value
vi.mock('../../../src/middleware/security-headers.js', () => ({
  HTML_CSP: "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'",
}));

// Import after mocks are set up
import {
  logoutSourceHook,
  postLogoutSuccessSourceHook,
  renderErrorHook,
  buildDefaultBranding,
  resolveOrgForProviderHook,
} from '../../../src/oidc/configuration.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

/** Sample provider form HTML (mimics what node-oidc-provider passes to logoutSource) */
const SAMPLE_FORM = '<form id="op.logoutForm" method="post" action="/session/end/confirm"><input type="hidden" name="xsrf" value="test-xsrf-token"/></form>';

/** Sample organization for branding tests */
const SAMPLE_ORG = {
  id: 'org-123',
  name: 'Acme Corp',
  slug: 'acme',
  status: 'active',
  isSuperAdmin: false,
  defaultLocale: 'en',
  brandingLogoUrl: 'https://acme.com/logo.png',
  brandingFaviconUrl: 'https://acme.com/favicon.ico',
  brandingPrimaryColor: '#FF5733',
  brandingCompanyName: 'Acme Corporation',
  brandingCustomCss: '.custom { color: red; }',
  defaultLoginMethods: ['password', 'magic_link'],
  twoFactorPolicy: 'optional',
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** Sample user for org resolution chain */
const SAMPLE_USER = {
  id: 'user-456',
  organizationId: 'org-123',
  email: 'user@acme.com',
  status: 'active',
};

/** The expected HTML CSP value set by rendering hooks */
const EXPECTED_HTML_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'";

/** Creates a mock ctx that mimics oidc-provider's KoaContextWithOIDC */
function createMockCtx(overrides?: {
  sessionAccountId?: string;
  clientOrgId?: string;
}) {
  return {
    type: '',
    body: '' as unknown,
    set: vi.fn(),
    oidc: {
      session: overrides?.sessionAccountId
        ? { accountId: overrides.sessionAccountId }
        : undefined,
      client: overrides?.clientOrgId
        ? { organizationId: overrides.clientOrgId }
        : undefined,
    },
  };
}

/** Translation function mock that returns the key (simulates key-echo fallback) */
function createMockTranslationFn() {
  return (key: string) => key;
}

// ===========================================================================
// Tests
// ===========================================================================

describe('OIDC Rendering Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock return values
    mockResolveLocale.mockResolvedValue('en');
    mockGetTranslationFunction.mockReturnValue(createMockTranslationFn());
    mockRenderPage.mockResolvedValue('<html><body>Styled Page</body></html>');
    mockGetUserById.mockResolvedValue(null);
    mockGetOrganizationById.mockResolvedValue(null);
  });

  // -------------------------------------------------------------------------
  // buildDefaultBranding
  // -------------------------------------------------------------------------

  describe('buildDefaultBranding', () => {
    it('should return Porta standard blue primary color', () => {
      const branding = buildDefaultBranding();
      expect(branding.primaryColor).toBe('#3B82F6');
    });

    it('should return null for optional branding fields', () => {
      const branding = buildDefaultBranding();
      expect(branding.logoUrl).toBeNull();
      expect(branding.faviconUrl).toBeNull();
      expect(branding.customCss).toBeNull();
    });

    it('should return empty string for company name', () => {
      const branding = buildDefaultBranding();
      expect(branding.companyName).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // resolveOrgForProviderHook
  // -------------------------------------------------------------------------

  describe('resolveOrgForProviderHook', () => {
    it('should resolve org via session accountId (strategy 1)', async () => {
      mockGetUserById.mockResolvedValue(SAMPLE_USER);
      mockGetOrganizationById.mockResolvedValue(SAMPLE_ORG);

      const ctx = createMockCtx({ sessionAccountId: 'user-456' });
      const org = await resolveOrgForProviderHook(ctx);

      expect(org).toEqual(SAMPLE_ORG);
      expect(mockGetUserById).toHaveBeenCalledWith('user-456');
      expect(mockGetOrganizationById).toHaveBeenCalledWith('org-123');
    });

    it('should resolve org via client organizationId (strategy 2)', async () => {
      mockGetOrganizationById.mockResolvedValue(SAMPLE_ORG);

      const ctx = createMockCtx({ clientOrgId: 'org-123' });
      const org = await resolveOrgForProviderHook(ctx);

      expect(org).toEqual(SAMPLE_ORG);
      expect(mockGetOrganizationById).toHaveBeenCalledWith('org-123');
    });

    it('should prefer strategy 1 (session) over strategy 2 (client)', async () => {
      mockGetUserById.mockResolvedValue(SAMPLE_USER);
      mockGetOrganizationById.mockResolvedValue(SAMPLE_ORG);

      const ctx = createMockCtx({
        sessionAccountId: 'user-456',
        clientOrgId: 'other-org-789',
      });
      const org = await resolveOrgForProviderHook(ctx);

      expect(org).toEqual(SAMPLE_ORG);
      // Should have looked up user first, then org from user's orgId
      expect(mockGetUserById).toHaveBeenCalledWith('user-456');
      expect(mockGetOrganizationById).toHaveBeenCalledWith('org-123');
    });

    it('should fall back to strategy 2 when user lookup returns null', async () => {
      mockGetUserById.mockResolvedValue(null);
      mockGetOrganizationById.mockResolvedValue(SAMPLE_ORG);

      const ctx = createMockCtx({
        sessionAccountId: 'unknown-user',
        clientOrgId: 'org-123',
      });
      const org = await resolveOrgForProviderHook(ctx);

      expect(org).toEqual(SAMPLE_ORG);
      expect(mockGetOrganizationById).toHaveBeenCalledWith('org-123');
    });

    it('should return undefined when both strategies fail', async () => {
      const ctx = createMockCtx();
      const org = await resolveOrgForProviderHook(ctx);

      expect(org).toBeUndefined();
    });

    it('should return undefined and log warning on error', async () => {
      mockGetUserById.mockRejectedValue(new Error('DB connection failed'));

      const ctx = createMockCtx({ sessionAccountId: 'user-456' });
      const org = await resolveOrgForProviderHook(ctx);

      expect(org).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Failed to resolve org for provider rendering hook',
      );
    });

    it('should handle ctx without oidc property gracefully', async () => {
      const org = await resolveOrgForProviderHook({});
      expect(org).toBeUndefined();
    });

    it('should handle null ctx gracefully', async () => {
      const org = await resolveOrgForProviderHook(null);
      expect(org).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // logoutSourceHook
  // -------------------------------------------------------------------------

  describe('logoutSourceHook', () => {
    it('should render styled HTML through the template engine', async () => {
      const ctx = createMockCtx();
      await logoutSourceHook(ctx, SAMPLE_FORM);

      expect(ctx.type).toBe('text/html');
      expect(ctx.body).toBe('<html><body>Styled Page</body></html>');
      expect(mockRenderPage).toHaveBeenCalledWith('logout', expect.any(Object));
    });

    it('should inject styled submit button into the provider form', async () => {
      const ctx = createMockCtx();
      await logoutSourceHook(ctx, SAMPLE_FORM);

      // Verify the template context received contains the form with injected button
      const renderCall = mockRenderPage.mock.calls[0];
      const templateContext = renderCall[1];
      expect(templateContext.logoutForm).toContain('btn-primary');
      expect(templateContext.logoutForm).toContain('</button></form>');
    });

    it('should include logout=yes hidden field for full session destruction (Path 1)', async () => {
      const ctx = createMockCtx();
      await logoutSourceHook(ctx, SAMPLE_FORM);

      // Without this field, oidc-provider takes Path 2 (single-client) which does
      // NOT call session.destroy() — the session survives and user stays logged in.
      const templateContext = mockRenderPage.mock.calls[0][1];
      expect(templateContext.logoutForm).toContain('name="logout"');
      expect(templateContext.logoutForm).toContain('value="yes"');
    });

    it('should use translated button text in the injected button', async () => {
      const mockT = vi.fn((key: string) => {
        if (key === 'logout.confirm') return 'Sign Out';
        return key;
      });
      mockGetTranslationFunction.mockReturnValue(mockT);

      const ctx = createMockCtx();
      await logoutSourceHook(ctx, SAMPLE_FORM);

      const templateContext = mockRenderPage.mock.calls[0][1];
      expect(templateContext.logoutForm).toContain('Sign Out</button>');
    });

    it('should preserve the provider xsrf hidden field in the form', async () => {
      const ctx = createMockCtx();
      await logoutSourceHook(ctx, SAMPLE_FORM);

      const templateContext = mockRenderPage.mock.calls[0][1];
      expect(templateContext.logoutForm).toContain('name="xsrf"');
      expect(templateContext.logoutForm).toContain('value="test-xsrf-token"');
    });

    it('should preserve the provider form action URL', async () => {
      const ctx = createMockCtx();
      await logoutSourceHook(ctx, SAMPLE_FORM);

      const templateContext = mockRenderPage.mock.calls[0][1];
      expect(templateContext.logoutForm).toContain('action="/session/end/confirm"');
    });

    it('should use org branding when org is resolved', async () => {
      mockGetUserById.mockResolvedValue(SAMPLE_USER);
      mockGetOrganizationById.mockResolvedValue(SAMPLE_ORG);

      const ctx = createMockCtx({ sessionAccountId: 'user-456' });
      await logoutSourceHook(ctx, SAMPLE_FORM);

      const templateContext = mockRenderPage.mock.calls[0][1];
      expect(templateContext.branding.primaryColor).toBe('#FF5733');
      expect(templateContext.branding.companyName).toBe('Acme Corporation');
      expect(templateContext.branding.logoUrl).toBe('https://acme.com/logo.png');
      expect(templateContext.orgSlug).toBe('acme');
    });

    it('should use default branding when org resolution fails', async () => {
      const ctx = createMockCtx();
      await logoutSourceHook(ctx, SAMPLE_FORM);

      const templateContext = mockRenderPage.mock.calls[0][1];
      expect(templateContext.branding.primaryColor).toBe('#3B82F6');
      expect(templateContext.branding.companyName).toBe('');
      expect(templateContext.orgSlug).toBe('');
    });

    it('should set empty csrfToken (provider handles CSRF via xsrf field)', async () => {
      const ctx = createMockCtx();
      await logoutSourceHook(ctx, SAMPLE_FORM);

      const templateContext = mockRenderPage.mock.calls[0][1];
      expect(templateContext.csrfToken).toBe('');
    });

    it('should set HTML_CSP header for styled rendering', async () => {
      const ctx = createMockCtx();
      await logoutSourceHook(ctx, SAMPLE_FORM);

      expect(ctx.set).toHaveBeenCalledWith('Content-Security-Policy', EXPECTED_HTML_CSP);
    });

    it('should set HTML_CSP header even in fallback path', async () => {
      mockRenderPage.mockRejectedValue(new Error('fail'));

      const ctx = createMockCtx();
      await logoutSourceHook(ctx, SAMPLE_FORM);

      expect(ctx.set).toHaveBeenCalledWith('Content-Security-Policy', EXPECTED_HTML_CSP);
    });

    it('should fall back to minimal HTML when template engine throws', async () => {
      mockRenderPage.mockRejectedValue(new Error('Template compilation failed'));

      const ctx = createMockCtx();
      await logoutSourceHook(ctx, SAMPLE_FORM);

      expect(ctx.type).toBe('text/html');
      // Fallback should contain the original form so the user can still sign out
      expect(ctx.body).toContain(SAMPLE_FORM);
      expect(ctx.body).toContain('Sign out');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Failed to render custom logout page',
      );
    });

    it('should fall back to minimal HTML that still contains a submit button', async () => {
      mockRenderPage.mockRejectedValue(new Error('fail'));

      const ctx = createMockCtx();
      await logoutSourceHook(ctx, SAMPLE_FORM);

      // Fallback must have a button so the user can still complete logout
      expect(ctx.body).toContain('<button type="submit">');
    });

    it('should include logout=yes hidden field in fallback HTML for full session destruction', async () => {
      mockRenderPage.mockRejectedValue(new Error('fail'));

      const ctx = createMockCtx();
      await logoutSourceHook(ctx, SAMPLE_FORM);

      // Even the fallback must include logout=yes, otherwise the session survives
      expect(ctx.body).toContain('name="logout"');
      expect(ctx.body).toContain('value="yes"');
    });
  });

  // -------------------------------------------------------------------------
  // postLogoutSuccessSourceHook
  // -------------------------------------------------------------------------

  describe('postLogoutSuccessSourceHook', () => {
    it('should render styled HTML through the template engine', async () => {
      const ctx = createMockCtx();
      await postLogoutSuccessSourceHook(ctx);

      expect(ctx.type).toBe('text/html');
      expect(ctx.body).toBe('<html><body>Styled Page</body></html>');
      expect(mockRenderPage).toHaveBeenCalledWith('logout-success', expect.any(Object));
    });

    it('should always use default branding (session is destroyed)', async () => {
      const ctx = createMockCtx();
      await postLogoutSuccessSourceHook(ctx);

      const templateContext = mockRenderPage.mock.calls[0][1];
      expect(templateContext.branding.primaryColor).toBe('#3B82F6');
      expect(templateContext.branding.companyName).toBe('');
      expect(templateContext.orgSlug).toBe('');
    });

    it('should not attempt org resolution', async () => {
      const ctx = createMockCtx();
      await postLogoutSuccessSourceHook(ctx);

      // Service functions should not be called — session is destroyed
      expect(mockGetUserById).not.toHaveBeenCalled();
      expect(mockGetOrganizationById).not.toHaveBeenCalled();
    });

    it('should set empty csrfToken and orgSlug', async () => {
      const ctx = createMockCtx();
      await postLogoutSuccessSourceHook(ctx);

      const templateContext = mockRenderPage.mock.calls[0][1];
      expect(templateContext.csrfToken).toBe('');
      expect(templateContext.orgSlug).toBe('');
    });

    it('should set HTML_CSP header for styled rendering', async () => {
      const ctx = createMockCtx();
      await postLogoutSuccessSourceHook(ctx);

      expect(ctx.set).toHaveBeenCalledWith('Content-Security-Policy', EXPECTED_HTML_CSP);
    });

    it('should fall back to minimal HTML when template engine throws', async () => {
      mockRenderPage.mockRejectedValue(new Error('Template compilation failed'));

      const ctx = createMockCtx();
      await postLogoutSuccessSourceHook(ctx);

      expect(ctx.type).toBe('text/html');
      expect(ctx.body).toContain('Signed out');
      expect(ctx.body).toContain('signed out successfully');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Failed to render custom post-logout page',
      );
    });

    it('should set HTML_CSP header even in fallback path', async () => {
      mockRenderPage.mockRejectedValue(new Error('fail'));

      const ctx = createMockCtx();
      await postLogoutSuccessSourceHook(ctx);

      expect(ctx.set).toHaveBeenCalledWith('Content-Security-Policy', EXPECTED_HTML_CSP);
    });
  });

  // -------------------------------------------------------------------------
  // renderErrorHook
  // -------------------------------------------------------------------------

  describe('renderErrorHook', () => {
    it('should render styled HTML through the template engine', async () => {
      const ctx = createMockCtx();
      await renderErrorHook(ctx, { error: 'invalid_client' }, new Error('test'));

      expect(ctx.type).toBe('text/html');
      expect(ctx.body).toBe('<html><body>Styled Page</body></html>');
      expect(mockRenderPage).toHaveBeenCalledWith('error', expect.any(Object));
    });

    it('should pass OIDC error code to the template', async () => {
      const ctx = createMockCtx();
      await renderErrorHook(ctx, { error: 'invalid_client' }, new Error('test'));

      const templateContext = mockRenderPage.mock.calls[0][1];
      expect(templateContext.errorCode).toBe('invalid_client');
    });

    it('should use generic i18n error message (NOT raw error_description)', async () => {
      const mockT = vi.fn((key: string) => {
        if (key === 'errors.generic') return 'Something went wrong';
        return key;
      });
      mockGetTranslationFunction.mockReturnValue(mockT);

      const ctx = createMockCtx();
      // Provide an error_description that should NOT appear in the output
      await renderErrorHook(
        ctx,
        { error: 'invalid_grant', error_description: 'grant not found in database' },
        new Error('internal error details'),
      );

      const templateContext = mockRenderPage.mock.calls[0][1];
      // SECURITY: errorMessage must be the generic i18n string, NOT the error_description
      expect(templateContext.errorMessage).toBe('Something went wrong');
    });

    it('should NOT expose error_description to the template (security)', async () => {
      const ctx = createMockCtx();
      const sensitiveDescription = 'client not found: porta_client_abc123 in org org-secret-id';

      await renderErrorHook(
        ctx,
        { error: 'invalid_client', error_description: sensitiveDescription },
        new Error('internal'),
      );

      const templateContext = mockRenderPage.mock.calls[0][1];
      // Verify the sensitive description is not in the template context
      expect(JSON.stringify(templateContext)).not.toContain(sensitiveDescription);
    });

    it('should use org branding when org is resolved via client', async () => {
      mockGetOrganizationById.mockResolvedValue(SAMPLE_ORG);

      const ctx = createMockCtx({ clientOrgId: 'org-123' });
      await renderErrorHook(ctx, { error: 'access_denied' }, new Error('test'));

      const templateContext = mockRenderPage.mock.calls[0][1];
      expect(templateContext.branding.primaryColor).toBe('#FF5733');
      expect(templateContext.orgSlug).toBe('acme');
    });

    it('should use default branding when org resolution fails', async () => {
      const ctx = createMockCtx();
      await renderErrorHook(ctx, { error: 'server_error' }, new Error('test'));

      const templateContext = mockRenderPage.mock.calls[0][1];
      expect(templateContext.branding.primaryColor).toBe('#3B82F6');
      expect(templateContext.orgSlug).toBe('');
    });

    it('should set HTML_CSP header for styled rendering', async () => {
      const ctx = createMockCtx();
      await renderErrorHook(ctx, { error: 'invalid_client' }, new Error('test'));

      expect(ctx.set).toHaveBeenCalledWith('Content-Security-Policy', EXPECTED_HTML_CSP);
    });

    it('should fall back to minimal HTML when template engine throws', async () => {
      mockRenderPage.mockRejectedValue(new Error('Template compilation failed'));

      const ctx = createMockCtx();
      await renderErrorHook(ctx, { error: 'server_error' }, new Error('test'));

      expect(ctx.type).toBe('text/html');
      expect(ctx.body).toContain('Error');
      expect(ctx.body).toContain('An error occurred');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Failed to render custom error page',
      );
    });

    it('should set HTML_CSP header even in fallback path', async () => {
      mockRenderPage.mockRejectedValue(new Error('fail'));

      const ctx = createMockCtx();
      await renderErrorHook(ctx, { error: 'server_error' }, new Error('test'));

      expect(ctx.set).toHaveBeenCalledWith('Content-Security-Policy', EXPECTED_HTML_CSP);
    });

    it('should NOT expose error_description in the fallback HTML either', async () => {
      mockRenderPage.mockRejectedValue(new Error('fail'));

      const ctx = createMockCtx();
      await renderErrorHook(
        ctx,
        { error: 'invalid_grant', error_description: 'secret internal detail' },
        new Error('internal'),
      );

      // The fallback HTML should not contain the error_description
      expect(ctx.body).not.toContain('secret internal detail');
    });
  });
});
