# RD-03: User Management

> **Document**: RD-03-user-management.md
> **Status**: Approved
> **Created**: 2026-08-29
> **Feature**: Porta Admin UI
> **Depends On**: RD-02
> **CodeOps Artifact Schema**: 1

## Feature Overview

Add complete organization-scoped user administration to the embedded terminal application. After
selecting an organization, an authorized administrator can find and inspect users, create or invite
them, maintain their supported profile and credentials, manage their account lifecycle, inspect
their history, and permanently purge personal data.

The interface follows the familiar identity-provider flow of a Users list leading to one user
detail view with focused actions. It uses direct JSVision components and the Porta SDK; it does not
introduce a generic entity-screen framework. Roles, claims, sessions, two-factor administration,
global audit, bulk operations, and import/export remain owned by their later roadmap features.

## Functional Requirements

### Must Have

- [ ] **UM-01 — Users navigation:** a top-level `Users` menu remains visible. Without a selected
      organization it is disabled with a fixed reason. With a selected organization it is enabled
      when any user capability is available and contains independently governed `Browse users…`,
      `Create user…`, and `Invite user…` actions. Browse requires `admin:user:read`; unavailable
      child actions remain visible with fixed reasons. (AR-61, AR-65)
- [ ] **UM-02 — User list:** the list requests one server page of 20 users for the selected
      organization and displays email, given and family name when present, and textual status. It
      provides submitted search bounded to 255 characters, an optional status filter with the exact
      values `active`, `inactive`, `suspended`, and `locked`, and Previous/Next navigation. It does
      not add live search, a generalized table engine, or configurable sorting. (AR-60, AR-61)
- [ ] **UM-03 — List states:** loading, empty, forbidden, unavailable, invalid-response, and no
      matching users are explicit bounded states. A failed search or page request preserves the
      last validated page and permits a manual retry. Remote errors and partial malformed pages are
      never displayed as selectable rows. (AR-61, AR-65)
- [ ] **UM-04 — User detail:** selecting a validated row opens one user detail view containing the
      supported identity profile, address, locale, contact fields, email-verification and password
      presence indicators, textual lifecycle status, two-factor presence as read-only information,
      a login summary limited to last-login timestamp and login count, and created/updated
      timestamps. Failed-login fields and lockout analysis remain RD-07. Password hashes, tokens,
      recovery material, raw metadata, and raw server responses are never displayed. (AR-60, AR-61)
- [ ] **UM-05 — Create user:** an independently authorized administrator can create a user using
      required email, optional initial password, and every profile field the current server create
      path actually persists. `phoneNumberVerified` is excluded from creation because the server
      currently accepts but silently discards it; the field remains available through profile edit.
      The form groups identity, contact, address, and credential fields into focused sections.
      Password and confirmation are masked, must match, accept 8–128 characters, and are cleared
      after submission or cancellation. Email and profile bounds match the existing server contract.
      (AR-60, AR-62)
- [ ] **UM-06 — Invite user:** an independently authorized administrator can invite a new or
      existing user using required email and optional given name, family name, locale, and personal
      message. Names accept 1–255 characters, locale at most 10, and message at most 500. The dialog
      previews only the bounded, control-free subject and plain-text body before sending; HTML is
      never rendered, and malformed preview output produces the fixed invalid-response outcome.
      Role and claim pre-assignment controls are absent until RD-05. (AR-60, AR-63)
- [ ] **UM-07 — Edit profile:** an administrator with update permission can edit every profile,
      contact, locale, and address field currently accepted by the server update schema. Email is
      read-only because the current server update contract does not accept it. Empty nullable fields
      clear their existing values; untouched fields remain unchanged. RD-03 adds no dedicated
      multi-administrator locking or merge workflow. (AR-60, AR-62, AR-66)
