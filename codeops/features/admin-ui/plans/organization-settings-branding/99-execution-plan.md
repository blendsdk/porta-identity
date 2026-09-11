# Execution Plan: Organization Settings and Branding

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-09-11 00:36
> **Progress**: 0/55 tasks (0%)
> **CodeOps Artifact Schema**: 1

## Overview

Implement RD-06 through three direct product phases followed by documentation and final gates. Each
product phase writes immutable specification tests first, records the expected red result, applies
the bounded implementation, makes those tests green, and then adds internal coverage. The plan
adds no optimistic concurrency, generalized infrastructure, or optional feature. (AR-1, AR-2)

**🚨 Update this document after EACH completed task!**

## Implementation Phases

| Phase | Title                         | Tasks |
| ----- | ----------------------------- | ----: |
| 1     | Admin asset and SDK contracts |    15 |
| 2     | Public branding rendering     |    16 |
| 3     | Organization Admin workspace  |    14 |
| 4     | Documentation and final gates |    10 |

**Total: 55 tasks across 4 phases**

> **⚠️ EXECUTION RULE — APPLIES TO EVERY AGENT EXECUTING THIS PLAN:**
>
> The task checkboxes in the phase sections below are the **single source of truth** for progress.
> Every task line appears exactly once. The executing agent MUST:
>
> 1. Mark a task `[~]` with `⏳ (implemented: YYYY-MM-DD HH:MM)` immediately after implementation.
> 2. Promote it to `[x]` with `✅ (completed: YYYY-MM-DD HH:MM)` only after its verification passes.
> 3. Update the Progress and Last Updated headers after every task; only `[x]` counts as complete.
> 4. Resume the first `[~]` task, otherwise the first `[ ]` task, scanning top to bottom.
> 5. Mark a blocker `[!]` on the task line with its concise reason.
>
> Timestamps come from `date '+%Y-%m-%d %H:%M'`. Specification expectations are immutable: fix the
> implementation, never the specification test. Root `yarn verify` is prohibited. (AR-3)

## Phase 1: Admin Asset and SDK Contracts

> **Phase baseline tree**: _(recorded by exec-plan from the complete phase-start worktree state)_
> **Scope mode**: strict
> **Lenses**: security; api-surface

### Step 1.1: Specification Tests

**Reference**: [03-01](03-01-admin-assets-and-sdk.md) · AR-1–AR-3 · ST-1–ST-12

- [ ] 1.1.1 [spec-author] Write Admin route/base64/URL/RBAC specifications from ST-1 and ST-3–ST-8, ST-10–ST-11 — `packages/server/tests/unit/routes/branding-rd06.spec.test.ts`
- [ ] 1.1.2 [spec-author] Write real PostgreSQL size, replacement, isolation, and validation specifications from ST-2–ST-4 and ST-7–ST-9 — `packages/server/tests/integration/services/branding-assets-rd06.spec.test.ts`
- [ ] 1.1.3 [spec-author] Write SDK runtime and compile-time branding specifications from ST-12 — `packages/sdk/tests/domains/branding-rd06.spec.test.ts`, `packages/sdk/tests/type-contracts/branding-rd06.spec.test.ts`
- [ ] 1.1.4 Run the Phase 1 specification files/type-contract project and record the expected red result before implementation

### Step 1.2: Implementation

