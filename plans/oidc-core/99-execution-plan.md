# Execution Plan: OIDC Provider Core

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-08 15:38
> **Progress**: 24/24 tasks (100%) ✅

## Overview

Implement the OIDC provider core for Porta v5: install `node-oidc-provider`, create PostgreSQL and Redis adapters, implement signing key management, build the system config service, configure the provider with all OIDC features, create multi-tenant issuer resolution, mount the provider on the Koa app, and write comprehensive unit tests.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
|-------|-------|----------|-----------|
| 1 | Dependencies & Config Expansion | 1 | 20 min |
| 2 | System Config Service & Signing Keys | 1 | 35 min |
| 3 | Adapters (PostgreSQL, Redis, Factory) | 1–2 | 40 min |
| 4 | Provider Configuration, Finders & Mounting | 1–2 | 45 min |
| 5 | Unit Tests — Lib & Adapters | 1–2 | 45 min |
| 6 | Unit Tests — OIDC Modules & Middleware | 1–2 | 40 min |

**Total: 5–8 sessions, ~3.5–4 hours**

---

## Phase 1: Dependencies & Config Expansion

### Session 1.1: Install oidc-provider, Update Config Schema

**Reference**: [03-provider-setup.md](03-provider-setup.md)
**Objective**: Install node-oidc-provider, add cookieKeys to config schema, update .env files.

**Tasks**:

| # | Task | File |
|---|------|------|
| 1.1.1 | Install `oidc-provider` as a runtime dependency | `package.json`, `yarn.lock` |
| 1.1.2 | Add `cookieKeys` field to config schema + update config loader | `src/config/schema.ts`, `src/config/index.ts` |
| 1.1.3 | Update `.env` and `.env.example` with `COOKIE_KEYS` | `.env`, `.env.example` |

**Deliverables**:
- [x] `oidc-provider` installed
- [x] Config schema has `cookieKeys` (array of strings, min 16 chars each)
- [x] Config loader maps `COOKIE_KEYS` env var (comma-separated)
- [x] `.env` and `.env.example` have `COOKIE_KEYS` line
- [x] `yarn build` still passes
- [x] Existing tests still pass

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 2: System Config Service & Signing Keys

### Session 2.1: System Config Service

**Reference**: [03-provider-setup.md](03-provider-setup.md)
**Objective**: Create the system config service that reads typed values from the system_config table.

**Tasks**:

| # | Task | File |
|---|------|------|
| 2.1.1 | Create system config service with typed getters and in-memory cache | `src/lib/system-config.ts` |
| 2.1.2 | Create `loadOidcTtlConfig()` function with all TTL keys | `src/lib/system-config.ts` |

**Deliverables**:
- [x] `getSystemConfigNumber`, `getSystemConfigString`, `getSystemConfigBoolean` functions
- [x] `loadOidcTtlConfig()` returns all OIDC TTL settings
- [x] `clearSystemConfigCache()` for testing
- [x] In-memory cache with 60s TTL
- [x] `yarn build` passes

**Verify**: `clear && sleep 3 && yarn build`

### Session 2.2: Signing Key Management

**Reference**: [05-keys-and-crypto.md](05-keys-and-crypto.md)
**Objective**: Create the signing key service with key generation, PEM↔JWK conversion, and auto-bootstrap.

**Tasks**:

| # | Task | File |
|---|------|------|
| 2.2.1 | Create `generateES256KeyPair()` and `pemToJwk()` functions | `src/lib/signing-keys.ts` |
| 2.2.2 | Create `loadSigningKeysFromDb()` and `signingKeysToJwks()` functions | `src/lib/signing-keys.ts` |
| 2.2.3 | Create `ensureSigningKeys()` auto-bootstrap function | `src/lib/signing-keys.ts` |

**Deliverables**:
- [x] ES256 key generation (PEM format)
- [x] PEM → JWK conversion with kid, use, alg fields
- [x] DB loading with active/retired filtering
- [x] Auto-bootstrap: generates + inserts key if none exist
- [x] `yarn build` passes

