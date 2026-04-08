# RD-09: CLI (Administrative Interface)

> **Document**: RD-09-cli.md
> **Status**: Draft
> **Created**: 2026-04-08
> **Project**: Porta v5 — OIDC Provider
> **Depends On**: RD-01 (Scaffolding), RD-02 (Database), RD-04–RD-08 (Domain Modules)

---

## Feature Overview

Implement a yargs-based CLI tool (`porta`) for all administrative operations. The CLI is the primary management interface until a UI is built later. It provides commands for managing organizations, applications, clients, users, roles, permissions, custom claims, database migrations, signing keys, and system configuration.

---

## Functional Requirements

### Must Have

- [ ] yargs-based CLI with hierarchical command structure
- [ ] CLI entry point: `porta <command> <subcommand> [options]`
- [ ] Commands for all CRUD operations across all domain entities
- [ ] Database migration commands (run, rollback, create, status)
- [ ] Signing key management commands (generate, rotate, list, cleanup)
- [ ] System configuration commands (get, set, list, reset)
- [ ] Formatted output: table format (default) and JSON format (`--json`)
- [ ] Confirmation prompts for destructive operations (`--force` to skip)
- [ ] Error handling with clear, actionable error messages
- [ ] Environment-aware (reads `.env` or accepts `--database-url`, `--redis-url` flags)
- [ ] Exit codes: 0 for success, 1 for error

### Should Have

- [ ] Interactive mode for complex operations (e.g., user creation with guided prompts)
- [ ] Dry-run mode for destructive operations (`--dry-run`)
- [ ] Verbose output mode (`--verbose`)
- [ ] Seed data command for development
- [ ] Health check command (test DB + Redis connectivity)
- [ ] Audit log viewer (recent events, filterable)
- [ ] Autocompletion script generation

### Won't Have (Out of Scope)

- Web-based admin UI (separate project, later)
- Real-time log streaming
- Background job management
- Backup/restore commands (infrastructure concern)

---

## Technical Requirements

### Command Structure

