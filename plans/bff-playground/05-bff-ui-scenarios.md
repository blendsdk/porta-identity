# BFF UI & Scenarios: BFF + M2M Playground

> **Document**: 05-bff-ui-scenarios.md
> **Parent**: [Index](00-index.md)

## Overview

The UI layer of the BFF playground — server-rendered Handlebars templates, CSS styling, minimal client-side JavaScript, and the 8 test scenarios ported from the SPA playground. The UI follows the same visual language as the SPA playground (sidebar + dashboard layout, dark/light theme) but is server-rendered rather than SPA-style.

## Page Architecture

### Server-Rendered vs SPA

Unlike the SPA playground where everything happens client-side, the BFF renders full HTML pages server-side. Client-side JavaScript is minimal — only for:
- Theme toggle (dark/light)
- AJAX calls for UserInfo, Refresh, Introspect (to avoid full page reload)
- Event log updates
- Token expiry countdown

### Page Map

| URL | Template | Auth Required | Purpose |
| --- | --- | --- | --- |
| `GET /` | `dashboard.hbs` | No* | Main page — logged out prompt or logged in dashboard |
| `GET /m2m` | `m2m.hbs` | No | M2M demo page |
| `GET /health` | JSON | No | Health check endpoint |
| `GET /auth/login` | — (redirect) | No | Initiates OIDC flow |
| `GET /auth/callback` | — (redirect) | No | Handles OIDC callback |
| `POST /auth/logout` | — (redirect) | Yes | Destroys session + RP-initiated logout |
| `POST /api/me` | JSON | Yes | Fetches UserInfo server-side |
| `POST /api/refresh` | JSON | Yes | Refreshes tokens server-side |
| `POST /api/introspect` | JSON | Yes | Introspects access token server-side |
| `POST /api/tokens` | JSON | Yes | Returns decoded tokens from session |

*Dashboard shows different content based on auth state.

## Template Structure

### Layout (`views/layout.hbs`)

Base HTML layout wrapping all pages:

```handlebars
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Porta BFF Playground{{#if pageTitle}} — {{pageTitle}}{{/if}}</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  {{> nav}}
  <div class="app-container">
    {{> sidebar}}
    <main class="dashboard">
      {{{body}}}
    </main>
  </div>
  <script src="/js/app.js"></script>
</body>
</html>
```

### Dashboard (`views/dashboard.hbs`)

```handlebars
{{#if isAuthenticated}}
  <div class="auth-status authenticated">
    <span class="status-dot green"></span>
    Authenticated as <strong>{{userName}}</strong> via <strong>{{orgName}}</strong>
  </div>

  <div class="action-bar">
    <button class="btn btn-primary" id="btn-userinfo">UserInfo</button>
    <button class="btn btn-secondary" id="btn-refresh">Refresh</button>
    <button class="btn btn-secondary" id="btn-introspect">Introspect</button>
    <form method="POST" action="/auth/logout" class="inline-form">
      <button class="btn btn-danger" type="submit">Logout</button>
    </form>
  </div>

  <div class="panels">
    {{> token-panel title="ID Token" token=idToken decoded=idTokenDecoded}}
    {{> token-panel title="Access Token" token=accessToken decoded=accessTokenDecoded}}
    {{> token-panel title="Refresh Token" token=refreshToken decoded=refreshTokenDecoded}}
  </div>

  <div id="userinfo-panel" class="panel hidden">
    <h3>UserInfo</h3>
    <pre id="userinfo-json"></pre>
  </div>

  <div id="introspect-panel" class="panel hidden">
    <h3>Introspection</h3>
    <pre id="introspect-json"></pre>
  </div>
{{else}}
  <div class="auth-status unauthenticated">
    <span class="status-dot red"></span>
    Not authenticated
  </div>
  <div class="welcome">
    <h2>BFF Playground</h2>
    <p>Select a scenario from the sidebar to start an OIDC flow.</p>
    <p>Unlike the SPA playground, all token management happens <strong>server-side</strong>.</p>
    <p>Your browser only receives a session cookie — tokens never leave the server.</p>
  </div>
{{/if}}

{{> event-log}}
```

