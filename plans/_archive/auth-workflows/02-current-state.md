# Current State: Auth Workflows & Login UI

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

RD-01 through RD-06 are complete, providing a solid foundation for auth workflows:

**OIDC Provider (RD-03):**
- `src/oidc/provider.ts` — Creates configured Provider instance with placeholder `interactionUrl`
- `src/oidc/configuration.ts` — Full configuration builder with scopes, claims, TTLs, PKCE, refresh token rotation
- `src/oidc/account-finder.ts` — Upgraded in RD-06 to use real user service + claims builder
- Provider already supports `interactionDetails()` and `interactionFinished()` APIs
- Interaction URL currently returns `/interaction/${interaction.uid}` (placeholder — needs real implementation)

**User Management (RD-06):**
- `src/users/service.ts` — `verifyUserPassword()`, `recordLogin()`, `markEmailVerified()`, `getUserByEmail()`, `findUserForOidc()`
- `src/users/password.ts` — `validatePassword()`, `hashPassword()`, `verifyPassword()` (Argon2id)
- All status lifecycle transitions implemented (active, inactive, suspended, locked)
- User-by-email lookups always hit DB (not cached) — good for auth flows

**Organization Branding (RD-04):**
- `src/organizations/types.ts` — `Organization` has branding fields: `brandingLogoUrl`, `brandingFaviconUrl`, `brandingPrimaryColor`, `brandingCompanyName`, `brandingCustomCss`, `defaultLocale`
- Tenant resolver sets `ctx.state.organization` with full branding data

**System Config (RD-03):**
- `src/lib/system-config.ts` — `getSystemConfigNumber()`, `getSystemConfigString()`, `getSystemConfigBoolean()` with 60s cache
- Ready to store rate limit configs, TTLs for magic links, password resets, invitations

**Audit Log (RD-04):**
- `src/lib/audit-log.ts` — `writeAuditLog()` with fire-and-forget pattern
- Already used by user service — ready for auth events

**Config Schema:**
- `src/config/schema.ts` — Already has SMTP config: `smtp.host`, `smtp.port`, `smtp.user`, `smtp.pass`, `smtp.from`

**Database Schema (RD-02):**
- `migrations/005_users.sql` — Already has `magic_link_tokens`, `password_reset_tokens`, `invitation_tokens` tables
- All three tables: `id`, `user_id`, `token_hash` (SHA-256), `expires_at`, `used_at`, `created_at`
- Indexed on `token_hash WHERE used_at IS NULL` for fast lookup

**Docker Infrastructure:**
- `docker/docker-compose.yml` — Already has MailHog on port 1025 (SMTP) and 8025 (UI)

### Relevant Files

| File | Purpose | Changes Needed |
| --- | --- | --- |
| `src/oidc/provider.ts` | Provider factory | Update `interactionUrl` to real path |
| `src/oidc/configuration.ts` | Provider config | No changes (interaction URL injected) |
| `src/oidc/account-finder.ts` | Account lookup | No changes (already uses user service) |
| `src/users/service.ts` | User business logic | No changes (all auth APIs exist) |
| `src/users/password.ts` | Password utilities | No changes (hash/verify ready) |
| `src/organizations/types.ts` | Org branding types | No changes (branding fields exist) |
| `src/lib/system-config.ts` | Runtime config | No changes (typed getters ready) |
| `src/lib/audit-log.ts` | Audit logging | No changes (generic writer ready) |
| `src/config/schema.ts` | Env config | No changes (SMTP config exists) |
| `src/server.ts` | Koa app factory | Mount interaction + auth routes |
| `src/middleware/tenant-resolver.ts` | Tenant context | No changes (sets org on ctx.state) |
| `package.json` | Dependencies | Add handlebars, i18next, nodemailer |
| `migrations/005_users.sql` | Token tables | No changes (tables exist) |

## Gaps Identified

### Gap 1: Token Management

