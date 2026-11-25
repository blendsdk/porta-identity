# Device Authorization Implementation Plan

> **Feature**: RFC 8628 device login for registered OIDC clients and the Porta CLI
> **Status**: Complete — executed and verified (CI run 45653909802)
> **Created**: 2026-11-25
> **Implements**: device-authorization/RD-01, device-authorization/RD-02, device-authorization/RD-03, device-authorization/RD-04, device-authorization/RD-05
> **Execution Mode**: `--auto-commit` (applied by exec-plan; make-plan does not commit)
> **CodeOps Artifact Schema**: 1

## Overview

This plan implements the approved device-authorization requirements in five phases. It enables the
native node-oidc-provider RFC 8628 flow, adds the tenant-safe browser verification pages, extends
the client contract across the Admin API/SDK/CLI/Admin terminal/portability, adds
`porta login --device-code`, and closes the feature with fixed limits, audit, redaction, cleanup
and assurance.

The critical control is cross-tenant approval. The provider resolves DeviceCodes globally while
Porta derives the interaction organization from the URL. Phase 1 therefore lands the shared
organization/path helper and the organization binding **before** `deviceFlow` is enabled and before
any client can receive the device grant. Phase 2 lands the branded pages, fixed limits, audit,
redaction and the concurrent-approval control. Phase 3 enables the client contract; Phase 4 adds the
CLI; Phase 5 closes cleanup and assurance.

The plan is one phased implementation with `--auto-commit` intended for execution. Each phase uses
the mandatory order: specification tests → implementation → implementation tests and hardening.

## Minimum-Sufficient Baseline

**Original goal:** let registered OIDC clients and the CLI authenticate through the standard device
authorization grant without weakening tenant isolation or existing authentication policy.

**Smallest viable design:** enable the existing provider feature; reuse the PostgreSQL adapter,
interaction routes, login/2FA/consent, rate limiter, audit and test infrastructure; add one
tenant-binding middleware, one DeviceCode-specific adapter/retention change and one partial unique
index; add one provider page-hook module plus three device templates and the `device` locale
namespace; extend the existing client grant contract with empty response types and the conditional
zero-redirect rule; add one CLI flag/coordinator; add the fixed device limiters, audit and redaction
before client enablement.

**Excluded machinery:** no new service, worker, queue, cache, scheduler, global setting,
organization policy, application type, host-UI hook, QR dependency, device-management model or
separate credential profile. The provider page hooks are internal rendering hooks, not a host-UI
extension.

**Approved complexity:** none. The preflight corrections (empty response types, shared path helper,
security-control ordering, hashed audit key, conditional confirmation write) are direct controls
within RD-01–RD-05; no new subsystem is introduced. The requirements amendments are recorded in
RD-02 (abort state), RD-03 (empty response types), RD-04 (PF-006) and RD-05 (PF-005).

## Planning Coverage

> **Coverage**: 4/4 clusters · 12/12 categories · 0 candidates · 1 residual limit · Effort: high→high · Independence: uniform-effort
> **Freshness**: Coverage as of 2026-11-25; artifacts: requirements RDs and README, roadmap, server OIDC/router/adapter code, CLI/SDK/Admin terminal code, techdocs.

| Cluster | Area | Examined | Not examined / limit | Candidates | Notes / limit | Confidence |
|---|---|---|---|---|---|---|
| C1 Product and scope | Feature gaps, scope, UX | All five RDs, requirements README, roadmap | None | 0 | No new scope beyond the approved RDs | High |
| C2 Behavior and edges | Behavior, edge cases, integration | RD acceptance criteria, provider device verification, CLI login code | None | 0 | Nonce gap resolved as AR-35; preflight PF-026 corrects the rationale | High |
| C3 Technical and data | Technical, data, naming | `server.ts`, `provider.ts`, adapters, migrations, client validators, SDK/CLI/Admin code | None | 0 | Technical choices delegated to P-7–P-12 and preflight PF-001–PF-023 | High |
| C4 Risk and stakeholders | Security, non-functional, conflicts | AGENTS.md, security and API techdocs, rate-limiter code | Canonical `preflight-auditor` unavailable | 0 | Five generic auditors plus challenger; iteration 1 blocked, fixes applied | High |

**Source note:** the preflight report is [00-preflight-report.md](00-preflight-report.md). Its
iteration 1 finding is the authoritative review record; iteration 2 passed with notes.

## Document Index

| # | Document | Description |
|---|---|---|
| AR | [Ambiguity Register](00-ambiguity-register.md) | Plan gate decisions (P-1–P-19) and coverage map |
| PR | [Preflight Report](00-preflight-report.md) | Iteration 1 findings, decisions and applied resolutions |
| 00 | [Index](00-index.md) | This document — overview and navigation |
| 01 | [Requirements](01-requirements.md) | Delta view of the five implementing RDs |
| 02 | [Current State](02-current-state.md) | Existing provider, client, CLI and test surfaces |
| 03-01 | [Provider Protocol](03-01-provider-protocol.md) | Feature flag, discovery, endpoints, DeviceCode storage and errors |
| 03-02 | [Tenant-Safe Verification](03-02-tenant-safe-verification.md) | Middleware, branded pages, form contract and interaction handoff |
| 03-03 | [Client Contracts](03-03-client-contracts.md) | Admin API, SDK, CLI client flags, Admin terminal, portability, docs |
| 03-04 | [CLI Device Login](03-04-cli-device-login.md) | Command wiring, discovery, polling, token verification and credentials |
| 03-05 | [Security Operations](03-05-security-operations.md) | Fixed limits, audit, redaction, cleanup and assurance |
| 07 | [Testing Strategy](07-testing-strategy.md) | Specification test cases (ST-*) and verification |
| 99 | [Execution Plan](99-execution-plan.md) | Five phases, sessions and task checklist |

