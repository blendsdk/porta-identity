# RD-10: Record Deletion and Lifecycle Simplification

> **Document**: RD-10-application-module-client-deletion.md
> **Status**: Approved
> **Created**: 2026-09-05
> **Revised**: 2026-09-06
> **Feature**: Porta Admin UI
> **Depends On**: RD-02, RD-03, RD-04
> **CodeOps Artifact Schema**: 1

## Feature Overview

Porta uses one permanent record operation: Delete. Archive, Restore, Destroy, Purge, and
whole-client Revoke are removed as record lifecycle terms. Resources that need a reversible
operational stop retain their existing temporary state: organizations are Active or Suspended;
applications, modules, and OIDC clients are Active or Inactive. Revocation remains available only
for credentials and protocol/security artifacts such as client secrets, sessions, tokens,
invitations, and signing keys. (AR-103–AR-107)

An authorized administrator confirms once, after which Porta synchronously deletes the current
PostgreSQL dependency graph and durable audit event in one concise transaction. The transaction
captures affected users, clients, grants, and cache identifiers before cascade. After commit, one
detached event-loop callback performs targeted best-effort Redis cleanup without holding the
database client or HTTP response open. PostgreSQL remains authoritative if Redis cleanup fails.
(AR-87–AR-94, AR-97, AR-101, AR-110)

The Admin API, SDK, and conventional CLI cover direct deletion of organizations, applications,
modules, OIDC clients, roles, permissions, custom-claim definitions, and users. The embedded Admin
UI covers its five existing resource surfaces: organizations, users, applications, modules, and
clients. No role, permission, or claim workspace is added. (AR-85, AR-95, AR-103–AR-105, AR-108)

## Functional Requirements

### Must Have

- [ ] **AC-01 — Lifecycle simplification:** remove `archived` from organization and application
      status contracts and remove `revoked` from whole-client status contracts. Remove application
      and organization Archive, organization Restore, organization Destroy, User Purge, and
      whole-client Revoke actions without compatibility aliases. Existing suspended/inactive records
      remain reversible. Secret and protocol/security-artifact revocation remains unchanged.
      (AR-103–AR-107)
- [ ] **AC-02 — Uniform record API:** the Admin API exposes one authenticated `DELETE` operation for
      organization, application, module, client, role, permission, custom-claim definition, and user
      records. Every success returns `204` with no body. A malformed identifier returns fixed `400`,
      absent or mismatched target returns fixed `404`, missing authentication returns `401`, and
      missing exact delete permission returns `403`, without dependency disclosure. (AR-86, AR-105,
      AR-110)
- [ ] **AC-03 — Direct confirmation:** every Admin UI and conventional CLI record deletion uses a
      plain irreversible warning containing the complete safe target name and affected-data classes.
      Actions are `Keep` and `Delete <name>`; `Keep` owns initial focus. There is no typed input,
      impact preview, dry-run, force switch, ETag, multi-step approval, automatic retry, or optimistic
      removal. (AR-86, AR-92, AR-93, AR-108, AR-110)
- [ ] **AC-04 — Organization deletion:** delete any active or suspended non-control-plane
      organization and its users, clients, credentials, claims, assignments, sessions, branding,
      recovery artifacts, and other organization-owned rows. Global applications and authorization
      definitions remain. The control-plane organization identified by `is_super_admin` cannot be
      deleted at either the service or repository boundary. (AR-89, AR-109)
- [ ] **AC-05 — Application deletion:** delete any active or inactive global application and every
      owned module, client across all organizations, client secret, role, permission, assignment
      link, claim definition, and claim value. The warning states that the operation is
      deployment-global. (AR-88–AR-90, AR-103)
- [ ] **AC-06 — Module deletion:** delete an active or inactive module only through its exact parent
      application UUID. Cascade-delete its permissions and their role-permission links; no deleted
      module permission may become unscoped through `module_id = NULL`. (AR-87, AR-88)
