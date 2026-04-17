# M2M Demo: BFF + M2M Playground

> **Document**: 06-m2m-demo.md
> **Parent**: [Index](00-index.md)

## Overview

A dedicated section within the BFF playground demonstrating the `client_credentials` grant — machine-to-machine authentication where a service obtains an access token without any user interaction. This is the simplest OIDC/OAuth2 flow and is used for service-to-service API calls.

## Architecture

### Flow

```
Browser → GET /m2m                    → Renders M2M demo page
Browser → POST /m2m/token            → BFF calls Porta's token endpoint
                                         with client_credentials grant
                                       ← Returns decoded token to browser
Browser → POST /m2m/introspect       → BFF introspects the M2M token
                                       ← Returns introspection result
Browser → POST /m2m/revoke           → BFF revokes the M2M token
                                       ← Returns success/failure
```

### What Makes M2M Different

| Aspect | BFF (Auth Code) | M2M (Client Credentials) |
| --- | --- | --- |
| User involved | Yes — user authenticates | No — service authenticates |
| Grant type | `authorization_code` | `client_credentials` |
| Token represents | A user's session | The service/application itself |
| Scopes | User-consented scopes | Pre-configured scopes |
| ID token | Yes (identifies user) | No (no user) |
| Refresh token | Yes | No (just request a new token) |
| Browser redirect | Yes (auth endpoint → callback) | No (direct POST to token endpoint) |

## Implementation Details

### M2M Route (`src/routes/m2m.ts`)

```typescript
import Router from '@koa/router';
import type { BffConfig } from '../config.js';
import { clientCredentialsGrant, introspectToken } from '../oidc.js';
import { decodeJwt } from '../helpers/jwt.js';
import { renderTemplate } from '../helpers/template.js';

export function createM2mRoutes(router: Router, config: BffConfig) {

  // GET /m2m — render M2M demo page
  router.get('/m2m', async (ctx) => {
    // Show last M2M token if stored in session
    const m2mToken = ctx.session?.m2mToken;
    const decoded = m2mToken ? decodeJwt(m2mToken) : null;

    ctx.body = renderTemplate('m2m', {
      m2mToken,
      m2mTokenDecoded: decoded,
      m2mClientId: config.m2m.clientId,
      m2mOrgSlug: config.m2m.orgSlug,
      scenarios: config.scenarios,
      organizations: config.organizations,
      mailhogUrl: config.mailhogUrl,
    });
  });

  // POST /m2m/token — obtain client_credentials token
  router.post('/m2m/token', async (ctx) => {
    try {
      const tokenResponse = await clientCredentialsGrant(
        config.portaUrl,
        config.m2m
      );

      const accessToken = tokenResponse.access_token;
      const decoded = decodeJwt(accessToken);

      // Store in session for display/introspection
      ctx.session!.m2mToken = accessToken;

      ctx.body = {
        success: true,
        access_token: accessToken,
        token_type: tokenResponse.token_type,
        expires_in: tokenResponse.expires_in,
        decoded,
      };
    } catch (err: any) {
      ctx.body = {
        success: false,
        error: err.message,
        details: err.cause || err.response_body || null,
      };
    }
  });

  // POST /m2m/introspect — introspect the M2M token
  router.post('/m2m/introspect', async (ctx) => {
    const token = ctx.session?.m2mToken;
    if (!token) {
      ctx.body = { success: false, error: 'No M2M token — request one first' };
      return;
    }

    try {
      // Use the M2M client's own credentials for introspection
      const issuer = `${config.portaUrl}/${config.m2m.orgSlug}`;
      const { getOidcConfig } = await import('../oidc.js');

      // Build a minimal org config for introspection
      const m2mOrgConfig = {
        id: '',
        slug: config.m2m.orgSlug,
        name: 'M2M',
        clientId: config.m2m.clientId,
        clientSecret: config.m2m.clientSecret,
        twoFactorPolicy: 'optional',
      };

      const oidcConfig = await getOidcConfig(config.portaUrl, m2mOrgConfig);
      const result = await introspectToken(oidcConfig, token);

      ctx.body = { success: true, introspection: result };
    } catch (err: any) {
      ctx.body = { success: false, error: err.message };
    }
  });

  // POST /m2m/revoke — revoke the M2M token
  router.post('/m2m/revoke', async (ctx) => {
    const token = ctx.session?.m2mToken;
    if (!token) {
      ctx.body = { success: false, error: 'No M2M token to revoke' };
      return;
    }

    try {
      // Use openid-client's revocation
      const { default: * as client } = await import('openid-client');
      const m2mOrgConfig = {
        id: '',
        slug: config.m2m.orgSlug,
        name: 'M2M',
        clientId: config.m2m.clientId,
        clientSecret: config.m2m.clientSecret,
        twoFactorPolicy: 'optional',
      };
      const { getOidcConfig } = await import('../oidc.js');
      const oidcConfig = await getOidcConfig(config.portaUrl, m2mOrgConfig);
      
      await client.tokenRevocation(oidcConfig, token);

      delete ctx.session!.m2mToken;
      ctx.body = { success: true };
    } catch (err: any) {
      ctx.body = { success: false, error: err.message };
    }
  });
}
```

> **Note:** The revocation implementation above is conceptual — the exact `openid-client` v6 API for revocation should be verified at implementation time.

### M2M Template (`views/m2m.hbs`)

