# Execution Plan: @porta/sdk

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-05-05 21:00
> **Progress**: 85/85 tasks (100%)
> **CodeOps Version**: 1.0.0

## Overview

Build `@porta/sdk` — a universal TypeScript SDK for the Porta Admin API with transport abstraction, 19 domain namespaces, AI agent integration, and comprehensive tests.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
|-------|-------|----------|-----------|
| 1 | Package Scaffolding & Core Infrastructure | 2 | 90 min |
| 2 | Transport Implementations | 2 | 90 min |
| 3 | Auth Providers | 2 | 75 min |
| 4 | Entity Types | 2 | 75 min |
| 5 | Domain API Layer | 4 | 180 min |
| 6 | Client Factory, Entrypoints & Build Integration | 2 | 75 min |
| 7 | AI Agent Layer | 2 | 90 min |
| 8 | Type Compatibility & Final Verification | 2 | 75 min |
| 9 | Documentation | 2 | 90 min |
| 10 | Documentation Review & Update | 1 | 45 min |

**Total: 21 sessions, ~14-15 hours**

---

## Phase 1: Package Scaffolding & Core Infrastructure

### Session 1.1: Package Setup

**Reference**: [Technical Spec](03-technical-spec.md) — Sections 1, Package Structure
**Objective**: Create the SDK package directory, config files, and workspace wiring

**Tasks**:

| # | Task | File |
|---|------|------|
| 1.1.1 | Create `packages/porta-sdk/` directory structure (src/, tests/ with all subdirs) | `packages/porta-sdk/` |
| 1.1.2 | Create `package.json` with exports map, scripts, engines | `packages/porta-sdk/package.json` |
| 1.1.3 | Create `tsconfig.json` (ES2022, NodeNext, strict, declarations) | `packages/porta-sdk/tsconfig.json` |
| 1.1.4 | Create `vitest.config.ts` for SDK tests | `packages/porta-sdk/vitest.config.ts` |
| 1.1.5 | Create `src/version.ts` with SDK_VERSION constant | `packages/porta-sdk/src/version.ts` |
| 1.1.6 | Add `"workspaces": ["packages/porta-sdk"]` to root package.json | `package.json` |
| 1.1.7 | Run `yarn install` at root — verify workspace resolution | — |

**Deliverables**:
- [ ] SDK package directory exists with config files
- [ ] Root workspace resolves SDK package
- [ ] `yarn install` succeeds at root

**Verify**: `clear && sleep 3 && yarn install`

---

### Session 1.2: Core Types & Error Hierarchy

**Reference**: [Technical Spec](03-technical-spec.md) — Sections 2, 4, 5
**Objective**: Implement transport types, error hierarchy, pagination types, and domain helpers

**Tasks**:

| # | Task | File |
|---|------|------|
| 1.2.1 | Create transport types (HttpTransport, TransportRequest, TransportResponse, HttpMethod) | `packages/porta-sdk/src/transport/types.ts` |
| 1.2.2 | Create error hierarchy (PortaError → PortaHttpError → 7 specific classes + PortaServerError + mapResponseToError) | `packages/porta-sdk/src/errors/index.ts` |
| 1.2.3 | Create pagination types and `listAll` helper | `packages/porta-sdk/src/pagination/index.ts` |
| 1.2.4 | Create domain helpers (unwrapData, unwrapWithEtag, etagHeaders, buildQueryString) | `packages/porta-sdk/src/domains/helpers.ts` |
| 1.2.5 | Create error hierarchy unit tests | `packages/porta-sdk/tests/errors/errors.test.ts` |
| 1.2.6 | Create pagination unit tests | `packages/porta-sdk/tests/pagination/pagination.test.ts` |

**Deliverables**:
- [ ] Core types compile
- [ ] Error hierarchy tested (instanceof, mapping, details extraction)
- [ ] Pagination listAll tested (single page, multi page, empty, error)
- [ ] SDK `yarn typecheck` passes

**Verify**: `clear && sleep 3 && cd packages/porta-sdk && yarn typecheck && yarn test`

---

## Phase 2: Transport Implementations

### Session 2.1: BrowserTransport

**Reference**: [Technical Spec](03-technical-spec.md) — Section 2 (BrowserTransport)
**Objective**: Implement BrowserTransport with CSRF, 401, 204, query params, AbortSignal

**Tasks**:

| # | Task | File |
|---|------|------|
| 2.1.1 | Implement `createBrowserTransport()` | `packages/porta-sdk/src/transport/browser-transport.ts` |
| 2.1.2 | Write BrowserTransport unit tests (mock global fetch) | `packages/porta-sdk/tests/transport/browser-transport.test.ts` |

**Deliverables**:
- [ ] BrowserTransport passes all tests
- [ ] CSRF injection, 401 redirect, 204 handling, query params, AbortSignal all tested