```
porta
├── org                              # Organization management
│   ├── create                       # Create organization
│   ├── list                         # List organizations
│   ├── show <id|slug>               # Show organization details
│   ├── update <id|slug>             # Update organization (supports --2fa-policy)
│   ├── suspend <id|slug>            # Suspend organization
│   ├── activate <id|slug>           # Activate organization
│   ├── archive <id|slug>            # Archive (soft-delete)
│   └── branding <id|slug>           # Update branding
│
├── app                              # Application management
│   ├── create                       # Create application
│   ├── list                         # List applications
│   ├── show <id|slug>               # Show application details
│   ├── update <id|slug>             # Update application
│   ├── archive <id|slug>            # Archive application
│   ├── module                       # Module sub-commands
│   │   ├── create <app>             # Create module
│   │   ├── list <app>               # List modules
│   │   ├── update <module-id>       # Update module
│   │   └── deactivate <module-id>   # Deactivate module
│   │
│   ├── role                         # Role sub-commands
│   │   ├── create <app>             # Create role
│   │   ├── list <app>               # List roles
│   │   ├── show <role-id>           # Show role with permissions
│   │   ├── update <role-id>         # Update role
│   │   ├── delete <role-id>         # Delete role
│   │   ├── assign-permissions       # Assign permissions to role
│   │   └── remove-permissions       # Remove permissions from role
│   │
│   ├── permission                   # Permission sub-commands
│   │   ├── create <app>             # Create permission
│   │   ├── list <app>               # List permissions
│   │   ├── update <permission-id>   # Update permission
│   │   └── delete <permission-id>   # Delete permission
│   │
│   └── claim                        # Custom claim definition sub-commands
│       ├── create <app>             # Define custom claim
│       ├── list <app>               # List claim definitions
│       ├── update <claim-id>        # Update claim definition
│       └── delete <claim-id>        # Delete claim definition
│
├── client                           # Client management
│   ├── create                       # Create client (returns secret for confidential)
│   ├── list [--org <slug>]          # List clients
│   ├── show <client-id>             # Show client details
│   ├── update <client-id>           # Update client
│   ├── revoke <client-id>           # Revoke client
│   ├── secret                       # Secret sub-commands
│   │   ├── generate <client-id>     # Generate new secret
│   │   ├── list <client-id>         # List secrets (no plaintext)
│   │   └── revoke <secret-id>       # Revoke a secret
│   └── cors                         # CORS management
│       ├── add <client-id> <origin> # Add allowed origin
│       └── remove <client-id> <origin>
│
├── user                             # User management
│   ├── create                       # Create user (sends invitation email by default)
│   │   ├── --no-notify              # Skip sending invitation email
│   │   └── --passwordless           # Send welcome email (magic-link only) instead of invite
│   ├── invite <id|email>            # (Re-)send invitation email (generates new token)
│   ├── list [--org <slug>]          # List users
│   ├── show <id|email>              # Show user details
│   ├── update <id>                  # Update user profile
│   ├── deactivate <id>              # Deactivate user
│   ├── reactivate <id>              # Reactivate user
│   ├── suspend <id>                 # Suspend user
│   ├── lock <id>                    # Lock user account
│   ├── unlock <id>                  # Unlock user account
│   ├── set-password <id>            # Set user password
│   ├── verify-email <id>            # Mark email as verified
│   ├── roles                        # User role sub-commands
│   │   ├── assign <user-id>         # Assign roles to user
│   │   ├── remove <user-id>         # Remove roles from user
│   │   └── list <user-id>           # List user's roles
│   ├── claims                       # User custom claim sub-commands
│   │   ├── set <user-id>            # Set claim value
│   │   ├── get <user-id>            # Get claim values
│   │   └── delete <user-id>         # Delete claim value
│   └── 2fa                          # 2FA management sub-commands
│       ├── status <id|email>        # Show 2FA method and enrollment status
│       ├── disable <id|email>       # Force-disable 2FA for user
│       └── reset <id|email>         # Reset 2FA (disable + invalidate recovery codes)
│
├── keys                             # Signing key management
│   ├── list                         # List all keys and status
│   ├── generate                     # Generate new key pair
│   ├── rotate                       # Rotate: generate new + retire current
│   └── cleanup                      # Remove expired retired keys
│
├── config                           # System configuration
│   ├── list                         # List all config values
│   ├── get <key>                    # Get a config value
│   ├── set <key> <value>            # Set a config value
│   └── reset <key>                  # Reset to default value
│
├── migrate                          # Database migrations
│   ├── up                           # Run all pending migrations
│   ├── down                         # Rollback last migration
│   ├── status                       # Show migration status
│   └── create <name>                # Create new migration file
│
├── seed                             # Seed data
│   └── run                          # Run seed data (dev only)
│
├── health                           # Health check
│   └── check                        # Test DB + Redis connectivity
│
└── audit                            # Audit log viewer
    └── list [--org <slug>]          # Recent audit events
         [--user <id>]
         [--event <type>]
         [--since <date>]
         [--limit <n>]
```

### CLI Architecture

```typescript
// src/cli/index.ts
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const cli = yargs(hideBin(process.argv))
  .scriptName('porta')
  .usage('$0 <command> [options]')
  .commandDir('./commands', { extensions: ['ts', 'js'] })
  .option('json', {
    type: 'boolean',
    description: 'Output in JSON format',
    default: false,
  })
  .option('verbose', {
    type: 'boolean',
    description: 'Verbose output',
    default: false,
  })
  .option('force', {
    type: 'boolean',
    description: 'Skip confirmation prompts',
    default: false,
  })
  .demandCommand(1, 'You need to specify a command')
  .strict()
  .help()
  .version();
```

### Command File Structure

