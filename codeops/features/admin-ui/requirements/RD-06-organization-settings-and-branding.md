# RD-06: Organization Settings and Branding

> **Document**: RD-06-organization-settings-and-branding.md
> **Status**: Approved
> **Created**: 2026-09-10
> **Feature**: Porta Admin UI
> **Depends On**: RD-02, RD-04
> **CodeOps Artifact Schema**: 1

## Feature Overview

Add a focused workspace for administering the active organization's identity, authentication
defaults, lifecycle, branding settings, and existing logo/favicon assets. The workspace is opened
through `Organizations → Manage current organization…`; it complements rather than replaces the
existing create, switch, and permanent Delete workflows. (AR-136)

The workspace follows the established primary-module recipe: one maximized organization surface,
one TabView with `Overview`, `Authentication`, and `Branding`, and Layout DSL ownership of sizing.
Each settings tab saves only its own valid changes. Binary asset operations are immediate and
independent from the Branding settings Save. (AR-137, AR-142)

RD-06 also finishes the existing branding-asset feature across the SDK, server, public authentication
templates, email templates, and terminal UI. The implementation stays narrow: one JSON/base64
upload contract, one shared effective-branding resolver, one public asset route, and the matching
JSVision file-dialog package. It does not add multipart compatibility, a storage abstraction,
object storage, a CDN, image processing, or terminal image preview. (AR-142–AR-149)

## Minimum-Sufficient Design

| Concern           | Direct design                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Entry             | One active-organization menu action; existing switcher remains authoritative for selection |
| Overview          | Editable name/default locale, read-only identity/status/dates, and Activate/Suspend        |
| Authentication    | Two login-method checkboxes and one existing 2FA-policy choice                             |
| Branding settings | Company name, primary color, fallback logo URL, and fallback favicon URL                   |
| Branding assets   | Immediate Add/Replace/Remove for one logo and one favicon, with metadata only              |
| SDK repair        | Truthful asset listing and JSON/base64 upload methods                                      |
| Public rendering  | Uploaded asset first, configured URL second, default presentation last                     |
| Failure handling  | Reload displayed state after a partial or unknown outcome; never retry a mutation          |

## Domain Model

```text
Active Organization
├── Overview settings and lifecycle
├── Login-method defaults ──> inherited by eligible OIDC clients
├── Password-login 2FA policy ──> applies organization-wide
└── Branding
    ├── text settings and fallback URLs
    ├── optional uploaded logo
    └── optional uploaded favicon

Effective image = uploaded asset > configured fallback URL > Porta default/no image
```

| Term                 | Meaning                                                                               |
| -------------------- | ------------------------------------------------------------------------------------- |
| Active organization  | The session-memory organization currently selected for administration.                |
| Login-method default | An organization setting used only by OIDC clients configured to inherit it.           |
| Two-factor policy    | The organization-wide second step applied after username/password authentication.     |
| Fallback URL         | A configured external image URL used only when no uploaded asset of that type exists. |
| Effective branding   | The resolved company name, color, logo, and favicon supplied to a page or email.      |
| Branding asset       | One organization-owned validated logo or favicon stored as PostgreSQL binary data.    |

## Functional Requirements

### Must Have

- [ ] **AC-01 — Navigation and context:** add `Manage current organization…` to the existing
      `Organizations` menu. It is visible-disabled when no organization is selected or the actor
      lacks `admin:org:read`. Opening it snapshots the active organization identity and discards
      stale responses after an organization or authenticated-session change. It does not create a
      second organization browser or alter the switcher. (AR-136)
- [ ] **AC-02 — Organization workspace:** open one maximized organization detail surface captioned
      with the organization context and containing `Overview`, `Authentication`, and `Branding`
      tabs. Use Layout DSL for all sizes and positions. The workspace requires a terminal of at least
      49×19, matching the native JSVision file dialog, and keeps navigation separate from operations.
      Do not add a compact fallback or custom file picker. (AR-137)
- [ ] **AC-03 — Overview fields:** show immutable ID, Slug, Status, Created, and Updated values.
      Created and Updated use the shared human-readable UTC date/time formatter. Permit editing
      only Name and Default locale. Name remains subject to the existing server validation. The
      locale control offers the shipped `en` locale; an existing unknown value remains visible and
      unchanged until the administrator selects `en`. Save is enabled only when values are locally
      valid, changed, and the actor has `admin:org:update`. (AR-138)
