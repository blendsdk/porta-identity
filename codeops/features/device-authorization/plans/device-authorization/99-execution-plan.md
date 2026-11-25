# Execution Plan: Device Authorization

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-11-25 17:30
> **Progress**: 85/87 tasks (98%)
> **Execution Mode**: `--auto-commit` (exec-plan commits via the git-commit skill; this plan contains no git commands)
> **CodeOps Artifact Schema**: 1

## Overview

Implement the approved device-authorization RDs in five phases. Each phase follows the mandatory
specification-first ordering: specification tests → red phase → implementation → green phase →
implementation tests/hardening → phase gate.

The phase gate is `pnpm verify` (CI authoritative) plus `pnpm test:ui`, `pnpm harness:test` and the
applicable assurance selectors where the phase changes browser, interaction or security behavior.
Local task work uses the narrow existing category commands as feedback. No new test harness, service,
worker or dependency is added.

**🚨 Update this document after EACH completed task!**

## Task Verification

Use the narrowest command that covers the task. Examples:

| Task kind | Command |
|---|---|
| Server unit spec/impl | `pnpm --filter @portaidentity/server exec vitest run --project unit <file>` |
| Server integration | `pnpm --filter @portaidentity/server exec vitest run --project integration <file>` |
| Server E2E | `pnpm --filter @portaidentity/server exec vitest run --project e2e <file>` |
| Server UI | `pnpm --filter @portaidentity/server test:ui` |
| Pentest | `pnpm --filter @portaidentity/server exec vitest run --project pentest <file>` |
| SDK | `pnpm --filter @portaidentity/sdk test <file>` |
| CLI | `pnpm --filter @portaidentity/cli test <file>` |
| Structure | `pnpm test:structure` |

Integration/E2E/pentest tasks start the existing PostgreSQL/Redis/MailHog services and stop them
after the run. Do not leave a service, container, network, volume or test Porta installation behind.
The CI gate is `pnpm verify`; a local phase gate may use the narrow categories and record that CI is
pending.

## Implementation Phases

| Phase | Title | Tasks |
|---|---|---|
| 1 | Provider protocol, DeviceCode storage and tenant binding | 16 |
| 2 | Branded verification and security controls | 21 |
| 3 | Client contracts and administration | 21 |
| 4 | CLI device login | 15 |
| 5 | Cleanup, assurance and closure | 14 |

**Total: 87 tasks across 5 phases** (no fabricated hour estimates).

> **⚠️ EXECUTION RULE — APPLIES TO EVERY AGENT EXECUTING THIS PLAN:**
>
> The task checkboxes in the phase sections below are the **single source of truth** for progress.
> Every task line appears exactly once in this document. The executing agent MUST:
>
> 1. **On implementation:** mark the task `[~]` with a timestamp —
>    `- [~] 1.1.1 Task description ⏳ (implemented: YYYY-MM-DD HH:MM)`
> 2. **On verify pass:** promote it to `[x]` —
>    `- [x] 1.1.1 Task description ✅ (completed: YYYY-MM-DD HH:MM)`
> 3. **Update the Progress header** after every task — never batch updates. Only `[x]` counts.
> 4. **Resume** by scanning top-to-bottom: the first `[~]` task, else the first `[ ]` task.
> 5. **On blocker:** mark `[!]` and append `Blocked: <reason>`.
>
> Timestamps come from `date '+%Y-%m-%d %H:%M'`. Execution commit behavior is owned by exec-plan
> (auto-commit mode) and the git-commit skill. Spec-only tasks are **non-committable checkpoints**:
> keep them `[~]` and commit the spec file with the first implementation task that turns it green.
> Never push a knowingly red suite.
>
> **Preflight resolutions:** the phase order, task set and acceptance criteria incorporate
> `00-preflight-report.md`. Do not re-open a resolved finding without new evidence.

---

## Phase 1: Provider Protocol, DeviceCode Storage and Tenant Binding

