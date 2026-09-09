# RD-05: Roles and Permissions

> **Document**: RD-05-roles-and-permissions.md
> **Status**: Approved
> **Created**: 2026-09-09
> **Feature**: Porta Admin UI
> **Depends On**: RD-03, RD-04, RD-10
> **CodeOps Artifact Schema**: 1

## Feature Overview

Add direct administration of Porta's application-scoped roles and permissions, the permissions
granted by each role, and the roles assigned to a user in the active organization. Roles and
permissions are global authorization definitions owned by one application. User-role assignments
connect those definitions to one organization-owned user. (AR-122)

The feature extends the existing Application detail TabView with `Roles` and `Permissions` tabs and
adds one focused `Roles` operation to User details. It reuses the established DataGrid, Layout DSL,
dialog, capability, context, mutation, and deletion patterns. It does not introduce a generated RBAC
editor, hierarchy, policy engine, background worker, or new persistence model. (AR-123–AR-125,
AR-129)

Each OIDC client receives only roles and permissions owned by its application. External
applications may independently reuse role or permission names and slugs because identity is scoped
by application. Only the canonical `porta-admin` application's built-in definitions control Porta
administration. A same-named role in another application has no Admin API authority. (AR-131)

## Minimum-Sufficient Design

| Concern                 | Direct design                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| Application roles       | One complete DataGrid with Add, Edit, Delete, and Manage permissions actions                        |
| Application permissions | One complete DataGrid with Add, Edit, and Delete actions                                            |
| Role permissions        | One focused dialog with assigned permissions and one-row Add/Remove operations                      |
| User roles              | One focused dialog from User details with assigned roles and one-row Add/Remove operations          |
| Authority changes       | Targeted cache invalidation for additions; targeted session and token-state revocation for removals |
| Contract repair         | Parent-qualified server operations and truthful array-returning SDK list methods                    |
| Authority boundary      | Application-filtered OIDC claims and static canonical Porta Admin capabilities                      |

Role templates, role hierarchy, composite roles, bulk-user assignment, import/export, permission
simulation, and an effective-permissions viewer remain outside this RD. (AR-122, AR-132)

## Domain Model

```text
Application
├── Modules
├── Roles ──< Role permissions >── Permissions
│                                     └── optional owning Module
└── OIDC clients

Organization ── Users ──< User roles >── Application Roles
```

| Term                | Meaning                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Role                | A named authorization bundle owned by exactly one application.                                         |
| Permission          | A namespaced operation owned by exactly one application and optionally one module of that application. |
| Role permission     | A direct assignment of one permission to one role from the same application.                           |
| User role           | A direct assignment of one application role to one user in the active organization.                    |
| Authority reduction | Removing a role from a user, removing a permission from a role, or deleting an authorization record.   |

## Functional Requirements

### Must Have

- [ ] **AC-01 — Application detail tabs:** append `Roles` and `Permissions` to the existing
      Application detail TabView after `Overview` and `Modules`. Both tabs remain inside the same
      maximized Application surface and operate on the selected application's immutable UUID. They
      do not require an active organization. Switching tabs does not change the selected
      application. (AR-123)
- [ ] **AC-02 — Role collection:** the Roles tab loads the server's complete role array for the
      selected application and always renders a DataGrid, including when the array is empty. Columns
      are Name, Slug, Description, Created, and Updated. Add remains visible but disabled without
      its required capability. Edit, Delete, and Manage permissions remain visible but disabled
      until a row is selected and the relevant capability is present. No search, pagination, or
      hidden partial collection is used. (AR-123, AR-130, AR-135)
- [ ] **AC-03 — Create and edit role:** Add opens one focused dialog with required Name, optional
      Slug, and optional multiline Description. Name accepts 1–255 characters; an entered slug
      accepts 1–100 lowercase alphanumeric characters and interior hyphens, begins and ends with an
      alphanumeric character, and must be unique within the application. Description accepts at
      most 1,000 characters. An omitted create slug continues to use the server's existing
      derivation. Edit exposes Name, Slug, and nullable Description. Create and Save remain disabled
      until required fields and local syntax are valid. (AR-126)
