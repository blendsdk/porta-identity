# RD-04: Applications and OIDC Clients

> **Document**: RD-04-applications-and-oidc-clients.md
> **Status**: Approved
> **Created**: 2026-08-30
> **Feature**: Porta Admin UI
> **Depends On**: RD-02
> **CodeOps Artifact Schema**: 1

## Feature Overview

Add complete administration of Porta's global application definitions and the OIDC clients owned by
the active organization. Applications describe products, services, modules, and later authorization
namespaces shared across organizations. Clients describe one organization's concrete OIDC deployment
configuration for a global application.

The interface must make that ownership boundary obvious. Global application operations never require
an active organization and carry a persistent notice that they change deployment-wide definitions.
OIDC client operations always use the active organization as their operational UI context and must
validate that context before dispatch and before publishing returned state. Authenticated
`admin:client:*` permissions remain deployment-wide server authority; the selected organization is
not a separate server authorization boundary.

## Functional Requirements

### Must Have

- [ ] **AC-01 — Separate navigation:** add separate top-level `Applications` and `OIDC Clients`
      workspaces. Applications is global and requires no active organization. OIDC Clients remains
      visible but disabled with the fixed reason `organization required` until an organization is
      active. Both use permission-aware visible-disabled actions with the established fixed denial
      reasons. The built-in `porta-app-admin` role receives `admin:org:read` through the role
      definition and an idempotent correction for existing initialized deployments so it can select
      the organization whose clients it manages. (AR-71, AR-74, AR-78)
- [ ] **AC-02 — Global application list:** Applications loads the complete validated application
      collection through the SDK `listAll` operation and presents one DataGrid with Name, Slug, and
      textual Status columns. Active, inactive, and archived applications remain visible. No search
      or pagination controls are shown. Loading, empty, failed, and ready states are explicit, and a
      failed underlying page publishes no partial collection. A concise persistent notice identifies
      the workspace as deployment-global. (AR-72, AR-77, AR-82)
- [ ] **AC-03 — Application detail:** opening an application shows its safe name, slug, description,
      textual status, modules, created time, and updated time. The view labels the application as a
      global definition and states that changes may affect multiple organizations. Every mutation
      dialog repeats that concise global-scope notice. Unavailable actions remain visible-disabled
      with their fixed reason. (AR-71, AR-72, AR-78)
- [ ] **AC-04 — Create and edit application:** create accepts required name, optional slug, and
      optional description. Edit accepts name and nullable description; slug is immutable after
      creation because the server update contract does not support changing it. Name length is
      1–255, optional slug length is 3–100, and optional description length is at most 2,000
      characters before dispatch; server slug syntax and uniqueness remain authoritative. Archived
      applications are read-only. (AR-72, AR-79)
- [ ] **AC-05 — Application lifecycle:** an active application can be deactivated, an inactive
      application can be activated, and an active or inactive application can be permanently
      archived. Deactivate and Archive require explicit confirmation naming the application and its
      exact global effect: both prevent creation of new clients for the application but do not disable
      existing clients. Archived applications have no restore action and are read-only. Success
      reloads the application; rejection or failure preserves the prior validated view. (AR-72,
      AR-75, AR-83)
- [ ] **AC-06 — Application modules:** application detail lists every module with Name, Slug, and
      textual Status and permits create, edit, and deactivate through the existing application read
      and update permissions. Create accepts name, optional slug, and optional description; edit
      accepts name and nullable description. Field bounds match applications. Module deactivation
      requires confirmation and has no invented delete or restore action. Modules under an archived
      application are read-only. Update and deactivate atomically verify that the internal module ID
      belongs to the application named by the nested route, and the UI rejects returned module data
      whose application ID differs from the selected application. (AR-72, AR-75, AR-80, AR-83)
- [ ] **AC-07 — Organization client list:** with an active organization, OIDC Clients loads the
      complete validated collection for exactly that organization through SDK `listAll`. One
      DataGrid shows Name, Client ID, global Application, Application Type, Client Type, and textual
      Status. No search or pagination controls are shown. Empty, loading, failed, and ready states
      never expose another organization's data or a partial collection. Application names are
      resolved only with `admin:app:read`; otherwise the immutable Application ID is shown. (AR-71,
      AR-73, AR-77, AR-82)
