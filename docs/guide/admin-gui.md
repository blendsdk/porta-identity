# Admin GUI

The Porta Admin GUI is a web-based administration console for managing your Porta deployment. It provides a React-based single-page application (SPA) served through a Koa Backend-for-Frontend (BFF) that handles authentication, session management, and API proxying.

::: info Current State
The Admin GUI web interface is currently a **placeholder**. The BFF server is fully functional with OIDC authentication, session management, and API proxying. The full admin dashboard SPA is under active development.

**For full administration capabilities, use the [Porta CLI](/cli/overview)** (`porta` command).
:::

## Two Deployment Modes

The Admin GUI is available in two forms:

| Mode | Package | Use Case |
|------|---------|----------|
| **Standalone** (recommended) | `@portaidentity/admin-gui` | Local admin access via `porta gui` or `npx` |
| **Embedded** | Built into Docker image | Server-side deployment with `PORTA_SERVICE=admin` |

### Standalone Mode

The standalone admin GUI runs as a local BFF on your workstation. It connects to a remote Porta server using the same OIDC client as the CLI — no client secret needed.

```bash
# Via the CLI (recommended)
porta gui

# Or directly via npx
npx @portaidentity/admin-gui --server https://porta.example.com

# Or install globally
npm install -g @portaidentity/admin-gui
porta-gui --server https://porta.example.com
```

**Key features of standalone mode:**
- Uses the CLI's public OIDC client (Auth Code + PKCE) — no client secret
- In-memory sessions (no Redis needed)
- SameSite=Lax cookies (required for OIDC callback flow; no CSRF tokens needed)
- Auto-opens browser on startup
- Reads server URL from `~/.porta/credentials.json` if `porta login` was used

### Embedded Mode (Docker)

