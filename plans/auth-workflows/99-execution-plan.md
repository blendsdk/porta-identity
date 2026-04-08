# Execution Plan: Auth Workflows & Login UI

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-09 00:19
> **Progress**: 0/50 tasks (0%)

## Overview

Implement all authentication workflows, server-rendered interaction UI, email delivery, rate limiting, and i18n for Porta v5. This covers the user-facing core of the OIDC provider.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                          | Sessions | Est. Time |
| ----- | ------------------------------ | -------- | --------- |
| 1     | Dependencies & Token Infra     | 1        | 45 min    |
| 2     | Rate Limiter                   | 1        | 30 min    |
| 3     | Email Transport & Renderer     | 1-2      | 60 min    |
| 4     | i18n & Template Engine         | 1-2      | 60 min    |
| 5     | Templates & Translations       | 1        | 45 min    |
| 6     | Interaction Routes (Login)     | 1-2      | 60 min    |
| 7     | Auth Routes (Magic Link, Reset, Invite) | 1-2 | 60 min |
| 8     | Server Integration             | 1        | 30 min    |
| 9     | Test: Tokens & Rate Limiter    | 1        | 45 min    |
| 10    | Test: Email Service            | 1        | 45 min    |
| 11    | Test: i18n & Templates         | 1        | 45 min    |
| 12    | Test: Interaction Routes       | 1-2      | 60 min    |
| 13    | Test: Auth Routes              | 1-2      | 60 min    |

**Total: 13-17 sessions, ~10-11 hours**

---

## Phase 1: Dependencies & Token Infrastructure

### Session 1.1: Install Dependencies, Token Utils, Token Repository

**Reference**: [03-token-and-rate-limit.md](03-token-and-rate-limit.md)
**Objective**: Install npm packages and create the token management foundation.

**Tasks**:

| #     | Task                                                | File                          |
| ----- | --------------------------------------------------- | ----------------------------- |
| 1.1.1 | Install handlebars, i18next, i18next-fs-backend, nodemailer, @types/nodemailer | `package.json` |
| 1.1.2 | Create generateToken, hashToken utilities            | `src/auth/tokens.ts`          |
| 1.1.3 | Create token repository (insert, find, markUsed, invalidate, cleanup) | `src/auth/token-repository.ts` |
| 1.1.4 | Create CSRF token generation and verification        | `src/auth/csrf.ts`            |

**Deliverables**:
- [ ] Dependencies installed
- [ ] `src/auth/tokens.ts` with generateToken, hashToken
- [ ] `src/auth/token-repository.ts` with CRUD for all 3 token tables
- [ ] `src/auth/csrf.ts` with generate/verify
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 2: Rate Limiter

### Session 2.1: Redis Rate Limiter

**Reference**: [03-token-and-rate-limit.md](03-token-and-rate-limit.md)
**Objective**: Create the Redis-based sliding window rate limiter.

**Tasks**:

| #     | Task                                             | File                          |
| ----- | ------------------------------------------------ | ----------------------------- |
| 2.1.1 | Create checkRateLimit with INCR + EXPIRE         | `src/auth/rate-limiter.ts`    |
| 2.1.2 | Create resetRateLimit and key builder functions   | `src/auth/rate-limiter.ts`    |
| 2.1.3 | Create loadXxxRateLimitConfig from system_config  | `src/auth/rate-limiter.ts`    |

**Deliverables**:
- [ ] `src/auth/rate-limiter.ts` with check, reset, key builders, config loaders
- [ ] Graceful degradation on Redis failure
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 3: Email Transport & Renderer

### Session 3.1: Email Transport and Renderer

**Reference**: [04-email-service.md](04-email-service.md)
**Objective**: Create the pluggable email transport and Handlebars email renderer.

**Tasks**:

| #     | Task                                                   | File                            |
| ----- | ------------------------------------------------------ | ------------------------------- |
| 3.1.1 | Create EmailTransport interface and SMTP implementation | `src/auth/email-transport.ts`   |
| 3.1.2 | Create email renderer with template resolution         | `src/auth/email-renderer.ts`    |
| 3.1.3 | Create email service with 5 email methods              | `src/auth/email-service.ts`     |