- [ ] **AC-07 — Client deletion:** delete an active or inactive client and its secrets plus
      identifiable PostgreSQL and Redis protocol state. Only clients belonging to the selected
      organization may be dispatched by the Admin UI, while server authorization remains
      deployment-wide. Whole-client Revoke does not remain as an alternate terminal state.
      (AR-88, AR-90, AR-107)
- [ ] **AC-08 — Role deletion:** delete a role and cascade its role-permission and user-role links
      after confirmation. Assigned users do not require a `force` query parameter; they are captured
      before deletion so their server-controlled sessions and grants are terminated after commit.
      (AR-94, AR-101, AR-105, AR-110)
- [ ] **AC-09 — Permission deletion:** delete a permission and cascade its role-permission links
      after confirmation. Roles referencing it do not require `force`; users receiving the permission
      through those roles are captured before deletion and logged out after commit. Module deletion
      uses the same authority-change boundary for its owned permissions. (AR-87, AR-94, AR-101,
      AR-105, AR-110)
- [ ] **AC-10 — Custom-claim deletion:** delete a claim definition and cascade its user values after
      confirmation. Users with a value for the deleted definition are captured before deletion and
      their server-controlled sessions and grants are terminated so a backed flow cannot continue
      with stale claim state. (AR-94, AR-101, AR-105, AR-110)
- [ ] **AC-11 — User deletion:** physically delete the selected user row and cascade credentials,
      login/recovery tokens, 2FA records, role assignments, claim values, sessions, and other owned
      identity data. Nullable references are cleared. No anonymized placeholder user or stable
      `purged-<UUID>` email remains. Audit history is separate security/operational evidence: it is
      retained unchanged under configured retention, may identify the deleted user, and has nullable
      user/actor foreign keys cleared by the database. Porta makes no GDPR-erasure claim. (AR-104,
      AR-105, AR-111)
- [ ] **AC-12 — Administrator continuity:** the control-plane organization remains undeletable. A
      user in that organization may be deleted, including the bootstrap or current administrator,
      only when another active user is assigned the exact built-in `porta-super-admin` role. These
      checks serialize by locking the single control-plane organization row before rechecking the
      survivor. A successful self-delete completes and the current session then follows the ordinary
      login flow. This is the only record-specific availability guard. (AR-100, AR-109)
- [ ] **AC-13 — Dedicated permissions:** use `admin:org:delete`, `admin:app:delete`,
      `admin:module:delete`, `admin:client:delete`, `admin:role:delete`,
      `admin:permission:delete`, `admin:claim:delete`, and `admin:user:delete`. Super Admin receives
      all. Organization Admin receives organization delete; User Admin receives user delete;
      Application Admin receives application, module, client, role, permission, and claim delete.
      Archive permissions are removed, and `admin:client:revoke` authorizes only client-secret
      revocation. (AR-91, AR-103–AR-105)
- [ ] **AC-14 — Atomic database mutation:** the existing Admin mutation-audit middleware owns one
      PostgreSQL transaction. Inside it, the service locks and loads the exact target, captures the
      affected graph, marks identifiable tracking rows revoked, removes PostgreSQL protocol state,
      writes one safe resource-specific deletion audit event, deletes the target, and registers one
      immutable post-commit cleanup descriptor. The generic mutation audit resolves a physically
      deleted actor to `NULL`. Failure before commit rolls back every database and audit change and
      schedules no Redis work. (AR-93, AR-94)
- [ ] **AC-15 — Targeted authority cleanup:** organization deletion affects all users and clients in
      that organization. Application deletion affects all owned clients plus users linked through
      owned roles, permissions, or claim values. Module, role, permission, and claim deletion affects
      only users linked to the removed authorization/claim state. Client deletion affects only that
      client; user deletion affects only that user. Affected-user tracking rows are transactionally
      revoked. Client-only continuation is rejected by direct client authority even if Redis cleanup
      is delayed. Unrelated users' sessions and grants remain active. (AR-90, AR-101)