**Verify**: `clear && sleep 3 && yarn build`

---

## Phase 3: Adapters (PostgreSQL, Redis, Factory)

### Session 3.1: PostgreSQL Adapter

**Reference**: [04-adapters.md](04-adapters.md)
**Objective**: Implement the PostgreSQL adapter for node-oidc-provider using the oidc_payloads table.

**Tasks**:

| # | Task | File |
|---|------|------|
| 3.1.1 | Create PostgresAdapter class with all 7 adapter methods | `src/oidc/postgres-adapter.ts` |

**Deliverables**:
- [x] `upsert`, `find`, `findByUserCode`, `findByUid`, `consume`, `destroy`, `revokeByGrantId`
- [x] Parameterized SQL queries (no injection risk)
- [x] Expired artifact filtering
- [x] consumed_at → consumed field merging
- [x] `yarn build` passes

**Verify**: `clear && sleep 3 && yarn build`

### Session 3.2: Redis Adapter & Factory

**Reference**: [04-adapters.md](04-adapters.md)
**Objective**: Implement the Redis adapter and the hybrid adapter factory.

**Tasks**:

| # | Task | File |
|---|------|------|
| 3.2.1 | Create RedisAdapter class with all 7 adapter methods | `src/oidc/redis-adapter.ts` |
| 3.2.2 | Create hybrid adapter factory with model routing | `src/oidc/adapter-factory.ts` |

**Deliverables**:
- [x] Redis adapter with key prefixes and TTL
- [x] Index keys for uid, userCode, grantId lookups
- [x] Hybrid adapter factory routing Redis models vs Postgres models
- [x] `yarn build` passes

**Verify**: `clear && sleep 3 && yarn build`

---

## Phase 4: Provider Configuration, Finders & Mounting

### Session 4.1: Configuration Builder & Finders

**Reference**: [03-provider-setup.md](03-provider-setup.md), [06-tenant-and-mounting.md](06-tenant-and-mounting.md)
**Objective**: Create the provider configuration builder, client finder stub, and account finder stub.

**Tasks**:

| # | Task | File |
|---|------|------|
| 4.1.1 | Create provider configuration builder function | `src/oidc/configuration.ts` |
| 4.1.2 | Create client finder stub (DB lookup for client metadata) | `src/oidc/client-finder.ts` |
| 4.1.3 | Create account finder stub (minimal user lookup) | `src/oidc/account-finder.ts` |
| 4.1.4 | Create CORS handler for OIDC endpoints | `src/middleware/oidc-cors.ts` |

**Deliverables**:
- [x] `buildProviderConfiguration()` returns complete config object
- [x] Client finder queries clients table, maps to OIDC metadata
- [x] Account finder queries users table, returns claims
- [x] CORS handler checks client allowed_origins
- [x] `yarn build` passes

**Verify**: `clear && sleep 3 && yarn build`

### Session 4.2: Provider Factory, Tenant Resolver & Koa Mounting

**Reference**: [06-tenant-and-mounting.md](06-tenant-and-mounting.md)
**Objective**: Create the OIDC provider factory, tenant resolver middleware, and mount everything on the Koa app.

**Tasks**:

| # | Task | File |
|---|------|------|
| 4.2.1 | Create tenant resolver middleware | `src/middleware/tenant-resolver.ts` |
| 4.2.2 | Create OIDC provider factory | `src/oidc/provider.ts` |
| 4.2.3 | Update `createApp()` to accept and mount OIDC provider | `src/server.ts` |
| 4.2.4 | Update entry point with signing key loading + provider initialization | `src/index.ts` |

**Deliverables**:
- [x] Tenant resolver validates org slug, sets ctx.state
- [x] Provider factory creates configured Provider instance
- [x] `createApp()` mounts provider under `/:orgSlug` with URL rewriting
- [x] Entry point: DB → Redis → keys → TTLs → provider → server
- [x] Health endpoint still works at `/health`
- [x] `yarn build` passes

**Verify**: `clear && sleep 3 && yarn build`