- [ ] **AC-04 — Organization lifecycle:** expose Activate for a suspended organization and Suspend
      for an active organization when the actor has `admin:org:suspend`. Suspending uses a focused
      `Are you sure?` confirmation. The super-admin organization cannot be suspended and its action
      remains visible-disabled with a fixed explanation. Permanent Delete remains exclusively in
      the organization switcher under RD-10. (AR-136, AR-138)
- [ ] **AC-05 — Login methods:** the Authentication tab represents Password and Magic link as
      independent checkboxes. At least one must remain selected. Save is disabled when neither is
      selected, no value changed, or `admin:org:update` is unavailable. The request uses the
      existing organization login-method endpoint and does not force a single method. (AR-139)
- [ ] **AC-06 — Two-factor policy:** the Authentication tab offers exactly Optional, Required email
      OTP, Required authenticator/TOTP, and Require either. It loads and updates the existing
      organization 2FA-policy resource without adding an ETag workflow. The policy is the second
      step after username/password authentication only. A valid magic link completes passwordless
      authentication without an additional email-OTP or TOTP prompt. A compact note explains this
      boundary and that a stronger password-login policy takes effect at each user's next password
      authentication. User enrollment statistics and individual-user controls remain in RD-07.
      (AR-139, AR-140)
- [ ] **AC-07 — Authentication guidance:** show concise non-invasive text explaining that login-
      method defaults affect OIDC clients configured to inherit them, while the password-login 2FA
      policy applies organization-wide. Do not add a client preview, inheritance simulator, or
      cross-client bulk update. (AR-140)
- [ ] **AC-08 — Authentication save boundary:** one Authentication Save sends only changed settings
      through the existing separate endpoints. If one request fails after another succeeds, reload
      both displayed resources once and show a clear sanitized failure message. Do not add ETag
      handling, a combined endpoint, cross-request database transaction, compensation, or automatic
      retry. (AR-137)
- [ ] **AC-09 — Branding settings:** permit editing Company name, Primary color, fallback Logo URL,
      and fallback Favicon URL. Blank company name resolves to the organization name. Resetting the
      color restores Porta's default. Save sends only these text settings and is enabled only when
      they are valid, changed, and the actor has `admin:org:update`. Custom CSS remains supported by
      the API/CLI but is not exposed here; template editing is outside RD-06. (AR-141)
- [ ] **AC-10 — Branding URL validation:** accept HTTPS image URLs. Outside production only, also
      accept HTTP URLs whose host is exactly `localhost`, `127.0.0.1`, or `::1`. Trim surrounding
      whitespace and reject credentials, invalid URLs, `data:`, `file:`, and every other scheme.
      The server is authoritative and applies the same rule to external API and SDK input. (AR-148)
- [ ] **AC-11 — Asset presentation:** the Branding tab always shows separate Logo and Favicon rows.
      Each row shows whether an upload exists plus its media type, decoded byte size, and
      human-readable updated date. Add or Replace opens the native JSVision file dialog; Remove uses
      a focused `Are you sure?` confirmation. No terminal bitmap preview is rendered. Controls are
      visible-disabled without `admin:org:update`. (AR-142, AR-143)
- [ ] **AC-12 — Immediate asset operations:** Add/Replace reads the selected file, validates the
      supported image type and decoded size locally for feedback, and immediately uploads it.
      Remove immediately deletes the stored asset after confirmation. Success reloads the asset
      list. Failure preserves the last authoritative metadata and shows a sanitized outcome.
      Branding text Save neither stages nor repeats asset mutations. (AR-142)
- [ ] **AC-13 — Asset formats and limits:** support PNG, JPEG, WebP, ICO, and SVG. Validate actual
      content using the established server image validator before storage. A logo may contain at
      most 2 MiB of decoded image bytes; a favicon at most 512 KiB. Reject a declared media type that
      does not match validated content. Storage remains one PostgreSQL `bytea` row per organization
      and asset type; base64 is transport encoding only. Do not add another image parser or
      sanitizer framework. (AR-144)
- [ ] **AC-14 — SDK asset contract:** replace the misleading branding `getSettings()` operation
      with `listAssets()`. Organization text settings continue to come from `organizations.get()`.
      `uploadAsset()` requires the media type and sends the server's validated JSON body containing
      base64 data and content type. No compatibility shim or parallel raw/multipart contract is
      retained. Keep branding `updateSettings()` and correct its return type to `Organization`.
      SDK types, tests, and conventional documentation match the server responses. (AR-145)