**Verify**: `clear && sleep 3 && cd packages/porta-sdk && yarn test`

---

### Session 2.2: NodeTransport

**Reference**: [Technical Spec](03-technical-spec.md) — Section 2 (NodeTransport)
**Objective**: Implement NodeTransport with Bearer auth, 401 retry, 204, query params, AbortSignal

**Tasks**:

| # | Task | File |
|---|------|------|
| 2.2.1 | Implement `createNodeTransport()` | `packages/porta-sdk/src/transport/node-transport.ts` |
| 2.2.2 | Write NodeTransport unit tests (mock global fetch) | `packages/porta-sdk/tests/transport/node-transport.test.ts` |

**Deliverables**:
- [ ] NodeTransport passes all tests
- [ ] Bearer injection, 401 retry/refresh, 204 handling, query params, AbortSignal all tested

**Verify**: `clear && sleep 3 && cd packages/porta-sdk && yarn test`

---

## Phase 3: Auth Providers

### Session 3.1: TokenAuth & ClientCredentialsAuth

**Reference**: [Technical Spec](03-technical-spec.md) — Section 3
**Objective**: Implement TokenAuth and ClientCredentialsAuth providers

**Tasks**:

| # | Task | File |
|---|------|------|
| 3.1.1 | Create AuthProvider interface | `packages/porta-sdk/src/auth/types.ts` |
| 3.1.2 | Implement `createTokenAuth()` | `packages/porta-sdk/src/auth/token-auth.ts` |
| 3.1.3 | Implement `createClientCredentialsAuth()` with concurrent dedup | `packages/porta-sdk/src/auth/client-credentials-auth.ts` |
| 3.1.4 | Write TokenAuth tests | `packages/porta-sdk/tests/auth/token-auth.test.ts` |
| 3.1.5 | Write ClientCredentialsAuth tests (caching, dedup, refresh, errors) | `packages/porta-sdk/tests/auth/client-credentials-auth.test.ts` |

**Deliverables**:
- [ ] TokenAuth returns static token, no refresh
- [ ] ClientCredentialsAuth: fetch, cache, dedup, refresh, error handling all tested

**Verify**: `clear && sleep 3 && cd packages/porta-sdk && yarn test`

---

### Session 3.2: CliAuth

**Reference**: [Technical Spec](03-technical-spec.md) — Section 3 (CliAuth)
**Objective**: Implement CliAuth provider (credentials file reading, refresh)

**Tasks**:

| # | Task | File |
|---|------|------|
| 3.2.1 | Implement `createCliAuth()` | `packages/porta-sdk/src/auth/cli-auth.ts` |
| 3.2.2 | Write CliAuth tests (file read, missing, refresh, errors) | `packages/porta-sdk/tests/auth/cli-auth.test.ts` |

**Deliverables**:
- [ ] CliAuth reads credentials file, handles missing/expired, refresh flow tested

**Verify**: `clear && sleep 3 && cd packages/porta-sdk && yarn test`

---

## Phase 4: Entity Types

### Session 4.1: Core Entity Types (Orgs, Apps, Clients, Users)

**Reference**: [RD-25](../../requirements/RD-25-porta-sdk.md) — Full TypeScript Types section
**Objective**: Define SDK-owned type definitions for the 4 largest domains

**Tasks**:

| # | Task | File |
|---|------|------|
| 4.1.1 | Define Organization types (Organization, Create/UpdateInput, Status, BrandingInput, ListParams) | `packages/porta-sdk/src/types/organizations.ts` |
| 4.1.2 | Define Application types (Application, Create/UpdateInput, Status, Module types, ListParams) | `packages/porta-sdk/src/types/applications.ts` |
| 4.1.3 | Define Client types (Client, Create/UpdateInput, Status, ClientSecret types, ListParams) | `packages/porta-sdk/src/types/clients.ts` |
| 4.1.4 | Define User types (User, Create/Update/InviteInput, Status, ListParams) | `packages/porta-sdk/src/types/users.ts` |

**Deliverables**:
- [ ] All 4 entity type files compile
- [ ] Types mirror server Zod schema shapes

**Verify**: `clear && sleep 3 && cd packages/porta-sdk && yarn typecheck`

---

### Session 4.2: Remaining Entity Types

**Reference**: [RD-25](../../requirements/RD-25-porta-sdk.md) — Full TypeScript Types section
**Objective**: Define types for remaining 13+ domains and create barrel export

**Tasks**:

| # | Task | File |
|---|------|------|
| 4.2.1 | Define Role, Permission types | `packages/porta-sdk/src/types/roles.ts`, `permissions.ts` |
| 4.2.2 | Define CustomClaim types (ClaimDefinition, UserClaimValue) | `packages/porta-sdk/src/types/custom-claims.ts` |
| 4.2.3 | Define Config, Keys, Audit, Stats types | `packages/porta-sdk/src/types/config.ts`, `keys.ts`, `audit.ts`, `stats.ts` |
| 4.2.4 | Define Sessions, Bulk, Branding, Exports types | `packages/porta-sdk/src/types/sessions.ts`, `bulk.ts`, `branding.ts`, `exports.ts` |
| 4.2.5 | Define TwoFactor, Imports types | `packages/porta-sdk/src/types/two-factor.ts`, `imports.ts` |
| 4.2.6 | Create barrel export for all types | `packages/porta-sdk/src/types/index.ts` |

**Deliverables**:
- [ ] All entity type files compile
- [ ] Barrel export re-exports all types
- [ ] SDK typecheck passes

**Verify**: `clear && sleep 3 && cd packages/porta-sdk && yarn typecheck`

---

## Phase 5: Domain API Layer

### Session 5.1: Organizations & Applications Domains

**Reference**: [RD-25](../../requirements/RD-25-porta-sdk.md) — Domain API tables
**Objective**: Implement Organizations (12 methods) and Applications (13 methods) domains with tests

**Tasks**:

| # | Task | File |
|---|------|------|
| 5.1.1 | Implement `createOrganizationsDomain()` | `packages/porta-sdk/src/domains/organizations.ts` |
| 5.1.2 | Write Organizations domain tests | `packages/porta-sdk/tests/domains/organizations.test.ts` |
| 5.1.3 | Implement `createApplicationsDomain()` | `packages/porta-sdk/src/domains/applications.ts` |
| 5.1.4 | Write Applications domain tests | `packages/porta-sdk/tests/domains/applications.test.ts` |

**Deliverables**:
- [ ] Organizations: all 12 methods tested (list, listAll, get, create, update, suspend, activate, archive, restore, destroy, validateSlug, getHistory)
- [ ] Applications: all 13 methods tested (list, listAll, get, create, update, archive, activate, deactivate, history, modules.list, modules.add, modules.update, modules.deactivate)

**Verify**: `clear && sleep 3 && cd packages/porta-sdk && yarn test`

---

### Session 5.2: Clients & Users Domains

**Reference**: [RD-25](../../requirements/RD-25-porta-sdk.md) — Domain API tables
**Objective**: Implement Clients (11 methods) and Users (19 methods) domains with tests

**Tasks**:

| # | Task | File |
|---|------|------|
| 5.2.1 | Implement `createClientsDomain()` | `packages/porta-sdk/src/domains/clients.ts` |
| 5.2.2 | Write Clients domain tests | `packages/porta-sdk/tests/domains/clients.test.ts` |
| 5.2.3 | Implement `createUsersDomain()` | `packages/porta-sdk/src/domains/users.ts` |
| 5.2.4 | Write Users domain tests | `packages/porta-sdk/tests/domains/users.test.ts` |

**Deliverables**:
- [ ] Clients: all methods tested (list, listAll, get, create, update, revoke, activate, deactivate, listSecrets, generateSecret, revokeSecret, getHistory)
- [ ] Users: all 19 methods tested (list, listAll, get, create, invite, invitePreview, update, suspend, reactivate, unsuspend, lock, unlock, deactivate, setPassword, clearPassword, verifyEmail, exportData, purge, history)

**Verify**: `clear && sleep 3 && cd packages/porta-sdk && yarn test`

---

### Session 5.3: UserRoles, UserClaims, Roles, Permissions, CustomClaims Domains

**Reference**: [RD-25](../../requirements/RD-25-porta-sdk.md) — Domain API tables
**Objective**: Implement 5 RBAC/claims-related domains with tests

**Tasks**:

| # | Task | File |
|---|------|------|
| 5.3.1 | Implement UserRoles + UserClaims domains | `packages/porta-sdk/src/domains/user-roles.ts`, `user-claims.ts` |
| 5.3.2 | Write UserRoles + UserClaims tests | `packages/porta-sdk/tests/domains/user-roles.test.ts`, `user-claims.test.ts` |
| 5.3.3 | Implement Roles + Permissions domains | `packages/porta-sdk/src/domains/roles.ts`, `permissions.ts` |
| 5.3.4 | Write Roles + Permissions tests | `packages/porta-sdk/tests/domains/roles.test.ts`, `permissions.test.ts` |
| 5.3.5 | Implement CustomClaims domain | `packages/porta-sdk/src/domains/custom-claims.ts` |
| 5.3.6 | Write CustomClaims tests | `packages/porta-sdk/tests/domains/custom-claims.test.ts` |

**Deliverables**:
- [ ] UserRoles (4 methods), UserClaims (3 methods), Roles (9 methods), Permissions (6 methods), CustomClaims (9 methods) — all tested