### Sidebar (`views/partials/sidebar.hbs`)

```handlebars
<aside class="sidebar">
  <div class="sidebar-header">
    <h2>Scenarios</h2>
  </div>

  <div class="scenario-list">
    {{#each scenarios}}
      <a href="/auth/login?scenario={{@key}}"
         class="scenario-btn {{#if (eq @key ../activeScenario)}}active{{/if}}">
        <span class="scenario-name">{{this.description}}</span>
        <span class="scenario-org">{{this.orgKey}}</span>
      </a>
    {{/each}}
  </div>

  <div class="sidebar-section">
    <h3>Direct Login</h3>
    <div class="org-selector">
      {{#each organizations}}
        <a href="/auth/login?org={{@key}}" class="org-btn">
          {{this.name}}
        </a>
      {{/each}}
    </div>
  </div>

  <div class="sidebar-section">
    <h3>Tools</h3>
    <a href="/m2m" class="nav-link">M2M Demo</a>
    <a href="{{mailhogUrl}}" target="_blank" class="nav-link">MailHog ↗</a>
    <a href="http://localhost:4000" target="_blank" class="nav-link">SPA Playground ↗</a>
  </div>

  <div class="sidebar-section">
    <h3>Status</h3>
    <div id="status-indicators">
      <div class="status-row">
        <span class="status-dot" id="porta-status"></span> Porta
      </div>
      <div class="status-row">
        <span class="status-dot" id="mailhog-status"></span> MailHog
      </div>
    </div>
  </div>
</aside>
```

### Token Panel Partial (`views/partials/token-panel.hbs`)

```handlebars
<div class="panel token-panel">
  <h3>{{title}}</h3>
  {{#if decoded}}
    <div class="token-section">
      <h4>Header</h4>
      <pre>{{json decoded.header}}</pre>
    </div>
    <div class="token-section">
      <h4>Payload</h4>
      <pre>{{json decoded.payload}}</pre>
    </div>
  {{else if token}}
    <div class="token-section">
      <h4>Opaque Token</h4>
      <pre class="truncated">{{truncate token 80}}</pre>
    </div>
  {{else}}
    <div class="token-section empty">
      <p>No token</p>
    </div>
  {{/if}}
</div>
```

## Handlebars Helpers

Register in `src/helpers/template.ts`:

```typescript
import Handlebars from 'handlebars';

// JSON pretty-print
Handlebars.registerHelper('json', (obj: unknown) =>
  JSON.stringify(obj, null, 2)
);

// Truncate string
Handlebars.registerHelper('truncate', (str: string, len: number) =>
  str && str.length > len ? str.substring(0, len) + '...' : str
);

// Equality check
Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
```

## Client-Side JavaScript (`public/js/app.js`)

Minimal — only for AJAX interactions and theme:

```javascript
// Theme toggle
document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

// Restore theme
const saved = localStorage.getItem('theme');
if (saved) document.documentElement.setAttribute('data-theme', saved);

// AJAX helper
async function postApi(url) {
  const res = await fetch(url, { method: 'POST', credentials: 'same-origin' });
  return res.json();
}

// UserInfo button
document.getElementById('btn-userinfo')?.addEventListener('click', async () => {
  const data = await postApi('/api/me');
  document.getElementById('userinfo-json').textContent = JSON.stringify(data, null, 2);
  document.getElementById('userinfo-panel').classList.remove('hidden');
  logEvent('userinfo', 'Fetched UserInfo from server');
});

// Refresh button
document.getElementById('btn-refresh')?.addEventListener('click', async () => {
  const data = await postApi('/api/refresh');
  logEvent('refresh', data.success ? 'Tokens refreshed' : `Refresh failed: ${data.error}`);
  if (data.success) location.reload(); // Reload to show new tokens
});

// Introspect button
document.getElementById('btn-introspect')?.addEventListener('click', async () => {
  const data = await postApi('/api/introspect');
  document.getElementById('introspect-json').textContent = JSON.stringify(data, null, 2);
  document.getElementById('introspect-panel').classList.remove('hidden');
  logEvent('introspect', 'Token introspected');
});

// Status check
async function checkStatus() {
  try {
    const res = await fetch('/health');
    const data = await res.json();
    setDot('porta-status', data.porta ? 'green' : 'red');
    setDot('mailhog-status', data.mailhog ? 'green' : 'red');
  } catch {
    setDot('porta-status', 'red');
    setDot('mailhog-status', 'red');
  }
}

function setDot(id, color) {
  const el = document.getElementById(id);
  if (el) { el.className = `status-dot ${color}`; }
}

// Event log
function logEvent(type, message) {
  const log = document.getElementById('event-log-entries');
  if (!log) return;
  const entry = document.createElement('div');
  entry.className = `event-entry event-${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  log.prepend(entry);
}

// Init
checkStatus();
setInterval(checkStatus, 30000);
```

## Test Scenarios

The same 8 scenarios from the SPA playground, triggered via `/auth/login?scenario=<key>`:

| Key | Description | Org | What It Tests |
| --- | --- | --- | --- |
| `normalLogin` | Standard password login | no2fa | Basic auth code flow with confidential client |
| `magicLink` | Magic link login | no2fa | Email-based auth (check MailHog) |
| `emailOtp` | Email 2FA login | email2fa | Password + email OTP second factor |
| `totpAuth` | TOTP 2FA login | totp2fa | Password + authenticator app |
| `recoveryCode` | Recovery code login | totp2fa | Password + recovery code |
| `thirdPartyConsent` | Third-party consent | thirdparty | Consent page with scope approval |
| `passwordReset` | Password reset | no2fa | Reset flow via MailHog |
| `totpSetup` | TOTP setup flow | optional2fa | Enable TOTP for first time |

### Scenario Resolution Flow

```
/auth/login?scenario=emailOtp
  → lookup scenarios.emailOtp → { orgKey: 'email2fa', userEmail: 'user@email2fa.local' }
  → lookup organizations.email2fa → { slug, clientId, clientSecret, ... }
  → discover issuer at http://localhost:3000/playground-email2fa
  → build authorization URL → redirect
```

## Dashboard Route (`src/routes/dashboard.ts`)

```typescript
import Router from '@koa/router';
import type { BffConfig } from '../config.js';
import { decodeJwt } from '../helpers/jwt.js';
import { renderTemplate } from '../helpers/template.js';

export function createDashboardRoutes(router: Router, config: BffConfig) {
  router.get('/', async (ctx) => {
    const tokens = ctx.session?.tokens;
    const orgKey = ctx.session?.orgKey;
    const org = orgKey ? config.organizations[orgKey] : null;

    const templateData = {
      isAuthenticated: !!tokens?.access_token,
      userName: tokens?.id_token ? decodeJwt(tokens.id_token)?.payload?.name : null,
      orgName: org?.name,
      orgKey,
      idToken: tokens?.id_token,
      idTokenDecoded: tokens?.id_token ? decodeJwt(tokens.id_token) : null,
      accessToken: tokens?.access_token,
      accessTokenDecoded: tokens?.access_token ? decodeJwt(tokens.access_token) : null,
      refreshToken: tokens?.refresh_token,
      refreshTokenDecoded: tokens?.refresh_token ? decodeJwt(tokens.refresh_token) : null,
      expiresAt: tokens?.expires_at,
      scenarios: config.scenarios,
      organizations: config.organizations,
      mailhogUrl: config.mailhogUrl,
      activeScenario: ctx.session?.oidc?.scenarioKey,
    };

    ctx.body = renderTemplate('dashboard', templateData);
  });
}
```

## API Routes (`src/routes/api.ts`)

```typescript
import Router from '@koa/router';
import type { BffConfig } from '../config.js';
import { getOidcConfig, fetchUserInfo, refreshTokens, introspectToken } from '../oidc.js';