- [ ] **UM-08 — Credentials and verification:** an administrator with update permission can set a
      new masked and confirmed 8–128-character password, clear an existing password after explicit
      confirmation, and mark an unverified email as verified after explicit confirmation. The UI
      never reveals an existing password. A credential mutation follows the same one-logical-submit
      rule as other mutations in UM-13. (AR-60, AR-64)
- [ ] **UM-09 — Lifecycle actions:** the detail view exposes only valid actions for the current
      status: suspend, unsuspend, lock, unlock, deactivate, and reactivate. Suspend accepts an
      optional reason of at most 500 characters; lock requires a reason of 1–500 characters.
      Suspend, lock, and deactivate show the exact target email, resulting state, and an explicit
      confirmation. Recovery actions require one deliberate activation but no second confirmation.
      Existing super-admin protections remain authoritative. (AR-60, AR-64)
- [ ] **UM-10 — User history:** an administrator with read permission can open the first 20 existing
      history entries newest first. It shows event type, actor identifier or `System`, and timestamp,
      plus a fixed indication when more entries exist. RD-03 adds no history paging or filtering UI
      and never renders arbitrary metadata; global audit exploration remains RD-08. (AR-60)
- [ ] **UM-11 — Permanent purge:** an administrator with archive permission can request the
      existing irreversible per-user purge. The confirmation shows the exact target email and a
      fixed irreversible warning, with `Cancel` focused initially and a distinct `Purge permanently`
      button. Cancellation sends no request. Success closes the detail view and refreshes the list.
      Import and export are absent and remain RD-09. (AR-64, AR-69, AR-70)
- [ ] **UM-12 — Permission-aware actions:** the UI derives exact user capability booleans from the
      freshly validated UserInfo permissions and the existing exact legacy administrator role.
      Read, create, invite, update, lifecycle, and purge affordances are governed independently.
      Visible disabled actions use short fixed reasons. These affordances never replace the server's
      authentication, permission, organization-membership, or super-admin checks. (AR-65)
- [ ] **UM-13 — Mutation results:** one modal operation owns submission at a time. Cancel before
      dispatch sends no request, and duplicate activation cannot send another request. A definite
      success reloads the affected detail and current list when read permission is available;
      create or invite without read permission shows a fixed validated success outcome instead. A
      validation error preserves non-secret editable input but always clears password and
      confirmation fields. One logical submission may use the SDK's existing single refresh replay
      only after a definite `401`; a final `401` or failed refresh returns to the authentication
      gate. `403`, `404`, `409`, transport, `5xx`, malformed-success, and other indeterminate
      outcomes produce only fixed local results, never mutate the last validated state, and are not
      retried. (AR-65, AR-66)
- [ ] **UM-14 — Context isolation:** every user request uses the selected organization UUID.
      Explicit organization switching, reauthentication, session invalidation, or application
      disposal clears user views and invalidates their pending results. Cancelling an operation or
      resizing below the recovery threshold invalidates that operation and quarantines late results
      while preserving the last validated current-context view. A late response from a previous
      organization cannot redraw or become selectable. No polling or special flow is added for rare
      external organization deletion. (AR-67)
- [ ] **UM-15 — SDK alignment:** RD-03 corrects only the named user-domain inputs, invitation result,
      list parameters, history result, suspend/lock reason parameters, and directly blocking
      mismatches proven by their focused specifications. The same change updates affected current
      CLI user commands, SDK agent metadata, the existing packed P1 user-list cursor journey,
      focused tests, and documentation without legacy shims. It does not add cursor controls to the
      Admin UI, a parallel HTTP client, unrelated SDK cleanup, or server behavior merely to suit the
      terminal UI. (AR-68)
- [ ] **UM-16 — Terminal interaction:** list, detail, forms, actions, confirmations, errors, and
      navigation are keyboard complete and mouse usable. Focus returns to the invoking user view
      after cancellation or recoverable failure. The established normal, compact, resize-only,
      authentication, Quit, and terminal-restoration behavior remains intact.

### Should Have