```
src/cli/
├── index.ts                         # CLI entry point (yargs setup)
├── commands/
│   ├── org.ts                       # Organization commands
│   ├── app.ts                       # Application commands
│   ├── client.ts                    # Client commands
│   ├── user.ts                      # User commands
│   ├── keys.ts                      # Signing key commands
│   ├── config.ts                    # System config commands
│   ├── migrate.ts                   # Migration commands
│   ├── seed.ts                      # Seed commands
│   ├── health.ts                    # Health check
│   └── audit.ts                     # Audit log viewer
├── formatters/
│   ├── table.ts                     # Table output formatting
│   └── json.ts                      # JSON output formatting
└── utils/
    ├── prompt.ts                    # Interactive prompts (inquirer)
    ├── spinner.ts                   # Loading spinners (ora)
    └── output.ts                    # Output helpers (colors, formatting)
```

### Example Command Implementation

```typescript
// src/cli/commands/org.ts
import type { CommandModule } from 'yargs';

export const command = 'org <subcommand>';
export const describe = 'Organization management';

export const builder = (yargs) => {
  return yargs
    .command('create', 'Create a new organization', {
      name: { type: 'string', demandOption: true, describe: 'Organization name' },
      slug: { type: 'string', describe: 'URL-safe slug (auto-generated if not provided)' },
      locale: { type: 'string', default: 'en', describe: 'Default locale' },
    }, async (argv) => {
      const orgService = await getOrganizationService();
      const org = await orgService.create({
        name: argv.name,
        slug: argv.slug,
        defaultLocale: argv.locale,
      });

      if (argv.json) {
        console.log(JSON.stringify(org, null, 2));
      } else {
        console.log(`✅ Organization created: ${org.name} (${org.slug})`);
        printOrgTable(org);
      }
    })
    .command('list', 'List organizations', {
      status: { type: 'string', describe: 'Filter by status' },
      page: { type: 'number', default: 1 },
      'page-size': { type: 'number', default: 20 },
    }, async (argv) => {
      // ... list implementation
    });
};
```

### Output Formatting

**Table format (default):**
```
$ porta org list

 ID                                    Name                Slug              Status    Created
 ──────────────────────────────────────────────────────────────────────────────────────────────
 a1b2c3d4-...                          Porta Admin         porta-admin       active    2026-04-08
 e5f6g7h8-...                          Acme Corporation    acme-corp         active    2026-04-08
 i9j0k1l2-...                          Globex Inc          globex-inc        suspended 2026-04-07

Total: 3 organizations
```

**JSON format (`--json`):**
```json
{
  "data": [
    { "id": "a1b2c3d4-...", "name": "Porta Admin", "slug": "porta-admin", "status": "active" },
    { "id": "e5f6g7h8-...", "name": "Acme Corporation", "slug": "acme-corp", "status": "active" }
  ],
  "total": 3,
  "page": 1,
  "pageSize": 20
}
```

### Confirmation Prompts

Destructive operations require confirmation:

```
$ porta org archive acme-corp

⚠️  This will archive organization "Acme Corporation" (acme-corp).
    All users will lose access. This can be reversed by a super-admin.

Are you sure? (y/N): y
✅ Organization archived: Acme Corporation (acme-corp)
```

Skip with `--force`:
```
$ porta org archive acme-corp --force
✅ Organization archived: Acme Corporation (acme-corp)
```

### Secret Display (One-Time)

When generating a client secret, the plaintext is shown exactly once with a clear warning:

```
$ porta client secret generate <client-id> --label "production"

⚠️  IMPORTANT: Copy this secret now. It will not be shown again!

┌─────────────────────────────────────────────────────────────────────┐
│ Secret: YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5QUJDREVG │
│ Label:  production                                                   │
│ ID:     f3a4b5c6-...                                                │
└─────────────────────────────────────────────────────────────────────┘
```

### Environment Configuration

