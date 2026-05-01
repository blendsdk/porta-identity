# Porta BFF Playground

> **Backend-for-Frontend (BFF)** playground for Porta — a confidential client OIDC demo with server-side token management.

## Overview

This playground demonstrates the **BFF pattern** for OIDC authentication using a Koa server with `openid-client` v6. Unlike the SPA playground where tokens are managed in the browser, the BFF keeps all tokens **server-side** in Redis sessions. The browser only receives an HttpOnly session cookie.

### Key Features

| Feature | Description |
| --- | --- |
| **Auth Code + PKCE** | Full Authorization Code flow with S256 PKCE |
| **Confidential Client** | Uses `client_secret_post` authentication |
| **Server-Side Tokens** | Access, ID, and refresh tokens stored in Redis |
| **HttpOnly Cookie** | Session cookie is HttpOnly — JS cannot read it |
| **Multi-Org Support** | 3 organizations with different 2FA policies |
| **M2M Demo** | Client credentials grant (no user interaction) |
| **Token Operations** | UserInfo, Refresh, Introspect — all server-side |
| **Dark/Light Theme** | Toggle between themes, persisted in localStorage |

## Quick Start

The BFF playground is started automatically as part of the full playground:

```bash
# From the project root — starts Docker, Porta, SPA, and BFF
yarn playground
```

This starts:
- **Porta** on `https://porta.local:3443`
- **SPA Playground** on `http://localhost:4000`
- **BFF Playground** on `http://localhost:4001`
- **MailHog** on `http://localhost:8025`

### Manual Start (BFF only)

If you want to run just the BFF server (requires Porta + Docker already running):

```bash
cd playground-bff
yarn install
npx tsx src/server.ts
```

## Architecture

```
Browser                    BFF Server (port 4001)              Porta (port 3000)
  │                              │                                    │
  │  GET /auth/login?org=no2fa   │                                    │
  │ ──────────────────────────►  │                                    │
  │                              │  Build auth URL (PKCE + state)     │
  │  302 Redirect                │                                    │
  │ ◄──────────────────────────  │                                    │
  │                              │                                    │
  │  ──── User authenticates at Porta ────────────────────────────►   │
  │  ◄─── Porta redirects to /auth/callback with code ────────────   │
  │                              │                                    │
  │  GET /auth/callback?code=... │                                    │
  │ ──────────────────────────►  │  Exchange code for tokens          │
  │                              │ ──────────────────────────────────► │
  │                              │ ◄────────────────────────────────── │
  │                              │  Store tokens in Redis session     │
  │  302 Redirect to /           │                                    │
  │ ◄──────────────────────────  │                                    │
  │                              │                                    │
  │  GET / (dashboard)           │                                    │
  │ ──────────────────────────►  │  Read tokens from session          │
  │  HTML with decoded tokens    │  Render Handlebars template        │
  │ ◄──────────────────────────  │                                    │
  │                              │                                    │
  │  POST /api/me (AJAX)         │                                    │
  │ ──────────────────────────►  │  Fetch UserInfo with access_token  │
  │                              │ ──────────────────────────────────► │
  │  JSON response               │ ◄────────────────────────────────── │
  │ ◄──────────────────────────  │                                    │
```

**Key Security Property:** Tokens never reach the browser. The BFF exchanges the code server-side, stores tokens in Redis, and the browser only has a session cookie.

## Pages

| URL | Purpose |
| --- | --- |
| `GET /` | Dashboard — welcome page or authenticated token viewer |
| `GET /m2m` | M2M (client_credentials) demo page |
| `GET /health` | Health check endpoint |
| `GET /auth/login` | Start OIDC flow (`?org=no2fa` or `?scenario=normalLogin`) |
| `GET /auth/callback` | OIDC callback handler |
| `POST /auth/logout` | Destroy session + RP-initiated logout |
| `POST /api/me` | Fetch UserInfo from Porta |
| `POST /api/refresh` | Refresh tokens server-side |
| `POST /api/introspect` | Introspect access token |
| `POST /api/tokens` | Return decoded tokens from session |
| `POST /m2m/token` | Request client_credentials token |
| `POST /m2m/introspect` | Introspect M2M token |
| `POST /m2m/revoke` | Revoke M2M token |

## Organizations & Scenarios

The seed script creates 3 organizations with different 2FA policies:

| Org Key | Name | 2FA Policy |
| --- | --- | --- |
| `no2fa` | Playground Org (No 2FA) | `disabled` |
| `optional2fa` | Playground Org (Optional 2FA) | `optional` |
| `required2fa` | Playground Org (Required 2FA) | `required` |

Each organization has a dedicated confidential client configured for `client_secret_post` authentication.

### Test Users

| User | Password | Organization |
| --- | --- | --- |
| `alice@playground.local` | `Password123!` | no2fa |
| `bob@playground.local` | `Password123!` | optional2fa |
| `charlie@playground.local` | `Password123!` | required2fa |

### Scenarios (Sidebar)

