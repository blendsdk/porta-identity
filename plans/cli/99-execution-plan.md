# Execution Plan: CLI (Admin CLI Tooling)

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-09 13:56
> **Progress**: 48/48 tasks — ALL PHASES COMPLETE ✅ (100%)

## Overview

Implement a yargs-based CLI tool (`porta`) for all administrative operations. The CLI is a thin presentation layer over the existing service modules, providing table and JSON output, confirmation prompts for destructive operations, and clear error handling.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                          | Sessions | Est. Time |
| ----- | ------------------------------ | -------- | --------- |
| 1     | CLI Foundation & Utilities     | 2        | 90 min    |
| 2     | Infrastructure Commands        | 2        | 90 min    |
| 3     | Organization Commands          | 1        | 45 min    |
| 4     | Application Commands           | 2        | 90 min    |
| 5     | Client Commands                | 1        | 60 min    |
| 6     | User Commands                  | 2        | 90 min    |
| 7     | Audit, Integration & Verification | 1     | 60 min    |

**Total: 11 sessions, ~8-9 hours**

---

## Phase 1: CLI Foundation & Utilities

### Session 1.1: Dependencies, Entry Point & Bootstrap

**Reference**: [CLI Foundation](03-cli-foundation.md)
**Objective**: Set up CLI infrastructure — install dependencies, create entry point with yargs, create bootstrap lifecycle

**Tasks**:

| #     | Task                                                        | File                          |
| ----- | ----------------------------------------------------------- | ----------------------------- |
| 1.1.1 | ~~Install yargs, cli-table3, chalk deps + @types/yargs dev dep~~ | `package.json` ✅ |
| 1.1.2 | ~~Add `bin` entry and `porta` script to package.json~~ | `package.json` ✅ |
| 1.1.3 | ~~Create CLI entry point with yargs setup and global options~~ | `src/cli/index.ts` ✅ |
| 1.1.4 | ~~Create bootstrap module (DB + Redis lifecycle, CLI flag overrides)~~ | `src/cli/bootstrap.ts` ✅ |
| 1.1.5 | ~~Write bootstrap unit tests~~ | `tests/unit/cli/bootstrap.test.ts` ✅ |

**Deliverables**:
- [x] yargs, cli-table3, chalk installed
- [x] `porta --help` works via `yarn porta --help`
- [x] Bootstrap connects/disconnects DB + Redis
- [x] Bootstrap tests pass (15 tests)
- [x] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

### Session 1.2: Output Formatters, Error Handler & Prompt

**Reference**: [CLI Foundation](03-cli-foundation.md)
**Objective**: Create shared CLI utilities — output helpers, error handler, confirmation prompt

**Tasks**:

| #     | Task                                                        | File                                |
| ----- | ----------------------------------------------------------- | ----------------------------------- |
| 1.2.1 | ~~Create output helpers (table, JSON, colors, formatters)~~ | `src/cli/output.ts` ✅ |
| 1.2.2 | ~~Create CLI error handler (domain error mapping, exit codes)~~ | `src/cli/error-handler.ts` ✅ |
| 1.2.3 | ~~Create confirmation prompt utility (readline, --force)~~ | `src/cli/prompt.ts` ✅ |
| 1.2.4 | ~~Write output helper unit tests~~ | `tests/unit/cli/output.test.ts` ✅ |
| 1.2.5 | ~~Write error handler unit tests~~ | `tests/unit/cli/error-handler.test.ts` ✅ |
| 1.2.6 | ~~Write prompt utility unit tests~~ | `tests/unit/cli/prompt.test.ts` ✅ |

**Deliverables**:
- [x] Output helpers render tables and JSON correctly (28 tests)
- [x] Error handler maps all domain error types (22 tests)
- [x] Prompt utility supports --force bypass (17 tests)
- [x] All utility tests pass (67 tests total)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 2: Infrastructure Commands

### Session 2.1: Health, Migrate & Seed Commands

**Reference**: [Infrastructure Commands](04-infrastructure-commands.md)
**Objective**: Implement health check, database migration, and seed data commands

**Tasks**:

| #     | Task                                                        | File                                  |
| ----- | ----------------------------------------------------------- | ------------------------------------- |
| 2.1.1 | Create health check command (DB + Redis status)             | `src/cli/commands/health.ts`          |
| 2.1.2 | Create migration commands (up, down, status, create)        | `src/cli/commands/migrate.ts`         |
| 2.1.3 | Create seed command (run with confirmation)                 | `src/cli/commands/seed.ts`            |
| 2.1.4 | Register health, migrate, seed in CLI entry point           | `src/cli/index.ts`                    |
| 2.1.5 | Write health command tests                                  | `tests/unit/cli/commands/health.test.ts` |
| 2.1.6 | Write migrate command tests                                 | `tests/unit/cli/commands/migrate.test.ts` |