- [ ] **AC-04 — Delete role:** Delete uses the RD-10 confirmation contract with `Keep` and
      `Delete <role name>`. Confirmation permanently deletes the role and cascades its
      role-permission and user-role links. Users whose authority changes are captured and have their
      Porta-controlled authority revoked according to AC-12. Canonical built-in roles in the
      `porta-admin` application cannot be deleted through ordinary role CRUD. Cancellation and
      failure preserve the validated row. (AR-110, AR-122, AR-131)
- [ ] **AC-05 — Permission collection:** the Permissions tab loads the server's complete permission
      array for the selected application and always renders a DataGrid. Columns are Name, Slug,
      Scope, Description, and Created. Scope displays `Application` for a null module ID and the
      module name for a module-owned permission. A missing locally loaded module name falls back to
      the immutable module ID. Add remains visible but disabled without its required capability.
      Edit and Delete remain visible but disabled until a row is selected and the relevant
      capability is present. No search or pagination is added. (AR-123, AR-130, AR-135)
- [ ] **AC-06 — Create permission:** Add opens one focused dialog with required Name, required Slug,
      optional Scope, and optional multiline Description. Scope is either `Application` or exactly
      one module owned by the selected application. Name accepts 1–255 characters, slug accepts
      1–150 characters following Porta's existing `module:resource:action` validation with at least
      three non-empty colon-separated segments, and description accepts at most 1,000 characters.
      Create remains disabled until required fields and local syntax are valid. A foreign module ID
      is rejected server-side without creating a permission. (AR-126, AR-134)
- [ ] **AC-07 — Edit permission:** Edit exposes only Name and nullable multiline Description.
      Permission Slug, Application, and Scope are shown read-only and cannot be submitted as update
      fields. The SDK exposes `permissions.update(appId, permissionId, input)`, and the server
      requires the dedicated `admin:permission:update` capability. (AR-126, AR-127)
- [ ] **AC-08 — Delete permission:** Delete uses `Keep` and `Delete <permission name>` and follows
      RD-10. Confirmation permanently deletes the permission and cascades its role-permission links.
      Users receiving the permission through affected roles are captured and have their
      Porta-controlled authority revoked according to AC-12. (AR-110, AR-122)
- [ ] **AC-09 — Manage role permissions:** Manage permissions opens a focused dialog naming the
      selected role. Its assigned-permissions DataGrid remains visible when empty. Add opens an
      available-permission chooser containing only permissions from the same application that are
      not already assigned. Add requires both `admin:role:update` and
      `admin:permission:read`; without either capability it remains visible-disabled with a fixed
      reason. Remove requires `admin:role:update` and one selected assigned permission. Each
      confirmed Add or Remove sends exactly one mutation and then reloads both the assigned and
      available collections. Canonical built-in role-permission mappings in the `porta-admin`
      application cannot be changed through these generic operations. There is no staged
      multi-request Save. (AR-125, AR-129, AR-131, AR-134)
- [ ] **AC-10 — Manage user roles:** User details adds one `Roles` operation when the administrator
      may read roles. The focused dialog names the selected user and lists every directly assigned
      role with Application, Name, and Slug columns. An application name is used when application
      read capability is available; otherwise the immutable application ID is shown. Add first
      selects an application and then one of that application's roles not already assigned. Add
      requires both `admin:role:assign` and `admin:app:read`; without either capability it remains
      visible-disabled with a fixed reason. Assigning a canonical Admin role is rejected when its
      static capability set exceeds the actor's own static capabilities. Remove acts on one
      selected role, requires `admin:role:assign`, and uses `Keep` and `Remove <role name>`
      confirmation because it reduces authority. The dialog uses the active organization and
      selected user IDs immediately before dispatch and rejects stale responses from another user
      or organization. (AR-78, AR-124, AR-125, AR-128, AR-131)
