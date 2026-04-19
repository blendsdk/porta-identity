# RD-07: Authentication Workflows & Login UI

> **Document**: RD-07-auth-workflows-login-ui.md
> **Status**: Draft
> **Created**: 2026-04-08
> **Project**: Porta v5 — OIDC Provider
> **Depends On**: RD-02 (Database Schema), RD-03 (OIDC Core), RD-04 (Organizations), RD-06 (Users)

---

## Feature Overview

Implement all authentication workflows, the server-rendered interaction UI (login, consent, logout pages), the email delivery system, rate limiting, and the internationalization (i18n) system. This is the user-facing core of the OIDC provider — where users actually log in.

### Authentication Methods

1. **Password-based**: Email + password login with forgot/reset password flow
2. **Passwordless (Magic Link)**: Email-based one-time login link

### Interaction Pages

Server-rendered Handlebars pages shown during OIDC flows:
- Login page (email/password + magic link option)
- Magic link sent confirmation
- Magic link callback (token verification)
- Consent page (approve/deny scope access)
- Forgot password page
- Reset password page
- Logout confirmation page
- Error page

---

## Functional Requirements

### Must Have — Password Authentication

- [ ] Email + password login form
- [ ] Password verification against user's Argon2id hash
- [ ] Login failure handling (invalid credentials error message)
- [ ] Forgot password: email input → sends reset link via email
- [ ] Reset password: token verification → new password form → password update
- [ ] Reset token: single-use, expires per `system_config.password_reset_ttl` (default 1 hour)
- [ ] Reset token stored as SHA-256 hash in `password_reset_tokens` table
- [ ] After password reset: redirect to login with success message
- [ ] `login_hint` parameter pre-fills email field

### Must Have — Passwordless (Magic Link)

- [ ] "Send magic link" button/option on login page
- [ ] Email input → generates magic link token → sends email with link
- [ ] Magic link token: single-use, expires per `system_config.magic_link_ttl` (default 15 min)
- [ ] Token stored as SHA-256 hash in `magic_link_tokens` table
- [ ] Clicking link → verifies token → logs user in → completes OIDC flow
- [ ] If user doesn't exist and magic link is requested → show generic "if account exists, email sent" message (prevent user enumeration)
- [ ] After magic link login: email is automatically marked as verified

### Must Have — Interaction Pages

- [ ] Login page (`/interaction/:uid`) with email/password form and magic link option
- [ ] Consent page (`/interaction/:uid/consent`) with scope approval
- [ ] Auto-consent for first-party applications (skip consent page)
- [ ] Logout page (`/interaction/:uid/logout`) with confirmation
- [ ] Error page with user-friendly error messages
- [ ] All pages use Handlebars templates
- [ ] All pages use organization branding (logo, colors, company name)
- [ ] All pages are i18n-aware (translated via `{{t}}` helper)

### Must Have — Email Delivery

- [ ] Pluggable email transport interface
- [ ] SMTP transport via Nodemailer (default)
- [ ] HTML email templates (Handlebars) for:
  - Magic link email
  - Password reset email
  - Invitation email ("You've been invited — set up your account" with set-password link)
  - Welcome email (for passwordless users — explains how to use magic link)
  - Password changed confirmation email
