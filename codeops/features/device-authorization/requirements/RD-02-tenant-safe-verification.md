# RD-02: Tenant-Safe Verification and Approval

> **Document**: RD-02-tenant-safe-verification.md
> **Status**: Draft
> **Created**: 2026-11-24
> **Project**: Porta
> **Depends On**: RD-01
> **CodeOps Artifact Schema**: 1

---

## Feature Overview

This requirement defines what the user sees and what Porta enforces when a device code is approved
in a browser. It covers the code-entry page, the confirmation page, the login/consent/2FA handoff,
the abort path and the success page.

The critical requirement is tenant safety. The provider can load a DeviceCode and its client
globally, while Porta derives the interaction organization from the request URL. Before any client
name, scope or login page is shown, Porta must prove that the DeviceCode client belongs to the
organization in the URL. A mismatch is rejected with the same generic response as an unknown
request.

The pages are Porta-branded and localized. They reuse the existing login methods, two-factor flow,
consent policy and session model. No new authentication policy is introduced.

---

## Functional Requirements

### Must Have

- [ ] `GET /{orgSlug}/device` renders a Porta-branded code-entry page for that organization.
- [ ] The page shows a visible label for the user-code field, a text input, a submit button, and
      the organization's branding. It has no external font, script, image or stylesheet dependency.
- [ ] The page is available in English and Dutch, using the organization's default locale and the
      request's `Accept-Language` fallback.
- [ ] `GET /{orgSlug}/device?user_code=...` follows the provider's transient auto-submit page and
      lands on the branded confirmation page.
- [ ] The confirmation page shows the client name, the user code, the requested scopes and two
      explicit actions: approve and abort. It does not show an IP address or user agent.
- [ ] The code-entry and confirmation forms preserve the provider's action URL, XSRF field and
      exact field names. The provider's CSRF check remains authoritative.
- [ ] Unknown, expired, already-used and aborted user codes all produce the same generic
      "invalid or expired" page. The page allows a new code to be entered.
- [ ] A user code that belongs to a client in another organization produces a generic `404`
      response with no client name, scope, code state or branding derived from the other tenant.
- [ ] A resume request under the wrong organization produces the same generic `404`.
- [ ] A valid same-organization code proceeds through the existing interaction flow:
      - Existing session: SSO is reused; no forced re-login.
      - No session: the organization's configured login methods are shown.
      - Two-factor policy: the existing challenge is enforced; there is no bypass.
      - Consent: `requireConsent=true` shows the existing consent page; trusted clients
        auto-consent after the branded confirmation page.
- [ ] The confirmation page's scopes are the scopes requested by the device authorization request.
      They are displayed even when the client is trusted and will be auto-consented.
- [ ] Aborting on the confirmation page records denial and causes the device poll to receive
      `access_denied`. It never issues tokens.
- [ ] A successful approval renders a static branded success page with the client name and an
      instruction to return to the device. It does not attempt to close the tab and does not
      redirect to the client.
- [ ] The success page never displays the device code.
- [ ] A `429` from the user-code limiter renders a branded generic page with `Retry-After`; it does
      not reveal whether a code exists.
- [ ] The pages use Porta's existing branding, template layout, CSP and accessibility patterns.
      Inline styles are allowed; external resources are not.
- [ ] The `interactionUrl` hook stores the validated client's organization when the provider context
      exposes it, falling back to the request organization only for flows without a loaded client.
- [ ] Existing login, magic-link, two-factor, consent and abort routes remain unchanged for
      authorization-code flows.

### Should Have

- [ ] The page title, headings and button labels are translated through the existing locale files.
- [ ] The code input uses uppercase display, `autocomplete="off"`, `autocapitalize="characters"`,
      `spellcheck="false"` and a bounded length.
- [ ] The confirmation page groups scopes with human-readable labels where the existing consent
      page already does so.

### Won't Have (Out of Scope)

- Device registration, device names, device trust or device management.
- A custom hosted-UI device page hook — the provider-rendered Porta pages are documented instead.
- QR-code rendering in the browser or server.
- Changes to login methods, 2FA policy, consent policy or session lifetime.
- New audit event implementation — RD-05 owns the events; RD-02 supplies the decision points.
- Admin UI for device approvals.

---

## Technical Requirements

### Cross-tenant verification control

Add one middleware on the organization-prefixed OIDC router. It runs after tenant resolution and
body parsing, and before the provider callback, for these routes:

| Method | Path | Check |
| --- | --- | --- |
| `GET` | `/{orgSlug}/device` | If `user_code` is present, resolve the DeviceCode client and compare organizations |
| `POST` | `/{orgSlug}/device` | Resolve the submitted `user_code` and compare organizations before the provider handles it |
| `GET` | `/{orgSlug}/device/:uid` | Resolve the interaction's DeviceCode client and compare organizations before resuming |

The middleware follows this algorithm:

1. Read the organization from `ctx.state.organization` (the tenant resolver already validated the
   slug).
2. For a user-code request, normalize the code with the same rule the provider uses: uppercase and
   remove non-word characters.
