# RD-02: Organization Context and Navigation

> **Document**: RD-02-organization-context-and-navigation.md
> **Status**: Approved
> **Created**: 2026-08-28
> **Feature**: Porta Admin UI
> **Depends On**: RD-01
> **CodeOps Artifact Schema**: 1

## Feature Overview

Replace the foundation summary screen with the first usable administration context. A labelled
hamburger menu owns global session actions and verified identity details. An Organizations menu
lets an authorized administrator create or select a tenant, after which the application shows a
minimal organization landing view.

Authentication remains global to the selected Porta server. Selecting an organization changes only
the application working context; it never changes the issuer, token, credential profile, or server.

## Functional Requirements

### Must Have

- [ ] **OC-01 — Global menu:** the top-left menu is labelled `☰ Menu` when the terminal can render
      the glyph and `Menu` otherwise. It contains `Who am I…`, `Reauthenticate`, and `Quit`; existing
      keyboard shortcuts remain functional. (AR-49)
- [ ] **OC-02 — Identity dialog:** `Who am I…` opens a read-only modal showing the normalized Porta
      server origin, authentication state, verified name, verified email, and the insecure-TLS warning
      when applicable. Missing optional claims use fixed local fallback text, and untrusted values
      cannot inject terminal controls. The former identity summary is removed from the main content
      area. (AR-49)
- [ ] **OC-03 — Organizations menu:** a top-level `Organizations` menu contains `Create
organization…` and `Switch organization…`. Both remain visible; an unavailable action is disabled
      and appends the short fixed reason `requires organization create` or `requires organization
read`. The menu uses Porta's organization terminology. (AR-48, AR-58)
- [ ] **OC-04 — Live capabilities:** every successful login, stored-session verification, and
      reauthentication validates the existing UserInfo `roles` and `permissions` claims independently
      into ephemeral UI capability state. A valid permissions array containing `admin:org:read` governs
      switching and one containing `admin:org:create` governs creation. Missing or non-array permissions
      fail closed unless a separately valid roles array contains the exact legacy `porta-admin` role,
      which grants both capabilities for the server's existing compatibility behavior. Capability claims
      are never persisted and never replace server-side authorization or `403` handling. (AR-58, AR-59)
- [ ] **OC-05 — Initial organization choice:** after global authentication, when no organization is
      selected, the application automatically opens the organization switcher. It never silently
      selects an organization, including when exactly one organization exists. Cancelling leaves a
      clear no-organization-selected state with the Organizations menu reachable. Without
      organization-read capability, the switcher sends no list request and instead shows the fixed
      `Organization listing unavailable` state with Cancel and Reauthenticate reachable; Create
      remains reachable only when independently enabled. (AR-53)
- [ ] **OC-06 — Complete organization list:** switching uses the SDK's existing `listAll` operation
      to load the complete organization collection into one simple list. The UI exposes no search or
      pagination controls. A failure on any underlying page yields no partial selectable list. The
      empty state is explicit and keeps permitted creation reachable. (AR-55)
- [ ] **OC-07 — Organization statuses:** active, suspended, and archived organizations are
      selectable. Every row and the resulting landing view display the status in text; color is never
      the only signal. Selection itself grants no authority. (AR-54)
- [ ] **OC-08 — Switching:** selecting an organization and activating `Switch` atomically replaces
      the in-memory working context and redraws the content. Cancel, load failure, or invalid response
      preserves the prior selection. Switching initiates no authentication and changes no issuer,
      server, or credential-profile binding. The unchanged SDK may transparently refresh and persist
      the global RD-01 session while performing the authorized list request. (AR-50)
- [ ] **OC-09 — Create dialog:** creation asks for required `name` and optional `slug` and
      `defaultLocale`. Client validation enforces the existing server bounds: name 1–255 characters,
      slug either omitted or 3–100 characters, and locale either omitted or 2–10 characters. The
      server remains authoritative for slug syntax, uniqueness, and all payload validation. Branding,
      login-method configuration, and other organization settings are absent. (AR-52)
- [ ] **OC-10 — Create and switch:** activating `Create` makes one logical submission through the
      existing SDK organization domain. The SDK may perform its existing single token-refresh replay
      only after receiving a definite `401`; transport failures and indeterminate results are never
      retried. Success selects the validated context projection of the exact returned organization and
      redraws the landing view. Cancel sends no request. Validation error, `403`, conflict, transport
      failure, cancellation, or malformed response preserves the prior selection and shows only a bounded
      local error category. Duplicate activation cannot create a second organization. (AR-51)
- [ ] **OC-11 — Reauthentication reconciliation:** after successful reauthentication, the
      application reloads live capabilities and the complete organization list. If the selected
      organization is absent, its identifier or status is malformed, or listing is no longer
      authorized, the selection is cleared and the application returns to the organization-choice
      state. A valid unique same-UUID organization replaces the selected context with its fresh name,
      slug, and status. Transport or `5xx` reconciliation failure preserves the prior context with a
      bounded retryable error; `401` follows RD-01's session-invalid handling. Failed or cancelled
      reauthentication retains the previously verified state as established by RD-01. (AR-56)