- [ ] **AC-11 — Canonical Admin protection and last-super-admin guard:** Admin API capabilities are
      resolved only from built-in role slugs assigned from the canonical `porta-admin` application,
      using the static code-defined capability sets. Generic RBAC operations cannot delete those
      built-in role or permission records, change their identity slugs, or change their canonical
      role-permission mappings; reset/init keeps the stored definitions synchronized. Descriptive
      role metadata may remain editable where it cannot change authority. Removing an exact
      canonical `porta-super-admin` assignment succeeds only when another active user retains that
      exact role. Every operation that can reduce the surviving set serializes through the existing
      control-plane organization row and evaluates the survivor rule inside the transaction. No
      generalized protected-role or policy subsystem is introduced. (AR-109, AR-131)
- [ ] **AC-12 — Immediate authority reduction:** removing a role from a user or a permission from a
      role identifies only users whose effective authority can change. In the same bounded
      PostgreSQL transaction as the mapping removal, Porta revokes their tracked admin sessions and
      deletes their stored grants, opaque access-token payloads, and refresh-token payloads. The
      transaction commits without waiting for Redis. Existing post-commit cleanup invalidates only
      affected RBAC/session cache keys. An actual ordinary role-slug change follows the same
      reduction path for every assigned user because it changes emitted authority; name-only or
      description-only edits do not log users out. Self-contained tokens already delivered to
      clients remain cryptographically valid until expiry. Unrelated users remain signed in.
      (AR-94, AR-101, AR-128)
- [ ] **AC-13 — Authority additions:** assigning a role to a user or a permission to a role does not
      log users out. After the database mutation, Porta invalidates only the affected users' RBAC
      caches so the new authority appears through the normal token/session refresh path. It does not
      flush every user's RBAC cache. (AR-128)
- [ ] **AC-14 — Application-boundary integrity:** every nested role and permission read or mutation
      uses both the route's application UUID and the child UUID. This includes role Get/Update,
      permission Get/Update, role-permission List/Add/Remove, permission-role List, and role-user
      List. Role-permission writes atomically reject a mixed batch or any role and permission from
      different applications. Permission creation rejects a module from another application.
      Mapping reads exclude inconsistent historical rows. Missing parent-child pairs return the
      existing sanitized `404`; invalid cross-application associations return the existing
      sanitized `400`. (AR-133, AR-134)
- [ ] **AC-15 — Mutation reconciliation:** every successful create, edit, assignment, removal, or
      deletion reloads the authoritative affected collection before showing success. If an
      authority reduction includes the acting administrator, the server returns the fixed
      `reauthenticationRequired` result after definite success; the UI clears protected state,
      advances its session epoch, and opens authentication without attempting the now-unauthorized
      reload. A failed request preserves the last validated state and shows a fixed sanitized
      outcome. An unknown network outcome requires explicit reload. No optimistic mutation,
      automatic retry, ETag, UI lock, distributed lock, worker, or reconciliation subsystem is
      added. Bounded transaction-local PostgreSQL row locks required by AC-19 are not excluded.
      (AR-129)
- [ ] **AC-16 — Compact and empty presentation:** Layout DSL owns every size and position. Buttons
      retain natural measured width and selection-dependent buttons remain visible-disabled.
      DataGrid columns remain visible for empty role, permission, assigned-permission, and
      assigned-role collections. At 80×24 and 48×12, every operation remains reachable through the
      established bounded compact layout and navigation remains separate from operations. (AR-82,
      AR-123–AR-125, AR-130)
- [ ] **AC-19 — Deterministic authority capture:** before a mapping or identity mutation can change
      authority, the server locks the existing target parent rows in stable UUID order within the
      request transaction, captures and rechecks the affected users immediately before mutation,
      then performs the mutation and database-owned revocation work. These are short ordinary
      PostgreSQL row locks; no advisory, global, distributed, or Serializable locking system is
      introduced.
- [ ] **AC-20 — Application-scoped OIDC claims:** role and permission claims issued to an OIDC
      client contain only definitions owned by that client's application. Identically named roles
      or permissions in another application are independent and are not included.