## Quick Reference

### Device authorization request

```http
POST /{orgSlug}/device/auth
Content-Type: application/x-www-form-urlencoded

client_id={publicClientId}&scope=openid%20profile%20email%20offline_access
```

The response contains `device_code`, `user_code`, `verification_uri`,
`verification_uri_complete`, `expires_in: 600` and `interval: 5`.

### CLI

```bash
porta login --device-code --server https://porta.example.com
```

The CLI prints the verification URL and code, polls at the advertised interval and stores tokens
in the existing credential store. It does not retry an ambiguous token exchange after the request is
sent; the user starts a new login.

### Client administration

```bash
porta client create \
  --org <org-id> \
  --app <app-id> \
  --type public \
  --application-type native \
  --grant-types "urn:ietf:params:oauth:grant-type:device_code"
```

A device-only client has `redirectUris: []` and `responseTypes: []`. No redirect URI is required.
The response-type collection must be empty; a non-empty collection would imply authorization code.

### Key Decisions

| Decision | Outcome |
|---|---|
| Implementation | Native node-oidc-provider device flow |
| Authorization | Per-client full grant URN; never a default |
| Tenant safety | Shared org/path helper; organization check before any verification or resume and before `deviceFlow` enablement |
| Storage | PostgreSQL DeviceCode, 600s lifetime, 900s retention, partial unique index, duplicate preflight |
| Browser UX | Porta-branded pages; generic invalid/expired/aborted page; existing SSO/2FA/consent |
| Limits | Fixed primary budgets plus per-IP aggregates; session UID resolved from the signed cookie; approval resets only the primary |
| CLI | Explicit `--device-code`; existing credential store and refresh; no-retry ambiguous exchange; 429 clamped to `[interval, 60]` |
| Contracts | Admin API, SDK, CLI, Admin terminal, portability and docs in lockstep; empty response types for device-only clients |
| Fleet | Every server instance must understand the device URN before the grant is enabled |
| Audit | Hashed `jti` idempotency key; one row per window; `err.cause` classification |
| Commit mode | Auto-commit when exec-plan runs |

## Preflight Resolutions

The iteration 1 report is [00-preflight-report.md](00-preflight-report.md). The user accepted its
recommendations on 2026-11-25. Key plan changes:

- PF-001/PF-011: device-only clients use `responseTypes: []` plus `redirectUris: []`; all client
  surfaces are updated.
- PF-002/PF-017: one shared org/path helper preserves the resume UID; the user code is normalized
  exactly and bounded to 64 characters.
- PF-003: the tenant binding and fixed controls land before client enablement; Phase 3 depends on
  Phase 2.
- PF-004/PF-005: the user-code key resolves the provider session UID; approval resets only the
  primary counter; the per-IP aggregate is never reset.
- PF-006: RD-04 is amended to no-retry after a dispatched token request; 429 and unknown-error
  handling are explicit.
- PF-007–PF-010/PF-012/PF-020: test layers, inventories, structure counts, UI/harness gates, the
  `device` namespace and `porta init` tests are corrected.
- PF-013/PF-014: the audit key is hashed and deduplicated; the confirmation approval uses a durable
  conditional write (RD-05).
- PF-015/PF-016/PF-018/PF-019: limiter placement, scope source, fleet upgrade gate and fail-open
  policy are explicit.
- PF-021–PF-026: the unused URL sanitizer is removed; shared helpers, edge cases, CLI path/terminal
  controls, docs and the nonce rationale are corrected.

## Specialist Agents

| Role | Kind | Use | AR Ref |
|---|---|---|---|
| `oidc-provider-reviewer` | reviewer | Independent review of provider model, interaction/consent binding, grant lifecycle and token/JWKS boundaries; Phase 1, Phase 2 and the final phase | P-7, P-11, P-17 |

_Detection evidence:_ `codeops/specialists/oidc-provider-reviewer.md` marks this role required for
OIDC provider model, interaction/consent, grant lifecycle and token/JWKS changes. No additional
specialist candidate was identified.

The independent challenge completed and returned SR-001–SR-018; all corrections are recorded in
P-17 and incorporated into the component specs and execution tasks. The preflight challenger
reviewed the 15 design-critical findings; 14 converged and PF-014 diverged (the user chose the
durable conditional write).

## Related Files

- `packages/server/src/oidc/configuration.ts`
- `packages/server/src/oidc/provider.ts`
- `packages/server/src/oidc/postgres-adapter.ts`
- `packages/server/src/oidc/org-resolution.ts`
- `packages/server/src/server.ts`
- `packages/server/src/middleware/token-rate-limiter.ts`
- `packages/server/src/middleware/device-rate-limiter.ts`
- `packages/server/src/middleware/device-tenant.ts`
- `packages/server/src/routes/interactions.ts`
- `packages/server/src/clients/validators.ts`
- `packages/server/src/routes/clients.ts`
- `packages/server/src/portability/schema.ts`
- `packages/sdk/src/types/clients.ts`
- `packages/sdk/src/domains/clients.ts`
- `packages/cli/src/commands/login.ts`
- `packages/cli/src/auth/`
- `packages/cli/src/commands/client.ts`
- `packages/cli/src/admin/`
- `packages/server/templates/` and `packages/server/locales/`
- `packages/server/src/auth/i18n.ts`
- `repo-tests/monorepo/server-package.spec.test.mjs`
- `docs/` and `techdocs/`