- [ ] **OC-12 — Landing view:** with an organization selected, the main content shows only its safe,
      bounded name, slug, and textual status plus the selected Porta server. Without a selection, it
      shows a fixed instruction to choose or create an organization. No dashboard metrics or later
      administration modules are invented. (AR-57)
- [ ] **OC-13 — Keyboard and responsive behavior:** all menus, dialogs, fields, list rows, Create,
      Switch, Cancel, Reauthenticate, and Quit are keyboard reachable. Existing 80×24 and 48×12
      layouts remain usable; below the established recovery threshold, Quit remains reachable and
      modal ownership is cancelled before the resize-only view is shown. In-flight work may finish,
      but its late result cannot change application state.

### Should Have

- [ ] **OC-14 — Thin integration:** the application reuses the existing Porta SDK organization
      domain and `listAll`; presentation code owns no HTTP, token, credential, pagination, or
      authorization policy.

### Won't Have (Out of Scope)

- User and invitation administration, organization editing, branding, authentication-method
  configuration, suspension, archival, restoration, or deletion.
- Persisted recent organizations, favorites, search, pagination controls, or automatic selection.
- A new server endpoint, workspace, application, dependency, runtime matrix, or CI workflow.
- Changes to Porta's server-side authorization decisions or tenant isolation.

## Technical Requirements

### State and operation boundaries

- The selected organization is a validated `{ id, name, slug, status }` projection of an SDK
  `Organization`, held only by the running application. At most one organization load, create,
  switch, or authentication operation owns the modal boundary at a time.
- Late completion after cancellation or disposal cannot change the selected organization, menus,
  identity dialog, or content. For organization list/create SDK work, cancellation relinquishes
  modal ownership and quarantines late results without requiring physical transport abort;
  authentication cancellation remains governed by RD-01. Creation becomes externally irreversible
  once dispatched, so an indeterminate post-dispatch result must not retry automatically; the
  organization list is reloaded before another create attempt.
- List loading is all-or-nothing. SDK `listAll` may traverse bounded server pages internally, but
  the application publishes no partial collection and exposes no transport pagination controls.
- Reauthentication and stored-session verification replace capability state only after subject
  continuity and UserInfo validation succeed.

### Validation and presentation

- UserInfo `roles` and `permissions` claims are validated independently. Relevant role and permission
  entries must be control-free strings within Porta's existing slug bounds; unknown entries are
  ignored. Missing or malformed permissions disable the affected organization action unless a valid
  roles array supplies the exact legacy compatibility role in OC-04. A malformed roles claim cannot
  invalidate otherwise valid permissions.
- Organization identifiers must be UUIDs, slugs must satisfy Porta's established slug format, names
  must satisfy their server bounds, and statuses must be exactly `active`, `suspended`, or `archived`
  before the values enter selected organization state.
- All remote text shown in a terminal is length-bounded and rejects ASCII/C1 control characters.
  Errors use allowlisted local categories and never display raw response bodies, stack traces,
  tokens, internal paths, or uncontrolled server text.
- Dialog focus returns to the invoking menu or landing view after success, cancellation, or error.

### Authorization

| Action                   | Advisory UI capability | Authoritative server permission |
| ------------------------ | ---------------------- | ------------------------------- |
| Load/switch organization | `admin:org:read`       | `admin:org:read`                |
| Create organization      | `admin:org:create`     | `admin:org:create`              |

The UI snapshot improves affordances but is not a trust boundary. Every SDK request carries the
current server-bound bearer token and must accept a later `401` or `403` as authoritative.

## Integration Points

### With RD-01

- Reuses the verified server, identity, cancellation, terminal lifecycle, sanitized diagnostics,
  responsive shell, and durable credential behavior.
- Extends live UserInfo validation with ephemeral roles and permissions without broadening the
  persisted credential schema.

### With the Porta SDK and Admin API

- Reuses `organizations.listAll()` and `organizations.create()`; no direct HTTP client is added.
- Reuses existing organization response types and server validation. No server implementation is
  changed by this requirement.

## Scope Decisions

| Decision              | Options Considered                            | Chosen                     | Rationale                                                             | AR Ref       |
| --------------------- | --------------------------------------------- | -------------------------- | --------------------------------------------------------------------- | ------------ |
| Menu terminology      | Organizations / Admin / Tenants               | Organizations              | Matches Porta's domain and API                                        | AR-48        |
| Global actions        | Labelled hamburger / separate menus           | Labelled hamburger         | Keeps session actions together without an icon-only affordance        | AR-49        |
| Working context       | Session memory / persistence / tenant login   | Session memory             | Avoids stale context and preserves global login                       | AR-50        |
| Create scope          | Basic fields / complete settings              | Basic fields               | Delivers the first workflow without pulling settings into scope       | AR-51, AR-52 |
| Initial selection     | Explicit switcher / landing first             | Explicit switcher          | Prevents silent tenant choice                                         | AR-53        |
| Status eligibility    | Active only / all statuses                    | All statuses               | Administrators may need inactive context for later recovery workflows | AR-54        |
| List interaction      | Complete list / search and pages / first page | Complete list              | Expected organization counts are small                                | AR-55        |
| Stale context         | Clear after reconciliation / retain           | Clear after reconciliation | Prevents misleading tenant context                                    | AR-56        |
| Landing content       | Minimal identity / blank                      | Minimal identity           | Makes current organization explicit                                   | AR-57        |
| Permission affordance | Visible disabled / hidden                     | Visible disabled           | Makes capabilities discoverable without bypassing authorization       | AR-58        |
| Capability source     | Existing UserInfo / new endpoint / `403` only | Existing UserInfo          | The established `/me` response already includes RBAC claims           | AR-59        |

