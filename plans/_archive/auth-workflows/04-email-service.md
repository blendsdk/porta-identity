# Email Service: Auth Workflows

> **Document**: 04-email-service.md
> **Parent**: [Index](00-index.md)

## Overview

Pluggable email delivery system with SMTP transport (Nodemailer), Handlebars HTML/plaintext templates, organization branding, and i18n support. Emails are sent fire-and-forget with audit logging.

## Architecture

```
EmailService (high-level API)
    ↓ uses
EmailRenderer (Handlebars template → HTML/text)
    ↓ uses
EmailTransport (pluggable interface → SMTP via Nodemailer)
```

## Implementation Details

### Email Transport Interface — `src/auth/email-transport.ts`

```typescript
/** Options for sending an email */
export interface SendEmailOptions {
  to: string;
  from?: string;         // Falls back to org config or global SMTP_FROM
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

/** Result of sending an email */
export interface EmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

/** Pluggable transport interface — SMTP is the default, others can be added */
export interface EmailTransport {
  send(options: SendEmailOptions): Promise<EmailResult>;
}

/**
 * Create the SMTP email transport using Nodemailer.
 * Reads SMTP configuration from the app config.
 */
export function createSmtpTransport(): EmailTransport;
```

**SMTP transport implementation:**
- Uses `nodemailer.createTransport()` with config from `config.smtp.*`
- `secure: true` when port is 465
- Auth only when `smtp.user` is provided (MailHog doesn't need auth)

### Email Renderer — `src/auth/email-renderer.ts`

Renders Handlebars email templates with branding and i18n context.

```typescript
/**
 * Render an email template (HTML + plaintext) with the given context.
 *
 * Template resolution:
 *   1. Try: templates/{orgSlug}/emails/{templateName}.hbs
 *   2. Fall back: templates/default/emails/{templateName}.hbs
 *
 * Both .hbs (HTML) and .txt.hbs (plaintext) versions are rendered.
 */
export async function renderEmail(
  templateName: string,
  orgSlug: string,
  context: Record<string, unknown>,
): Promise<{ html: string; text: string }>;
```

**Context variables available to all email templates:**
- `branding.logoUrl`, `branding.primaryColor`, `branding.companyName`
- `t(key)` — i18n translation function (via Handlebars helper)
- `year` — current year (for footer copyright)
- Custom context per email type (e.g., `magicLinkUrl`, `resetUrl`, `userName`)

### Email Service — `src/auth/email-service.ts`

High-level API for sending specific email types. Each method:
1. Loads org branding
2. Renders HTML + plaintext templates via email renderer
3. Sends via transport
4. Writes audit log

```typescript
/**
 * Send a magic link email to a user.
 */
export async function sendMagicLinkEmail(
  user: User, org: Organization, magicLinkUrl: string, locale: string
): Promise<void>;

/**
 * Send a password reset email to a user.
 */
export async function sendPasswordResetEmail(
  user: User, org: Organization, resetUrl: string, locale: string
): Promise<void>;

/**
 * Send an invitation email to a newly created user.
 */
export async function sendInvitationEmail(
  user: User, org: Organization, inviteUrl: string, locale: string
): Promise<void>;

/**
 * Send a welcome email (for passwordless users).
 */
export async function sendWelcomeEmail(
  user: User, org: Organization, locale: string
): Promise<void>;

/**
 * Send a password-changed confirmation email.
 */
export async function sendPasswordChangedEmail(
  user: User, org: Organization, locale: string
): Promise<void>;
```

**Fire-and-forget pattern:** Email send failures are caught, logged as warnings, and audit-logged with `email.send.failed` event type. They never propagate errors to callers.

### Email Templates

Located in `templates/default/emails/`:

| Template | Context Variables |
| --- | --- |
| `magic-link.hbs` / `magic-link.txt.hbs` | `userName`, `magicLinkUrl`, `expiresMinutes`, `branding.*` |
| `password-reset.hbs` / `password-reset.txt.hbs` | `userName`, `resetUrl`, `expiresMinutes`, `branding.*` |
| `invitation.hbs` / `invitation.txt.hbs` | `userName`, `inviteUrl`, `orgName`, `expiresdays`, `branding.*` |
| `welcome.hbs` / `welcome.txt.hbs` | `userName`, `loginUrl`, `orgName`, `branding.*` |
| `password-changed.hbs` / `password-changed.txt.hbs` | `userName`, `branding.*` |

**Template structure (HTML):**
```handlebars
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  {{#if branding.logoUrl}}
  <img src="{{branding.logoUrl}}" alt="{{branding.companyName}}" style="max-height: 48px;">
  {{/if}}
  <h2 style="color: {{branding.primaryColor}};">{{t "emails.magic_link.title"}}</h2>
  <p>{{t "emails.magic_link.greeting" name=userName}}</p>
  <p><a href="{{magicLinkUrl}}" style="background: {{branding.primaryColor}}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">{{t "emails.magic_link.button"}}</a></p>
  <p style="color: #666;">{{t "emails.magic_link.expires" minutes=expiresMinutes}}</p>
  <hr>
  <p style="font-size: 12px; color: #999;">{{branding.companyName}} · {{year}}</p>
</body>
</html>
```

## Integration Points

- **Config**: SMTP settings from `src/config/index.ts` (`config.smtp.*`)
- **Organizations**: Branding from `Organization` type (logo, colors, name)
- **i18n**: Translation function from `src/auth/i18n.ts`
- **Audit log**: `writeAuditLog()` for send success/failure tracking

## Error Handling

| Error Case | Handling |
| --- | --- |
| SMTP connection failure | Catch, log warning, audit "email.send.failed" |
| Template not found | Throw at startup (fail-fast — templates are required) |
| Invalid email address | Nodemailer rejects, caught in fire-and-forget |

## Testing Requirements

- Transport: mock Nodemailer, verify `sendMail` called with correct options
- Renderer: verify template resolution (org override → default fallback)
- Service: verify each email type renders and sends correctly
- Fire-and-forget: verify errors are caught and logged, not thrown