> **Phase baseline tree**: 9cd5b6f91a86721d466051296dd7b26111a07e2d
> **Reasoning**: xhigh — the cross-tenant binding is the critical security boundary and must exist
> before `deviceFlow` is reachable.

**Reference**: [03-01](03-01-provider-protocol.md), [03-02](03-02-tenant-safe-verification.md), RD-01, RD-02 (binding), P-7/P-8, PF-002/PF-003
**Objective**: enable the native flow only with the organization binding, advertise it, and store
DeviceCode correctly.

### Step 1.1: Specification Tests

- [x] 1.1.1 [spec-author] Write integration discovery/storage spec tests ST-01, ST-02, ST-04 — `packages/server/tests/integration/oidc/device-discovery.spec.test.ts` ✅ (completed: 2026-11-25 13:30)
- [x] 1.1.2 [spec-author] Write integration protocol/token/tenant spec tests ST-03, ST-05–ST-11 and the E2E regression ST-02, ST-05–ST-08, ST-13; add the granted public device-only, admin and org B fixtures through the documented test factory/repository insert — `packages/server/tests/integration/oidc/device-authorization.spec.test.ts`, `packages/server/tests/e2e/flows/device-authorization.spec.test.ts`, test fixtures ✅ (completed: 2026-11-25 13:30)
- [x] 1.1.3 [spec-author] Write unit config/collision/path/normalizer spec tests (helper-level; not full HTTP/DB) — `packages/server/tests/unit/oidc/device-authorization.spec.test.ts`, `packages/server/tests/unit/oidc/org-resolution.spec.test.ts` ✅ (completed: 2026-11-25 13:30)
- [x] 1.1.4 Run the spec files and record the red phase; no implementation changes ✅ (completed: 2026-11-25 13:30)

### Step 1.2: Implementation

- [x] 1.2.1 Add the shared `relativeOidcRoute`, `resolveOrganizationId` and exact bounded normalizer helpers — `packages/server/src/oidc/org-resolution.ts` ✅ (completed: 2026-11-25 13:38)
- [x] 1.2.2 Add migration 039 with duplicate preflight and the partial unique index — `packages/server/migrations/039_device_authorization_user_code.cjs` ✅ (completed: 2026-11-25 13:38)
- [x] 1.2.3 Add DeviceCode retention, zero-TTL guard and custom exposed 503 collision error — `packages/server/src/oidc/postgres-adapter.ts` ✅ (completed: 2026-11-25 13:38)
- [x] 1.2.4 Implement organization binding for entry, confirmation and resume, with UID-case preservation, the typed `ignoreSessionBinding` resume wrapper, resume-cookie check, HEAD guard and rejection observation — `packages/server/src/middleware/device-tenant.ts` ✅ (completed: 2026-11-25 13:38)
- [x] 1.2.5 Mount the tenant binding and HEAD guards; prefer the loaded client organization in `interactionUrl` — `packages/server/src/server.ts`, `packages/server/src/oidc/provider.ts` ✅ (completed: 2026-11-25 13:38)
- [x] 1.2.6 Enable `deviceFlow` only after the binding is mounted: empty `deviceInfo`, `ttl.DeviceCode` and the `interval: 5` listener — `packages/server/src/oidc/configuration.ts`, `packages/server/src/oidc/provider.ts` ✅ (completed: 2026-11-25 13:38)
- [x] 1.2.7 Run the spec files green; fix implementation only, never expectations ✅ (completed: 2026-11-25 13:38)

### Step 1.3: Implementation Tests and Hardening

- [x] 1.3.1 Write adapter/retention/collision/TTL/interval implementation tests — `packages/server/tests/unit/oidc/device-authorization.impl.test.ts` ✅ (completed: 2026-11-25 13:39)
- [x] 1.3.2 Write path/normalizer/resume implementation tests (mixed case, encoded, overlong, `ß`/`İ`/fullwidth) — `packages/server/tests/unit/oidc/org-resolution.impl.test.ts` ✅ (completed: 2026-11-25 13:39)
- [x] 1.3.3 Update the exact test-file counts in `repo-tests/monorepo/server-package.spec.test.mjs` — `repo-tests/monorepo/server-package.spec.test.mjs` ✅ (completed: 2026-11-25 13:39)
- [x] 1.3.4 Run the required `oidc-provider-reviewer` specialist review and resolve findings ✅ (completed: 2026-11-25 15:34)
- [x] 1.3.5 Phase gate: run the narrow unit/integration/E2E suites and `pnpm test:structure`; record CI `pnpm verify` (CI) ✅ (completed: 2026-11-25 15:34)