---

## Phase 5: Unit Tests — Lib & Adapters

### Session 5.1: System Config & Signing Key Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Write unit tests for the system config service and signing key management.

**Tasks**:

| # | Task | File |
|---|------|------|
| 5.1.1 | Write unit tests for system config service (typed getters, cache, TTL loading) | `tests/unit/lib/system-config.test.ts` |
| 5.1.2 | Write unit tests for signing keys (generate, PEM↔JWK, load, ensure) | `tests/unit/lib/signing-keys.test.ts` |

**Deliverables**:
- [x] 18 tests for system config service
- [x] 14 tests for signing keys
- [x] All tests pass
- [x] `yarn verify` passes

**Verify**: `clear && sleep 3 && yarn verify`

### Session 5.2: Adapter & Factory Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Write unit tests for PostgreSQL adapter, Redis adapter, and adapter factory.

**Tasks**:

| # | Task | File |
|---|------|------|
| 5.2.1 | Write unit tests for PostgreSQL adapter | `tests/unit/oidc/postgres-adapter.test.ts` |
| 5.2.2 | Write unit tests for Redis adapter | `tests/unit/oidc/redis-adapter.test.ts` |
| 5.2.3 | Write unit tests for adapter factory routing | `tests/unit/oidc/adapter-factory.test.ts` |

**Deliverables**:
- [x] 13 tests for PostgreSQL adapter
- [x] 17 tests for Redis adapter
- [x] 13 tests for adapter factory
- [x] All tests pass
- [x] `yarn verify` passes

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 6: Unit Tests — OIDC Modules & Middleware

### Session 6.1: Configuration, Finders, CORS & Tenant Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Write unit tests for configuration builder, client finder, account finder, CORS handler, tenant resolver, and update config tests.

**Tasks**:

| # | Task | File |
|---|------|------|
| 6.1.1 | Write unit tests for configuration builder | `tests/unit/oidc/configuration.test.ts` |
| 6.1.2 | Write unit tests for client finder and account finder | `tests/unit/oidc/client-finder.test.ts`, `tests/unit/oidc/account-finder.test.ts` |
| 6.1.3 | Write unit tests for CORS handler | `tests/unit/oidc/oidc-cors.test.ts` |
| 6.1.4 | Write unit tests for tenant resolver middleware | `tests/unit/middleware/tenant-resolver.test.ts` |
| 6.1.5 | Update existing config tests for cookieKeys validation | `tests/unit/config.test.ts` |

**Deliverables**:
- [x] 12 tests for configuration builder
- [x] 9 tests for client/account finders
- [x] 5 tests for CORS handler
- [x] 6 tests for tenant resolver
- [x] 3 tests added to config.test.ts for cookieKeys
- [x] All tests pass
- [x] `yarn verify` passes (lint + build + 227 tests)

**Verify**: `clear && sleep 3 && yarn verify`

---

## Task Checklist (All Phases)

### Phase 1: Dependencies & Config Expansion
- [x] 1.1.1 Install `oidc-provider` dependency ✅ (completed: 2026-04-08 15:21)
- [x] 1.1.2 Add `cookieKeys` to config schema + loader ✅ (completed: 2026-04-08 15:22)
- [x] 1.1.3 Update `.env` and `.env.example` with `COOKIE_KEYS` ✅ (completed: 2026-04-08 15:22)

### Phase 2: System Config Service & Signing Keys
- [x] 2.1.1 Create system config service with typed getters and cache ✅ (completed: 2026-04-08 15:24)
- [x] 2.1.2 Create `loadOidcTtlConfig()` function ✅ (completed: 2026-04-08 15:24)
- [x] 2.2.1 Create `generateES256KeyPair()` and `pemToJwk()` ✅ (completed: 2026-04-08 15:24)
- [x] 2.2.2 Create `loadSigningKeysFromDb()` and `signingKeysToJwks()` ✅ (completed: 2026-04-08 15:24)
- [x] 2.2.3 Create `ensureSigningKeys()` auto-bootstrap ✅ (completed: 2026-04-08 15:24)