- [ ] **AC-15 — Public asset delivery:** expose `GET /:orgSlug/branding/:type`, where `type` is
      exactly `logo` or `favicon`, for active and suspended organizations. Return validated bytes
      with their stored media type, an ETag, and `Cache-Control: public, no-cache`. Unknown
      organizations, unsupported types, and missing assets produce the same minimal public `404`.
      The route requires no authentication, emits no cookies, exposes no storage metadata, and
      never lists assets. SVG responses also set `X-Content-Type-Options: nosniff` and a restrictive
      CSP sandbox so direct navigation cannot execute scripts or load external resources. Templates
      render assets only through `<img>`. (AR-146)
- [ ] **AC-16 — Effective branding:** one shared resolver builds effective branding for public page
      and email contexts. An uploaded asset uses an absolute URL to AC-15; otherwise the configured
      fallback URL is used. Company name and primary-color defaults follow AC-09. Default page and
      email templates consume the effective values without learning storage details. Existing
      organization-specific template overrides receive the same context contract. If the optional
      asset lookup fails, use already validated configured settings and then Porta defaults, and
      emit only a bounded sanitized diagnostic. Build absolute asset URLs only from the trusted
      configured issuer base URL; request host headers cannot affect them. Do not retry the lookup.
      (AR-147)
- [ ] **AC-17 — Content security policy:** public authentication pages permit only the image origins
      required by effective branding: their own origin for uploaded assets and the validated origin
      of an external fallback URL when present. `img-src` also permits `data:` for Porta-generated
      images such as the TOTP QR code. Do not broaden script, style, frame, connection, or default
      directives. Invalid branding must not weaken CSP or prevent the page from rendering. (AR-147,
      AR-148)
- [ ] **AC-18 — Bounded request-size changes:** retain the global Admin API JSON limit. Apply a
      route-specific 3 MiB encoded-body limit and the same narrow limit in bundled reverse-proxy
      configuration. The decoded limits remain 2 MiB for logos and 512 KiB for favicons.
      Validate the upload body with existing Zod base64 and media-type validation, require nonempty
      data, and enforce the decoded-size limit before passing bytes to the image validator.
      Malformed or oversized requests fail before persistence with a sanitized client error. Add a
      forward migration that changes the existing database size constraint; do not rewrite an
      applied migration. (AR-144)
- [ ] **AC-19 — Authorization and isolation:** read controls use `admin:org:read`; settings and asset
      mutations use `admin:org:update`; lifecycle mutations use `admin:org:suspend`. The UI
      capability snapshot controls affordances only. Server middleware remains authoritative.
      Every read and mutation is scoped to the route organization, and no asset or setting may be
      read or changed across organizations through an Admin API request. (AR-136–AR-142)
- [ ] **AC-20 — Mutation reconciliation:** the Admin UI does not send optional ETag preconditions.
      Every successful mutation reloads the affected displayed resource. Partial failures and
      unknown network outcomes reload the affected displayed state once. No automatic retry,
      optimistic update, polling, UI lock, or distributed lock is introduced. (AR-137)

### Should Have

- [ ] **AC-21 — Accessible operation feedback:** field errors identify the affected input, file
      rejection identifies type or size without echoing file content, and screen-reader/status text
      distinguishes unchanged, saving, saved, failed, and reloaded-after-failure states.
- [ ] **AC-22 — Stable focus:** closing a lifecycle, file, or removal dialog returns focus to its
      launcher. Successful saves retain the active tab. An organization-context change closes the
      stale workspace and returns to the ordinary selected-organization state.

### Won't Have

- A second organization browser, replacement switcher, or permanent Delete inside this workspace.
- User 2FA enrollment statistics or individual-user 2FA controls; RD-07 owns them.
- A custom CSS editor, template editor, live theme preview, or terminal bitmap preview.
- Multipart/raw upload compatibility, image resizing or conversion, a media library, object
  storage, CDN integration, storage abstraction, or background image processing. (AR-149)
- A combined authentication-settings endpoint, distributed transaction, merge UI, automatic retry,
  polling, or multi-administrator locking.

## Technical Requirements

### Admin UI and JSVision

- Add exact runtime dependency `@jsvision/files@1.7.1`, matching the existing JSVision packages.
- Use `openFile()` and its filter callback for supported image selection. Do not build or embed a
  second file browser. (AR-143)
- Extend the validated Admin capability shape with the existing organization update and suspend
  capabilities needed to render accurate enabled/disabled states.
- Reuse the shared human-readable date formatter, focused confirmation dialogs, validated form
  bindings, and context-epoch stale-response protection.

### Server and persistence

