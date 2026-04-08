# i18n & Template Engine: Auth Workflows

> **Document**: 05-i18n-and-templates.md
> **Parent**: [Index](00-index.md)

## Overview

Internationalization via i18next and server-rendered Handlebars pages with layout system, org-specific overrides, branding variables, and CSRF protection. These subsystems provide the rendering layer for all interaction pages and emails.

## i18n System — `src/auth/i18n.ts`

### Setup

```typescript
/**
 * Initialize i18next with filesystem backend.
 * Called once at application startup.
 * Loads translations from locales/default/{locale}/{namespace}.json
 * with optional org-specific overrides from locales/{org-slug}/{locale}/{namespace}.json
 */
export async function initI18n(): Promise<void>;

/**
 * Get a translation function for a specific locale and org.
 * Merges default translations with org-specific overrides.
 */
export function getTranslationFunction(locale: string, orgSlug?: string): (key: string, options?: Record<string, unknown>) => string;

/**
 * Resolve the best locale from the OIDC interaction and request context.
 * Resolution chain:
 *   1. ui_locales from OIDC authorization request
 *   2. Accept-Language header
 *   3. Organization defaultLocale
 *   4. Global default_locale from system_config
 *   5. Hardcoded fallback: 'en'
 */
export async function resolveLocale(
  uiLocales: string | undefined,
  acceptLanguage: string | undefined,
  orgDefaultLocale: string,
): Promise<string>;

/**
 * Register the {{t}} Handlebars helper for template translations.
 * Must be called after i18next is initialized.
 */
export function registerHandlebarsI18nHelper(): void;
```

### Translation File Structure

```
locales/
├── default/                    # Ships with Porta
│   └── en/
│       ├── common.json         # Shared (buttons, labels, footer)
│       ├── login.json          # Login page
│       ├── consent.json        # Consent page
│       ├── forgot-password.json
│       ├── reset-password.json
│       ├── magic-link.json
│       ├── invitation.json
│       ├── logout.json
│       ├── errors.json         # Error messages
│       └── emails.json         # Email subject lines & content
└── {org-slug}/                 # Optional per-org overrides
    └── en/
        └── login.json          # Override specific keys only
```

### Translation Namespaces

| Namespace | Purpose | Example Keys |
| --- | --- | --- |
| `common` | Shared UI elements | `common.submit`, `common.cancel`, `common.back` |
| `login` | Login page | `login.title`, `login.email_label`, `login.error_invalid` |
| `consent` | Consent page | `consent.title`, `consent.approve`, `consent.deny` |
| `forgot-password` | Forgot password | `forgot-password.title`, `forgot-password.submit` |
| `reset-password` | Reset password | `reset-password.title`, `reset-password.success` |
| `magic-link` | Magic link | `magic-link.sent_title`, `magic-link.check_email` |
| `invitation` | Accept invite | `invitation.title`, `invitation.expired` |
| `logout` | Logout page | `logout.title`, `logout.confirm` |
| `errors` | Error messages | `errors.generic`, `errors.rate_limited`, `errors.token_expired` |
| `emails` | Email content | `emails.magic_link.subject`, `emails.password_reset.subject` |

## Template Engine — `src/auth/template-engine.ts`

### Setup

```typescript
/**
 * Initialize the Handlebars template engine.
 * Registers partials, helpers, and compiles the base layout.
 * Called once at application startup.
 */
export async function initTemplateEngine(): Promise<void>;

/**
 * Render a page template with layout, branding, and i18n.
 *
 * Resolution:
 *   1. Try: templates/{orgSlug}/pages/{pageName}.hbs
 *   2. Fall back: templates/default/pages/{pageName}.hbs
 *
 * The page content is injected into the layout's {{{body}}} placeholder.
 */
export async function renderPage(
  pageName: string,
  context: TemplateContext,
): Promise<string>;
```

### Template Context

```typescript
export interface TemplateContext {
  // Organization branding
  branding: {
    logoUrl: string | null;
    faviconUrl: string | null;
    primaryColor: string;       // Default: '#3B82F6'
    companyName: string;
    customCss: string | null;
  };

  // i18n
  locale: string;
  t: (key: string, options?: Record<string, unknown>) => string;

  // OIDC interaction (when in flow)
  interaction?: {
    uid: string;
    prompt: string;
    params: Record<string, unknown>;
    client: { clientName: string };
  };

  // Flash messages
  flash?: {
    success?: string;
    error?: string;
    info?: string;
  };

  // CSRF
  csrfToken: string;

  // Org slug for route building
  orgSlug: string;

  // Page-specific data (varies by page)
  [key: string]: unknown;
}
```

