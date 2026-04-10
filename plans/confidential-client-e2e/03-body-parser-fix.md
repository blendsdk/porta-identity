# Body Parser Fix

> **Document**: 03-body-parser-fix.md
> **Parent**: [Index](00-index.md)

## Problem

`server.ts` line 63: `app.use(bodyParser())` runs for ALL requests. This consumes
the request body stream before oidc-provider can parse it natively.

oidc-provider's `selective_body.js` has a fallback for pre-parsed bodies, but
the token endpoint's `client_auth.js` reads `ctx.oidc.params.client_id` which
comes from `ctx.oidc.body`, which may not be populated correctly when the
stream is already consumed.

## Solution

Move `bodyParser()` from global middleware to only the API admin routes and
interaction/auth routes that need it. OIDC provider routes must NOT have
the body pre-parsed.

### Implementation

In `server.ts`, replace the global `app.use(bodyParser())` with selective application:

1. Remove global `app.use(bodyParser())`
2. Apply bodyparser to specific route groups that need it:
   - `apiRouter` (admin API routes) — needs bodyparser for JSON
   - Interaction routes — needs bodyparser for form submissions
   - Auth routes (magic-link, password-reset, invitation) — needs bodyparser
3. OIDC router (`/:orgSlug/*`) — do NOT apply bodyparser, let oidc-provider handle it

### Verification

- "already parsed request body" warning should disappear from logs
- Token endpoint should accept `client_id` and `client_secret` in POST body
- Admin API routes continue to work (JSON body parsing)
- Interaction login/consent forms continue to work