export function createApiRoutes(router: Router, config: BffConfig) {

  // POST /api/me — fetch UserInfo server-side
  router.post('/api/me', async (ctx) => {
    const tokens = ctx.session?.tokens;
    const orgKey = ctx.session?.orgKey;
    if (!tokens?.access_token || !orgKey) {
      ctx.status = 401;
      ctx.body = { error: 'Not authenticated' };
      return;
    }

    try {
      const org = config.organizations[orgKey];
      const oidcConfig = await getOidcConfig(config.portaUrl, org);
      const userInfo = await fetchUserInfo(oidcConfig, tokens.access_token);
      ctx.body = { success: true, userInfo };
    } catch (err: any) {
      ctx.body = { success: false, error: err.message };
    }
  });

  // POST /api/refresh — refresh tokens server-side
  router.post('/api/refresh', async (ctx) => {
    const tokens = ctx.session?.tokens;
    const orgKey = ctx.session?.orgKey;
    if (!tokens?.refresh_token || !orgKey) {
      ctx.status = 401;
      ctx.body = { error: 'No refresh token' };
      return;
    }

    try {
      const org = config.organizations[orgKey];
      const oidcConfig = await getOidcConfig(config.portaUrl, org);
      const newTokens = await refreshTokens(oidcConfig, tokens.refresh_token);

      ctx.session!.tokens = {
        access_token: newTokens.access_token,
        id_token: newTokens.id_token || tokens.id_token,
        refresh_token: newTokens.refresh_token || tokens.refresh_token,
        token_type: newTokens.token_type,
        expires_at: newTokens.expires_in
          ? Date.now() + newTokens.expires_in * 1000
          : undefined,
      };

      ctx.body = { success: true };
    } catch (err: any) {
      ctx.body = { success: false, error: err.message };
    }
  });

  // POST /api/introspect — introspect access token server-side
  router.post('/api/introspect', async (ctx) => {
    const tokens = ctx.session?.tokens;
    const orgKey = ctx.session?.orgKey;
    if (!tokens?.access_token || !orgKey) {
      ctx.status = 401;
      ctx.body = { error: 'Not authenticated' };
      return;
    }

    try {
      const org = config.organizations[orgKey];
      const oidcConfig = await getOidcConfig(config.portaUrl, org);
      const result = await introspectToken(oidcConfig, tokens.access_token);
      ctx.body = { success: true, introspection: result };
    } catch (err: any) {
      ctx.body = { success: false, error: err.message };
    }
  });

  // POST /api/tokens — return decoded tokens from session (debug)
  router.post('/api/tokens', async (ctx) => {
    const tokens = ctx.session?.tokens;
    if (!tokens) {
      ctx.status = 401;
      ctx.body = { error: 'Not authenticated' };
      return;
    }
    ctx.body = { success: true, tokens };
  });
}
```

## CSS Approach

Use the same design system as the SPA playground:
- CSS custom properties for dark/light themes
- Two-column grid (320px sidebar + flexible main)
- Status dots (green/red/yellow)
- Panel components with headers
- Monospace `<pre>` blocks for JSON/token display
- Button variants: primary, secondary, danger

The stylesheet should be similar in structure to `playground/css/style.css` but adapted for server-rendered templates.

## Testing Requirements

- Manual: Verify all 8 scenarios trigger correct org/client selection
- Manual: Verify dashboard renders decoded tokens after login
- Manual: Verify UserInfo AJAX returns correct claims
- Manual: Verify Refresh updates tokens in session
- Manual: Verify Introspect shows token metadata
- Manual: Verify Logout destroys session and redirects to Porta
- Manual: Verify theme toggle persists across page loads
- Manual: Verify status indicators reflect Porta/MailHog availability
