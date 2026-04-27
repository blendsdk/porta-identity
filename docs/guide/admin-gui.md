# Admin GUI

The Porta Admin GUI is a web-based administration console for managing your Porta deployment. It provides a React-based single-page application (SPA) served through a Koa Backend-for-Frontend (BFF) that handles authentication, session management, and API proxying.

::: info Current State
The Admin GUI web interface is currently a **placeholder**. The BFF server is fully functional with OIDC authentication, session management, CSRF protection, and API proxying. The full admin dashboard SPA is under active development.

**For full administration capabilities, use the [Porta CLI](/cli/overview)** (`porta` command).
:::

## Architecture

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

- **React SPA** — FluentUI v9 placeholder (full dashboard under development)
- **BFF Server** — Koa application that handles OIDC authentication, manages sessions in Redis, and proxies API requests to the Porta server
- **Session Store** — Redis-backed sessions with configurable TTL

## Prerequisites

- A running Porta server (port 3000 by default)
- Redis (shared with or separate from the Porta server)
- An OIDC client registered for the admin GUI (created automatically by `porta init`)

## Setup

### Automatic Setup (Recommended)

When you run `porta init`, it automatically creates an "Admin GUI" confidential OIDC client with:

- **Client type**: Confidential (with client secret)
- **Grant types**: `authorization_code`, `refresh_token`
- **Redirect URI**: `http://localhost:4002/auth/callback`
- **Login method**: `magic_link` (passwordless)
- **Token endpoint auth**: `client_secret_post`

The client ID and secret are displayed in the init summary. **Save the secret — it cannot be retrieved later.**

### Environment Variables

Configure the admin GUI using these environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORTA_ADMIN_PORT` | No | `4002` | Port for the admin GUI BFF server |
| `PORTA_ADMIN_PORTA_URL` | **Yes** | — | URL of the Porta server (e.g., `http://localhost:3000`) |
| `PORTA_ADMIN_CLIENT_ID` | **Yes** | — | OIDC client ID (from `porta init`) |
| `PORTA_ADMIN_CLIENT_SECRET` | **Yes** | — | OIDC client secret (from `porta init`) |
| `PORTA_ADMIN_SESSION_SECRET` | **Yes** | — | Secret for signing session cookies (min 32 chars) |
| `PORTA_ADMIN_PUBLIC_URL` | No | `http://localhost:4002` | Public-facing URL of the admin GUI |
| `PORTA_ADMIN_ORG_SLUG` | No | Auto-detected | Organization slug for OIDC discovery |
| `PORTA_ADMIN_SESSION_TTL` | No | `3600` | Session duration in seconds |
| `REDIS_URL` | **Yes** | — | Redis connection string (e.g., `redis://localhost:6379/1`) |
| `NODE_ENV` | No | `development` | Environment mode |
| `LOG_LEVEL` | No | `info` | Log verbosity (`debug`, `info`, `warn`, `error`) |

### Local Development

```bash
# 1. Start Porta infrastructure
yarn docker:up

# 2. Start Porta server
yarn dev

# 3. Run porta init (if not already done)
porta init

# 4. Configure admin GUI
cd admin-gui
cp .env.example .env
# Edit .env with the client ID and secret from porta init

# 5. Start admin GUI in dev mode
yarn dev
```

The admin GUI will be available at `http://localhost:4002`.

## Docker Deployment

### Using Docker Compose

The admin GUI runs as a separate service in the same Docker image, controlled by the `PORTA_SERVICE` environment variable:

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

### Service Modes

The Porta Docker image supports two service modes via `PORTA_SERVICE`:

| Value | Description |
|-------|-------------|
| `server` (default) | Runs the Porta OIDC server |
| `admin` | Runs the Admin GUI BFF |

## Authentication Flow