- [ ] **AC-16 — Detached Redis cleanup:** after commit, the transaction hook schedules one
      `setImmediate` callback and returns. The PostgreSQL client is released and the HTTP response is
      not held for Redis. The callback removes exact application, client, claim, role, permission,
      user-RBAC, and user cache keys captured before cascade, then performs one complete cursor pass
      over the closed OIDC Redis model namespaces for affected client, grant, and user references.
      Failures settle without retry and log only fixed text with no identifiers, keys, payloads, or
      raw errors. (AR-94, AR-97, AR-101)
- [ ] **AC-17 — Live authority:** OIDC Client-model resolution always reads the active client
      directly from PostgreSQL and neither consults nor repopulates the client cache. Session
      tracking writes are awaited and failure-propagating. OIDC adapter `find`, `findByUid`, and
      `findByUserCode` validate every present client, account, grant, and Session-authorization
      client/grant reference against PostgreSQL; Session reads also reject a tracked `revoked_at`.
      RBAC/claim issuance uses direct database reads. A cache hit alone can never restore deleted
      authority. Existing self-contained JWTs remain independently valid only until their original
      expiry. (AR-90, AR-94)
- [ ] **AC-18 — Public clients:** add thin SDK and conventional CLI `delete` methods/commands for the
      eight record types. Remove old Archive, Restore, Destroy, Purge, and whole-client Revoke
      methods/commands rather than retaining aliases. Commands call the SDK, use the common direct
      confirmation contract, and add no independent cascade or authorization logic. (AR-95, AR-103,
      AR-105, AR-108)
- [ ] **AC-19 — Admin UI:** reuse the current list/detail/controller/workspace architecture and
      JSVision Layout DSL. Delete is an operational action with natural measured width. Module
      operations remain separated from their DataGrid by the existing blank DSL row. Capability,
      selection, parent, organization, and session-generation checks are explicit; duplicate
      submission is blocked. Success reloads authoritative state and navigates away from a deleted
      detail. Failure reloads and shows a fixed error. (AR-82, AR-96, AR-110)
- [ ] **AC-20 — Migration and initialization:** add one ordered forward migration without rewriting
      applied migrations. It changes module-permission deletion to cascade and removes archived or
      whole-client-revoked status values. Its Down section is a documented no-op. Permission creation
      and built-in role mapping remain owned by normal `porta init`. Validation uses reset, migrate,
      and init; no initialized-database correction, data conversion, compatibility alias, or rollback
      recovery is built. (AR-98, AR-103, AR-106)
- [ ] **AC-21 — Pending invitations:** application, role, permission, claim, or user deletion does
      not rewrite stored invitation JSON. Creation and acceptance use canonical
      `custom_claim_definitions`, `custom_claim_values`, and `claim_id` names. Acceptance skips only
      deleted preassignments and applies still-valid references. Creation validates the application
      as a deployment-global definition without an organization predicate, while role and claim
      checks remain parent-qualified. Deleting an invited user removes the owned invitation token
      through cascade. (AR-102, AR-104)

### Should Have

- [ ] Focus restoration after `Keep` returns to the invoking control. After success, focus moves to
      the authoritative reloaded collection without selecting an unrelated row.
- [ ] Warning text wraps at 80×24 and 48×12. The complete safe name remains in the body; only the
      destructive button may ellipsize.

### Won't Have (Out of Scope)

- Archive, Restore, Destroy, Purge, or whole-client Revoke lifecycle operations or aliases.
- Bulk record deletion, deletion previews, dry-run endpoints, exact dependency counts, ETags,
  `force` switches, typed confirmation, multi-step approval, or delayed deletion.
- Background deletion jobs, queues, cleanup workers, reverse indexes, automatic retries, generic
  deletion frameworks, or new infrastructure.
