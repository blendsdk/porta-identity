# Current State: CLI (Admin CLI Tooling)

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

Porta v5 has completed 8 implementation plans (RD-01 through RD-08), establishing a comprehensive service layer with 1457 tests across 79 test files. The CLI will be a thin presentation layer over this existing infrastructure.

#### Service Layer (Ready for CLI consumption)

All domain services are available as standalone exported functions via barrel exports:

| Module | Barrel Export | Key Functions |
| --- | --- | --- |
| Organizations (RD-04) | `src/organizations/index.ts` | `createOrganization`, `getOrganizationById`, `getOrganizationBySlug`, `updateOrganization`, `updateOrganizationBranding`, `suspendOrganization`, `activateOrganization`, `archiveOrganization`, `restoreOrganization`, `listOrganizations`, `generateSlug`, `validateSlug` |
| Applications (RD-05) | `src/applications/index.ts` | `createApplication`, `getApplicationById`, `getApplicationBySlug`, `updateApplication`, `listApplications`, `deactivateApplication`, `activateApplication`, `archiveApplication`, `createModule`, `updateModule`, `deactivateModule`, `listModules` |
| Clients (RD-05) | `src/clients/index.ts` | `createClient`, `getClientById`, `updateClient`, `listClients`, `revokeClient`, `generateClientSecret`, `verifyClientSecret`, `revokeClientSecret`, `listClientSecrets`, `cleanupExpiredSecrets` |
| Users (RD-06) | `src/users/index.ts` | `createUser`, `getUserById`, `getUserByEmail`, `updateUser`, `listUsers`, `deactivateUser`, `reactivateUser`, `suspendUser`, `lockUser`, `unlockUser`, `setPassword`, `verifyEmail` |
| Auth (RD-07) | `src/auth/index.ts` | `sendInvitationEmail`, `sendMagicLinkEmail`, `sendPasswordResetEmail`, token generation/validation |
| RBAC (RD-08) | `src/rbac/index.ts` | `createRole`, `getRoleById`, `updateRole`, `deleteRole`, `listRoles`, `assignPermissionsToRole`, `removePermissionsFromRole`, `createPermission`, `getPermissionById`, `updatePermission`, `deletePermission`, `listPermissions`, `assignRolesToUser`, `removeRolesFromUser`, `listUserRoles` |
| Custom Claims (RD-08) | `src/custom-claims/index.ts` | `createClaimDefinition`, `getClaimDefinitionById`, `updateClaimDefinition`, `deleteClaimDefinition`, `listClaimDefinitions`, `setUserClaimValue`, `getUserClaimValues`, `deleteUserClaimValue` |

#### Infrastructure Layer (Ready for CLI consumption)

| Module | File | Key Functions |
| --- | --- | --- |
| Database | `src/lib/database.ts` | `connectDatabase`, `disconnectDatabase`, `getPool` |
| Redis | `src/lib/redis.ts` | `connectRedis`, `disconnectRedis`, `getRedis` |
| Config | `src/config/index.ts` | `config` (validated config object) |
| Logger | `src/lib/logger.ts` | `logger` (pino instance) |
| Migrator | `src/lib/migrator.ts` | `runMigrations` |
| Signing Keys | `src/lib/signing-keys.ts` | `ensureSigningKeys`, `generateSigningKeyPair`, `listSigningKeys`, `retireSigningKey`, `deleteRetiredKeys` |
| System Config | `src/lib/system-config.ts` | `getSystemConfig`, `setSystemConfig`, `listSystemConfigs`, `resetSystemConfig` |
| Audit Log | `src/lib/audit-log.ts` | `writeAuditLog`, `listAuditLogs` |

### Relevant Files

| File | Purpose | Changes Needed |
| --- | --- | --- |
| `package.json` | Project manifest | Add `bin` entry, yargs/cli-table3/chalk deps |
| `src/config/index.ts` | Config loader | None — CLI will use directly |
| `src/config/schema.ts` | Config schema | May need optional fields for CLI-only mode |
| `src/lib/database.ts` | DB pool | None — CLI calls connectDatabase/disconnectDatabase |
| `src/lib/redis.ts` | Redis client | None — CLI calls connectRedis/disconnectRedis |
| `src/index.ts` | HTTP server entry point | None — CLI has separate entry point |

### Code Analysis

#### Bootstrap Pattern