- [ ] **AC-08 — Create client:** client creation uses the active organization ID and one selected
      active global application. It collects client name, public or confidential client type, web,
      SPA, or native application type, 1–10 redirect URIs, 0–10 post-logout redirect URIs, supported
      grant types, the `code` response type, scope, token endpoint authentication method, allowed
      origins, PKCE requirement, and inherited or explicit login methods. Confidential creation also
      accepts an optional initial-secret label. The generated Client ID is read-only. A non-active
      organization or application cannot be used to create a client. Create requires both
      `admin:client:create` and `admin:app:read` because the application must be selected from the
      validated active global catalog. (AR-71, AR-73, AR-81)
- [ ] **AC-09 — Client detail and configuration:** client detail shows the complete supported OIDC
      configuration and separates focused Basic, Redirects, Protocol, Login, and Secrets actions.
      Client type, application type, owning organization, global application, and generated Client ID
      are immutable after creation. Every editable field maps directly to the existing server update
      contract and the shared protocol compatibility validator. Revoked clients are read-only;
      inactive clients remain editable so configuration can be corrected before activation. No
      generic entity editor or oversized raw form is introduced. (AR-73, AR-81)
- [ ] **AC-10 — Client lifecycle:** an active client can be deactivated, an inactive client can be
      activated, and an active or inactive client can be permanently revoked. Deactivate and Revoke
      require explicit confirmation naming the client and organization. Revoked clients have no
      restore action and are read-only. A successful transition reloads the organization-scoped
      client; rejection or failure preserves the prior validated view. (AR-73, AR-75, AR-83)
- [ ] **AC-11 — Initial confidential secret:** creating a confidential client automatically returns
      its initial plaintext secret once. The UI immediately presents it in a warning dialog with the
      client name, Client ID, optional label, and a fixed warning that the secret cannot be shown
      again. Closing, cancelling, resizing below the recovery threshold, switching context,
      reauthenticating, or quitting permanently discards the UI's plaintext reference. Public-client
      creation produces no secret dialog. (AR-76, AR-84)
- [ ] **AC-12 — Secret rotation:** a confidential client's Secrets action lists metadata only: ID,
      optional label, textual status, created time, optional expiry, and optional last-used time. An
      administrator can generate another one-time secret with an optional label of at most 255
      characters and an optional valid expiry instant, or permanently revoke an active secret after explicit
      confirmation. Plaintext is never available from list or detail operations and secret actions are
      unavailable for public or revoked clients. Every returned secret row must name the selected
      internal client ID. The server revoke operation must verify that the secret belongs to the
      client named by the route. Every active, unexpired secret remains accepted by the token endpoint
      until explicit revocation or expiry so rotation supports overlap without an outage. (AR-76,
      AR-83, AR-84)
- [ ] **AC-13 — Context and operation ownership:** organization switching immediately discards all
      client workspace and client-secret state but does not relabel or tenant-scope the global
      application catalog. Authentication replacement or invalidation clears both global and
      organization-scoped module state. One dialog or network operation owns each workspace at a
      time; duplicate activation cannot dispatch duplicate mutations, and late results from an old
      session or organization cannot mutate current state. (AR-71, AR-78)
- [ ] **AC-14 — Mutation outcomes:** a definite successful mutation reloads its affected entity or
      collection. The SDK may perform its existing single refresh replay only after a definite `401`.
      Validation errors, `403`, conflicts, cancellation, transport failures, malformed responses, and
      indeterminate completions never retry automatically and never publish unverified state. Before
      another mutation after an indeterminate result, the user must deliberately reload the relevant
      collection or entity. (AR-78)
- [ ] **AC-15 — Presentation prime directive:** every RD-04 screen and dialog uses the JSVision
      Layout DSL unless a concrete JSVision limitation makes the layout impossible. Application,
      module, client, and secret metadata tables use DataGrid where rows and columns are the natural
      presentation. Every single-line input remains exactly one row high and receives no vertical
      growth or fill behavior. (AR-82)