- Reuse the existing organization settings, login-method, 2FA-policy, and branding-asset route
  families. Add only the public asset-read route required by AC-15. Mount that route before the
  OIDC catch-all and give it a direct exact-slug lookup that permits active and suspended
  organizations; do not weaken or reuse the normal suspended-organization tenant resolver.
- Add a new ordered PostgreSQL migration to replace the existing asset-size check with a
  type-sensitive constraint: logo at most 2 MiB and favicon at most 512 KiB.
- Keep one binary row for each `(organization_id, asset_type)` and preserve the existing database
  uniqueness and cascade behavior.
- Resolve effective branding through one shared service used by page and email context builders.
  It returns presentation URLs and settings, never raw asset bytes.
- Keep errors minimal and fixed-shape. Never log or return asset bytes, base64 data, filesystem
  paths, SQL details, internal stack traces, or organization-existence differences.

### Verification boundary

- Specification tests cover all acceptance criteria before implementation tests are changed.
- Server unit/integration/E2E/pentest coverage includes authorization, tenant isolation, public
  404 equivalence, media-signature mismatch, SVG safety, decoded-size boundaries, body limits,
  ETag/cache behavior, URL validation, CSP narrowing, fallback precedence, and template/email
  context resolution.
- SDK tests cover the corrected list and JSON/base64 upload contracts without compatibility paths.
- CLI tests cover tabs, validation, capability states, immediate asset operations, partial
  Authentication failure, context changes, focus, and 80×24/49×19 reachability.
- Run affected server, SDK, and CLI workspace verification plus `yarn test:structure` and
  `yarn test:ui`. Run the registered security assurance project with the `production-security`
  profile because public authentication rendering and CSP change. Run the relevant clean-revision
  `yarn assurance:compat` selector for the SDK contract change. Do not use root `yarn verify` for
  this experimental Admin UI workflow, per the user's standing instruction.

## Security and Privacy Constraints

- The public route reveals only bytes for an exact known organization slug and asset type. Its
  indistinguishable `404` behavior prevents using it as an organization or asset inventory.
- File extensions and client-provided media types are hints only. The server validates content and
  passes supported SVG through the established image validator before storage. SVG is rendered only
  as an image and receives restrictive direct-navigation response headers.
- External branding URLs cannot carry credentials or non-web schemes. Production never permits
  plaintext HTTP resources.
- CSP changes are computed from already validated effective branding and add only `img-src`
  origins; they do not weaken other protections.
- Admin UI authorization never replaces server-side RBAC or organization scoping.

## Edge Cases and Failure States

| Condition                                        | Required result                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| No active organization                           | Manage action remains visible-disabled; no request is sent             |
| Organization changes while loading               | Stale result is discarded and the old workspace closes                 |
| No login method selected                         | Authentication Save remains disabled with a field-level message        |
| Authentication partial failure                   | Reload both displayed resources once and show a sanitized failure      |
| File dialog cancelled                            | No mutation and no error message                                       |
| Unsupported, spoofed, unsafe, or oversized image | Reject before persistence; preserve prior asset                        |
| Upload/delete network outcome unknown            | Reload asset metadata before allowing another mutation                 |
| Missing uploaded asset                           | Use validated fallback URL, then the ordinary Porta default            |
| Public unknown org or missing asset              | Same minimal `404` response                                            |
| Actor lacks capability                           | Control remains visible-disabled; forged request is rejected by server |

## Dependencies

- RD-02 organization selection, capability-aware navigation, session epoch, and switcher workflows.
- RD-04 OIDC-client login-method inheritance.
- Existing server organization, login-method, 2FA-policy, branding-asset, template, email, security
  header, and migration infrastructure.
- Existing SDK organization and branding domains.
- Existing Admin UI module-workspace recipe, Layout DSL, form validation, date formatting, and
  confirmation patterns.
- `@jsvision/files@1.7.1` for native terminal file selection.

## Traceability

| Requirement area                   | Decisions     |
| ---------------------------------- | ------------- |
| Entry, workspace, lifecycle        | AR-136–AR-138 |
| Authentication defaults            | AR-139–AR-140 |
| Branding settings and assets       | AR-141–AR-144 |
| SDK and public delivery            | AR-145–AR-146 |
| Effective rendering, URLs, and CSP | AR-147–AR-148 |
| Minimum justified complexity       | AR-149        |

## Acceptance Summary

RD-06 is complete when an authorized administrator can manage the active organization's supported
settings, authentication defaults, lifecycle, and logo/favicon assets through the established
terminal UI; public pages and emails consistently render uploaded or fallback branding; every
operation remains tenant-scoped and permission-checked; and the complete path is verified without
introducing the explicitly excluded infrastructure.
