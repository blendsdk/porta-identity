# Contracts, CLI, Admin UI, and Docs: Deferred Invitation Creation

> **Document**: 03-03-contracts-cli-admin-docs.md
> **Parent**: [Index](00-index.md)

## Overview

Deferring account creation changes the invite result contract. This component updates the SDK type,
the CLI command output, the Admin UI invite flow, and every documentation page that describes
create-at-invite behavior or the old result shape.

## Architecture

### Current Architecture

`InviteUserResult` carries `userId` and `created`, and the Admin UI reconciles the user list after a
successful invite because a user row now exists. Documentation states a user is created at invite
time and claims a `200` response for existing emails.

### Proposed Changes

| Surface | Change |
| ------- | ------ |
| SDK type | `InviteUserResult` = `{ invitationId, email, invitationSent, expiresAt }` |
| SDK tests | Contract expectations updated to the new shape |
| CLI command | `porta user invite` prints the new fields; wording says "invitation", not "user created" |
| Admin UI | Result validator and success handling updated; no user-list reconcile |
| Docs | Invite contract, lifecycle, SDK/CLI, audit, and data model updated |

## Implementation Details

### SDK

`packages/sdk/src/types/users.ts`:

```ts
/** Result returned after an invitation request is accepted. */
export interface InviteUserResult {
  /** ID of the invitation record. */
  invitationId: string;
  /** Email address that received the invitation. */
  email: string;
  /** Whether the invitation email was sent. */
  invitationSent: boolean;
  /** ISO 8601 expiration time for the invitation. */
  expiresAt: string;
}
```

`packages/sdk/src/domains/users.ts` and `packages/sdk/src/agent.ts` keep their signatures; only the
returned shape changes. `packages/sdk/src/types/index.ts` keeps exporting the interface name.

### CLI Command

`packages/cli/src/commands/user.ts` (`invite` subcommand):

- Human output prints `invitationId`, `email`, `invitationSent`, and `expiresAt`.
- Replace any "user created" wording with invitation wording.
- JSON mode emits the same object unchanged.
- Keep argument parsing (`--org`, `--email`, `--name`) unchanged.

### CLI Admin UI

- `packages/cli/src/admin/user-service-types.ts` — replace `AdminInvitedUser` fields with the new
  shape.
- `packages/cli/src/admin/user-service.ts` — field-by-field response validator accepts
  `invitationId`/`email`/`invitationSent`/`expiresAt` and rejects the old `userId`/`created`.
- `packages/cli/src/admin/user-controller.ts` and `user-state.ts` — on success, show the invitation
  outcome; do not load or select a user that does not exist. Keep the existing single-operator,
  no-retry behavior.
- `packages/cli/src/admin/index.ts` — re-exports follow the renamed/changed types.
- Dialogs keep their input fields; only the success copy changes from "User created" to
  "Invitation sent".

### Documentation

| Document | Update |
| -------- | ------ |
| `docs/api/users.md` | Rewrite invite description, response, pre-assignment notes, and status-lifecycle paragraph; remove the incorrect `200` claim |
| `docs/guide/sdk.md` | Update the `users.invite()` result description |
| `docs/cli/users.md` | State that the user is created on acceptance; list the new output |
| `docs/api/audit.md` | Describe `user.invited` as firing at invite with a null user |
| `techdocs/architecture/data-model.md` | `invitation_tokens` columns: nullable `user_id`, `organization_id`, `email`, profile snapshot |

Other invitation mentions (`docs/guide/custom-ui.md`, `docs/concepts/*`, quickstart) remain valid
and are only reviewed during execution.

## Error Handling

| Error Case | Handling Strategy | AR Ref |
| ---------- | ----------------- | ------ |
| SDK consumer reads removed fields | Breaking change released through the versioned release tooling; changelog generated | AR-7 |
| CLI receives an old server response | Admin UI validator reports an unknown outcome rather than rendering stale fields | AR-7 |
| Admin UI invited user no longer in the list | Success handling no longer reconciles a user | AR-19 |
| Docs structure test checks config rows | Update docs in the same phase and run `yarn test:structure` | AR-22 |

> **Traceability:** Every error-handling strategy references the Ambiguity Register entry that
> resolved it. See `00-ambiguity-register.md`.

## Testing Requirements

- SDK contract and type-contract tests assert the exact new shape.
- CLI unit tests assert human/JSON output and the admin validator.
- Admin UI tests assert no user reconcile and the invitation success state.
- The retained assurance harness follows the confirmation step and discovers the accepted account
  through the admin users search before capturing account state.
- `yarn test:structure` and `yarn docs:build` pass.