1. User visits the admin GUI at `http://localhost:4002`
2. BFF redirects to Porta's OIDC authorization endpoint
3. User authenticates via magic link (passwordless email)
4. Porta redirects back to `/auth/callback` with an authorization code
5. BFF exchanges the code for tokens using the client secret
6. BFF stores the session in Redis and sets a session cookie
7. Subsequent API requests are proxied through the BFF with Bearer token injection

## Security

The BFF implements multiple security layers:

- **httpOnly session cookies** — tokens never reach the browser
- **CSRF double-submit cookies** — protects state-changing requests
- **Server-side Bearer injection** — API requests authenticated server-side
- **Security headers** — CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- **Session timeouts** — 30-minute idle, 8-hour absolute maximum
- **PKCE (S256)** — Proof Key for Code Exchange for the authorization flow

## BFF Server Components

The BFF server (`admin-gui/src/server/`) includes:

| Component | Description |
|---|---|
| `index.ts` | Server entry point, startup orchestration, graceful shutdown |
| `config.ts` | Zod-validated environment configuration |
| `oidc.ts` | OIDC client discovery and token management |
| `session.ts` | Redis-backed session configuration |
| `routes/auth.ts` | Login, callback, logout, session info endpoints |
| `routes/api-proxy.ts` | Authenticated API proxy to Porta server |
| `routes/health.ts` | BFF health check (Redis + Porta connectivity) |
| `routes/spa.ts` | Static file serving + SPA fallback |
| `middleware/csrf.ts` | CSRF double-submit cookie validation |
| `middleware/security-headers.ts` | Security header injection |
| `middleware/session-guard.ts` | Session authentication guard |
| `middleware/request-logger.ts` | Request logging with request ID |

## Foundational Client Components

The following client-side components are included as a foundation for the SPA rebuild:

| Component | Description |
|---|---|
| `api/client.ts` | Typed fetch wrapper with CSRF injection, 401 redirect, ETag support |
| `hooks/useAuth.tsx` | Auth context — fetches `/auth/me`, manages login/logout, CSRF |
| `hooks/useTheme.ts` | FluentUI light/dark theme with localStorage persistence |
| `hooks/useToast.ts` | FluentUI toast notification wrapper |
| `hooks/useCopyToClipboard.ts` | Clipboard API utility hook |
| `components/ErrorBoundary.tsx` | React error boundary with retry UI |
| `components/ToastProvider.tsx` | FluentUI Toaster wrapper |
| `components/StatusBadge.tsx` | Status → colored FluentUI badge mapping |
| `components/CopyButton.tsx` | Click-to-copy button |
| `components/EmptyState.tsx` | Empty state display with icon + action |
| `components/LoadingSkeleton.tsx` | Loading shimmer placeholders |
| `components/ConfirmDialog.tsx` | Confirmation dialog |
| `theme.ts` | FluentUI theme definitions |

## Testing

### BFF Server Tests

The BFF server has comprehensive unit tests:

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

### Placeholder Test

A basic placeholder test validates the SPA renders correctly:

| Test File | Coverage |
|---|---|
| `tests/client/placeholder.test.tsx` | Renders placeholder page, auth controls, theme toggle |

## Troubleshooting

### BFF won't start

1. Verify Porta server is running and accessible at `PORTA_ADMIN_PORTA_URL`
2. Verify Redis is running and accessible at `REDIS_URL`
3. Check that `PORTA_ADMIN_CLIENT_ID` and `PORTA_ADMIN_CLIENT_SECRET` are correct
4. Ensure `PORTA_ADMIN_SESSION_SECRET` is at least 32 characters

### Authentication fails

1. Verify the admin GUI client exists: `porta client list`
2. Check redirect URI matches: should be `http://localhost:4002/auth/callback`
3. Verify the organization slug is correct (auto-detected from super-admin org)
4. Check Porta server logs for OIDC errors

### Cannot connect to Porta API

1. Verify `PORTA_ADMIN_PORTA_URL` is correct and reachable from the BFF
2. In Docker, use the service name (e.g., `http://porta:3000`), not `localhost`
3. Check that the BFF health endpoint reports both checks as "ok": `GET /health`
