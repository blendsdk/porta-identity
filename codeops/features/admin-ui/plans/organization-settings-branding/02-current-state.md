# Current State: Organization Settings and Branding

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

The server already persists organization text branding and one binary logo/favicon row per
organization. Admin organization, login-method, 2FA-policy, and branding routes exist. The image
validator already recognizes PNG, JPEG, WebP, ICO, and SVG, with logo and favicon limits matching
RD-06. Default HTML/email templates already consume a branding context.

The SDK exposes organization, 2FA, and branding domains, but the branding domain mixes settings
and assets and sends the wrong upload body. The terminal Admin UI has organization create/switch/
delete flows and a validated four-field selected-organization projection, but no organization
settings workspace. JSVision core/UI are pinned at 1.7.1; the matching files package is absent.

### Relevant Files

| File                                                          | Current purpose                                      | Change needed                                                                |
| ------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/server/migrations/018_admin_api_enhancements.sql`   | Creates `branding_assets` with a 512 KiB check       | Leave applied migration unchanged; add migration 027                         |
| `packages/server/src/lib/image-validator.ts`                  | Validates types, limits, signatures, and SVG content | Reuse from asset service and strengthen exact binary signatures              |
| `packages/server/src/lib/branding-assets.ts`                  | Stores/lists/loads/deletes assets                    | Use validated bytes and per-type limits                                      |
| `packages/server/src/routes/branding.ts`                      | Protected Admin asset routes                         | Strict Zod JSON/base64 input and fixed outcomes                              |
| `packages/server/src/routes/organizations.ts`                 | Organization settings and login methods              | Enforce approved branding URL rules                                          |
| `packages/server/src/routes/two-factor-admin.ts`              | Organization 2FA policy                              | Keep ordinary non-ETag SDK use and server-authoritative restrictions         |
| `packages/server/src/middleware/security-headers.ts`          | Static non-HTML and HTML CSP                         | Build the approved image sources without changing other directives           |
| `packages/server/src/server.ts`                               | Body parsing and route order                         | Select larger parser only for asset PUT; mount public route before catch-all |
| `packages/server/src/auth/*` and `routes/interactions.ts`     | Build page/email branding contexts                   | Use one asynchronous effective-branding service                              |
| `packages/server/templates/default/**`                        | Render branding fields                               | Consume effective public logo/favicon URLs unchanged                         |
| `docker/nginx-dev.conf`, `docker/admin-playground/nginx.conf` | Bundled proxies                                      | Permit only the asset-upload request size                                    |
| `packages/sdk/src/domains/branding.ts`                        | Misleading settings/list and raw upload methods      | Correct list, upload, and settings response contracts                        |
| `packages/cli/src/admin/organization-service.ts`              | List/create/delete/reconcile selected organizations  | Add validated get/update/lifecycle/authentication/branding/asset operations  |
| `packages/cli/src/admin/application.ts`                       | Session and workspace coordinator                    | Open/close the organization workspace and discard stale work                 |
| `packages/cli/src/admin/presentation.ts`                      | Menus and commands                                   | Add capability-aware Manage action                                           |
| `packages/cli/src/admin/state.ts`                             | Validated session capabilities/context               | Add existing update/suspend capabilities and full workspace projection       |

## Gaps Identified

### Gap 1: Asset Contract Is Not End-to-End

**Current behavior:** The SDK uploads raw `Blob | Buffer`, while the server accepts JSON/base64.
The service checks a single 512 KiB limit and does not call the image validator.

**Required behavior:** One strict JSON/base64 contract with per-type limits, actual-content
validation, metadata responses, and no compatibility path.

**Fix required:** Apply [03-01](03-01-admin-assets-and-sdk.md). (AR-2)

### Gap 2: Uploaded Assets Are Not Public Branding

**Current behavior:** Only authenticated Admin callers can read binary assets. Page and email
contexts use configured URLs directly, and CSP has no approved image sources.

**Required behavior:** Public exact asset URLs for active/suspended organizations, one effective-
branding precedence rule, fail-soft decoration, and narrow CSP.

**Fix required:** Apply [03-02](03-02-public-branding-rendering.md). (AR-2)

### Gap 3: No Organization Settings Workspace

**Current behavior:** The Admin UI can create, switch, and delete organizations but cannot manage
the selected organization's settings, authentication defaults, lifecycle, or assets.

**Required behavior:** One maximized tabbed workspace using the established Layout DSL and focused
dialogs, with capability-aware direct mutations and context-epoch safety.

**Fix required:** Apply [03-03](03-03-organization-admin-workspace.md). (AR-2)

## Dependencies

### Internal Dependencies

- RD-02 selected-organization/session epoch and capability-aware menu behavior.
- RD-04 login-method inheritance and existing tabbed workspace recipe.
- Existing server organization repository/service/cache, RBAC middleware, request error handling,
  template engine, email renderer, and migration runner.
- Existing SDK transports and organization/2FA domains.

### External Dependencies

- Add exact runtime dependency `@jsvision/files@1.7.1`; no other package is added. (AR-2)
- PostgreSQL, Redis, MailHog, Playwright Chromium, and Docker-backed assurance services are used by
  existing verification only.

## Risks and Concerns

| Risk                                              | Likelihood | Impact | Mitigation                                                                    |
| ------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------- |
| Asset request bypasses global 100 KiB parser      | High       | High   | Exact asset-PUT parser branch plus proxy and decoded-size tests               |
| Cross-tenant or enumerating public read           | Low        | High   | Exact slug/type lookup, organization-bound SQL, identical minimal 404         |
| SVG opened as a document                          | Low        | High   | Existing validation, `<img>` use, `nosniff`, and restrictive SVG response CSP |
| Branding lookup makes login/email unavailable     | Medium     | High   | Fail soft to validated settings, then Porta defaults; no retry                |
| Dynamic CSP drops existing directives             | Medium     | High   | Derive only `img-src`; retain all other current directives byte-for-byte      |
| Stale Admin workspace mutates a new context       | Low        | High   | Reuse session/context epoch checks and close stale workspace                  |
| Scope grows into generalized media/config systems | Medium     | Medium | Enforce AR-1/AR-2 exclusions and the Complexity Escalation Gate               |
