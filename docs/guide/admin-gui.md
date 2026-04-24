# Admin GUI

The Porta Admin GUI is a web-based administration console for managing your Porta deployment. It provides a React-based single-page application (SPA) served through a Koa Backend-for-Frontend (BFF) that handles authentication, session management, and API proxying.

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

- **React SPA** — FluentUI v9 components, served as static files by the BFF
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

- **Session cookies** use `httpOnly`, `sameSite: lax`, and `secure` (in production) attributes
- **CSRF protection** via double-submit cookie pattern on state-changing requests
- **API proxy** adds Bearer tokens server-side — tokens never reach the browser
- **Security headers** include CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- **Health check** at `GET /health` verifies Redis and Porta server connectivity

## Troubleshooting

### Common Issues

**"OIDC discovery failed"**
- Verify `PORTA_ADMIN_PORTA_URL` points to a running Porta server
- Check that the Porta server's health endpoint (`/health`) returns OK

**"Invalid client credentials"**
- Verify `PORTA_ADMIN_CLIENT_ID` and `PORTA_ADMIN_CLIENT_SECRET` match the values from `porta init`
- If the secret was lost, generate a new one: `porta client secret generate <client-id>`

**"Session store unavailable"**
- Verify `REDIS_URL` points to a running Redis instance
- Check Redis connectivity: `redis-cli -u $REDIS_URL ping`

**"CSRF validation failed"**
- Clear browser cookies and try again
- Ensure `PORTA_ADMIN_PUBLIC_URL` matches the URL in the browser address bar