- Compatibility conversion for existing archived/revoked/anonymized rows or rollback recovery.
- Token deny-lists or introspection added only to recall self-contained JWTs.
- Cancellation or rewriting of stored invitation details.

## Technical Requirements

### Ownership and cascade model

```text
Organization
├── Users ── credentials, 2FA, assignments, claims, sessions, recovery state
└── OIDC clients ── secrets, grants, protocol artifacts, sessions

Global Application
├── Modules ── permissions ── role-permission links
├── Roles ── user-role links
├── Claim definitions ── claim values
└── OIDC clients across organizations
```

- Capture uses parameterized set-based queries inside the deletion transaction. Internal database
  UUIDs remain distinct from public OIDC client IDs.
- The transaction-local graph contains internal/public client IDs, grant IDs, authorization- and
  claim-affected user IDs, application ID/slug, claim application IDs, role IDs, permission IDs,
  and the exact identifiers required by existing cache namespaces. The smaller Redis scan descriptor
  is derived from that graph.
- `admin_sessions` is authoritative only for affected-user revocation. Session mirroring is awaited
  and failure-propagating. Its single nullable `client_id` is not treated as a complete map of a
  Session's client authorizations; client-only authority is closed by direct client validation and
  exact best-effort Redis scanning.
- Reusable slug cache keys are removed only if the cached object still has the deleted UUID, so a
  concurrent replacement cannot be erased.
- PostgreSQL foreign keys own relational cascade. Services do not implement row-by-row deletion.

### API and authorization matrix

| Record           | Endpoint                                                          | Permission                | Eligible state                           |
| ---------------- | ----------------------------------------------------------------- | ------------------------- | ---------------------------------------- |
| Organization     | `DELETE /api/admin/organizations/:idOrSlug`                       | `admin:org:delete`        | Active or Suspended; never control-plane |
| Application      | `DELETE /api/admin/applications/:id`                              | `admin:app:delete`        | Active or Inactive                       |
| Module           | `DELETE /api/admin/applications/:appId/modules/:moduleId`         | `admin:module:delete`     | Active or Inactive                       |
| Client           | `DELETE /api/admin/clients/:id`                                   | `admin:client:delete`     | Active or Inactive                       |
| Role             | `DELETE /api/admin/applications/:appId/roles/:roleId`             | `admin:role:delete`       | Existing record                          |
| Permission       | `DELETE /api/admin/applications/:appId/permissions/:permissionId` | `admin:permission:delete` | Existing record                          |
| Claim definition | `DELETE /api/admin/applications/:appId/claims/:claimId`           | `admin:claim:delete`      | Existing record                          |
| User             | `DELETE /api/admin/organizations/:orgId/users/:userId`            | `admin:user:delete`       | Existing record satisfying AC-12         |

- Admin routes remain inside the existing bearer-token authentication, permission, organization
  membership where applicable, rate-limit, restrictive CORS, HTTPS, security-header, and fixed-error
  boundaries. Form-style CSRF middleware is not claimed for Authorization-header Admin APIs.
- All route identifiers use existing allowlist/Zod validation and every query remains parameterized.
- Parent-qualified routes lock and load through both parent and child UUID. A mismatched pair is the
  same fixed `404` as a missing target.

### Audit contract

- Events are `org.deleted`, `app.deleted`, `app.module.deleted`, `client.deleted`, `role.deleted`,
  `permission.deleted`, `claim.deleted`, and `user.deleted`, all in the existing `admin` category.
- Metadata contains only bounded, control-free target identity needed for attribution, lifecycle
  state where present, and parent ID where applicable. This may identify a deleted user as part of
  the audit record. It never contains secrets, protocol payloads, grants, sessions, affected-user
  lists, Redis keys, or raw errors.
- Audit history remains unchanged as access-controlled security/operational evidence under the
  configured retention policy and may identify a deleted user. Foreign keys set direct user/actor
  references to null on physical deletion; no placeholder user is retained.
