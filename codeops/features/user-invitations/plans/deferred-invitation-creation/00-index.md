# Deferred Invitation Creation Implementation Plan

> **Feature**: Stop creating a user account at invite time; create it only when the invitation is accepted
> **Status**: Planning Complete
> **Created**: 2026-09-26 19:31
> **Implements**: user-invitations/T-01
> **CodeOps Artifact Schema**: 1

## Overview

Today `POST /api/admin/organizations/:orgId/users/invite` immediately inserts a real `users` row
(`status='active'`, `password_hash=NULL`, `email_verified=false`), then sends the invitation email.
If the recipient never accepts, the account remains forever and the administrator must clean it up
manually. There is no housekeeping for users and no way for an administrator to see which accounts
are really "pending".

This plan makes the invitation a pure token-flow record, matching the project's own stated model
that "invitation is a token flow, not a status" (`docs/api/users.md:148`). The invite request stores
the email, organization, profile snapshot, pre-assignments, and a hashed single-use token in
`invitation_tokens`, but creates **no** user. The user is created in one database transaction only
when the recipient accepts and sets a password. An unaccepted invitation therefore leaves only an
inert, TTL-bounded token row — never a stale user account.

The plan covers the server schema and routes, the SDK/CLI/Admin UI contract change, documentation,
the full verification set (unit, integration, UI, penetration, assurance harness, and packed-client
compatibility), and a final gated phase that integrates `develop` into `main` and dispatches the
manual Release workflow.

## Minimum-Sufficient Baseline

**Original goal:** an unaccepted invitation must not leave a stale user account that an
administrator has to find and delete.
**Smallest viable design:** reuse the existing `invitation_tokens` token flow and the existing
accept-invite routes; make the invitation email/org-keyed with a nullable `user_id`, and create the
user inside the existing acceptance request. No new table, worker, scheduler, cache, or dependency.
**Excluded machinery:** a dedicated `invitations` table, a Redis-backed invitation store, a pending
`UserStatus`, and a purge worker for stale accounts.
**Approved complexity:** None (AR-24 — no material support surface; the Complexity Escalation Gate
did not trigger).

## Document Index

| #   | Document                                                          | Description                                        |
| --- | ----------------------------------------------------------------- | -------------------------------------------------- |
| AR  | [Ambiguity Register](00-ambiguity-register.md)                    | Zero-Ambiguity Gate decisions (audit trail)        |
| 00  | [Index](00-index.md)                                              | This document — overview and navigation            |
| 01  | [Requirements](01-requirements.md)                                | Feature requirements and scope                     |
| 02  | [Current State](02-current-state.md)                              | Analysis of the current invitation implementation  |
| 03  | [Invitation Data Model](03-01-invitation-data-model.md)           | Schema, repository, and transaction design         |
| 03  | [Accept Flow and Routes](03-02-accept-flow-and-routes.md)         | Confirmation page, accept route, invite route      |
| 03  | [Contracts, CLI, Admin UI, Docs](03-03-contracts-cli-admin-docs.md) | SDK/CLI/Admin UI contract and documentation      |
| 07  | [Testing Strategy](07-testing-strategy.md)                        | Spec test cases and verification                   |
| 99  | [Execution Plan](99-execution-plan.md)                            | Phases, sessions, and task checklist               |

## Quick Reference

### Usage Examples

Invite (server API):

```http
POST /api/admin/organizations/:orgId/users/invite
{
  "email": "bob@example.com",
  "givenName": "Bob",
  "familyName": "Jones"
}
```

```json
{
  "data": {
    "invitationId": "uuid",
    "email": "bob@example.com",
    "invitationSent": true,
    "expiresAt": "2026-10-03T19:31:00.000Z"
  }
}
```

Acceptance: the email link opens a non-mutating confirmation page; the password form is shown after
confirmation; the `POST` creates the account and consumes the invitation.

### Key Decisions

| Decision | Outcome | AR Ref |
| -------- | ------- | ------ |
| Account creation timing | At acceptance, in one transaction | AR-2, AR-10 |
| Invitation storage | Reuse `invitation_tokens`, email/org-keyed, nullable `user_id` | AR-3, AR-4 |
| Existing user on invite | `409 Conflict` | AR-5 |
| Pending re-invite | Replace the previous invitation | AR-6 |
| Invite result | `{ invitationId, email, invitationSent, expiresAt }` | AR-7 |
| Confirmation | Non-mutating page before the password form | AR-11 |
| Default lifetime | 7 days (`604800` s), unchanged | AR-12 |
| Expired rows | Inert; no purge worker | AR-17 |
| Release | `develop` → `main`, then manual Release dispatch | AR-25 |

### Related Files

- Server: `packages/server/src/routes/users.ts`, `packages/server/src/routes/invitation.ts`,
  `packages/server/src/auth/token-repository.ts`, `packages/server/src/users/service.ts`,
  `packages/server/src/users/repository.ts`
- Migration: `packages/server/migrations/033_invitation_deferred_user_creation.sql`
- SDK: `packages/sdk/src/types/users.ts`, `packages/sdk/src/domains/users.ts`
- CLI: `packages/cli/src/commands/user.ts`, `packages/cli/src/admin/user-service.ts`
- Docs: `docs/api/users.md`, `docs/guide/sdk.md`, `docs/cli/users.md`
