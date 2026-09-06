# Ambiguity Register: Record Deletion and Lifecycle Simplification Plan

> **Status**: ✅ GATE PASSED — 0 items unresolved
> **Last Updated**: 2026-09-06 01:41
> **Planning Target**: `admin-ui/RD-10`
> **Context Artifacts**: Approved RD-10 revision, RD-02 through RD-04, preflight iteration 1, current source, migrations, tests, and technical documentation
> **Modification Set**: This plan folder and the Admin UI roadmap

The requirements ambiguity register is authoritative for product choices. The plan imports those
decisions and records only implementation-level closure.

| ID    | Question                                              | Decision                                                                                                                                     | Source                                  | Status      |
| ----- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------- |
| AR-1  | Which record lifecycles remain?                       | Active/Suspended or Active/Inactive plus Delete; remove Archive/Restore/Destroy/Purge and whole-client Revoke                                | Requirement AR-103–AR-107               | ✅ Resolved |
| AR-2  | Which records receive first-party delete support?     | Organization, application, module, client, role, permission, claim definition, and user                                                      | Requirement AR-108                      | ✅ Resolved |
| AR-3  | How is deletion confirmed?                            | One Keep/Delete-name confirmation; no preview, typed input, dry-run, or force                                                                | Requirement AR-110                      | ✅ Resolved |
| AR-4  | What remains protected?                               | Only the control-plane organization and deletion of the last other active exact `porta-super-admin` user; serialize on the control-plane row | Requirement AR-109; PF-013              | ✅ Resolved |
| AR-5  | How is affected authority handled?                    | Capture affected users/clients/grants before cascade; targeted post-commit cleanup; unrelated authority remains                              | Requirement AR-101                      | ✅ Resolved |
| AR-6  | How is Redis cleanup detached?                        | Existing post-commit hook schedules a Redis-only `setImmediate` callback and resolves immediately                                            | Requirement AR-94, AR-97                | ✅ Resolved |
| AR-7  | How is stale cache authority prevented?               | Direct Client lookup, validation after all adapter reads, reliable Session tracking/live revocation, and direct RBAC/claim reads             | Requirement AR-90, AR-94; PF-016–PF-017 | ✅ Resolved |
| AR-8  | How are current role/permission/claim routes changed? | Keep hard delete, remove `force`, rename Archive permissions/methods/commands to Delete                                                      | Requirement AR-105                      | ✅ Resolved |
| AR-9  | How is user deletion implemented?                     | Physically delete the user and owned identity data; retain audit history separately under configured retention                               | Requirement AR-104, AR-111; PF-014      | ✅ Resolved |
| AR-10 | How are existing databases handled?                   | One forward migration with no-op Down; validate reset/migrate/init only; no conversion or rollback support                                   | Requirement AR-106                      | ✅ Resolved |
| AR-11 | Is a shared deletion framework needed?                | No. Reuse existing per-domain repositories, services, transaction hooks, SDK transports, and UI patterns                                     | Requirement AR-110                      | ✅ Resolved |
| AR-12 | Which verification rule applies now?                  | Planning runs artifact checks only; implementation uses exact existing gates without a new assurance harness                                 | User instruction; PF-009, PF-019–PF-020 | ✅ Resolved |

## Closure Notes

- The lifecycle scope was independently challenged before planning. The challenger agreed that
  whole-client Revoke is only a status mutation today and should be removed, while secret, session,
  and token revocation remains.
- The last-administrator guard uses the exact built-in `porta-super-admin` role and requires
  another active user. This is narrower than a generic quorum or policy engine.
- Conventional CLI commands are included because leaving old Archive, Destroy, or Purge command
  names would contradict the approved product vocabulary.
- Existing applied migrations are never rewritten even though current data is disposable.