**Verify**: `clear && sleep 3 && cd packages/porta-sdk && yarn test`

---

### Session 5.4: Config, Keys, Audit, Stats, Sessions, Bulk, Branding, Exports, TwoFactor, Imports Domains

**Reference**: [RD-25](../../requirements/RD-25-porta-sdk.md) — Domain API tables
**Objective**: Implement remaining 10 domains with tests

**Tasks**:

| # | Task | File |
|---|------|------|
| 5.4.1 | Implement Config + Keys + Audit + Stats domains | `packages/porta-sdk/src/domains/config.ts`, `keys.ts`, `audit.ts`, `stats.ts` |
| 5.4.2 | Write Config + Keys + Audit + Stats tests | `packages/porta-sdk/tests/domains/config.test.ts`, `keys.test.ts`, `audit.test.ts`, `stats.test.ts` |
| 5.4.3 | Implement Sessions + Bulk + Branding domains | `packages/porta-sdk/src/domains/sessions.ts`, `bulk.ts`, `branding.ts` |
| 5.4.4 | Write Sessions + Bulk + Branding tests | `packages/porta-sdk/tests/domains/sessions.test.ts`, `bulk.test.ts`, `branding.test.ts` |
| 5.4.5 | Implement Exports + TwoFactor + Imports domains | `packages/porta-sdk/src/domains/exports.ts`, `two-factor.ts`, `imports.ts` |
| 5.4.6 | Write Exports + TwoFactor + Imports tests | `packages/porta-sdk/tests/domains/exports.test.ts`, `two-factor.test.ts`, `imports.test.ts` |

**Deliverables**:
- [ ] All remaining 10 domains implemented and tested
- [ ] All 19 domain test files pass

**Verify**: `clear && sleep 3 && cd packages/porta-sdk && yarn test`

---

## Phase 6: Client Factory, Entrypoints & Build Integration

### Session 6.1: Client Factory & Entrypoints

**Reference**: [Technical Spec](03-technical-spec.md) — Sections 8, 9
**Objective**: Create the client factory, all 4 entrypoints, and client tests

**Tasks**:

| # | Task | File |
|---|------|------|
| 6.1.1 | Implement `createPortaClient()` factory | `packages/porta-sdk/src/client.ts` |
| 6.1.2 | Create main entrypoint (re-exports) | `packages/porta-sdk/src/index.ts` |
| 6.1.3 | Create browser entrypoint | `packages/porta-sdk/src/browser.ts` |
| 6.1.4 | Create node entrypoint | `packages/porta-sdk/src/node.ts` |
| 6.1.5 | Create agent entrypoint (placeholder until Phase 7) | `packages/porta-sdk/src/agent.ts` |
| 6.1.6 | Write client factory tests | `packages/porta-sdk/tests/client.test.ts` |

**Deliverables**:
- [ ] `createPortaClient()` returns all 19 domain namespaces
- [ ] All 4 entrypoints compile and export correctly
- [ ] SDK builds successfully (`yarn build`)

**Verify**: `clear && sleep 3 && cd packages/porta-sdk && yarn verify`

---

### Session 6.2: Build Integration

**Reference**: [Technical Spec](03-technical-spec.md) — Section 11
**Objective**: Wire SDK into Docker build and admin-gui dependency, verify root project

**Tasks**:

| # | Task | File |
|---|------|------|
| 6.2.1 | Update Dockerfile — add SDK build stage before admin-gui | `docker/Dockerfile` |
| 6.2.2 | Add `@porta/sdk` file: dependency to admin-gui | `admin-gui/package.json` |
| 6.2.3 | Run `yarn install` in admin-gui to verify resolution | — |
| 6.2.4 | Verify root project `yarn verify` still passes | — |

**Deliverables**:
- [ ] Docker build includes SDK stage
- [ ] Admin-GUI resolves `@porta/sdk`
- [ ] Root `yarn verify` passes (no regressions)

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 7: AI Agent Layer

### Session 7.1: Tool Definitions

**Reference**: [Technical Spec](03-technical-spec.md) — Section 10
**Objective**: Implement ToolDefinition types and getToolDefinitions() for all domain methods

**Tasks**:

| # | Task | File |
|---|------|------|
| 7.1.1 | Create agent types (ToolDefinition, ToolParameter, ToolResult) | `packages/porta-sdk/src/agent/types.ts` |
| 7.1.2 | Implement `getToolDefinitions()` with rich descriptions for all methods | `packages/porta-sdk/src/agent/tool-definitions.ts` |
| 7.1.3 | Write tool definition tests (completeness, structure, no duplicates) | `packages/porta-sdk/tests/agent/tool-definitions.test.ts` |