### Should Have

- [ ] **AC-17 — Readable dates:** Created and Updated values use the shared human-readable Admin UI
      local date/time formatter rather than raw ISO timestamps. (AR-123)
- [ ] **AC-18 — Safe scope context:** application dialogs identify the owning application without
      repeating the old visually invasive global-warning banner. User-role dialogs identify the
      active organization and selected user in compact non-invasive text. (AR-71, AR-92, AR-124)

### Won't Have

- Role templates, inheritance, composite roles, conditional policies, or a policy engine.
- Bulk assignment across multiple users or permissions, import/export, or generated RBAC forms.
- Permission simulation or a resolved effective-permissions viewer. (AR-122, AR-132)
- Search, pagination, optimistic updates, ETags, UI or distributed locks, background jobs, or
  automatic retries. Short transaction-local PostgreSQL row locks remain required for authority
  correctness. (AR-129, AR-130)
- Composite foreign keys or a data-conversion migration. The service/repository boundary enforces
  application integrity using existing schema and reset/init deployment rules. (AR-106, AR-134)

## Technical Requirements

### Server API and authorization

| Operation              | Route family                                 | Required capability                                    |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------ |
| List/Get roles         | `/api/admin/applications/:appId/roles`       | `admin:role:read`                                      |
| Create role            | same                                         | `admin:role:create`                                    |
| Update role            | same                                         | `admin:role:update`                                    |
| Delete role            | same                                         | `admin:role:delete`                                    |
| List role permissions  | nested role routes                           | `admin:role:read`                                      |
| Add role permission    | nested role permission route                 | `admin:role:update` + `admin:permission:read`          |
| Remove role permission | nested role permission route                 | `admin:role:update`                                    |
| List/Get permissions   | `/api/admin/applications/:appId/permissions` | `admin:permission:read`                                |
| Create permission      | same                                         | `admin:permission:create`                              |
| Update permission      | same                                         | `admin:permission:update`                              |
| Delete permission      | same                                         | `admin:permission:delete`                              |
| List user roles        | organization user-role route                 | `admin:role:read`                                      |
| Add user role          | organization user-role route                 | `admin:role:assign` + `admin:app:read` + actor ceiling |
| Remove user role       | organization user-role route                 | `admin:role:assign`                                    |

The dedicated permission-update capability is added to the existing centralized permission and
built-in-role definitions and is granted to Super Admin and Application Admin through the normal
reset/migrate/init path. `admin:app:read` is added to the static User Admin capability set so its
role-assignment workflow can discover applications. No compatibility conversion is required for
deployed data. The validated UserInfo capability snapshot controls UI affordances only; the server
middleware remains authoritative. (AR-59, AR-106, AR-127)

Admin middleware accepts built-in Admin roles only when the assignment joins to the canonical
`porta-admin` application. It resolves their effective capabilities from the static code-defined
sets, not editable database mappings. When assigning a canonical Admin role, the server requires
the target role's static capability set to be a subset of the actor's static capabilities. Ordinary
application roles and permissions remain live application-owned RBAC definitions. OIDC role and
permission claim resolution is filtered by the requesting client's resolved application UUID.

Every authority-reducing mutation returns a validated fixed-shape result containing
`reauthenticationRequired: boolean`. It is `true` only when the transaction's captured affected-user
set includes the authenticated actor. This result reports a committed outcome; it is not inferred by
the Admin UI from the selected row.

### SDK and conventional CLI contracts

- `roles.list(appId)` returns `Promise<Role[]>` by unwrapping the server's `{ data: Role[] }`.
- `permissions.list(appId, { moduleId? })` returns `Promise<Permission[]>` by unwrapping the
  server's `{ data: Permission[] }`.
- Inaccurate role/permission pagination and `listAll` contracts are removed rather than retained
  through compatibility wrappers.
- `permissions.update(appId, permissionId, input)` and `UpdatePermissionInput` expose only optional
  `name` and nullable `description`.
