# Testing Strategy: Record Deletion and Lifecycle Simplification

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-09-06
> **CodeOps Artifact Schema**: 1

## Rules

Specification tests derive only from RD-10 and are written before production changes. Their expected
behavior is immutable after the expected-red checkpoint. Implementation tests may inspect internal
query shape, descriptors, and rendering mechanics. Security assertions are never weakened or
retried away.

## Planned Specification Files

| Workspace          | File                                                                                        | Primary cases                          |
| ------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------- |
| Server unit        | `packages/server/tests/unit/oidc/deleted-authority.spec.test.ts`                            | ST-20–ST-24                            |
| Server unit        | `packages/server/tests/unit/routes/record-deletion.spec.test.ts`                            | ST-02, ST-06–ST-07, ST-14–ST-18, ST-25 |
| Server integration | `packages/server/tests/integration/migrations/record-deletion-lifecycle.spec.test.ts`       | ST-01–ST-05                            |
| Server integration | `packages/server/tests/integration/admin/record-deletion.spec.test.ts`                      | ST-06–ST-20, ST-26–ST-27               |
| Server integration | `packages/server/tests/integration/oidc/deletion-authority.spec.test.ts`                    | ST-20–ST-26                            |
| Server integration | `packages/server/tests/integration/services/invitation-deleted-preassignments.spec.test.ts` | ST-40–ST-41                            |
| SDK                | `packages/sdk/tests/resource-deletion-rd10.spec.test.ts`                                    | ST-28–ST-29                            |
| CLI commands       | `packages/cli/tests/commands/resource-deletion.spec.test.ts`                                | ST-29–ST-31                            |
| Embedded Admin UI  | `packages/cli/tests/admin/resource-deletion-state.spec.test.ts`                             | ST-32–ST-35, ST-39                     |
| Embedded Admin UI  | `packages/cli/tests/admin/resource-deletion-workspace.spec.test.ts`                         | ST-33, ST-36–ST-38                     |

Split a planned file only when it would mix unrelated concerns or exceed the repository size rule;
keep the case-to-file mapping explicit in this document and the execution plan.

## Specification Cases

### Lifecycle, Migration, and Permissions

| ID    | Expected behavior                                                                                                    |
| ----- | -------------------------------------------------------------------------------------------------------------------- |
| ST-01 | Fresh migration accepts only organization Active/Suspended and application/module/client Active/Inactive states      |
| ST-02 | Archive/Restore/Destroy/Purge/whole-client-Revoke routes and public aliases are absent while artifact Revoke remains |
| ST-03 | Init creates the eight delete permissions with the exact built-in role mappings from RD-10                           |
| ST-04 | Module deletion cascades owned permissions and role-permission links; no permission becomes unscoped                 |
| ST-05 | Migration Down is a documented no-op and a fresh reset/migrate/init completes                                        |

### Uniform API and Cascades

| ID    | Expected behavior                                                                                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ST-06 | Each of the eight DELETE routes enforces authentication, exact permission, validation, fixed 404, and 204 success                                                                                                                                      |
| ST-07 | Parent-qualified module/role/permission/claim deletion rejects a mismatched parent as the same 404                                                                                                                                                     |
| ST-08 | Organization deletion removes its owned graph but preserves global application definitions                                                                                                                                                             |
| ST-09 | Application deletion removes its deployment-global graph across organizations                                                                                                                                                                          |
| ST-10 | Module deletion removes only its module, permissions, and dependent links                                                                                                                                                                              |
| ST-11 | Client deletion removes secrets and identifiable database protocol state                                                                                                                                                                               |
| ST-12 | Role and permission deletion cascades links without a force query                                                                                                                                                                                      |
| ST-13 | Claim deletion removes values; user deletion physically removes owned identity data and leaves no placeholder                                                                                                                                          |
| ST-14 | The control-plane organization cannot be deleted through either service or repository entry                                                                                                                                                            |
| ST-15 | Two concurrent attempts cannot delete both remaining active exact `porta-super-admin` users; the control-plane organization-row lock serializes the survivor check                                                                                     |
| ST-16 | Any pre-commit failure rolls back target, dependencies, tracking changes, and resource audit and schedules no Redis cleanup                                                                                                                            |
| ST-17 | Success emits one bounded resource event; repeat deletion returns 404 without a second event                                                                                                                                                           |
| ST-18 | Historical audit survives user deletion under configured retention, nullable user/actor foreign keys clear, identifying audit metadata may remain, and the new event contains no secret, Redis key, protocol payload, affected-user list, or raw error |