The HTTP server's `src/index.ts` follows this startup sequence:
1. Connect to PostgreSQL
2. Connect to Redis
3. Initialize i18n + template engine
4. Load signing keys
5. Load OIDC config
6. Create OIDC provider
7. Start HTTP server

The CLI needs a simpler bootstrap:
1. Load .env + parse CLI flags for connection overrides
2. Connect to PostgreSQL
3. Connect to Redis (optional for some commands like `migrate`)
4. Run command
5. Disconnect Redis
6. Disconnect PostgreSQL

#### Config System

The current config (`src/config/index.ts`) loads from `.env` via dotenv + zod validation. The CLI needs to:
- Support the same `.env` loading
- Allow CLI flag overrides for `DATABASE_URL` and `REDIS_URL`
- Not require the full config schema (e.g., OIDC-specific settings) for infrastructure commands

This means the CLI bootstrap should load dotenv but use a separate, minimal config validation for connection strings, falling back to the full config when available.

## Gaps Identified

### Gap 1: No CLI Entry Point

**Current Behavior:** Only HTTP server entry point exists (`src/index.ts`)
**Required Behavior:** Separate CLI entry point (`src/cli/index.ts`) with yargs
**Fix Required:** Create entire `src/cli/` directory structure

### Gap 2: No `bin` Entry in package.json

**Current Behavior:** No `bin` field, no CLI scripts
**Required Behavior:** `bin.porta` pointing to `dist/cli/index.js`, plus development script
**Fix Required:** Add `bin` and `porta` script to package.json

### Gap 3: No Output Formatting Layer

**Current Behavior:** Service functions return domain objects, no CLI formatting
**Required Behavior:** Table and JSON formatters that present domain objects nicely
**Fix Required:** Create `src/cli/output.ts` with formatters for each entity type

### Gap 4: No CLI-Specific Error Handling

**Current Behavior:** Domain errors exist (NotFoundError, ValidationError) but not formatted for CLI
**Required Behavior:** Errors caught and displayed with emoji/color, appropriate exit codes
**Fix Required:** Create `src/cli/error-handler.ts`

### Gap 5: No Confirmation Prompt Utility

**Current Behavior:** No interactive prompt capability
**Required Behavior:** y/N prompts for destructive operations, `--force` bypass
**Fix Required:** Create `src/cli/prompt.ts` using Node.js readline

### Gap 6: Missing Dependencies

**Current Behavior:** No yargs, cli-table3, or chalk in dependencies
**Required Behavior:** These must be added as runtime dependencies
**Fix Required:** `yarn add yargs cli-table3 chalk` + `yarn add -D @types/yargs`

### Gap 7: 2FA Module Not Implemented

**Current Behavior:** RD-12 (2FA) not yet implemented — no 2FA service functions exist
**Required Behavior:** CLI should have 2FA commands that return stub messages
**Fix Required:** Implement stub commands that print "2FA not yet implemented" and exit 0

## Dependencies

### Internal Dependencies

- All domain service modules (organizations, applications, clients, users, rbac, custom-claims)
- All lib modules (database, redis, config, logger, migrator, signing-keys, system-config, audit-log)
- Auth module (for email sending on user create/invite)

### External Dependencies (New)

| Package | Version | Purpose |
| --- | --- | --- |
| `yargs` | ^17.x | CLI framework with command hierarchy |
| `@types/yargs` | ^17.x | TypeScript types for yargs (dev) |
| `cli-table3` | ^0.6.x | Table output formatting |
| `chalk` | ^5.x | Terminal color output |

### Existing Dependencies (Already Available)

- `dotenv` — .env loading
- `pg` — PostgreSQL connection
- `ioredis` — Redis connection
- `pino` — Logging
- `zod` — Validation
- `argon2` — Password hashing (for set-password)
- `nodemailer` — Email sending (for user create/invite)

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Large command count may bloat CLI entry | Medium | Low | Split into separate command files per entity |
| Config schema requires OIDC-specific vars | Medium | Medium | Create minimal CLI config or make OIDC fields optional |
| chalk v5 is ESM-only | Low | Low | Project already uses ESM (`"type": "module"`) |
| yargs TypeScript support quirks | Medium | Low | Use explicit types, follow yargs TS examples |
| 2FA stubs may confuse users | Low | Low | Clear "not yet implemented" messages |
| CLI bootstrap needs different config than HTTP server | Medium | Medium | Create separate bootstrap that only requires DB/Redis URLs |