- [ ] Emails include organization branding
- [ ] Emails are i18n-aware (translated based on user's locale)
- [ ] `SMTP_FROM` configurable per organization or fallback to global

### Must Have — Rate Limiting

- [ ] Redis-based rate limiting
- [ ] Rate limit on login attempts per IP + email combination
- [ ] Rate limit on magic link requests per email
- [ ] Rate limit on password reset requests per email
- [ ] All rate limit values configurable via `system_config` table
- [ ] Rate limit exceeded → 429 Too Many Requests with `Retry-After` header
- [ ] Rate limit window and max attempts:
  - Login: default 10 attempts per 15 minutes (configurable)
  - Magic link: default 5 requests per 15 minutes (configurable)
  - Password reset: default 5 requests per 15 minutes (configurable)

### Must Have — i18n (Internationalization)

- [ ] `i18next` integration with filesystem backend
- [ ] Handlebars `{{t "key"}}` helper for translations in templates
- [ ] JSON translation files organized by locale and namespace
- [ ] Language resolution chain:
  1. `ui_locales` parameter from OIDC authorization request
  2. `Accept-Language` header from browser
  3. Organization `default_locale` from database
  4. Global `default_locale` from `system_config` table
  5. Hardcoded fallback: `en`
- [ ] Default English translations for all pages and emails
- [ ] Translation file override per organization (custom translations directory)

### Must Have — Pluggable Template System

- [ ] Default templates in `/templates/default/`
- [ ] Organization-specific template override: `/templates/{org-slug}/`
- [ ] Template resolution: org-specific → default (fallback)
- [ ] Templates receive branding variables from organization config
- [ ] Templates are hot-reloadable in development

### Should Have

- [ ] "Remember me" / session extension option on login page
- [ ] Login page shows which auth methods are available per-org
- [ ] Password strength indicator on reset password page
- [ ] Email delivery retry with exponential backoff (queue-based)
- [ ] Email delivery status tracking (sent, delivered, bounced)
- [ ] Rate limit information in response headers (`X-RateLimit-*`)

### Won't Have (Out of Scope)

- Social login buttons (Google, GitHub, etc.)
- Self-service registration page
- Rich text email editor
- SMS-based OTP

> **Note**: 2FA/MFA flows (Email OTP + TOTP authenticator) are defined in [RD-12](RD-12-two-factor-authentication.md). The 2FA challenge step is inserted between password verification and `interactionFinished()` in the login flow.

---

## Technical Requirements

### Interaction Flow — node-oidc-provider Integration

`node-oidc-provider` handles the OIDC protocol. When user interaction is needed (login, consent), it redirects to our interaction endpoints:

```
OIDC Flow with Interactions:

1. Client redirects user to: /{org-slug}/auth?client_id=...&redirect_uri=...&scope=...
2. node-oidc-provider creates an Interaction and redirects to: /interaction/{uid}
3. Our Koa routes handle /interaction/{uid}:
   a. GET  /interaction/:uid           → Render login page
   b. POST /interaction/:uid/login     → Process login form
   c. POST /interaction/:uid/magic     → Send magic link
   d. GET  /interaction/:uid/consent   → Render consent page
   e. POST /interaction/:uid/confirm   → Process consent
   f. GET  /interaction/:uid/abort     → Abort interaction
4. After successful login: call provider.interactionFinished(req, res, result)
5. Provider completes the OIDC flow (issues code, redirects to client)
```

### Interaction Routes

```typescript
// Route definitions
router.get('/interaction/:uid', interactionController.showLogin);
router.post('/interaction/:uid/login', interactionController.processLogin);
router.post('/interaction/:uid/magic-link', interactionController.sendMagicLink);
router.get('/interaction/:uid/consent', interactionController.showConsent);
router.post('/interaction/:uid/confirm', interactionController.processConsent);
router.get('/interaction/:uid/abort', interactionController.abortInteraction);

// Magic link callback (outside interaction context)
router.get('/:orgSlug/auth/magic-link/:token', magicLinkController.verifyMagicLink);

// Forgot/reset password (outside interaction context)
router.get('/:orgSlug/auth/forgot-password', passwordController.showForgotPassword);
router.post('/:orgSlug/auth/forgot-password', passwordController.processForgotPassword);
router.get('/:orgSlug/auth/reset-password/:token', passwordController.showResetPassword);
router.post('/:orgSlug/auth/reset-password/:token', passwordController.processResetPassword);

// Accept invitation (set initial password)
router.get('/:orgSlug/auth/accept-invite/:token', invitationController.showAcceptInvite);
router.post('/:orgSlug/auth/accept-invite/:token', invitationController.processAcceptInvite);
```

### Accept Invitation Flow

```
1. Admin creates user via CLI → invitation email sent with link
2. User clicks: /{org-slug}/auth/accept-invite/{token}
3. GET handler:
   a. Verify token hash exists in invitation_tokens, not expired, not used
   b. If invalid/expired → show error with "Request new invitation" message
   c. If valid → show "Set up your account" page (password + confirm password form)
4. User submits password:
   a. Validate password (min 8 chars, must match confirm)
   b. Hash with Argon2id
   c. Update user.password_hash
   d. Mark user.email_verified = true
   e. Mark invitation token as used (set used_at)
   f. Audit log: "user.invite.accepted"
   g. Redirect to login with "Account set up successfully. Please sign in."
```

### Login Flow (Password)

```
1. User enters email + password on login page
2. Rate limit check (IP + email)
3. Look up user by org_id + email
4. If user not found → generic error "Invalid email or password"
5. If user status ≠ 'active' → error based on status
6. Verify password (Argon2id)
7. If wrong → increment fail counter, return error
8. If correct:
   a. Record login (last_login_at, login_count)
   b. Audit log: "user.login.success"
   c. Call provider.interactionFinished(req, res, {
        login: { accountId: user.id },
      })
   d. Provider issues authorization code and redirects to client
```

### Login Flow (Magic Link)

```
1. User enters email on login page, clicks "Send magic link"
2. Rate limit check (email)
3. Look up user by org_id + email
4. If user not found → still show "Check your email" (prevent enumeration)
5. If user found and status = 'active':
   a. Generate random token (32 bytes, base64url)
   b. Hash token (SHA-256) and store in magic_link_tokens table
   c. Build magic link URL: /{org-slug}/auth/magic-link/{token}?interaction={uid}
   d. Send email via email service
   e. Audit log: "user.magic_link.sent"
6. Show "Check your email for a login link" page
7. User clicks link in email:
   a. Verify token hash exists, not expired, not used
   b. Mark token as used (set used_at)
   c. Mark email as verified
   d. Record login
   e. Audit log: "user.login.magic_link"
   f. Resume OIDC interaction: provider.interactionFinished(...)
```

### Forgot Password Flow

```
1. User clicks "Forgot password" on login page
2. Redirected to /{org-slug}/auth/forgot-password
3. User enters email
4. Rate limit check (email)
5. Look up user by org_id + email
6. If user not found → still show "Check your email" (prevent enumeration)
7. If user found:
   a. Generate random token (32 bytes, base64url)
   b. Hash token (SHA-256) and store in password_reset_tokens table
   c. Build reset URL: /{org-slug}/auth/reset-password/{token}
   d. Send email via email service
   e. Audit log: "user.password_reset.requested"
8. Show "Check your email for reset instructions" page
9. User clicks link in email:
   a. Verify token hash exists, not expired, not used
   b. Show new password form
10. User submits new password:
    a. Validate password (min 8 chars)
    b. Hash with Argon2id
    c. Update user.password_hash
    d. Mark token as used
    e. Invalidate all existing sessions for this user
    f. Audit log: "user.password.reset"
    g. Redirect to login page with "Password reset successful" message
```

### Consent Flow

```
1. After login, if consent is required:
   a. node-oidc-provider redirects to consent page
   b. Show requested scopes to user
2. Auto-consent for first-party apps:
   a. If client belongs to the same org → auto-approve
   b. Skip consent page entirely
3. User approves or denies:
   a. Approve → provider.interactionFinished(req, res, { consent: { grantId } })
   b. Deny → provider.interactionFinished(req, res, { error: 'access_denied' })
```

### Template System

#### Directory Structure

```
templates/
├── default/                           # Ships with Porta
│   ├── layouts/
│   │   └── main.hbs                   # Base layout (HTML shell, branding vars)
│   ├── pages/
│   │   ├── login.hbs                  # Login form
│   │   ├── magic-link-sent.hbs        # "Check your email" page
│   │   ├── consent.hbs                # Consent/approval page
│   │   ├── forgot-password.hbs        # Forgot password form
│   │   ├── reset-password.hbs         # New password form
│   │   ├── reset-success.hbs          # Password reset success
│   │   ├── accept-invite.hbs          # Set initial password (from invitation)
│   │   ├── invite-success.hbs         # Account setup success
│   │   ├── invite-expired.hbs         # Invitation link expired/invalid
│   │   ├── logout.hbs                 # Logout confirmation
│   │   └── error.hbs                  # Error page
│   ├── emails/
│   │   ├── magic-link.hbs             # Magic link email (HTML)
│   │   ├── magic-link.txt.hbs         # Magic link email (plaintext)
│   │   ├── password-reset.hbs         # Password reset email (HTML)
│   │   ├── password-reset.txt.hbs     # Password reset email (plaintext)
│   │   ├── invitation.hbs             # Invitation email (HTML)
│   │   ├── invitation.txt.hbs         # Invitation email (plaintext)
│   │   ├── welcome.hbs                # Welcome email (HTML)
│   │   ├── welcome.txt.hbs            # Welcome email (plaintext)
│   │   ├── password-changed.hbs       # Password changed confirmation (HTML)
│   │   └── password-changed.txt.hbs   # Password changed confirmation (plaintext)
│   └── partials/
│       ├── header.hbs                 # Page header with branding
│       ├── footer.hbs                 # Page footer
│       └── flash-messages.hbs         # Success/error flash messages
└── {org-slug}/                        # Optional per-org overrides
    ├── pages/
    │   └── login.hbs                  # Custom login page for this org
    └── emails/
        └── magic-link.hbs            # Custom magic link email
```

#### Template Variables

All templates receive:

```typescript
interface TemplateContext {
  // Branding (from organization)
  branding: {
    logoUrl: string | null;
    faviconUrl: string | null;
    primaryColor: string;         // Default: "#3B82F6"
    companyName: string;
    customCss: string | null;
  };

  // i18n
  locale: string;                  // Resolved locale
  t: (key: string, options?: object) => string;  // Translation function

  // Interaction-specific (when in OIDC flow)
  interaction?: {
    uid: string;
    prompt: string;                // "login" | "consent"
    params: {
      client_id: string;
      redirect_uri: string;
      scope: string;
      state: string;
      login_hint?: string;
    };
    client: {
      clientName: string;
    };
  };

  // Flash messages
  flash?: {
    success?: string;
    error?: string;
    info?: string;
  };

  // CSRF protection
  csrfToken: string;

  // Organization
  orgSlug: string;
}
```

#### Template Resolution

```typescript
async function resolveTemplate(orgSlug: string, category: string, name: string): Promise<string> {
  // 1. Try org-specific template
  const orgPath = `templates/${orgSlug}/${category}/${name}.hbs`;
  if (await fileExists(orgPath)) return orgPath;

  // 2. Fall back to default
  const defaultPath = `templates/default/${category}/${name}.hbs`;
  return defaultPath;
}
```

### i18n System

#### Translation File Structure

```
locales/
├── default/                           # Ships with Porta
│   ├── en/
│   │   ├── login.json                 # Login page translations
│   │   ├── consent.json               # Consent page translations
│   │   ├── forgot-password.json       # Forgot password translations
│   │   ├── reset-password.json        # Reset password translations
│   │   ├── magic-link.json            # Magic link translations
│   │   ├── logout.json                # Logout translations
│   │   ├── errors.json                # Error messages
│   │   ├── emails.json                # Email subject lines and content
│   │   └── common.json                # Shared translations
│   ├── nl/
│   │   ├── login.json
│   │   └── ...
│   └── de/
│       └── ...
└── {org-slug}/                        # Optional per-org translation overrides
    └── en/
        └── login.json                 # Override specific keys
```

#### Example Translation File

```json
// locales/default/en/login.json
{
  "title": "Sign In",
  "subtitle": "Sign in to your account",
  "email_label": "Email Address",
  "email_placeholder": "name@example.com",
  "password_label": "Password",
  "password_placeholder": "Enter your password",
  "submit": "Sign In",
  "magic_link_option": "Sign in with a magic link instead",
  "forgot_password": "Forgot your password?",
  "send_magic_link": "Send Magic Link",
  "magic_link_description": "We'll send you a link to sign in without a password.",
  "error_invalid_credentials": "Invalid email or password.",
  "error_account_locked": "Your account has been locked. Please contact your administrator.",
  "error_account_suspended": "Your account has been suspended. Please contact your administrator.",
  "error_rate_limited": "Too many attempts. Please try again in {{minutes}} minutes."
}
```

#### Language Resolution

```typescript
async function resolveLocale(ctx: KoaContext): Promise<string> {
  // 1. ui_locales from OIDC request (highest priority)
  const interaction = await provider.interactionDetails(ctx.req, ctx.res);
  const uiLocales = interaction?.params?.ui_locales;
  if (uiLocales) {
    const requested = uiLocales.split(' ')[0]; // First preferred locale
    if (await localeExists(requested)) return requested;
  }

  // 2. Accept-Language header
  const acceptLanguage = ctx.get('Accept-Language');
  if (acceptLanguage) {
    const parsed = parseAcceptLanguage(acceptLanguage);
    for (const lang of parsed) {
      if (await localeExists(lang)) return lang;
    }
  }

  // 3. Organization default locale
  const org = ctx.state.organization;
  if (org?.defaultLocale && await localeExists(org.defaultLocale)) {
    return org.defaultLocale;
  }

  // 4. Global default from system_config
  const globalDefault = await configService.get('default_locale', 'en');
  if (await localeExists(globalDefault)) return globalDefault;

  // 5. Hardcoded fallback
  return 'en';
}
```

#### Translation Override Resolution

```typescript
async function loadTranslations(orgSlug: string, locale: string, namespace: string): Promise<object> {
  const translations = {};

  // 1. Load default translations (always)
  const defaultPath = `locales/default/${locale}/${namespace}.json`;
  Object.assign(translations, await loadJson(defaultPath));

  // 2. Merge org-specific overrides (if they exist)
  const orgPath = `locales/${orgSlug}/${locale}/${namespace}.json`;
  if (await fileExists(orgPath)) {
    Object.assign(translations, await loadJson(orgPath));
  }

  return translations;
}
```

### Email Service

#### Pluggable Transport Interface

```typescript
interface EmailTransport {
  send(options: SendEmailOptions): Promise<EmailResult>;
}

interface SendEmailOptions {
  to: string;
  from?: string;                    // Falls back to org config or global SMTP_FROM
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

interface EmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}
```

#### SMTP Transport (Default)

```typescript
class SmtpTransport implements EmailTransport {
  private transporter: nodemailer.Transporter;

  constructor(config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });
  }

  async send(options: SendEmailOptions): Promise<EmailResult> {
    return this.transporter.sendMail(options);
  }
}
```

#### Email Service

```typescript
interface EmailService {
  sendMagicLink(user: User, org: Organization, magicLinkUrl: string, locale: string): Promise<void>;
  sendPasswordReset(user: User, org: Organization, resetUrl: string, locale: string): Promise<void>;
  sendInvitation(user: User, org: Organization, inviteUrl: string, locale: string): Promise<void>;
  sendWelcome(user: User, org: Organization, locale: string): Promise<void>;
  sendPasswordChanged(user: User, org: Organization, locale: string): Promise<void>;
}
```

### Rate Limiting

#### Redis-Based Rate Limiter

```typescript
interface RateLimiter {
  check(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;                    // When the window resets
  retryAfter: number;              // Seconds until next attempt allowed
}
```

#### Rate Limit Keys

```
Login attempts:      ratelimit:login:{org_id}:{ip}:{email_hash}
Magic link requests: ratelimit:magic:{org_id}:{email_hash}
Password reset:      ratelimit:reset:{org_id}:{email_hash}
```

#### Rate Limit Configuration (from system_config)

| Config Key | Default | Description |
|-----------|---------|-------------|
| `rate_limit_login_max` | 10 | Max login attempts per window |
| `rate_limit_login_window` | 900 | Login window in seconds (15 min) |
| `rate_limit_magic_link_max` | 5 | Max magic link requests per window |
| `rate_limit_magic_link_window` | 900 | Magic link window in seconds |
| `rate_limit_password_reset_max` | 5 | Max password reset requests per window |
| `rate_limit_password_reset_window` | 900 | Password reset window in seconds |

### Token Generation & Verification

```typescript
// Token generation (used for both magic links and password resets)
function generateToken(): { plaintext: string; hash: string } {
  const plaintext = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
  return { plaintext, hash };
}

// Token verification
async function verifyToken(table: string, tokenPlaintext: string): Promise<TokenRecord | null> {
  const hash = crypto.createHash('sha256').update(tokenPlaintext).digest('hex');
  const record = await db.query(
    `SELECT * FROM ${table} WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [hash]
  );
  return record.rows[0] || null;
}
```

### CSRF Protection

All interaction forms must include CSRF protection:

```typescript
// Middleware: generate CSRF token per interaction
function csrfProtection(ctx: KoaContext, next: Next): Promise<void> {
  if (ctx.method === 'GET') {
    ctx.state.csrfToken = crypto.randomBytes(32).toString('hex');
    // Store in session/cookie
  } else if (ctx.method === 'POST') {
    const token = ctx.request.body._csrf;
    // Verify against stored token
  }
}
```

### Audit Events

| Event | Event Type | Category |
|-------|-----------|----------|
| Login success (password) | `user.login.password` | `authentication` |
| Login failure (password) | `user.login.password.failed` | `security` |
| Login success (magic link) | `user.login.magic_link` | `authentication` |
| Magic link sent | `user.magic_link.sent` | `authentication` |
| Magic link failed (invalid/expired) | `user.magic_link.failed` | `security` |
| Password reset requested | `user.password_reset.requested` | `security` |
| Password reset completed | `user.password_reset.completed` | `security` |
| Password reset failed (invalid token) | `user.password_reset.failed` | `security` |
| Consent granted | `user.consent.granted` | `authentication` |
| Consent denied | `user.consent.denied` | `authentication` |
| Logout | `user.logout` | `authentication` |
| Rate limit exceeded (login) | `rate_limit.login` | `security` |
| Rate limit exceeded (magic link) | `rate_limit.magic_link` | `security` |
| Rate limit exceeded (password reset) | `rate_limit.password_reset` | `security` |
| Invitation sent | `user.invited` | `admin` |
| Invitation accepted | `user.invite.accepted` | `authentication` |
| Invitation expired (unused) | `user.invite.expired` | `admin` |
| Invitation re-sent | `user.invite.resent` | `admin` |

---

## Integration Points

### With RD-03 (OIDC Core)
- `provider.interactionDetails()` reads current interaction state
- `provider.interactionFinished()` completes login/consent
- Interaction URL configured in provider

### With RD-04 (Organizations)
- Branding loaded from organization for template rendering
- Default locale from organization for i18n fallback
- Org slug used for template/translation override paths

### With RD-06 (Users)
- UserService for password verification and login tracking
- User lookup by org + email
- Email verification marking

### With RD-09 (CLI)
- CLI can trigger password reset emails
- CLI can manage rate limit configurations

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Template engine | EJS, Pug, Handlebars, Nunjucks | Handlebars | Simple, pluggable, logic-less (separation of concerns) |
| i18n library | i18next, node-polyglot, formatjs | i18next | Industry standard, fallback chains, namespace support |
| Email transport | Nodemailer, SendGrid SDK, SES SDK | Nodemailer (pluggable) | Universal (SMTP), pluggable interface for future transports |
| Rate limiting | Express-rate-limit, custom Redis | Custom Redis | Configurable per-route, per-action, uses existing Redis |
| CSRF protection | csurf, custom token | Custom token | csurf is deprecated, simple to implement |
| Token hashing | Plaintext, bcrypt, SHA-256 | SHA-256 | Tokens are random (high entropy), SHA-256 is sufficient and fast |
| User enumeration | Reveal, prevent | Prevent | Security best practice — same response whether user exists or not |

---

## Acceptance Criteria

1. [ ] Password login flow completes successfully end-to-end
2. [ ] Magic link login flow completes successfully end-to-end
3. [ ] Forgot password → reset password flow works end-to-end
4. [ ] Login page renders with organization branding
5. [ ] Login page respects i18n locale resolution chain
6. [ ] `{{t "key"}}` helper works in all templates
7. [ ] Default English translations exist for all pages and emails
8. [ ] Organization-specific template overrides work
9. [ ] Organization-specific translation overrides work
10. [ ] Magic link email is sent and received (verified via MailHog)
11. [ ] Password reset email is sent and received
12. [ ] Magic link tokens are single-use and expire correctly
13. [ ] Password reset tokens are single-use and expire correctly
14. [ ] Rate limiting blocks excessive login attempts
15. [ ] Rate limiting blocks excessive magic link requests
16. [ ] Rate limiting blocks excessive password reset requests
17. [ ] Rate limit values are read from `system_config` table
18. [ ] CSRF protection prevents cross-site form submission
19. [ ] User enumeration is prevented (same response for existing/non-existing email)
20. [ ] Consent page shows for third-party apps, auto-consents for first-party
21. [ ] All auth events are audit-logged
22. [ ] `login_hint` pre-fills email on login page
23. [ ] `ui_locales` parameter drives language selection
24. [ ] Emails include both HTML and plaintext versions
25. [ ] Invitation email is sent when admin creates user (default behavior)
26. [ ] Accept-invite page allows user to set initial password
27. [ ] Invitation tokens are single-use and expire per config (7 days default)
28. [ ] Expired/invalid invitation token shows friendly error page

---

## Addendum: Configurable Login Methods (2026-04-19)

**Implementation plan:** [`plans/client-login-methods/99-execution-plan.md`](../plans/client-login-methods/99-execution-plan.md)

This addendum extends RD-07 with an explicit contract for **per-tenant +
per-client login method configuration**. It does **not** replace any of the
existing acceptance criteria — it layers a new configuration dimension on top.

### Motivation

Historically every organization on Porta exposed both password-based login
**and** passwordless magic-link login on every client. Tenants increasingly
need to restrict which methods are available — e.g., password-only for
regulated internal tools, magic-link-only for consumer-facing kiosks, or a
bespoke combination per application.

### Data Model

- `organizations.default_login_methods` — `NOT NULL TEXT[]` with DB DEFAULT
  `ARRAY['password', 'magic_link']`. Every org always has a concrete default.
- `clients.login_methods` — nullable `TEXT[]` where:
  - `NULL` (the DB default) = **inherit** from the owning organization.
  - Non-null array = **override** the org default with the listed methods.
- Allowed values (union `LoginMethod`): `'password' | 'magic_link'`.
  Empty arrays are rejected at the service layer.

### Resolution Rule

The helper `resolveLoginMethods(org, client)` in `src/clients/resolve-login-methods.ts`
is the single source of truth:

```text
client.loginMethods is non-null AND non-empty  →  return client.loginMethods
otherwise                                       →  return org.defaultLoginMethods
```

The resolver is a pure function — used consistently by the OIDC interaction
layer, the admin API, and the CLI to project effective methods.

### Enforcement Points

Enforcement runs **before** CSRF verification, rate-limiting, and user lookup
so disabled methods cannot leak identity information or consume rate-limit
budget. All enforcement sites emit a `security.login_method_disabled` audit
event and return HTTP 403 with the localized `errors.login_method_disabled`
message.

| Location                                           | Blocked When                                |
| -------------------------------------------------- | ------------------------------------------- |
| `POST /interaction/:uid/login`                     | `password` not in effective methods         |
| `POST /interaction/:uid/magic-link`                | `magic_link` not in effective methods       |
| `GET  /:orgSlug/auth/forgot-password`              | `password` not in org default methods       |
| `POST /:orgSlug/auth/forgot-password`              | `password` not in org default methods       |
| `POST /:orgSlug/auth/reset-password/:token`        | `password` not in org default methods       |

`forgot-password` / `reset-password` routes cannot know which client the user
started from (the URL has no `client_id`), so they enforce against the
organization default only — equivalent to `resolveLoginMethods(org, { loginMethods: null })`.

### Template Behavior

`templates/default/pages/login.hbs` renders four distinct modes:

| Effective Methods         | UI Surface                                                    |
| ------------------------- | ------------------------------------------------------------- |
| `[password, magic_link]`  | Password form + divider + magic-link form + JS email-copy     |
| `[password]`              | Password form only (no divider, no magic-link form)           |
| `[magic_link]`            | Standalone magic-link form with its own email input           |
| `[]` (defensive)          | Fallback alert using `errors.no_login_methods_configured`     |

The "Forgot password?" link is wrapped in `{{#if showPassword}}` so it is
hidden when password-based login is disabled. The OIDC `login_hint` query
parameter is trimmed and capped at 320 characters (RFC 5321 max) before being
piped into `{{emailHint}}` on both email inputs.

### Admin API Surface

- `POST /api/admin/organizations`, `PATCH /api/admin/organizations/:id` —
  accept `defaultLoginMethods: LoginMethod[]` (min length 1).
- `POST /api/admin/clients`, `PATCH /api/admin/clients/:id` — accept
  `loginMethods: LoginMethod[] | null` (three-state semantics: omit = leave
  alone, `null` = clear override / inherit, array = set override).
- GET responses on `/api/admin/clients/*` include an additional
  `effectiveLoginMethods: LoginMethod[]` field (server-resolved) so API
  consumers never have to replicate the inheritance rule client-side.

### CLI Surface

- `porta org create|update --login-methods password,magic_link`
- `porta client create|update --login-methods password` (or `magic_link,password`)
- `porta client create|update --login-methods inherit` — clears the client
  override back to the org default.
- `porta org show` displays a `Default Login Methods` row.
- `porta client show` displays two rows: `Login Methods (raw)` (renders
  `inherit` when `null`) and `Effective Login Methods` (resolved).

Invalid `--login-methods` input fails fast **before** opening DB/Redis
connections via `parseLoginMethodsFlag` in `src/cli/parsers.ts`.

### Audit Events

- `organization.updated` / `client.updated` — capture
  `previousDefaultLoginMethods → newDefaultLoginMethods` or
  `previousLoginMethods → newLoginMethods` when the field changes.
- `security.login_method_disabled` — written on every 403 from the
  enforcement layer. Metadata includes the attempted method, the effective
  methods, and the organization + client IDs.

### Additional Acceptance Criteria

29. [x] `organizations.default_login_methods` column exists, NOT NULL, defaults to `['password', 'magic_link']`
30. [x] `clients.login_methods` column exists, nullable (`NULL` = inherit)
31. [x] `resolveLoginMethods(org, client)` returns the effective methods array
32. [x] Login UI renders correctly in all four modes (both / password-only / magic-link-only / fallback)
33. [x] `POST /login` returns 403 when `password` is not in effective methods
34. [x] `POST /magic-link` returns 403 when `magic_link` is not in effective methods
35. [x] Forgot-password (GET + POST) + reset-password (POST) return 403 when the org default disables `password`
36. [x] Enforcement runs **before** CSRF, rate-limit, and user lookup (verified via pentest suite)
37. [x] Enforcement writes a `security.login_method_disabled` audit event
38. [x] Response body for 403 does not leak the internal method name
39. [x] `login_hint` is sanitized (length-capped, HTML-escaped) before templating
40. [x] Admin API `defaultLoginMethods` rejects empty arrays and unknown methods
41. [x] Admin API `loginMethods` supports the three states: omit / `null` / array
42. [x] GET responses include a server-computed `effectiveLoginMethods` field on clients
43. [x] `porta org` and `porta client` CLIs accept `--login-methods` with validation before bootstrap
44. [x] `porta client` accepts the `inherit` sentinel to clear an override
45. [x] E2E scenarios verify all six enforcement cases end-to-end
46. [x] Pentest scenarios verify no bypass via CSRF-less requests, enumeration deltas, mass-assignment, or `login_hint` XSS
47. [x] Playwright UI scenarios verify the login page renders correctly in all three visible modes