- The existing generic `admin.mutation.committed` row remains. Repeated deletion produces `404` and
  no second resource-specific event.

### Verification contract

- Immutable specification tests are written and observed red before implementation for every API,
  cascade, permission, lifecycle removal, transaction rollback, audit, authority, SDK, CLI, and Admin
  UI behavior.
- Security specifications separately cover writes raced before and after commit, concurrent
  last-administrator deletion, cross-organization application effects and unrelated preservation,
  audit retention, hostile terminal text, deletion of current Admin UI authority, and the
  control-plane/last-administrator guards.
- Coverage is defined by every behavioral branch, failure boundary, and specification case. No
  unsupported per-changed-file numerical percentage is claimed.
- Every phase names exact focused Vitest selectors plus the applicable workspace and structure gates.
  Server security changes receive integration, E2E, pentest, browser/harness, and registered assurance
  coverage required by project guidance. Final manual Admin UI testing begins with
  `yarn admin:env reset`, then `yarn admin:env up`, then `yarn admin`.

## Integration Points

- **RD-02:** removes archived organization context and preserves Active/Suspended selection.
- **RD-03:** replaces Purge and its placeholder record with physical User Delete.
- **RD-04:** removes Application Archive and whole-client Revoke while retaining temporary disable
  and client-secret revocation.
- **RD-05:** direct role and permission deletion uses dedicated permissions and targeted authority
  cleanup; no role/permission UI framework is introduced here.
- **RD-07:** targeted session cleanup reuses existing session/protocol storage without adding a
  session browser or policy engine.
- **RD-08:** durable deletion events remain available to the later audit workspace.
- **RD-09:** no bulk deletion or import/export behavior is introduced.

## Scope Decisions

| Decision         | Chosen                                                  | Rationale                                              | AR Ref               |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------------ | -------------------- |
| Record lifecycle | Reversible disable plus Delete                          | Archive duplicates retained disabled state             | AR-103               |
| User erasure     | Physical user deletion                                  | Foreign keys already cascade or null references        | AR-104, AR-111       |
| Terminology      | Delete for records; Revoke for security artifacts       | One clear product vocabulary                           | AR-105, AR-107       |
| Deployment       | Reset/migrate/init only                                 | No deployed data requires conversion                   | AR-106               |
| Public surfaces  | API/SDK/CLI: eight; Admin UI: five existing surfaces    | Avoids inventing three unrelated workspaces            | AR-108               |
| Control plane    | Organization protected; replaceable administrators      | Preserves operability without immortal users           | AR-109               |
| Interaction      | Direct confirmation and synchronous database deletion   | Rare setup operation needs no machinery                | AR-110               |
| Cleanup          | Targeted post-commit best effort with live DB authority | Short transaction and response without stale authority | AR-94, AR-97, AR-101 |

## Security Considerations

- **Authentication and authorization:** every route requires the exact dedicated delete permission.
  UI/CLI affordances never replace server checks.
- **Tenant isolation:** organization and user deletes are organization-qualified. Client Admin UI
  dispatch is bound to the active organization. Global application deletion explicitly spans
  organizations.
- **Control-plane availability:** database and service guards prevent deletion of the control-plane
  organization. The last active `porta-super-admin` assignment prevents administrator lockout.
- **Authority closure:** affected server-controlled sessions, grants, refresh capability, OIDC
  artifacts, role/permission claims, and caches are removed. Direct PostgreSQL reads prevent stale
  Redis from restoring authority.
- **Audit boundary:** physical user deletion removes the account and owned identity/security data.
  Audit history is separately governed evidence, may identify the deleted user, and expires through
  configured retention. Porta does not claim GDPR erasure.
- **Failure safety:** database deletion and audit are atomic. Redis failure cannot roll back committed
  PostgreSQL state and logs no sensitive context.
- **Infrastructure:** no worker, queue, outbox, reverse index, scheduled job, service, dependency, or
  deployment component is added.

