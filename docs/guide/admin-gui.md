# Admin GUI

The Porta Admin GUI is a web-based administration console for managing your Porta deployment. It provides a React-based single-page application (SPA) served through a Koa Backend-for-Frontend (BFF) that handles authentication, session management, and API proxying.

::: info Current State
The Admin GUI web interface is currently a **placeholder**. The BFF server is fully functional with OIDC authentication, session management, and API proxying. The full admin dashboard SPA is under active development.

**For full administration capabilities, use the [Porta CLI](/cli/overview)** (`porta` command).
:::

## Overview

The Admin GUI is a standalone package (`@portaidentity/admin-gui`) that runs as a local BFF on your workstation. It connects to a remote Porta server using the same OIDC public client as the CLI — no client secret needed.

```bash
# Via the CLI (recommended)
porta gui

# Or directly via npx
npx @portaidentity/admin-gui --server https://porta.example.com

# Or install globally
npm install -g @portaidentity/admin-gui
porta-gui --server https://porta.example.com
```

**Key features:**
- Uses the CLI's public OIDC client (Auth Code + PKCE) — no client secret
- In-memory sessions (no Redis needed)
- SameSite=Lax cookies (required for OIDC callback flow; no CSRF tokens needed)
- Auto-opens browser on startup
- Reads server URL from `~/.porta/credentials.json` if `porta login` was used

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────┐
│   Browser    │────▶│  Local BFF       │────▶│  Porta Server │
│  (React SPA) │◀────│  (Koa, port 4002)│◀────│  (remote)     │
└─────────────┘     └──────────────────┘     └───────────────┘
                     In-memory sessions
                     SameSite=Lax cookies
```

## Prerequisites

- A running Porta server
- `porta init` completed (creates the public OIDC client used by both CLI and GUI)
- `porta login` or `--server` flag to specify the server URL

## Quick Start

```bash
# 1. Ensure Porta server is running and you're authenticated
porta login --server https://porta.example.com:3443

# 2. Launch the admin GUI
porta gui

# The browser opens automatically at http://127.0.0.1:4002
```

### CLI Options

| Option | Default | Description |
|--------|---------|-------------|
| `--server` | From credentials | Porta server URL |
| `--port` | `4002` | BFF listen port |
| `--no-open` | `false` | Don't auto-open browser |
| `--insecure` | `false` | Skip TLS certificate verification |

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORTA_SERVER` | No | From credentials | Porta server URL (overridden by `--server`) |
| `PORTA_GUI_PORT` | No | `4002` | BFF listen port (overridden by `--port`) |

## Authentication Flow (PKCE)

1. User visits `http://127.0.0.1:4002`
2. BFF redirects to Porta's OIDC authorization endpoint with PKCE challenge
3. User authenticates (password, magic link, or 2FA depending on org config)
4. Porta redirects back to `/auth/callback` with an authorization code
5. BFF exchanges the code using PKCE verifier (no client secret)
6. BFF stores the session in memory and sets a SameSite=Lax session cookie
7. Subsequent API requests are proxied through the BFF with Bearer token injection

## Security

| Security Feature | Status |
|-----------------|--------|
| httpOnly session cookies | ✅ |
| Server-side Bearer injection | ✅ |
| Security headers (CSP, X-Frame, etc.) | ✅ |
| PKCE (S256) | ✅ |
| SameSite=Lax cookies | ✅ |
| Session timeouts | 1 hour |

## Development

The admin GUI runs alongside the Porta server during development:

```bash
# From the project root — starts Porta server + admin GUI (BFF + Vite SPA)
yarn dev

# Or run only the Porta server
yarn dev:server
```

### Testing

```bash
# Run admin GUI tests from root
yarn test:gui

# Or from the package directory
cd packages/porta-admin-gui
yarn test
```

| Test File | Tests | Coverage |
|---|---|---|
| `tests/unit/config.test.ts` | 13 | Config resolution priority chain |
| `tests/unit/session.test.ts` | 15 | In-memory session store |
| `tests/unit/security-headers.test.ts` | 7 | Security header injection |
| `tests/unit/error-handler.test.ts` | 8 | Error handling, no leakage |
| `tests/unit/token-manager.test.ts` | 7 | Token refresh, session mutation |
| `tests/unit/api-proxy.test.ts` | 2 | API proxy routing |
| `tests/unit/auth-routes.test.ts` | 3 | Auth endpoint contracts |
| `tests/unit/gui-command.test.ts` | 4 | CLI command definition |

## Troubleshooting

### `porta gui` not found

1. Install the admin GUI package: `npm install -g @portaidentity/admin-gui`
2. Or use `npx @portaidentity/admin-gui --server <url>`
3. The `porta gui` command requires `@portaidentity/admin-gui` to be installed globally or in the project

### Authentication fails

1. Ensure `porta login` works first (same OIDC client)
2. Check that the Porta server has the CLI client with `http://127.0.0.1/auth/callback` redirect URI
3. If using self-signed certs, add `--insecure`

### Cannot connect to Porta API

1. Verify the server URL is correct and reachable from the BFF
2. Check that the BFF health endpoint reports checks as "ok": `GET /health`