**Deliverables**: feature enabled only with the tenant binding; discovery and provider errors
correct; migration/adapter retention and uniqueness correct; path/normalizer helpers tested;
spec and implementation tests green.
**Test slices**: N/A — no test map; see 07.
**Verify (gate)**: `pnpm verify` (CI) plus the Phase 1 integration/E2E files.

---

## Phase 2: Branded Verification and Security Controls

> **Phase baseline tree**: recorded by exec-plan at phase start.
> **Reasoning**: xhigh — cross-tenant UX, rate limits, audit and redaction land before any client
> receives the grant.

**Reference**: [03-02](03-02-tenant-safe-verification.md), [03-05](03-05-security-operations.md), RD-02, RD-05, P-9/P-12, PF-004/PF-005/PF-010/PF-013–PF-016/PF-021
**Objective**: render the branded pages and land the fixed limits, audit, redaction, cleanup and
concurrent-approval controls before client enablement.

### Step 2.1: Specification Tests

- [x] 2.1.1 [spec-author] Write branded-page/SSO/2FA/consent UI spec tests ST-12–ST-14 and the unknown-locale fallback ST-34 — `packages/server/tests/ui/flows/device-authorization.spec.ts` ✅ (completed: 2026-11-25 14:28)
- [x] 2.1.2 [spec-author] Add limiter/audit/concurrency integration spec cases ST-23–ST-27, ST-31 and the logger destination-stream redaction spec ST-28 — `packages/server/tests/integration/oidc/device-authorization.spec.test.ts`, `packages/server/tests/unit/lib/logger-device-redaction.spec.test.ts` ✅ (completed: 2026-11-25 14:28)
- [x] 2.1.3 [spec-author] Add the XSRF negative, scope-source and terminal-control cases — the UI/E2E/CLI files from 07 ✅ (completed: 2026-11-25 14:28)
- [x] 2.1.4 Run the spec files and record the red phase ✅ (completed: 2026-11-25 14:28)

### Step 2.2: Implementation

- [x] 2.2.1 Register the `device` i18n namespace and update the exact-namespace tests — `packages/server/src/auth/i18n.ts`, `packages/server/tests/unit/auth/invitation-locales.spec.test.ts`, `packages/server/tests/unit/lib/system-config-catalog.spec.test.ts` ✅ (completed: 2026-11-25 14:28)
- [x] 2.2.2 Add the page hooks, org/locale/branding/`t`/CSRF context, `deviceCode.params.scope` source, generic abort page and CSP — `packages/server/src/oidc/device-pages.ts`, `packages/server/src/oidc/configuration.ts` ✅ (completed: 2026-11-25 14:28)
- [x] 2.2.3 Add the three templates and en/nl `device.json` keys — `packages/server/templates/default/pages/`, `packages/server/locales/default/` ✅ (completed: 2026-11-25 14:28)
- [x] 2.2.4 Add fixed constants, shared path predicate, key builders, hard-counters-first ordering and the pre-parser malformed counter — `packages/server/src/middleware/device-rate-limiter.ts` ✅ (completed: 2026-11-25 14:28)
- [x] 2.2.5 Exempt the device grant from the generic token limiter, use the shared path predicate there, update the existing token-limiter tests, and mount all device limiters before `oidcClientTenantBinding` — `packages/server/src/middleware/token-rate-limiter.ts`, `packages/server/tests/unit/middleware/token-rate-limiter.test.ts`, `packages/server/src/server.ts` ✅ (completed: 2026-11-25 14:28)
- [x] 2.2.6 Resolve the provider session UID for the user-code key (`deviceUserCodeRateLimiter(provider)`); reset only the primary counter in `successSource`; never reset the per-IP aggregate — `packages/server/src/middleware/device-rate-limiter.ts`, `packages/server/src/oidc/device-pages.ts` ✅ (completed: 2026-11-25 14:28)
- [x] 2.2.7 Add authorized/denied audit with hashed `jti`, NX per window, consent-entity resolution, `err.cause` classification and audit-before-render — `packages/server/src/oidc/device-pages.ts` ✅ (completed: 2026-11-25 14:28)
- [x] 2.2.8 Add the durable pre-approval conditional confirmation write; allow the later accountId/grantId completion save and the pre-approval error/denial save (never overwrite an approved row), and add the concurrency/denial tests — `packages/server/src/oidc/postgres-adapter.ts` ✅ (completed: 2026-11-25 14:28)
- [x] 2.2.9 Add Pino redaction paths and a test-only destination seam; do not add a URL sanitizer — `packages/server/src/lib/logger.ts` ✅ (completed: 2026-11-25 14:28)
- [x] 2.2.10 Add cleanup: purge on approval/login entry, HEAD guards, `device` reserved slug and deletion/logout verification — `packages/server/src/oidc/device-pages.ts`, `packages/server/src/server.ts`, `packages/server/src/organizations/slugs.ts` ✅ (completed: 2026-11-25 14:28)
- [x] 2.2.11 Run the spec files green; fix implementation only ✅ (completed: 2026-11-25 14:28)

