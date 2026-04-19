# Admin API, CLI & Template: Client Login Methods

> **Document**: 06-api-cli-template.md
> **Parent**: [Index](00-index.md)

## Overview

This document covers the user-facing surfaces:

1. **Admin HTTP API** — Zod schemas for org + client create/update endpoints
2. **CLI** — `--login-methods` flags on `porta org` and `porta client` commands
3. **Login template** — conditional Handlebars sections based on resolved methods

## Architecture

### Changes

```
src/routes/
  ├── organizations.ts     ← Zod schema + payload mapping (defaultLoginMethods)
  └── clients.ts           ← Zod schema + payload mapping (loginMethods, nullable)

src/cli/commands/
  ├── org.ts               ← yargs --login-methods flag (create + update)
  └── client.ts            ← yargs --login-methods flag (create + update, with 'inherit')

templates/default/pages/
  └── login.hbs            ← conditional blocks for password / magic link / divider
```

## Implementation Details

### Admin API: `src/routes/organizations.ts`

**Zod schemas** — add `defaultLoginMethods` to both create and update schemas:

```typescript
const loginMethodSchema = z.enum(['password', 'magic_link']);

const defaultLoginMethodsSchema = z.array(loginMethodSchema).min(1);

const createOrganizationSchema = z.object({
  // ... existing fields ...
  defaultLoginMethods: defaultLoginMethodsSchema.optional(),
});

const updateOrganizationSchema = z.object({
  // ... existing fields ...
  defaultLoginMethods: defaultLoginMethodsSchema.optional(),
});
```

**Route handlers** — pass `defaultLoginMethods` through to the service (already covered in service.ts changes from doc 04).

**Response body** — GET/list endpoints already return the full `Organization` object via service → so the new field is automatically included in the JSON response via the row mapper.

### Admin API: `src/routes/clients.ts`

**Zod schemas** — add `loginMethods` (nullable) to both create and update schemas:

```typescript
const loginMethodSchema = z.enum(['password', 'magic_link']);

// On create: optional, nullable. null and undefined both mean "inherit".
// On update: optional, nullable. null = reset to inherit, array = override.
const clientLoginMethodsSchema = z.array(loginMethodSchema).min(1).nullable();

const createClientSchema = z.object({
  // ... existing fields ...
  loginMethods: clientLoginMethodsSchema.optional(),
});

const updateClientSchema = z.object({
  // ... existing fields ...
  loginMethods: clientLoginMethodsSchema.optional(),
});
```

**Route handlers** — pass `loginMethods` through to the service. Service handles `undefined` vs `null` vs array semantics.

**Response body** — client list/show responses should include a computed `effectiveLoginMethods` field for operator convenience:

```typescript
// In the route handler for GET /clients/:id
const client = await getClientById(id);
const org = await getOrganizationById(client.organizationId);
return ctx.body = {
  ...client,
  effectiveLoginMethods: resolveLoginMethods(org, client),
};
```

> **Decision on response shape:** Include `effectiveLoginMethods` as a computed helper at the response layer (not on the `Client` type itself). This keeps the domain type clean while giving API consumers the resolved value.

### CLI: `src/cli/commands/org.ts`

**Add `--login-methods` flag** on `org create` and `org update` commands:

```typescript
.option('login-methods', {
  describe: 'Comma-separated list of login methods (password, magic_link)',
  type: 'string',
})
```

**Parsing helper** (shared between org + client commands, put in `src/cli/parsers.ts` or inline):

```typescript
/**
 * Parse a comma-separated list of login methods from the CLI.
 * - Returns `undefined` if the flag was not provided
 * - Returns `null` if the user passed the sentinel `inherit` (client-only)
 * - Returns LoginMethod[] otherwise
 * - Throws on invalid values
 */
export function parseLoginMethodsFlag(
  value: string | undefined,
  allowInherit: boolean,
): LoginMethod[] | null | undefined {
  if (value === undefined) return undefined;
  if (allowInherit && value.trim().toLowerCase() === 'inherit') return null;

  const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new Error('--login-methods must not be empty (use "inherit" to reset on clients)');
  }
  for (const p of parts) {
    if (!LOGIN_METHODS.includes(p as LoginMethod)) {
      throw new Error(`--login-methods: unknown method "${p}" (valid: ${LOGIN_METHODS.join(', ')})`);
    }
  }
  return parts as LoginMethod[];
}
```

**Usage in `org create` handler:**
```typescript
const defaultLoginMethods = parseLoginMethodsFlag(argv['login-methods'], false);
await createOrganization({
  // ... existing fields ...
  ...(defaultLoginMethods !== undefined && { defaultLoginMethods }),
});
```

