/**
 * OIDC Test Harness — BFF Server
 *
 * Minimal Koa server acting as a confidential OIDC client using openid-client v6.
 * Handles Authorization Code + PKCE flow server-side, stores tokens in in-memory
 * session. Serves simple HTML pages with data-testid attributes for Playwright.
 *
 * Routes:
 *   GET /           — Main page (logged-in or logged-out state)
 *   GET /login      — Start OIDC auth flow (redirect to Porta)
 *   GET /callback   — Handle OIDC callback (exchange code for tokens)
 *   GET /introspect — Token introspection (server-side call to Porta)
 *   GET /userinfo   — UserInfo (server-side call to Porta)
 *   GET /refresh    — Token refresh (server-side call to Porta)
 *   GET /logout     — RP-initiated logout (clear session + redirect to Porta)
 *
 * See: plans/oidc-test-harness/05-bff-harness.md
 */

// ⚠️ TEST HARNESS ONLY — trust self-signed cert for HTTPS calls to Porta via nginx

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Koa from 'koa';
import Router from '@koa/router';
import session from 'koa-session';
import * as openidClient from 'openid-client';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const configPath = resolve(import.meta.dirname!, '../config.generated.json');
const config = JSON.parse(readFileSync(configPath, 'utf-8'));

const PORT = 4101;
const PORTA_BASE_URL: string = config.porta.baseUrl; // https://localhost:3443
const ORG_SLUG: string = config.orgSlug;             // test-org

console.log(`[BFF] Config loaded — client_id: ${config.bff.clientId}`);

// ---------------------------------------------------------------------------
// openid-client v6 discovery
// ---------------------------------------------------------------------------

/**
 * Custom fetch that rewrites root well-known to org-specific well-known.
 * Porta returns issuer=baseUrl (root), so we discover against the root URL
 * but redirect the actual HTTP request to /:orgSlug/.well-known/openid-configuration.
 */
function createOrgDiscoveryFetch(baseUrl: string, orgSlug: string): typeof fetch {
  const rootWellKnown = `${baseUrl}/.well-known/openid-configuration`;
  const orgWellKnown = `${baseUrl}/${orgSlug}/.well-known/openid-configuration`;
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (url === rootWellKnown) return fetch(orgWellKnown, init);
    return fetch(input, init);
  };
}

console.log(`[BFF] Discovering OIDC config from ${PORTA_BASE_URL}/${ORG_SLUG}/.well-known/openid-configuration`);

const oidcConfig = await openidClient.discovery(
  new URL(PORTA_BASE_URL),
  config.bff.clientId,
  config.bff.clientSecret,
  openidClient.ClientSecretPost(config.bff.clientSecret),
  {
    execute: [openidClient.allowInsecureRequests],
    [openidClient.customFetch]: createOrgDiscoveryFetch(PORTA_BASE_URL, ORG_SLUG),
  },
);

console.log('[BFF] OIDC discovery complete');

// ---------------------------------------------------------------------------
// Koa App
// ---------------------------------------------------------------------------

const app = new Koa();
app.keys = ['test-harness-bff-session-key'];

app.use(session({
  key: 'bff.sess',
  maxAge: 86400000, // 24h
  httpOnly: true,
  signed: true,
}, app));

const router = new Router();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET / — Main page
router.get('/', async (ctx) => {
  const tokens = ctx.session?.tokens;
  if (tokens?.access_token) {
    ctx.body = renderLoggedIn(tokens);
  } else {
    ctx.body = renderLoggedOut();
  }
});