- [ ] **UM-17 — Familiar composition:** use small user-specific views, dialogs, validation, and
      service functions following the existing organization module. Extract a shared helper only
      when current code demonstrates real duplication.

### Won't Have (Out of Scope)

- Role or claim assignment and management (RD-05).
- Session revocation, two-factor changes, recovery-code operations, or lockout analysis (RD-07).
- Global audit browsing and filtering (RD-08).
- Import, export, bulk user actions, CSV/JSON tooling, or filesystem output (RD-09).
- Impersonation, background refresh, live synchronization, tenant-deletion polling, optimistic UI,
  or a dedicated multi-administrator conflict interface.
- A generic entity table, form generator, admin-screen framework, new workspace, new dependency,
  runtime matrix, CI workflow, or server endpoint.

## Technical Requirements

### User state and validation

- User state is held only while its selected organization and verified session remain current.
  Published rows and details validate UUID identifiers, exact organization ownership, exact status,
  ISO timestamps, booleans, bounded numbers, nullable profile fields, and control-free display text.
- The list uses the existing offset response fields `data`, `total`, `page`, `pageSize`, and
  `totalPages`. Page numbers below 1, inconsistent totals, duplicate IDs, cross-organization rows,
  or malformed required fields invalidate the response instead of creating partial state.
- Remote text is length-bounded before display and cannot emit ASCII or C1 terminal controls.
  Errors use an allowlist and never contain response bodies, stack traces, tokens, passwords,
  internal paths, SQL details, or uncontrolled server messages.

### SDK contract corrections

