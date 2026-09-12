# Design 03-04: Invitation Continuity and Environment

> **Status**: Preflighted
> **Last Updated**: 2026-09-06
> **CodeOps Artifact Schema**: 1

## Pending Invitations

Deleting an application, role, permission, claim definition, or user does not rewrite stored
invitation JSON. Correct the creation path in `packages/server/src/routes/users.ts` and the
acceptance path in `packages/server/src/routes/invitation.ts` directly so both use the canonical
`custom_claim_definitions`, `custom_claim_values`, and `claim_id` schema vocabulary. The two paths
keep their existing responsibilities; do not add a shared helper. Invitation creation validates the
application ID against the deployment-global `applications` table without a nonexistent
organization predicate, then retains the current role/claim parent checks.

At acceptance, each preassignment is validated against live PostgreSQL state:

- deleted references are skipped;
- valid references are applied;
- mixed payloads apply only valid entries;
- absence of one optional preassignment does not reject the invitation;
- deleting the invited user removes its owned invitation token through cascade.

This is a small correction to the two existing route flows, not a migration, invitation rewrite
system, or new abstraction.

## Environment Contract

The supported development proof uses existing commands:

1. `yarn admin:env reset` for a disposable clean playground.
2. Run the normal migration and `porta init` paths used by the environment.
3. `yarn admin:env up`.
4. `yarn admin` for the manual terminal journey.

The migration suite separately proves a fresh database applies the new forward migration and init
creates the current permission/role map. It does not manufacture archived/revoked/anonymized legacy
rows, convert them, or prove rollback. The migration Down section is a documented no-op.

## Manual Journey

At 80×24 and 48×12, exercise Keep and successful Delete for disposable representatives, including
an application/module/client path and a user or organization guard path. Confirm authoritative
absence, correct navigation, targeted logout where applicable, retained unrelated sessions, wrapped
warnings, measured buttons, and artifact-free redraw.

Use only generated playground credentials and disposable records. Do not record secrets or personal
data in evidence.
