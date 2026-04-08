# Auth Workflows & Login UI Implementation Plan

> **Feature**: RD-07 — Authentication Workflows & Login UI (login, consent, magic link, password reset, email, i18n, rate limiting)
> **Status**: Planning Complete
> **Created**: 2026-04-09
> **Source**: [RD-07](../../requirements/RD-07-auth-workflows-login-ui.md)
> **Depends On**: RD-02 (Database Schema), RD-03 (OIDC Core), RD-04 (Organizations), RD-06 (Users)

## Overview

Implement all user-facing authentication workflows for Porta v5. This is where users actually interact with the OIDC provider — logging in, consenting to scopes, resetting passwords, and accepting invitations. The implementation spans seven major subsystems:

1. **Token management** — Secure token generation, hashing, and verification for magic links, password resets, and invitations (shared infrastructure for all token-based flows)
2. **Rate limiting** — Redis-based per-action rate limiter with configurable windows and limits (protects all auth endpoints)
3. **Email service** — Pluggable SMTP transport via Nodemailer with Handlebars HTML/plaintext templates for magic links, password resets, invitations, welcome, and password-changed notifications
4. **i18n system** — i18next integration with filesystem backend, locale resolution chain (ui_locales → Accept-Language → org default → global default → en), and per-org translation overrides
5. **Template engine** — Handlebars-based server-rendered pages with layout/partials system, org-specific overrides, branding variables, and CSRF protection
6. **Interaction routes** — Koa route handlers for the OIDC interaction flow (login, consent, logout), magic link callback, password reset, and invitation acceptance
7. **Server integration** — Wire everything into the Koa app, OIDC provider configuration, and new npm dependencies

## Document Index

| #   | Document                                           | Description                                    |
| --- | -------------------------------------------------- | ---------------------------------------------- |
| 00  | [Index](00-index.md)                               | This document — overview and navigation        |
| 01  | [Requirements](01-requirements.md)                 | Feature requirements and scope                 |
| 02  | [Current State](02-current-state.md)               | Analysis of current implementation             |
| 03  | [Token & Rate Limit](03-token-and-rate-limit.md)   | Token management and rate limiting             |
| 04  | [Email Service](04-email-service.md)               | SMTP transport and email templates             |
| 05  | [i18n & Templates](05-i18n-and-templates.md)       | Internationalization and Handlebars templates   |
| 06  | [Interaction Routes](06-interaction-routes.md)      | Auth flow route handlers and CSRF              |
| 07  | [Testing Strategy](07-testing-strategy.md)         | Test cases and verification                    |
| 99  | [Execution Plan](99-execution-plan.md)             | Phases, sessions, and task checklist           |

## Quick Reference

### OIDC Interaction Flow

```
1. Client → /{org-slug}/auth?client_id=...&scope=...
2. node-oidc-provider → /interaction/{uid} (redirect)
3. Porta renders login page (GET /interaction/:uid)
4. User submits credentials (POST /interaction/:uid/login)
5. On success → provider.interactionFinished(req, res, { login: { accountId } })
6. Provider completes flow → redirects to client with auth code
```

### Key Decisions

| Decision                 | Outcome                                          |
| ------------------------ | ------------------------------------------------ |
| Template engine          | Handlebars (logic-less, pluggable)               |
| i18n library             | i18next (industry standard, namespace support)   |
| Email transport          | Nodemailer (SMTP, pluggable interface)           |
| Rate limiting            | Custom Redis (sliding window, per-action keys)   |
| CSRF protection          | Custom token-per-interaction (csurf deprecated)  |
| Token hashing            | SHA-256 (tokens are high-entropy random bytes)   |
| User enumeration         | Prevented (same response for existing/non-existing) |
| Auto-consent             | First-party apps skip consent page               |

## Related Files

### New Files
- `src/auth/tokens.ts` — Token generation, hashing, DB verification
- `src/auth/token-repository.ts` — PostgreSQL CRUD for magic_link/password_reset/invitation tokens
- `src/auth/rate-limiter.ts` — Redis sliding-window rate limiter
- `src/auth/email-transport.ts` — Pluggable email transport interface + SMTP implementation
- `src/auth/email-service.ts` — High-level email sender (magic link, reset, invite, welcome, password-changed)
- `src/auth/email-renderer.ts` — Handlebars email template renderer
- `src/auth/i18n.ts` — i18next setup, locale resolution, Handlebars `{{t}}` helper
- `src/auth/template-engine.ts` — Handlebars page renderer with layout/partials, org overrides, branding
- `src/auth/csrf.ts` — CSRF token generation and verification middleware
- `src/auth/index.ts` — Barrel export
- `src/routes/interactions.ts` — Login, consent, logout interaction handlers
- `src/routes/magic-link.ts` — Magic link callback handler
- `src/routes/password-reset.ts` — Forgot/reset password handlers
- `src/routes/invitation.ts` — Accept-invite handlers
- `templates/default/layouts/main.hbs` — Base HTML layout
- `templates/default/pages/*.hbs` — Login, consent, forgot-password, etc.
- `templates/default/emails/*.hbs` — Email HTML + plaintext templates
- `templates/default/partials/*.hbs` — Header, footer, flash messages
- `locales/default/en/*.json` — English translations (login, consent, errors, emails, etc.)

### Modified Files
- `src/server.ts` — Mount interaction routes, body parser for forms, static assets
- `src/oidc/provider.ts` — Update interactionUrl to real path
- `src/config/schema.ts` — Add any new env vars if needed
- `package.json` — Add handlebars, i18next, nodemailer dependencies

### Dependencies (New npm Packages)
- `handlebars` — Template engine
- `i18next` — Internationalization
- `i18next-fs-backend` — File system translation loader
- `nodemailer` — SMTP email transport
- `@types/nodemailer` — TypeScript types (dev)
- `@types/handlebars` — TypeScript types (dev, if needed)
