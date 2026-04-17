# OIDC Client Authentication — Implementation Plan

> **Feature**: Wire client lookup + secret verification into OIDC provider
> **Status**: Planning Complete
> **Created**: 2026-04-10
> **Source**: Gap analysis from playground testing (GAP-1, GAP-2, GAP-4, GAP-5)
> **Depends On**: RD-03 (OIDC Provider Core), RD-05 (Client Management)

## Overview

During playground testing with an external OIDC tester, we discovered that the **entire
client-to-OIDC integration is disconnected**. The `client-finder.ts` module exists but is
dead code — never imported or wired into the provider. As a result, oidc-provider resolves
clients via its adapter, querying the `oidc_payloads` table, while our clients live in the
`clients` table. No OIDC client flows work (Authorization Code, Client Credentials, Refresh
Token, Introspection, Revocation).

Additionally, even if client lookup worked, confidential client authentication is broken
because `findForOidc()` does not return a `client_secret`. Since secrets are stored as
Argon2id hashes, we cannot provide the plaintext to oidc-provider's built-in comparison.
The fix is to verify the presented secret in `findClient` and pass it through after
Argon2id verification succeeds.

This plan also addresses two minor gaps: unused barrel exports (GAP-4) and hardcoded
cookie configuration (GAP-5).

## Document Index

| #  | Document                                              | Description                                    |
|----|-------------------------------------------------------|------------------------------------------------|
| 00 | [Index](00-index.md)                                  | This document — overview and navigation        |
| 01 | [Requirements](01-requirements.md)                    | Feature requirements and scope                 |
| 02 | [Current State](02-current-state.md)                  | Analysis of current (broken) implementation    |
| 03 | [Client Finder Integration](03-client-finder.md)      | Wire findClient into provider configuration    |
| 04 | [Secret Verification](04-secret-verification.md)      | Argon2id verification in OIDC flow             |
| 05 | [Cleanup](05-cleanup.md)                              | Barrel exports + cookie config fixes           |
| 07 | [Testing Strategy](07-testing-strategy.md)            | Comprehensive test plan                        |
| 99 | [Execution Plan](99-execution-plan.md)                | Phases, sessions, and task checklist            |

## Quick Reference

### Gap Summary

| Gap   | Severity | Description                                     | Fix                                       |
|-------|----------|-------------------------------------------------|-------------------------------------------|
| GAP-1 | CRITICAL | Client finder is dead code, not wired           | Wire `findClient` into provider config    |
| GAP-2 | CRITICAL | No client secret verification in OIDC flow      | Argon2id verify in findClient             |
| GAP-4 | Low      | Barrel exports unused (all direct imports)       | Remove or standardize barrel usage        |
| GAP-5 | Moderate | Cookie secure flag not configurable              | Read from config/env                      |

### Key Decisions

| Decision                           | Outcome                                                    |
|------------------------------------|------------------------------------------------------------|
| How to verify secrets?             | Verify in `findClient`, pass presented secret as metadata  |
| Public client + secret presented?  | Error (return undefined → `invalid_client`), log warning   |
| Confidential + valid secret?       | Return metadata with `client_secret: presentedSecret`      |
| Confidential + invalid secret?     | Return undefined → `invalid_client`, log warning           |
| Barrel exports?                    | Keep but ensure consistency (future cleanup)               |

### Client Authentication Decision Matrix

| Client Type    | Secret Presented? | Valid? | Result            | Server Log                         |
|----------------|-------------------|--------|-------------------|------------------------------------|
| Confidential   | Yes               | Yes    | ✅ Success         | —                                  |
| Confidential   | Yes               | No     | ❌ invalid_client  | Warning: failed verification       |
| Confidential   | No                | —      | ❌ invalid_client  | Provider enforces auth             |
| Public         | Yes               | —      | ❌ invalid_client  | Warning: public client sent secret |
| Public         | No                | —      | ✅ Success         | —                                  |

## Related Files

### Files to Modify

| File                          | Changes                                                |
|-------------------------------|--------------------------------------------------------|
| `src/oidc/client-finder.ts`   | Accept ctx, extract secret, verify, return metadata    |
| `src/oidc/configuration.ts`   | Add `findClient` parameter, pass to provider config    |
| `src/oidc/provider.ts`        | Wire findClient into buildProviderConfiguration call   |
| `src/clients/service.ts`      | Add `verifyClientSecret()` function                    |
| `src/config/schema.ts`        | Add `cookieSecure` env var (optional)                  |

### Files to Create

| File                                             | Purpose                                |
|--------------------------------------------------|----------------------------------------|
| `tests/unit/oidc/client-finder.test.ts`          | Updated unit tests (expand existing)   |
| `tests/unit/clients/service.test.ts`             | Add verifyClientSecret tests           |

### Existing Test Files to Update

| File                                             | Changes                                |
|--------------------------------------------------|----------------------------------------|
| `tests/unit/oidc/configuration.test.ts`          | Test findClient in config              |
| `tests/unit/oidc/client-finder.test.ts`          | Test secret verification scenarios     |