- [ ] **AC-16 — Terminal interaction:** all grids, menus, detail actions, dialogs, confirmations,
      Create, Save, Cancel, Reauthenticate, and Quit are keyboard reachable and mouse usable. Dialogs
      are movable, restore focus to their invoker, redraw without artifacts, and remain usable at
      80×24 and 48×12. Below the established recovery threshold, Quit remains reachable and modal
      ownership is cancelled before the resize-only view is shown. (AR-81, AR-82)

### Should Have

- [ ] **AC-17 — Thin service boundaries:** presentation code owns no HTTP, token, credential,
      pagination, secret-storage, or authorization policy. Narrow application/client services adapt
      validated SDK contracts to immutable Admin UI state.
- [ ] **AC-18 — Existing defaults:** creation dialogs leave optional protocol fields as
      `Server default`, omit unchanged fields from the create payload, and replace that label with
      authoritative returned values after creation. The UI does not copy the server's private
      defaults, create a second OIDC policy engine, or silently transform explicitly selected values.

### Won't Have (Out of Scope)

- Tenant ownership of application, module, role, permission, or claim definitions.
- Application or client restore, hard delete, cloning, templates, or automatic tenant enrollment.
- Role, permission, claim-definition, or assignment administration, which belongs to RD-05.
- Audit and entity history views, which belong to RD-08.
- Import, export, bulk operations, signing keys, and global configuration, which belong to RD-09.
- Search controls, pagination controls, background polling, multi-operator locking, merge workflows,
  or a generated/generalized UI framework.
- A server data-model redesign, runtime matrix, workspace, dependency, or CI workflow.

## Technical Requirements

### Ownership model

```text
Porta deployment
├── Global Application
│   ├── Global Module
│   └── Global authorization definitions (RD-05)
└── Organization
    └── OIDC Client ── references one Global Application
        └── Confidential Client Secrets
```

- Applications and modules have no organization identifier. Application slugs are globally unique;
  module slugs are unique within their parent application under the existing server rules.
- Nested module update and deactivate operations identify a module by both its parent application ID
  and module ID; the application segment is not decorative.
- Every client has exactly one organization ID and one application ID. The client workspace always
  supplies the active organization ID and rejects any returned client whose organization ID differs.
- Application selection during client creation uses validated active applications from the global
  catalog. Selecting an application grants no client or organization authority.

### Validation and supported client values

| Field                         | Accepted UI values                                                       |
| ----------------------------- | ------------------------------------------------------------------------ |
| Client name                   | 1–255 control-free characters                                            |
| Client type                   | `public` or `confidential`                                               |
| Application type              | `web`, `spa`, or `native`                                                |
| Redirect URIs                 | 1–10 absolute URLs, each 1–2,048 characters                              |
| Post-logout redirect URIs     | 0–10 absolute URLs, each 1–2,048 characters                              |
| Grant types                   | `authorization_code`, `refresh_token`, `client_credentials`              |
| Response types                | `code`                                                                   |
| Scope                         | Server default or 1–2,048 control-free characters                        |
| Token endpoint authentication | `client_secret_basic`, `client_secret_post`, or `none`                   |
| Allowed origins               | Server default or 0–10 absolute origins, each 1–2,048 characters         |
| Login methods                 | Inherit organization default, `password`, `magic_link`, or both          |
| Initial/rotated secret label  | Omitted or 0–255 control-free characters                                 |
| Secret expiry                 | Omitted or a valid instant                                               |
| Application status            | `active`, `inactive`, or `archived`                                      |
| Module status                 | `active` or `inactive`                                                   |
| Client status                 | `active`, `inactive`, or `revoked`                                       |
| Secret status                 | `active` or `revoked`; expiry is evaluated separately from stored status |

- Redirect URI collections reject empty entries, fragments, and wildcards before dispatch. Logout
  redirect URIs follow the same URL bounds. Allowed origins contain only scheme, host, and optional
  port: no path beyond `/`, query, fragment, credentials, or wildcard. The server remains
  authoritative for protocol, scheme, and exact-match rules.
- One shared server-side compatibility validator is used by Admin routes and import, and its rules
  are mirrored only as pre-dispatch UI affordances: public clients use authentication method `none`,
  exclude `client_credentials`, and always require PKCE; confidential clients use
  `client_secret_basic` or `client_secret_post`. Runtime honors the persisted PKCE choice for
  confidential clients while continuing to require PKCE for every public authorization-code client.
