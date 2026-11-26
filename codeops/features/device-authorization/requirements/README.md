# Porta — Device Authorization Requirements

> **Project**: Porta — multi-tenant OIDC identity platform
> **Status**: Draft
> **Created**: 2026-11-24
> **Architecture**: TypeScript ESM, Koa, node-oidc-provider 9.13.3, PostgreSQL, Redis
> **CodeOps Artifact Schema**: 1

---

## Overview

Porta supports the Authorization Code + PKCE, Client Credentials and Refresh Token grants. It does
not currently expose the OAuth 2.0 Device Authorization Grant (RFC 8628), even though the provider
library and the storage adapter already contain dormant DeviceCode support.

This requirements set adds the standard device authorization grant for registered OIDC clients and
makes the Porta CLI its first consumer. The feature must preserve Porta's tenant isolation,
authentication and consent policy, and the public client contract across the Admin API, SDK, CLI,
Admin terminal, portability and documentation.

The most important Porta-specific risk is cross-tenant approval. The provider can load a DeviceCode
and its client globally, while Porta derives the interaction organization from the request URL.
Every verification and resume request must therefore prove that the DeviceCode client belongs to
the URL organization before any login, consent or approval occurs.

## Minimum-Sufficient Baseline

**Original goal:** let registered OIDC clients and the Porta CLI authenticate through the standard
device authorization grant without weakening tenant isolation or the existing authentication
policy.

**Smallest viable design:** enable the provider's native device-flow feature; reuse the existing
PostgreSQL adapter, interaction routes, login methods, 2FA, consent and session handling; add one
tenant-binding control for verification and resume; add the fixed rate-limit controls; extend the
existing client grant contract across the established administration surfaces; and add one CLI
flag that reuses the existing credential store.

**Excluded support machinery:** no new service, worker, queue, cache, scheduler, global setting,
organization policy, application type, custom-UI hook, API version negotiation, QR dependency, or
separate device-session UI. No new trust store or device-management subsystem.

**Approved complexity:** None. No complexity-escalation entry was required. The feature uses
existing project patterns for configuration, storage, rate limiting, audit, templates and client
validation.

## Domain Lenses

| Lens | Evidence |
| --- | --- |
| Web application | Public OIDC endpoints, browser verification pages, tenant-resolved issuers, login/consent/2FA reuse, CORS/CSP/CSRF boundaries |
| Distributed and concurrent | PostgreSQL DeviceCode persistence, Redis sessions and interactions, polling across server instances, single-use consumption, shared rate-limit counters |
| Data and migration | Existing `oidc_payloads` table, `user_code` column/index, DeviceCode retention, unique-code migration, portability version boundary |

The compiler/language and financial-system lenses do not apply. Universal security categories apply
through the project's security invariants.

## Domain Glossary

| Term | Definition |
| --- | --- |
| Device authorization grant | The RFC 8628 flow in which a constrained device obtains tokens after a user approves a pending request in a browser on another device. |
| Device code | The long, unguessable bearer secret the device sends to the token endpoint while polling. |
| User code | The short, human-readable code the user enters on the verification page. It identifies the pending request but cannot fetch tokens. |
| Verification URI | The organization-scoped URL where the user enters the user code. |
| Verification URI complete | The verification URI with the user code prefilled, suitable for a QR code or direct link. |
| Device-capable client | A client whose registered grants include the device authorization grant, usually alongside other grants. |
| Device-only client | A client whose only authorization grant is the device authorization grant; it may have zero redirect URIs. |
| Polling interval | The minimum time between token-endpoint requests, advertised as `interval` and fixed at five seconds. |
| Pending | The device code exists but no user has approved it. |
| Approved | A user has authenticated, consented where required, and bound the device code to an account and grant. |
| Expired retention | The fifteen-minute period after expiry during which the row remains so the token endpoint can return `expired_token`. |
| Connected app | A live provider Grant shown in the existing connected-apps surface and revocable by the user or administrator. |
| Lockstep release | The repository release model that versions and publishes the server, SDK and CLI together. |

## Document Index