**Deliverables**:
- [ ] Tool definitions cover ALL domain methods across all 19 namespaces
- [ ] Each definition has description, parameters, returns, sideEffects, prerequisites, relatedTools
- [ ] Tests verify completeness and structure

**Verify**: `clear && sleep 3 && cd packages/porta-sdk && yarn test`

---

### Session 7.2: Tool Executor

**Reference**: [Technical Spec](03-technical-spec.md) — Section 10
**Objective**: Implement executeTool() dispatch and update agent entrypoint

**Tasks**:

| # | Task | File |
|---|------|------|
| 7.2.1 | Implement `executeTool()` with parameter mapping and error handling | `packages/porta-sdk/src/agent/executor.ts` |
| 7.2.2 | Update agent entrypoint with full exports | `packages/porta-sdk/src/agent.ts` |
| 7.2.3 | Write executor tests (dispatch, unknown tools, errors, param mapping) | `packages/porta-sdk/tests/agent/executor.test.ts` |

**Deliverables**:
- [ ] executeTool dispatches to correct domain methods
- [ ] Error handling works (unknown tool, method throws)
- [ ] Agent entrypoint exports everything correctly

**Verify**: `clear && sleep 3 && cd packages/porta-sdk && yarn verify`

---

## Phase 8: Type Compatibility & Final Verification

### Session 8.1: Type Compatibility Tests

**Reference**: [Testing Strategy](07-testing-strategy.md) — Section 8
**Objective**: Create type compatibility tests verifying SDK types stay in sync with server types

**Tasks**:

| # | Task | File |
|---|------|------|
| 8.1.1 | Write type compatibility tests for all entity types (compile-time checks) | `packages/porta-sdk/tests/type-compatibility/types.test.ts` |
| 8.1.2 | Verify all type compatibility tests pass | — |

**Deliverables**:
- [ ] All SDK entity types are structurally compatible with server types
- [ ] Type drift would cause TypeScript compilation failure

**Verify**: `clear && sleep 3 && cd packages/porta-sdk && yarn verify`

---

### Session 8.2: Full Verification & Polish

**Reference**: All plan documents
**Objective**: Full SDK verification, fix any issues, ensure root project still passes

**Tasks**:

| # | Task | File |
|---|------|------|
| 8.2.1 | Run full SDK verify (lint + typecheck + test + build) | — |
| 8.2.2 | Run root project verify (ensure no regressions) | — |
| 8.2.3 | Fix any remaining issues, add missing JSDoc | `packages/porta-sdk/src/**/*.ts` |

**Deliverables**:
- [ ] SDK `yarn verify` passes clean
- [ ] Root `yarn verify` passes clean
- [ ] All exports documented with JSDoc

**Verify**: `clear && sleep 3 && cd packages/porta-sdk && yarn verify && cd ../.. && yarn verify`

---

## Phase 9: Documentation

### Session 9.1: SDK README & Usage Guides

**Reference**: [RD-25](../../requirements/RD-25-porta-sdk.md) — Documentation section
**Objective**: Create SDK README, browser guide, and Node.js guide

**Tasks**:

| # | Task | File |
|---|------|------|
| 9.1.1 | Create SDK README with overview, installation, quick start, examples | `packages/porta-sdk/README.md` |
| 9.1.2 | Create browser usage guide (BFF integration, CSRF, admin-gui pattern) | `docs/guide/sdk-browser.md` |
| 9.1.3 | Create Node.js usage guide (automation, auth providers, examples) | `docs/guide/sdk-node.md` |

**Deliverables**:
- [ ] SDK README covers: overview, install, browser/node/agent quick start
- [ ] Browser guide covers: BFF setup, CSRF, admin-gui integration pattern
- [ ] Node.js guide covers: auth providers, automation examples

**Verify**: N/A (documentation)

---

### Session 9.2: AI Agent Guide & Migration Docs

**Reference**: [RD-25](../../requirements/RD-25-porta-sdk.md) — Documentation section
**Objective**: Create AI agent guide and migration strategy documents

**Tasks**:

| # | Task | File |
|---|------|------|
| 9.2.1 | Create AI agent guide (MCP integration, tool definitions, executeTool, examples) | `docs/guide/sdk-agent.md` |
| 9.2.2 | Create CLI migration guide (strategy for migrating CLI to SDK — future reference) | `docs/guide/sdk-cli-migration.md` |
| 9.2.3 | Create admin-GUI migration guide (strategy for replacing client.ts — future reference) | `docs/guide/sdk-gui-migration.md` |

**Deliverables**:
- [ ] AI agent guide covers: tool definitions, executeTool, MCP pattern, examples
- [ ] Migration guides document the approach for future CLI and admin-GUI migration

**Verify**: N/A (documentation)

---