- Remote IDs must be valid UUIDs where the API defines UUID ownership keys. Status, client type,
  application type, grants, response types, authentication method, and login methods are validated
  against the closed values above before entering UI state.
- Names, descriptions, labels, Client IDs, URLs, scopes, and all other remote text are length-bounded
  for terminal rendering and reject ASCII/C1 controls. Errors use local categories and never render
  raw response bodies, stack traces, tokens, secret hashes, or uncontrolled server text.

### Authorization

| Action                                   | Advisory UI capability                   | Authoritative server permission          |
| ---------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| List/inspect applications and modules    | `admin:app:read`                         | `admin:app:read`                         |
| Create applications                      | `admin:app:create`                       | `admin:app:create`                       |
| Edit/status/modules                      | `admin:app:update`                       | `admin:app:update`                       |
| Archive applications                     | `admin:app:archive`                      | `admin:app:archive`                      |
| List/inspect clients and secret metadata | `admin:client:read`                      | `admin:client:read`                      |
| Create clients                           | `admin:client:create` + `admin:app:read` | `admin:client:create` + `admin:app:read` |
| Edit/status/generate secrets             | `admin:client:update`                    | `admin:client:update`                    |
| Revoke clients or secrets                | `admin:client:revoke`                    | `admin:client:revoke`                    |

The validated UserInfo capability snapshot controls affordances only. Existing deployment-wide
server authentication and permission middleware remain authoritative. The selected organization is
an Admin UI operational context and response-integrity guard, not an additional authorization scope.
The UI validates the selected organization immediately before every client mutation and rejects any
returned client whose organization differs before publishing state. A stale capability claim cannot
convert a server `403` into success.

### SDK, conventional CLI, and focused server corrections

RD-04 may correct the SDK and affected conventional CLI commands to match the existing Admin API:

- remove the nonexistent application `organizationId` and unsupported application slug update;
- represent module `status` and the existing module-deactivation route accurately;
- retain both application and module internal UUIDs for module update/deactivate operations;
- remove nonexistent application/client restore operations;
- add the existing application and client activate/deactivate lifecycle operations, preserve
  application archive and client revoke, and use internal entity UUIDs where the routes require them;
- represent complete client fields including organization ID, application type, scope, origins,
  PKCE, status, login methods, and effective login methods;
- represent client create responses as the returned client plus optional one-time secret;
- map `clientName` and returned secret `plaintext` without inaccurate aliases; and
- use the server's existing secret-revocation route and secret status metadata.

RD-04 also includes the focused server corrections required to make these existing contracts safe
and truthful: enforce the stated redirect URI, logout URI, allowed-origin, scope, and protocol
compatibility rules consistently in Admin create/update and import; apply redirect-URI scheme
enforcement from the deployment security profile; reconcile persisted PKCE behavior with runtime;
verify nested client/secret ownership on revoke; and accept every active, unexpired secret during
token-endpoint authentication. Module update/deactivate also enforce the application/module pair at
the server mutation boundary. These are contract and runtime defect corrections, not a new data model
or authorization system.

The SDK and conventional CLI changes are public contract corrections. The focused server work
corrects validation, runtime credential handling, nested-resource integrity, and the existing
built-in App Admin role definition; it introduces no new authorization system or data model.
Immutable SDK and CLI specification tests must describe the server contract before implementation
changes.

### Layout and state

- The JSVision Layout DSL owns row, column, fill, alignment, minimum-size, and responsive behavior.
  Any unavoidable non-DSL positioning must be isolated and document the concrete missing DSL
  capability.
- DataGrid fills the remaining workspace body for application and client collections. Focused detail
  dialogs may use a DataGrid for module or secret rows; small action menus and confirmation choices
  remain ordinary controls.
- Single-line fields have a one-row minimum and maximum content height and never receive vertical
  grow/fill allocation. Multi-line descriptions are the only text inputs allowed to grow vertically.
- Global application state is bound to the authenticated session epoch. Client and secret state is
  additionally bound to the active organization ID. Context checks occur again before publishing
  every asynchronous result.

## Integration Points

