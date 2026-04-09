# Infrastructure Commands: health, migrate, seed, keys, config

> **Document**: 04-infrastructure-commands.md
> **Parent**: [Index](00-index.md)

## Overview

Infrastructure commands manage the system's operational concerns: database connectivity health checks, schema migrations, development seed data, signing key lifecycle, and system configuration. These commands are typically run by operators during deployment, maintenance, and development — not during regular application usage.

All infrastructure commands follow the same pattern: parse arguments → bootstrap (connect DB/Redis) → call existing lib functions → format output → shutdown.

## Implementation Details

### Health Check Command (`src/cli/commands/health.ts`)

Tests database and Redis connectivity. Reports status for each service.

```
porta health check
porta health check --json
```

**Subcommands:**

| Subcommand | Description | Arguments/Options |
| --- | --- | --- |
| `check` | Test DB + Redis connectivity | None |

**Implementation:**
- Call `getPool().query('SELECT 1')` for DB check
- Call `getRedis().ping()` for Redis check
- Report each as ✅ or ❌
- JSON mode returns `{ database: "ok"|"error", redis: "ok"|"error" }`

### Migration Commands (`src/cli/commands/migrate.ts`)

Manages database schema migrations using the existing `node-pg-migrate` setup.

```
porta migrate up
porta migrate down
porta migrate status
porta migrate create <name>
```

**Subcommands:**

| Subcommand | Description | Arguments/Options |
| --- | --- | --- |
| `up` | Run all pending migrations | None |
| `down` | Rollback last migration | `--count <n>` (default: 1) |
| `status` | Show migration status | None |
| `create <name>` | Create new migration file | `name` (positional, required) |

**Implementation:**
- Delegates to `node-pg-migrate` programmatically or via shell exec of existing yarn scripts
- `up` calls `runMigrations()` from `src/lib/migrator.ts`
- `down` runs `node-pg-migrate down` with count parameter
- `status` runs `node-pg-migrate status` and formats output
- `create` runs `node-pg-migrate create` to scaffold a new file

**Note:** The `migrate` command may not need full Redis bootstrap — only DB. The bootstrap function should support a `dbOnly` option for this case.

### Seed Command (`src/cli/commands/seed.ts`)

Runs seed data for development environments.

```
porta seed run
porta seed run --force
```

**Subcommands:**

| Subcommand | Description | Arguments/Options |
| --- | --- | --- |
| `run` | Run seed data (dev only) | `--force` to skip confirmation |

**Implementation:**
- Confirmation prompt: "This will insert seed data. Continue?"
- Runs `migrations/011_seed.sql` against the database
- Only useful in development — warn if NODE_ENV is production
- `--dry-run` shows what would be inserted without executing

### Signing Key Commands (`src/cli/commands/keys.ts`)

Manages ES256 signing key lifecycle using existing `src/lib/signing-keys.ts`.

```
porta keys list
porta keys generate
porta keys rotate
porta keys cleanup
```

**Subcommands:**

| Subcommand | Description | Arguments/Options |
| --- | --- | --- |
| `list` | List all keys and their status | None |
| `generate` | Generate a new key pair | None |
| `rotate` | Rotate: generate new + retire current | `--force` to skip confirmation |
| `cleanup` | Remove expired retired keys | `--force` to skip confirmation |

**Implementation:**
- `list` calls `listSigningKeys()` and displays table with: ID, status (active/retired), created date, retired date
- `generate` calls `generateSigningKeyPair()` and displays the new key ID
- `rotate` calls `generateSigningKeyPair()` then `retireSigningKey()` on current active key — requires confirmation
- `cleanup` calls `deleteRetiredKeys()` — requires confirmation, shows count of deleted keys

**Table format:**
```
 ID          Status    Created       Retired
 ──────────────────────────────────────────────
 a1b2c3d4    active    2026-04-08    —
 e5f6g7h8    retired   2026-03-01    2026-04-08

Total: 2 signing keys
```

### System Config Commands (`src/cli/commands/config.ts`)

Manages system configuration values stored in the `system_config` table.

```
porta config list
porta config get <key>
porta config set <key> <value>
porta config reset <key>
```

**Subcommands:**

| Subcommand | Description | Arguments/Options |
| --- | --- | --- |
| `list` | List all config values | None |
| `get <key>` | Get a specific config value | `key` (positional, required) |
| `set <key> <value>` | Set a config value | `key`, `value` (positional, required) |
| `reset <key>` | Reset to default value | `key` (positional, required), `--force` |

**Implementation:**
- `list` calls `listSystemConfigs()` and displays table with: key, value, default, updated date
- `get` calls `getSystemConfig(key)` and displays the value
- `set` calls `setSystemConfig(key, value)` and confirms the change
- `reset` calls `resetSystemConfig(key)` — requires confirmation

**Table format:**
```
 Key                    Value    Default    Updated
 ──────────────────────────────────────────────────────
 oidc.access_token_ttl  3600     3600       2026-04-08
 oidc.refresh_token_ttl 86400    86400      2026-04-08

Total: 2 config entries
```

### Audit Log Command (`src/cli/commands/audit.ts`)

Views audit log entries with filtering options.

```
porta audit list
porta audit list --org <slug> --user <id> --event <type> --since <date> --limit <n>
porta audit list --json
```

**Subcommands:**

| Subcommand | Description | Arguments/Options |
| --- | --- | --- |
| `list` | List recent audit events | `--org`, `--user`, `--event`, `--since`, `--limit` |

**Options:**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--org` | string | — | Filter by organization slug |
| `--user` | string | — | Filter by user ID |
| `--event` | string | — | Filter by event type |
| `--since` | string | — | Show events since date (ISO 8601) |
| `--limit` | number | 50 | Maximum number of events |

**Implementation:**
- Calls `listAuditLogs()` with filter parameters
- Displays table with: timestamp, event type, actor, target, details
- JSON mode returns full audit log objects

**Table format:**
```
 Timestamp             Event              Actor           Target           Details
 ─────────────────────────────────────────────────────────────────────────────────
 2026-04-09 10:30      org.created        super-admin     acme-corp        —
 2026-04-09 10:31      user.created       super-admin     john@acme.com    org: acme-corp

Total: 2 events
```

## Command Pattern

All infrastructure commands follow a consistent pattern:

```typescript
import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import { withBootstrap } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { printTable, printJson, success, outputResult } from '../output.js';

interface CommandArgs extends GlobalOptions {
  // command-specific args
}

export const commandName: CommandModule<GlobalOptions, CommandArgs> = {
  command: 'commandname',
  describe: 'Description',
  builder: (yargs) => {
    return yargs
      .command('subcommand', 'Description', {/* options */}, async (argv) => {
        await withErrorHandling(async () => {
          await withBootstrap(argv, async () => {
            // Call service function
            // Format and output result
          });
        }, argv.verbose);
      });
  },
  handler: () => { /* noop — subcommands handle execution */ },
};
```

## Testing Requirements

Each infrastructure command needs tests for:
- Successful execution with table output
- Successful execution with JSON output (`--json`)
- Error handling (connection failures, invalid arguments)
- Confirmation prompt behavior (`--force` bypass)
- `--dry-run` behavior where applicable
- Argument validation (missing required args)
