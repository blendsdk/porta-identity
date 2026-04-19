# Porta Playground

Interactive OIDC playground for testing Porta authentication flows. Provides 8 test scenarios covering password login, 2FA (email OTP, TOTP, recovery codes), magic link, consent screens, password reset, and TOTP enrollment.

## Quick Start

```bash
# From the project root — starts everything from scratch:
yarn playground
```

This single command:
1. Starts Docker services (Postgres, Redis, MailHog)
2. Waits for database and cache health
3. Runs migrations and seeds test data
4. Starts the Porta OIDC server (port 3000)
5. Starts the playground static server (port 4000)

**URLs:**
- **Playground:** http://localhost:4000
- **Porta:** http://localhost:3000
- **MailHog:** http://localhost:8025 (email inbox for OTP codes, magic links, etc.)

Press **Ctrl+C** to stop all services.

## Other Commands

```bash
# Stop all services (Porta + playground)
yarn playground:stop

# Stop all services including Docker
yarn playground:stop -- --docker

# Reset database and re-seed (preserves Docker)
yarn playground:reset
```

## Test Scenarios

| # | Scenario | Org | Description |
|---|----------|-----|-------------|
| 1 | **Normal Login** | playground-no2fa | Standard password login, no 2FA |
| 2 | **Email OTP 2FA** | playground-email2fa | Password + 6-digit email OTP (check MailHog) |
| 3 | **TOTP Authenticator** | playground-totp2fa | Password + authenticator app code |
| 4 | **Recovery Code** | playground-totp2fa | Use recovery code instead of TOTP |
| 5 | **Magic Link** | playground-no2fa | Passwordless email link (check MailHog) |
| 6 | **Third-Party Consent** | playground-thirdparty | Login triggers scope consent screen |
| 7 | **Password Reset** | playground-no2fa | Forgot password flow via email |
| 8 | **TOTP Setup** | playground-totp2fa | Fresh user sees TOTP enrollment |

## Login Method Demo

The dashboard ships a dedicated **"Login Method Demo"** card that exercises
the per-client `login_methods` override. Each profile points at a different
OIDC client so the Porta login page renders with a specific combination of
buttons.

| Profile | Client | Override | Effective | Expected UI |
|---------|--------|----------|-----------|-------------|
| **Password only** | `Playground SPA (Password Only)` (org `playground-no2fa`) | `['password']` | `password` | Password form only |
| **Magic link only** | `Playground SPA (Magic Link Only)` (org `playground-no2fa`) | `['magic_link']` | `magic_link` | "Email me a login link" only |
| **Both** | `Playground SPA (No 2FA Org)` (org `playground-no2fa`) | *none* | `password, magic_link` (from org default) | Both buttons |
| **Password-only (via org default)** | `Playground SPA (Password-Only Org)` (org `playground-passwordonly`) | *none* | `password` (from org default) | Password form only |

The "via org default" profile proves the resolution rule: when a client's
`login_methods` is `null`, the organisation's `default_login_methods` takes
effect. The seed script sets `defaultLoginMethods = ['password']` on the
`playground-passwordonly` org specifically to demonstrate this.

**Usage:**

1. Start the playground (`yarn playground`).
2. In the dashboard, pick a profile from the **Login Method Demo** dropdown.
3. Review the confirmation panel — it shows the effective login methods, the
   resolution source (`client` / `org` / `fallback`), and the expected UI.
4. Click **"Start login with this profile"** — Porta will redirect to the
   login page rendered for that profile's client.
5. Log in with any seeded user for the org (e.g. `user@no2fa.local` /
   `Playground123!` for the `no2fa` profiles).

## Test Users


All users have password: `Playground1!`

| Email | Org | 2FA Status | Role |
|-------|-----|------------|------|
| admin@no2fa.local | playground-no2fa | None | Admin |
| user@no2fa.local | playground-no2fa | None | Viewer |
| otp@email2fa.local | playground-email2fa | Email OTP enrolled | Admin |
| totp@totp2fa.local | playground-totp2fa | TOTP enrolled | Admin |
| fresh@totp2fa.local | playground-totp2fa | None (triggers setup) | Viewer |
| admin@thirdparty.local | playground-thirdparty | None | Admin |
| locked@optional2fa.local | playground-optional2fa | None (locked status) | — |
| suspended@no2fa.local | playground-no2fa | None (suspended status) | — |

## Architecture

```
playground/
├── index.html          # Main page (sidebar + dashboard + event log)
├── callback.html       # OIDC redirect handler
├── css/
│   └── style.css       # Dark/light theme via CSS custom properties
├── js/
│   ├── app.js          # Main orchestrator — init, scenarios, buttons
│   ├── config.js       # Config loader + scenario definitions
│   ├── auth.js         # oidc-client-ts wrapper (login/logout/callback)
│   ├── ui.js           # Event log, status dots, theme toggle
│   ├── tokens.js       # JWT decoding + token panel rendering
│   └── userinfo.js     # UserInfo endpoint fetch + display
├── vendor/
│   └── oidc-client-ts.min.js  # Vendored ESM build (no CDN)
├── config.generated.js # Generated by seed (gitignored)
├── package.json        # sirv-cli for static serving
└── README.md           # This file
```

## How It Works

1. **Seed script** (`scripts/playground-seed.ts`) creates organizations, clients, users, RBAC roles, and custom claims in the database. It writes `config.generated.js` with all dynamic IDs.

2. **Playground app** loads `config.generated.js` and uses [oidc-client-ts](https://github.com/authts/oidc-client-ts) to perform OIDC flows against the Porta server.

3. **Scenario selector** configures the OIDC UserManager with the correct authority (org-scoped issuer URL) and client ID for each test case.

4. **Token dashboard** decodes JWTs client-side and displays headers, payloads, and UserInfo responses.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Config not loaded" error | Run `yarn tsx scripts/playground-seed.ts` to generate config |
| Porta status dot is red | Check if Porta is running: `curl http://localhost:3000/health` |
| MailHog unreachable | Check Docker: `docker compose -f docker/docker-compose.yml ps` |
| Login redirect fails | Verify the org slug exists and client is registered |
| Token refresh fails | The playground uses `offline_access` scope — verify client config |
| Port 3000/4000 in use | Run `yarn playground:stop` first |