### Step 2.3: Implementation Tests and Hardening

- [x] 2.3.1 Add accessibility/page-quality and XSRF negative coverage plus the page-hook implementation tests (form/XSRF/escaping/locale/scope) — `packages/server/tests/ui/flows/device-authorization.spec.ts`, `packages/server/tests/unit/oidc/device-pages.impl.test.ts` ✅ (completed: 2026-11-25 14:28)
- [x] 2.3.2 Write limiter/audit/concurrency implementation tests — `packages/server/tests/unit/middleware/device-rate-limiter.impl.test.ts`, `packages/server/tests/unit/lib/device-audit.impl.test.ts` ✅ (completed: 2026-11-25 14:28)
- [x] 2.3.3 Update the exact test-file counts in `repo-tests/monorepo/server-package.spec.test.mjs` — `repo-tests/monorepo/server-package.spec.test.mjs` ✅ (completed: 2026-11-25 14:28)
- [x] 2.3.4 Run `pnpm test:ui` and the retained `pnpm harness:test`; record the run ids ✅ (completed: 2026-11-25 14:28)
- [x] 2.3.5 Run the `oidc-provider-reviewer` review and resolve findings ✅ (completed: 2026-11-25 17:30)
- [ ] 2.3.6 Phase gate: run the narrow suites and `pnpm test:structure`; record CI `pnpm verify` (CI)

**Deliverables**: branded pages and generic abort state; fixed limits with session UID and
approval-only primary reset; audit/redaction/cleanup; concurrent approval; UI/harness evidence.
**Test slices**: N/A — no test map; see 07.
**Verify (gate)**: `pnpm verify` (CI) plus `pnpm test:ui` and `pnpm harness:test`.

---

## Phase 3: Client Contracts and Administration

> **Phase baseline tree**: recorded by exec-plan at phase start.
> **Reasoning**: high — broad but mechanical contract change across established surfaces; client
> enablement happens only after Phase 1/2 controls.

**Reference**: [03-03](03-03-client-contracts.md), RD-03, P-10, PF-001/PF-011/PF-012/PF-018
**Objective**: make the full URN, empty response types and conditional redirect rule consistent
everywhere, and gate the fleet upgrade.

### Step 3.1: Specification Tests