## Phase 10: Documentation Review & Update

### Session 10.1: Documentation Review & Update

**Reference**: All plan documents + completed implementation
**Objective**: Ensure all documentation reflects the implemented changes

**Tasks**:

| # | Task | File |
|---|------|------|
| 10.1.1 | Review implementation against docs/ coverage checklist | `docs/**/*.md` |
| 10.1.2 | Add/update documentation for new or changed features | `docs/**/*.md` |
| 10.1.3 | Update docs/index.md if new pages were added | `docs/index.md` |
| 10.1.4 | Update .clinerules/project.md if structure/rules changed | `.clinerules/project.md` |

**Deliverables**:
- [ ] All new/changed features are documented
- [ ] No stale or inaccurate documentation remains
- [ ] docs/index.md is up to date
- [ ] .clinerules/project.md reflects current project state (SDK package, workspace)

---

## 🚨 Master Progress Checklist (All Phases) — MANDATORY

> **⚠️ EXECUTION RULE — APPLIES TO EVERY AGENT EXECUTING THIS PLAN:**
>
> This checklist is the **single source of truth** for tracking progress across all phases.
> The executing agent **MUST** follow these rules without exception:
>
> 1. **After completing each task:** Mark it `[x]` with a timestamp — e.g., `- [x] 1.1.1 Task description ✅ (completed: YYYY-MM-DD HH:MM)`
> 2. **After completing each phase:** Review ALL tasks in that phase and confirm every completed task is marked `[x]` with a timestamp
> 3. **Update the Progress header** (`> **Progress**: X/Y tasks (Z%)`) in this document's frontmatter after every update
> 4. **This checklist MUST exist** — if it is missing or incomplete, the agent must reconstruct it from the phase details above before executing any task
> 5. **Never batch updates** — update immediately after each task, not at the end of a session
>
> Failure to maintain this checklist means progress is invisible after crashes, context resets, or session handoffs.

### Phase 1: Package Scaffolding & Core Infrastructure
- [x] 1.1.1 Create packages/porta-sdk/ directory structure ✅ (completed: 2026-05-05 18:10)
- [x] 1.1.2 Create package.json with exports map, scripts, engines ✅ (completed: 2026-05-05 18:10)
- [x] 1.1.3 Create tsconfig.json ✅ (completed: 2026-05-05 18:10)
- [x] 1.1.4 Create vitest.config.ts ✅ (completed: 2026-05-05 18:10)
- [x] 1.1.5 Create src/version.ts with SDK_VERSION constant ✅ (completed: 2026-05-05 18:10)
- [x] 1.1.6 Add workspaces to root package.json ✅ (completed: 2026-05-05 18:11)
- [x] 1.1.7 Run yarn install — verify workspace resolution ✅ (completed: 2026-05-05 18:11)
- [x] 1.2.1 Create transport types (HttpTransport, TransportRequest, TransportResponse) ✅ (completed: 2026-05-05 18:12)
- [x] 1.2.2 Create error hierarchy (PortaError → PortaHttpError → 7 classes + mapResponseToError) ✅ (completed: 2026-05-05 18:12)
- [x] 1.2.3 Create pagination types and listAll helper ✅ (completed: 2026-05-05 18:13)
- [x] 1.2.4 Create domain helpers (unwrapData, unwrapWithEtag, etagHeaders, buildQueryString) ✅ (completed: 2026-05-05 18:13)
- [x] 1.2.5 Create error hierarchy unit tests ✅ (completed: 2026-05-05 18:14)
- [x] 1.2.6 Create pagination unit tests ✅ (completed: 2026-05-05 18:14)

### Phase 2: Transport Implementations
- [x] 2.1.1 Implement createBrowserTransport() ✅ (completed: 2026-05-05 18:25)
- [x] 2.1.2 Write BrowserTransport unit tests (48 tests) ✅ (completed: 2026-05-05 18:27)
- [x] 2.2.1 Implement createNodeTransport() ✅ (completed: 2026-05-05 18:26)
- [x] 2.2.2 Write NodeTransport unit tests (42 tests) ✅ (completed: 2026-05-05 18:29)

### Phase 3: Auth Providers
- [x] 3.1.1 Create AuthProvider interface ✅ (completed: 2026-05-05 18:40)
- [x] 3.1.2 Implement createTokenAuth() ✅ (completed: 2026-05-05 18:40)
- [x] 3.1.3 Implement createClientCredentialsAuth() with concurrent dedup ✅ (completed: 2026-05-05 18:45)
- [x] 3.1.4 Write TokenAuth tests (9 tests) ✅ (completed: 2026-05-05 19:00)
- [x] 3.1.5 Write ClientCredentialsAuth tests (24 tests) ✅ (completed: 2026-05-05 19:00)
- [x] 3.2.1 Implement createCliAuth() ✅ (completed: 2026-05-05 18:50)
- [x] 3.2.2 Write CliAuth tests (33 tests) ✅ (completed: 2026-05-05 19:05)

