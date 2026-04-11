# RD-14: Playground Application

> **Document**: RD-14-playground-application.md
> **Status**: Draft
> **Created**: 2026-04-11
> **Project**: Porta v5
> **Depends On**: RD-03 (OIDC Core), RD-07 (Auth Workflows), RD-12 (2FA)

---

## Feature Overview

The Playground Application is a self-contained, vanilla HTML/JavaScript Single-Page
Application (SPA) that connects to a local Porta instance via standard OIDC protocols.
Its purpose is to provide developers and testers with an interactive environment to
exercise **every** authentication and authorization flow that Porta supports — including
password login, magic link, email OTP 2FA, TOTP authenticator 2FA, recovery codes,
consent screens, token inspection, and logout.

The playground lives in a `playground/` subfolder at the project root with its own
`package.json` and can be started independently. It uses the
[oidc-client-ts](https://github.com/authts/oidc-client-ts) library for OIDC
Authorization Code + PKCE flows, and has **zero build step** — just a static file
server serving vanilla HTML, CSS, and JS.

---

## Functional Requirements

### Must Have

- [ ] **Vanilla HTML/JS SPA** — No React, Vue, or framework. Plain HTML pages with
  vanilla JavaScript (ES modules). Served by a lightweight static file server
  (e.g., `sirv-cli` or `http-server`).

- [ ] **OIDC Authorization Code + PKCE** — Use `oidc-client-ts` (loaded from CDN or
  vendored) to handle the full OIDC flow: authorization request → redirect to Porta
  login → callback with code → token exchange → token storage.

- [ ] **Configuration panel** — A sidebar or settings area where the user can:
  - Select the target organization (dropdown populated from seed data)
  - Select the client type (public or confidential)
  - View/edit the OIDC discovery URL, client ID, redirect URI, scopes
  - All values pre-populated from the playground seed output

- [ ] **Scenario selector** — Pre-configured buttons that set up specific test scenarios:
  | Scenario | What it does |
  |----------|-------------|
  | Normal Login (no 2FA) | Triggers auth flow for org with no 2FA policy |
  | Login with Email OTP | Triggers auth flow for org with email 2FA required |
  | Login with TOTP Authenticator | Triggers auth flow for org with TOTP required |
  | Login + Recovery Code | Same as TOTP, but user enters recovery code |
  | Magic Link Login | User clicks magic link button on login page |
  | Third-Party Consent | Uses a client from a different org to trigger consent screen |
  | Password Reset | Navigates to forgot-password flow |
  | Invitation Flow | Shows how invited users set up their account |

- [ ] **Token dashboard** — After successful login, display:
  - **ID Token**: decoded header + payload (JSON pretty-printed), signature status
  - **Access Token**: raw value (opaque tokens can't be decoded), expiry time
  - **Refresh Token**: presence indicator, expiry
  - **Token metadata**: issued at, expires at, scopes granted, audience

- [ ] **UserInfo panel** — Button to call the OIDC `/userinfo` endpoint and display:
  - Standard OIDC claims (sub, name, email, etc.)
  - RBAC roles (if included via custom claims)
  - Custom claims (if any defined)
  - Raw JSON response

- [ ] **Logout button** — Triggers OIDC RP-initiated logout (end session endpoint),
  clears local token state, returns to playground home.

- [ ] **Re-login button** — Clears all stored tokens and initiates a fresh auth flow,
  allowing quick testing of different scenarios without manual session clearing.

- [ ] **MailHog link** — Prominent link/button that opens MailHog web UI
  (`http://localhost:8025`) in a new tab for checking OTP codes, magic links,
  password reset emails, and invitations.

- [ ] **Status indicators** — Visual indicators showing:
  - Whether Porta is reachable (green/red dot + discovery URL check)
  - Whether MailHog is reachable
  - Current auth state (logged in / logged out)
  - Active organization and client

### Should Have

- [ ] **Token refresh demo** — Button to manually trigger a silent token refresh using
  the refresh token, showing the new access token and comparing with the old one.

- [ ] **Session timeline** — Visual log showing the sequence of OIDC events:
  auth request → redirect → login page → 2FA challenge → consent → callback → tokens.

- [ ] **Responsive layout** — The playground should look reasonable on both desktop and
  tablet screens (not necessarily mobile-optimized).

- [ ] **Dark/light theme** — A simple theme toggle. The playground is a dev tool, so
  dark mode is appreciated.

### Won't Have (Out of Scope)

- Server-side rendering or backend for the playground app itself
- Admin panel for managing Porta resources (use the CLI)
- Production deployment of the playground (dev-only tool)
- Framework-specific examples (React, Vue, Angular)
- Automated testing of the playground app itself

---

## Technical Requirements

### File Structure

```
playground/
├── package.json          # Minimal: name, scripts (start), dependencies (sirv-cli)
├── index.html            # Main page — scenario selector, config panel
├── callback.html         # OIDC redirect callback page
├── css/
│   └── style.css         # All styles — clean, modern dev-tool aesthetic
├── js/
│   ├── app.js            # Main application logic, scenario selector
│   ├── auth.js           # OIDC client setup, login/logout/callback handlers
│   ├── config.js         # Configuration management, org/client presets
│   ├── tokens.js         # Token decoding, display, refresh
│   ├── userinfo.js       # UserInfo endpoint calls and display
│   └── ui.js             # DOM manipulation helpers, status indicators
├── vendor/
│   └── oidc-client-ts.min.js  # Vendored oidc-client-ts (no CDN dependency)
└── README.md             # Playground-specific usage instructions
```

### OIDC Client Configuration

The playground uses `oidc-client-ts` `UserManager` with these settings:

```javascript
{
  authority: 'http://localhost:3000/{orgSlug}',
  client_id: '{clientId}',
  redirect_uri: 'http://localhost:4000/callback.html',
  post_logout_redirect_uri: 'http://localhost:4000/',
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: false,  // Manual control for demo purposes
  monitorSession: false,
}
```

### Port Assignment

| Service | Port | Purpose |
|---------|------|---------|
| Porta server | 3000 | OIDC provider |
| Playground app | 4000 | Static file server |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache/sessions |
| MailHog SMTP | 1025 | Email capture |
| MailHog Web | 8025 | Email viewer |

### Pre-configured Scenarios

Each scenario is a JavaScript object with OIDC settings and instructions:

```javascript
const SCENARIOS = {
  normalLogin: {
    name: 'Normal Login (No 2FA)',
    orgSlug: 'playground-no2fa',
    clientId: '...', // Populated from seed
    description: 'Standard password login without 2FA',
    testUser: { email: 'user@no2fa.local', password: 'Playground123!' },
  },
  emailOtp: {
    name: 'Login with Email OTP',
    orgSlug: 'playground-email2fa',
    clientId: '...',
    description: 'Password login followed by email OTP verification',
    testUser: { email: 'user@email2fa.local', password: 'Playground123!' },
    hint: 'Check MailHog for the 6-digit code',
  },
  totpAuth: {
    name: 'Login with TOTP Authenticator',
    orgSlug: 'playground-totp2fa',
    clientId: '...',
    description: 'Password login followed by authenticator app code',
    testUser: { email: 'user@totp2fa.local', password: 'Playground123!' },
    hint: 'Use Google/Microsoft Authenticator to scan the QR code during setup',
  },
  // ... more scenarios
};
```

---

## Integration Points

### With RD-03 (OIDC Core)
- Uses the OIDC discovery endpoint (`/.well-known/openid-configuration`)
- Relies on Authorization Code + PKCE flow
- Calls token endpoint, userinfo endpoint, end_session endpoint

### With RD-07 (Auth Workflows)
- Redirects to Porta's login page during auth flow
- User interacts with Porta's Handlebars templates (login, consent, magic link)
- Receives authorization code via redirect callback

### With RD-12 (2FA)
- 2FA challenge pages are served by Porta during the login interaction
- Playground doesn't handle 2FA directly — it's part of Porta's login flow
- Different scenarios trigger different 2FA methods via org policy

### With RD-15 (Playground Infrastructure)
- Depends on the enhanced seed script for pre-configured orgs, clients, and users
- Reads configuration from a generated `playground/config.generated.js` file

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| SPA framework | React, Vue, Vanilla JS | Vanilla JS | Zero build step, simplest setup, matches user preference |
| OIDC library | oidc-client-ts, custom fetch | oidc-client-ts | Battle-tested, handles PKCE, token management, session |
| Static server | Vite, sirv-cli, http-server | sirv-cli | Lightweight, SPA fallback support, zero config |
| Port | 3001, 4000, 8080 | 4000 | Avoids conflict with Porta (3000) and MailHog (8025) |
| Token display | jwt.io iframe, custom decoder | Custom decoder | Inline, no external dependency, shows full payload |

---

## Acceptance Criteria

1. [ ] Playground starts with `cd playground && yarn start` (or `yarn playground` from root)
2. [ ] All 8 test scenarios listed above can be triggered from the UI
3. [ ] After login, ID token is decoded and displayed with all claims
4. [ ] UserInfo button calls `/userinfo` and shows the response
5. [ ] Logout clears session and returns to the playground home
6. [ ] MailHog link opens in a new tab
7. [ ] Status indicators show Porta and MailHog reachability
8. [ ] Configuration panel allows switching between orgs and clients
9. [ ] Works in Chrome, Firefox, and Edge (modern browsers only)
10. [ ] No build step required — just `yarn start` serves static files