| # | Document | Description | Depends On |
| --- | --- | --- | --- |
| **AR** | [Ambiguity Register](00-ambiguity-register.md) | Zero-Ambiguity Gate decisions (AR-1–AR-36) | — |
| **RD-01** | [Provider Capability and Protocol](RD-01-provider-capability.md) | Feature flag, discovery, endpoints, DeviceCode lifecycle, protocol errors | — |
| **RD-02** | [Tenant-Safe Verification and Approval](RD-02-tenant-safe-verification.md) | `/device` binding, branded pages, login/2FA/consent reuse, abort and success | RD-01 |
| **RD-03** | [Client Contracts and Administration](RD-03-client-contracts.md) | Admin API, SDK, CLI client flags, Admin terminal, portability, docs | RD-01 |
| **RD-04** | [CLI Device Login](RD-04-cli-device-login.md) | `porta login --device-code`, polling, credential storage, errors | RD-01, RD-03 |
| **RD-05** | [Security Operations and Assurance](RD-05-security-operations.md) | Fixed limits, audit, redaction, cleanup, tests and evidence | RD-01–RD-04 |

## Dependency Graph

```text
AR-1 … AR-34 (resolved)
        │
        └── RD-01 (provider capability)
              ├── RD-02 (tenant-safe verification)
              ├── RD-03 (client contracts)
              │     └── RD-04 (CLI device login)
              └── RD-05 (security operations and assurance)
```

RD-05 controls are implemented alongside RD-01 and RD-02 because they are required before the
feature can be enabled safely. The RD-05 assurance phase closes the feature.

## Suggested Implementation Order

| Phase | Documents | Description |
| --- | --- | --- |
| **A: Provider and verification** | RD-01 → RD-02 | Enable the provider feature, add storage and expiry handling, and land the tenant-binding verification pages. Do not expose the feature to clients until the cross-tenant tests pass. |
| **B: Contracts and CLI** | RD-03 → RD-04 | Extend every client administration surface, then add the CLI device login. |
| **C: Assurance** | RD-05 | Complete rate limits, audit, redaction, cleanup, penetration, UI and assurance evidence; run the full verification gate. |

## Key Architecture Decisions

| Decision | Choice | Rationale | AR Ref |
| --- | --- | --- | --- |
| Device flow implementation | Native node-oidc-provider feature | The library already implements RFC 8628 and the adapter already stores DeviceCode. A custom flow would duplicate protocol and security behavior. | AR-1 |
| Enablement | Per-client grant | The grant is the protocol authorization boundary; no new organization or global setting. | AR-2 |
| Grant representation | Full URN | Matches provider metadata and avoids a translation layer. | AR-8 |
| DeviceCode storage | PostgreSQL | Long enough to survive restarts and be shared by multiple instances. | AR-6 |
| Expiry behavior | Fifteen-minute expired retention | Keeps `expired_token` observable without retaining codes indefinitely. | AR-6, AR-20 |
| User-code uniqueness | Partial unique index | Prevents one code from routing approval to another pending request. | AR-31 |
| Tenant binding | Verify client and interaction organization on every verification and resume request | Closes the cross-tenant approval path unique to Porta's path-based issuers. | AR-29 |
| Approval pages | Porta-branded provider hooks | Matches login/consent branding, localization and accessibility. | AR-3, AR-23 |
| Consent | Reuse `requireConsent` | Keeps the existing trust model; the confirmation page shows scopes for trusted clients. | AR-14 |
| Limits | Fixed constants | Avoids expanding the closed global configuration catalog. | AR-6 |
| Client administration | Full contract consistency | The grant is part of the public client contract; a split surface would be inconsistent and hard to operate. | AR-16 |
| Release compatibility | Lockstep server/SDK/CLI | Older readers strictly reject the new closed grant value. | AR-32 |

## How to Use These Documents

Each requirements document is designed to feed the make-plan skill:

1. Pick a requirements document, starting with RD-01.
2. Run the make-plan skill for the feature.
3. The plan declares the RDs it implements and derives specification tests from the acceptance
   criteria.
4. Run the exec-plan skill to implement and verify each task.
5. Use RD-05 as the assurance checklist before accepting the feature.
