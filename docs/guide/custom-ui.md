# Custom UI Tutorial

Porta gives you full control over every user-facing page — login, consent, password reset, magic link, two-factor authentication, invitations, and all transactional emails. This guide covers everything from quick API-driven branding to building completely custom templates.

## What Can Be Customized?

| Layer | What It Covers | Effort |
|-------|---------------|--------|
| **API-driven branding** | Logo, favicon, colors, company name, custom CSS per org | Zero code — API/CLI only |
| **Custom CSS injection** | Full style override via `customCss` field (up to 10KB) | CSS only |
| **Template override** | Replace any or all Handlebars templates via Docker volume mount | HTML/Handlebars |
| **Email templates** | Customize HTML and plain-text transactional emails | HTML/Handlebars |

---

## Quick Start: API-Driven Branding {#branding}

The fastest way to customize Porta's UI is through per-organization branding. No template files needed — just set values via the Admin API or CLI.

### Available Branding Settings

| Setting | API Field | Default | Description |
|---------|-----------|---------|-------------|
| Logo URL | `logoUrl` | _(none)_ | Image displayed in page headers and email headers |
| Favicon URL | `faviconUrl` | _(none)_ | Browser tab icon |
| Primary Color | `primaryColor` | `#3B82F6` | Buttons, links, accents (sets CSS `--primary` variable) |
| Company Name | `companyName` | Organization name | Page titles, headers, footers, email signatures |
| Custom CSS | `customCss` | _(none)_ | Raw CSS injected into `<head>` (max 10KB) |

### Setting Branding via CLI

```bash
# Set branding for an organization
porta org branding <org-id> \
  --logo-url "https://cdn.example.com/logo.png" \
  --favicon-url "https://cdn.example.com/favicon.ico" \
  --primary-color "#E11D48" \
  --company-name "Acme Corp"
```

### Setting Branding via Admin API

```bash
curl -X PUT http://localhost:3000/api/admin/organizations/<org-id>/branding \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "logoUrl": "https://cdn.example.com/logo.png",
    "faviconUrl": "https://cdn.example.com/favicon.ico",
    "primaryColor": "#E11D48",
    "companyName": "Acme Corp",
    "customCss": "body { font-family: \"Inter\", sans-serif; }"
  }'
```

### Custom CSS Examples

The `customCss` field lets you override any style without touching templates:

```css
/* Change the font */
body { font-family: "Inter", system-ui, sans-serif; }

/* Rounded buttons */
.btn { border-radius: 24px; }

/* Custom background */
body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }

/* Hide the footer */
.footer { display: none; }

/* Dark mode */
body { background: #1a1a2e; color: #eee; }
.card { background: #16213e; border-color: #0f3460; }
.btn { background: #e94560; }
```

::: tip
Custom CSS is injected _after_ the default styles, so your rules take precedence. Use browser dev tools on the login page to inspect class names and structure.
:::

---

## Understanding the Template System {#template-system}