// GET /login — Start OIDC auth flow
router.get('/login', async (ctx) => {
  const code_verifier = openidClient.randomPKCECodeVerifier();
  const code_challenge = await openidClient.calculatePKCECodeChallenge(code_verifier);
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();

  // Store in session for callback
  ctx.session!.code_verifier = code_verifier;
  ctx.session!.state = state;
  ctx.session!.nonce = nonce;

  const authUrl = openidClient.buildAuthorizationUrl(oidcConfig, {
    redirect_uri: config.bff.redirectUri,
    scope: config.bff.scope,
    code_challenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  console.log('[BFF] Redirecting to Porta for login');
  ctx.redirect(authUrl.href);
});

// GET /callback — Handle OIDC callback
router.get('/callback', async (ctx) => {
  try {
    const code_verifier = ctx.session?.code_verifier;
    const expectedState = ctx.session?.state;
    const expectedNonce = ctx.session?.nonce;

    if (!code_verifier || !expectedState) {
      ctx.body = renderError('No code_verifier/state in session — start login again');
      return;
    }

    const tokens = await openidClient.authorizationCodeGrant(
      oidcConfig,
      ctx.request.URL,
      {
        pkceCodeVerifier: code_verifier,
        expectedState,
        expectedNonce,
      },
    );

    // Store tokens in session
    ctx.session!.tokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      id_token: tokens.id_token,
      expires_at: tokens.expiresIn ? Date.now() + tokens.expiresIn * 1000 : undefined,
      token_type: tokens.token_type,
      claims: tokens.claims(),
    };

    // Clean up auth flow state
    delete ctx.session!.code_verifier;
    delete ctx.session!.state;
    delete ctx.session!.nonce;

    console.log('[BFF] Login complete, tokens stored in session');
    ctx.redirect('/');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[BFF] Callback error:', message);
    ctx.body = renderError(`Callback failed: ${message}`);
  }
});

// GET /introspect — Token introspection
router.get('/introspect', async (ctx) => {
  const tokens = ctx.session?.tokens;
  if (!tokens?.access_token) {
    ctx.redirect('/');
    return;
  }

  try {
    const result = await openidClient.tokenIntrospection(
      oidcConfig,
      tokens.access_token,
    );
    console.log('[BFF] Introspection complete');
    ctx.body = renderResult('Introspection Result', result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[BFF] Introspection error:', message);
    ctx.body = renderError(`Introspection failed: ${message}`);
  }
});

// GET /userinfo — UserInfo
router.get('/userinfo', async (ctx) => {
  const tokens = ctx.session?.tokens;
  if (!tokens?.access_token) {
    ctx.redirect('/');
    return;
  }

  try {
    const result = await openidClient.fetchUserInfo(
      oidcConfig,
      tokens.access_token,
      openidClient.skipSubjectCheck,
    );
    console.log('[BFF] UserInfo complete');
    ctx.body = renderResult('UserInfo Result', result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[BFF] UserInfo error:', message);
    ctx.body = renderError(`UserInfo failed: ${message}`);
  }
});

// GET /refresh — Token refresh
router.get('/refresh', async (ctx) => {
  const tokens = ctx.session?.tokens;
  if (!tokens?.refresh_token) {
    ctx.body = renderError('No refresh token available');
    return;
  }

  try {
    const newTokens = await openidClient.refreshTokenGrant(
      oidcConfig,
      tokens.refresh_token,
    );

    const oldAccessToken = tokens.access_token;

    ctx.session!.tokens = {
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token || tokens.refresh_token,
      id_token: newTokens.id_token || tokens.id_token,
      expires_at: newTokens.expiresIn ? Date.now() + newTokens.expiresIn * 1000 : undefined,
      token_type: newTokens.token_type,
      claims: newTokens.claims?.() || tokens.claims,
    };

    console.log('[BFF] Token refreshed');
    ctx.body = renderResult('Refresh Result', {
      old_access_token: oldAccessToken?.substring(0, 20) + '...',
      new_access_token: newTokens.access_token?.substring(0, 20) + '...',
      tokens_are_different: oldAccessToken !== newTokens.access_token,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[BFF] Refresh error:', message);
    ctx.body = renderError(`Refresh failed: ${message}`);
  }
});

// GET /logout — RP-initiated logout
router.get('/logout', async (ctx) => {
  const idToken = ctx.session?.tokens?.id_token;
  ctx.session = null;

  const endSessionUrl = openidClient.buildEndSessionUrl(oidcConfig, {
    id_token_hint: idToken,
    post_logout_redirect_uri: config.bff.postLogoutRedirectUri,
  });

  console.log('[BFF] Logging out');
  ctx.redirect(endSessionUrl.href);
});

// ---------------------------------------------------------------------------
// Mount & Start
// ---------------------------------------------------------------------------

app.use(router.routes());
app.use(router.allowedMethods());

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[BFF] Server running at http://app.test:${PORT}`);
});

// ---------------------------------------------------------------------------
// HTML Rendering
// ---------------------------------------------------------------------------

const STYLES = `
  body { font-family: monospace; max-width: 800px; margin: 2em auto; padding: 0 1em; }
  h1 { margin-bottom: 0.5em; }
  h2 { margin-top: 1.5em; }
  pre { background: #f0f0f0; padding: 1em; overflow: auto; max-height: 300px; border: 1px solid #ccc; word-wrap: break-word; white-space: pre-wrap; }
  a.btn { font-size: 1.2em; padding: 0.5em 2em; margin: 0.5em; cursor: pointer; display: inline-block; text-decoration: none; border: 2px solid #333; background: #fff; color: #333; min-height: 44px; line-height: 44px; }
  a.btn:hover { background: #333; color: #fff; }
  .btn-row { display: flex; flex-wrap: wrap; gap: 0.5em; margin: 1em 0; }
  [data-testid="status"] { font-size: 1.5em; font-weight: bold; margin: 1em 0; }
  [data-testid="error"] { background: #d32f2f; color: white; padding: 1em; margin: 1em 0; border-radius: 4px; }
`;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderLoggedOut(): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>OIDC Test Harness — BFF</title>
<style>${STYLES}</style></head>
<body>
  <h1>OIDC Test Harness — BFF</h1>
  <div data-testid="status">NOT LOGGED IN</div>
  <div class="btn-row">
    <a href="/login" class="btn" data-testid="login-btn">LOGIN</a>
  </div>
</body></html>`;
}

function renderLoggedIn(tokens: Record<string, unknown>): string {
  const email = (tokens.claims as Record<string, unknown>)?.email || 'unknown';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>OIDC Test Harness — BFF</title>
<style>${STYLES}</style></head>
<body>
  <h1>OIDC Test Harness — BFF</h1>
  <div data-testid="status">LOGGED IN</div>
  <div data-testid="user-email">User: ${esc(String(email))}</div>
  <div class="btn-row">
    <a href="/introspect" class="btn" data-testid="introspect-btn">INTROSPECT</a>
    <a href="/userinfo" class="btn" data-testid="userinfo-btn">USERINFO</a>
    <a href="/refresh" class="btn" data-testid="refresh-btn">REFRESH</a>
    <a href="/logout" class="btn" data-testid="logout-btn">LOGOUT</a>
  </div>
  <h2>Access Token</h2>
  <pre data-testid="access-token">${esc(String(tokens.access_token))}</pre>
  <h2>ID Token Claims</h2>
  <pre data-testid="id-token-claims">${esc(JSON.stringify(tokens.claims, null, 2))}</pre>
</body></html>`;
}

function renderResult(title: string, data: unknown): string {
  const testId = title.toLowerCase().replace(/\s+/g, '-');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${esc(title)} — BFF</title>
<style>${STYLES}</style></head>
<body>
  <h1>${esc(title)}</h1>
  <pre data-testid="${esc(testId)}">${esc(JSON.stringify(data, null, 2))}</pre>
  <div class="btn-row">
    <a href="/" class="btn" data-testid="back-btn">BACK</a>
  </div>
</body></html>`;
}

function renderError(message: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Error — BFF</title>
<style>${STYLES}</style></head>
<body>
  <h1>Error</h1>
  <div data-testid="error">${esc(message)}</div>
  <div class="btn-row">
    <a href="/" class="btn" data-testid="back-btn">BACK</a>
  </div>
</body></html>`;
}
