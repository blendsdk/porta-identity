/**
 * OIDC provider configuration builder.
 *
 * Builds the complete node-oidc-provider configuration object from external
 * dependencies (TTLs, keys, adapter factory, finders). This is a pure function
 * with no side effects — all dependencies are injected as parameters.
 *
 * The configuration enables:
 * - Hybrid adapter (Postgres/Redis) for OIDC artifact storage
 * - ES256 signing keys loaded from the database
 * - Client lookup via adapter pattern (adapter.find('Client', id) → findForOidc())
 * - PKCE required for all authorization code flows (S256 only)
 * - Token introspection, revocation, and client credentials
 * - Standard OIDC scopes and claims mapping
 * - Refresh token rotation
 * - Cookie signing with rotation support
 */

import type { OidcTtlConfig } from '../lib/system-config.js';
import type { JwkKeyPair } from '../lib/signing-keys.js';
import { config } from '../config/index.js';
import { HTML_CSP } from '../middleware/security-headers.js';
import { renderPage } from '../auth/template-engine.js';
import { resolveLocale, getTranslationFunction } from '../auth/i18n.js';
import { logger } from '../lib/logger.js';
import { getUserById } from '../users/service.js';
import { getOrganizationById } from '../organizations/service.js';
import type { Organization } from '../organizations/types.js';

/** Parameters required to build the provider configuration */
export interface BuildProviderConfigParams {
  /** Token TTL configuration loaded from system_config table */
  ttl: OidcTtlConfig;
  /** JWK key set loaded from signing_keys table */
  jwks: { keys: JwkKeyPair[] };
  /** Cookie signing keys from application config (supports rotation) */
  cookieKeys: string[];
  /** Account finder function — looks up users by subject ID */
  findAccount: (ctx: unknown, sub: string) => Promise<{ accountId: string; claims: (use: string, scope: string) => Promise<Record<string, unknown>> } | undefined>;
  /** Adapter class factory — node-oidc-provider instantiates with `new` */
  adapterFactory: unknown;
  /** Interaction URL builder — returns the login/consent URL for a given interaction */
  interactionUrl: (ctx: unknown, interaction: { uid: string }) => string;
  /** CORS handler — determines if an origin is allowed for a client */
  clientBasedCORS?: (ctx: unknown, origin: string, client: unknown) => boolean;
}

// ---------------------------------------------------------------------------
// Rendering hook helpers
// ---------------------------------------------------------------------------

/**
 * Build default branding when org resolution is not possible.
 * Used by rendering hooks when the session is destroyed or org lookup fails.
 *
 * @returns Default branding with Porta's standard blue primary color
 */
export function buildDefaultBranding() {
  return {
    logoUrl: null as string | null,
    faviconUrl: null as string | null,
    primaryColor: '#3B82F6',
    companyName: '',
    customCss: null as string | null,
  };
}

/**
 * Build branding context from a resolved organization.
 * Maps Organization entity fields to the TemplateContext branding shape.
 *
 * @param org - The resolved organization
 * @returns Branding object for TemplateContext
 */
function buildBrandingFromOrg(org: Organization) {
  return {
    logoUrl: org.brandingLogoUrl,
    faviconUrl: org.brandingFaviconUrl,
    primaryColor: org.brandingPrimaryColor ?? '#3B82F6',
    companyName: org.brandingCompanyName ?? org.name,
    customCss: org.brandingCustomCss,
  };
}

/**
 * Best-effort organization resolution for oidc-provider rendering hooks.
 *
 * Tries multiple strategies in order:
 *   1. Session accountId → user lookup → org lookup
 *   2. Client metadata → organizationId → org lookup
 *   3. Returns undefined (caller uses default branding)
 *
 * All errors are caught and logged — never throws.
 *
 * @param ctx - oidc-provider's enhanced Koa context (KoaContextWithOIDC)
 * @returns The resolved Organization, or undefined if resolution fails
 */