3. Resolve the pending DeviceCode and its `clientId`. A missing or expired code is left for the
   provider's generic page; it is not a tenant mismatch.
4. Resolve the client's `organizationId` from the authoritative client record.
5. If the client is missing, foreign or belongs to another organization, respond with the generic
   `404` page and stop. Do not call the provider, create an interaction, show a client name, write
   an audit approval or set a login session.
6. Otherwise continue to the provider.

For the resume route, resolve the interaction record and its `deviceCode` identifier, then resolve
the DeviceCode client. Do not trust the URL organization or the stored `interaction:org` value
alone. The stored value is a fallback only after the client check passes.

The `interactionUrl` hook in `provider.ts` is hardened to prefer
`ctx.oidc.client.organizationId` when a client is loaded. The request organization remains the
fallback for flows where no client is available yet. This is defense in depth; it does not replace
the middleware.

### Branded page rendering

Three provider hooks replace the default pages:

| Hook | Purpose |
| --- | --- |
| `userCodeInputSource` | Code-entry page and generic invalid/expired/aborted states |
| `userCodeConfirmSource` | Confirmation page with client, code, scopes, approve and abort |
| `successSource` | Static approval success page |

The hooks use the existing `renderPage` template engine, `resolveEffectiveBranding`, `resolveLocale`
and `getTranslationFunction`. Add `device` page templates and English/Dutch locale entries.

The organization is resolved from `ctx.req._portaOrganization` first, then from the loaded client's
`organizationId`, then from the session account as the existing helper does. The initial code-entry
page has no client, so the request organization is the only correct source.

The hook must not reflect raw error objects, provider stack information or user-supplied text. The
invalid-code message is a fixed translation. The user code may be displayed on the confirmation
page because the user just entered it; the device code is never displayed.

### Forms and CSRF

The provider supplies a prebuilt form with the correct action URL, XSRF value and field names. The
Porta form must preserve those exact values. The implementation may either:

- render the Porta layout around the provider form, adding a visible label and accessible
  attributes; or
- build a Porta-owned form from the provider action and XSRF value while keeping the exact field
  names `xsrf`, `user_code`, `confirm` and `abort`.

The second option is preferred for accessibility because it gives the input a real `id` and label.
The XSRF value is read from the trusted provider form, not invented. The form must work with the
provider's existing `checkXsrf` middleware.

The confirmation form contains the provider XSRF value, the exact user code, an approve submission
with `confirm=yes`, and an abort submission with `abort=yes`. The abort path must remain a POST; a
GET link must not approve or abort.

### Login, consent and two-factor handoff

After a valid confirmation, the provider's normal interaction pipeline runs. Porta must not
duplicate or bypass it:

1. If the browser has a valid session, SSO is reused.
2. Otherwise the existing login page is shown. The organization's effective login methods and the
   client's login-method override apply.
3. Existing lockout, failed-login, rate-limit and 2FA rules apply unchanged.
4. If the client requires consent, the existing consent page is shown after login.
5. If the client is trusted, the existing consent gate auto-consents the scopes already shown on the
   confirmation page.
6. The provider writes the account, grant, scope, authentication time, ACR/AMR and session binding to
   the DeviceCode.

No device-specific login bypass, remember-me path or consent shortcut is added.

### State and error behavior

| User-visible state | Response |
| --- | --- |
| Code entry | `200` branded form |
| Valid code, same organization | `200` branded confirmation |
| Unknown code | `200` generic invalid-or-expired form |
| Expired code | `200` generic invalid-or-expired form |
| Already-used code | `200` generic invalid-or-expired form |
| Aborted confirmation | `200` generic invalid-or-expired form; device receives `access_denied` |
| Cross-tenant code or resume | `404` generic not-found page; no interaction |
| User-code limiter exhausted | `429` branded generic page with `Retry-After` |
| Login required | Existing `/interaction/:uid` flow |
| Consent required | Existing consent page |
| Approved | `200` branded static success page |

> **Preflight consistency correction (2026-11-25):** AC-4 requires the same generic invalid-or-expired
> page for aborted codes. The earlier state-table wording (“generic cancelled form”) was
> inconsistent; the plan now renders the generic page while the device receives `access_denied`.

The transient `verification_uri_complete` auto-submit page is provider-owned and may be unstyled.
It immediately posts to the branded confirmation page. It must not be treated as the user-facing
approval page.

### Localization and accessibility

Add locale entries for:

- Page title and heading.
- Code-entry instructions.
- Invalid-or-expired message.
- Cancelled message.
- Confirmation title, client label, code label, scope label.
- Approve and abort buttons.
- Success title and return-to-device instruction.
- Rate-limit message.

The pages must satisfy the project's existing page-quality checks: a document language, a visible
heading, labeled form controls, keyboard-reachable actions, visible focus, sufficient contrast,
no external resource dependency, and no autoplay or motion.

### CSP and resources

The pages use the existing HTML CSP builder and organization branding image sources. They do not
load Google Fonts, external scripts or third-party styles. Inline styles needed by the provider form
are allowed by the existing HTML CSP. The response must not expose stack traces or internal paths.

