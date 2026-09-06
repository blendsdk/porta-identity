# Current State: Record Lifecycles and Deletion

> **Observed**: 2026-09-06
> **CodeOps Artifact Schema**: 1

## Verified Existing Behavior

| Area                         | Current implementation                                                                          | Required change                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Organization status          | Active / Suspended / Archived originates in migration 002 and SDK/CLI types                     | Remove Archived                                                      |
| Organization terminal action | DELETE route uses `ORG_ARCHIVE`; SDK/CLI call it Destroy and support dry-run/typed confirmation | Rename to Delete, use exact permission, 204, simple confirmation     |
| Application status           | Active / Inactive / Archived originates in migration 003                                        | Remove Archived and Archive action                                   |
| Client status                | Active / Inactive / Revoked originates in migration 004                                         | Remove whole-client Revoked and Revoke action                        |
| Client secrets               | Active/revoked credential lifecycle                                                             | Retain Revoke                                                        |
| Roles                        | Existing DELETE route accepts `?force=true` and is protected by `ROLE_ARCHIVE`                  | Remove force and rename permission/API/CLI vocabulary                |
| Permissions                  | Existing DELETE route accepts `?force=true` and uses Archive permission naming                  | Remove force and rename                                              |
| Claims                       | Existing DELETE route uses `CLAIM_ARCHIVE`; conventional CLI says Archive                       | Rename to Delete                                                     |
| Users                        | Admin UI and SDK expose Purge; GDPR service retains a stable anonymized row                     | Replace with physical user Delete                                    |
| Invitations                  | Acceptance code contains obsolete claim table vocabulary in part of its flow                    | Use canonical custom-claim tables and skip deleted references        |
| Transactions                 | `afterDatabaseCommit` exists and is used for cache/audit effects                                | Schedule one tiny callback that detaches Redis cleanup               |
| Session tracking             | Redis Session upsert mirrors to PostgreSQL fire-and-forget and omits the multi-client map       | Persist tracking before publishing Session; validate revocation live |
| Audit retention              | User/actor FKs already become NULL; audit content remains under configured retention            | Retain history; remove erasure/sanitization claims                   |
| OIDC cache                   | Client and protocol artifacts can be resolved through Redis-backed adapter paths                | Make client lookup and backed continuation authority PostgreSQL-safe |

## Existing Structure to Reuse

- Admin routes already have bearer authentication, permission middleware, validation, rate limiting,
  transaction-aware audit middleware, and fixed error handling.
- Domain repositories already use parameterized PostgreSQL queries.
- PostgreSQL foreign keys already cascade or null most organization/user ownership graphs.
- Role, permission, and claim definitions already have hard-delete repository operations.
- SDK domains centralize HTTP serialization.
- Conventional CLI commands already share confirmation helpers and SDK construction.
- Embedded Admin UI has feature state, controller, service, dialog, workspace, and Layout DSL
  boundaries with generation checks for stale asynchronous results.
- Redis adapters already expose namespaced keys and cursor scanning primitives.

## Confirmed Gaps and Risks

1. Module permissions can become unscoped because the current foreign key does not cascade.
2. Existing lifecycle status constraints admit states that are no longer part of the product.
3. The organization delete route and public clients expose unnecessary preview/force ceremony.
4. Role and permission services reject linked deletes unless forced, contrary to the approved direct
   cascade rule.
5. User Purge is not deletion and leaves a predictable email-shaped identifier.
6. Cached client or authorization data could outlive the database record unless live reads reject it.
7. Application and authorization deletes can affect users across organizations, so cleanup cannot be
   limited to the administrator's selected organization.
8. Historical audit may identify a deleted user under configured retention; new deletion events and
   logs still require bounded fields and must exclude secrets, protocol payloads, Redis keys,
   affected-user lists, and raw errors.
9. Current CLI/Admin capability names encode Archive, Purge, or whole-client Revoke and would keep
   inconsistent semantics if only labels changed.

## Scope Discipline

Implementation should modify current domain-specific code. A small immutable cleanup descriptor and
a focused Redis cleanup function are justified by the transaction boundary; neither is a general
job system. Set-based capture and existing foreign keys replace row-by-row orchestration. Any new
index requires measured query evidence and is not planned.
