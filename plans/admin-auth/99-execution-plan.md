# Execution Plan: Admin API Authentication

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-20 14:19
> **Progress**: 29/42 tasks (69%)

## Overview

Secure the Admin API with OIDC self-authentication (JWT validation using Porta's own ES256 keys), implement `porta init` bootstrap command, add CLI authentication (Auth Code + PKCE), and migrate all CLI commands from direct-DB to authenticated HTTP.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
|-------|-------|----------|-----------|
| 1 | Bootstrap (`porta init`) | 2 | ~3 hours |
| 2 | Admin Auth Middleware | 2 | ~3 hours |
| 3 | CLI Authentication | 2 | ~3 hours |
| 4 | CLI HTTP Migration | 3-4 | ~6 hours |
| 5 | Test Infrastructure & Updates | 2-3 | ~4 hours |
| 6 | Cleanup & Documentation | 1 | ~1 hour |

**Total: ~12-14 sessions, ~20 hours**

---

## Phase 1: Bootstrap (`porta init`)

### Session 1.1: Init Command — Core Implementation

**Reference**: [03-bootstrap-init.md](03-bootstrap-init.md)
**Objective**: Create `porta init` command that bootstraps admin org, app, client, role, permissions, and first admin user.

**Tasks**:

| # | Task | File |
|---|------|------|
| 1.1.1 | Add `jose` and `open` npm dependencies | `package.json` |
| 1.1.2 | Create `findSuperAdminOrganization()` repository function with in-memory cache | `src/organizations/repository.ts` |
| 1.1.3 | Create init command with safety guard, admin app, permissions, role, client, and user creation | `src/cli/commands/init.ts` |
| 1.1.4 | Register init command in CLI index | `src/cli/index.ts` |
| 1.1.5 | Add interactive prompts for admin user (email, name, password) with non-interactive flag support | `src/cli/commands/init.ts` |

**Deliverables**:
- [x] `porta init` creates all required entities on clean database
- [x] `porta init` refuses when already initialized (safety guard)
- [x] Non-interactive mode works with all flags
- [x] All verification passing
- **Commits**: `05cb584` (core impl), `660b8a4` (register + prompt module)

**Verify**: `clear && sleep 3 && yarn verify`

### Session 1.2: Init Command — Tests ✅

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Unit and integration tests for the init command.

**Tasks**:

| # | Task | File | Status |
|---|------|------|--------|
| 1.2.1 | Unit tests for init command logic (mocked services) — 8 tests | `tests/unit/cli/commands/init.test.ts` | ✅ `660b8a4` |
| 1.2.2 | Unit tests for findSuperAdminOrganization — 5 tests | `tests/unit/organizations/super-admin-lookup.test.ts` | ✅ `84f8e69` |
| 1.2.3 | Integration test: full init flow, safety guard, cache-vs-DB — 3 tests | `tests/integration/cli/init.test.ts` | ✅ `84f8e69` |

**Deliverables**:
- [x] All init unit tests pass (13 tests across 2 files)
- [x] All init integration tests pass (3 tests)
- [x] All verification passing (124 files, 2205 tests, 0 failures)
- **Commit**: `84f8e69`
- **Note**: Also fixed init command to handle `createUser` returning 'active' status (conditional `reactivateUser`)

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 2: Admin Auth Middleware

### Session 2.1: JWT Validation Middleware

**Reference**: [04-admin-auth-middleware.md](04-admin-auth-middleware.md)
**Objective**: Create Bearer token JWT validation + RBAC middleware. Replace `requireSuperAdmin()` on all admin routes.

**Tasks**:

| # | Task | File |
|---|------|------|
| 2.1.1 | Create admin auth middleware with JWT validation, user lookup, org check, role check | `src/middleware/admin-auth.ts` |
| 2.1.2 | Delete old `requireSuperAdmin()` middleware | `src/middleware/super-admin.ts` |
| 2.1.3 | Update all 8 admin route files: swap `requireSuperAdmin` → `requireAdminAuth` import | `src/routes/*.ts` |
| 2.1.4 | Add Koa state type augmentation for `adminUser` | `src/middleware/admin-auth.ts` |
| 2.1.5 | Create unauthenticated admin metadata endpoint (`GET /api/admin/metadata`) | `src/server.ts` or new route file |

**Deliverables**:
- [x] Admin API returns 401 without token
- [x] Admin API returns 403 for non-admin tokens
- [x] Admin API returns 200 for admin tokens
- [x] `ctx.state.adminUser` populated for downstream handlers
- [x] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`
**Status**: ✅ COMPLETE — committed as `35f6478`

### Session 2.2: Admin Auth Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Comprehensive tests for admin auth middleware.

**Tasks**:

| # | Task | File |
|---|------|------|
| 2.2.1 | ~~Create test helper: `generateAdminToken()`~~ | Inlined in test file using real jose signing |
| 2.2.2 | ~~Create test helper: `setupAdminAuth()`~~ | Deferred to integration test phase |
| 2.2.3 | Unit tests for admin auth middleware (14 test cases) | `tests/unit/middleware/admin-auth.test.ts` |
| 2.2.4 | Integration tests for admin auth middleware with real JWT | `tests/integration/middleware/admin-auth.test.ts` (deferred) |

**Deliverables**:
- [x] All middleware unit tests pass (14 tests)
- [ ] All middleware integration tests pass (deferred — needs running server)
- [x] All verification passing (124 files, 2214 tests)

**Verify**: `clear && sleep 3 && yarn verify`
**Status**: ✅ COMPLETE — committed as `b03d8d7`

---

## Phase 3: CLI Authentication

### Session 3.1: Token Store & Login/Logout/Whoami

**Reference**: [05-cli-authentication.md](05-cli-authentication.md)
**Objective**: Implement token storage, PKCE login flow, logout, and whoami commands.

**Tasks**:

| # | Task | File |
|---|------|------|
| 3.1.1 | Create token store (read, write, clear, expiry check, refresh) | `src/cli/token-store.ts` |
| 3.1.2 | Create login command with PKCE flow, localhost callback, browser open | `src/cli/commands/login.ts` |
| 3.1.3 | Create logout command | `src/cli/commands/logout.ts` |
| 3.1.4 | Create whoami command | `src/cli/commands/whoami.ts` |
| 3.1.5 | Register login, logout, whoami in CLI index | `src/cli/index.ts` |

**Deliverables**:
- [x] `porta login` opens browser and completes OIDC flow
- [x] Tokens stored in `~/.porta/credentials.json` with 0600 perms
- [x] `porta logout` clears stored tokens
- [x] `porta whoami` displays identity
- [x] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`
**Status**: ✅ COMPLETE — committed as `74b0fc2`

### Session 3.2: CLI Auth Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Tests for token store and auth commands.

**Tasks**:

| # | Task | File |
|---|------|------|
| 3.2.1 | Unit tests for token store (20 test cases) | `tests/unit/cli/token-store.test.ts` |
| 3.2.2 | Unit tests for login/logout/whoami commands (9 test cases) | `tests/unit/cli/commands/auth.test.ts` |
| 3.2.3 | Unit tests for PKCE generation (9 test cases) | `tests/unit/cli/pkce.test.ts` |

**Deliverables**:
- [x] All token store unit tests pass (20 tests)
- [x] All auth command unit tests pass (9 tests)
- [x] All PKCE unit tests pass (9 tests)
- [x] All verification passing (127 files, 2252 tests, 0 failures)

**Verify**: `clear && sleep 3 && yarn verify`
**Status**: ✅ COMPLETE — committed as `74b0fc2`

---

## Phase 4: CLI HTTP Migration

### Session 4.1: HTTP Client & Bootstrap Split

**Reference**: [06-cli-http-migration.md](06-cli-http-migration.md)
**Objective**: Create authenticated HTTP client and split CLI bootstrap into direct-DB and HTTP modes.

**Tasks**:

| # | Task | File |
|---|------|------|
| 4.1.1 | ✅ Create HTTP client with auth, refresh, error mapping | `src/cli/http-client.ts` |
| 4.1.2 | ✅ Split bootstrap into `withBootstrap()` (direct-DB) and `withHttpClient()` (HTTP) | `src/cli/bootstrap.ts` |
| 4.1.3 | ✅ Update error handler for HTTP errors | `src/cli/error-handler.ts` |
| 4.1.4 | ✅ Unit tests for HTTP client (36 test cases) | `tests/unit/cli/http-client.test.ts` |

**Deliverables**:
- [x] HTTP client sends authenticated requests
- [x] Auto-refresh works transparently
- [x] Error mapping produces CLI-friendly messages
- [x] All verification passing (2,288 tests, 128 files)
- **Commit**: `5802503`

**Verify**: `clear && sleep 3 && yarn verify`

### Session 4.2: Migrate Core Domain Commands (Org, App, Client, User)

**Reference**: [06-cli-http-migration.md](06-cli-http-migration.md)
**Objective**: Rewrite the four main CLI command files to use HTTP client.

**Tasks**:

| # | Task | File |
|---|------|------|
| 4.2.1 | Migrate org command (create, list, show, update, suspend, activate, archive, restore, branding) | `src/cli/commands/org.ts` |
| 4.2.2 | Migrate app command (create, list, show, update, archive) | `src/cli/commands/app.ts` |
| 4.2.3 | Migrate client command (create, list, show, update, revoke) | `src/cli/commands/client.ts` |
| 4.2.4 | Migrate user command (create, invite, list, show, update, status transitions, set-password) | `src/cli/commands/user.ts` |

**Deliverables**:
- [ ] All four core commands work via HTTP
- [ ] Same CLI interface (args, flags, output)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 4.3: Migrate Supporting Commands

**Reference**: [06-cli-http-migration.md](06-cli-http-migration.md)
**Objective**: Rewrite remaining command files and create new admin API routes for config/keys/audit.

**Tasks**:

| # | Task | File |
|---|------|------|
| 4.3.1 | Migrate app-module, app-role, app-permission, app-claim commands | `src/cli/commands/app-*.ts` |
| 4.3.2 | Migrate client-secret command | `src/cli/commands/client-secret.ts` |
| 4.3.3 | Migrate user-role, user-claim, user-2fa commands | `src/cli/commands/user-*.ts` |
| 4.3.4 | Migrate health command (simple GET /health, no auth) | `src/cli/commands/health.ts` |
| 4.3.5 | Create admin API routes for config, keys, audit + migrate CLI commands | `src/routes/config.ts`, `src/routes/keys.ts`, `src/routes/audit.ts`, CLI commands |

**Deliverables**:
- [ ] All supporting commands work via HTTP
- [ ] New config/keys/audit API endpoints created and secured
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 5: Test Infrastructure & Updates

### Session 5.1: Update Admin Route Integration Tests

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Add Bearer token to all existing admin route integration tests.

**Tasks**:

| # | Task | File |
|---|------|------|
| 5.1.1 | Update organization integration tests with Bearer token | `tests/integration/routes/organizations.test.ts` |
| 5.1.2 | Update application integration tests with Bearer token | `tests/integration/routes/applications.test.ts` |
| 5.1.3 | Update client integration tests with Bearer token | `tests/integration/routes/clients.test.ts` |
| 5.1.4 | Update user integration tests with Bearer token | `tests/integration/routes/users.test.ts` |
| 5.1.5 | Update RBAC + claims integration tests with Bearer token | `tests/integration/routes/roles.test.ts`, `permissions.test.ts`, `user-roles.test.ts`, `custom-claims.test.ts` |

**Deliverables**:
- [ ] All admin route integration tests pass with auth
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

### Session 5.2: CLI Command Tests & Pentest Updates

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Rewrite CLI unit tests for HTTP mode and update pentests.

**Tasks**:

| # | Task | File |
|---|------|------|
| 5.2.1 | Rewrite CLI command unit tests (mock HTTP client) for core commands | `tests/unit/cli/commands/org.test.ts`, `app.test.ts`, `client.test.ts`, `user.test.ts` |
| 5.2.2 | Rewrite CLI command unit tests for supporting commands | `tests/unit/cli/commands/app-*.test.ts`, `client-secret.test.ts`, `user-*.test.ts` |
| 5.2.3 | Update admin pentest tests for new auth mechanism | `tests/pentest/admin/**` |

**Deliverables**:
- [ ] All CLI unit tests pass (HTTP mocks)
- [ ] Pentest tests updated and passing
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 6: Cleanup & Documentation

### Session 6.1: Final Cleanup

**Objective**: Archive old files, update documentation, verify everything works.

**Tasks**:

| # | Task | File |
|---|------|------|
| 6.1.1 | Remove old super-admin middleware and any leftover direct-DB references in CLI | Various |
| 6.1.2 | Update README, .env.example with new bootstrap instructions | `README.md`, `.env.example` |
| 6.1.3 | Update `.clinerules/project.md` with new CLI architecture and commands | `.clinerules/project.md` |
| 6.1.4 | Final full verification: `yarn verify` + manual smoke test | All |

**Deliverables**:
- [ ] No dead code or unused imports
- [ ] Documentation reflects new architecture
- [ ] All verification passing
- [ ] Manual smoke test: init → login → org create → whoami → logout

**Verify**: `clear && sleep 3 && yarn verify`

---

## Task Checklist (All Phases)

### Phase 1: Bootstrap (`porta init`)
- [x] 1.1.1 Add jose and open npm dependencies ✅ (completed: 2026-04-20 12:11)
- [x] 1.1.2 findSuperAdminOrganization() already exists in repository — used directly ✅ (completed: 2026-04-20 12:12)
- [x] 1.1.3 Create init command core logic ✅ (completed: 2026-04-20 12:13)
- [x] 1.1.4 Register init command in CLI index ✅ (completed: 2026-04-20 12:14)
- [x] 1.1.5 Add interactive prompts + non-interactive flag support ✅ (completed: 2026-04-20 12:12)
- [x] 1.2.1 Unit tests for init command ✅ (completed: 2026-04-20 12:20 — 8 tests)
- [x] 1.2.2 Unit tests for findSuperAdminOrganization ✅ (completed: 2026-04-20 13:10 — 5 tests)
- [x] 1.2.3 Integration tests for init flow ✅ (completed: 2026-04-20 13:10 — 3 tests)

### Phase 2: Admin Auth Middleware
- [x] 2.1.1 Create admin auth middleware (JWT + user + org + role) ✅ (committed: 35f6478)
- [x] 2.1.2 Delete old requireSuperAdmin() middleware ✅ (committed: 35f6478)
- [x] 2.1.3 Update all 8 route files: swap middleware import ✅ (committed: 35f6478)
- [x] 2.1.4 Add Koa state type augmentation ✅ (committed: 35f6478)
- [x] 2.1.5 Create admin metadata endpoint ✅ (committed: 35f6478)
- [x] 2.2.1 ~~Create generateAdminToken() test helper~~ — inlined in test using jose ✅
- [x] 2.2.2 ~~Create setupAdminAuth() integration test helper~~ — deferred
- [x] 2.2.3 Unit tests for admin auth middleware (14 cases) ✅ (committed: b03d8d7)
- [ ] 2.2.4 Integration tests for admin auth middleware (deferred)

### Phase 3: CLI Authentication
- [x] 3.1.1 Create token store module ✅ (committed: 74b0fc2)
- [x] 3.1.2 Create login command (PKCE + browser + callback) ✅ (committed: 74b0fc2)
- [x] 3.1.3 Create logout command ✅ (committed: 74b0fc2)
- [x] 3.1.4 Create whoami command ✅ (committed: 74b0fc2)
- [x] 3.1.5 Register auth commands in CLI index ✅ (committed: 74b0fc2)
- [x] 3.2.1 Unit tests for token store (20 tests) ✅ (committed: 74b0fc2)
- [x] 3.2.2 Unit tests for login/logout/whoami (9 tests) ✅ (committed: 74b0fc2)
- [x] 3.2.3 Unit tests for PKCE generation (9 tests) ✅ (committed: 74b0fc2)

### Phase 4: CLI HTTP Migration
- [x] 4.1.1 Create HTTP client ✅ (committed: 5802503)
- [x] 4.1.2 Split bootstrap module (direct-DB + HTTP) ✅ (committed: 5802503)
- [x] 4.1.3 Update error handler for HTTP errors ✅ (committed: 5802503)
- [x] 4.1.4 Unit tests for HTTP client (36 tests) ✅ (committed: 5802503)
- [ ] 4.2.1 Migrate org command to HTTP
- [ ] 4.2.2 Migrate app command to HTTP
- [ ] 4.2.3 Migrate client command to HTTP
- [ ] 4.2.4 Migrate user command to HTTP
- [ ] 4.3.1 Migrate app-module, app-role, app-permission, app-claim
- [ ] 4.3.2 Migrate client-secret command
- [ ] 4.3.3 Migrate user-role, user-claim, user-2fa commands
- [ ] 4.3.4 Migrate health command
- [ ] 4.3.5 Create config/keys/audit API routes + migrate CLI commands

### Phase 5: Test Infrastructure & Updates
- [ ] 5.1.1 Update organization integration tests
- [ ] 5.1.2 Update application integration tests
- [ ] 5.1.3 Update client integration tests
- [ ] 5.1.4 Update user integration tests
- [ ] 5.1.5 Update RBAC + claims integration tests
- [ ] 5.2.1 Rewrite core CLI command unit tests
- [ ] 5.2.2 Rewrite supporting CLI command unit tests
- [ ] 5.2.3 Update admin pentest tests

### Phase 6: Cleanup & Documentation
- [ ] 6.1.1 Remove old super-admin middleware and leftover references
- [ ] 6.1.2 Update README and .env.example
- [ ] 6.1.3 Update .clinerules/project.md
- [ ] 6.1.4 Final verification and smoke test

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/admin-auth/99-execution-plan.md`"

### Ending a Session

1. Run the project's verify command: `clear && sleep 3 && yarn verify`
2. Handle commit per the active commit mode (see make_plan.md)
3. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan admin-auth` to continue

---

## Dependencies

```
Phase 1 (Bootstrap)
    ↓
Phase 2 (Auth Middleware)
    ↓
Phase 3 (CLI Auth)
    ↓
Phase 4 (CLI HTTP Migration)
    ↓
Phase 5 (Test Updates)
    ↓
Phase 6 (Cleanup)
```

All phases are sequential — each depends on the previous.

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ All verification passing (`yarn verify`)
3. ✅ No warnings/errors
4. ✅ Documentation updated
5. ✅ Manual smoke test: `porta init` → `porta login` → `porta org create` → `porta whoami` → `porta logout`
6. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
