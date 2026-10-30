# Requirements: Tenant Invitation Revocation

> **Parent**: [Index](00-index.md)
> **Source**: [GitHub #196](https://github.com/blendsdk/porta-identity/issues/196)

## Must have

| ID | Requirement | Authority |
| --- | --- | --- |
| R1 | Revoke exactly the requested invitation UUID through the tenant API and existing SDK users domain. | AR #1 |
| R2 | Authenticate service or tenant-user actors with existing invitation authority; enforce organization and persisted application ownership. Never grant control-plane access. | AR #2 |
| R3 | New tenant invitations persist authenticated application ownership even without roles. Admin and historical rows remain unowned; no inferred backfill. | AR #2, #7 |
| R4 | A committed revocation prevents subsequent acceptance/account creation. Acceptance that commits first is not undone. Re-inviting creates a distinct handle unaffected by cancellation of the old handle. | AR #5 |
| R5 | One durable, privacy-safe audit accompanies each actual revocation in the same transaction. Failure cannot leave an unaudited revoked token. | AR #6 |
| R6 | Authorized no-op outcomes are bodyless 204 and disclose no invitation state or existence through normal status/body. Infrastructure errors remain truthful; no timing indistinguishability claim. | AR #6, #8 |
| R7 | Reuse validation, sanitized errors and strict per-actor deletion rate limiting. Reject malformed IDs before invitation-revocation SQL/service invocation; existing authentication queries remain permitted. Rate-limited or unavailable enforcement cannot mutate tokens. | AR #8, PF-004 |
| R8 | Preserve current token expiry, acceptance/localization, organization/email-wide replacement and application-deletion link lifetime. Document legacy ownership and mixed-writer limitations. | AR #2, #7 |
| R9 | SDK type/runtime contracts and operator/BFF documentation describe the tenant-only operation, required authority and 204 semantics. | AR #1, #9 |

## Won't have

List/get, revoke-by-email, bulk revocation, original-inviter-only rules, new role/scope, Admin API route, CLI/Admin UI, automatic retries, new assurance runner, merging or release. Unrelated roadmap/issue cleanup stays separate (AR #1, #3, #4).

## Technical and acceptance requirements

Existing TLS, bearer authentication, parameterized SQL and secret protections remain intact. No email or notification is sent by revocation. Use the indexed invitation UUID; no unbounded scan or new performance service. Schema changes are additive and old writers remain safe (AR #7). Core/support/glue coverage goals remain 90%/80%/60%; use focused direct tests rather than a new coverage campaign (AR #4).

Acceptance is proved by ST-1–ST-24 in [07](07-testing-strategy.md), applicable existing regressions, independent reviews and confirmed CI. Required gates are not waived by later passes or existing accepted limitations. No infrastructure change is required.