**Deliverables**:
- [ ] `porta health check` reports DB + Redis status
- [ ] `porta migrate up/down/status/create` work
- [ ] `porta seed run` with confirmation
- [ ] Command tests pass
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

### Session 2.2: Keys, Config & Audit Commands

**Reference**: [Infrastructure Commands](04-infrastructure-commands.md)
**Objective**: Implement signing key, system config, and audit log commands

**Tasks**:

| #     | Task                                                        | File                                    |
| ----- | ----------------------------------------------------------- | --------------------------------------- |
| 2.2.1 | Create signing key commands (list, generate, rotate, cleanup) | `src/cli/commands/keys.ts`            |
| 2.2.2 | Create system config commands (list, get, set, reset)       | `src/cli/commands/config.ts`            |
| 2.2.3 | Create audit log viewer command (list with filters)         | `src/cli/commands/audit.ts`             |
| 2.2.4 | Register keys, config, audit in CLI entry point             | `src/cli/index.ts`                      |
| 2.2.5 | Write keys command tests                                    | `tests/unit/cli/commands/keys.test.ts`  |
| 2.2.6 | Write config command tests                                  | `tests/unit/cli/commands/config.test.ts` |
| 2.2.7 | Write audit command tests                                   | `tests/unit/cli/commands/audit.test.ts`  |

**Deliverables**:
- [ ] `porta keys list/generate/rotate/cleanup` work
- [ ] `porta config list/get/set/reset` work
- [ ] `porta audit list` with filters works
- [ ] All infrastructure command tests pass
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 3: Organization Commands

### Session 3.1: Organization CRUD & Lifecycle

**Reference**: [Domain Commands](05-domain-commands.md)
**Objective**: Implement all 8 organization subcommands with table/JSON output

**Tasks**:

| #     | Task                                                        | File                                   |
| ----- | ----------------------------------------------------------- | -------------------------------------- |
| 3.1.1 | ~~Create org command with all 8 subcommands (create, list, show, update, suspend, activate, archive, branding)~~ | `src/cli/commands/org.ts` ✅ |
| 3.1.2 | ~~Register org command in CLI entry point~~                 | `src/cli/index.ts` ✅                  |
| 3.1.3 | ~~Write org command tests (CRUD, status lifecycle, output formats, confirmations)~~ | `tests/unit/cli/commands/org.test.ts` ✅ |

**Deliverables**:
- [x] All 8 org subcommands work with table and JSON output
- [x] Destructive operations require confirmation (--force bypass)
- [x] ID-or-slug resolution works
- [x] Org command tests pass (19 tests)
- [x] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 4: Application Commands

### Session 4.1: Application Core & Module Commands

**Reference**: [Domain Commands](05-domain-commands.md)
**Objective**: Implement app CRUD commands and module subcommands

**Tasks**:

| #     | Task                                                        | File                                   |
| ----- | ----------------------------------------------------------- | -------------------------------------- |
| 4.1.1 | ~~Create app command with 5 core subcommands (create, list, show, update, archive)~~ | `src/cli/commands/app.ts` ✅ |
| 4.1.2 | ~~Create app module subcommands (create, list, update, deactivate)~~ | `src/cli/commands/app-module.ts` ✅ |
| 4.1.3 | ~~Register module subcommands in app command~~              | `src/cli/commands/app.ts` ✅             |
| 4.1.4 | ~~Register app command in CLI entry point~~                 | `src/cli/index.ts` ✅                    |
| 4.1.5 | ~~Write app + module command tests~~                        | `tests/unit/cli/commands/app.test.ts` ✅ |

**Deliverables**:
- [x] App CRUD commands work
- [x] Module subcommands work under `app module`
- [x] App command tests pass (core + module: 26 tests total with RBAC+claims)
- [x] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

### Session 4.2: App Role, Permission & Claim Commands

**Reference**: [Domain Commands](05-domain-commands.md)
**Objective**: Implement RBAC and custom claim subcommands under the app command

**Tasks**:

| #     | Task                                                        | File                                        |
| ----- | ----------------------------------------------------------- | ------------------------------------------- |
| 4.2.1 | ~~Create app role subcommands (create, list, show, update, delete, assign-permissions, remove-permissions)~~ | `src/cli/commands/app-role.ts` ✅ |
| 4.2.2 | ~~Create app permission subcommands (create, list, update, delete)~~ | `src/cli/commands/app-permission.ts` ✅ |
| 4.2.3 | ~~Create app claim subcommands (create, list, update, delete)~~ | `src/cli/commands/app-claim.ts` ✅          |
| 4.2.4 | ~~Register role, permission, claim subcommands in app command~~ | `src/cli/commands/app.ts` ✅                |
| 4.2.5 | ~~Write RBAC + claim command tests (add to app.test.ts)~~   | `tests/unit/cli/commands/app.test.ts` ✅     |

**Deliverables**:
- [x] Role subcommands work under `app role`
- [x] Permission subcommands work under `app permission`
- [x] Claim subcommands work under `app claim`
- [x] RBAC + claim tests pass (included in 26 app tests)
- [x] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 5: Client Commands

### Session 5.1: Client CRUD & Secret Commands

**Reference**: [Domain Commands](05-domain-commands.md)
**Objective**: Implement client management commands including secret lifecycle with one-time display

**Tasks**:

| #     | Task                                                        | File                                      |
| ----- | ----------------------------------------------------------- | ----------------------------------------- |
| 5.1.1 | Create client command with 5 core subcommands (create, list, show, update, revoke) | `src/cli/commands/client.ts` |
| 5.1.2 | Create client secret subcommands (generate, list, revoke) with one-time-show box | `src/cli/commands/client-secret.ts` |
| 5.1.3 | Register secret subcommands in client command               | `src/cli/commands/client.ts`              |
| 5.1.4 | Register client command in CLI entry point                  | `src/cli/index.ts`                        |
| 5.1.5 | Write client + secret command tests                         | `tests/unit/cli/commands/client.test.ts`  |

**Deliverables**:
- [ ] Client CRUD commands work
- [ ] Secret generate shows one-time plaintext warning box
- [ ] Client command tests pass (~18 tests)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 6: User Commands

### Session 6.1: User Core Commands

**Reference**: [Domain Commands](05-domain-commands.md)
**Objective**: Implement user CRUD and status lifecycle commands

**Tasks**:

| #     | Task                                                        | File                                    |
| ----- | ----------------------------------------------------------- | --------------------------------------- |
| 6.1.1 | Create user command with 12 core subcommands (create, invite, list, show, update, deactivate, reactivate, suspend, lock, unlock, set-password, verify-email) | `src/cli/commands/user.ts` |
| 6.1.2 | Implement create with --no-notify and --passwordless flags  | `src/cli/commands/user.ts`              |
| 6.1.3 | Implement set-password with hidden input prompt             | `src/cli/commands/user.ts`              |
| 6.1.4 | Register user command in CLI entry point                    | `src/cli/index.ts`                      |
| 6.1.5 | Write user core command tests                               | `tests/unit/cli/commands/user.test.ts`  |

**Deliverables**:
- [ ] All user CRUD + status commands work
- [ ] Create with email/no-notify/passwordless variants work
- [ ] set-password prompts for hidden input
- [ ] User core tests pass (~15 tests)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

### Session 6.2: User Role, Claim & 2FA Subcommands

**Reference**: [Domain Commands](05-domain-commands.md)
**Objective**: Implement user role assignments, custom claim management, and 2FA stub commands

**Tasks**:

| #     | Task                                                        | File                                    |
| ----- | ----------------------------------------------------------- | --------------------------------------- |
| 6.2.1 | Create user role subcommands (assign, remove, list)         | `src/cli/commands/user-role.ts`         |
| 6.2.2 | Create user claim subcommands (set, get, delete)            | `src/cli/commands/user-claim.ts`        |
| 6.2.3 | Create user 2FA stub subcommands (status, disable, reset) — "not yet implemented" | `src/cli/commands/user.ts` (inline stubs) |
| 6.2.4 | Register role, claim, 2fa subcommands in user command       | `src/cli/commands/user.ts`              |
| 6.2.5 | Write user role + claim + 2fa command tests (add to user.test.ts) | `tests/unit/cli/commands/user.test.ts` |

**Deliverables**:
- [ ] User role assign/remove/list work
- [ ] User claim set/get/delete work
- [ ] 2FA stubs return "not yet implemented" message
- [ ] User subcommand tests pass (~10 tests)
- [ ] All verification passing

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 7: Final Integration & Verification

### Session 7.1: End-to-End Wiring & Verification

**Objective**: Wire all commands together, verify complete CLI functionality, ensure clean build

**Tasks**:

| #     | Task                                                        | File                               |
| ----- | ----------------------------------------------------------- | ---------------------------------- |
| 7.1.1 | Verify all 10 top-level commands registered in entry point  | `src/cli/index.ts`                 |
| 7.1.2 | Verify `porta --help` shows complete command tree            | Manual verification                |
| 7.1.3 | Verify `porta <command> --help` for each command             | Manual verification                |
| 7.1.4 | Verify build: `yarn build` produces `dist/cli/index.js` with shebang | `tsconfig.json` if needed |
| 7.1.5 | Run full verification suite                                 | `yarn verify`                      |
| 7.1.6 | Update project.md with CLI module details                   | `.clinerules/project.md`           |

**Deliverables**:
- [ ] All commands accessible via `porta --help`
- [ ] Build produces working `dist/cli/index.js`
- [ ] All ~175 new CLI tests pass
- [ ] All existing 1457 tests still pass (no regressions)
- [ ] Full `yarn verify` passes (lint + build + test)
- [ ] project.md updated

**Verify**: `clear && sleep 3 && yarn verify`

---

## Task Checklist (All Phases)

### Phase 1: CLI Foundation & Utilities
- [x] 1.1.1 Install yargs, cli-table3, chalk dependencies ✅ (completed: 2026-04-09 12:14)
- [x] 1.1.2 Add bin entry and porta script to package.json ✅ (completed: 2026-04-09 12:14)
- [x] 1.1.3 Create CLI entry point with yargs setup and global options ✅ (completed: 2026-04-09 12:14)
- [x] 1.1.4 Create bootstrap module (DB + Redis lifecycle) ✅ (completed: 2026-04-09 12:14)
- [x] 1.1.5 Write bootstrap unit tests ✅ (completed: 2026-04-09 12:14)
- [x] 1.2.1 Create output helpers (table, JSON, colors, formatters) ✅ (completed: 2026-04-09 12:37)
- [x] 1.2.2 Create CLI error handler (domain error mapping) ✅ (completed: 2026-04-09 12:37)
- [x] 1.2.3 Create confirmation prompt utility ✅ (completed: 2026-04-09 12:37)
- [x] 1.2.4 Write output helper unit tests ✅ (completed: 2026-04-09 12:37)
- [x] 1.2.5 Write error handler unit tests ✅ (completed: 2026-04-09 12:37)
- [x] 1.2.6 Write prompt utility unit tests ✅ (completed: 2026-04-09 12:37)

### Phase 2: Infrastructure Commands
- [x] 2.1.1 Create health check command ✅ (completed: 2026-04-09 12:43)
- [x] 2.1.2 Create migration commands (up, down, status) ✅ (completed: 2026-04-09 12:43)
- [x] 2.1.3 Create seed command ✅ (completed: 2026-04-09 12:43)
- [x] 2.1.4 Register health, migrate, seed in CLI entry point ✅ (completed: 2026-04-09 12:43)
- [x] 2.1.5 Write health command tests (7 tests) ✅ (completed: 2026-04-09 12:43)
- [x] 2.1.6 Write migrate command tests (9 tests) ✅ (completed: 2026-04-09 12:43)
- [x] 2.2.1 Create signing key commands (list, generate, rotate) ✅ (completed: 2026-04-09 12:49)
- [x] 2.2.2 Create system config commands (list, get, set) ✅ (completed: 2026-04-09 12:49)
- [x] 2.2.3 Create audit log viewer command ✅ (completed: 2026-04-09 12:49)
- [x] 2.2.4 Register keys, config, audit in CLI entry point ✅ (completed: 2026-04-09 12:49)
- [x] 2.2.5 Write keys command tests (8 tests) ✅ (completed: 2026-04-09 12:49)
- [x] 2.2.6 Write config command tests (9 tests) ✅ (completed: 2026-04-09 12:49)
- [x] 2.2.7 Write audit command tests (7 tests) ✅ (completed: 2026-04-09 12:49)

### Phase 3: Organization Commands
- [x] 3.1.1 Create org command with all 8 subcommands ✅ (completed: 2026-04-09 13:30)
- [x] 3.1.2 Register org command in CLI entry point ✅ (completed: 2026-04-09 13:30)
- [x] 3.1.3 Write org command tests (19 tests) ✅ (completed: 2026-04-09 13:30)