```handlebars
<div class="page-header">
  <h2>Machine-to-Machine (M2M) Demo</h2>
  <p>Client Credentials grant — no user involved. The service authenticates directly.</p>
</div>

<div class="m2m-info panel">
  <h3>Configuration</h3>
  <table class="info-table">
    <tr><td>Client ID</td><td><code>{{m2mClientId}}</code></td></tr>
    <tr><td>Organization</td><td><code>{{m2mOrgSlug}}</code></td></tr>
    <tr><td>Grant Type</td><td><code>client_credentials</code></td></tr>
    <tr><td>Auth Method</td><td><code>client_secret_post</code></td></tr>
  </table>
</div>

<div class="action-bar">
  <button class="btn btn-primary" id="btn-m2m-token">Get Token</button>
  <button class="btn btn-secondary" id="btn-m2m-introspect" {{#unless m2mToken}}disabled{{/unless}}>Introspect</button>
  <button class="btn btn-danger" id="btn-m2m-revoke" {{#unless m2mToken}}disabled{{/unless}}>Revoke</button>
</div>

{{#if m2mToken}}
  <div class="panel token-panel">
    <h3>Access Token</h3>
    {{#if m2mTokenDecoded}}
      <div class="token-section">
        <h4>Header</h4>
        <pre>{{json m2mTokenDecoded.header}}</pre>
      </div>
      <div class="token-section">
        <h4>Payload</h4>
        <pre>{{json m2mTokenDecoded.payload}}</pre>
      </div>
    {{else}}
      <div class="token-section">
        <h4>Opaque Token</h4>
        <pre class="truncated">{{truncate m2mToken 80}}</pre>
      </div>
    {{/if}}
  </div>
{{/if}}

<div id="m2m-result-panel" class="panel hidden">
  <h3 id="m2m-result-title">Result</h3>
  <pre id="m2m-result-json"></pre>
</div>

<div class="panel info-panel">
  <h3>How It Works</h3>
  <ol>
    <li><strong>Get Token</strong> — BFF sends <code>POST /token</code> to Porta with <code>grant_type=client_credentials</code> + <code>client_id</code> + <code>client_secret</code></li>
    <li><strong>Porta verifies</strong> the client credentials and returns an access token</li>
    <li><strong>Token represents the service</strong>, not a user — no <code>sub</code> claim referring to a user</li>
    <li><strong>Introspect</strong> — BFF calls <code>POST /token/introspection</code> to check token validity</li>
    <li><strong>Revoke</strong> — BFF calls <code>POST /token/revocation</code> to invalidate the token</li>
  </ol>
</div>

{{> event-log}}
```

### M2M Client-Side JavaScript (in `public/js/app.js`)

Add to the existing `app.js`:

```javascript
// M2M: Get Token
document.getElementById('btn-m2m-token')?.addEventListener('click', async () => {
  logEvent('m2m', 'Requesting client_credentials token...');
  const data = await postApi('/m2m/token');
  
  if (data.success) {
    logEvent('m2m', 'Token obtained successfully');
    showM2mResult('Token Response', data);
    // Enable introspect/revoke buttons
    document.getElementById('btn-m2m-introspect')?.removeAttribute('disabled');
    document.getElementById('btn-m2m-revoke')?.removeAttribute('disabled');
    // Reload to show token in panel
    location.reload();
  } else {
    logEvent('error', `M2M token failed: ${data.error}`);
    showM2mResult('Error', data);
  }
});

// M2M: Introspect
document.getElementById('btn-m2m-introspect')?.addEventListener('click', async () => {
  logEvent('m2m', 'Introspecting M2M token...');
  const data = await postApi('/m2m/introspect');
  showM2mResult('Introspection Result', data);
  logEvent('m2m', data.success ? 'Token introspected' : `Introspection failed: ${data.error}`);
});

// M2M: Revoke
document.getElementById('btn-m2m-revoke')?.addEventListener('click', async () => {
  logEvent('m2m', 'Revoking M2M token...');
  const data = await postApi('/m2m/revoke');
  if (data.success) {
    logEvent('m2m', 'Token revoked');
    location.reload();
  } else {
    logEvent('error', `Revocation failed: ${data.error}`);
  }
});

function showM2mResult(title, data) {
  const panel = document.getElementById('m2m-result-panel');
  const titleEl = document.getElementById('m2m-result-title');
  const jsonEl = document.getElementById('m2m-result-json');
  if (panel && titleEl && jsonEl) {
    titleEl.textContent = title;
    jsonEl.textContent = JSON.stringify(data, null, 2);
    panel.classList.remove('hidden');
  }
}
```

## Porta Behavior for Client Credentials

Based on `src/oidc/configuration.ts`:

- **Feature enabled**: `clientCredentials: { enabled: true }`
- **Token format**: `opaque` (not JWT by default)
- **No ID token**: Client credentials grant does not issue ID tokens
- **No refresh token**: Not applicable — client just requests a new token when needed
- **Scopes**: The token gets whatever scopes the client is configured for
- **The client must have `client_credentials` in its `grant_types`** — this is why we need a separate M2M client (the BFF client only has `authorization_code` + `refresh_token`)

## Error Handling

| Error Case | Handling Strategy |
| --- | --- |
| Client credentials rejected | Show error JSON with details |
| Token is opaque (not decodable) | Show raw truncated token instead of decoded |
| Introspection fails | Show error in result panel |
| Revocation fails | Show error in result panel |
| M2M client not in seed | Show config error on M2M page |

## Testing Requirements

- Manual: Click "Get Token", verify token is returned
- Manual: Verify token is opaque (Porta default) or JWT if configured
- Manual: Click "Introspect", verify `active: true` response
- Manual: Click "Revoke", verify token is invalidated
- Manual: After revoke, introspect should show `active: false`
- Manual: Verify no user claims in M2M token (no `sub` pointing to a user)
