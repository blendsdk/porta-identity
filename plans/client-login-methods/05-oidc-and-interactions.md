# OIDC & Interaction Routes: Client Login Methods

> **Document**: 05-oidc-and-interactions.md
> **Parent**: [Index](00-index.md)

## Overview

This document covers the OIDC configuration change + the three interaction-route handlers that must be updated to:

1. **Emit** the raw `loginMethods` value as a custom OIDC metadata field
2. **Resolve** the effective methods when rendering the login page
3. **Enforce** the resolved methods on the two POST endpoints (password login + magic link)

## Architecture

### Changes

```
src/oidc/configuration.ts
  └── extraClientMetadata.properties  ← add 'urn:porta:login_methods'

src/routes/interactions.ts
  ├── showLogin()                     ← resolve + pass to template
  ├── processLogin()                  ← enforce 'password' in methods
  └── handleSendMagicLink()           ← enforce 'magic_link' in methods
```

## Implementation Details

### `src/oidc/configuration.ts` — register extra metadata

```typescript
extraClientMetadata: {
  properties: [
    'organizationId',
    'urn:porta:allowed_origins',
    'urn:porta:client_type',
    'urn:porta:login_methods',  // NEW — may be null (inherit) or string[]
  ],
},
```

No other changes to the provider configuration. The field is inert as far as OIDC is concerned — it's just preserved end-to-end.

### `src/routes/interactions.ts` — new helper

Add a small helper at the top of the file (near `buildBrandingFromOrg`):

```typescript
import { resolveLoginMethods } from '../clients/resolve-login-methods.js';
import type { LoginMethod } from '../clients/types.js';

/**
 * Resolve effective login methods from an OIDC provider Client object
 * and the current organization.
 *
 * Reads `urn:porta:login_methods` from the client's OIDC metadata (set by
 * `findForOidc()`), which is the raw value (null for inherit, or an array).
 * Falls back to `['password', 'magic_link']` if the metadata is missing or
 * malformed, matching historical default behavior.
 *
 * @param client - OIDC provider Client instance
 * @param org - Organization for the tenant
 * @returns Resolved LoginMethod[] (always non-empty)
 */
function resolveLoginMethodsFromOidcClient(
  client: unknown,
  org: Organization,
): LoginMethod[] {
  const metadata = (client as { metadata?: () => Record<string, unknown> })
    ?.metadata?.();
  const raw = metadata?.['urn:porta:login_methods'] as LoginMethod[] | null | undefined;
  // Treat malformed/missing as null (= inherit)
  const normalized: LoginMethod[] | null = Array.isArray(raw) ? raw : null;
  return resolveLoginMethods(org, { loginMethods: normalized });
}
```

### `src/routes/interactions.ts` — `showLogin()` changes

Add the resolution step and pass booleans into the template context:

```typescript
// After resolving org and client_name (existing code)…

// Resolve effective login methods from the provider's Client metadata
const oidcClient = await provider.Client.find(params.client_id as string);
const effectiveMethods = oidcClient
  ? resolveLoginMethodsFromOidcClient(oidcClient, org)
  : (['password', 'magic_link'] as LoginMethod[]);

const showPassword = effectiveMethods.includes('password');
const showMagicLink = effectiveMethods.includes('magic_link');

const context: TemplateContext = {
  ...buildBaseContext(ctx, locale, csrfToken, org.slug),
  t,
  interaction: {
    uid: interaction.uid,
    prompt: prompt.name,
    params: params as Record<string, unknown>,
    client: { clientName },
  },
  email: loginHint,
  // Login method rendering flags
  showPassword,
  showMagicLink,
  showDivider: showPassword && showMagicLink,
  loginMethods: effectiveMethods, // for debugging / future use
};
```

The `TemplateContext` type (defined in `src/auth/template-engine.ts`) must be extended with the optional booleans:

```typescript
export interface TemplateContext {
  // ... existing ...
  showPassword?: boolean;
  showMagicLink?: boolean;
  showDivider?: boolean;
  loginMethods?: LoginMethod[];
}
```

### `src/routes/interactions.ts` — `processLogin()` enforcement

Add enforcement after CSRF check, before rate-limit check:

```typescript
// Step 0: Enforce login method — reject if password is not allowed for this client
const oidcClient = await provider.Client.find(interaction.params.client_id as string);
const effectiveMethods = oidcClient
  ? resolveLoginMethodsFromOidcClient(oidcClient, org)
  : (['password', 'magic_link'] as LoginMethod[]);

if (!effectiveMethods.includes('password')) {
  logger.warn(
    { uid: interaction.uid, email, clientId: interaction.params.client_id },
    'Password login attempted for client where it is disabled',
  );

  writeAuditLog({
    organizationId: org.id,
    eventType: 'security.login_method_disabled',
    eventCategory: 'security',
    description: `Password login attempted on client where method is disabled (${email})`,
    ipAddress: ctx.ip,
    metadata: {
      clientId: interaction.params.client_id,
      attemptedMethod: 'password',
      effectiveMethods,
    },
  });

  await renderLoginWithError(
    ctx, provider, interaction, t, locale, email,
    t('errors.login_method_disabled'),
    403,
  );
  return;
}
```

### `src/routes/interactions.ts` — `handleSendMagicLink()` enforcement

Add symmetric enforcement after CSRF check:

```typescript
// Step 0: Enforce login method — reject if magic_link is not allowed for this client
const oidcClient = await provider.Client.find(interaction.params.client_id as string);
const effectiveMethods = oidcClient
  ? resolveLoginMethodsFromOidcClient(oidcClient, org)
  : (['password', 'magic_link'] as LoginMethod[]);

if (!effectiveMethods.includes('magic_link')) {
  logger.warn(
    { uid: interaction.uid, email, clientId: interaction.params.client_id },
    'Magic link attempted for client where it is disabled',
  );

  writeAuditLog({
    organizationId: org.id,
    eventType: 'security.login_method_disabled',
    eventCategory: 'security',
    description: `Magic link attempted on client where method is disabled (${email})`,
    ipAddress: ctx.ip,
    metadata: {
      clientId: interaction.params.client_id,
      attemptedMethod: 'magic_link',
      effectiveMethods,
    },
  });

  await renderLoginWithError(
    ctx, provider, interaction, t, locale, email,
    t('errors.login_method_disabled'),
    403,
  );
  return;
}
```

### i18n — new translation key

`locales/default/en/errors.json` (or wherever error messages live):

```json
{
  "login_method_disabled": "This authentication method is not available for this application."
}
```

> **Decision:** Use a user-friendly message rather than "403 Forbidden". The rare user who encounters this (browser back button, stale form) gets a clear indication. Operators who see this in audit logs know an active enforcement happened.

### Forgot-password / reset-password enforcement

The password-reset flow is meaningless for clients that don't allow password authentication. Allowing a user to go through "forgot password → new password → try to log in" for a magic-link-only client would be confusing and would leak that password is structurally possible elsewhere.

**Enforcement points** (all mirror the `processLogin()` pattern — 403 + re-render + `security.login_method_disabled` audit):

| Route                                          | File                               | Check                                               |
| ---------------------------------------------- | ---------------------------------- | --------------------------------------------------- |
| `GET /:orgSlug/auth/forgot-password`           | `src/routes/password-reset.ts` (or wherever the forgot handler lives) | `'password'` in effective methods |
| `POST /:orgSlug/auth/forgot-password`           | same                               | `'password'` in effective methods                   |
| `POST /:orgSlug/auth/reset-password`            | same                               | `'password'` in effective methods                   |

The check reuses the same `resolveLoginMethodsFromOidcClient()` helper. If `interaction.uid` is present on the request, we look up the client via `provider.Client.find(params.client_id)` exactly as in `processLogin`. If no interaction is present (the user navigated here directly without an active flow), fall back to denying with a generic error.

```typescript
// Example pattern (shared by both GET and POST handlers)
async function enforcePasswordMethod(
  ctx: Context,
  provider: Provider,
  interaction: InteractionDetails,
): Promise<boolean> {
  const client = await provider.Client.find(interaction.params.client_id);
  const effective = resolveLoginMethodsFromOidcClient(client, ctx.state.organization);
  if (!effective.includes('password')) {
    await writeAuditLog({
      event: 'security.login_method_disabled',
      orgId: ctx.state.organization.id,
      clientId: interaction.params.client_id,
      metadata: { route: ctx.path, method: 'password', effective },
    });
    ctx.status = 403;
    await renderLoginPage(ctx, provider, interaction, ctx.state.t, ctx.state.locale, '',
      ctx.state.t('errors.login_method_disabled'), 403);
    return false;
  }
  return true;
}
```

> **Note on the template:** even with backend enforcement, the `login.hbs` template must hide the "Forgot password?" link when `showPassword` is false (see doc 06). That change is purely cosmetic — the backend is the authoritative guard.

### login_hint prefill (UX enhancement)

OIDC clients can pass `login_hint=user@example.com` in the authorization request. Today, Porta ignores this hint. Since we're already touching the login template and interaction handlers, we wire it through as a zero-cost UX win.

**Wiring:**