---

## Integration Points

### With RD-01 (Provider Capability and Protocol)

RD-02 consumes the device authorization and token endpoints, the DeviceCode model and the
single-use/expiry behavior. The tenant middleware is required before the feature is exposed.

### With RD-03 (Client Contracts and Administration)

RD-03 documents the custom-UI boundary: code entry, confirmation and success are Porta-rendered;
the host UI still owns the login and consent interaction pages. RD-02 does not add a custom-UI hook.

### With RD-04 (CLI Device Login)

RD-04 prints the verification URL and user code. It depends on these pages being reachable and
branded for the selected organization.

### With RD-05 (Security Operations and Assurance)

RD-05 implements the user-code limiter and its `429` response, audit events for approval/denial and
the penetration tests for cross-tenant approval. RD-02 supplies the page templates and decision
points.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
| --- | --- | --- | --- | --- |
| Approval page owner | Porta-branded pages / provider defaults | Porta-branded pages | Matches login/consent branding and localization. | AR-3 |
| Session policy | Reuse SSO / force login | Reuse SSO | Consistent with other OIDC flows; code entry and confirmation are explicit. | AR-13 |
| Consent policy | Reuse `requireConsent` / always consent | Reuse existing policy | Trusted clients already rely on auto-consent; scopes are shown on the confirmation page. | AR-14 |
| Invalid-code detail | Generic / distinguish states | Generic message | Avoids code-state probing and keeps the page simple. | AR-15 |
| Cross-tenant handling | Generic 404 / allow / warn | Generic 404 before provider | Prevents the critical tenant-confusion path. | AR-29 |
| Success behavior | Static page / auto-close / redirect | Static page | Reliable across browsers; no redirect URI for device clients. | AR-25 |
| Custom UI | Porta pages + doc note / hook | Porta pages and documented boundary | Smallest safe surface; host UI keeps login and consent. | AR-23 |
| Code presentation | Upstream base-20 / digits | Upstream base-20 | Consistent with RD-01. | AR-24 |

---

## Security Considerations

- **Data sensitivity:** The confirmation page displays the user code and requested scopes. It never
  displays the device code. No IP address or user agent is shown or stored.
- **Input validation:** The user code is normalized and bounded before lookup. The provider validates
  the XSRF token and the exact field names. The tenant middleware validates the organization before
  any client data is shown.
- **Authentication and authorization:** The flow reuses the existing login, lockout, 2FA and consent
  controls. No bypass is introduced. Cross-tenant code and resume requests are rejected before an
  interaction or session is created.
- **Injection risks:** Handlebars escapes user-visible values. The provider form HTML is trusted and
  must not include user input. The user code is escaped when displayed. SQL lookup is parameterized.
- **Encryption:** TLS protects the pages and forms; the existing session cookie flags remain in
  force. No new secret store is introduced.
- **Rate limiting:** The user-code limiter is mandatory before the feature is enabled; RD-05 owns its
  thresholds and response. The page must not leak code existence when throttled.
- **Infrastructure:** No new service, asset host, font provider or dependency is added.

---

## Acceptance Criteria

1. [ ] `GET /{orgSlug}/device` returns a branded page with a labeled user-code input and submit
   button, the organization's branding, and no external resource requests.
2. [ ] The page renders in English and Dutch using the organization default and `Accept-Language`
   fallback; unknown locales fall back to English.
3. [ ] `GET /{orgSlug}/device?user_code=...` reaches the branded confirmation page with the client
   name, exact user code and requested scopes.
4. [ ] Unknown, expired, used and aborted codes each render the same generic invalid-or-expired
   message and allow a retry; they do not reveal the specific state.
5. [ ] A code for a client in another organization returns `404`, shows no client name or scopes,
   creates no interaction and does not create a session or token.
6. [ ] A resume request under the wrong organization returns `404` and never resumes the
   interaction.
7. [ ] A valid same-organization code with an existing session proceeds without a second login and
   reaches the success page after approval.
8. [ ] A valid same-organization code without a session shows the configured login methods; a user
   with 2FA completes the existing challenge before approval.
9. [ ] A client with `requireConsent=true` shows the existing consent page; a trusted client
   auto-consents after the confirmation page, which displays the scopes.
10. [ ] Aborting the confirmation sends `access_denied` to the device poll and issues no token.
11. [ ] The success page is static, branded, shows the client name, instructs the user to return to
    the device, and does not call `window.close()` or redirect.
12. [ ] A limiter `429` renders a branded generic page with `Retry-After` and no code-state detail.
13. [ ] The provider XSRF check rejects a missing or mismatched token; the exact field names
    `xsrf`, `user_code`, `confirm` and `abort` are preserved.
14. [ ] The pages pass the existing page-quality checks for language, heading, labels, keyboard
    access, focus and contrast.
15. [ ] The device code and raw provider errors never appear in the HTML.
16. [ ] Existing password, magic-link, 2FA, consent and authorization-code UI tests remain green.
17. [ ] Security requirements verified: cross-tenant rejection, input normalization, XSRF, no secret
    display, no external resources.