**Usage in `org update` handler** — same pattern (`allowInherit: false` because `null` is not a valid org-level value).

**Output** — `porta org show` and `porta org list` should display `defaultLoginMethods`:

```
Name:                   Acme Corp
Slug:                   acme
Status:                 active
Default login methods:  password, magic_link
2FA policy:             optional
```

### CLI: `src/cli/commands/client.ts`

**Add `--login-methods` flag** on `client create` and `client update` commands:

```typescript
.option('login-methods', {
  describe: 'Comma-separated login methods (password, magic_link) or "inherit" to use org default',
  type: 'string',
})
```

**Usage in `client create` handler:**
```typescript
const loginMethods = parseLoginMethodsFlag(argv['login-methods'], true);
await createClient({
  // ... existing fields ...
  ...(loginMethods !== undefined && { loginMethods }),
});
```

**Usage in `client update` handler** — `allowInherit: true`, so `--login-methods inherit` resets to org default.

**Output** — `porta client show` should display both raw + resolved:

```
Name:                   Customer Portal
Client ID:              abc123…
Type:                   public (spa)
Login methods (client): inherit
Login methods (effective): password, magic_link
```

Or when explicitly set:

```
Login methods (client): magic_link
Login methods (effective): magic_link
```

### Template: `templates/default/pages/login.hbs`

Rewrite with conditional sections:

```hbs
{{!-- Login page: email/password form + magic link option (both optional) --}}
<h1>{{t "login.title"}}</h1>
<p class="text-muted mb-4">{{t "login.subtitle" clientName=interaction.client.clientName}}</p>

{{#if showPassword}}
<form method="POST" action="/interaction/{{interaction.uid}}/login">
  <input type="hidden" name="_csrf" value="{{csrfToken}}">

  <div class="form-group">
    <label for="email">{{t "login.email_label"}}</label>
    <input type="email" id="email" name="email" required autofocus placeholder="{{t "login.email_placeholder"}}" value="{{email}}">
  </div>

  <div class="form-group">
    <label for="password">{{t "login.password_label"}}</label>
    <input type="password" id="password" name="password" required placeholder="{{t "login.password_placeholder"}}">
  </div>

  <div class="form-group">
    <a href="/{{orgSlug}}/auth/forgot-password?interaction={{interaction.uid}}" class="text-muted" style="font-size: 13px;">{{t "login.forgot_password"}}</a>
  </div>

  <button type="submit" class="btn-primary">{{t "login.submit"}}</button>
</form>
{{/if}}

{{#if showDivider}}
<div class="divider"><span>{{t "login.or_divider"}}</span></div>
{{/if}}

{{#if showMagicLink}}
<form method="POST" action="/interaction/{{interaction.uid}}/magic-link" id="magic-link-form">
  <input type="hidden" name="_csrf" value="{{csrfToken}}">

  {{#unless showPassword}}
  {{!-- Magic-link-only mode: show an email input directly --}}
  <div class="form-group">
    <label for="ml-email">{{t "login.email_label"}}</label>
    <input type="email" id="ml-email" name="email" required autofocus placeholder="{{t "login.email_placeholder"}}" value="{{email}}">
  </div>
  {{else}}
  {{!-- Combined mode: email shared with password form, copied via script --}}
  <input type="hidden" name="email" value="">
  {{/unless}}

  <button type="submit" class="btn-secondary" id="magic-link-btn">{{t "login.magic_link_button"}}</button>
</form>
{{/if}}

{{#if showDivider}}
{{!-- Only needed when both forms are present — script copies email from password form to magic-link form --}}
<script>
  (function () {
    var magicBtn = document.getElementById('magic-link-btn');
    if (!magicBtn) return;
    var form = magicBtn.closest('form');
    form.addEventListener('submit', function(e) {
      var emailInput = document.getElementById('email');
      if (!emailInput) return;
      form.querySelector('input[name="email"]').value = emailInput.value;
      if (!emailInput.value) { e.preventDefault(); emailInput.focus(); }
    });
  })();
</script>
{{/if}}
```

**Key template decisions:**

1. **Magic-link-only mode** — shows its own email input (users need somewhere to type their email)
2. **Combined mode** — uses the existing shared-email pattern (hidden field + script)
3. **Password-only mode** — hides the entire magic-link form + the script
4. **Divider** — only shown when both methods present
5. **Forgot-password link** — rendered *inside* the `{{#if showPassword}}` block (line 220) so it's automatically hidden in magic-link-only mode. Backend enforcement (doc 05) adds defense-in-depth.
6. **Email prefill from `login_hint`** — the `{{email}}` placeholder in all `value="..."` attributes receives its value from the template context. `showLogin()` populates it from `interaction.params.login_hint` (sanitized, see doc 05). Handlebars HTML-escapes by default, preventing XSS.

