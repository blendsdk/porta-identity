# Invitation Acceptance Rendering and Security

> **Parent**: [Index](00-index.md)
> **Authority**: AR #1, #2, #7–13
> **CodeOps Artifact Schema**: 1

## Two Locale Contexts

Each request has a **baseline** context: browser preferences, organization default, global
default, then English. It contains no invitation-derived information. A **valid-invitation**
context additionally permits the stored invitation locale in the slot defined by 03-01.
Prepare translation functions only for the context actually rendered; preserve the baseline
selection so a late rejection can render it instead (AR #2, #7, #8).

### GET

Keep token hashing and organization-qualified valid-token lookup. Reject missing/expired/used/
foreign-tenant records and email conflicts through the baseline generic page. Only after both
checks succeed may the row's locale/details affect the confirmation or password form. GET must
not consume the token or create an account (AR #8).

### POST

1. Resolve only request/organization baseline authority before CSRF handling. A failed CSRF check
   uses this context and performs no invitation lookup.
2. Perform the existing scoped valid-token lookup. Add the same email-conflict check used by GET
   before granting the invitation's language or presenting password errors.
3. Select the valid-invitation context and validate the form using existing policy.
4. Call the existing atomic acceptance service. Preserve preassignments, audits and account locale.
5. If acceptance returns null, discard invitation-derived rendering authority and use the
   baseline generic rejection. Do not reuse the previously selected invitation translator.

This extra conflict gate and the late-null handling are necessary to preserve rejection equality
under localization, not authorization to redesign acceptance. No transaction, lock, retry or
token-consumption changes are proposed (AR #8, #9).

## Copy, Titles and Validation

All invitation page contexts provide an explicit translated `pageTitle` from the existing
invitation page-title keys. Keep the page engine, routes, form actions, CSRF fields, focus order,
branding and button semantics. Formal Dutch copy preserves the original meaning (AR #10).

Add missing `invitation.error_password_mismatch` and `invitation.success` resources in both
languages while retaining existing keys for custom templates. Add localized minimum/maximum
password messages. Their expected copy is owned by ST-21–ST-22 (AR #10, #12).

In `packages/server/src/users/password.ts`, add a closed internal failure reason for too-short
and too-long results. Use a documented enum or frozen constants and a corresponding type, per
project conventions. Preserve `isValid`, the legacy English `error`, and all length/crypto rules;
successful results remain unchanged. Add no externally returned API field. Invitation rendering
maps the reason to its localized resource and the existing exported length constants. An
unexpected invalid reason gets the generic translated error, not raw internal text (AR #10).

Do not match English error strings or reproduce password-validation policy in the route.
Unrelated password consumers continue using their existing `error` property. The internal
additive result and mocks are within AR #12's bounded test updates.

## Security Invariants

| Boundary                          | Required result                                                           | Specification cases |
| --------------------------------- | ------------------------------------------------------------------------- | ------------------- |
| Every generic rejection cause     | Same baseline-language page, status and non-sensitive context             | ST-23–ST-24         |
| Invalid CSRF                      | Existing 403; no invitation lookup or mutation                            | ST-22, ST-25        |
| Valid token under another tenant  | No foreign locale, name, address or state enters the response             | ST-23, ST-26        |
| Repeated GET/replay/late conflict | Existing non-mutating GET and atomic single-use authority remain          | ST-24, ST-27        |
| Untrusted dynamic content         | HTML escaped once; no executable markup from translations or message data | ST-13, ST-26        |
| Parallel organizations/locales    | Render-local language and override values never cross requests            | ST-10, ST-26        |

Keep the existing rate limits, Secure/HttpOnly/SameSite and CSRF protections, headers, tenant
resolver, audit redaction and generic errors. No new authentication surface, credential or
infrastructure is added. Existing security specification assertions remain immutable; setup
mocks may support the async translator while preserving the same assertions (AR #8, #12).

## Failure Boundaries

Missing translations/overrides follow 03-01. Valid-flow processing failures use a generic localized
error without exposing the exception; a rejection that uses the expired-invite path always uses
baseline authority. Logs/audits retain their existing safe event contract; do not log translation
data or rejected token contents. Service/infrastructure failures remain failures, not successful
acceptance or automatic retries (AR #7–9).