1. In `showLogin()`, read `interaction.params.login_hint` (may be undefined).
2. Sanitize: trim, length-limit to 320 chars (RFC 5321 max), strip non-printable chars.
3. Pass to template context as `emailHint: string | undefined`.
4. Template pre-populates `<input name="email" value="{{emailHint}}">` in both the password form and the magic-link form.

**Sanitization rationale:** `login_hint` comes from the client-supplied authorization URL, which has gone through OIDC param parsing but is effectively unvalidated string input. It ends up inside an `value="..."` attribute — Handlebars already HTML-escapes by default, so XSS is blocked, but we still trim and length-limit defensively.

```typescript
// showLogin() addition
const rawHint = typeof interaction.params.login_hint === 'string'
  ? interaction.params.login_hint.trim().slice(0, 320)
  : undefined;
const emailHint = rawHint && rawHint.length > 0 ? rawHint : undefined;

await renderLoginPage(ctx, provider, interaction, t, locale, '', undefined, 200, {
  showPassword,
  showMagicLink,
  showDivider,
  loginMethods,
  emailHint,  // ← new
});
```

**Non-requirement:** we do NOT validate that `login_hint` is a well-formed email — clients may pass any opaque identifier per the spec. Invalid input just results in a weird-looking prefilled field, which is still better than no prefill.

## Integration Points

### Flow: rendering the login page

```
GET /interaction/:uid
  ↓ showLogin(ctx, provider)
  ↓
  provider.interactionDetails(req, res)
  ↓
  resolveOrganizationForInteraction(ctx, client_id)
  ↓
  provider.Client.find(client_id)  ← OIDC metadata incl. urn:porta:login_methods
  ↓
  resolveLoginMethodsFromOidcClient(oidcClient, org)
  ↓
  compute showPassword / showMagicLink / showDivider
  ↓
  renderAndRespond('login', context)
```

### Flow: POST enforcement

```
POST /interaction/:uid/login
  ↓ processLogin(ctx, provider)
  ↓
  provider.interactionDetails + resolveOrg (existing)
  ↓
  verify CSRF (existing)
  ↓
  resolveLoginMethodsFromOidcClient ← NEW
  ↓ if 'password' not in methods → audit + 403 render → RETURN
  ↓
  rate-limit check (existing)
  ↓
  ... rest of handler unchanged ...
```

## Code Examples

### Example: login page for a magic-link-only client

```
Client: urn:porta:login_methods = ['magic_link']
Org:    defaultLoginMethods = ['password', 'magic_link']
Resolved: ['magic_link']
Template renders:
  - No password form
  - No divider
  - Just the "Email me a login link" button
POST /interaction/:uid/login → 403 (login method disabled)
POST /interaction/:uid/magic-link → accepted
```

### Example: login page for an inherited client

```
Client: urn:porta:login_methods = null (inherit)
Org:    defaultLoginMethods = ['password']
Resolved: ['password']
Template renders:
  - Password form
  - No divider
  - No magic link button
POST /interaction/:uid/login → accepted
POST /interaction/:uid/magic-link → 403 (login method disabled)
```

## Error Handling

| Error Case                                          | Handling Strategy                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `provider.Client.find()` returns undefined          | Default to `['password', 'magic_link']` (current behavior) — safe fallback   |
| Metadata missing `urn:porta:login_methods` key      | Treated as `null` by helper → inherits org default                            |
| Metadata has unexpected shape (not null, not array) | Treated as `null` by helper → inherits org default                            |
| Client specifies method not in org default          | Currently no cross-check — client override is final. (Future consideration.) |
| POST to disabled method                             | Re-render login page with 403 + translated error message                     |
| POST to disabled method with malformed CSRF         | CSRF error takes precedence (existing behavior preserved)                    |

## Testing Requirements

- **`tests/unit/routes/interactions.test.ts`** — new suites:
  - `showLogin` — passes `showPassword=true, showMagicLink=true` for default client
  - `showLogin` — passes `showPassword=true, showMagicLink=false, showDivider=false` for `['password']` client
  - `showLogin` — passes `showPassword=false, showMagicLink=true, showDivider=false` for `['magic_link']` client
  - `processLogin` — returns 403 + renders login-with-error when password disabled
  - `processLogin` — audit-logs `security.login_method_disabled`
  - `processLogin` — unchanged behavior when password enabled
  - `handleSendMagicLink` — mirror tests for magic-link disabled/enabled
- **`tests/unit/oidc/configuration.test.ts`** — updated to assert `extraClientMetadata.properties` includes `urn:porta:login_methods`
- **Mock strategy:** tests must stub `provider.Client.find()` to return an object with a `metadata()` function that returns a controlled record including `urn:porta:login_methods`. Follow the existing mock pattern in `interactions.test.ts`.
