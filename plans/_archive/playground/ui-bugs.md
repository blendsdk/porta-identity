# Playground UI Bugs

> Bugs discovered during manual E2E testing of the OIDC playground.
> **Status:** Collecting — do NOT fix during testing session.

---

## Bug List

### BUG-01: Login error shows raw error key instead of translated message
- **Scenario:** Any org / any user — wrong password
- **Steps to reproduce:**
  1. Go to login page
  2. Enter valid email but wrong password
  3. Submit
- **Expected:** A human-readable error message in the correct language (e.g., "Invalid email or password")
- **Actual:** Shows raw error key `error_invalid_credentials` instead of translated text
- **Screenshot/Console:** —
- **Severity:** high

### BUG-02: Consent page shows raw OIDC scope names instead of translated descriptions
- **Scenario:** Any org / any user — consent screen after login
- **Steps to reproduce:**
  1. Log in successfully
  2. Arrive at the consent page
- **Expected:** User-friendly translated scope descriptions (e.g., "Your basic profile information", "Your email address")
- **Actual:** Shows raw OIDC scope names: `openid`, `profile`, `email`
- **Screenshot/Console:** —
- **Severity:** high

### BUG-03: Refresh token / offline_access scope not working
- **Scenario:** Any org — attempting to use `offline_access` scope for refresh tokens
- **Steps to reproduce:**
  1. Initiate login with `offline_access` scope included
  2. Complete login + consent
  3. Check if a refresh token is returned
- **Expected:** A refresh token should be issued when `offline_access` scope is granted
- **Actual:** Refresh token not received — unclear whether the issue is in the playground config, the client registration, or Porta's OIDC provider configuration
- **Screenshot/Console:** —
- **Severity:** high
- **Note:** Needs investigation — could be playground client missing `offline_access` in allowed scopes, missing `refresh_token` grant type, or provider-side config

### BUG-04: Email 2FA page shows raw i18n keys — no translations loaded
- **Scenario:** Email 2FA org (`email2fa`) — user with required email 2FA
- **Steps to reproduce:**
  1. Select Email 2FA org
  2. Log in with `user@email2fa.local` / `Playground123!`
  3. Arrive at the email 2FA verification page
- **Expected:** Translated UI text in English (e.g., "Verify your identity", "Enter the code sent to your email", "Verify", "Resend code", etc.)
- **Actual:** Shows raw i18n placeholder keys:
  - `two-factor.verify_title`
  - `two-factor.verify_email_subtitle`
  - `two-factor.code_label`
  - `two-factor.code_placeholder`
  - `two-factor.verify_button`
  - `two-factor.resend_code`
  - `two-factor.or_divider`
  - `two-factor.recovery_prompt`
  - `two-factor.use_recovery_code`
- **Screenshot/Console:** —
- **Severity:** critical
- **Note:** The `two-factor.*` translation keys are missing from the locale files entirely — they were never added

### BUG-05: TOTP setup fails — scanned QR code but verification code always rejected
- **Scenario:** TOTP 2FA org (`totp2fa`) — fresh user with no TOTP enrolled
- **Steps to reproduce:**
  1. Select TOTP 2FA org
  2. Log in with `fresh@totp2fa.local` / `Playground123!`
  3. Arrive at TOTP setup page with QR code
  4. Scan QR code with authenticator app (e.g., Google Authenticator)
  5. Enter the 6-digit TOTP code from the app
  6. Submit
- **Expected:** TOTP code is accepted, enrollment completes, user proceeds
- **Actual:** Code is always rejected — tried 3 different codes, all fail. Server redirects to `?error=invalid_code`
- **Screenshot/Console:** Server log shows: `url: "/interaction/.../two-factor/setup?error=invalid_code"`
- **Severity:** critical
- **Note:** Could be a time sync issue, wrong secret encoding in QR URI, or TOTP verification logic bug. The seed generates the secret dynamically — verify the otpauth:// URI matches what the verifier expects.

### BUG-06: Forgot password link returns 404 Not Found
- **Scenario:** No 2FA org (`playground-no2fa`) — login page
- **Steps to reproduce:**
  1. Go to login page for any org
  2. Click "Forgot password" link
  3. Browser navigates to `/:orgSlug/forgot-password?interaction=...`
- **Expected:** A password reset request page where the user can enter their email
- **Actual:** 404 Not Found page
- **Screenshot/Console:** URL: `http://localhost:3000/playground-no2fa/forgot-password?interaction=d-XGbNwKslc0BY2OxYLPNHxelgIb2kDKL2dIJAYNRWf`
- **Severity:** high
- **Note:** Either the route is not registered, the path pattern doesn't match, or the forgot-password feature isn't mounted under the org-scoped prefix

### BUG-07: Magic link from email leads to 404 — URL path appears malformed
- **Scenario:** No 2FA org (`playground-no2fa`) — magic link login flow
- **Steps to reproduce:**
  1. Request a magic link login (from login page or playground)
  2. Check email in MailHog
  3. Click the magic link in the email
- **Expected:** Magic link verification page or automatic login
- **Actual:** 404 Not Found page
- **Screenshot/Console:** URL: `http://localhost:3000/playground/playground-no2fa/auth/magic-link/3BZq5KrujgVn_z6aF3DnkiYY_y7sB1EOU93NB8zKDa4?interaction=oqhCU8KHmtGDCq1Yv57zIoC7OzgiSsic57UWXukgRjW`
- **Severity:** critical
- **Note:** URL contains `/playground/playground-no2fa/` — looks like a doubled prefix. The email template is likely constructing the URL incorrectly (e.g., prepending an extra path segment). Expected URL should be `/:orgSlug/auth/magic-link/:token` → `/playground-no2fa/auth/magic-link/:token`

