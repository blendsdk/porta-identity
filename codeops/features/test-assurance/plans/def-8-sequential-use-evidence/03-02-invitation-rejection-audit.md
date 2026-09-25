# Invitation Rejection Audit: DEF-8 Sequential-Use Delivered-Artifact Evidence

> **Document**: 03-02-invitation-rejection-audit.md
> **Parent**: [Index](00-index.md)
> **Decision per AR #6**

## Overview

ST-46 requires every delivered-artifact rejection to emit one audit event with the normalized class
`delivered-authentication-artifact-rejection`. Magic-link (`user.magic_link.failed`) and
password-reset (`user.password_reset.failed`) already do. The invitation invalid/used/expired path
does not. This component adds the missing event so the live adapter can observe the required class
uniformly, and so the product's rejection evidence is consistent across all three artifact kinds.

This is the only product change in this plan.

## Architecture

### Current Architecture

The invitation accept handler (`routes/invitation.ts`) writes audit events on success
(`user.invite.accepted`) and on pre-assignment application (`user.invite.pre_assignments_applied`),
but the invalid/used/expired rejection (`invitation.ts:222-236`) renders a generic error and returns
without auditing.

### Proposed Changes

Emit one `writeAuditLog` call on the rejection path, following the existing convention in
`magic-link.ts:250` and `password-reset.ts:422`.

## Implementation Details

### Event

| Field            | Value                                                    |
| ---------------- | -------------------------------------------------------- |
| `eventType`      | `user.invite.failed`                                     |
| `eventCategory`  | `security`                                               |
| `description`    | `Invitation acceptance failed: invalid or expired token` |
| `organizationId` | The resolved organization id                             |
| `ipAddress`      | `ctx.ip`                                                 |

The event carries no token, email, password, or other secret. It is written once per rejected
request; the GET form path and the POST submit path must not both emit for the same request.

### Integration Points

- The adapter's `observeRejectionAudit` maps `user.magic_link.failed`, `user.password_reset.failed`,
  and `user.invite.failed` to the requirement's normalized class
  `delivered-authentication-artifact-rejection` (AR-8).
- No change to the existing success-path events or to any other route.

## Error Handling

| Error Case                | Handling Strategy                                                                                                                                 | AR Ref |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Audit persistence fails   | Match existing rejection-route behaviour; the rejection is already generic and non-consuming, and the failure must not change the public response | AR-6   |
| Token resolves to no user | Audit with the organization only (no user id); no secret fields                                                                                   | AR-6   |

> **Traceability:** AR-6 in 00-ambiguity-register.md.

## Testing Requirements

- Extend `packages/server/tests/unit/routes/invitation.test.ts` with a rejection case asserting one
  `user.invite.failed` audit event and no token value in the record.
- Extend `packages/server/tests/integration/services/invitation-enhanced.test.ts` with the
  invalid/used/expired transition.
- Do not delete, skip, relax, or replace existing assertions (R5.13).
