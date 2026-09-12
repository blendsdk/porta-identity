# Design 03-01: Lifecycle and Transactional Deletion

> **Status**: Preflighted
> **Last Updated**: 2026-09-06
> **CodeOps Artifact Schema**: 1

## Lifecycle Contract

| Resource                                        | Reversible state            | Permanent operation |
| ----------------------------------------------- | --------------------------- | ------------------- |
| Organization                                    | Active / Suspended          | Delete              |
| Application                                     | Active / Inactive           | Delete              |
| Module                                          | Active / Inactive           | Delete              |
| OIDC client                                     | Active / Inactive           | Delete              |
| Role, permission, claim, user                   | No separate terminal state  | Delete              |
| Secret, session, token, invitation, signing key | Existing artifact lifecycle | Revoke remains      |

Remove Archive, Restore, Destroy, Purge, and whole-client Revoke from route handlers, SDK contracts,
agent tools, CLI parsers, Admin UI intents/capabilities, public types, filters, bulk actions, docs,
and tests. Do not leave aliases.

## API Contract

Every endpoint validates identifiers with existing schemas, uses parameterized queries, requires the
exact delete permission, returns 204 on success, and returns fixed 400/401/403/404 errors.

| Record       | Endpoint                                                          | Permission                |
| ------------ | ----------------------------------------------------------------- | ------------------------- |
| Organization | `DELETE /api/admin/organizations/:idOrSlug`                       | `admin:org:delete`        |
| Application  | `DELETE /api/admin/applications/:id`                              | `admin:app:delete`        |
| Module       | `DELETE /api/admin/applications/:appId/modules/:moduleId`         | `admin:module:delete`     |
| Client       | `DELETE /api/admin/clients/:id`                                   | `admin:client:delete`     |
| Role         | `DELETE /api/admin/applications/:appId/roles/:roleId`             | `admin:role:delete`       |
| Permission   | `DELETE /api/admin/applications/:appId/permissions/:permissionId` | `admin:permission:delete` |
| Claim        | `DELETE /api/admin/applications/:appId/claims/:claimId`           | `admin:claim:delete`      |
| User         | `DELETE /api/admin/organizations/:orgId/users/:userId`            | `admin:user:delete`       |

Parent-qualified routes load through both IDs. Missing and mismatched targets are indistinguishable.
There is no `force`, dry-run, preview, or response body.

## Permission Ownership

The next migration does not seed or map Admin permissions. Existing
`ALL_ADMIN_PERMISSIONS` and `ADMIN_ROLE_DEFINITIONS`, executed by normal `porta init`, exclusively
create the eight delete permissions and built-in mappings:

- Super Admin: all eight.
- Organization Admin: organization delete.
- User Admin: user delete.
- Application Admin: application, module, client, role, permission, and claim delete.
- `admin:client:revoke` remains only for client-secret revocation.

## Transaction Sequence

The complete authority/capture boundary is implemented and verified before any new Delete route is
mounted or an existing hard delete is normalized to direct cascade.

For each delete, the existing Admin mutation transaction:

1. For a control-plane user, locks the single control-plane organization row `FOR UPDATE`.
2. Locks and loads the exact target through its parent/organization boundary.
3. Rechecks that another active exact `porta-super-admin` exists when required.
4. Captures affected users, internal/public clients, grants, cache IDs, and bounded audit fields with
   parameterized set-based queries.
5. Marks identifiable affected-user Session tracking rows revoked and removes matching PostgreSQL
   protocol state.
6. Writes one resource-specific deletion audit event.
7. Deletes the target and relies on declared foreign-key cascade/null behavior.
8. Registers the immutable Redis descriptor through the existing post-commit hook.
9. Commits; the hook schedules `setImmediate` and resolves without awaiting Redis.

A pre-commit failure rolls back data, tracking, protocol state, and audit together and schedules no
Redis work. Repeated deletion returns 404 without another resource event.

The generic `admin.mutation.committed` insert resolves `actor_id` with a nullable live-user
subquery. Ordinary mutations retain attribution; successful self-delete records a NULL actor rather
than violating the foreign key.

## Resource Graphs

- Organization: users, clients, credentials, assignments, claims, sessions, branding, recovery data,
  grants, and other organization-owned records.
- Application: modules, clients across organizations, secrets, roles, permissions, assignments,
  claim definitions, and values.
- Module: owned permissions and role-permission links.
- Client: secrets and identifiable PostgreSQL protocol state.
- Role: role-permission and user-role links.
- Permission: role-permission links.
- Claim: user claim values.
- User: credentials, login/recovery tokens, 2FA, assignments, claims, sessions, and owned identity
  data. Nullable relational references clear.

## Guards

The organization with `is_super_admin = true` is undeletable at service and repository boundaries.
Control-plane user deletion serializes through that organization's row before checking the survivor,
so concurrent deletes cannot each rely on the other target. The current/bootstrap administrator has
no additional immortality.

## Audit Retention

Audit history is separately governed security/operational evidence. It remains unchanged under the
configured retention policy and may identify a deleted user. Direct `user_id` and `actor_id`
foreign keys become NULL; no placeholder user is retained. New deletion events contain bounded
control-free target identity needed for attribution and never contain secrets, protocol payloads,
affected-user lists, Redis keys, or raw errors. Porta makes no GDPR-erasure claim.

Events are `org.deleted`, `app.deleted`, `app.module.deleted`, `client.deleted`,
`role.deleted`, `permission.deleted`, `claim.deleted`, and `user.deleted`. Repeated deletion
emits no second resource event.

## Migration

Add the next ordered migration without rewriting prior files. Its Up section only:

- replaces organization/application/client status constraints with retained states; and
- changes module-owned permission deletion to cascade.

Permission definitions and role mappings remain exclusively owned by `porta init`. The migration
Down section is a documented no-op. Existing archived/revoked rows are not converted; supported
validation begins from reset/migrate/init because Porta has no retained production data.