export async function resolveOrgForProviderHook(ctx: unknown): Promise<Organization | undefined> {
  try {
    // Access oidc-provider's internal context extensions.
    // Using `any` because KoaContextWithOIDC is an internal provider type
    // that we don't want to import directly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oidcCtx = ctx as any;

    // Strategy 1: Session accountId → user lookup → org lookup
    const accountId = oidcCtx?.oidc?.session?.accountId as string | undefined;
    if (accountId) {
      const user = await getUserById(accountId);
      if (user) {
        const org = await getOrganizationById(user.organizationId);
        if (org) return org;
      }
    }

    // Strategy 2: Client metadata → organizationId → org lookup
    const orgId = oidcCtx?.oidc?.client?.organizationId as string | undefined;
    if (orgId) {
      const org = await getOrganizationById(orgId);
      if (org) return org;
    }

    return undefined;
  } catch (err) {
    logger.warn({ err }, 'Failed to resolve org for provider rendering hook');
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Rendering hook functions
// ---------------------------------------------------------------------------

/**
 * Custom logoutSource hook for node-oidc-provider.
 *
 * Replaces the provider's default bare HTML logout confirmation page with
 * Porta's styled Handlebars template. Injects a styled submit button into
 * the provider's pre-built form (which contains the correct action URL and
 * xsrf hidden field).
 *
 * Falls back to minimal inline HTML if the template engine fails, ensuring
 * the user can still sign out even if templating breaks.
 *
 * @param ctx - oidc-provider's enhanced Koa context
 * @param form - Pre-built HTML form from the provider (contains action + xsrf)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logoutSourceHook(ctx: any, form: string): Promise<void> {
  try {
    // Resolve org for branding (best-effort, defaults on failure)
    const org = await resolveOrgForProviderHook(ctx);
    const branding = org ? buildBrandingFromOrg(org) : buildDefaultBranding();

    // Resolve locale and translation function
    const locale = await resolveLocale(undefined, undefined, org?.defaultLocale ?? '');
    const t = getTranslationFunction(locale, org?.slug);

    // Inject the "logout=yes" hidden field and a styled submit button into
    // the provider's form. The provider's form contains the action URL and
    // xsrf token but lacks both the logout flag and a submit button.
    //
    // The "logout" field is CRITICAL: without it, oidc-provider takes the
    // single-client RP-initiated path (Path 2 in end_session.js) which does
    // NOT call session.destroy() — the session survives and the user stays
    // logged in. With logout=yes, it takes Path 1: full session destruction.
    const styledForm = form.replace(
      '</form>',
      `<input type="hidden" name="logout" value="yes"/><button type="submit" class="btn-primary">${t('logout.confirm')}</button></form>`,
    );

    // Extract client name and post_logout_redirect_uri from the OIDC context.
    // These are available on the oidc-provider's ctx.oidc during the end_session flow.
    // Used by the template to show which app triggered logout and offer a "cancel" link.
    const clientName = ctx.oidc?.client?.metadata()?.client_name as string | undefined;
    const returnUrl = ctx.oidc?.params?.post_logout_redirect_uri as string | undefined;

    // Render through the template engine (Handlebars + layout)
    const html = await renderPage('logout', {
      branding,
      locale,
      t,
      csrfToken: '', // Provider handles CSRF via xsrf field in the form
      orgSlug: org?.slug ?? '',
      logoutForm: styledForm,
      clientName: clientName ?? null,
      returnUrl: returnUrl ?? null,
    });

    ctx.type = 'text/html';
    ctx.set('Content-Security-Policy', HTML_CSP);
    ctx.body = html;
  } catch (err) {
    // Fallback: render minimal HTML if template engine fails.
    // Ensures the user can still sign out even if templating breaks.
    logger.error({ err }, 'Failed to render custom logout page');
    ctx.type = 'text/html';
    ctx.set('Content-Security-Policy', HTML_CSP);
    ctx.body = `<!DOCTYPE html><html><body>${form}<script>document.querySelector('form').insertAdjacentHTML('beforeend','<input type="hidden" name="logout" value="yes"/><button type="submit">Sign out</button>')</script></body></html>`;
  }
}

/**
 * Custom postLogoutSuccessSource hook for node-oidc-provider.
 *
 * Replaces the provider's default bare HTML post-logout page with
 * Porta's styled Handlebars template. At this point the session is
 * already destroyed, so org resolution is not possible — default
 * branding is always used.
 *
 * Falls back to minimal inline HTML if the template engine fails.
 *
 * @param ctx - oidc-provider's enhanced Koa context
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function postLogoutSuccessSourceHook(ctx: any): Promise<void> {
  try {
    // Session is destroyed at this point — can't resolve org.
    // Always use default branding for the post-logout page.
    const branding = buildDefaultBranding();
    const locale = await resolveLocale(undefined, undefined, '');
    const t = getTranslationFunction(locale);

    const html = await renderPage('logout-success', {
      branding,
      locale,
      t,
      csrfToken: '',
      orgSlug: '',
    });

    ctx.type = 'text/html';
    ctx.set('Content-Security-Policy', HTML_CSP);
    ctx.body = html;
  } catch (err) {
    logger.error({ err }, 'Failed to render custom post-logout page');
    ctx.type = 'text/html';
    ctx.set('Content-Security-Policy', HTML_CSP);
    ctx.body = '<!DOCTYPE html><html><body><h1>Signed out</h1><p>You have been signed out successfully.</p></body></html>';
  }
}

/**
 * Custom renderError hook for node-oidc-provider.
 *
 * Replaces the provider's default bare HTML error page with Porta's styled
 * Handlebars template. The OIDC error code (e.g., 'invalid_client') is shown
 * to the user, but the raw error_description is intentionally suppressed to
 * prevent information leakage — a generic i18n error message is shown instead.
 *
 * SECURITY: error_description may contain internal details like "client not
 * found", "grant not found", etc. Only the standardized OIDC error code is
 * safe to display.
 *
 * @param ctx - oidc-provider's enhanced Koa context
 * @param out - OIDC error details (error code + optional description)
 * @param _error - Original Error object (unused — we use generic message)
 */
export async function renderErrorHook(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  out: { error: string; error_description?: string },
  _error: Error,
): Promise<void> {
  try {
    // Resolve org from client context for branding (best-effort)
    const org = await resolveOrgForProviderHook(ctx);
    const branding = org ? buildBrandingFromOrg(org) : buildDefaultBranding();

    // Resolve locale and translation function
    const locale = await resolveLocale(undefined, undefined, org?.defaultLocale ?? '');
    const t = getTranslationFunction(locale, org?.slug);

    // SECURITY: Never expose raw error_description to the user — it may
    // contain internal details. Use generic i18n message instead.
    // OIDC error codes (e.g., 'invalid_client') are safe standard strings.
    const html = await renderPage('error', {
      branding,
      locale,
      t,
      csrfToken: '',
      orgSlug: org?.slug ?? '',
      errorMessage: t('errors.generic'),
      errorCode: out.error,
    });

    ctx.type = 'text/html';
    ctx.set('Content-Security-Policy', HTML_CSP);
    ctx.body = html;
  } catch (err) {
    logger.error({ err }, 'Failed to render custom error page');
    ctx.type = 'text/html';
    ctx.set('Content-Security-Policy', HTML_CSP);
    ctx.body = '<!DOCTYPE html><html><body><h1>Error</h1><p>An error occurred.</p></body></html>';
  }
}

// ---------------------------------------------------------------------------
// Provider configuration builder
// ---------------------------------------------------------------------------

/**
 * Build the complete node-oidc-provider configuration object.
 *
 * Takes all external dependencies as parameters to keep this function
 * pure and testable. The resulting configuration covers all OIDC features
 * needed by Porta.
 *
 * @param params - All dependencies for the provider configuration
 * @returns Complete Configuration object for node-oidc-provider
 */
export function buildProviderConfiguration(params: BuildProviderConfigParams): Record<string, unknown> {
  const { ttl, jwks, cookieKeys, findAccount, adapterFactory, interactionUrl, clientBasedCORS } = params;

  return {
    // Adapter — hybrid Postgres/Redis via factory
    adapter: adapterFactory,

    // Account finder — looks up users for ID token claims and userinfo
    findAccount,

    // OIDC features
    features: {
      // Disable devInteractions — we provide our own login/consent UI
      devInteractions: { enabled: false },
      // Enable token introspection (RFC 7662)
      introspection: { enabled: true },
      // Enable token revocation (RFC 7009)
      revocation: { enabled: true },
      // Enable resource indicators (RFC 8707)
      resourceIndicators: {
        enabled: true,
        // Only audience-restrict tokens when the client explicitly requests a resource.
        // When oneOf is undefined (no `resource` param in auth request), returning
        // undefined produces a standard, unrestricted token that works with /me (userinfo).
        // Previously this unconditionally returned 'urn:porta:default', which audience-
        // restricted EVERY token and caused the userinfo endpoint to reject them all.
        defaultResource: async (_ctx: unknown, _client: unknown, oneOf?: string) =>
          oneOf ?? undefined,
        getResourceServerInfo: () => ({
          scope: 'openid profile email',
          audience: 'urn:porta:default',
          accessTokenFormat: 'opaque',
          accessTokenTTL: ttl.accessToken,
        }),
        useGrantedResource: () => true,
      },
      // Enable client credentials grant (RFC 6749 §4.4)
      clientCredentials: { enabled: true },
      // Enable RP-initiated logout (OpenID Connect RP-Initiated Logout 1.0)
      rpInitiatedLogout: {
        enabled: true,
        logoutSource: logoutSourceHook,
        postLogoutSuccessSource: postLogoutSuccessSourceHook,
      },
    },

    // Token formats — opaque access tokens, JWT ID tokens (default)
    formats: {
      AccessToken: 'opaque',
      ClientCredentials: 'opaque',
    },

    // PKCE — required for all authorization code flows, S256 only.
    // This is a security best practice that prevents authorization code interception.
    pkce: {
      required: () => true,
      methods: ['S256'],
    },

    // Token TTLs from system_config table
    ttl: {
      AccessToken: ttl.accessToken,
      AuthorizationCode: ttl.authorizationCode,
      IdToken: ttl.idToken,
      RefreshToken: ttl.refreshToken,
      Interaction: ttl.interaction,
      Session: ttl.session,
      Grant: ttl.grant,
    },

    // Issue refresh tokens for clients that support them.
    // The default oidc-provider implementation only checks code.scopes.has('offline_access'),
    // but offline_access may not propagate to the code scopes in all consent flows.
    // This explicit function ensures refresh tokens are issued whenever the client
    // lists 'refresh_token' in its grant_types AND the auth request included offline_access.
    issueRefreshToken: async (
      _ctx: unknown,
      client: { grantTypeAllowed: (type: string) => boolean },
      code: { scopes: Set<string> },
    ) => {
      return client.grantTypeAllowed('refresh_token') && (
        code.scopes.has('offline_access') ||
        // Fallback: also issue for confidential web clients (web + auth method != none)
        ((client as Record<string, unknown>).applicationType === 'web' &&
         (client as Record<string, unknown>).tokenEndpointAuthMethod !== 'none')
      );
    },

    // Enable refresh token rotation — each refresh generates a new token
    rotateRefreshToken: true,

    // Standard OIDC scopes
    scopes: ['openid', 'profile', 'email', 'address', 'phone', 'offline_access'],

    // OIDC claims mapping per scope.
    // Standard claims follow OpenID Connect Core §5.4.
    // Custom claims (roles, permissions, ERP attributes) are mapped to
    // 'openid' so they are always included when the openid scope is granted.
    // This follows the Auth0/Okta/Azure AD pattern of always-include custom claims.
    claims: {
      openid: [
        'sub',
        // RBAC claims — always included
        'roles', 'permissions',
        // Custom ERP claims — always included
        'department', 'employee_id', 'cost_center', 'job_title',
      ],
      profile: [
        'name', 'given_name', 'family_name', 'middle_name', 'nickname',
        'preferred_username', 'profile', 'picture', 'website',
        'gender', 'birthdate', 'zoneinfo', 'locale', 'updated_at',
      ],
      email: ['email', 'email_verified'],
      address: ['address'],
      phone: ['phone_number', 'phone_number_verified'],
    },

    // Supported response types and grant types
    responseTypes: ['code'],
    grantTypes: ['authorization_code', 'client_credentials', 'refresh_token'],

    // Interaction URL — where users are redirected for login/consent.
    // Placeholder for RD-03; real login UI implemented in RD-07.
    interactions: {
      url: interactionUrl,
    },

    // Signing keys in JWK format
    jwks,

    // Cookie configuration with signing key rotation support.
    // The `secure` flag is derived from the configured issuer URL:
    //   - HTTPS issuer → secure: true  (cookies only sent over TLS)
    //   - HTTP  issuer → secure: false  (allows local dev on localhost)
    // This is the same check used by the HSTS header in security-headers.ts.
    cookies: {
      keys: cookieKeys,
      long: { signed: true, httpOnly: true, sameSite: 'lax' as const, secure: config.issuerBaseUrl.startsWith('https://') },
      short: { signed: true, httpOnly: true, sameSite: 'lax' as const, secure: config.issuerBaseUrl.startsWith('https://') },
    },

    // CORS handler — checks client's allowed_origins
    clientBasedCORS,

    // Rendering hooks — render styled pages instead of provider defaults.
    // See logoutSourceHook, postLogoutSuccessSourceHook, renderErrorHook above.
    renderError: renderErrorHook,

    // Extra client metadata properties — tell the provider to preserve
    // these custom fields from the adapter's findClient response.
    // Without this, node-oidc-provider strips all unknown properties.
    extraClientMetadata: {
      properties: [
        'organizationId',
        'client_name',
        'urn:porta:allowed_origins',
        'urn:porta:client_type',
        // Per-client login method override. Raw value from findForOidc():
        //   null       → inherit organization.defaultLoginMethods
        //   string[]   → explicit override (subset of ['password','magic_link'])
        // Resolved to effective methods inside the interaction route handlers.
        'urn:porta:login_methods',
      ],
    },
  };
}
