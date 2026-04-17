# UserInfo (/me) Endpoint Fix — Implementation Plan

> **Feature**: Fix `/me` (userinfo) endpoint returning "invalid token provided" and add dedicated E2E tests
> **Status**: Planning Complete
> **Created**: 2026-04-10

## Overview

The OIDC `/me` (userinfo) endpoint returns "invalid token provided" for all access tokens. The root cause is the `resourceIndicators` configuration in `configuration.ts` — `defaultResource` unconditionally returns `'urn:porta:default'`, which audience-restricts **every** access token to that resource server. The oidc-provider userinfo endpoint rejects resource-bound tokens because they are intended for the resource server, not for the provider itself.

The fix is minimal: make `defaultResource` conditional so tokens are only audience-restricted when a resource indicator was explicitly requested. Additionally, a new dedicated Playwright E2E test file validates the `/me` endpoint comprehensively, and the existing confidential-client test is updated to strictly assert 200 instead of gracefully accepting 401.

## Document Index

| #   | Document                                   | Description                                    |
| --- | ------------------------------------------ | ---------------------------------------------- |
| 00  | [Index](00-index.md)                       | This document — overview and navigation        |
| 01  | [Requirements](01-requirements.md)         | Feature requirements and scope                 |
| 02  | [Current State](02-current-state.md)       | Analysis of current resourceIndicators config  |
| 03  | [Resource Indicators Fix](03-resource-indicators-fix.md) | Technical spec for the configuration fix |
| 04  | [UserInfo E2E Tests](04-userinfo-e2e-tests.md) | Technical spec for new Playwright tests    |
| 07  | [Testing Strategy](07-testing-strategy.md) | Test cases and verification                    |
| 99  | [Execution Plan](99-execution-plan.md)     | Phases, sessions, and task checklist           |

## Quick Reference

### Root Cause

```typescript
// src/oidc/configuration.ts — CURRENT (broken)
resourceIndicators: {
  enabled: true,
  defaultResource: async () => 'urn:porta:default',  // ← unconditional
  useGrantedResource: async () => true,
  // ...
}
```

### Fix

```typescript
// src/oidc/configuration.ts — FIXED
resourceIndicators: {
  enabled: true,
  defaultResource: async (_ctx, _client, oneOf) => oneOf ?? undefined,
  useGrantedResource: async () => true,
  // ...
}
```

### Key Decisions

| Decision                        | Outcome                                                    |
| ------------------------------- | ---------------------------------------------------------- |
| Fix approach                    | Conditional `defaultResource` — return `undefined` when no resource requested |
| Test location                   | New file `tests/ui/flows/userinfo.spec.ts`                 |
| Existing test update            | `confidential-client.spec.ts` — strict 200 assertion       |

## Related Files

| File                                    | Action   |
| --------------------------------------- | -------- |
| `src/oidc/configuration.ts`             | Modify   |
| `tests/unit/oidc/configuration.test.ts` | Update   |
| `tests/ui/flows/userinfo.spec.ts`       | Create   |
| `tests/ui/flows/confidential-client.spec.ts` | Update |
