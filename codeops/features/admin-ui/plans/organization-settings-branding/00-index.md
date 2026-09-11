# Organization Settings and Branding Implementation Plan

> **Feature**: Active-organization settings, authentication defaults, lifecycle, and branding
> **Status**: Planning Complete
> **Created**: 2026-09-11
> **Implements**: admin-ui/RD-06
> **CodeOps Artifact Schema**: 1

## Overview

Implement the preflighted organization workspace and finish the existing branding-asset path from
the Admin UI through the SDK and server to public authentication pages and email templates. The
workspace follows the established maximized TabView recipe and exposes Overview, Authentication,
and Branding without adding another organization browser.

The implementation repairs the existing JSON/base64 asset contract, validates and stores the five
approved image formats, serves organization assets publicly with narrow response controls, and
resolves effective branding once for every page and email context. It also keeps password-login
2FA distinct from passwordless magic-link authentication. (AR-1, AR-2)

## Minimum-Sufficient Baseline

**Original goal:** Let an administrator manage the selected organization's settings and branding
through the terminal Admin UI, including uploaded logo and favicon assets that appear on public
authentication pages and emails.

**Smallest viable design:** Extend the existing organization, two-factor, branding, template,
security-header, SDK, and JSVision seams directly. Add one forward constraint migration, one public
asset router, one effective-branding service, and the focused organization workspace files. (AR-2)

**Excluded machinery:** Optimistic concurrency, ETag UI workflows, merge handling, retries,
polling, locks, workers, storage abstractions, object storage, CDN integration, multipart upload,
image conversion, XML parser/sanitizer frameworks, locale discovery, and terminal image preview.
(AR-1, AR-2)

**Approved complexity:** None beyond RD-06's required public asset router and shared effective-
branding service. Both replace missing direct feature seams rather than create generalized systems.
(AR-2)

## Document Index

| #     | Document                                                              | Description                                                 |
| ----- | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| AR    | [Ambiguity Register](00-ambiguity-register.md)                        | Confirmed planning, design, and verification boundaries     |
| 00    | [Index](00-index.md)                                                  | Overview and navigation                                     |
| 01    | [Requirements](01-requirements.md)                                    | Thin RD-06 scope delta                                      |
| 02    | [Current State](02-current-state.md)                                  | Existing implementation and gaps                            |
| 03-01 | [Admin Asset and SDK Contracts](03-01-admin-assets-and-sdk.md)        | Migration, validation, Admin API, and SDK                   |
| 03-02 | [Public Branding Rendering](03-02-public-branding-rendering.md)       | Public route, effective context, templates, CSP, and proxy  |
| 03-03 | [Organization Admin Workspace](03-03-organization-admin-workspace.md) | State, services, tabs, dialogs, and application integration |
| 07    | [Testing Strategy](07-testing-strategy.md)                            | Immutable specification cases and verification              |
| 99    | [Execution Plan](99-execution-plan.md)                                | Ordered implementation tasks                                |

## Quick Reference

### Operator Flow

```text
Organizations → Manage current organization…
  ├── Overview       name, locale, identity, lifecycle
  ├── Authentication login-method defaults and password-login 2FA
  └── Branding       text settings plus immediate logo/favicon operations
```

### Key Decisions

| Decision       | Outcome                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| Scope          | RD-06 exactly; no adjacent features (AR-1)                                                                    |
| Implementation | Direct extensions of existing components; no generalized support machinery (AR-2)                             |
| Concurrency    | Single-operator Admin UI; no ETag or concurrent-editor workflow (AR-2)                                        |
| Verification   | Affected workspace, structure, UI, production-security, and compatibility gates; no root `yarn verify` (AR-3) |

## Related Files

- `packages/server/src/routes/branding.ts`
- `packages/server/src/routes/public-branding.ts` (new)
- `packages/server/src/lib/branding-assets.ts`
- `packages/server/src/lib/effective-branding.ts` (new)
- `packages/server/src/lib/image-validator.ts`
- `packages/server/src/middleware/security-headers.ts`
- `packages/server/src/server.ts`
- `packages/sdk/src/domains/branding.ts`
- `packages/cli/src/admin/organization-{service,controller,workspace}.ts`
- `packages/cli/src/admin/{application,presentation,state,session-service}.ts`