### BUG-08: "Back to Login" link after magic link sent goes to broken URL
- **Scenario:** Any org — magic link sent confirmation page
- **Steps to reproduce:**
  1. From the login page, request a magic link
  2. See the "magic link sent" confirmation page
  3. Click "Back to Login" link
- **Expected:** Redirect back to the org-scoped login page (e.g., `/:orgSlug/interaction/:uid/login`) or the playground app
- **Actual:** Redirects to `http://localhost:3000/interaction/` which returns `{"error": "Organization not found", "status": 404}`
- **Screenshot/Console:** JSON error response: `{"error": "Organization not found", "status": 404}`
- **Severity:** high
- **Note:** The "Back to Login" link is missing the org slug prefix — it goes to `/interaction/` instead of `/:orgSlug/interaction/...`

### BUG-09: TOTP verification error shows raw i18n key instead of translated message
- **Scenario:** TOTP 2FA org (`totp2fa`) — user with TOTP enrolled
- **Steps to reproduce:**
  1. Log in with a TOTP-enrolled user
  2. Arrive at the TOTP verification page
  3. Enter an incorrect 6-digit code
  4. Submit
- **Expected:** User-friendly error message in the correct language (e.g., "Invalid verification code. Please try again.")
- **Actual:** Shows raw i18n key: `two-factor.error_invalid_code`
- **Screenshot/Console:** —
- **Severity:** high
- **Note:** Same root cause as BUG-04 — the `two-factor.*` translation keys are missing from locale files

### BUG-10: Consent scope translations fail inside {{#each}} block — Handlebars context scoping issue
- **Scenario:** Any org / any user — consent screen after login
- **Steps to reproduce:**
  1. Log in successfully with any user
  2. Arrive at the consent page
  3. Observe the scope list
- **Expected:** Translated scope descriptions (e.g., "Verify your identity", "Access your profile information", "Access your email address")
- **Actual:** Shows raw i18n keys: `consent.scope_openid`, `consent.scope_profile`, `consent.scope_email`
- **Screenshot/Console:** —
- **Severity:** high
- **Root cause:** The Handlebars `{{t}}` helper reads `this.t` for the translation function. Inside `{{#each scopes}}`, `this` is the current scope string (e.g., `"openid"`), not the parent context. So `this.t` is `undefined` and the helper falls back to returning the raw key.
- **Fix:** Modified `registerHandlebarsI18nHelper()` in `src/auth/i18n.ts` to fall back to `options.data.root.t` (the root template context) when `this.t` is not available. This is the standard Handlebars pattern for accessing root context inside `{{#each}}` blocks.
- **Status:** ✅ Fixed

### BUG-11: Multiple raw i18n error keys shown instead of translated messages
- **Scenario:** Various flows — any page that shows error messages (expired interaction, CSRF, rate limit, etc.)
- **Steps to reproduce:**
  1. Let an OIDC interaction expire (wait or use a stale URL)
  2. See error page showing raw key `errors.interaction_expired`
- **Expected:** Translated error messages (e.g., "Your session has expired. Please start the sign-in process again.")
- **Actual:** Shows raw i18n keys because the translation keys were missing from locale files
- **Missing keys found (comprehensive audit):**
  - `errors.interaction_expired` — 6 call sites in interactions.ts
  - `errors.csrf_invalid` — 5 call sites across routes
  - `errors.rate_limit_exceeded` — 4 call sites across routes
  - `errors.magic_link_expired` — 2 call sites in magic-link.ts
  - `errors.reset_link_expired` — 2 call sites in password-reset.ts
  - `login.error_account_inactive` — 1 call site in interactions.ts
  - `forgot-password.check_email` — 1 call site in password-reset.ts
- **Severity:** high
- **Fix:** Added all 7 missing translation keys to their respective locale files: `errors.json` (5 keys), `login.json` (1 key), `forgot-password.json` (1 key). Also verified all 82 template `{{t}}` keys resolve correctly.
- **Status:** ✅ Fixed

### BUG-13: Magic link callback fails with "authority mismatch" in new tab
- **Scenario:** No 2FA org — magic link login flow via MailHog
- **Steps to reproduce:**
  1. Select "Magic Link" scenario, click Login
  2. Request magic link on login page
  3. Open MailHog, click the magic link (opens in new tab)
  4. Porta verifies token, redirects to callback
- **Expected:** Callback page exchanges code for tokens successfully
- **Actual:** Shows "Login failed: authority mismatch on settings vs. signin state"
- **Severity:** critical
- **Root cause:** The playground used `sessionStorage` for both OIDC state (PKCE code_verifier, nonce, authority) and authority/clientId settings. `sessionStorage` is per-tab, so when the magic link opens in a new tab from MailHog, the callback page can't find the matching OIDC state or authority.
- **Fix:** Switched playground's `oidc-client-ts` to use `localStorage` for `userStore`, `stateStore`, and authority/clientId persistence. `localStorage` is shared across all tabs at the same origin, so cross-tab magic link flows work correctly.
- **Status:** ✅ Fixed

<!-- Template for new bugs:

### BUG-XX: [Short title]
- **Scenario:** [Which scenario / org / user]
- **Steps to reproduce:**
  1. ...
  2. ...
- **Expected:** ...
- **Actual:** ...
- **Screenshot/Console:** [any error messages]
- **Severity:** critical | high | medium | low

-->