**Reference**: [03-01 §§Persistence and Validation–SDK Contracts](03-01-admin-assets-and-sdk.md#persistence-and-validation) · AR-2

- [ ] 1.2.1 Add the forward-only type-sensitive asset-size constraint with a no-op down; add no legacy-data handling — `packages/server/migrations/027_branding_asset_size_limits.sql`, affected migration tests
- [ ] 1.2.2 Route stored bytes through the existing image validator and strengthen exact binary signatures — `packages/server/src/lib/branding-assets.ts`, `packages/server/src/lib/image-validator.ts`
- [ ] 1.2.3 Add the strict Zod JSON/base64 upload envelope and exact large-body parser branch — `packages/server/src/routes/branding.ts`, `packages/server/src/server.ts`
- [ ] 1.2.4 Apply the exact production/loopback branding URL rules in existing schemas — `packages/server/src/routes/organizations.ts`, `packages/server/src/organizations/service.ts`
- [ ] 1.2.5 Correct branding asset/settings public types and domain methods without compatibility shims — `packages/sdk/src/types/branding.ts`, `packages/sdk/src/domains/branding.ts`, `packages/sdk/src/types/index.ts`
- [ ] 1.2.6 Adapt the existing conventional organization command to the corrected settings response — `packages/cli/src/commands/org.ts`, `packages/cli/tests/commands/org.test.ts`
- [ ] 1.2.7 Run ST-1–ST-12 and make the immutable Phase 1 expectations green

### Step 1.3: Implementation Tests and Hardening

- [ ] 1.3.1 Extend image-validator, asset-service, and migration implementation coverage — `packages/server/tests/unit/lib/image-validator.test.ts`, `packages/server/tests/unit/lib/branding-assets.test.ts`, existing branding integration test
- [ ] 1.3.2 Extend branding-route and organization URL-validation implementation coverage — `packages/server/tests/unit/routes/organizations.test.ts`, focused branding route implementation test
- [ ] 1.3.3 Update existing SDK branding serialization/unwrap and type-contract coverage — `packages/sdk/tests/domains/branding.test.ts`, `packages/sdk/tests/type-contracts/tsconfig.json`
- [ ] 1.3.4 Run focused server/SDK/CLI tests, affected lint and typechecks, builds, and `yarn test:structure`

**Verify**: focused ST-1–ST-12 and implementation suites; affected package lint/typecheck/build;
`yarn test:structure`; never root `yarn verify` (AR-3)

## Phase 2: Public Branding Rendering

> **Phase baseline tree**: _(recorded by exec-plan from the complete phase-start worktree state)_
> **Scope mode**: strict
> **Lenses**: security; api-surface

### Step 2.1: Specification Tests

**Reference**: [03-02](03-02-public-branding-rendering.md) · AR-1–AR-3 · ST-13–ST-26

- [ ] 2.1.1 [spec-author] Write public asset success, 404-equivalence, isolation, cache, and SVG-header specifications from ST-13–ST-16 — `packages/server/tests/unit/routes/public-branding.spec.test.ts`
- [ ] 2.1.2 [spec-author] Write effective precedence, fallback, failure, and page/email context specifications from ST-17–ST-20 and ST-23 — `packages/server/tests/unit/auth/effective-branding.spec.test.ts`
- [ ] 2.1.3 [security] Write public enumeration/CSP specifications and exact bundled-proxy structure specifications from ST-14–ST-16, ST-21–ST-22, and ST-26 — `packages/server/tests/pentest/infrastructure/branding-boundary.spec.test.ts`, `repo-tests/monorepo/branding-upload-proxy.spec.test.mjs`
- [ ] 2.1.4 [spec-author] Write passwordless/password 2FA boundary specifications from ST-24–ST-25 — `packages/server/tests/unit/auth/two-factor-login-boundary.spec.test.ts`
- [ ] 2.1.5 Run the Phase 2 specification files and record the expected red result before implementation

### Step 2.2: Implementation

**Reference**: [03-02 §§Public Asset Route–Bundled Proxy Limits](03-02-public-branding-rendering.md#public-asset-route) · AR-2

- [ ] 2.2.1 Add and mount the exact public image router before the OIDC catch-all — `packages/server/src/routes/public-branding.ts`, `packages/server/src/server.ts`
- [ ] 2.2.2 Implement metadata-first effective branding with fail-soft configured/default fallback — `packages/server/src/lib/effective-branding.ts`, `packages/server/src/lib/branding-assets.ts`
- [ ] 2.2.3 Adopt effective branding in interaction and magic-link page contexts — `packages/server/src/routes/interactions.ts`, `packages/server/src/routes/magic-link.ts`
- [ ] 2.2.4 Adopt effective branding in password-reset, invitation, and two-factor page contexts — `packages/server/src/routes/password-reset.ts`, `packages/server/src/routes/invitation.ts`, `packages/server/src/routes/two-factor.ts`
- [ ] 2.2.5 Adopt the same effective context in email, invitation send/preview, and OIDC-provider HTML rendering paths — `packages/server/src/auth/email-service.ts`, `packages/server/src/routes/users.ts`, `packages/server/src/oidc/configuration.ts`
- [ ] 2.2.6 Add one CSP builder and validated image-origin handoff while preserving all non-image directives — `packages/server/src/middleware/security-headers.ts`, `packages/server/src/auth/template-engine.ts`
- [ ] 2.2.7 Apply the exact upload-only request allowance in both bundled proxies — `docker/nginx-dev.conf`, `docker/admin-playground/nginx.conf`
- [ ] 2.2.8 Run ST-13–ST-26 and make the immutable Phase 2 expectations green

### Step 2.3: Implementation Tests and Hardening

- [ ] 2.3.1 Extend focused public route, security-header, template-engine, email, and provider implementation tests — existing server unit/integration files
- [ ] 2.3.2 Extend existing Playwright flows for uploaded/fallback assets, favicon, TOTP QR, CSP, and unchanged magic-link/password behavior — `packages/server/tests/ui/flows/branding.spec.ts`, affected fixtures
- [ ] 2.3.3 Run focused server unit/integration/E2E/pentest/UI suites, server lint/typecheck/build, and `yarn test:structure`

**Verify**: focused ST-13–ST-26 and implementation suites; server lint/typecheck/build;
`yarn test:ui`; `yarn test:structure`; never root `yarn verify` (AR-3)

## Phase 3: Organization Admin Workspace

> **Phase baseline tree**: _(recorded by exec-plan from the complete phase-start worktree state)_
> **Scope mode**: strict
> **Lenses**: security

### Step 3.1: Specification Tests

**Reference**: [03-03](03-03-organization-admin-workspace.md) · AR-1–AR-3 · ST-27–ST-45

- [ ] 3.1.1 [spec-author] Write menu, state, service, tabs, lifecycle, authentication, branding, focus, stale-context, and minimum-size specifications from ST-27–ST-45 — `packages/cli/tests/admin/organization-workspace.spec.test.ts`
- [ ] 3.1.2 Run the Phase 3 specification file and record the expected red result before implementation

### Step 3.2: Implementation

**Reference**: [03-03 §§State and Validation–Controller Rules](03-03-organization-admin-workspace.md#state-and-validation) · AR-2

- [ ] 3.2.1 Add full validated settings/asset projections, result types, capabilities, and one narrow organization-workspace dependency object for the existing SDK domains — `packages/cli/src/admin/state.ts`, `packages/cli/src/admin/organization-service.ts`
- [ ] 3.2.2 Add workspace generation, context checks, direct mutation sequencing, and reload behavior — `packages/cli/src/admin/organization-controller.ts`
- [ ] 3.2.3 Build the maximized Layout DSL window, TabView, and Overview tab — `packages/cli/src/admin/organization-workspace.ts`
- [ ] 3.2.4 Add the login-method and password-login 2FA controls to the Authentication tab — `packages/cli/src/admin/organization-workspace.ts`, `packages/cli/src/admin/organization-controller.ts`
- [ ] 3.2.5 Add the Branding form and immediate file-backed asset actions; pin JSVision files — `packages/cli/src/admin/organization-workspace.ts`, `packages/cli/package.json`, `yarn.lock`
- [ ] 3.2.6 Wire the Manage command, production SDK domains, capabilities, lifecycle, and stale-session closure through existing application seams — `packages/cli/src/admin/presentation.ts`, `packages/cli/src/admin/application.ts`, `packages/cli/src/admin/session-service.ts`, `packages/cli/src/commands/admin.ts`
- [ ] 3.2.7 Run ST-27–ST-45 and make the immutable Phase 3 expectations green

### Step 3.3: Implementation Tests and Hardening

- [ ] 3.3.1 Add controller/workspace binding, disposal, file-read, double-submit, selection, and focus implementation coverage — `packages/cli/tests/admin/organization-workspace.impl.test.ts`
- [ ] 3.3.2 Update organization-service and session capability/wiring expectations — existing organization-service and session Admin test files
- [ ] 3.3.3 Update application command/menu/workspace lifecycle expectations — existing application and command Admin test files
- [ ] 3.3.4 Exercise 80×24 and the 49×19 minimum through existing PTY/native-host tests; add no compact fallback or new harness — affected existing Admin PTY test files
- [ ] 3.3.5 Run focused CLI Admin suites, CLI lint/typecheck/build, and `yarn test:structure`

**Verify**: focused ST-27–ST-45 and implementation suites; CLI lint/typecheck/build;
`yarn test:structure`; never root `yarn verify` (AR-3)

## Phase 4: Documentation and Final Gates

> **Phase baseline tree**: _(recorded by exec-plan from the complete phase-start worktree state)_
> **Scope mode**: strict

### Step 4.1: Documentation

**Reference**: RD-06 AC-14–AC-18 · AR-1–AR-3

- [ ] 4.1.1 Update organization/branding API and custom-login-UI documentation for the corrected SDK, upload, public URL, SVG, fallback, and CSP contracts — `docs/api/organizations.md`, `docs/api/branding.md`, `docs/guide/custom-ui.md`
- [ ] 4.1.2 Update organization CLI/Admin documentation for the new workspace and password-login 2FA boundary — `docs/cli/organizations.md`, `docs/concepts/authentication-modes.md`
- [ ] 4.1.3 Run `yarn docs:build`

### Step 4.2: Final Verification

**Reference**: [07 §Verification Checklist](07-testing-strategy.md#verification-checklist) · AR-3

- [ ] 4.2.1 Run `yarn test:structure`
- [ ] 4.2.2 Run `yarn workspace @portaidentity/server verify`
- [ ] 4.2.3 Run `yarn workspace @portaidentity/sdk verify`
- [ ] 4.2.4 Run `yarn workspace @portaidentity/cli verify`
- [ ] 4.2.5 Run `yarn test:ui`
- [ ] 4.2.6 Run `yarn assurance:harness --project security --profile production-security` and evaluate its registered outcome taxonomy
- [ ] 4.2.7 After a clean committed implementation revision exists, run `yarn assurance:compat --select tenant-admin` and evaluate its registered outcome taxonomy

**Verify**: all AR-3 commands above; root `yarn verify` remains prohibited

## Dependencies

```text
Phase 1: protected asset persistence and truthful SDK contracts
    ↓
Phase 2: public delivery and effective rendering consume Phase 1 contracts
    ↓
Phase 3: Admin workspace consumes Phase 1 SDK and exercises Phase 2 presentation
    ↓
Phase 4: documentation and complete gates verify the integrated feature
```

## Success Criteria

1. All 55 tasks are complete and every immutable ST-1–ST-45 expectation passes.
2. The selected organization can be managed through the approved maximized three-tab workspace.
3. PNG, JPEG, WebP, ICO, and SVG assets follow one validated JSON/base64 path and render through
   the exact public branding route.
4. Page and email branding use uploaded assets, configured fallbacks, and Porta defaults in order
   without making optional decoration an authentication dependency.
5. CSP permits only required image sources while retaining every existing non-image directive.
6. Magic-link authentication remains passwordless; organization 2FA remains a password-login step.
7. No ETag UI workflow, retry machinery, compatibility shim, media/storage abstraction, new
   sanitizer/parser, locale registry, or test harness remains.
8. Every AR-3 verification command reaches an eligible passing outcome without root `yarn verify`.
9. Post-completion CodeOps review and roadmap synchronization are complete.
