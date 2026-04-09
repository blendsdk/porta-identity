# Interaction Routes: Auth Workflows

> **Document**: 06-interaction-routes.md
> **Parent**: [Index](00-index.md)

## Overview

Koa route handlers for all OIDC interactions (login, consent, logout) and standalone auth pages (magic link callback, password reset, invitation acceptance). These routes use the token management, rate limiting, email service, i18n, and template engine from the other components.

## Route Architecture

### Interaction Routes (Within OIDC Flow)

These routes handle the `/interaction/:uid` path. The UID is a node-oidc-provider interaction identifier — the provider redirects the user here during the OIDC flow.

```
GET  /interaction/:uid              → showLogin or showConsent (based on prompt)
POST /interaction/:uid/login        → processLogin (password)
POST /interaction/:uid/magic-link   → sendMagicLink
GET  /interaction/:uid/consent      → showConsent
POST /interaction/:uid/confirm      → processConsent
GET  /interaction/:uid/abort        → abortInteraction
```

### Auth Routes (Outside OIDC Flow)

These routes handle standalone auth pages. They are org-scoped via `/:orgSlug/auth/*`.

```
GET  /:orgSlug/auth/magic-link/:token           → verifyMagicLink
GET  /:orgSlug/auth/forgot-password              → showForgotPassword
POST /:orgSlug/auth/forgot-password              → processForgotPassword
GET  /:orgSlug/auth/reset-password/:token        → showResetPassword
POST /:orgSlug/auth/reset-password/:token        → processResetPassword
GET  /:orgSlug/auth/accept-invite/:token         → showAcceptInvite
POST /:orgSlug/auth/accept-invite/:token         → processAcceptInvite
```

## Implementation Details

### Interaction Route Handlers — `src/routes/interactions.ts`

#### `showLogin` (GET /interaction/:uid)

1. Call `provider.interactionDetails(ctx.req, ctx.res)` to get interaction state
2. If prompt is `consent` → redirect to consent page
3. Extract `login_hint` from interaction params → pre-fill email
4. Resolve locale (ui_locales → Accept-Language → org default)
5. Generate CSRF token, store in interaction session
6. Build branding context from `ctx.state.organization`
7. Render `login.hbs` with context

#### `processLogin` (POST /interaction/:uid/login)

1. Verify CSRF token
2. Extract email + password from form body
3. Check rate limit (login: IP + email)
4. If rate limited → render login with error, 429 status
5. Look up user by org + email (`getUserByEmail`)
6. If not found → render login with generic "Invalid email or password"
7. Check user status ≠ active → render login with status-specific error
8. Verify password (`verifyUserPassword`)
9. If wrong → render login with generic error, audit "user.login.password.failed"
10. If correct:
    a. Record login (`recordLogin`)
    b. Reset rate limit counter
    c. Audit "user.login.password"
    d. Call `provider.interactionFinished(ctx.req, ctx.res, { login: { accountId: user.id } })`

#### `sendMagicLink` (POST /interaction/:uid/magic-link)

1. Verify CSRF token
2. Extract email from form body
3. Check rate limit (magic link: email)
4. Look up user by org + email
5. **Always** show "Check your email" page (prevent user enumeration)
6. If user found and active:
    a. Invalidate any existing magic link tokens for this user
    b. Generate token + hash
    c. Load TTL from system_config (`magic_link_ttl`, default 900s = 15 min)
    d. Store token hash in `magic_link_tokens` table
    e. Build magic link URL: `/{org-slug}/auth/magic-link/{token}?interaction={uid}`
    f. Send magic link email
    g. Audit "user.magic_link.sent"
7. Render `magic-link-sent.hbs`

#### `showConsent` (GET /interaction/:uid/consent)

1. Call `provider.interactionDetails()` for interaction state
2. Check if client belongs to same org → auto-consent (first-party)
3. If auto-consent: immediately call `interactionFinished` with consent grant
4. Otherwise: render `consent.hbs` with requested scopes, client name

#### `processConsent` (POST /interaction/:uid/confirm)

1. Verify CSRF token
2. If approved → `provider.interactionFinished(ctx.req, ctx.res, { consent: { grantId } })`
3. If denied → `provider.interactionFinished(ctx.req, ctx.res, { error: 'access_denied', error_description: 'User denied consent' })`
4. Audit "user.consent.granted" or "user.consent.denied"

#### `abortInteraction` (GET /interaction/:uid/abort)

1. Call `provider.interactionFinished()` with `{ error: 'access_denied' }`
2. Audit "user.consent.denied"

### Magic Link Handler — `src/routes/magic-link.ts`

#### `verifyMagicLink` (GET /:orgSlug/auth/magic-link/:token)

1. Tenant resolver ensures `ctx.state.organization` is set
2. Hash the token from URL params
3. Find valid token in `magic_link_tokens` table
4. If invalid/expired → render error page with "Link expired" message, audit "user.magic_link.failed"
5. If valid:
    a. Mark token as used
    b. Mark user's email as verified
    c. Record login
    d. Audit "user.login.magic_link"
    e. Extract `interaction` query param (the uid)
    f. Resume OIDC flow: call `provider.interactionFinished()` with login result

