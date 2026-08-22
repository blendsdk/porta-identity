# Magic-Link Binding: Assurance Product Remediation

> **Document**: 03-02-magic-link-binding.md
> **Parent**: [Index](00-index.md)

## Authority model

Per AR-2, a magic-link artifact is owned by one organization and is either standalone or bound to
one OIDC interaction. Query parameters are transport data, never authority.

The additive migration in AR-6 adds `organization_id` and nullable `interaction_uid` to
`magic_link_tokens`, with indexes supporting one locked lookup by token hash, tenant, unused state,
and expiry. New rows require organization ownership. Legacy rows that cannot be safely attributed
remain unusable and expire naturally; migration does not infer authority from request input.

## Issuance

- The recovery worker resolves the user inside the requested organization.
- Interaction-bound issuance verifies that the interaction resolves to a client in the same
  organization and persists its exact UID.
- Standalone issuance persists a null interaction UID.
- Token plaintext exists only in transient memory for intended mail delivery; retained state uses
  its hash.

## Verification transaction

One transaction performs the following order:

1. Select the unused, unexpired token and current user with `FOR UPDATE` using the token hash and
   route organization.
2. Verify artifact organization equals route and user organization.
3. For interaction-bound artifacts, verify the supplied UID equals the persisted UID and resolves
   to a client in that organization. A standalone artifact rejects any supplied UID.
4. On mismatch, roll back without `used_at`, email-verification, login-count, audit-success, or
   Redis-session mutation.
5. On success, conditionally update `used_at` with the unused/expiry predicates and require one
   returned row, then update email/login state and durable audit in the same transaction.
6. Commit, then create the short-lived Redis continuation. Redis failure does not make the consumed
   artifact reusable; return the generic re-request path.

All invalid, expired, mismatched, and already-used outcomes share one public response contract and
one privacy-safe reason family. Rate limiting keys combine route tenant, network source, and a keyed
digest of the presented token without retaining the token.

## Redis continuation

Continuation data includes user, organization, and interaction. Consumption uses one Lua script so
read, validation, and deletion are atomic:

- missing/expired/malformed state clears the cookie and returns no session;
- tenant or interaction mismatch returns no session and does not delete the Redis key;
- exact match deletes once and returns the data;
- concurrent exact consumers produce at most one success.

The interaction handler derives current organization/client authority before accepting the
continuation. It never trusts the cookie or stored interaction UID alone.

## Testing requirements

- Migration and repository specifications for authority columns and locked conditional consume.
- Public Alpha-artifact/Bravo-route rejection with exact database, user, audit, Redis, and session
  nonmutation, followed by intended Alpha success using the same artifact.
- Missing/wrong interaction, standalone-with-interaction, wrong-client-tenant, expiry, sequential
  replay, and concurrent Redis continuation cases.
- Failure tests for database rollback and post-commit Redis unavailability.