The CLI reads configuration from (in order):
1. CLI flags (`--database-url`, `--redis-url`)
2. Environment variables (`DATABASE_URL`, `REDIS_URL`)
3. `.env` file in current directory

```typescript
// Bootstrap: connect to DB and Redis before running commands
async function bootstrap() {
  const config = loadConfig();          // From env/flags
  const db = await connectDatabase(config.databaseUrl);
  const redis = await connectRedis(config.redisUrl);
  return { db, redis, config };
}
```

### Error Handling

```typescript
// All CLI commands wrapped in error handler
async function withErrorHandling(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    process.exit(0);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error(`❌ Validation error: ${error.message}`);
    } else if (error instanceof NotFoundError) {
      console.error(`❌ Not found: ${error.message}`);
    } else if (error instanceof DatabaseError) {
      console.error(`❌ Database error: ${error.message}`);
      if (process.env.NODE_ENV !== 'production') {
        console.error(error.stack);
      }
    } else {
      console.error(`❌ Unexpected error: ${error.message}`);
    }
    process.exit(1);
  }
}
```

### Package.json bin Entry

```json
{
  "bin": {
    "porta": "./dist/cli/index.js"
  }
}
```

### NPX / Yarn Support

The CLI can be run via:
- `yarn porta <command>` (via package.json scripts)
- `npx porta <command>` (if published)
- `node dist/cli/index.js <command>` (direct)
- `tsx src/cli/index.ts <command>` (development)

---

## Integration Points

### With All Domain Modules
- CLI imports and uses the same service layer as the HTTP server
- Services are initialized with the same database and Redis connections
- No separate API calls — direct service invocation

### With RD-02 (Database)
- Migration commands use `node-pg-migrate`
- Seed command runs seed SQL files

### With RD-03 (OIDC Core)
- Key management commands interact with `signing_keys` table

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| CLI framework | commander, yargs, oclif | yargs | User requirement, flexible, well-maintained |
| Output format | Table only, JSON only, both | Both (table default, `--json` flag) | Human-readable by default, scriptable with JSON |
| Prompts | None, readline, inquirer | Confirmation for destructive ops | Safety, `--force` for automation |
| Service access | HTTP API calls, direct service | Direct service invocation | Faster, no HTTP overhead, same codebase |

---

## Acceptance Criteria

1. [ ] `porta --help` shows all commands and options
2. [ ] All org commands work (create, list, show, update, suspend, activate, archive)
3. [ ] All app commands work (create, list, show, update, archive)
4. [ ] All module commands work (create, list, update, deactivate)
5. [ ] All client commands work (create, list, show, update, revoke)
6. [ ] Client secret generation shows plaintext once
7. [ ] All user commands work (create, list, show, update, status changes)
8. [ ] `porta user create` sends invitation email by default
9. [ ] `porta user create --no-notify` skips invitation email
10. [ ] `porta user create --passwordless` sends welcome email instead of invite
11. [ ] `porta user invite <id>` re-sends invitation (new token, old invalidated)
12. [ ] User role assignment and removal works
13. [ ] User custom claim set/get/delete works
14. [ ] All role/permission commands work
15. [ ] Key management commands work (list, generate, rotate, cleanup)
16. [ ] Config commands work (list, get, set, reset)
17. [ ] Migration commands work (up, down, status, create)
18. [ ] Health check tests DB and Redis connectivity
19. [ ] `--json` flag produces valid JSON output
20. [ ] `--force` skips confirmation prompts
21. [ ] Exit code 0 on success, 1 on error
22. [ ] Clear error messages for invalid input
23. [ ] CLI works in development (`tsx`) and production (`node dist/`)
24. [ ] `porta user 2fa status <id>` shows 2FA method and enrollment status
25. [ ] `porta user 2fa disable <id>` force-disables 2FA
26. [ ] `porta user 2fa reset <id>` resets 2FA + invalidates recovery codes
27. [ ] `porta org update <slug> --2fa-policy <policy>` updates org 2FA policy