**Deliverables**:
- [ ] `src/auth/email-transport.ts` with interface + SMTP
- [ ] `src/auth/email-renderer.ts` with org-override template resolution
- [ ] `src/auth/email-service.ts` with sendMagicLink, sendPasswordReset, sendInvitation, sendWelcome, sendPasswordChanged
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 4: i18n & Template Engine

### Session 4.1: i18n System

**Reference**: [05-i18n-and-templates.md](05-i18n-and-templates.md)
**Objective**: Create the i18n system with locale resolution.

**Tasks**:

| #     | Task                                                | File                     |
| ----- | --------------------------------------------------- | ------------------------ |
| 4.1.1 | Create initI18n, resolveLocale, getTranslationFunction | `src/auth/i18n.ts`    |
| 4.1.2 | Create registerHandlebarsI18nHelper                  | `src/auth/i18n.ts`      |

**Deliverables**:
- [ ] `src/auth/i18n.ts` with init, resolve, translation function, Handlebars helper
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 4.2: Template Engine

**Reference**: [05-i18n-and-templates.md](05-i18n-and-templates.md)
**Objective**: Create the Handlebars page renderer with layout system.

**Tasks**:

| #     | Task                                                | File                           |
| ----- | --------------------------------------------------- | ------------------------------ |
| 4.2.1 | Create initTemplateEngine with partial registration  | `src/auth/template-engine.ts`  |
| 4.2.2 | Create renderPage with layout injection and org overrides | `src/auth/template-engine.ts` |

**Deliverables**:
- [ ] `src/auth/template-engine.ts` with init and renderPage
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 5: Templates & Translations

### Session 5.1: Handlebars Templates

**Reference**: [05-i18n-and-templates.md](05-i18n-and-templates.md)
**Objective**: Create all default Handlebars templates (pages, emails, partials, layout).

**Tasks**:

| #     | Task                                    | File                                    |
| ----- | --------------------------------------- | --------------------------------------- |
| 5.1.1 | Create base layout and partials         | `templates/default/layouts/main.hbs`, `templates/default/partials/*.hbs` |
| 5.1.2 | Create login, consent, logout pages     | `templates/default/pages/{login,consent,logout}.hbs` |
| 5.1.3 | Create forgot-password, reset-password, reset-success pages | `templates/default/pages/*.hbs` |
| 5.1.4 | Create magic-link-sent, error pages     | `templates/default/pages/*.hbs` |
| 5.1.5 | Create accept-invite, invite-success, invite-expired pages | `templates/default/pages/*.hbs` |
| 5.1.6 | Create email templates (HTML + plaintext, all 5 types) | `templates/default/emails/*.hbs` |

**Deliverables**:
- [ ] All page templates (11 pages)
- [ ] All email templates (5 types × 2 = 10 files)
- [ ] Layout + 3 partials
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 5.2: English Translations

**Reference**: [05-i18n-and-templates.md](05-i18n-and-templates.md)
**Objective**: Create default English translation files.

**Tasks**:

| #     | Task                                            | File                              |
| ----- | ----------------------------------------------- | --------------------------------- |
| 5.2.1 | Create common, login, consent translation files  | `locales/default/en/*.json`       |
| 5.2.2 | Create forgot-password, reset-password, magic-link, logout translations | `locales/default/en/*.json` |
| 5.2.3 | Create invitation, errors, emails translations   | `locales/default/en/*.json`       |

**Deliverables**:
- [ ] All 10 English translation files
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 6: Interaction Routes (Login & Consent)

### Session 6.1: Login Route Handlers

**Reference**: [06-interaction-routes.md](06-interaction-routes.md)
**Objective**: Create the login and magic link interaction handlers.

**Tasks**:

| #     | Task                                              | File                           |
| ----- | ------------------------------------------------- | ------------------------------ |
| 6.1.1 | Create showLogin (GET /interaction/:uid)          | `src/routes/interactions.ts`   |
| 6.1.2 | Create processLogin (POST /interaction/:uid/login) | `src/routes/interactions.ts`  |
| 6.1.3 | Create sendMagicLink (POST /interaction/:uid/magic-link) | `src/routes/interactions.ts` |

**Deliverables**:
- [ ] Login show/process with rate limiting, CSRF, audit logging
- [ ] Magic link send with user enumeration prevention
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 6.2: Consent & Logout Handlers

**Reference**: [06-interaction-routes.md](06-interaction-routes.md)
**Objective**: Create the consent and logout interaction handlers.

**Tasks**:

| #     | Task                                              | File                           |
| ----- | ------------------------------------------------- | ------------------------------ |
| 6.2.1 | Create showConsent with auto-consent for first-party | `src/routes/interactions.ts` |
| 6.2.2 | Create processConsent (approve/deny)               | `src/routes/interactions.ts`  |
| 6.2.3 | Create abortInteraction                            | `src/routes/interactions.ts`  |

**Deliverables**:
- [ ] Consent show/process with auto-consent
- [ ] Abort interaction
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 7: Auth Routes (Magic Link, Password Reset, Invitation)

### Session 7.1: Magic Link Callback & Password Reset

**Reference**: [06-interaction-routes.md](06-interaction-routes.md)
**Objective**: Create magic link verification and password reset handlers.

**Tasks**:

| #     | Task                                                 | File                           |
| ----- | ---------------------------------------------------- | ------------------------------ |
| 7.1.1 | Create verifyMagicLink handler                       | `src/routes/magic-link.ts`     |
| 7.1.2 | Create showForgotPassword and processForgotPassword  | `src/routes/password-reset.ts` |
| 7.1.3 | Create showResetPassword and processResetPassword    | `src/routes/password-reset.ts` |

**Deliverables**:
- [ ] Magic link verification with OIDC flow resume
- [ ] Forgot/reset password flow
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 7.2: Invitation Handlers

**Reference**: [06-interaction-routes.md](06-interaction-routes.md)
**Objective**: Create invitation acceptance handlers.

**Tasks**:

| #     | Task                                          | File                        |
| ----- | --------------------------------------------- | --------------------------- |
| 7.2.1 | Create showAcceptInvite handler               | `src/routes/invitation.ts`  |
| 7.2.2 | Create processAcceptInvite handler            | `src/routes/invitation.ts`  |

**Deliverables**:
- [ ] Accept invite with token verification and password setting
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 8: Server Integration & Barrel Export

### Session 8.1: Wire Everything Together

**Reference**: [06-interaction-routes.md](06-interaction-routes.md)
**Objective**: Mount all routes, create barrel export, initialize at startup.

**Tasks**:

| #     | Task                                               | File                     |
| ----- | -------------------------------------------------- | ------------------------ |
| 8.1.1 | Create auth module barrel export                   | `src/auth/index.ts`      |
| 8.1.2 | Mount interaction routes in server.ts              | `src/server.ts`          |
| 8.1.3 | Mount auth routes (magic-link, password-reset, invitation) in server.ts | `src/server.ts` |
| 8.1.4 | Add i18n and template engine init to startup (src/index.ts) | `src/index.ts` |

**Deliverables**:
- [ ] All routes mounted and accessible
- [ ] i18n and template engine initialized at startup
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 9: Test — Tokens & Rate Limiter

### Session 9.1: Token and Rate Limiter Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Unit tests for tokens, token repository, CSRF, and rate limiter.

**Tasks**:

| #     | Task                                         | File                                      |
| ----- | -------------------------------------------- | ----------------------------------------- |
| 9.1.1 | Test generateToken, hashToken                | `tests/unit/auth/tokens.test.ts`          |
| 9.1.2 | Test token repository CRUD (all 3 tables)    | `tests/unit/auth/token-repository.test.ts` |
| 9.1.3 | Test CSRF generate/verify                    | `tests/unit/auth/csrf.test.ts`            |
| 9.1.4 | Test rate limiter check, exceed, reset, graceful degradation | `tests/unit/auth/rate-limiter.test.ts` |