**Note:** Existing E2E/UI tests may reference DOM elements like `#magic-link-btn` that now don't exist in all modes. The E2E test update (doc 07) handles this.

### Error page fallback

If the template context somehow has neither `showPassword` nor `showMagicLink` true (defensive — shouldn't happen), the login page will render empty. To prevent that, add a final fallback:

```hbs
{{#unless showPassword}}{{#unless showMagicLink}}
<div class="alert alert-error">
  {{t "errors.no_login_methods_configured"}}
</div>
{{/unless}}{{/unless}}
```

New i18n key:
```json
{
  "no_login_methods_configured": "No login methods are configured for this application. Contact your administrator."
}
```

## Integration Points

### API → Service → Repository

```
PATCH /api/admin/clients/abc123
  body: { "loginMethods": ["magic_link"] }
  ↓ Zod validation
  ↓ service.updateClient(id, { loginMethods: ['magic_link'] })
  ↓ service normalize + validate
  ↓ repository.updateClient → SQL UPDATE
  ↓ cache.invalidateClient
  ↓ audit log "client.updated" (old: null, new: ['magic_link'])
  ← 200 OK { client, effectiveLoginMethods }
```

### CLI → Service → Repository

```
porta client update abc123 --login-methods magic_link
  ↓ parseLoginMethodsFlag(value, allowInherit=true)
  ↓ → ['magic_link']
  ↓ withBootstrap → updateClient(id, { loginMethods: ['magic_link'] })
  ↓ [same pipeline as above]
  ← success output + updated row table
```

```
porta client update abc123 --login-methods inherit
  ↓ parseLoginMethodsFlag → null
  ↓ updateClient(id, { loginMethods: null })
  ↓ SQL UPDATE login_methods = NULL
  ← success output
```

## Code Examples

### API: creating an org with password-only default

```http
POST /api/admin/organizations
Content-Type: application/json

{
  "name": "Internal Tools",
  "slug": "internal",
  "defaultLoginMethods": ["password"]
}
```

### API: updating a client to magic-link-only

```http
PATCH /api/admin/clients/abc123
Content-Type: application/json

{
  "loginMethods": ["magic_link"]
}
```

### API: resetting a client to inherit

```http
PATCH /api/admin/clients/abc123
Content-Type: application/json

{
  "loginMethods": null
}
```

### CLI: full set

```bash
# Set org default to password only
porta org update acme --login-methods password

# Create a client that overrides back to magic-link only
porta client create \
  --org acme \
  --app customer-portal \
  --name "Customer SPA" \
  --type public \
  --app-type spa \
  --redirect-uris https://portal.example.com/callback \
  --login-methods magic_link

# Change mind — reset to org default
porta client update <client-id> --login-methods inherit

# Show effective methods
porta client show <client-id>
# → Login methods (client):    inherit
# → Login methods (effective): password
```

## Error Handling

| Error Case                                       | Handling Strategy                                                |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| API: empty array on create/update                | 400 Bad Request — Zod `min(1)` fails                             |
| API: unknown method value                        | 400 Bad Request — Zod enum fails                                 |
| API: `loginMethods: "password"` (string, not array) | 400 Bad Request — Zod array fails                              |
| CLI: `--login-methods ""`                        | Error from `parseLoginMethodsFlag` — "must not be empty"          |
| CLI: `--login-methods abc`                       | Error from `parseLoginMethodsFlag` — "unknown method abc"         |
| CLI: `--login-methods inherit` on `org update`   | Error — "inherit is only valid on client commands"                |
| Template: neither method enabled                 | Render fallback error notice                                      |

## Testing Requirements

- **`tests/unit/routes/organizations.test.ts`** — new test cases for `defaultLoginMethods`:
  - POST accepts valid array
  - POST rejects empty array (400)
  - POST rejects invalid method (400)
  - PATCH roundtrip
- **`tests/unit/routes/clients.test.ts`** — new test cases:
  - POST accepts null (inherit)
  - POST accepts `['password']`
  - POST rejects empty array / invalid value
  - PATCH with null (reset)
  - GET/show response includes `effectiveLoginMethods`
- **`tests/unit/cli/commands/org.test.ts`** — `parseLoginMethodsFlag` + integration with `org create`/`update` commands
- **`tests/unit/cli/commands/client.test.ts`** — `inherit` sentinel, invalid value, normal case
- **Template rendering** — covered indirectly via route tests that check rendered HTML for presence/absence of form elements (optional — the booleans being passed is enough)