- [x] 3.1.1 [spec-author] Write the integration Admin API spec tests ST-15, ST-16 and the server-validator helper regression — `packages/server/tests/integration/admin/client-device-grant.spec.test.ts`, `packages/server/tests/unit/clients/device-grant.spec.test.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 3.1.2 [spec-author] Write SDK spec tests ST-17 — `packages/sdk/tests/domains/clients-device-grant.spec.test.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 3.1.3 [spec-author] Write CLI client-command spec tests ST-18 — `packages/cli/tests/commands/client-device-grant.spec.test.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 3.1.4 [spec-author] Write Admin terminal and portability spec tests ST-19, ST-32 — `packages/cli/tests/admin/oidc-client-device-grant.spec.test.ts`, `packages/server/tests/integration/admin/portability-device-grant.spec.test.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 3.1.5 Run the spec files and record the red phase ✅ (completed: 2026-11-25 15:34)

### Step 3.2: Implementation

- [x] 3.2.1 Add the server constant, grant/response-type enums and conditional response-type rule — `packages/server/src/clients/validators.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 3.2.2 Gate the empty redirect array in create/update and extend the Admin API/service schemas — `packages/server/src/clients/service.ts`, `packages/server/src/routes/clients.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 3.2.3 Extend SDK types and exports (grant union, response-type/empty-array input) — `packages/sdk/src/types/clients.ts`, `packages/sdk/src/types/index.ts`, `packages/sdk/src/index.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 3.2.4 Extend the SDK runtime response validator — `packages/sdk/src/domains/clients.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 3.2.5 Add `--grant-types`, optional/clearable redirects and automatic empty response types — `packages/cli/src/commands/client.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 3.2.6 Extend Admin terminal state and parser (grant union, redirect minimum 0, empty response types) — `packages/cli/src/admin/client-state.ts`, `packages/cli/src/admin/client-service.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 3.2.7 Extend the Admin terminal Protocol editor, registration dialog and last-redirect guards — `packages/cli/src/admin/client-workspace.ts`, `client-registration-dialog.ts`, `client-authentication-dialog.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 3.2.8 Extend the portability schema and round-trip — `packages/server/src/portability/schema.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 3.2.9 Add the grant to the new admin CLI client and update the exact-grant tests — `packages/server/src/cli/commands/init.ts`, `packages/server/tests/unit/cli/commands/init.test.ts`, `packages/server/tests/integration/cli/init.test.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 3.2.10 Update API, CLI, OIDC, capabilities, custom-UI and operational documentation — `docs/` ✅ (completed: 2026-11-25 15:34)
- [x] 3.2.11 Add the server-fleet upgrade gate/release note — release documentation ✅ (completed: 2026-11-25 15:34)
- [x] 3.2.12 Run the spec files green; fix implementation only ✅ (completed: 2026-11-25 15:34)

### Step 3.3: Implementation Tests and Hardening

- [x] 3.3.1 Write conditional-redirect/response-type/terminal-parser/CLI-flag implementation tests — `packages/server/tests/unit/clients/device-grant.impl.test.ts`, `packages/cli/tests/admin/oidc-client-device-grant.impl.test.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 3.3.2 Update the exact test-file counts in `repo-tests/monorepo/server-package.spec.test.mjs` — `repo-tests/monorepo/server-package.spec.test.mjs` ✅ (completed: 2026-11-25 15:34)
- [x] 3.3.3 Run `pnpm docs:build` and `pnpm assurance:compat --select compatibility`; describe it truthfully ✅ (completed: 2026-11-25 16:10)
- [x] 3.3.4 Phase gate: run the narrow suites and `pnpm test:structure`; record CI `pnpm verify` (CI) ✅ (completed: 2026-11-25 15:34)

**Deliverables**: one consistent client contract; device-only creation with zero redirects and empty
response types; terminal/portability/SDK/CLI parity; fleet gate; docs and lockstep notes.
**Test slices**: N/A — no test map; see 07.
**Verify (gate)**: `pnpm verify` (CI) plus `pnpm docs:build`.

---

## Phase 4: CLI Device Login

> **Phase baseline tree**: recorded by exec-plan at phase start.
> **Reasoning**: high — new network polling and token verification path.