Click any scenario in the sidebar to start the flow:
- **Normal Login** — Standard password login (no 2FA)
- **Optional 2FA Login** — Login where 2FA is available but not required
- **Required 2FA Login** — Login that requires 2FA enrollment/verification
- Additional scenarios mapped to specific org + user combinations

## M2M Demo

The M2M page demonstrates **client_credentials** grant — authentication without any user interaction. The BFF server authenticates directly with Porta using its M2M client credentials.

1. Click **Request Token** — BFF performs `client_credentials` grant
2. Click **Introspect** — BFF introspects the token at Porta
3. Click **Revoke** — BFF revokes the token at Porta

## Login-Method Demo Profiles

The BFF ships a set of pre-configured "login-method demo" profiles that each
point at a different OIDC client. Selecting a profile forces the upstream
Porta login page to render a specific combination of login methods
(password-only, magic-link-only, etc.) — useful for demoing the per-client
`login_methods` override from RD-05.

### Available Profiles

Profiles are generated by `scripts/playground-seed.ts` and exposed in
`config.generated.json` under the `loginMethodClients` key.

| Profile Key | Org | Override | Effective Methods | Expected UI |
|-------------|-----|----------|-------------------|-------------|
| `both` | `no2fa` | *none* | `password + magic_link` | Both buttons |
| `password` | `no2fa` | `['password']` | `password` | Password form only |
| `magic` | `no2fa` | `['magic_link']` | `magic_link` | Magic-link button only |
| `orgForced` | `passwordonly` | *none* | `password` (from org default) | Password form only |

The exact keys depend on the current seed — hit `GET /debug/login-methods`
(below) to list what's actually configured.

### Switching Profiles

Set the `BFF_CLIENT_PROFILE` environment variable before starting the BFF:

```bash
# Start the BFF with the "password-only" profile
BFF_CLIENT_PROFILE=password yarn workspace playground-bff dev
```

On startup the BFF logs which profile was activated:

```
🎯 BFF login-method profile: "password" (Playground BFF (Password Only)) — orgKey=no2fa, clientId=pcl_a1b2c3d4…
```

If the env var is **unset**, **empty**, or references an **unknown profile**,
the BFF falls back to its default per-org client mapping and logs a warning.
Existing routes (auth/dashboard/api/m2m) continue to work — the profile
mechanism only swaps which client the selected org authenticates with.

### Dashboard Panel

When a profile is active, the dashboard renders a **"🔑 Active Login-Method
Profile"** panel showing the profile key, org, client ID, and override. When
no profile is active and the seed has generated profiles, the welcome view
lists all available profiles with a highlighted row indicating the active
one (if any).

### Debug Endpoint

```bash
# List all profiles and show the currently active one
curl -s http://localhost:4001/debug/login-methods | jq
```

Response shape:

```json
{
  "active": {
    "key": "password",
    "label": "Playground BFF (Password Only)",
    "orgKey": "no2fa",
    "clientId": "pcl_...",
    "loginMethods": ["password"]
  },
  "profiles": {
    "both": { "key": "both", "label": "...", "active": false, ... },
    "password": { "key": "password", "label": "...", "active": true, ... },
    "magic": { ... },
    "orgForced": { ... }
  }
}
```

> **Note:** The debug endpoint **never** returns `clientSecret`. It is safe
> to curl during local development but **must not** be exposed in production.

## Project Structure


```
playground-bff/
  package.json              # Dependencies (openid-client, koa, etc.)
  tsconfig.json             # TypeScript config (ES2022, NodeNext)
  config.generated.json     # Auto-generated by seed script (gitignored)
  src/
    config.ts               # Config loader (reads config.generated.json)
    session.ts              # Redis-backed session middleware
    server.ts               # Koa server with all routes mounted
    oidc.ts                 # openid-client v6 wrapper (discovery, auth, M2M)
    helpers/
      jwt.ts                # JWT decode (display only, no verification)
      template.ts           # Handlebars template engine + helpers
    routes/
      health.ts             # GET /health
      auth.ts               # Auth routes (login, callback, logout)
      dashboard.ts          # GET / (dashboard rendering)
      api.ts                # AJAX API routes (me, refresh, introspect)
      m2m.ts                # M2M demo routes
  views/
    layout.hbs              # Base HTML layout
    dashboard.hbs           # Dashboard page template
    m2m.hbs                 # M2M demo page template
    partials/
      nav.hbs               # Top navigation bar
      sidebar.hbs           # Sidebar with scenarios, orgs, links
      token-panel.hbs       # Reusable token display panel
      event-log.hbs         # Event log panel
  public/
    css/style.css           # Dark/light theme stylesheet
    js/app.js               # Client-side JS (AJAX, theme toggle, event log)
```

## BFF vs SPA Comparison

| Feature | SPA Playground | BFF Playground |
| --- | --- | --- |
| Port | 4000 | 4001 |
| Client Type | Public | Confidential |
| Token Storage | Browser memory | Redis (server-side) |
| Token Exposure | Visible to JS | Never sent to browser |
| Auth Method | None | `client_secret_post` |
| PKCE | ✅ Required | ✅ Required |
| Refresh Token | Browser-side | Server-side |
| Session | None | HttpOnly cookie |
