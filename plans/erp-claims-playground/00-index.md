# ERP RBAC & Custom Claims in Playgrounds

> **Feature**: Enrich playground seed data with realistic ERP roles/permissions/claims and display them in both BFF and SPA dashboards
> **Status**: Planning Complete
> **Created**: 2026-04-12

## Overview

The Porta OIDC provider already injects RBAC claims (roles, permissions) and custom claims (per-application user attributes) into all tokens via `account-finder.ts`. However, the current playground seed data is minimal (2 generic roles, 3 permissions, 2 claims, only 2 users assigned), and neither the BFF nor SPA playground displays these claims prominently.

This feature enriches the seed data with a realistic ERP application scenario — 5 roles, 10 permissions, 4 custom claims — and assigns them to all 5 active test users with varied department/role combinations. The BFF dashboard gets a new "Authorization" panel showing roles as badges, permissions as tags, and profile attributes as a key-value table. The SPA playground gets similar display enhancements.

No changes are needed to the Porta provider core — the claims infrastructure already works correctly. This is purely a seed data + playground UI enhancement.

## Document Index

| #   | Document                                            | Description                              |
| --- | --------------------------------------------------- | ---------------------------------------- |
| 00  | [Index](00-index.md)                                | This document — overview and navigation  |
| 01  | [Requirements](01-requirements.md)                  | Feature requirements and scope           |
| 02  | [Current State](02-current-state.md)                | Analysis of current implementation       |
| 03  | [Seed Data Spec](03-seed-data.md)                   | ERP seed data definitions and assignments|
| 04  | [BFF Dashboard](04-bff-dashboard.md)                | BFF authorization panel UI spec          |
| 05  | [SPA Playground](05-spa-playground.md)               | SPA claims display spec                  |
| 07  | [Testing Strategy](07-testing-strategy.md)          | Test cases and verification              |
| 99  | [Execution Plan](99-execution-plan.md)              | Phases, sessions, and task checklist     |

## Quick Reference

### What Users See After Login (BFF Dashboard)

```
┌─────────────────────────────────────────────────┐
│ 🔐 Authorization                                 │
│                                                   │
│ Roles:  [erp-admin] [finance-manager]            │
│                                                   │
│ Permissions:                                      │
│   erp:invoices:read  erp:invoices:write          │
│   erp:orders:read    erp:settings:manage         │
│                                                   │
│ Profile Attributes:                               │
│   Department    Engineering                       │
│   Employee ID   EMP-001                           │
│   Cost Center   CC-1000                           │
│   Job Title     Platform Engineer                 │
└─────────────────────────────────────────────────┘
```

### Key Decisions

| Decision                   | Outcome                                                    |
| -------------------------- | ---------------------------------------------------------- |
| Custom OIDC scopes         | Not needed — industry standard is always-include per app   |
| Application name           | Keep "Playground App" — referenced in existing configs     |
| Provider code changes      | None — account-finder.ts already includes all claims       |
| ERP theme                  | 5 roles, 10 permissions, 4 custom claims                   |
| Both playgrounds updated   | Yes — BFF and SPA both display RBAC/claims                 |

## Related Files

### Modified
- `scripts/playground-seed.ts` — ERP-style RBAC/claims definitions and user assignments
- `playground-bff/views/dashboard.hbs` — New authorization panel
- `playground-bff/src/routes/dashboard.ts` — Extract RBAC/claims from ID token
- `playground-bff/public/css/style.css` — Authorization panel styles
- `playground/js/tokens.js` — Display RBAC/claims in SPA token panels
- `src/routes/interactions.ts` — Remove debug log line (cleanup)

### Unchanged (already working)
- `src/oidc/account-finder.ts` — Always injects roles/permissions/custom claims
- `src/oidc/configuration.ts` — No custom scopes needed
- `src/routes/interactions.ts` — Auto-consent already grants all scopes
