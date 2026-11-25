# Device Authorization — Discovery Notes

> **Status**: Discovery in progress
> **Feature**: `codeops/features/device-authorization`
> **Created**: 2026-11-23
> **CodeOps Artifact Schema**: 1

## Goal

Porta should support the OAuth 2.0 Device Authorization Grant (RFC 8628) for registered
OIDC clients, with the Porta CLI as the first consumer. The feature must preserve Porta's
tenant isolation, authentication policy, consent policy, and Admin API/SDK/CLI contracts.

## Confirmed decisions

| AR | Decision |
| --- | --- |
| AR-1 | Generic OIDC device grant for registered clients plus a CLI consumer. |
| AR-2 | Server-wide capability, authorized per client by an explicit device grant. No new organization or global setting. |
| AR-3 | Branded, localized Porta approval pages. Show client name, user code and requested scopes; provide an explicit abort action. |
| AR-4 | A client whose only authorization grant is the device grant may have zero redirect URIs. |
| AR-5 | The CLI adds an explicit `porta login --device-code` mode. Browser and pasted-callback PKCE behavior stay unchanged. |
| AR-6 | Device-code lifetime and all rate limits are fixed secure constants. No new global settings. |
| AR-7 | The CodeOps feature is named `device-authorization`. |
| AR-8 | The device grant is represented everywhere by the full URN `urn:ietf:params:oauth:grant-type:device_code`. |
| AR-9 | Existing installations enable the grant on the built-in admin CLI client explicitly. New `porta init` installs include it. |
| AR-10 | Store and display no device IP address or user agent. |
| AR-11 | Add dedicated `user.device.authorized` and `user.device.denied` audit events. Never include codes. |
| AR-12 | The device grant is explicit opt-in only; never part of `getDefaultGrantTypes`. |

## Selected domain lenses

| Lens | Evidence |
| --- | --- |
| Web application | Public OIDC endpoints, browser verification pages, login/consent/2FA reuse, tenant-resolved issuers, CORS/CSP/CSRF boundaries |
| Distributed and concurrent | PostgreSQL DeviceCode persistence, Redis sessions/interactions, polling across multiple server instances, single-use code consumption, rate-limit counters |
| Data and migration | Existing `oidc_payloads` schema and `user_code` index, DeviceCode retention and cleanup, portability import/export version boundary |

The compiler/language and financial-system lenses do not apply. Universal security categories
apply through the project's security invariants.

## Codebase evidence

| Area | Evidence |
| --- | --- |
| Provider feature currently off | `packages/server/src/oidc/configuration.ts:504` |
| Client grant allowlist | `packages/server/src/clients/validators.ts:46`, `:245` |
| Conditional redirect-URI rule needed | `packages/server/src/clients/validators.ts:40`, `:246-253` |
| Admin API client schemas | `packages/server/src/routes/clients.ts:115`, `:147` |
| SDK grant contract | `packages/sdk/src/types/clients.ts:20`, `packages/sdk/src/domains/clients.ts:59` |
| CLI client commands | `packages/cli/src/commands/client.ts:32`, `:319` |
| Admin terminal grant editor | `packages/cli/src/admin/client-workspace.ts:399` |
| Admin terminal parser/state | `packages/cli/src/admin/client-service.ts:112`, `packages/cli/src/admin/client-state.ts:27` |
| Admin terminal registration | `packages/cli/src/admin/client-registration-dialog.ts:143`, `:235` |
| Portability schema | `packages/server/src/portability/schema.ts:303`, `:310` |
| Adapter storage already present | `packages/server/src/oidc/postgres-adapter.ts:121`, migration `010_oidc_adapter.sql:13`, `:24` |
| Cleanup already covers DeviceCode | `packages/server/src/clients/service.ts:768`, `packages/server/src/users/service.ts:833`, `packages/server/src/connected-apps/service.ts:154` |
| Token polling limiter | `packages/server/src/middleware/token-rate-limiter.ts:97` |
| Interaction reuse | `packages/server/src/oidc/provider.ts:58`, `packages/server/src/routes/interactions.ts:384` |
| Provider device-page defaults | `node_modules/oidc-provider/lib/actions/authorization/device.js:135`, `node_modules/oidc-provider/lib/actions/code_verification.js:52` |

## Critical risks

| # | Risk | Required treatment |
| --- | --- | --- |
| 1 | Cross-tenant approval: a code from client A in org A can be entered on org B's `/device` page; the provider loads the client globally while Porta stores the URL's organization for the interaction. | Bind every verification request and resume request to the DeviceCode client's organization. Reject mismatches generically. Add a penetration test. |
| 2 | Normal 5-second polling exceeds the existing 30-requests-per-5-minutes token limit. | Exempt device polls from the generic limit and apply the approved device-specific policy. |
| 3 | User-code entry has no Porta-level rate limit. | Add the approved fixed user-code attempt limiter. |
| 4 | The PostgreSQL adapter filters expired rows before the provider can apply `ignoreExpiration`. | Retain expired DeviceCode rows for the approved 15-minute window so the token endpoint can return `expired_token`; verify the provider's expiry checks. |
| 5 | The client model requires at least one redirect URI. | Allow zero only when the authorization-code grant is absent and the device grant is present. |
| 6 | Grant allowlists are duplicated across server, SDK, CLI, Admin terminal, portability and docs. | Change all surfaces in one contract change with tests for each. |

## Proposed requirement areas

| Draft RD | Scope |
| --- | --- |
| RD-01 | Provider capability: feature flag, discovery, endpoints, DeviceCode lifecycle, protocol errors |
| RD-02 | Tenant-safe verification and approval: `/device` binding, branded/localized pages, login/2FA/consent reuse, abort, success |
| RD-03 | Client contracts: Admin API, SDK, CLI commands, Admin terminal, portability, docs |
| RD-04 | CLI device login: `--device-code`, polling, credential storage, errors |
| RD-05 | Security operations: fixed limits, audit, log redaction, cleanup, verification evidence |

## Open decisions

The complete list is in `../00-ambiguity-register.md` (AR-13 onward). Main groups:

- Browser session and consent policy for device approval.
- User-code page error granularity and rate-limit response shape.
- Admin surface completeness and CLI grant flags.
- Portability version compatibility.
- Device-only client validation details and confidential-client support.
- Token endpoint error and polling semantics.
- Session-revocation binding, audit metadata, custom UI limitation, user-code format.

## Next step

Resolve AR-13 onward, then run the Zero-Ambiguity Gate before authoring any RD.
