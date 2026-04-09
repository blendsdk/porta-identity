# Requirements: Auth Workflows & Login UI

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-07](../../requirements/RD-07-auth-workflows-login-ui.md)

## Feature Overview

Implement all authentication workflows, server-rendered interaction UI, email delivery, rate limiting, and i18n for Porta v5. This is the user-facing core — where users log in, consent, reset passwords, and accept invitations.

## Functional Requirements

### Must Have — Password Authentication

- [ ] Email + password login form on interaction page
- [ ] Password verification against Argon2id hash (via existing user service)
- [ ] Login failure handling with generic error (prevent user enumeration)
- [ ] Forgot password → email → reset password flow
- [ ] Reset tokens: single-use, SHA-256 hashed, expire per `system_config.password_reset_ttl` (default 1h)
- [ ] After password reset → redirect to login with success flash
- [ ] `login_hint` parameter pre-fills email field

### Must Have — Passwordless (Magic Link)

- [ ] "Send magic link" option on login page
- [ ] Magic link token: single-use, SHA-256 hashed, expire per `system_config.magic_link_ttl` (default 15 min)
- [ ] Clicking link → verify token → log user in → complete OIDC flow
- [ ] User enumeration prevention: always show "if account exists, email sent"
- [ ] After magic link login: email automatically marked as verified

### Must Have — Interaction Pages

- [ ] Login page (`/interaction/:uid`) with email/password + magic link option
- [ ] Consent page (`/interaction/:uid/consent`) with scope approval
- [ ] Auto-consent for first-party apps (same org → skip consent)
- [ ] Logout page with confirmation
- [ ] Error page with user-friendly messages
- [ ] All pages: Handlebars templates, org branding, i18n-aware

### Must Have — Email Delivery

- [ ] Pluggable email transport interface
- [ ] SMTP transport via Nodemailer (default)
- [ ] HTML + plaintext templates for: magic link, password reset, invitation, welcome, password-changed
- [ ] Emails include organization branding
- [ ] Emails are i18n-aware (user's locale)
- [ ] `SMTP_FROM` configurable (already in config schema)

### Must Have — Rate Limiting

- [ ] Redis-based sliding window rate limiter
- [ ] Rate limit: login attempts per IP + email (10 per 15 min default)
- [ ] Rate limit: magic link requests per email (5 per 15 min default)
- [ ] Rate limit: password reset requests per email (5 per 15 min default)
- [ ] All limits configurable via `system_config` table
- [ ] 429 response with `Retry-After` header

### Must Have — i18n

- [ ] i18next with filesystem backend
- [ ] `{{t "key"}}` Handlebars helper
- [ ] JSON translation files: `locales/default/{locale}/{namespace}.json`
- [ ] Locale resolution: ui_locales → Accept-Language → org default → global default → `en`
- [ ] Default English translations for all pages and emails
- [ ] Per-org translation overrides: `locales/{org-slug}/{locale}/{namespace}.json`

### Must Have — Template System

- [ ] Default templates in `templates/default/`
- [ ] Org-specific overrides: `templates/{org-slug}/`
- [ ] Template resolution: org-specific → default (fallback)
- [ ] Branding variables from organization config
- [ ] CSRF protection on all POST forms

### Must Have — Invitation Flow

- [ ] Accept-invite page: verify token → set initial password form
- [ ] Invitation tokens: single-use, expire per config (7 days default)
- [ ] On accept: set password, mark email verified, audit log
- [ ] Expired/invalid token → friendly error page

### Should Have (Lower Priority)

- [ ] "Remember me" option on login
- [ ] Password strength indicator on reset page
- [ ] `X-RateLimit-*` response headers
- [ ] Email delivery retry with backoff

### Won't Have (Out of Scope)

- Social login (Google, GitHub)
- Self-service registration
- Rich text email editor
- SMS-based OTP
- 2FA/MFA (covered by RD-12)

## Technical Requirements

### Performance
- Rate limiter: O(1) Redis operations (INCR + EXPIRE)
- Template rendering: compile-once, render-many (Handlebars precompilation)
- i18n: translations loaded once at startup, cached

### Security
- CSRF tokens per interaction session
- SHA-256 token hashing (random 32-byte tokens = high entropy)
- User enumeration prevention on all auth endpoints
- Rate limiting on all auth actions
- HttpOnly, SameSite=Lax cookies for interaction state

### Compatibility
- node-oidc-provider's `interactionDetails()` and `interactionFinished()` APIs
- Existing user service (password verification, login tracking, email verification)
- Existing organization branding fields and default_locale
- Existing system_config service for configurable TTLs and rate limits
- MailHog in Docker for local email testing

## Scope Decisions

| Decision           | Options Considered           | Chosen        | Rationale                                    |
| ------------------ | ---------------------------- | ------------- | -------------------------------------------- |
| Template engine    | EJS, Pug, Handlebars         | Handlebars    | Logic-less, pluggable, org overrides natural  |
| i18n library       | i18next, node-polyglot       | i18next       | Industry standard, fallback chains, namespaces |
| Email transport    | Nodemailer, SendGrid SDK     | Nodemailer    | Universal SMTP, pluggable interface           |
| Rate limiting      | express-rate-limit, custom   | Custom Redis  | Configurable per-action, uses existing Redis  |
| CSRF               | csurf, custom token          | Custom token  | csurf deprecated, simple to implement         |
| Token hashing      | bcrypt, SHA-256              | SHA-256       | Tokens are random (high entropy), fast lookup |
| User enumeration   | Reveal, prevent              | Prevent       | Security best practice                        |

## Acceptance Criteria

1. [ ] Password login flow end-to-end
2. [ ] Magic link login flow end-to-end
3. [ ] Forgot/reset password flow end-to-end
4. [ ] Login page renders with organization branding
5. [ ] i18n locale resolution chain works
6. [ ] `{{t "key"}}` helper works in all templates
7. [ ] Default English translations for all pages and emails
8. [ ] Org-specific template overrides work
9. [ ] Org-specific translation overrides work
10. [ ] Magic link email sent (verifiable via MailHog)
11. [ ] Password reset email sent
12. [ ] Tokens are single-use and expire correctly
13. [ ] Rate limiting blocks excessive attempts
14. [ ] Rate limits read from `system_config`
15. [ ] CSRF prevents cross-site form submission
16. [ ] User enumeration prevented
17. [ ] Auto-consent for first-party apps
18. [ ] All auth events audit-logged
19. [ ] `login_hint` pre-fills email
20. [ ] `ui_locales` drives language selection
21. [ ] HTML + plaintext email versions
22. [ ] Invitation flow: accept → set password → login
23. [ ] Invitation tokens single-use with expiry
24. [ ] All tests pass, no regressions