- `userRoles.list(orgId, userId)` unwraps the server's `{ data: Role[] }` into a validated `Role[]`.
- `userRoles.assign(orgId, userId, roleIds)` and `userRoles.remove(orgId, userId, roleIds)` use the
  server's collection `PUT` and `DELETE` routes with `{ roleIds }`; the Admin UI and conventional
  CLI wrap a single selected role in a one-element array.
- Permission creation requires `slug`; `applicationId` remains a path argument rather than a
  duplicated editable body field.
- The conventional `porta app role list` and `porta app permission list` commands remove their
  inaccurate page options and render the complete arrays. Other conventional RBAC commands retain
  their current direct behavior. (AR-127, AR-135)
- Published SDK agent role/permission definitions and executors use the same complete-array
  contracts and expose permission update. Their tests and affected public SDK/CLI documentation are
  updated with the contract rather than retaining false pagination or mutation details.

### Data integrity and mutation boundaries

- Repository queries use application-qualified predicates or equivalent atomic statements where a
  route supplies `appId`. A read-before-write check followed by an unqualified write is insufficient
  when one atomic qualified operation is available.
- Role-permission assignment validates the role and every permission against the same application
  before insertion and creates no links when any requested ID is invalid.
- Permission creation validates an optional module through its `(application_id, id)` ownership
  pair before insertion.
- Existing parameterized SQL, UUID validation, slug allowlists, uniqueness rules, audit events, and
  transaction ownership are preserved.
- Before an authority-changing mapping, delete, or role-slug update, repository code locks the
  existing target parent rows in stable UUID order. It captures and rechecks affected user and grant
  identifiers immediately before mutation. PostgreSQL remains authoritative. Redis cleanup is
  targeted and post-commit; no database transaction waits for Redis. (AR-94, AR-128, AR-134)

### Admin UI state and layout

- Application role and permission state is bound to the authenticated session epoch and selected
  application ID. User-role state is additionally bound to the active organization and selected
  user IDs.
- Remote records are validated before entering UI state. UUIDs, application ownership, closed
  status values, text lengths, slug syntax, and nullable module/description values are explicit.
- Remote text rejects ASCII/C1 control characters before rendering. Errors never render raw response
  bodies, SQL errors, stack traces, cache keys, tokens, session IDs, or internal paths.
- Existing movable-modal ownership, cancellation, focus restoration, compact rendering, and
  natural button sizing patterns are reused directly. No reusable RBAC workspace framework is added.

## Integration Points

### With RD-03: User management

- Reuses the selected-organization User detail, capability-aware operations, stale-context checks,
  sanitized outcomes, and authoritative reload pattern.
- Adds one focused Roles operation without changing the rest of the User detail information
  architecture. (AR-124)

### With RD-04: Applications and OIDC clients

- Extends the existing Application detail TabView and uses its selected global application as the
  sole owner of role and permission definitions.
- Resolves permission scope through the selected application's existing modules. (AR-123, AR-126)

### With RD-10: Record deletion and lifecycle simplification

- Reuses permanent role/permission deletion, direct confirmation, relational cascade, targeted
  authority capture, short PostgreSQL transactions, post-commit cache cleanup, and audit behavior.
- Does not restore Archive, force switches, impact previews, typed confirmation, queues, or workers.
  (AR-94, AR-101, AR-103, AR-110)

## Scope Decisions