### Authority and Cleanup

| ID    | Expected behavior                                                                                                                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ST-19 | Every delete captures exactly the affected users, clients, and grants described by RD-10 before cascade                                                                                                                                           |
| ST-20 | Redis Session publication never occurs unless PostgreSQL tracking succeeds; a later Redis failure may leave only inert tracking                                                                                                                   |
| ST-21 | Affected-user deletion marks tracked Sessions revoked transactionally; `find`, `findByUid`, and `findByUserCode` reject missing, expired, or revoked tracking while unrelated tracked Sessions remain active                                      |
| ST-22 | `findForOidc` reads active client metadata directly from PostgreSQL and neither reads nor populates the client cache                                                                                                                              |
| ST-23 | All three non-Client adapter reads reject cached artifacts whose top-level client/account/grant or Session authorization client/grant references are no longer live                                                                               |
| ST-24 | RBAC and claim issuance observes deleted assignments/definitions directly from PostgreSQL despite stale Redis data                                                                                                                                |
| ST-25 | A committed delete schedules one non-awaited `setImmediate` Redis pass; exact keys and one finite namespace scan are attempted, a replaced slug key is preserved, failure settles without retry or identifiers, and HTTP/DB release does not wait |
| ST-26 | Cross-organization application effects are closed while unrelated organization authority remains                                                                                                                                                  |
| ST-27 | Deleting the current user or authority completes; the next Admin operation returns to authentication                                                                                                                                              |

### SDK and Conventional CLI

| ID    | Expected behavior                                                                                                            |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- |
| ST-28 | Eight SDK delete methods serialize the exact DELETE paths, omit a body, resolve void, and propagate fixed transport failures |
| ST-29 | Removed lifecycle methods, statuses, agent tools, and CLI subcommands are absent; secret/session/token revoke remains        |
| ST-30 | Eight conventional CLI delete commands show Keep/Delete-name confirmation and call exactly one SDK operation                 |
| ST-31 | Record deletion cannot be confirmed through `--force`; hostile remote names remain terminal-safe                             |

### Embedded Admin UI Oracle

| Surface      | Eligibility and placement                                                                                              | Success behavior                                                       | Confirmation emphasis                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Organization | Current non-control-plane record; exact capability; existing organization workspace                                    | Reload chooser/context; authenticate if current authority was affected | Tenant-owned users, clients, and security data                      |
| User         | Current organization and selected user; exact capability; existing user workspace                                      | Reload list; leave deleted detail; authenticate after self-delete      | Physical identity/security-data deletion; audit retained separately |
| Application  | Selected active/inactive application; exact capability; existing application workspace                                 | Reload global list; leave detail                                       | Deployment-global modules, clients, roles, permissions, and claims  |
| Module       | Selected active/inactive module under current application; exact capability; below-grid operations after blank DSL row | Reload modules; clear deleted detail                                   | Owned permissions and dependent links                               |
| Client       | Selected active/inactive client in current organization; exact capability; existing client workspace                   | Reload clients; leave deleted detail                                   | Secrets and client/grant protocol authority                         |

The five rows share these cases:

| ID    | Expected behavior                                                                                                |
| ----- | ---------------------------------------------------------------------------------------------------------------- |
| ST-32 | Delete requires exact capability, current selection, correct parent/organization, and current session generation |
| ST-33 | Keep/Escape sends no mutation, restores focus, and leaves authoritative state unchanged                          |
| ST-34 | Duplicate activation dispatches at most one delete; success reloads and navigates away from deleted detail       |
| ST-35 | Failure reloads and shows a fixed message without optimistic disappearance or dependency disclosure              |
| ST-36 | Warning contains the complete safe target and the surface-specific affected classes from the oracle matrix       |
| ST-37 | Layout DSL gives measured, consistently padded buttons and keeps module operations separated from the DataGrid   |
| ST-38 | Dialogs remain readable and redraw cleanly at 80×24 and 48×12; only destructive button text may ellipsize        |
| ST-39 | Current-session deletion transitions through the existing authentication gate without a stale workspace          |