### Phase 4: Entity Types
- [x] 4.1.1 Define Organization types ✅ (completed: 2026-05-05 19:10)
- [x] 4.1.2 Define Application types ✅ (completed: 2026-05-05 19:10)
- [x] 4.1.3 Define Client types ✅ (completed: 2026-05-05 19:10)
- [x] 4.1.4 Define User types ✅ (completed: 2026-05-05 19:10)
- [x] 4.2.1 Define Role, Permission types ✅ (completed: 2026-05-05 19:12)
- [x] 4.2.2 Define CustomClaim types ✅ (completed: 2026-05-05 19:12)
- [x] 4.2.3 Define Config, Keys, Audit, Stats types ✅ (completed: 2026-05-05 19:12)
- [x] 4.2.4 Define Sessions, Bulk, Branding, Exports types ✅ (completed: 2026-05-05 19:12)
- [x] 4.2.5 Define TwoFactor, Imports types ✅ (completed: 2026-05-05 19:12)
- [x] 4.2.6 Create barrel export for all types ✅ (completed: 2026-05-05 19:12)

### Phase 5: Domain API Layer
- [x] 5.1.1 Implement createOrganizationsDomain() ✅ (completed: 2026-05-05 19:20)
- [x] 5.1.2 Write Organizations domain tests (16 tests) ✅ (completed: 2026-05-05 19:35)
- [x] 5.1.3 Implement createApplicationsDomain() ✅ (completed: 2026-05-05 19:20)
- [x] 5.1.4 Write Applications domain tests (15 tests) ✅ (completed: 2026-05-05 21:07)
- [x] 5.2.1 Implement createClientsDomain() ✅ (completed: 2026-05-05 19:20)
- [x] 5.2.2 Write Clients domain tests (12 tests) ✅ (completed: 2026-05-05 21:03)
- [x] 5.2.3 Implement createUsersDomain() ✅ (completed: 2026-05-05 19:20)
- [x] 5.2.4 Write Users domain tests (11 tests) ✅ (completed: 2026-05-05 19:35)
- [x] 5.3.1 Implement UserRoles + UserClaims domains ✅ (completed: 2026-05-05 19:22)
- [x] 5.3.2 Write UserRoles + UserClaims tests (6 tests) ✅ (completed: 2026-05-05 21:05)
- [x] 5.3.3 Implement Roles + Permissions domains ✅ (completed: 2026-05-05 19:22)
- [x] 5.3.4 Write Roles + Permissions tests (13 tests) ✅ (completed: 2026-05-05 21:05)
- [x] 5.3.5 Implement CustomClaims domain ✅ (completed: 2026-05-05 19:22)
- [x] 5.3.6 Write CustomClaims tests (6 tests) ✅ (completed: 2026-05-05 21:05)
- [x] 5.4.1 Implement Config + Keys + Audit + Stats domains ✅ (completed: 2026-05-05 19:25)
- [x] 5.4.2 Write Config + Keys + Audit + Stats tests (10 tests) ✅ (completed: 2026-05-05 21:07)
- [x] 5.4.3 Implement Sessions + Bulk + Branding domains ✅ (completed: 2026-05-05 19:25)
- [x] 5.4.4 Write Sessions + Bulk + Branding tests (10 tests) ✅ (completed: 2026-05-05 21:07)
- [x] 5.4.5 Implement Exports + TwoFactor + Imports domains ✅ (completed: 2026-05-05 19:25)
- [x] 5.4.6 Write Exports + TwoFactor + Imports tests (6 tests) ✅ (completed: 2026-05-05 21:08)

### Phase 6: Client Factory, Entrypoints & Build Integration
- [x] 6.1.1 Implement createPortaClient() factory ✅ (completed: 2026-05-05 19:28)
- [x] 6.1.2 Create main entrypoint (re-exports) ✅ (completed: 2026-05-05 19:28)
- [x] 6.1.3 Create browser entrypoint ✅ (completed: 2026-05-05 19:28)
- [x] 6.1.4 Create node entrypoint ✅ (completed: 2026-05-05 19:28)
- [x] 6.1.5 Create agent entrypoint ✅ (completed: 2026-05-05 19:28)
- [x] 6.1.6 Write client factory tests (3 tests) ✅ (completed: 2026-05-05 19:35)
- [x] 6.2.1 Update Dockerfile — add SDK build stage ✅ (completed: 2026-05-05 21:15)
- [x] 6.2.2 Add @porta/sdk file: dependency to admin-gui ✅ (completed: 2026-05-05 21:15)
- [x] 6.2.3 Run yarn install in admin-gui to verify resolution ✅ (completed: 2026-05-05 21:16)
- [x] 6.2.4 Verify root project yarn verify still passes (3,660 tests) ✅ (completed: 2026-05-05 21:23)