| Decision              | Options considered                         | Chosen                                             | Rationale                                               | AR Ref         |
| --------------------- | ------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------- | -------------- |
| Product boundary      | Direct RBAC / advanced RBAC suite          | Direct role, permission, and assignment management | Completes the required workflow without a policy system | AR-122         |
| Application UI        | Detail tabs / top-level workspaces         | Application detail tabs                            | Roles and permissions are owned by an application       | AR-123         |
| User UI               | Focused operation / User redesign          | Focused Roles dialog                               | Avoids an unrelated detail rewrite                      | AR-124         |
| Mapping interaction   | One-row mutations / staged batch Save      | One-row Add/Remove                                 | Avoids partial multi-request Save behavior              | AR-125         |
| Mutable identity      | Existing immutable scope / fully mutable   | Existing server boundary                           | Keeps references stable and truthful                    | AR-126         |
| Permission update     | Dedicated update / reuse create            | Dedicated `admin:permission:update`                | Preserves least-privilege capability separation         | AR-127         |
| Authority cleanup     | Reduction-only / every change / cache only | Targeted reduction revocation                      | Removes stale authority without needless logout         | AR-128         |
| Mutation state        | Reload / optimistic concurrency system     | Authoritative reload                               | Reuses the established simple pattern                   | AR-129         |
| Collection controls   | Complete grid / search and pagination      | Complete always-visible grid                       | Expected collections are small                          | AR-130         |
| Built-in roles        | Canonical static / live editable mappings  | Canonical static capabilities and narrow guards    | Prevents delegation-based privilege escalation          | AR-131         |
| Effective permissions | Defer / show now                           | Deferred                                           | Direct assignment is the required workflow              | AR-132         |
| Nested boundaries     | Parent-qualified / ID-only                 | Parent-qualified and atomic                        | Prevents cross-application claim contamination          | AR-133, AR-134 |
| SDK lists             | Complete arrays / add server pagination    | Complete arrays                                    | Matches the intentional server contract                 | AR-135         |
| OIDC RBAC claims      | Application-filtered / global union        | Application-filtered                               | Prevents unrelated application authority leakage        | AR-131         |

## Security Considerations

- **Data sensitivity:** roles, permissions, user-role assignments, sessions, grants, and token
  payloads are security-sensitive authorization state. The UI displays names and identifiers but
  never secret or token values.
- **Input validation:** the server validates UUIDs, bounded text, role and permission slug syntax,
  uniqueness, application ownership, module ownership, and same-application mappings. Client-side
  checks improve feedback but never replace server validation.
- **Authentication and authorization:** every route retains admin authentication and its exact
  granular capability. Admin authority is derived only from canonical `porta-admin` built-in role
  assignments and static capability sets. Assignment of a stronger canonical role is rejected.
  UserInfo claims only disable unavailable UI actions; server checks decide.
- **Tenant isolation:** users are always addressed through their organization-qualified route.
  Role and permission definitions are global but every nested child operation is application-
  qualified. OIDC clients receive only their application's role and permission claims. Returned
  state is checked before publication.
- **Authority reduction:** removal immediately invalidates only affected Porta-controlled sessions,
  opaque tokens, refresh capability, grants, and caches. It does not claim recall of self-contained
  tokens already delivered to clients.
- **Injection risks:** all SQL remains parameterized; no role, permission, slug, or identifier is
  interpolated into executable SQL, shell commands, or terminal escape sequences.
- **Audit:** every RD-05 create, update, assignment, removal, and deletion event receives the
  authenticated actor. User-role inserts also persist that actor in `assigned_by`. Audit data does
  not contain tokens, session IDs, raw errors, or rendered untrusted control characters.
- **Encryption and transport:** no new secret material or storage is introduced. Existing TLS,
  credential storage, cookie, token, and database protections remain unchanged.
- **Rate limiting:** these authenticated setup operations retain existing Admin API controls. No new
  public or brute-forceable endpoint is introduced.
- **Infrastructure:** no dependency, worker, queue, cache tier, schema subsystem, or deployment
  service is added.

## Non-Functional Requirements

- A complete role or permission list must fail closed if response validation fails; partial rows are
  never published.
- Mapping mutations remain bounded synchronous database operations. PostgreSQL transactions are not
  held while waiting for Redis cleanup.
- Standard and compact terminal sizes remain fully keyboard-operable with no clipped operations.
- The implementation reuses existing server, SDK, CLI, Admin UI, and test patterns and introduces no
  generalized RBAC abstraction.

## Acceptance Criteria