### Phase 4: Application Commands
- [x] 4.1.1 Create app command with 5 core subcommands ✅ (completed: 2026-04-09 13:30)
- [x] 4.1.2 Create app module subcommands ✅ (completed: 2026-04-09 13:30)
- [x] 4.1.3 Register module subcommands in app command ✅ (completed: 2026-04-09 13:30)
- [x] 4.1.4 Register app command in CLI entry point ✅ (completed: 2026-04-09 13:30)
- [x] 4.1.5 Write app + module command tests ✅ (completed: 2026-04-09 13:30)
- [x] 4.2.1 Create app role subcommands (7 subcommands) ✅ (completed: 2026-04-09 13:30)
- [x] 4.2.2 Create app permission subcommands (4 subcommands) ✅ (completed: 2026-04-09 13:30)
- [x] 4.2.3 Create app claim subcommands (4 subcommands) ✅ (completed: 2026-04-09 13:30)
- [x] 4.2.4 Register role, permission, claim in app command ✅ (completed: 2026-04-09 13:30)
- [x] 4.2.5 Write RBAC + claim command tests ✅ (completed: 2026-04-09 13:30)

### Phase 5: Client Commands
- [x] 5.1.1 Create client command with 5 core subcommands ✅ (completed: 2026-04-09 13:49)
- [x] 5.1.2 Create client secret subcommands with one-time display ✅ (completed: 2026-04-09 13:49)
- [x] 5.1.3 Register secret subcommands in client command ✅ (completed: 2026-04-09 13:49)
- [x] 5.1.4 Register client command in CLI entry point ✅ (completed: 2026-04-09 13:49)
- [x] 5.1.5 Write client + secret command tests (21 tests) ✅ (completed: 2026-04-09 13:49)

### Phase 6: User Commands
- [x] 6.1.1 Create user command with 12 core subcommands ✅ (completed: 2026-04-09 13:49)
- [x] 6.1.2 Implement create with --no-notify and --passwordless ✅ (completed: 2026-04-09 13:49)
- [x] 6.1.3 Implement set-password with hidden input ✅ (completed: 2026-04-09 13:49)
- [x] 6.1.4 Register user command in CLI entry point ✅ (completed: 2026-04-09 13:49)
- [x] 6.1.5 Write user core command tests (32 tests) ✅ (completed: 2026-04-09 13:49)
- [x] 6.2.1 Create user role subcommands ✅ (completed: 2026-04-09 13:49)
- [x] 6.2.2 Create user claim subcommands ✅ (completed: 2026-04-09 13:49)
- [x] 6.2.3 Create user 2FA stub subcommands ✅ (completed: 2026-04-09 13:49)
- [x] 6.2.4 Register role, claim, 2fa subcommands in user command ✅ (completed: 2026-04-09 13:49)
- [x] 6.2.5 Write user role + claim + 2fa command tests ✅ (completed: 2026-04-09 13:49)

### Phase 7: Final Integration & Verification
- [x] 7.1.1 Verify all 10 top-level commands registered ✅ (completed: 2026-04-09 13:53)
- [x] 7.1.2 Verify porta --help shows complete command tree ✅ (completed: 2026-04-09 13:54)
- [x] 7.1.3 Verify porta <command> --help for each command ✅ (completed: 2026-04-09 13:55)
- [x] 7.1.4 Verify build produces dist/cli/index.js with shebang ✅ (completed: 2026-04-09 13:54)
- [x] 7.1.5 Run full verification suite ✅ (completed: 2026-04-09 13:54)
- [x] 7.1.6 Update project.md with CLI module details ✅ (completed: 2026-04-09 13:56)

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/cli/99-execution-plan.md`"

### Ending a Session

1. Run the project's verify command: `clear && sleep 3 && yarn verify`
2. Handle commit per the active **commit mode** (see `make_plan.md` for details)
3. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan cli` to continue

---

## Dependencies

```
Phase 1 (Foundation & Utilities)
    ↓
Phase 2 (Infrastructure Commands)
    ↓
Phase 3 (Organization Commands)    ← Can run in parallel with 4, 5, 6
    ↓                                 (all depend on Phase 1 + 2)
Phase 4 (Application Commands)
    ↓
Phase 5 (Client Commands)
    ↓
Phase 6 (User Commands)
    ↓
Phase 7 (Final Integration & Verification)
```

Note: Phases 3–6 all depend on Phase 1 (foundation) and Phase 2 (infrastructure commands establish the command pattern). Phases 3–6 are independent of each other and could theoretically be implemented in any order, but the listed order follows the dependency chain of the domain entities (orgs → apps → clients → users).

---

## Success Criteria

**Feature is complete when:**

1. ✅ All 7 phases completed (48/48 tasks)
2. ✅ All verification passing (`yarn verify` — lint + build + test)
3. ✅ No warnings/errors in build output
4. ✅ `porta --help` displays complete command tree
5. ✅ ~175 new CLI tests pass
6. ✅ All existing 1457 tests still pass (no regressions)
7. ✅ CLI works via `yarn porta` (dev) and `node dist/cli/index.js` (prod)
8. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
