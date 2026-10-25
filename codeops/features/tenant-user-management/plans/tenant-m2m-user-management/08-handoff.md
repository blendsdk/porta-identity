# Handoff: Tenant-Scoped M2M User Management

> **Status**: Blocked on the production-security harness. Do not deploy from this state.

## Delivered

- Tenant service-client auth with `org:user:read`, `org:user:write`, and `org:user:delete`.
- Tenant user create/list/get/update, activate/deactivate, permanent delete, and app-bounded roles.
- First-class client audit attribution, transaction-bound mutation audit, read audit, and 300/60 rate limits.
- SDK types and tenant path support, CLI client-actor display, public docs, techdocs, and ADR-017.
- Server, SDK, CLI, docs, E2E, pentest, and structure gates pass.

## Last gate results

| Gate | Result |
| --- | --- |
| `yarn verify` | Pass (server, SDK, CLI, structure) |
| Server unit | 238 files / 3,869 tests pass |
| Server integration | 61 files / 514 tests pass |
| Server E2E | 21 files / 133 tests pass |
| Server pentest | 44 files / 286 tests pass |
| `yarn assurance:compat --select tenant-admin` | Pass |
| `yarn docs:build` | Pass |
| `yarn test:structure` | 138 pass |
| Production-security harness | **Blocked**: 11/11 exposure cases pass, but human-auth recovery fails on `password-reset-throttled-request` (missing normalized `delivered-authentication-artifact-rejection` log event). |

Harness runs: `31bfd677-43b9-4e95-b9ba-e76d8d4b09b6`, `e99a0d4c-bc51-4a69-a8fe-5a0c1a9d3eb7`.
The failing test and adapter are in `test-harness/assurance`, which this branch did not modify.
Treat the failure as a pre-existing assurance blocker; do not weaken or delete the assertion.

## Deployment when unblocked

1. Resolve the human-auth recovery harness blocker first; rerun the production-security harness and
   record the accepted observer result. Do not call it fully passed.
2. Schedule migration `034` in a maintenance window with a verified pre-migration backup. Stop or
   upgrade every server instance before applying it; a previous build cannot supply `actor_type`.
3. Register the three new scopes in the provider and restart every Porta instance.
4. Configure the tenant client as confidential, `client_credentials`,
   `client_secret_post`, with `org:user:read org:user:write org:user:delete` (and
   `org:user:invite` if used).
5. Run one real tenant `client_credentials` create/update/delete cycle from the BFF.
6. Verify the audit rows, the `tenant-api` security decision event, and post-migration audit
   classification.