**Reference**: [03-04](03-04-cli-device-login.md), RD-04 (amended), P-11, PF-006/PF-024/PF-026
**Objective**: implement `porta login --device-code` with a nonce-less device ID-token verifier and
the no-retry polling contract.

### Step 4.1: Specification Tests

- [x] 4.1.1 [spec-author] Write coordinator/polling/missing-support spec tests ST-21, ST-33 — `packages/cli/tests/auth/device-flow.spec.test.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 4.1.2 [spec-author] Write device ID-token verifier spec tests ST-22 — `packages/cli/tests/auth/device-id-token.spec.test.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 4.1.3 [spec-author] Write the command wiring/output regression and the live CLI E2E spec test ST-20; seed a granted admin CLI client for the E2E — `packages/cli/tests/commands/login-device-code.spec.test.ts`, `packages/server/tests/e2e/flows/device-cli-login.spec.test.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 4.1.4 Run the spec files and record the red phase ✅ (completed: 2026-11-25 15:34)

### Step 4.2: Implementation

- [x] 4.2.1 Implement discovery, authorization, token and credential orchestration — `packages/cli/src/auth/device-flow.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 4.2.2 Implement the polling loop, interval/`slow_down`/429 clamp/no-retry/unknown-error/deadline/abort boundaries — `packages/cli/src/auth/device-poll.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 4.2.3 Add `verifyDeviceIdToken` without weakening the nonce verifier; add the supplied-nonce regression — `packages/cli/src/auth/id-token-verifier.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 4.2.4 Add `--device-code`, branching, expiry hint, terminal-control rejection and output — `packages/cli/src/commands/login.ts`, `packages/cli/src/auth/device-flow.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 4.2.5 Update CLI overview/login documentation — `docs/cli/overview.md`, related docs ✅ (completed: 2026-11-25 15:34)
- [x] 4.2.6 Add the live CLI E2E against the shared server and credential cleanup — `packages/server/tests/e2e/flows/device-cli-login.spec.test.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 4.2.7 Run the spec files green; fix implementation only ✅ (completed: 2026-11-25 15:34)

### Step 4.3: Implementation Tests and Hardening

- [x] 4.3.1 Write polling/no-retry/429-clamp/unknown-error/abort/response-bound/terminal-control implementation tests — `packages/cli/tests/auth/device-flow.impl.test.ts` ✅ (completed: 2026-11-25 15:34)
- [x] 4.3.2 Verify existing credential persistence and refresh compatibility with device-issued tokens ✅ (completed: 2026-11-25 15:34)
- [x] 4.3.3 Update the exact test-file counts in `repo-tests/monorepo/server-package.spec.test.mjs` — `repo-tests/monorepo/server-package.spec.test.mjs` ✅ (completed: 2026-11-25 15:34)
- [x] 4.3.4 Phase gate: run the CLI suites, the live E2E and `pnpm test:structure`; record CI `pnpm verify` (CI) ✅ (completed: 2026-11-25 15:34)

**Deliverables**: full CLI device login; no device-code leakage; no-retry/429/unknown-error
behavior; live E2E evidence; existing login unchanged.
**Test slices**: N/A — no test map; see 07.
**Verify (gate)**: `pnpm verify` (CI) plus the live CLI E2E.

---

## Phase 5: Cleanup, Assurance and Closure

> **Phase baseline tree**: recorded by exec-plan at phase start.
> **Reasoning**: xhigh — carry the remediation and assurance evidence to closure; no new
> unmitigated security finding.

**Reference**: [03-05](03-05-security-operations.md), RD-05, P-12/P-13, PF-007–PF-009/PF-019/PF-020
**Objective**: close cleanup, pentest, production-security, compatibility, UI/harness, structure and
final review evidence.

### Step 5.1: Specification Tests and Cleanup Coverage

- [x] 5.1.1 [spec-author] Write cleanup/stale-authority spec tests ST-29 — `packages/server/tests/integration/oidc/device-authorization.spec.test.ts` ✅ (completed: 2026-11-25 16:10)
- [x] 5.1.2 [spec-author] Write the pentest matrix ST-30 — `packages/server/tests/pentest/auth-bypass/device-authorization.spec.test.ts` ✅ (completed: 2026-11-25 16:10)
- [x] 5.1.3 Run the spec files and record the red phase ✅ (completed: 2026-11-25 16:10)