### Password Reset Handlers — `src/routes/password-reset.ts`

#### `showForgotPassword` (GET /:orgSlug/auth/forgot-password)

1. Render `forgot-password.hbs` with CSRF token

#### `processForgotPassword` (POST /:orgSlug/auth/forgot-password)

1. Verify CSRF token
2. Extract email from form
3. Check rate limit (password reset: email)
4. **Always** show "Check your email" page (prevent enumeration)
5. If user found:
    a. Invalidate existing password reset tokens
    b. Generate token + hash
    c. Load TTL from system_config (`password_reset_ttl`, default 3600s = 1 hour)
    d. Store token hash in `password_reset_tokens`
    e. Build reset URL: `/{org-slug}/auth/reset-password/{token}`
    f. Send password reset email
    g. Audit "user.password_reset.requested"

#### `showResetPassword` (GET /:orgSlug/auth/reset-password/:token)

1. Hash token, check validity
2. If invalid → render error page, audit "user.password_reset.failed"
3. If valid → render `reset-password.hbs` with CSRF token

#### `processResetPassword` (POST /:orgSlug/auth/reset-password/:token)

1. Verify CSRF token
2. Hash token, verify still valid
3. Extract new password from form
4. Validate password (`validatePassword`)
5. If invalid → render form with error
6. Hash + update password via user service (`setUserPassword`)
7. Mark token as used
8. Send password-changed confirmation email
9. Audit "user.password_reset.completed"
10. Redirect to login page with flash success "Password reset successful"

### Invitation Handlers — `src/routes/invitation.ts`

#### `showAcceptInvite` (GET /:orgSlug/auth/accept-invite/:token)

1. Hash token, check validity in `invitation_tokens`
2. If invalid/expired → render `invite-expired.hbs`
3. If valid → render `accept-invite.hbs` with CSRF token

#### `processAcceptInvite` (POST /:orgSlug/auth/accept-invite/:token)

1. Verify CSRF token
2. Hash token, verify still valid
3. Extract password + confirm from form
4. Validate password, check match
5. Set user password (`setUserPassword`)
6. Mark email as verified (`markEmailVerified`)
7. Mark invitation token as used
8. Audit "user.invite.accepted"
9. Redirect to login with flash "Account set up successfully. Please sign in."

## Server Integration — `src/server.ts` Changes

1. Mount interaction routes at `/interaction` (before OIDC catch-all)
2. Mount auth routes at `/:orgSlug/auth` (with tenant resolver)
3. Ensure `koa-bodyparser` handles `application/x-www-form-urlencoded` (already does)
4. Initialize i18n and template engine at startup

### Provider Integration

Update `src/oidc/provider.ts` `interactionUrl`:
```typescript
interactionUrl: (_ctx, interaction) => {
  return `/interaction/${interaction.uid}`;
},
```
This is already the current value — no change needed. The interaction routes just need to be mounted.

## Audit Events

| Event | Event Type | Category |
| --- | --- | --- |
| Login success (password) | `user.login.password` | `authentication` |
| Login failure (password) | `user.login.password.failed` | `security` |
| Login success (magic link) | `user.login.magic_link` | `authentication` |
| Magic link sent | `user.magic_link.sent` | `authentication` |
| Magic link failed | `user.magic_link.failed` | `security` |
| Password reset requested | `user.password_reset.requested` | `security` |
| Password reset completed | `user.password_reset.completed` | `security` |
| Password reset failed | `user.password_reset.failed` | `security` |
| Consent granted | `user.consent.granted` | `authentication` |
| Consent denied | `user.consent.denied` | `authentication` |
| Rate limit exceeded (login) | `rate_limit.login` | `security` |
| Rate limit exceeded (magic) | `rate_limit.magic_link` | `security` |
| Rate limit exceeded (reset) | `rate_limit.password_reset` | `security` |
| Invitation accepted | `user.invite.accepted` | `authentication` |

## Error Handling

| Error Case | Handling |
| --- | --- |
| Interaction not found (invalid uid) | Render error page |
| Interaction expired | Render error page with "session expired" |
| User not found | Generic error (same as wrong password) |
| User not active | Status-specific message (locked, suspended, etc.) |
| Invalid/expired token | Render error page with appropriate message |
| Rate limit exceeded | 429 with Retry-After header, error flash |
| CSRF mismatch | 403 error |
| Provider interactionFinished fails | Render error page |

## Testing Requirements

- Interaction routes: mock provider.interactionDetails/interactionFinished, test full flows
- Login: success, failure, user not found, rate limited, user status checks
- Magic link: send, verify, expired, already used, user enumeration prevention
- Password reset: request, verify, complete, expired token, invalid password
- Invitation: accept, expired, set password validation
- Consent: approve, deny, auto-consent for first-party
- CSRF: valid token accepted, invalid rejected
- All audit events: verify writeAuditLog called with correct params