### Phase 7: AI Agent Layer
- [x] 7.1.1 Create agent types (ToolDefinition, ToolParameter, ToolResult) ✅ (completed: 2026-05-05 19:30)
- [x] 7.1.2 Implement getToolDefinitions() with descriptions for all methods ✅ (completed: 2026-05-05 19:30)
- [x] 7.1.3 Write tool definition tests (11 tests in agent.test.ts) ✅ (completed: 2026-05-05 19:35)
- [x] 7.2.1 Implement executeTool() with parameter mapping ✅ (completed: 2026-05-05 19:30)
- [x] 7.2.2 Update agent entrypoint with full exports ✅ (completed: 2026-05-05 19:30)
- [x] 7.2.3 Write executor tests (in agent.test.ts) ✅ (completed: 2026-05-05 19:35)

### Phase 8: Type Compatibility & Final Verification
- [x] 8.1.1 Write type compatibility tests for all entity types (18 tests, 9 entities) ✅ (completed: 2026-05-05 21:37)
- [x] 8.1.2 Verify all type compatibility tests pass (18/18) ✅ (completed: 2026-05-05 21:37)
- [x] 8.2.1 Run full SDK verify (274 tests passing) ✅ (completed: 2026-05-05 19:36)
- [x] 8.2.2 Run root project verify (3,660 tests passing) ✅ (completed: 2026-05-05 21:23)
- [x] 8.2.3 JSDoc already present on all public exports ✅ (completed: 2026-05-05 21:42)

### Phase 9: Documentation
- [x] 9.1.1 Create SDK documentation page (docs/guide/sdk.md + VitePress sidebar) ✅ (completed: 2026-05-05 19:34)
- [x] 9.1.2 Create SDK README (packages/porta-sdk/README.md) ✅ (completed: 2026-05-05 21:15)
- [x] 9.1.3 Create browser usage guide (docs/guide/sdk-browser.md) ✅ (completed: 2026-05-05 21:39)
- [x] 9.1.4 Create Node.js usage guide (docs/guide/sdk-node.md) ✅ (completed: 2026-05-05 21:40)
- [x] 9.2.1 Create AI agent guide (docs/guide/sdk-agent.md) ✅ (completed: 2026-05-05 21:40)
- [x] 9.2.2 Create CLI migration guide (docs/guide/sdk-cli-migration.md) ✅ (completed: 2026-05-05 21:41)
- [x] 9.2.3 Create admin-GUI migration guide (docs/guide/sdk-gui-migration.md) ✅ (completed: 2026-05-05 21:41)

### Phase 10: Documentation Review & Update
- [x] 10.1.1 Review implementation against docs/ coverage checklist ✅ (completed: 2026-05-05 21:42)
- [x] 10.1.2 Add/update documentation — 6 new guide pages + VitePress sidebar ✅ (completed: 2026-05-05 21:42)
- [x] 10.1.3 Update docs/index.md — added SDK feature card ✅ (completed: 2026-05-05 21:42)
- [x] 10.1.4 Update .clinerules/project.md — SDK package structure added ✅ (completed: 2026-05-05 21:15)

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/porta-sdk/99-execution-plan.md`"
2. Read the relevant technical spec sections

### Ending a Session

1. Run the project's verify command: `clear && sleep 3 && cd packages/porta-sdk && yarn verify`
2. Handle commit per the active commit mode
3. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan porta-sdk` to continue

---

## Dependencies

```
Phase 1 (Scaffolding + Core)
    ↓
Phase 2 (Transports)  ←→  Phase 3 (Auth)  [parallel-capable]
    ↓                        ↓
Phase 4 (Entity Types)  [parallel with 2-3]
    ↓
Phase 5 (Domain APIs)  [depends on 1, 2, 4]
    ↓
Phase 6 (Client + Entrypoints + Build)  [depends on 5]
    ↓
Phase 7 (Agent Layer)  [depends on 6]
    ↓
Phase 8 (Type Compat + Verification)  [depends on 4, 6]
    ↓
Phase 9 (Documentation)  [depends on 8]
    ↓
Phase 10 (Docs Review)  [depends on 9]
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ All verification passing (`yarn verify` in SDK + root)
3. ✅ No warnings/errors
4. ✅ No dead code — no unused parameters, functions, classes, or modules (per `code.md` rule 4)
5. ✅ Security hardened — no secrets in code, auth providers don't log tokens, zero runtime deps (per `code.md` rules 32-34)
6. ✅ Documentation updated
7. ✅ Code reviewed (if applicable)
8. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