| SDK surface            | Required alignment with the existing Admin API                                                                                                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UserListParams`       | Use `page`, `pageSize`, `search`, `status`, `sortBy`, and `sortOrder` for the Admin UI's offset requests. Preserve the current SDK `{ cursor, pageSize }` invocation and map `pageSize` to the server's `limit` only when cursor mode is selected.    |
| Create/update inputs   | Represent fields the server actually persists; omit `phoneNumberVerified` from create until server defect [#87](https://github.com/blendsdk/porta-identity/issues/87) is fixed, retain it for update, and do not advertise unsupported email editing. |
| `invite()`             | Return the server's invitation result containing `userId`, `email`, `created`, `invitationSent`, and `expiresAt`.                                                                                                                                     |
| `suspend()` / `lock()` | Carry the optional suspend reason and required lock reason accepted by the server.                                                                                                                                                                    |
| History                | Return the existing `{ data, hasMore, nextCursor }` result with its default limit of 20 instead of unwrapping it as an array; RD-03 does not expose history paging, filtering, or arbitrary metadata.                                                 |

The corrections are public SDK contract changes and require focused SDK specifications,
documentation, package verification, and clean compatibility assurance before completion. Porta's
current-triplet compatibility policy applies: current CLI consumers and SDK agent metadata are
updated with the SDK, without preserving aliases for contracts that do not match the server.

### Authorization matrix

| UI capability                            | UserInfo permission  | Existing server permission |
| ---------------------------------------- | -------------------- | -------------------------- |
| List, detail, history                    | `admin:user:read`    | `admin:user:read`          |
| Create user                              | `admin:user:create`  | `admin:user:create`        |
| Invite and preview                       | `admin:user:invite`  | `admin:user:invite`        |
| Edit, password, verify email             | `admin:user:update`  | `admin:user:update`        |
| Suspend, lock, deactivate, and reversals | `admin:user:suspend` | `admin:user:suspend`       |
| Purge                                    | `admin:user:archive` | `admin:user:archive`       |

The UI permissions are an ephemeral presentation snapshot. Every request must accept the current
server decision as authoritative, including a `403` after an action was displayed as enabled.

### Operation behavior

- Read requests may be manually retried. One logical mutation submission may use the SDK's existing
  single refresh replay only after a definite `401`; transport, `5xx`, cancellation-after-dispatch,
  and other indeterminate outcomes are never retried.
- A successful mutation is reconciled by reloading current server data when read permission is
  available rather than patching an assumed local result. A create/invite-only administrator instead
  receives a fixed validated success outcome. No background polling or general cache layer is added.
- Password buffers exist only for the active dialog, are masked, are never copied into application
  state, and are cleared on every exit path.
- Purge uses the SDK's explicit confirmation header only after the administrator activates the
  confirmed `Purge permanently` action. Super-admin protection and transactionality remain server
  responsibilities.

## Integration Points

### With RD-01 and RD-02

- Reuses the authenticated server, verified identity, sanitized failures, modal ownership,
  responsive shell, cancellation, and terminal restoration from RD-01.
- Requires RD-02's selected organization and validated permission claims. User state never survives
  a change to either context.

### With later Admin UI requirements

- RD-05 may add user role and claim actions to the user detail flow.
- RD-07 may add sessions, two-factor administration, and lockout-focused security information.
- RD-08 owns global audit exploration; RD-03 shows only a bounded user history list.
- RD-09 owns all import/export and bulk operations.

## Scope Decisions

| Decision           | Chosen                                                     | Rationale                                                 | AR Ref       |
| ------------------ | ---------------------------------------------------------- | --------------------------------------------------------- | ------------ |
| Feature depth      | Complete core user management                              | Finish one roadmap feature before moving to another       | AR-60        |
| Navigation         | Users list leading to detail and focused actions           | Familiar without a generated UI framework                 | AR-61        |
| Profile scope      | Complete existing server-supported profile and credentials | Avoid artificial SDK limitations                          | AR-62, AR-68 |
| Invitation scope   | Existing fields and preview, without role/claim assignment | RD-05 owns authorization assignments                      | AR-63        |
| Lifecycle scope    | All existing lifecycle actions plus purge                  | Complete the core user lifecycle                          | AR-64        |
| Authorization      | Validated UI affordances plus authoritative server checks  | Clear UX without weakening enforcement                    | AR-65        |
| Concurrency        | Ordinary request and refresh behavior                      | Single-operator use does not justify a conflict subsystem | AR-66        |
| Context changes    | Clear user state on explicit organization/session change   | Preserves tenant isolation without rare-race polling      | AR-67        |
| Purge confirmation | Email warning and explicit destructive button              | Clear and safe without typed-confirm ceremony             | AR-69        |
| Import/export      | Deferred to RD-09                                          | Keeps operational data tooling together                   | AR-70        |

## Security Considerations

- **Sensitive data:** profiles contain PII and password inputs are secrets. Neither is logged;
  passwords are never rendered, persisted, cached, or included in diagnostics.
- **Validation:** terminal input uses the existing server bounds, while unchanged server-side Zod
  validation remains authoritative. SDK responses are untrusted until validated and organization
  scoped.
- **Authorization and tenant isolation:** UI capabilities fail closed and every server request keeps
  existing authentication, granular permission, membership, and super-admin middleware. A user
  belonging to another organization is never published into the current view.
- **Injection prevention:** remote and entered values cannot reach SQL, shell commands, HTML, or
  terminal controls directly. Existing parameterized server repositories remain unchanged.
- **Transport and storage:** existing TLS and credential protections remain unchanged. RD-03 adds no
  local user-data store or export file.
- **Irreversible and authentication-sensitive actions:** purge, passwords, verification, and
  lifecycle transitions use explicit focused dialogs, fixed warnings, duplicate-submit prevention,
  and no automatic mutation retry.
- **Security testing:** specifications cover missing/stale permissions, server `403`, cross-tenant
  responses, malformed users, terminal injection, password cleanup, duplicate mutation,
  cancellation, stale context results, super-admin rejection, and irreversible-action confirmation.

## Acceptance Criteria

1. [ ] With a selected organization and `admin:user:read`, opening Users requests page 1 with
       `pageSize=20`; submitted searches of 0 and 255 characters, each status filter, and valid
       Previous/Next navigation produce the corresponding validated page. Search input above 255 is
       rejected before dispatch, and empty results show no selectable row.
2. [ ] A list response containing a non-UUID ID, mismatched `organizationId`, unsupported status,
       duplicate ID, malformed total/page fields, or control-bearing displayed text produces one
       fixed invalid-response state and publishes none of that response as selectable data.
3. [ ] Create accepts every profile field the existing server create path persists, excluding
       `phoneNumberVerified` while server defect
       [#87](https://github.com/blendsdk/porta-identity/issues/87) remains open. It accepts password lengths 8 and
       128, and rejects password lengths 7 and 129, mismatched confirmation, invalid email, or
       out-of-range profile data before dispatch. Password buffers are cleared after success,
       failure, and cancellation. Edit continues to support `phoneNumberVerified`.
4. [ ] Invite and preview accept email, names of 1 and 255 characters, message lengths 0 and 500,
       and locale lengths 0 and 10; longer values are rejected before dispatch. Preview displays
       only a bounded, control-free subject and plain-text body, never HTML, and rejects malformed
       output without replacing validated state. No role or claim assignment value can be submitted
       from RD-03.
5. [ ] User detail displays the validated supported profile and account indicators without password
       hashes, token values, recovery material, uncontrolled metadata, or raw errors. Edit can update
       and clear every server-supported mutable profile field but cannot edit email.
6. [ ] Set password accepts matching masked values of 8–128 characters; clear password and verify
       email require explicit confirmation. Each definite success reloads the user, while
       cancellation and every failed outcome leave the last validated detail unchanged.
7. [ ] Active, suspended, locked, and inactive users expose only their valid lifecycle actions.
       Suspend accepts an absent or at-most-500-character reason; lock requires 1–500 characters.
       Suspend, lock, and deactivate identify the exact email and target state before one request is
       dispatched; recovery actions also dispatch at most once.
8. [ ] The purge dialog initially focuses Cancel, displays the exact email and irreversible warning,
       and sends no request until `Purge permanently` is deliberately activated. Success removes the
       stale detail and refreshes the list; server rejection leaves validated state intact.
9. [ ] Each capability is independently enabled only by its exact validated permission or the exact
       legacy administrator role. Missing, malformed, unknown, or control-bearing claims fail closed,
       and a server `403` never changes user state or exposes its raw body. With a selected
       organization, create-only and invite-only permissions keep their respective Users actions
       reachable without dispatching a read request; their success outcome does not require read.
10. [ ] Switching organization, reauthenticating, invalidating the session, cancelling, resizing
        below the recovery threshold, or quitting invalidates active user operations. Cancellation
        and resize preserve the last validated current-context view, while context/session changes
        clear it. No late result can display data from the prior organization or redraw after
        teardown.
11. [ ] The corrected SDK types and methods represent the existing server list, profile, invitation,
        history, suspend, and lock contracts. The current CLI user commands and SDK agent metadata
        use the corrected contracts; focused tests fail against the former mismatches and pass
        without compatibility shims or a new server endpoint. The existing packed P1 user-list
        cursor journey proves `{ cursor, pageSize }` sends `cursor` plus `limit`, while the Admin UI
        continues using offset pagination only.
12. [ ] User history displays at most the first 20 validated entries newest first, shows event type,
        actor or `System`, and timestamp without metadata, and indicates when more entries exist
        without adding paging or filtering controls.
13. [ ] Focused CLI and SDK specifications, relevant security tests, both affected package verify
        commands, repository structure tests, docs build, and the packed Admin UI playground journey
        pass on Node 24 LTS. Clean SDK compatibility assurance is required because public SDK contracts
        change. Full unrelated Porta/server suites are not required when server implementation is
        untouched.

## Technical Documentation Update

Update public CLI Admin UI guidance, affected current `porta user` command guidance, SDK agent
metadata, and the maintainer playground journey with Users navigation and the supported actions.
Document corrected public SDK user contracts in the existing SDK reference; no broad architecture
regeneration is required.
