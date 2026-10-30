# Invitation Email Context and Templates

> **Parent**: [Index](00-index.md)
> **Authority**: AR #1, #4, #6, #7, #9–11
> **CodeOps Artifact Schema**: 1

## Shared Context Construction

Keep `buildInvitationContext` as the shared path for `sendInvitationEmail` and
`renderInvitationEmail`. Resolve its supplied locale using 03-01, await the prepared tenant
translator, then compute subject and content. No browser language participates (AR #6, #11).

Retain all legacy context properties: `userName`, `inviteUrl`, `orgName`, `expiresIn`, `branding`,
`locale`, `personalMessage`, `inviterName`, and the renderer's `year`. `locale` is now the selected
canonical language, and `expiresIn` is a localized ordinary string. This does not remove or
rename a custom-template variable (AR #6).

Add one invitation-local object, `invitationCopy`, containing ordinary strings for `heading`,
`greeting`, `description`, `htmlInstructions`, `textInstructions`, `expiry`, `acceptLabel`,
`copyLinkLabel` and `personalMessageLabel`. Use full translatable sentences; do not split grammar
around interpolated names or put HTML in resource strings. Subject variants and personal-message
labels distinguish an available inviter name from the existing no-inviter case (AR #6, #10).

Keys live under `emails.invitation`; missing selected-language keys use their English equivalent.
Exact representative copy is owned by ST-11–ST-15. All added keys exist in both bundles and use
the same placeholder names. A brand, recipient name or personal message is data, not translation
input or template source (AR #7, #8, #10).

## Lifetime Formatting

Keep the existing arithmetic: floor to at least one second; use whole days when divisible by
86400, otherwise whole hours when divisible by 3600, otherwise round minutes upward to at least
one. Select explicit singular/plural duration keys with the resulting count. Do not alter the
configured TTL, stored expiry or any existing artifact expiry. Dutch hours use `uur` for both
counts. See ST-14 for boundary examples (AR #1, #9, #10).

## Template Rendering

Change only the shipped invitation HTML/plaintext templates and their context producer; leave
`email-renderer.ts` and all other email types unchanged (AR #4, #6).

- HTML: use ordinary double-brace interpolation for translated copy, names, branding and personal
  messages. Set the document language from the selected canonical locale. Never use `SafeString`,
  translated markup, dynamic compilation or renderer-wide `noEscape` (AR #6, #8).
- Plaintext: interpolate ordinary textual values literally, without HTML-entity encoding. Triple
  braces are permitted for text values only in the `.txt.hbs` invitation template, not HTML.
  Preserve meaningful punctuation and line breaks (AR #6).
- URLs: keep the existing issuer-built invitation URL contract and link destinations. Do not
  build links from language input or translate URL paths/tokens (AR #8, #9).
- Overrides: preserve independent tenant HTML/text lookup and default fallback. Existing custom
  templates retain their own content, including any hardcoded English; adding localized defaults
  does not rewrite tenant files (AR #6).

## Delivery and Failure Boundaries

`InviteUserResult`, `emailDelivery`, `invitationSent`, audit ownership and after-commit delivery
remain unchanged. Do not modify invitation creation transactions or add retries. Translation or
render failures follow the existing send failure result; preview follows its existing protected
API error handling. No raw token, password, message or new infrastructure detail enters a log or
public error (AR #8, #9).

## Test References

Use real i18next resources and Handlebars for ST-09–ST-16. Mock transport only where necessary;
use the existing SMTP/integration fixtures for ST-16 and the shared API-preview path. Test
independent custom HTML/text overrides and legacy variables without modifying real operator
files. No new harness or renderer-level translation mechanism is required (AR #5, #6, #13).