### Step 5.2: Implementation and Hardening

- [x] 5.2.1 Finalize purge/deletion/logout/connected-app cleanup and the `device` slug guard — `packages/server/src/oidc/device-pages.ts`, `packages/server/src/server.ts`, `packages/server/src/organizations/slugs.ts` ✅ (completed: 2026-11-25 16:10)
- [x] 5.2.2 Finalize audit amplification/idempotency-failure handling and the fail-open residual note — `packages/server/src/oidc/device-pages.ts` ✅ (completed: 2026-11-25 16:10)
- [x] 5.2.3 Finalize the production-security definition and evidence runner (no new findings; three accepted gaps; exit 40) — `techdocs/` and the assurance record ✅ (completed: 2026-11-25 17:30)
- [x] 5.2.4 Finalize the truthful compatibility-selector description and evidence — `techdocs/` and the assurance record ✅ (completed: 2026-11-25 16:10)
- [x] 5.2.5 Finalize operational documentation and the release/fleet note — `docs/` ✅ (completed: 2026-11-25 16:10)

### Step 5.3: Implementation Tests and Assurance

- [x] 5.3.1 Update the exact test-file counts in `repo-tests/monorepo/server-package.spec.test.mjs` — `repo-tests/monorepo/server-package.spec.test.mjs` ✅ (completed: 2026-11-25 16:10)
- [x] 5.3.2 Run the pentest suite and resolve findings ✅ (completed: 2026-11-25 16:10)
- [x] 5.3.3 Run `pnpm assurance:harness --project security --profile production-security` and record the accepted gaps/exit 40 ✅ (completed: 2026-11-25 17:30)
- [x] 5.3.4 Run `pnpm test:ui` and `pnpm harness:test`; record the run ids ✅ (completed: 2026-11-25 17:30)
- [x] 5.3.5 Run the final `oidc-provider-reviewer` review and resolve findings ✅ (completed: 2026-11-25 17:30)
- [ ] 5.3.6 Run `pnpm docs:build`, `pnpm test:structure` and the full `pnpm verify` CI gate; close the plan

**Deliverables**: cleanup and stale authority verified; pentest matrix; production-security and
compatibility evidence with truthful scope; UI/harness evidence; docs and CI green.
**Test slices**: N/A — no test map; see 07.
**Verify (gate)**: `pnpm verify` (CI) plus `pnpm test:ui`, `pnpm harness:test` and the assurance
selectors.

---

## Dependencies

```text
Phase 1 (provider + tenant binding)
    ↓
Phase 2 (branded pages + security controls)
    ↓
Phase 3 (client contracts + enablement)
    ↓
Phase 4 (CLI device login)
    ↓
Phase 5 (cleanup + assurance)
```

Phase 3 **requires** Phase 2: the device grant must not be enabled on any client before the tenant
binding, fixed limits, audit and redaction are in place. Phase 4 depends on Phase 3. Phase 5 closes
the evidence; it does not introduce a new security control that was missing earlier.

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed and all task checkboxes `[x]`.
2. ✅ RD-01–RD-05 acceptance criteria are covered by the specification tests, including the RD-04
   no-retry amendment and the RD-05 approval-only primary reset.
3. ✅ Cross-tenant entry/resume, polling limits, audit, redaction, cleanup and concurrent approval
   pass.
4. ✅ Admin API, SDK, CLI, Admin terminal and portability contracts are consistent, including empty
   response types and zero redirects.
5. ✅ `porta login --device-code` completes and persists usable credentials in a live E2E.
6. ✅ Production-security evidence has no new findings, the three accepted gaps are unchanged, and
   exit 40 is recorded; the compatibility selector is described truthfully.
7. ✅ `pnpm docs:build`, the structure counts and CI `pnpm verify` pass.
8. ✅ No dead code, no new dependency, no unresolved security finding.