### With RD-01 and RD-02

- Reuses authentication, verified identity, UserInfo capabilities, terminal lifecycle, cancellation,
  sanitized errors, global Menu, organization selection, and context reconciliation.
- Application actions remain usable without an active organization when their application permission
  is present. Client actions require both their client permission and an active organization; client
  creation additionally requires application read permission.

### With RD-03

- Reuses the established workspace, DataGrid, focused-dialog, mutation-reconciliation, movable-modal,
  focus-restoration, and context-generation patterns without creating a generic entity framework.

### With RD-05

- Produces the global applications and modules that later own roles, permissions, and claims. RD-04
  does not manage those authorization definitions.

## Scope Decisions

| Decision               | Options Considered                                 | Chosen                      | Rationale                                   | AR Ref       |
| ---------------------- | -------------------------------------------------- | --------------------------- | ------------------------------------------- | ------------ |
| Application ownership  | Global / organization-owned                        | Global                      | Matches Porta's SaaS product model          | AR-71        |
| Feature depth          | Complete existing API / reduced CRUD               | Complete existing API       | Finishes one roadmap capability             | AR-72, AR-73 |
| Navigation             | Separate workspaces / clients nested in app detail | Separate workspaces         | Makes global versus tenant scope explicit   | AR-74        |
| Lifecycle              | Existing permanent transitions / invented restore  | Existing transitions        | Matches the authoritative server            | AR-75        |
| Secrets                | Complete rotation / omit                           | Complete one-time rotation  | Required for confidential clients           | AR-76        |
| List interaction       | Complete collection / UI pages and search          | Complete collection         | Expected counts are small                   | AR-77        |
| Affordances            | Permission-aware / `403` only                      | Permission-aware            | Clear UX without weakening server authority | AR-78        |
| Contract defects       | Correct SDK/CLI/server defects / constrain UI      | Focused contract correction | Exposes the safe server capability          | AR-79        |
| Neighboring features   | Preserve roadmap / combine                         | Preserve roadmap            | Avoids an oversized RD                      | AR-80        |
| Presentation           | Focused provider-style UI / generic form           | Focused provider-style UI   | Familiar and maintainable                   | AR-81        |
| Layout controls        | DSL, DataGrid, fixed inputs / ad hoc               | Prime directive             | Prevents sizing and redraw defects          | AR-82        |
| Lifecycle confirmation | Restrictive and permanent / permanent only         | Restrictive and permanent   | Makes service-impacting changes deliberate  | AR-83        |
| Public-client secrets  | Confidential clients only / every client           | Confidential clients only   | Public clients cannot keep a secret         | AR-84        |

## Security Considerations

- **Data sensitivity:** client secrets are credentials. Plaintext exists only in the one creation
  response and transient warning dialog; hashes are never returned or rendered.
- **Input validation:** all dialog input uses bounded allowlists before the shared server-side Zod and
  service validation. Organization and application ownership identifiers are never accepted from an
  editable free-text field.
- **Authentication and authorization:** every request uses the verified server-bound session. UI
  capability checks are advisory; deployment-wide server permissions are authoritative. The built-in
  App Admin receives organization-read permission solely so it can select client context.
- **Organization context integrity:** client list/create/detail/update/lifecycle/secret operations are
  bound to the active organization in the Admin UI. Context is validated before dispatch and returned
  client organization IDs are validated before publication. Nested secret revoke also verifies the
  route client/secret relationship server-side.
- **Nested resource integrity:** module update/deactivate and secret revoke validate their parent/child
  ID pair server-side before mutation; UI response validation remains defense in depth.
- **Injection prevention:** remote and entered text cannot emit terminal controls and never reaches
  SQL, shell, HTML, file paths, or logs directly. Existing server queries remain parameterized.
- **Transport and storage:** existing TLS and credential protections remain unchanged. The Admin UI
  does not persist applications, clients, secrets, or OIDC form drafts.
- **Mutation safety:** duplicate submission is blocked; destructive transitions require confirmation;
  indeterminate operations are not retried; late results cannot cross session or organization epochs.
- **Security testing:** specifications cover permission denial, cross-organization client responses,
  global application labeling, terminal injection, malformed IDs/enums/URLs, secret non-retention,
  duplicate mutation, stale context, and sanitized errors.