**Deliverables**:
- [ ] ~49 tests (8 + 20 + 6 + 15)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 10: Test — Email Service

### Session 10.1: Email Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Unit tests for email transport, renderer, and service.

**Tasks**:

| #     | Task                                              | File                                        |
| ----- | ------------------------------------------------- | ------------------------------------------- |
| 10.1.1 | Test SMTP transport                              | `tests/unit/auth/email-transport.test.ts`   |
| 10.1.2 | Test email renderer with template resolution     | `tests/unit/auth/email-renderer.test.ts`    |
| 10.1.3 | Test email service (all 5 types + fire-and-forget) | `tests/unit/auth/email-service.test.ts`   |

**Deliverables**:
- [ ] ~30 tests (8 + 10 + 12)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 11: Test — i18n & Templates

### Session 11.1: i18n and Template Engine Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Unit tests for i18n system and template engine.

**Tasks**:

| #      | Task                                           | File                                       |
| ------ | ---------------------------------------------- | ------------------------------------------ |
| 11.1.1 | Test locale resolution chain and translation loading | `tests/unit/auth/i18n.test.ts`        |
| 11.1.2 | Test template engine rendering and org overrides | `tests/unit/auth/template-engine.test.ts` |

**Deliverables**:
- [ ] ~27 tests (15 + 12)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 12: Test — Interaction Routes

### Session 12.1: Login and Consent Route Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Unit tests for interaction route handlers.

**Tasks**:

| #      | Task                                              | File                                       |
| ------ | ------------------------------------------------- | ------------------------------------------ |
| 12.1.1 | Test showLogin, processLogin, sendMagicLink       | `tests/unit/routes/interactions.test.ts`   |
| 12.1.2 | Test showConsent, processConsent, abortInteraction | `tests/unit/routes/interactions.test.ts`  |

**Deliverables**:
- [ ] ~25 tests
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 13: Test — Auth Routes

### Session 13.1: Magic Link, Password Reset, Invitation Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Unit tests for standalone auth route handlers.

**Tasks**:

| #      | Task                                           | File                                      |
| ------ | ---------------------------------------------- | ----------------------------------------- |
| 13.1.1 | Test magic link verification                   | `tests/unit/routes/magic-link.test.ts`    |
| 13.1.2 | Test forgot/reset password                     | `tests/unit/routes/password-reset.test.ts` |
| 13.1.3 | Test accept invitation                         | `tests/unit/routes/invitation.test.ts`    |
| 13.1.4 | Run final full verification                    | —                                         |

**Deliverables**:
- [ ] ~35 tests (10 + 15 + 10)
- [ ] Final `yarn verify` passing with zero failures
- [ ] All ~166 new tests passing, no regressions

**Verify**: `clear && sleep 3 && yarn verify`

---

## Task Checklist (All Phases)

### Phase 1: Dependencies & Token Infrastructure
- [ ] 1.1.1 Install handlebars, i18next, i18next-fs-backend, nodemailer, @types/nodemailer
- [ ] 1.1.2 Create generateToken, hashToken utilities
- [ ] 1.1.3 Create token repository (insert, find, markUsed, invalidate, cleanup)
- [ ] 1.1.4 Create CSRF token generation and verification

### Phase 2: Rate Limiter
- [ ] 2.1.1 Create checkRateLimit with INCR + EXPIRE
- [ ] 2.1.2 Create resetRateLimit and key builder functions
- [ ] 2.1.3 Create loadXxxRateLimitConfig from system_config

### Phase 3: Email Transport & Renderer
- [ ] 3.1.1 Create EmailTransport interface and SMTP implementation
- [ ] 3.1.2 Create email renderer with template resolution
- [ ] 3.1.3 Create email service with 5 email methods

### Phase 4: i18n & Template Engine
- [ ] 4.1.1 Create initI18n, resolveLocale, getTranslationFunction
- [ ] 4.1.2 Create registerHandlebarsI18nHelper
- [ ] 4.2.1 Create initTemplateEngine with partial registration
- [ ] 4.2.2 Create renderPage with layout injection and org overrides

