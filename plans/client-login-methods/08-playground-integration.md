# Playground Integration

> **Document**: 08-playground-integration.md
> **Parent**: [Index](00-index.md)
> **Status**: Planning Complete
> **Last Updated**: 2026-04-19

## Purpose

Make the new client-level login-method configuration **visible and demoable** in both playground surfaces:

- **`playground/`** — the static SPA (public client, PKCE, no backend secret)
- **`playground-bff/`** — the server-rendered BFF example (confidential client, authorization code)

Goals:

1. Seed multiple clients so every login-method scenario works out of the box (no operator action needed).
2. Let a human demo all three UI variants in a single SPA session via a dropdown (client switcher).
3. Provide a **Login Methods Configuration** panel in the BFF dashboard so operators can *see* the resolution chain.
4. Expose a small debug JSON endpoint in the BFF (dev-only) so automated tests can assert the resolved state.
5. Wire a handful of smoke-test curl calls to guard against drift.

---

## Seed Data Changes — `scripts/playground-seed.ts`

Add a new org + three SPA clients + two BFF clients covering the matrix:

| Client key              | Target       | `login_methods` (DB)         | Effective | Purpose                                     |
| ----------------------- | ------------ | ---------------------------- | --------- | ------------------------------------------- |
| `playgroundSpa`         | SPA          | `NULL` (inherit)             | `[password, magic_link]` | Baseline — both visible (current behavior) |
| `playgroundSpaPassword` | SPA          | `['password']`               | `[password]`             | Password-only UI                           |
| `playgroundSpaMagic`    | SPA          | `['magic_link']`             | `[magic_link]`           | Magic-link-only UI (email input + button)  |
| `playgroundBff`         | BFF          | `NULL` (inherit)             | `[password, magic_link]` | Baseline confidential client               |
| `playgroundBffPassword` | BFF          | `['password']`               | `[password]`             | Password-only confidential client          |

Plus one new organization to demonstrate **org-level default override**:

| Org key         | `default_login_methods`      | Effect                                  |
| --------------- | ---------------------------- | --------------------------------------- |
| `passwordOnly`  | `['password']`               | Every client that inherits gets password-only |

Add **one client under `passwordOnly`** (inheriting):

| Client key            | Org            | `login_methods` | Effective | Purpose                               |
| --------------------- | -------------- | --------------- | --------- | ------------------------------------- |
| `playgroundOrgInherit`| `passwordOnly` | `NULL`          | `[password]` | Proves org default propagates through |

### Seed script changes

1. Add `ORGS.passwordOnly` entry with `defaultLoginMethods: ['password']` (uses the new org field introduced by Phase 3).
2. Add a new `CLIENTS` block (or extend the existing clients section) to register the five new clients above.
3. Pass `loginMethods` through to `createClient()` for the three override cases; leave `undefined`/`null` for the two inheriting cases.
4. Extend the generated `playground/config.generated.js` output to include ALL SPA clients:
   ```js
   PLAYGROUND_CONFIG = {
     portaUrl: '...',
     organizations: { ... existing ... },
     loginMethodClients: {
       both:     { clientId: '<id>', orgSlug: 'playground-no2fa',  label: 'Both (password + magic link)' },
       password: { clientId: '<id>', orgSlug: 'playground-no2fa',  label: 'Password only' },
       magic:    { clientId: '<id>', orgSlug: 'playground-no2fa',  label: 'Magic link only' },
       orgForced:{ clientId: '<id>', orgSlug: 'playground-passwordonly', label: 'Password-only (via org default)' },
     },
   };
   ```
5. Extend the generated `playground-bff/config.generated.json` with the two BFF client IDs + a derived `CLIENT_PROFILES` map so the BFF can render a profile-switcher link bar.
6. Update the console summary table at the end of the script to print the new clients with their effective login methods (resolved via `resolveLoginMethods(org, client)`).

### Redirect URIs

All SPA clients share redirect URI `http://localhost:8080/callback.html` (exact-match is allowed per client as long as registered). The SPA uses the `state` nonce (round-tripped via `sessionStorage`) to know which client initiated the flow.

All BFF clients share `http://localhost:3000/oidc/callback`.

---

## SPA (`playground/`) Changes

### `playground/index.html`

Add a new section **above the scenarios grid** (before the existing "Pick a scenario" UI) titled **"Login Method Demo"**. It contains:

- A dropdown `<select id="loginMethodClient">` populated from `config.loginMethodClients`
- A "Start login" button
- A short description region that updates based on the selected option

Selected client is persisted to `localStorage['playground.loginMethodClient']` and also reflected in the URL hash (`#loginMethodClient=password`) so a page refresh after the OIDC redirect knows which client was used.

### `playground/js/config.js`

Extend to expose the new client profiles:

```js
export function getLoginMethodProfiles() {
  if (!playgroundConfig) throw new Error('Config not loaded');
  return playgroundConfig.loginMethodClients || {};
}

export function getLoginMethodProfile(key) {
  const profiles = getLoginMethodProfiles();
  const profile = profiles[key];
  if (!profile) throw new Error(`Unknown login method profile: ${key}`);
  return {
    authority: `${playgroundConfig.portaUrl}/${profile.orgSlug}`,
    clientId: profile.clientId,
    orgSlug: profile.orgSlug,
    label: profile.label,
  };
}
```

### `playground/js/auth.js`

Add a new function `loginWithProfile(profileKey)` that:

1. Calls `getLoginMethodProfile(profileKey)` to resolve the client.
2. Writes `profileKey` to `sessionStorage` under the PKCE state key so the callback can restore it.
3. Kicks off the standard PKCE flow using the profile's `authority` + `clientId`.

The callback handler reads `profileKey` back from `sessionStorage` on return so the UI can display "You logged in via the Password-only client" for confirmation.

### `playground/js/app.js`

- Wire the new dropdown + button to `loginWithProfile()`.
- On callback, render a small confirmation card showing which profile was used and the tokens received.

### `playground/README.md`

Add a section documenting the three Login Method scenarios and how to switch between them via the dropdown.

---

## BFF (`playground-bff/`) Changes

### Config

Extend `playground-bff/src/config.ts` to accept `BFF_CLIENT_PROFILE` (env var). Valid values:

- `default` → use `playgroundBff`
- `password` → use `playgroundBffPassword`

Config is hydrated from `playground-bff/config.generated.json` (produced by the seed script). If `BFF_CLIENT_PROFILE` is unset, default to `default`.

### `playground-bff/src/routes/`

Add two new routes:

#### 1. `/debug/client-login-methods` (dev-only, gated by `NODE_ENV !== 'production'`)

Returns JSON describing the current resolution:

```json
{
  "client": {
    "id": "c_1a2b...",
    "name": "Playground BFF (Password Only)",
    "loginMethods": ["password"]
  },
  "organization": {
    "slug": "playground-no2fa",
    "defaultLoginMethods": ["password", "magic_link"]
  },
  "effective": ["password"],
  "source": "client_override"
}
```

`source` is one of `client_override | organization_default | system_default`.

**Implementation note**: the BFF does not have direct DB access. This endpoint fetches the data from Porta's admin API using a super-admin service credential already in the BFF config (same one used for management operations), OR it derives the values by parsing the OIDC metadata returned from the discovery endpoint. Preferred: admin API call for authoritative data, cached for 30s in-process.

#### 2. Dashboard panel

Extend `playground-bff/views/dashboard.hbs` with a new card:

```
┌─ Login Methods Configuration ─────────────────────┐
│ Client:                playgroundBffPassword      │
│ Client override:       ["password"]               │
│ Organization default:  ["password", "magic_link"] │
│ Effective methods:     ["password"]               │
│ Source:                client override            │
│                                                   │
│ [View raw JSON →]  (links to /debug/client-login-methods) │
└───────────────────────────────────────────────────┘
```

Rendered server-side using the same data that powers the debug endpoint.

### `playground-bff/src/server.ts`

Register the new route + wire the dashboard panel data into the `/` handler's render context.

### `playground-bff/README.md`

Document:
- The two BFF profiles (`default`, `password`)
- How to switch via `BFF_CLIENT_PROFILE`
- The `/debug/client-login-methods` endpoint (dev only)
- Example curl commands for quick testing

---

## Scripts

### `scripts/run-playground.sh`

Update the "banner" output printed at the end so it lists the new demo URLs:

```
=== Porta Playground Ready ===
SPA:               http://localhost:8080
BFF (default):     http://localhost:3000
BFF (password):    BFF_CLIENT_PROFILE=password yarn --cwd playground-bff dev

Login method demos (SPA):
  Both:          http://localhost:8080#loginMethodClient=both
  Password only: http://localhost:8080#loginMethodClient=password
  Magic only:    http://localhost:8080#loginMethodClient=magic
  Org-forced:    http://localhost:8080#loginMethodClient=orgForced
```

### `scripts/playground-bff-smoke.sh`

Add three assertions to the existing smoke script (guarded by `NODE_ENV=development`):

```bash
# Debug endpoint returns expected shape
curl -fsS http://localhost:3000/debug/client-login-methods \
  | jq -e '.effective | length >= 1' > /dev/null

# Default profile has both methods
curl -fsS http://localhost:3000/debug/client-login-methods \
  | jq -e '.effective == ["password","magic_link"]' > /dev/null

# Dashboard HTML contains the Login Methods panel
curl -fsS http://localhost:3000/ -H "Cookie: <session>" \
  | grep -q 'Login Methods Configuration'
```

