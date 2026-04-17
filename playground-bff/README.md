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
- **Porta** on `http://localhost:3000`
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