### Phase 5: Templates & Translations
- [ ] 5.1.1 Create base layout and partials
- [ ] 5.1.2 Create login, consent, logout pages
- [ ] 5.1.3 Create forgot-password, reset-password, reset-success pages
- [ ] 5.1.4 Create magic-link-sent, error pages
- [ ] 5.1.5 Create accept-invite, invite-success, invite-expired pages
- [ ] 5.1.6 Create email templates (HTML + plaintext, all 5 types)
- [ ] 5.2.1 Create common, login, consent translation files
- [ ] 5.2.2 Create forgot-password, reset-password, magic-link, logout translations
- [ ] 5.2.3 Create invitation, errors, emails translations

### Phase 6: Interaction Routes (Login & Consent)
- [ ] 6.1.1 Create showLogin handler
- [ ] 6.1.2 Create processLogin handler
- [ ] 6.1.3 Create sendMagicLink handler
- [ ] 6.2.1 Create showConsent with auto-consent
- [ ] 6.2.2 Create processConsent handler
- [ ] 6.2.3 Create abortInteraction handler

### Phase 7: Auth Routes (Magic Link, Reset, Invite)
- [ ] 7.1.1 Create verifyMagicLink handler
- [ ] 7.1.2 Create showForgotPassword and processForgotPassword
- [ ] 7.1.3 Create showResetPassword and processResetPassword
- [ ] 7.2.1 Create showAcceptInvite handler
- [ ] 7.2.2 Create processAcceptInvite handler

### Phase 8: Server Integration
- [ ] 8.1.1 Create auth module barrel export
- [ ] 8.1.2 Mount interaction routes in server.ts
- [ ] 8.1.3 Mount auth routes in server.ts
- [ ] 8.1.4 Add i18n and template engine init to startup

### Phase 9: Test — Tokens & Rate Limiter
- [ ] 9.1.1 Test generateToken, hashToken
- [ ] 9.1.2 Test token repository CRUD
- [ ] 9.1.3 Test CSRF generate/verify
- [ ] 9.1.4 Test rate limiter

### Phase 10: Test — Email Service
- [ ] 10.1.1 Test SMTP transport
- [ ] 10.1.2 Test email renderer
- [ ] 10.1.3 Test email service

### Phase 11: Test — i18n & Templates
- [ ] 11.1.1 Test locale resolution and translation loading
- [ ] 11.1.2 Test template engine rendering

### Phase 12: Test — Interaction Routes
- [ ] 12.1.1 Test login and magic link handlers
- [ ] 12.1.2 Test consent and abort handlers

### Phase 13: Test — Auth Routes
- [ ] 13.1.1 Test magic link verification
- [ ] 13.1.2 Test forgot/reset password
- [ ] 13.1.3 Test accept invitation
- [ ] 13.1.4 Run final full verification

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/auth-workflows/99-execution-plan.md`"
2. Read relevant technical spec document(s)

### Ending a Session

1. Run `clear && sleep 3 && yarn verify`
2. Handle commit per the active commit mode
3. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan auth-workflows` to continue

---

## Dependencies

```
Phase 1 (Dependencies, Tokens, CSRF)
    ↓
Phase 2 (Rate Limiter)
    ↓
Phase 3 (Email Transport & Renderer)
    ↓
Phase 4 (i18n & Template Engine)
    ↓
Phase 5 (Templates & Translations)
    ↓
Phase 6 (Interaction Routes: Login & Consent)
    ↓
Phase 7 (Auth Routes: Magic Link, Reset, Invite)
    ↓
Phase 8 (Server Integration)
    ↓
Phases 9-13 (Testing — can overlap but sequential within)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All 13 phases completed
2. ✅ All verification passing (`yarn verify` — lint + build + test)
3. ✅ No warnings/errors
4. ✅ ~166 new tests passing
5. ✅ No regressions in existing 775 tests
6. ✅ Documentation updated (comments, doc comments)
7. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