## Acceptance Criteria

1. [ ] With no active organization and valid `admin:app:read`, Applications opens and lists every
       valid global application exactly once in a remaining-height DataGrid; OIDC Clients remains
       disabled with `organization required` and sends no client request.
2. [ ] With an active organization and `admin:client:read`, OIDC Clients lists only clients whose
       `organizationId` exactly matches the active organization. A mismatched or malformed client
       response fails the complete load and publishes no rows.
3. [ ] Application create accepts name lengths 1 and 255, slug lengths 3 and 100 when present, and
       description lengths 0 and 2,000; it rejects values outside those bounds. Success adds the
       returned global application, while cancellation and every failure preserve the prior list.
4. [ ] Application detail always labels global scope. Deactivate and permanent Archive name the
       application and global impact in confirmation; archived applications expose no restore action.
       The confirmation states that no new clients can be registered while existing clients continue
       authenticating, and the archived detail is read-only.
5. [ ] Module create/edit/deactivate operates only under its application, uses the application
       read/update permissions, displays textual status, and exposes no delete or restore action. A
       mismatched application/module pair cannot update or deactivate anything, and a returned module
       with a different application ID is not published.
6. [ ] Client create always sends the active organization UUID and selected active application UUID,
       accepts only the closed client/application/grant/response/authentication/login-method values,
       enforces the public/confidential compatibility rules, URL/origin/scope bounds, 1–10 redirect
       and 0–10 logout URIs, and never allows editing generated ownership or identity fields afterward.
7. [ ] Client detail exposes focused Basic, Redirects, Protocol, Login, and Secrets actions. Every
       supported server update field can be changed without exposing a raw JSON or generated generic
       form.
8. [ ] Client Deactivate and permanent Revoke confirmations name the client and active organization;
       a revoked client exposes no restore action and cannot be silently reactivated.
9. [ ] Confidential-client creation displays the returned plaintext secret exactly once with the
       required warning. Public-client creation never shows Secrets. No later list, detail, redraw,
       log, error, context switch, or reauthentication can reveal the plaintext.
10. [ ] Secret metadata contains no plaintext or hash. Generate accepts label lengths 0 and 255 and
        an omitted or valid expiry instant; permanent revoke requires confirmation. Missing read/update/revoke
        capabilities disable exactly the corresponding secret actions. Token-endpoint tests prove an
        old and new active secret both work during overlap and that revocation or expiry disables only
        the affected secret. A mismatched route client/secret pair cannot revoke anything.
11. [ ] Switching organization clears all client/dialog/secret state before loading the new context
        but leaves global application semantics unchanged. Authentication replacement clears every
        RD-04 state, and late prior-context results cannot reappear.
12. [ ] Each mutation dispatches once. Only a definite `401` may receive the SDK's single refresh
        replay; `400`, `403`, `409`, cancellation, transport failure, malformed response, or
        indeterminate completion neither retries nor publishes speculative success.
13. [ ] Every RD-04 screen and dialog is built with the Layout DSL unless a concrete documented DSL
        limitation is proven; every natural table uses DataGrid; every single-line input remains one
        row tall at 80×24, 48×12, and after repeated grow/shrink resize cycles.
14. [ ] All actions are keyboard reachable and mouse usable; dialogs move, cancel, restore focus,
        close on Alt+X through application-owned quit handling, redraw without artifacts, and preserve
        terminal restoration.
15. [ ] SDK and conventional CLI application/client specification tests describe the existing server
        fields, response wrappers, internal-ID targeting, lifecycle routes, and secret semantics;
        nonexistent application organization ownership and restore contracts are removed without
        changing the server data model.
16. [ ] Focused specifications, relevant security tests, affected package tests, repository structure
        tests, the packed Admin UI playground journey, and `yarn verify` pass on Node 24 LTS. SDK/CLI
        compatibility assurance runs from a clean committed revision because their public contracts
        change.

## Technical Documentation Update

Update Admin UI usage and playground documentation for the separate global Applications and
organization OIDC Clients workflows. The broader Porta ownership-model documentation remains tracked
as a separate documentation hand-off; RD-04 does not absorb that documentation project.