Porta uses [Handlebars](https://handlebarsjs.com/) as its template engine. Templates are organized in a clear directory structure:

```
templates/default/
├── layouts/
│   └── main.hbs              # Base HTML layout wrapping all pages
├── pages/
│   ├── login.hbs             # Login page (password + magic link forms)
│   ├── consent.hbs           # OAuth consent screen
│   ├── forgot-password.hbs   # Password reset request form
│   ├── reset-password.hbs    # New password form
│   ├── reset-success.hbs     # Password reset confirmation
│   ├── magic-link-sent.hbs   # "Check your email" page
│   ├── magic-link-success.hbs # Magic link verification success
│   ├── accept-invite.hbs     # User invitation acceptance
│   ├── invite-success.hbs    # Invitation accepted confirmation
│   ├── invite-expired.hbs    # Expired invitation page
│   ├── two-factor-setup.hbs  # 2FA setup (QR code for TOTP)
│   ├── two-factor-verify.hbs # 2FA code entry page
│   ├── logout.hbs            # Logout confirmation
│   └── error.hbs             # Error page
├── partials/
│   ├── header.hbs            # Organization logo/name header
│   ├── footer.hbs            # Copyright footer
│   └── flash-messages.hbs    # Success/error notification banners
└── emails/
    ├── magic-link.hbs         # Magic link email (HTML)
    ├── magic-link.txt.hbs     # Magic link email (plain text)
    ├── password-reset.hbs     # Password reset email (HTML)
    ├── password-reset.txt.hbs
    ├── invitation.hbs         # Invitation email (HTML)
    ├── invitation.txt.hbs
    ├── otp-code.hbs           # 2FA OTP code email (HTML)
    ├── otp-code.txt.hbs
    ├── password-changed.hbs   # Password changed notification (HTML)
    ├── password-changed.txt.hbs
    ├── welcome.hbs            # Welcome email (HTML)
    └── welcome.txt.hbs
```

### How Templates Are Rendered

1. The **layout** (`layouts/main.hbs`) provides the HTML shell — `<head>`, `<body>`, styles, branding CSS variable, and the `{{{body}}}` placeholder
2. The **page** (e.g., `pages/login.hbs`) provides the content rendered inside the layout
3. **Partials** (`{{> header}}`, `{{> footer}}`, `{{> flash-messages}}`) are reusable snippets included by pages
4. **Branding** values from the organization are automatically injected as template variables
5. **Custom CSS** from the branding is injected into the layout's `<head>` section

---

## Template Variables Reference {#variables}

All templates have access to these variables:

### Global Variables (All Pages)

| Variable | Type | Description |
|----------|------|-------------|
| `branding.logoUrl` | `string \| null` | Organization logo URL |
| `branding.faviconUrl` | `string \| null` | Favicon URL |
| `branding.primaryColor` | `string` | Hex color (default `#3B82F6`) |
| `branding.companyName` | `string` | Organization display name |
| `branding.customCss` | `string \| null` | Raw CSS for injection |
| `pageTitle` | `string` | Page title (e.g., "Sign In", "Reset Password") |
| `locale` | `string` | Current locale (e.g., `en`) |
| `year` | `number` | Current year (for copyright footers) |
| `t` | `function` | Translation helper — `{{t "key"}}` |

### Login Page (`pages/login.hbs`)

| Variable | Type | Description |
|----------|------|-------------|
| `uid` | `string` | OIDC interaction ID |
| `csrfToken` | `string` | CSRF token for form submission |
| `loginHint` | `string \| null` | Pre-filled email from OIDC `login_hint` parameter |
| `flash.error` | `string \| null` | Error message to display |
| `flash.success` | `string \| null` | Success message to display |
| `showPassword` | `boolean` | Whether to show the password form |
| `showMagicLink` | `boolean` | Whether to show the magic link form |
| `showForgotPassword` | `boolean` | Whether to show "Forgot password?" link |

### Consent Page (`pages/consent.hbs`)

| Variable | Type | Description |
|----------|------|-------------|
| `uid` | `string` | OIDC interaction ID |
| `csrfToken` | `string` | CSRF token |
| `client` | `object` | Client metadata (`name`, `logoUri`, `tosUri`, `policyUri`) |
| `scopes` | `string[]` | Requested scopes |
| `claims` | `string[]` | Requested claims |

### 2FA Pages (`pages/two-factor-verify.hbs`)

| Variable | Type | Description |
|----------|------|-------------|
| `uid` | `string` | OIDC interaction ID |
| `csrfToken` | `string` | CSRF token |
| `method` | `string` | Current 2FA method (`email_otp`, `totp`, `recovery`) |
| `maskedEmail` | `string \| null` | Masked email for OTP display |
| `flash.error` | `string \| null` | Error message |

### Email Templates

| Variable | Type | Description |
|----------|------|-------------|
| `branding.*` | `object` | Same branding variables as pages |
| `url` | `string` | Action URL (magic link, reset link, invite link) |
| `code` | `string` | OTP code (for otp-code template) |
| `expiresIn` | `string` | Human-readable expiry (e.g., "15 minutes") |
| `userName` | `string` | Recipient's display name |
| `year` | `number` | Current year |

---

## Creating a Custom Login Page {#custom-login}

Let's create a completely custom login page. Start by copying the default templates:

### Step 1: Copy Default Templates

```bash
# Create a directory for your custom templates
mkdir -p my-templates

# Copy the default templates as a starting point
docker cp porta-app:/app/templates/default/. my-templates/
```

Or if working from the source repository:

```bash
cp -r templates/default my-templates
```

### Step 2: Edit the Login Page

Edit `my-templates/pages/login.hbs`:

```handlebars
{{!-- Custom login page --}}
<div class="card" style="max-width: 400px; margin: 40px auto;">
  {{> header}}
  {{> flash-messages}}

  <h1 style="text-align: center; margin-bottom: 24px;">Welcome Back</h1>

  {{#if showPassword}}
  <form method="post" action="/interaction/{{uid}}/login">
    <input type="hidden" name="_csrf" value="{{csrfToken}}">

    <div style="margin-bottom: 16px;">
      <label for="email">Email</label>
      <input type="email" id="email" name="email"
        value="{{loginHint}}" required autofocus
        placeholder="you@example.com"
        style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
    </div>

    <div style="margin-bottom: 16px;">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required
        placeholder="Enter your password"
        style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
    </div>

    <button type="submit" class="btn" style="width: 100%;">Sign In</button>

    {{#if showForgotPassword}}
    <p style="text-align: center; margin-top: 12px;">
      <a href="/interaction/{{uid}}/forgot-password">Forgot your password?</a>
    </p>
    {{/if}}
  </form>
  {{/if}}

  {{#if showMagicLink}}
    {{#if showPassword}}
    <div style="text-align: center; margin: 20px 0; color: #888;">
      — or —
    </div>
    {{/if}}

    <form method="post" action="/interaction/{{uid}}/magic-link">
      <input type="hidden" name="_csrf" value="{{csrfToken}}">

      {{#unless showPassword}}
      <div style="margin-bottom: 16px;">
        <label for="magic-email">Email</label>
        <input type="email" id="magic-email" name="email"
          value="{{loginHint}}" required
          placeholder="you@example.com"
          style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
      </div>
      {{else}}
      <input type="hidden" name="email" value="">
      {{/unless}}

      <button type="submit" class="btn"
        style="width: 100%; background: transparent; color: var(--primary); border: 2px solid var(--primary);">
        ✉ Send me a magic link
      </button>
    </form>
  {{/if}}

  {{> footer}}
</div>
```

### Step 3: Customize the Layout

Edit `my-templates/layouts/main.hbs` to change the overall page structure, add external fonts, or modify the base styles:

```handlebars
<!DOCTYPE html>
<html lang="{{locale}}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  {{#if branding.faviconUrl}}<link rel="icon" href="{{branding.faviconUrl}}">{{/if}}
  <title>{{pageTitle}} — {{branding.companyName}}</title>

  <!-- Add custom fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">

  <style>
    :root { --primary: {{branding.primaryColor}}; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Inter", system-ui, sans-serif;
      background: #f8fafc;
      color: #334155;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: white;
      padding: 32px;
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    }
    .btn {
      display: inline-block;
      background: var(--primary);
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
    }
    .btn:hover { opacity: 0.9; }
    label { display: block; font-weight: 500; margin-bottom: 4px; font-size: 14px; }
    a { color: var(--primary); }
    /* Flash messages */
    .flash-error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 12px; border-radius: 8px; margin-bottom: 16px; }
    .flash-success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 12px; border-radius: 8px; margin-bottom: 16px; }
  </style>

  {{!-- Inject per-org custom CSS (overrides everything above) --}}
  {{#if branding.customCss}}<style>{{{branding.customCss}}}</style>{{/if}}
</head>
<body>
  {{{body}}}
</body>
</html>
```

### Step 4: Mount in Docker Compose

```yaml
services:
  porta:
    image: blendsdk/porta:latest
    volumes:
      - ./my-templates:/app/templates/default
    # ... rest of configuration
```

Restart the container and your custom templates are live:

```bash
docker compose up -d
```

::: warning Important
When mounting a custom templates directory, you must include **all** template files — the entire `layouts/`, `pages/`, `partials/`, and `emails/` directories. Porta does not merge custom templates with defaults; it reads from the mounted directory exclusively.
:::

---

## Customizing Email Templates {#emails}

Email templates come in pairs — an HTML version (`.hbs`) and a plain-text version (`.txt.hbs`). Both are sent together as a multipart email so recipients always get a readable version.

### Available Email Templates

| Template | When It's Sent |
|----------|---------------|
| `magic-link` | User requests a magic link login |
| `password-reset` | User requests a password reset |
| `invitation` | Admin invites a user to an organization |
| `otp-code` | 2FA email OTP code delivery |
| `password-changed` | Notification after password is changed |
| `welcome` | Welcome email after account creation |

### Example: Custom Magic Link Email

Edit `my-templates/emails/magic-link.hbs`:

```handlebars
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui, sans-serif; background: #f8f9fa; padding: 40px 20px; }
    .container { max-width: 480px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }
    .header { background: {{branding.primaryColor}}; color: white; padding: 24px; text-align: center; }
    .content { padding: 32px 24px; }
    .btn { display: inline-block; background: {{branding.primaryColor}}; color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 500; }
    .footer { padding: 16px 24px; text-align: center; color: #888; font-size: 13px; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      {{#if branding.logoUrl}}<img src="{{branding.logoUrl}}" alt="{{branding.companyName}}" style="max-height: 40px;">{{/if}}
      <h2>{{branding.companyName}}</h2>
    </div>
    <div class="content">
      <p>Hi {{userName}},</p>
      <p>Click the button below to sign in. This link expires in {{expiresIn}}.</p>
      <p style="text-align: center; margin: 24px 0;">
        <a href="{{url}}" class="btn">Sign In to {{branding.companyName}}</a>
      </p>
      <p style="color: #888; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
    <div class="footer">&copy; {{year}} {{branding.companyName}}</div>
  </div>
</body>
</html>
```

And the plain-text version `my-templates/emails/magic-link.txt.hbs`:

```handlebars
Hi {{userName}},

Sign in to {{branding.companyName}} by visiting this link:

{{url}}

This link expires in {{expiresIn}}.

If you didn't request this, you can safely ignore this email.

© {{year}} {{branding.companyName}}
```

---

## Docker Compose Configuration {#docker-setup}

### Development Setup (With Hot Reload)

For developing custom templates, mount your templates directory and restart on changes:

```yaml
services:
  porta:
    image: blendsdk/porta:latest
    ports:
      - "3000:3000"
    env_file: [.env]
    environment:
      DATABASE_URL: postgresql://porta:porta_secret@postgres:5432/porta
      REDIS_URL: redis://redis:6379
    volumes:
      # Mount custom templates (changes visible on next page load)
      - ./my-templates:/app/templates/default
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }

  postgres:
    image: postgres:16-alpine
    environment: { POSTGRES_DB: porta, POSTGRES_USER: porta, POSTGRES_PASSWORD: porta_secret }
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U porta"], interval: 5s, retries: 5 }

  redis:
    image: redis:7-alpine
    healthcheck: { test: ["CMD", "redis-cli", "ping"], interval: 5s, retries: 5 }

volumes:
  pgdata:
```

### Production Setup

For production, you can either:

**Option A: Volume mount** (recommended for easy updates)
```yaml
volumes:
  - ./my-templates:/app/templates/default:ro  # read-only mount
```

**Option B: Custom Docker image** (for immutable deployments)
```dockerfile
FROM blendsdk/porta:latest
COPY my-templates/ /app/templates/default/
```

---

## Testing Custom Templates {#testing}

### Quick Test Workflow

1. **Start Porta** with your custom templates mounted
2. **Create a test organization** and set branding:
   ```bash
   porta org branding <org-id> \
     --logo-url "https://example.com/logo.png" \
     --primary-color "#E11D48" \
     --company-name "Test Corp"
   ```
3. **Open the login page** at `http://localhost:3000/<org-slug>/auth`
4. **Test each flow**:
   - Password login
   - Magic link request (check MailHog at `http://localhost:8025` for emails)
   - Password reset flow
   - 2FA setup and verification (if enabled)

### Template Reload

Templates are read from disk on each request in development. After editing a template file, simply refresh the page to see changes — no container restart needed.

::: tip MailHog for Email Testing
For testing email templates locally, use the development Docker Compose profile which includes MailHog:
```bash
docker compose --profile dev up -d
```
Then open [http://localhost:8025](http://localhost:8025) to view all sent emails.
:::

---

## Internationalization (i18n) {#i18n}

Porta supports locale-based translations. Translation files are stored in `locales/default/<locale>/`:

```
locales/default/
└── en/
    ├── common.json     # Shared strings (buttons, labels)
    ├── login.json      # Login page strings
    ├── consent.json    # Consent page strings
    ├── errors.json     # Error messages
    ├── emails.json     # Email subject lines and content
    └── ...
```

Use the `{{t "key"}}` helper in templates to reference translated strings:

```handlebars
<h1>{{t "login.title"}}</h1>
<button type="submit">{{t "common.submit"}}</button>
<p>{{t "login.forgot_password"}}</p>
```

To add a new language, create a new locale directory (e.g., `locales/default/nl/`) with the same JSON files and mount it alongside your custom templates.

---

## Next Steps

- [Capabilities Overview](../concepts/capabilities.md) — See everything Porta can do
- [Authentication Modes](../concepts/authentication-modes.md) — Login methods and 2FA in depth
- [Admin API Reference](../api/overview.md) — Branding API details
- [CLI Reference](../cli/overview.md) — `porta org branding` command
- [Deployment Guide](./deployment.md) — Production deployment with custom templates