### Template Directory Structure

```
templates/
├── default/
│   ├── layouts/
│   │   └── main.hbs            # Base HTML shell with {{{body}}}
│   ├── pages/
│   │   ├── login.hbs           # Email/password + magic link form
│   │   ├── magic-link-sent.hbs # "Check your email" confirmation
│   │   ├── consent.hbs         # Scope approval/deny
│   │   ├── forgot-password.hbs # Email input form
│   │   ├── reset-password.hbs  # New password form
│   │   ├── reset-success.hbs   # Password reset success message
│   │   ├── accept-invite.hbs   # Set initial password form
│   │   ├── invite-success.hbs  # Account setup complete
│   │   ├── invite-expired.hbs  # Invalid/expired invitation
│   │   ├── logout.hbs          # Logout confirmation
│   │   └── error.hbs           # Generic error page
│   ├── emails/
│   │   └── (see 04-email-service.md)
│   └── partials/
│       ├── header.hbs          # Page header with branding/logo
│       ├── footer.hbs          # Page footer
│       └── flash-messages.hbs  # Success/error/info flash display
└── {org-slug}/                 # Optional per-org overrides
    └── pages/
        └── login.hbs           # Custom login page for this org
```

### Layout Template (`main.hbs`)

```handlebars
<!DOCTYPE html>
<html lang="{{locale}}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  {{#if branding.faviconUrl}}<link rel="icon" href="{{branding.faviconUrl}}">{{/if}}
  <title>{{pageTitle}} — {{branding.companyName}}</title>
  <style>
    :root { --primary: {{branding.primaryColor}}; }
    /* Minimal default styles for login/consent pages */
    body { font-family: system-ui, sans-serif; margin: 0; padding: 40px 20px; background: #f5f5f5; }
    .container { max-width: 420px; margin: 0 auto; background: white; padding: 32px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .btn-primary { background: var(--primary); color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 16px; width: 100%; }
    .btn-primary:hover { opacity: 0.9; }
    input[type=email], input[type=password], input[type=text] { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px; box-sizing: border-box; }
    label { display: block; margin-bottom: 4px; font-weight: 500; }
    .form-group { margin-bottom: 16px; }
    .flash-error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 12px; border-radius: 4px; margin-bottom: 16px; }
    .flash-success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 12px; border-radius: 4px; margin-bottom: 16px; }
    a { color: var(--primary); }
  </style>
  {{#if branding.customCss}}<style>{{{branding.customCss}}}</style>{{/if}}
</head>
<body>
  <div class="container">
    {{> header}}
    {{> flash-messages}}
    {{{body}}}
    {{> footer}}
  </div>
</body>
</html>
```

## CSRF Protection — `src/auth/csrf.ts`

```typescript
/**
 * Generate a CSRF token for an interaction session.
 * Stores the token in the interaction session (via provider cookie).
 */
export function generateCsrfToken(): string;

/**
 * Verify a CSRF token from a form submission against the stored token.
 * Returns true if valid, false if mismatch or missing.
 */
export function verifyCsrfToken(submitted: string, stored: string): boolean;
```

**Implementation:** CSRF tokens are 32 random bytes (hex). Generated on GET requests, stored in the OIDC interaction session (node-oidc-provider stores interaction state). Verified on POST requests by comparing the `_csrf` form field with the stored value. Uses constant-time comparison via `crypto.timingSafeEqual`.

## Integration Points

- **Template engine** renders pages using i18n `{{t}}` helper
- **Email renderer** uses same Handlebars + i18n infrastructure
- **Interaction routes** call `renderPage()` with appropriate context
- **Branding** extracted from `ctx.state.organization` (set by tenant resolver)
- **CSRF** middleware runs before all POST interaction routes

## Testing Requirements

- i18n: locale resolution chain, translation loading, org overrides, fallback
- Template engine: page rendering, layout injection, partial inclusion, org override resolution
- CSRF: token generation, verification, constant-time comparison
- Handlebars helpers: `{{t}}` helper registration and usage