**Current:** Token tables exist in DB (magic_link_tokens, password_reset_tokens, invitation_tokens) but no TypeScript code to generate, hash, store, or verify tokens.
**Required:** Token generation (crypto.randomBytes), SHA-256 hashing, repository CRUD, and verification logic.
**Fix:** Create `src/auth/tokens.ts` and `src/auth/token-repository.ts`.

### Gap 2: Rate Limiting

**Current:** No rate limiting exists anywhere in the codebase.
**Required:** Redis-based sliding-window rate limiter with configurable limits from system_config.
**Fix:** Create `src/auth/rate-limiter.ts`.

### Gap 3: Email Delivery

**Current:** SMTP config exists in schema but no email sending code. Nodemailer not installed.
**Required:** Pluggable transport interface, SMTP implementation, template-based email rendering.
**Fix:** Install nodemailer, create `src/auth/email-transport.ts`, `src/auth/email-service.ts`, `src/auth/email-renderer.ts`.

### Gap 4: i18n System

**Current:** No internationalization exists. Organization has `defaultLocale` field but nothing uses it.
**Required:** i18next setup, locale resolution chain, Handlebars `{{t}}` helper, translation files.
**Fix:** Install i18next + i18next-fs-backend, create `src/auth/i18n.ts`, `locales/default/en/*.json`.

### Gap 5: Template Engine

**Current:** No server-rendered pages exist. No Handlebars installed.
**Required:** Handlebars page rendering with layouts, partials, org overrides, branding variables.
**Fix:** Install handlebars, create `src/auth/template-engine.ts`, `templates/default/**/*.hbs`.

### Gap 6: Interaction Routes

**Current:** OIDC provider redirects to `/interaction/{uid}` but no route handles it (404).
**Required:** Full set of Koa route handlers for login, consent, logout, magic link callback, password reset, invitation acceptance.
**Fix:** Create route files in `src/routes/` and mount them in `src/server.ts`.

### Gap 7: CSRF Protection

**Current:** No CSRF protection exists.
**Required:** Token-per-interaction CSRF protection for all POST forms.
**Fix:** Create `src/auth/csrf.ts` middleware.

## Dependencies

### Internal Dependencies (Already Complete)

| Module | Used For |
| --- | --- |
| `src/users/service.ts` | `verifyUserPassword`, `getUserByEmail`, `recordLogin`, `markEmailVerified`, `setUserPassword` |
| `src/users/password.ts` | `validatePassword`, `hashPassword` |
| `src/organizations/cache.ts` | Org branding lookup (via tenant resolver) |
| `src/lib/system-config.ts` | Rate limit configs, token TTLs |
| `src/lib/audit-log.ts` | Auth event logging |
| `src/lib/database.ts` | `getPool()` for token repository |
| `src/lib/redis.ts` | `getRedis()` for rate limiter |
| `src/config/index.ts` | SMTP config, issuer URL |
| `src/oidc/provider.ts` | `interactionDetails()`, `interactionFinished()` |

### External Dependencies (New — To Install)

| Package | Version | Purpose |
| --- | --- | --- |
| `handlebars` | ^4.7 | Template engine |
| `i18next` | ^23 | Internationalization |
| `i18next-fs-backend` | ^2 | File system translation loader |
| `nodemailer` | ^6 | SMTP email transport |
| `@types/nodemailer` | ^6 (dev) | TypeScript types |

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| node-oidc-provider interaction API changes | Low | High | Pin oidc-provider version, test interaction flow |
| Handlebars compilation performance | Low | Low | Pre-compile templates at startup, cache |
| i18next memory usage with many locales | Low | Low | Only load requested locales, lazy loading |
| Email delivery failures | Medium | Medium | Fire-and-forget + audit log (retry in future) |
| Rate limit Redis failures | Low | Medium | Graceful degradation — allow request if Redis unavailable |
| Large template/locale file count | Low | Low | Well-organized directory structure, clear naming |
