# Testing Strategy: Roles and Permissions

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

| Code type                                      | Target |
| ---------------------------------------------- | ------ |
| Authority, ownership, and revocation logic     | 90%    |
| SDK, service, controller, and validation logic | 80%    |
| Terminal composition and command glue          | 60%    |

Test names state behavior. Specification tests are written and observed red before implementation;
implementation tests follow green behavior. Real PostgreSQL/Redis fixtures cover transaction and
cleanup behavior. Existing test doubles remain limited to HTTP/UI boundaries (AR-4, AR-9–AR-11).

## 🚨 Specification Test Cases

### Authority and OIDC Claims

|    # | Input / scenario                                                            | Expected output / behavior                                      | Source                                              |
| ---: | --------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------- |
| ST-1 | User has `porta-super-admin` only in a foreign application                  | Admin middleware denies administrative membership               | RD-05 AC-11; 03-01 §Canonical Porta Admin Authority |
| ST-2 | User has a built-in role in canonical `porta-admin`                         | Middleware derives only its static capability set               | RD-05 AC-11; AR-3                                   |
| ST-3 | User Admin assigns canonical Super Admin                                    | Server returns sanitized `403`; no assignment exists            | RD-05 AC-10; 03-01 §Canonical Porta Admin Authority |
| ST-4 | Actor assigns a canonical role whose capabilities are a subset of their own | Assignment commits and records the actor                        | RD-05 AC-10–AC-11                                   |
| ST-5 | Same user has Billing and CRM roles; Billing client requests claims         | Token/UserInfo contains only Billing role and permission slugs  | RD-05 AC-20; AR-3                                   |
| ST-6 | Two applications reuse identical role/permission slugs                      | Each client receives only its own application's values          | RD-05 AC-20                                         |
| ST-7 | Claim context has no valid application UUID                                 | Standard claims remain; `roles` and `permissions` are empty     | 03-01 §OIDC Application Claims; AR-8                |
| ST-8 | Application-qualified RBAC query fails                                      | Account claim operation follows the existing fixed failure path | 03-01 §OIDC Application Claims; AR-8                |
| ST-9 | Generic update/delete/mapping mutation targets any canonical RBAC record    | Server rejects every field without changing canonical authority | RD-05 AC-11; AR-3, AR-15                            |

### Parent Integrity and Authority Mutations

|     # | Input / scenario                                                               | Expected output / behavior                                                                                | Source                                                  |
| ----: | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| ST-10 | Get/update/delete uses an application ID that does not own the role/permission | Sanitized `404`; foreign record is unchanged                                                              | RD-05 AC-14                                             |
| ST-11 | Permission create supplies a module from another application                   | Sanitized `400`; no permission is created                                                                 | RD-05 AC-06, AC-14                                      |
| ST-12 | Role-permission batch contains one foreign permission                          | Entire mutation is rejected; no link is added                                                             | RD-05 AC-09, AC-14                                      |
| ST-13 | Mapping read encounters an inconsistent historical cross-app link              | Link is excluded from returned data                                                                       | RD-05 AC-14                                             |
| ST-14 | User-role Add assigns one ordinary application role                            | Assignment commits, `assigned_by` equals actor, only that user's RBAC cache is scheduled for invalidation | RD-05 AC-10, AC-13; 03-02 §Canonical Survivor and Audit |
| ST-15 | Role-permission Add affects users assigned to the role                         | No session is revoked; only those users' RBAC caches are scheduled                                        | RD-05 AC-09, AC-13                                      |
| ST-16 | User-role Remove deletes an existing role affecting another user               | That user's tracked session/grant/opaque/refresh state is deleted; unrelated users remain                 | RD-05 AC-12; AR-4                                       |
| ST-17 | Role-permission Remove changes effective authority                             | Assigned affected users are revoked; unrelated users remain                                               | RD-05 AC-12; AR-4                                       |
| ST-18 | Remove requests a mapping that does not exist                                  | Response is committed success with `reauthenticationRequired: false`; no authority is revoked             | 03-02 §Result Contracts; AR-7                           |
| ST-19 | Ordinary role slug changes for assigned users                                  | Assigned users are revoked; name/description-only update does not revoke them                             | RD-05 AC-12                                             |
| ST-20 | Actor is in the actual affected-user set                                       | Committed response reports `reauthenticationRequired: true`                                               | RD-05 AC-15; AR-7                                       |
| ST-21 | Concurrent removal targets the final two exact super-admin holders             | Serialization permits at most one removal; one active holder survives                                     | RD-05 AC-11, AC-19                                      |
| ST-22 | Concurrent mapping write competes with reduction capture                       | Stable parent locks and immediate recheck prevent stale authority escaping revocation                     | RD-05 AC-19                                             |
| ST-23 | Redis cleanup fails after commit                                               | Database mutation/revocation remains committed; only a fixed non-sensitive warning is logged              | RD-05 AC-12; AR-9                                       |
| ST-24 | Any RD-05 create/update/add/remove/delete succeeds                             | Resource audit includes authenticated actor; assignment also stores `assigned_by`                         | RD-05 acceptance criterion 14                           |