## Security Considerations

- **Data sensitivity:** verified email and bearer-backed RBAC claims remain process-memory data;
  tokens and credentials are never rendered or copied into organization state.
- **Input validation:** dialog values receive bounded client validation and unchanged server-side
  Zod/service validation. Organization responses and UserInfo claims are treated as untrusted.
- **Authentication and authorization:** only a verified RD-01 session can load or mutate
  organizations. UI capability checks are advisory; existing middleware and permission checks are
  authoritative.
- **Tenant isolation:** selected organization IDs flow only to later explicitly organization-scoped
  operations. Selection alone grants no access and cannot alter the server or issuer binding.
- **Injection prevention:** no input reaches SQL, shell, HTML, paths, or terminal control sequences
  directly; existing SDK/server boundaries remain intact.
- **Transport and storage:** existing TLS and credential protections remain unchanged. Capability
  and organization selections are not persisted.
- **Rate limiting and concurrency:** existing admin API rate limits remain unchanged. The UI
  prevents duplicate submissions and never retries an indeterminate create automatically.
- **Security testing:** immutable tests cover malformed RBAC claims, terminal injection, missing
  permissions, stale permission `403`, cross-server token prevention, duplicate create, malformed
  organizations, cancellation, preservation on switch/create and transient reconciliation failures,
  and clearing on the authoritative reconciliation outcomes in OC-11.

## Acceptance Criteria

1. [ ] At 80×24 and 48×12, authenticated users can open the labelled Menu, open and close `Who am
I…`, invoke Reauthenticate, and quit entirely by keyboard; the identity dialog contains exactly
       the normalized server, fixed state label, safe name/email fallbacks, and conditional TLS warning.
2. [ ] After authentication with no selection, the switcher opens. With organization-read capability,
       it displays every organization returned across all SDK pages exactly once, including textual
       status; zero, one, and more-than-one organization never cause automatic selection. Without that
       capability, it sends no list request and displays the fixed unavailable state from OC-05.
3. [ ] Selecting any valid active, suspended, or archived organization and activating Switch updates
       the landing view to its name, slug, status, and server without initiating authentication or
       changing issuer, server, or credential-profile binding; transparent global-session maintenance
       remains allowed. Cancel and every load/validation failure preserve the prior selection.
4. [ ] The create dialog accepts name lengths 1 and 255, optional slug lengths 3 and 100, and optional
       locale lengths 2 and 10; it rejects values outside those bounds before dispatch. Server rejection
       remains authoritative for syntax and uniqueness.
5. [ ] One Create activation produces one logical SDK submission. The SDK may replay it once only
       after a definite `401` and successful token refresh. A successful response becomes the selected
       organization; cancellation before dispatch sends no request, while `400`, `403`, `409`, transport
       failure, malformed response, and indeterminate completion never retry and never replace the
       previous selection.
6. [ ] A live UserInfo response with `admin:org:read` enables switching and one with
       `admin:org:create` enables creation; an exact valid `porta-admin` role enables both for legacy
       compatibility. Missing, malformed, control-bearing, or non-array relevant RBAC claims disable the
       affected action. A subsequent server `403` is shown as a bounded authorization error and does not
       mutate selection.
7. [ ] Successful reauthentication reloads capabilities and all organizations. A valid unique
       same-UUID result refreshes the selected projection; confirmed absence, malformed matching data,
       or `403` clears it. Transport or `5xx` reconciliation failure preserves it, `401` follows RD-01's
       session-invalid handling, and failed or cancelled reauthentication preserves RD-01's previously
       verified state.
8. [ ] Main content contains no former global identity summary, synthetic metrics, user screens,
       organization settings, lifecycle actions, persisted selection, search, or pagination controls.
9. [ ] Focus, cancellation, terminal restoration, resize behavior, and late asynchronous completion
       remain deterministic, and no remote value can emit a terminal control sequence or expose raw
       errors, tokens, credentials, internal paths, or response bodies.
10. [ ] Focused CLI specifications, relevant security tests, affected package verification,
        repository structure tests, and the existing packed playground journey pass on Node 24 LTS.
        The journey covers organization choice, switching, create-and-auto-select, and terminal
        restoration. SDK verification and clean compatibility assurance are required only when SDK
        source or contracts change. Full Porta/server verification is not required when server
        implementation remains untouched.

## Technical Documentation Update

Update the CLI usage documentation and maintainer playground guide with the organization-selection
flow. No production deployment documentation or broad architecture regeneration is required.