### Invitation and End-to-End

| ID    | Expected behavior                                                                                                                                                                                                                                                          |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ST-40 | Invitation creation validates the deployment-global application without an organization predicate, both paths use canonical claim tables and parent checks, and acceptance skips deleted optional role/claim references while applying every remaining valid preassignment |
| ST-41 | Deleting an invited user cascades its owned invitation token                                                                                                                                                                                                               |
| ST-42 | Focused SDK/CLI/Admin specifications and the existing compiled PTY test prove automated behavior; a separate fresh `yarn admin` journey proves the five-surface interaction without extending the packed compatibility harness for Delete                                  |

## Implementation-Test Focus

- Parameterized set-based capture queries, control-plane lock ordering, deduplication, exact parent
  filters, nullable generic-audit actor lookup, and transaction ordering.
- Session tracking-before-publication, all three adapter read paths, OIDC reference extraction,
  cleanup descriptor immutability, cursor termination, namespaced key parsing, compare-before-delete,
  pipeline composition, and fixed logging.
- SDK request construction and CLI command registration/help.
- Controller mutation ownership, stale generation handling, focus restoration, button measurement,
  modal teardown, resize, and redraw.
- Migration constraint/foreign-key inspection and init idempotency.

## Copy-Paste Focused Commands

Run from the repository root:

```bash
yarn workspace @portaidentity/server test:unit -- tests/unit/oidc/deleted-authority.spec.test.ts tests/unit/routes/record-deletion.spec.test.ts
yarn workspace @portaidentity/server test:integration -- tests/integration/migrations/record-deletion-lifecycle.spec.test.ts tests/integration/admin/record-deletion.spec.test.ts tests/integration/oidc/deletion-authority.spec.test.ts tests/integration/services/invitation-deleted-preassignments.spec.test.ts
yarn workspace @portaidentity/sdk test -- tests/resource-deletion-rd10.spec.test.ts
yarn workspace @portaidentity/cli test -- tests/commands/resource-deletion.spec.test.ts
yarn workspace @portaidentity/cli test -- tests/admin/resource-deletion-state.spec.test.ts tests/admin/resource-deletion-workspace.spec.test.ts
yarn workspace @portaidentity/cli test -- tests/admin/application.pty.impl.test.ts
yarn verify
```

## Verification Matrix

| Phase | Focused evidence                                                                                      | Broader gate                                                                                                                                                      |
| ----- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Planned server unit/integration Session and OIDC authority specifications                             | `yarn test:unit`; `yarn test:integration`; `yarn test:structure`                                                                                                  |
| 2     | Planned migration, lifecycle, deletion, audit, cleanup, and invitation specifications                 | `yarn test:unit`; `yarn test:integration`; `yarn test:e2e`; `yarn test:pentest`; both operational assurance commands below                                        |
| 3     | Planned SDK and CLI command specifications                                                            | `yarn workspace @portaidentity/sdk verify`; `yarn workspace @portaidentity/cli verify`; `yarn test:structure`; unchanged clean-commit compatibility command below |
| 4     | Planned Admin UI specifications plus existing `packages/cli/tests/admin/application.pty.impl.test.ts` | `yarn workspace @portaidentity/cli verify`; `yarn test:ui`; `yarn harness:test`; `yarn docs:build`; final repository-required gates                               |

The exact registered security commands are:

```bash
yarn assurance:harness --project protocol --profile operational
yarn assurance:harness --project security --profile operational
```

Use `production-security` only if an implementation claim depends on production cookie, TLS, CORS,
CSP, or security-profile behavior. From a clean committed revision, run the existing selector
unchanged:

```bash
yarn assurance:compat --select tenant-admin
```

Do not extend the packed compatibility harness solely to add Delete coverage; the focused SDK/CLI
specifications own the changed public contract and the existing compiled PTY test owns terminal
runtime wiring.

## Manual Verification

After automated checks, run `yarn admin:env reset`, `yarn admin:env up`, and `yarn admin`. Use
disposable records and rotated local credentials. Exercise each of the five rows in the UI oracle at
80×24 and 48×12. Record only outcomes, terminal sizes, and non-sensitive identifiers.