### Phase 3: Adapters (PostgreSQL, Redis, Factory)
- [x] 3.1.1 Create PostgresAdapter with all 7 methods ✅ (completed: 2026-04-08 15:27)
- [x] 3.2.1 Create RedisAdapter with all 7 methods ✅ (completed: 2026-04-08 15:27)
- [x] 3.2.2 Create hybrid adapter factory ✅ (completed: 2026-04-08 15:27)

### Phase 4: Provider Configuration, Finders & Mounting
- [x] 4.1.1 Create provider configuration builder ✅ (completed: 2026-04-08 15:31)
- [x] 4.1.2 Create client finder stub ✅ (completed: 2026-04-08 15:31)
- [x] 4.1.3 Create account finder stub ✅ (completed: 2026-04-08 15:31)
- [x] 4.1.4 Create CORS handler ✅ (completed: 2026-04-08 15:31)
- [x] 4.2.1 Create tenant resolver middleware ✅ (completed: 2026-04-08 15:31)
- [x] 4.2.2 Create OIDC provider factory ✅ (completed: 2026-04-08 15:31)
- [x] 4.2.3 Update `createApp()` to mount OIDC provider ✅ (completed: 2026-04-08 15:31)
- [x] 4.2.4 Update entry point with provider initialization ✅ (completed: 2026-04-08 15:31)

### Phase 5: Unit Tests — Lib & Adapters
- [x] 5.1.1 Write unit tests for system config service ✅ (completed: 2026-04-08 15:38)
- [x] 5.1.2 Write unit tests for signing keys ✅ (completed: 2026-04-08 15:38)
- [x] 5.2.1 Write unit tests for PostgreSQL adapter ✅ (completed: 2026-04-08 15:38)
- [x] 5.2.2 Write unit tests for Redis adapter ✅ (completed: 2026-04-08 15:38)
- [x] 5.2.3 Write unit tests for adapter factory ✅ (completed: 2026-04-08 15:38)

### Phase 6: Unit Tests — OIDC Modules & Middleware
- [x] 6.1.1 Write unit tests for configuration builder ✅ (completed: 2026-04-08 15:38)
- [x] 6.1.2 Write unit tests for client finder and account finder ✅ (completed: 2026-04-08 15:38)
- [x] 6.1.3 Write unit tests for CORS handler ✅ (completed: 2026-04-08 15:38)
- [x] 6.1.4 Write unit tests for tenant resolver ✅ (completed: 2026-04-08 15:38)
- [x] 6.1.5 Update config tests for cookieKeys ✅ (completed: 2026-04-08 15:38)

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/oidc-core/99-execution-plan.md`"
2. Read the referenced technical spec document(s) for the session

### Ending a Session

1. Run the project's verify command: `clear && sleep 3 && yarn verify`
2. Handle commit per the active **commit mode** (see `make_plan.md`)
3. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with `[x]`
3. Start new conversation for next session
4. Run `exec_plan oidc-core` to continue

---

## Dependencies

```
Phase 1 (Dependencies & Config)
    ↓
Phase 2 (System Config & Signing Keys)
    ↓
Phase 3 (Adapters)
    ↓
Phase 4 (Configuration, Finders & Mounting)
    ↓
Phase 5 (Tests — Lib & Adapters)
    ↓
Phase 6 (Tests — OIDC & Middleware)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ `node-oidc-provider` installed and configured
3. ✅ PostgreSQL adapter stores/retrieves OIDC payloads
4. ✅ Redis adapter stores/retrieves short-lived artifacts
5. ✅ Hybrid adapter factory routes by model name
6. ✅ ES256 signing keys generated, loaded, converted to JWK
7. ✅ System config service reads TTLs from database
8. ✅ Provider mounted on Koa under `/:orgSlug` with tenant resolution
9. ✅ Health endpoint still works at `/health`
10. ✅ `yarn verify` passes (lint + build + all tests)
11. ✅ No warnings/errors
12. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