### SDK, Agent, and Conventional CLI

|     # | Input / scenario                                      | Expected output / behavior                                                        | Source                                |
| ----: | ----------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------- |
| ST-25 | SDK lists roles or permissions from `{ data: [...] }` | Returns a complete validated array with no pagination surface                     | RD-05 AC-02, AC-05; AR-6              |
| ST-26 | SDK lists user roles                                  | Returns `Role[]` from the organization/user collection route                      | RD-05 AC-10; 03-03 §SDK Contracts     |
| ST-27 | SDK assigns/removes one user role                     | Sends collection `PUT`/`DELETE` with `{ roleIds: [id] }`                          | 03-03 §SDK Contracts; AR-6            |
| ST-28 | SDK updates a permission                              | Sends parent-qualified PUT with only Name/nullable Description                    | RD-05 AC-07                           |
| ST-29 | SDK receives a reduction result                       | Returns the validated committed `reauthenticationRequired` value                  | 03-02 §Result Contracts; AR-7         |
| ST-30 | Agent enumerates RBAC tools                           | Describes complete arrays and exposes permission update through existing dispatch | RD-05 verification; AR-6              |
| ST-31 | Conventional role/permission list command runs        | Sends no page options and renders the complete array without a false total        | RD-05 acceptance criterion 9          |
| ST-32 | Conventional user-role command mutates one selection  | Uses the corrected SDK collection contract and reports committed outcome          | 03-03 §SDK Agent and Conventional CLI |

### Admin UI

|     # | Input / scenario                                                               | Expected output / behavior                                                                                              | Source                           |
| ----: | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| ST-33 | Application detail opens                                                       | Tab order is Overview, Modules, Roles, Permissions and selection is retained                                            | RD-05 AC-01                      |
| ST-34 | Role or permission array is empty                                              | DataGrid and its columns remain visible with zero rows                                                                  | RD-05 AC-02, AC-05, AC-16        |
| ST-35 | Required capability or selected row is absent                                  | Corresponding Add/row action remains visible-disabled with fixed reason                                                 | RD-05 AC-02, AC-05, AC-09, AC-16 |
| ST-36 | Role Add/Edit dialog receives valid and invalid fields                         | Create/Save enables only for RD-valid Name/Slug/Description; Description is multiline                                   | RD-05 AC-03                      |
| ST-37 | Permission Add/Edit dialog is used                                             | Create validates Name/Slug/Scope; Edit submits only Name/Description and shows identity read-only                       | RD-05 AC-06–AC-07                |
| ST-38 | Manage permissions adds/removes one selected permission                        | Exactly one request occurs, then assigned and available collections reload                                              | RD-05 AC-09                      |
| ST-39 | User Roles opens with no assignments                                           | Grid remains visible; Add selects application then one unassigned role                                                  | RD-05 AC-10, AC-16               |
| ST-40 | User-role response arrives after organization/user/session changes             | Late response is ignored and current context remains                                                                    | RD-05 AC-10, AC-15               |
| ST-41 | Successful mutation reports reauthentication required                          | Owned dialogs/state clear and auth opens without a protected reload                                                     | RD-05 AC-15; AR-7                |
| ST-42 | Mutation outcome is unknown                                                    | State remains; explicit read-only Reload reconciles without repeating the mutation                                      | RD-05 AC-15; AR-14               |
| ST-43 | Application/User RBAC surfaces render at 80×24 and 48×12                       | Every operation is keyboard reachable; grids/toolbars have separation; buttons use natural width                        | RD-05 AC-16–AC-18                |
| ST-44 | Remote collection contains invalid ownership, UUID, timestamp, or control text | Whole collection is rejected as `Invalid server response`                                                               | RD-05 Admin UI validation        |
| ST-45 | Production OIDC metadata carries the internal application identifier           | Claims are app-scoped, while tokens, UserInfo, introspection, discovery, rendered auth output, errors, and logs omit it | AR-12                            |