1. [ ] Application details show usable Overview, Modules, Roles, and Permissions tabs at 80×24 and
       48×12; role and permission grids render their columns with zero rows.
2. [ ] An administrator with the exact capabilities can create, edit, inspect, and delete roles and
       permissions; Add and selected-row actions remain visible-disabled when any required
       capability or selection is absent, and direct unauthorized calls receive server `403`.
3. [ ] Permission edit changes only Name and Description and requires
       `admin:permission:update`; Permission Slug, Application, and Scope cannot change.
4. [ ] Role-permission and user-role Add/Remove each issue one mutation and reload the authoritative
       collection; a failed or indeterminate request does not publish an assumed result. A
       successful self-affecting reduction returns `reauthenticationRequired` and enters
       authentication without a protected reload.
5. [ ] A role or permission addressed through another application's nested URL returns sanitized
       `404`, a permission cannot reference another application's module, and no cross-application
       role-permission link can be created or returned. An OIDC client receives only roles and
       permissions owned by its application, including when another application reuses a slug.
6. [ ] Removing a user role or role permission revokes only affected users' tracked sessions,
       stored grants, opaque access-token payloads, refresh-token payloads, and cache state without
       terminating unrelated users or waiting for Redis inside the database transaction. An actual
       ordinary role-slug change follows the same affected-user revocation path.
7. [ ] Adding a user role or role permission does not terminate sessions and invalidates only the
       affected users' RBAC caches.
8. [ ] Admin authority accepts built-in role assignments only from the canonical `porta-admin`
       application and uses static capabilities. Generic RBAC operations cannot delete or change
       the identity or mappings of canonical built-ins. Canonical role assignment cannot grant
       capabilities the actor does not hold. Concurrent removal of the exact
       `porta-super-admin` assignment fails unless another active exact holder survives.
9. [ ] Role and permission list SDK methods return validated complete arrays matching the server;
       user-role SDK methods match the server's array and collection mutation contracts; the SDK
       agent, conventional CLI, and affected public docs expose no false pagination or mutation
       contract.
10. [ ] Create/edit dialogs enforce the stated required fields, lengths, slug syntax, immutable
        fields, multiline descriptions, natural single-line height, and Layout DSL sizing before
        dispatch while the server independently enforces the same security boundary.
11. [ ] Delete uses `Keep` and `Delete <name>`, cascades existing assignments through RD-10, and
        reloads the authoritative grid on success.
12. [ ] Security specifications cover cross-application IDs, foreign module IDs, mixed mapping
        batches, application-filtered OIDC claims, canonical Admin-role provenance and delegation,
        missing capabilities, stale context, control-character text, targeted authority cleanup,
        concurrent last-super-admin removal, and sanitized errors without weakening existing
        pentest assertions.
13. [ ] Authority-changing mutations acquire bounded transaction-local PostgreSQL row locks in
        stable UUID order and capture/recheck affected users immediately before mutation; no Redis
        wait or generalized locking subsystem is introduced.
14. [ ] Every RD-05 mutation audit event includes the authenticated actor, and every user-role
        assignment stores that actor in `assigned_by`.

## Verification Requirements

- Write immutable server, SDK, conventional CLI, and Admin UI specification tests before modifying
  behavior. Add implementation tests only for internal branches not already covered by specifications.
- Run focused server unit/integration/E2E/pentest selectors for RBAC ownership, capabilities,
  assignment, delegation ceilings, concurrent last-super-admin preservation, deletion,
  session/token cleanup, audit attribution, and validation.
- Run focused SDK agent and conventional CLI contract tests, including the repaired user-role
  collection operations and permission update.
- Run the affected server, SDK, and CLI workspace verification commands plus
  `yarn test:structure`. Do not run root `yarn verify`, per the active user directive.
- Run the applicable registered security assurance harness profile for authorization, tenant and
  application isolation, sessions, tokens, and information exposure.
- Browser Playwright is not applicable to the terminal UI. The retained OIDC harness is required
  because implementation changes observable role and permission claim issuance.