## Acceptance Criteria

1. [ ] Organization and application schemas accept only their two retained statuses; client schemas
       accept only Active/Inactive. No product API, SDK, CLI, Admin UI, permission, or documentation
       surface exposes Archive, Restore, Destroy, Purge, or whole-client Revoke.
2. [ ] Every record endpoint in the API matrix returns bodyless `204` on success and fixed
       `400`/`401`/`403`/`404` outcomes without dependency disclosure. Repeated Delete returns `404`
       and writes no second deletion event.
3. [ ] Organization Delete cascades its complete tenant-owned graph, logs out its users and clients,
       preserves global definitions and unrelated organizations, and rejects the control-plane
       organization at service and SQL boundaries.
4. [ ] Application, module, and client Delete satisfy their exact cascade and parent/organization
       boundaries, remove affected protocol authority, and preserve unrelated records and sessions.
5. [ ] Role, permission, and claim Delete require no force switch, cascade their assignment/value
       links, and log out exactly the users whose effective authorization or claim state changed.
6. [ ] User Delete physically removes the row and owned identity/security data, clears nullable
       references, removes server-controlled authority, and leaves no placeholder user. Existing
       audit history survives under configured retention and may identify the deleted user.
7. [ ] Deleting a control-plane administrator succeeds only when another active user has the exact
       `porta-super-admin` role. Concurrent attempts cannot delete both remaining administrators
       because the survivor check serializes on the control-plane organization row. Deleting the
       current administrator completes and the next protected request follows the login flow.
8. [ ] Super Admin and the appropriate built-in functional administrator roles receive the eight
       dedicated delete permissions after reset/migrate/init. Archive permission slugs are absent and
       client-revoke permission authorizes only secret revocation.
9. [ ] A forced failure at every pre-commit step rolls back target, dependencies, tracking state,
       protocol rows, and audit. Session creation fails if its tracking write fails. No Redis cleanup
       runs for a rolled-back delete. After commit, client release and HTTP completion do not wait
       for Redis.
10. [ ] Pre-primed stale caches and all three OIDC adapter lookup methods cannot resolve
        deleted/inactive clients, continue a revoked tracked Session, mint or continue server-backed
        authority, or restore removed roles, permissions, or claims. Redis cleanup removes exact
        known keys plus one closed-namespace cursor pass and preserves unrelated keys.
11. [ ] Every SDK and conventional CLI Delete operation uses the exact endpoint, issues one request,
        returns void on `204`, propagates sanitized errors, and exposes no old destructive alias.
12. [ ] The five existing Admin UI resource surfaces use `Keep` and `Delete <name>`, render the
        complete safe name and generic cascade/logout consequence, block duplicate dispatch, reload
        authoritative state, and remain usable at 80×24 and 48×12. Role, permission, and claim
        deletion remains API, SDK, and conventional CLI only.
13. [ ] Pending invitations retain their stored JSON; canonical creation and acceptance apply valid
        role/claim preassignments and skip deleted ones without raw identifier disclosure.
14. [ ] The forward migration changes module permission cascade and lifecycle constraints without
        rewriting earlier migrations. Its Down is a documented no-op. Reset/migrate/init creates
        exactly the new permissions and role mappings without compatibility conversion.
15. [ ] Specification, implementation, integration, E2E, pentest, browser/harness, SDK, CLI,
        structure, documentation, compatibility, and registered assurance gates required by the
        affected boundaries pass. The separate manual journey starts from `yarn admin:env reset`.

## Technical Documentation Update

Update public API, SDK, CLI, lifecycle, RBAC, schema, operator, and Admin UI documentation. Delete is
the only permanent record term; Revoke is reserved for credentials and protocol/security artifacts.
Document exact cascades, targeted logout, control-plane continuity, physical user deletion, retained
audit identity and retention, reset-based development, and the independent expiry of self-contained
JWTs.
