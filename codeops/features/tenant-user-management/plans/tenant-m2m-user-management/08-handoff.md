# Handoff: Tenant-Scoped M2M User Management

> **Status**: Production-security gate green (run `069b36ff`, 2026-11-01). Deployment remains with the operator; use the instructions below.

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
| Production-security harness | **Green**: run `069b36ff-c09e-47a3-b48a-af445540b8ee` exit 0; production exposure 11/11, functional 7/7, second-factor 4/4, tenant/admin 17/17, human-auth recovery 5/5. Exact throttle and wrong-tenant probes pass with `delivered-authentication-artifact-rejection`. |

Harness runs: original failures `31bfd677-43b9-4e95-b9ba-e76d8d4b09b6`, `e99a0d4c-bc51-4a69-a8fe-5a0c1a9d3eb7`; repair failures `b89ea7a6` (magic-link throttle) and `26887eb3` (password-reset wrong tenant); green run `069b36ff`. The audit-visibility repair awaits the rate-limit writes and makes the observer poll within a bounded window without weakening the event/field assertions. The run is not a full security certification.

## Deployment when unblocked

1. The production-security blocker is resolved by run `069b36ff`; do not call that run a full
   security certification. The original failures and repair failures remain recorded.
2. Schedule migration `034` in a maintenance window with a verified pre-migration backup. Stop or
   upgrade every server instance before applying it; a previous build cannot supply `actor_type`.
3. Register the three new scopes in the provider and restart every Porta instance.
4. Configure the tenant client as confidential, `client_credentials`,
   `client_secret_post`, with `org:user:read org:user:write org:user:delete` (and
   `org:user:invite` if used).
5. Run one real tenant `client_credentials` create/update/delete cycle from the BFF.
6. Verify the audit rows, the `tenant-api` security decision event, and post-migration audit
   classification.