The embedded admin GUI runs as a service within the Porta Docker image, suitable for always-on server deployments. See [Docker Deployment](#docker-deployment) below.

## Architecture

### Standalone Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────┐
│   Browser    │────▶│  Local BFF       │────▶│  Porta Server │
│  (React SPA) │◀────│  (Koa, port 4002)│◀────│  (remote)     │
└─────────────┘     └──────────────────┘     └───────────────┘
                     In-memory sessions
                     SameSite=Lax cookies
```

### Embedded Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────┐
│   Browser    │────▶│  Admin GUI BFF   │────▶│  Porta Server │
│  (React SPA) │◀────│  (Koa, port 4002)│◀────│  (port 3000)  │
└─────────────┘     └──────────────────┘     └───────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │    Redis     │
                     │  (sessions)  │
                     └──────────────┘
```

## Prerequisites

- A running Porta server
- `porta init` completed (creates the public OIDC client used by both CLI and GUI)
- For standalone mode: `porta login` or `--server` flag
- For embedded mode: Redis and environment variables

## Quick Start (Standalone)

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

### Environment Variables (Standalone)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORTA_SERVER` | No | From credentials | Porta server URL (overridden by `--server`) |
| `PORTA_GUI_PORT` | No | `4002` | BFF listen port (overridden by `--port`) |

## Docker Deployment

### Using Docker Compose

The embedded admin GUI runs as a separate service in the same Docker image, controlled by the `PORTA_SERVICE` environment variable:

```yaml
# In docker/docker-compose.prod.yml
porta-admin:
  image: blendsdk/porta:latest
  environment:
    PORTA_SERVICE: admin
    PORTA_ADMIN_PORT: "4002"
    PORTA_ADMIN_PORTA_URL: http://porta:3000
    PORTA_ADMIN_CLIENT_ID: ${ADMIN_CLIENT_ID}
    PORTA_ADMIN_CLIENT_SECRET: ${ADMIN_CLIENT_SECRET}
    PORTA_ADMIN_SESSION_SECRET: ${ADMIN_SESSION_SECRET}
    REDIS_URL: redis://redis:6379/1
    NODE_ENV: production
  ports:
    - "127.0.0.1:4002:4002"
  depends_on:
    porta:
      condition: service_healthy
```

### Embedded Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORTA_ADMIN_PORT` | No | `4002` | Port for the admin GUI BFF server |
| `PORTA_ADMIN_PORTA_URL` | **Yes** | — | URL of the Porta server (e.g., `http://porta:3000`) |
| `PORTA_ADMIN_CLIENT_ID` | **Yes** | — | OIDC client ID |
| `PORTA_ADMIN_CLIENT_SECRET` | **Yes** | — | OIDC client secret |
| `PORTA_ADMIN_SESSION_SECRET` | **Yes** | — | Secret for signing session cookies (min 32 chars) |
| `PORTA_ADMIN_PUBLIC_URL` | No | `http://localhost:4002` | Public-facing URL |
| `PORTA_ADMIN_ORG_SLUG` | No | Auto-detected | Organization slug for OIDC discovery |
| `PORTA_ADMIN_SESSION_TTL` | No | `3600` | Session duration in seconds |
| `REDIS_URL` | **Yes** | — | Redis connection string |
| `NODE_ENV` | No | `development` | Environment mode |
| `LOG_LEVEL` | No | `info` | Log verbosity |

### Service Modes

The Porta Docker image supports two service modes via `PORTA_SERVICE`:

| Value | Description |
|-------|-------------|
| `server` (default) | Runs the Porta OIDC server |
| `admin` | Runs the Admin GUI BFF (embedded mode) |

## Authentication Flow

### Standalone Flow (PKCE)

1. User visits `http://127.0.0.1:4002`
2. BFF redirects to Porta's OIDC authorization endpoint with PKCE challenge
3. User authenticates (password, magic link, or 2FA depending on org config)
4. Porta redirects back to `/auth/callback` with an authorization code
5. BFF exchanges the code using PKCE verifier (no client secret)
6. BFF stores the session in memory and sets a SameSite=Lax session cookie
7. Subsequent API requests are proxied through the BFF with Bearer token injection

### Embedded Flow (Confidential Client)

1. User visits the admin GUI URL
2. BFF redirects to Porta's OIDC authorization endpoint
3. User authenticates via magic link (passwordless email)
4. Porta redirects back to `/auth/callback` with an authorization code
5. BFF exchanges the code for tokens using the client secret
6. BFF stores the session in Redis and sets a session cookie
7. Subsequent API requests are proxied through the BFF with Bearer token injection

## Security

Both modes implement multiple security layers:

| Security Feature | Standalone | Embedded |
|-----------------|-----------|----------|
| httpOnly session cookies | ✅ | ✅ |
| Server-side Bearer injection | ✅ | ✅ |
| Security headers (CSP, X-Frame, etc.) | ✅ | ✅ |
| PKCE (S256) | ✅ | ✅ |
| SameSite=Lax cookies | ✅ | — |
| CSRF double-submit cookies | — | ✅ |
| Redis sessions | — | ✅ |
| Session timeouts | 1 hour | Configurable |

## Testing

### Standalone Package Tests

```bash
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

### Embedded BFF Tests

```bash
cd admin-gui
yarn test
```

| Test File | Coverage |
|---|---|
| `tests/server/config.test.ts` | Configuration validation |
| `tests/server/csrf.test.ts` | CSRF protection |
| `tests/server/health.test.ts` | Health check endpoint |
| `tests/server/security-headers.test.ts` | Security header injection |
| `tests/server/session-guard.test.ts` | Session authentication |

## Troubleshooting

### Standalone: `porta gui` not found

1. Install the admin GUI package: `npm install -g @portaidentity/admin-gui`
2. Or use `npx @portaidentity/admin-gui --server <url>`
3. The `porta gui` command requires `@portaidentity/admin-gui` to be installed globally or in the project

### Standalone: Authentication fails

1. Ensure `porta login` works first (same OIDC client)
2. Check that the Porta server has the CLI client with `http://127.0.0.1/auth/callback` redirect URI
3. If using self-signed certs, add `--insecure`

### Embedded: BFF won't start

1. Verify Porta server is running and accessible at `PORTA_ADMIN_PORTA_URL`
2. Verify Redis is running and accessible at `REDIS_URL`
3. Check that `PORTA_ADMIN_CLIENT_ID` and `PORTA_ADMIN_CLIENT_SECRET` are correct
4. Ensure `PORTA_ADMIN_SESSION_SECRET` is at least 32 characters

### Cannot connect to Porta API

1. Verify the server URL is correct and reachable from the BFF
2. In Docker, use the service name (e.g., `http://porta:3000`), not `localhost`
3. Check that the BFF health endpoint reports checks as "ok": `GET /health`