(Script is best-effort — it's not run in CI, just by operators locally.)

---

## Design Decisions

### Why a dropdown SPA over separate HTML files

Considered three separate HTML files (`index.html`, `index-password.html`, `index-magic.html`) but rejected:

- **Duplication** — the SPA's `auth.js`/`tokens.js`/`ui.js` are identical; three copies would drift.
- **Pedagogy** — the whole point of this demo is that *only the `client_id` changes*. Separate files hide that.
- **Comparison UX** — switching clients should be a single click, not a new tab.

Dropdown + URL hash gives bookmarkable/shareable scenarios (`http://localhost:8080#loginMethodClient=magic`) while keeping one app.

### Why BOTH a dashboard panel AND a JSON endpoint in the BFF

- **Dashboard panel (HTML)** — humans *see* the resolution chain at a glance when they land on `localhost:3000`. Great for demos.
- **JSON endpoint** — scripted smoke tests can assert without HTML scraping. Great for drift detection.

The JSON endpoint is dev-only (`NODE_ENV !== 'production'`) so it never ships to a real BFF deployment.

### Why shared redirect URIs per transport

All SPA clients use `http://localhost:8080/callback.html`; all BFF clients use `http://localhost:3000/oidc/callback`. OIDC supports this — exact-match is per-client, not globally unique. The PKCE `state` nonce + `sessionStorage` already round-trip the client identity.

### Why add an `org`-level passwordOnly scenario

Without it, the playground only demonstrates client-level overrides. Adding `passwordOnly` org + `playgroundOrgInherit` client proves the two-level inheritance works end to end, which is the whole architectural point.

---

## File Changes Summary

### New files

- None (all changes are to existing files or extensions of existing configs)

### Modified files (source)

| File                                    | Change                                                               |
| --------------------------------------- | -------------------------------------------------------------------- |
| `scripts/playground-seed.ts`            | Add 1 org + 5 clients; extend generated configs                      |
| `scripts/run-playground.sh`             | Update banner with login-method URLs                                 |
| `scripts/playground-bff-smoke.sh`       | Add 3 curl assertions                                                |
| `playground/index.html`                 | Add "Login Method Demo" card with dropdown                           |
| `playground/js/config.js`               | Add `getLoginMethodProfiles()` + `getLoginMethodProfile()`           |
| `playground/js/auth.js`                 | Add `loginWithProfile()` + callback restoration                      |
| `playground/js/app.js`                  | Wire dropdown + confirmation card                                    |
| `playground/README.md`                  | Document new scenarios                                               |
| `playground-bff/src/config.ts`          | Accept `BFF_CLIENT_PROFILE`; hydrate from generated config           |
| `playground-bff/src/routes/debug.ts`    | **NEW** — `/debug/client-login-methods` (dev-only)                   |
| `playground-bff/src/server.ts`          | Register debug route; wire dashboard data                            |
| `playground-bff/views/dashboard.hbs`    | Add Login Methods panel                                              |
| `playground-bff/README.md`              | Document profiles + debug endpoint                                   |

### No changes needed

- `playground/callback.html` — identical for all clients
- `playground-bff/src/oidc.ts` — profile selection is a config concern
- `playground-bff/src/session.ts` — no change

---

## Acceptance Criteria

1. ✅ After running `yarn tsx scripts/playground-seed.ts`, all 5 new clients exist in the DB with correct `login_methods`.
2. ✅ SPA landing page shows a "Login Method Demo" card with a 4-option dropdown.
3. ✅ Selecting "Password only" → clicking Login → the Porta login page shows **only** the password form (no magic-link button, no "or" divider).
4. ✅ Selecting "Magic link only" → clicking Login → the Porta login page shows **only** the email input + "Send magic link" button (no password form, no divider).
5. ✅ Selecting "Org-forced" → clicking Login → password-only page renders, proving the org-level default propagated.
6. ✅ BFF dashboard (`localhost:3000`) shows a "Login Methods Configuration" panel with correct values for the active profile.
7. ✅ `curl http://localhost:3000/debug/client-login-methods` returns the expected JSON shape in dev.
8. ✅ `BFF_CLIENT_PROFILE=password yarn --cwd playground-bff dev` → triggers a login → password-only page.
9. ✅ URL hash `#loginMethodClient=magic` survives the redirect round-trip and displays a confirmation card on return.
10. ✅ `scripts/playground-bff-smoke.sh` passes all three new assertions.

---

## Dependencies

- **Phase 3 complete** — need `organizations.defaultLoginMethods` support
- **Phase 4 complete** — need `clients.loginMethods` support  
- **Phase 6 complete** — need the new `login.hbs` conditional rendering (otherwise the visual difference won't be visible)
- **Phase 7 complete** — BFF's debug endpoint calls the admin API, which needs `effectiveLoginMethods` in GET responses

This is why Phase 10 (see execution plan) runs **after** Phase 9.