## Test Categories

### Specification Tests

| Test file                                                                              | ST cases                         |
| -------------------------------------------------------------------------------------- | -------------------------------- |
| `packages/server/tests/unit/security/rbac-authority-boundary.spec.test.ts`             | ST-1–ST-4, ST-9                  |
| `packages/server/tests/unit/oidc/application-rbac-claims.spec.test.ts`                 | ST-5–ST-8, ST-45                 |
| `packages/server/tests/unit/routes/rbac-parent-contracts.spec.test.ts`                 | ST-10–ST-13, ST-18, ST-20, ST-24 |
| `packages/server/tests/integration/rbac/authority-mutations.spec.test.ts`              | ST-14–ST-23                      |
| `packages/server/tests/pentest/admin-security/rbac-application-isolation.spec.test.ts` | ST-1, ST-3, ST-5, ST-10–ST-12    |
| `packages/sdk/tests/domains/rbac-contracts.spec.test.ts`                               | ST-25–ST-29                      |
| `packages/sdk/tests/type-contracts/rbac-contracts.spec.test.ts`                        | ST-25–ST-29 compile-time shapes  |
| `packages/sdk/tests/agent/rbac-tools.spec.test.ts`                                     | ST-30                            |
| `packages/cli/tests/commands/rbac-contracts.spec.test.ts`                              | ST-31–ST-32                      |
| `packages/cli/tests/admin/application-rbac.spec.test.ts`                               | ST-33–ST-38, ST-41–ST-44         |
| `packages/cli/tests/admin/user-roles.spec.test.ts`                                     | ST-39–ST-44                      |

### Implementation Tests

| Test file                                                           | Coverage                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/server/tests/unit/rbac/authority-revocation.impl.test.ts` | empty inputs, sorted locks, duplicate IDs, cleanup descriptor |
| Existing RBAC repository/service `.test.ts` files                   | SQL branches, audit metadata, cache scheduling                |
| Existing RBAC route `.test.ts` files                                | Corrected status, body, parent, actor, and service calls      |
| Existing client configuration and logger `.test.ts` files           | Internal metadata preservation and non-disclosure backstops   |
| Existing SDK role/permission/user-role tests                        | transport serialization and response parsing internals        |
| Existing conventional app/user command tests                        | corrected complete-array and collection mutation contracts    |
| Existing Admin session and wiring specifications                    | RBAC factory, capability mapping, and production composition  |
| `packages/cli/tests/commands/rbac-contracts.impl.test.ts`           | conventional command validation and output branches           |
| `packages/cli/tests/admin/application-rbac.impl.test.ts`            | sorting, focus, selection, cancellation, render cleanup       |
| `packages/cli/tests/admin/user-roles.impl.test.ts`                  | context ownership, selection restoration, dialog disposal     |

### Integration and End-to-End

| Test                                      | Expected result                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| PostgreSQL/Redis authority mutation suite | Atomic targeted revocation, survivor preservation, and detached cleanup   |
| Existing server E2E/pentest suites        | No authorization, isolation, session, or information-exposure regression  |
| Retained OIDC harness                     | Existing flows pass with application-filtered claim issuance              |
| Browser Playwright                        | N/A: the changed application is terminal-rendered; no browser UI is added |

## Verification Checklist

- [ ] ST-1–ST-45 exist before their implementation and show an expected red result.
- [ ] Focused specification and implementation suites pass.
- [ ] `yarn test:structure` passes.
- [ ] Server, SDK, and CLI workspace `verify` commands pass.
- [ ] `yarn docs:build` and `yarn harness:test` pass.
- [ ] Operational protocol and security assurance harnesses pass.
- [ ] `yarn assurance:compat --select compatibility` passes from a clean committed revision.
- [ ] Root `yarn verify` is not run (AR-11).
