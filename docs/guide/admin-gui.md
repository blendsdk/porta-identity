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

## SPA Architecture

The React SPA uses FluentUI v9 and follows a structured component architecture:

### Layout Components

| Component | Description |
|-----------|-------------|
| `AppShell` | Root layout with sidebar + top bar + main content area |
| `Sidebar` | Collapsible navigation with grouped menu items and org switcher |
| `TopBar` | Header with search (Cmd+K), notifications, theme toggle, user menu |
| `Breadcrumbs` | Auto-generated from React Router matches |

### Reusable Components

| Component | Description |
|-----------|-------------|
| `EntityDataGrid` | Generic data table with search, sort, pagination, bulk selection |
| `StatusBadge` | Colored badge for entity status (active, suspended, archived, etc.) |
| `ConfirmDialog` | Modal confirmation with optional type-to-confirm for destructive actions |
| `WizardStepper` | Multi-step form wizard with progress indicators |
| `StatsCard` | Dashboard metric card with trend indicators |
| `AuditTimeline` | Vertical timeline for entity change history |
| `EmptyState` | Placeholder for pages/lists with no data |
| `LoadingSkeleton` | Animated loading placeholders (table, card, detail variants) |
| `CopyButton` | One-click clipboard copy with visual feedback |
| `ErrorBoundary` | Catches rendering errors with retry UI |
| `SearchOverlay` | Global search overlay (Cmd+K) |
| `NotificationPanel` | Side drawer for system notifications |
| `ToastProvider` | Toast notification system |

### Hooks

| Hook | Description |
|------|-------------|
| `useAuth` | Authentication state and user info from BFF |
| `useOrgContext` | Current organization selection (persisted to localStorage) |
| `useTheme` | FluentUI theme preference (light/dark/system) |
| `useKeyboardShortcut` | Global keyboard shortcut handler |
| `useCopyToClipboard` | Clipboard copy with feedback state |
| `useToast` | Toast notification dispatch |

### API Client Layer

The SPA communicates with the Porta server through the BFF proxy. The API client (`src/client/api/client.ts`) provides:

- **CSRF protection** — Automatically includes `X-CSRF-Token` header on state-changing requests
- **Auth handling** — Redirects to `/auth/login` on 401 responses
- **ETag support** — `apiRequestWithEtag()` for optimistic concurrency
- **Typed convenience methods** — `api.get()`, `api.post()`, `api.patch()`, `api.del()`

Domain-specific React Query hooks are provided for all entity types: organizations, applications, clients, users, roles, permissions, custom claims, sessions, audit, config, signing keys, stats, and import/export.

### System Feature Pages

The SPA includes the following system-level admin pages:

| Page | Route | Description |
|------|-------|-------------|
| **Dashboard** | `/` | System-wide or org-scoped stats cards, login activity chart (Recharts), recent activity feed, quick actions. Switches to org-scoped stats when an org is selected. |
| **Audit Log** | `/audit` | Filterable audit trail with date range, event type, actor, entity type filters. Expandable rows show full JSON event details. Supports CSV export of filtered results. |
| **Sessions** | `/sessions` | Active session list with auto-refresh (30s). Single revoke via ConfirmDialog, bulk revoke by user/org/all with TypeToConfirm for destructive "revoke all". |
| **Configuration** | `/config` | System config key-value editor with inline edit, type indicators (string/number/boolean/duration), and confirm dialog for changes. |
| **Signing Keys** | `/keys` | ES256 signing key management — key list with ID copy, generate new key, rotate keys (TypeToConfirm), JWKS endpoint URL with CopyButton. |
| **Export** | `/import-export` | Multi-entity JSON export with entity type checkboxes and Blob-based file download. |
| **Import** | `/import-export/import` | Drag-and-drop JSON file upload, dry-run preview table with entity counts, confirmed import with progress indicator and result summary. |
| **Search Results** | `/search?q=...` | Full-page search results grouped by entity type, navigated from the SearchOverlay (Cmd+K). |
| **Getting Started** | `/getting-started` | Setup wizard checklist (create org, app, client, invite user, configure branding) with localStorage progress tracking and dismiss functionality. |
| **Admin Profile** | `/profile` | Tabbed profile page: edit name/email, change password (current + new + confirm), TOTP setup (QR code + 6-digit verification + disable). |

### Testing

```bash
# Unit tests (Vitest — BFF + React components)
cd admin-gui && yarn test

# E2E tests (Playwright — full browser testing)
cd admin-gui && yarn test:e2e

# E2E tests in headed mode (visible browser)
cd admin-gui && yarn test:e2e:headed
```

**Unit tests** include server-side BFF tests (config, CSRF, health, security headers, session guard) and client-side component/hook tests (StatusBadge, EmptyState, StatsCard, AuditTimeline, API client).

**E2E tests** use Playwright to test the full admin GUI in a real browser. The test infrastructure:

- Starts a real Porta server (port 49300) and BFF (port 49301) in-process
- Seeds test data (admin user, organizations, clients)
- Authenticates via the real magic-link flow using MailHog
- Saves session state so all subsequent tests run authenticated
- Tests cover: authentication flow, sidebar navigation, page rendering, routing, and 404 handling

**Prerequisites for E2E tests:** Docker services must be running (`yarn docker:up` from the project root) for PostgreSQL, Redis, and MailHog.
