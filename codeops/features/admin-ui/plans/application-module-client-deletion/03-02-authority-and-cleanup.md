# Design 03-02: Authority and Cleanup

> **Status**: Preflighted
> **Last Updated**: 2026-09-06
> **CodeOps Artifact Schema**: 1

## Affected Authority

| Delete target | Transactional authority change                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Organization  | Revoke tracking rows for every owned user; remove owned client/grant PostgreSQL state              |
| Application   | Revoke users linked through owned authorization/claim state; remove every owned client/grant state |
| Module        | Revoke users receiving an owned permission through a role                                          |
| Client        | Remove target client/grant state; direct client authority rejects continuation                     |
| Role          | Revoke users assigned the role                                                                     |
| Permission    | Revoke users receiving it through a role                                                           |
| Claim         | Revoke users with a value for the definition                                                       |
| User          | Revoke the target user's tracking rows and remove owned state                                      |

Capture uses distinct parameterized set-based queries before cascade. The transaction graph contains
internal/public client IDs, user IDs, grant IDs, application ID/slug, role IDs, permission IDs, and
claim/application IDs. The smaller immutable Redis descriptor contains only identifiers required by
existing namespaces and never secrets or complete payloads.

## Reliable Session Tracking

For the Redis `Session` model, PostgreSQL tracking is an authority dependency rather than a
fire-and-forget listing mirror:

1. Persist or update the tracking row before publishing the Session payload in Redis.
2. Propagate tracking failure so an untracked Redis Session is not created.
3. If Redis publication subsequently fails, the inert tracking row may remain until normal expiry;
   it grants no authority.
4. Affected-user deletion transactions set matching active tracking rows' `revoked_at` before
   deleting authorization data.
5. Every Session result from `find`, `findByUid`, or `findByUserCode` checks the live tracking
   row and rejects a missing, expired, or revoked row.

The existing single nullable `admin_sessions.client_id` is not treated as a complete mapping. A
Session can authorize several clients through its payload's `authorizations` map. Client-only
deletion therefore relies on direct client validation for authority and the detached scan for prompt
physical Redis removal; it does not revoke unrelated user sessions or add a mapping table.

## OIDC Post-Read Validator

The HybridAdapter applies one focused validator after each non-Client read method:

- `find(id)`
- `findByUid(uid)`
- `findByUserCode(userCode)`

The validator gathers every present top-level `clientId`, `accountId`, and `grantId`, plus
every client/grant pair in a Session `authorizations` map. One set-based PostgreSQL query verifies
that referenced clients are active, users exist and remain active for the backed flow, grants remain
valid, and tracked Sessions are not revoked/expired. Any absent or invalid referenced authority makes
the adapter return no artifact.

The Client model remains separate: `findForOidc` always reads active client metadata directly from
PostgreSQL and neither reads nor populates the client cache. OIDC account lookup and token
RBAC/custom-claim issuance also use direct PostgreSQL reads.

Self-contained JWTs remain independently valid only until their original expiry. No deny-list or
new introspection behavior is added.

## PostgreSQL Cleanup

Before target deletion, remove identifiable OIDC database artifacts and revoke affected-user
tracking rows inside the same transaction. Application/global authorization deletion derives users
from the deleted graph across organizations, never from the selected organization alone. Unrelated
users, grants, sessions, and clients are excluded.

## Detached Redis Cleanup

The existing `afterDatabaseCommit` hook receives a callback that only schedules Redis work:

```text
commit succeeds
  -> post-commit hook schedules setImmediate(redisCleanup)
  -> hook returns
  -> PostgreSQL client is released and HTTP flow completes
  -> callback removes exact keys and scans finite OIDC namespaces once
```

The callback deletes exact application, client, claim, role, permission, user-RBAC, and user cache
keys; compare-checks reusable slug keys against the captured UUID; and performs one complete cursor
pass over existing OIDC model namespaces for affected client, grant, and user references. It settles
failure internally without retry and logs only fixed identifier-free text.

There is no worker, queue, timer registry, reverse index, outbox, normalized session-client relation,
or generic cleanup framework.

## Concurrency Invariants

- Session payload authority is never published without its PostgreSQL tracking row.
- A request that reads after commit cannot establish backed authority from deleted/revoked state.
- A request that completed validation before commit may finish normally; no global fence is added.
- Compare-before-delete preserves a concurrently replaced slug cache entry.
- Cleanup is scheduled only after commit; Redis failure cannot restore PostgreSQL-backed authority.
- Current-user or current-authority deletion commits; the next Admin operation returns to login.
