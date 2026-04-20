# CLI: Infrastructure

Infrastructure and operational commands for health checks, migrations, signing keys, configuration, and audit logs.

## `porta health` {#porta-health}

Check database and Redis connectivity.

```bash
# Via HTTP (requires running server)
porta health

# Direct database check (no server needed)
porta health --direct
```

| Flag | Description |
|------|-------------|
| `--direct` | Connect directly to DB and Redis instead of HTTP |

**Output:**

```
┌───────────┬──────────┐
│ Service   │ Status   │
├───────────┼──────────┤
│ Server    │ ✅ OK    │
│ Database  │ ✅ OK    │
│ Redis     │ ✅ OK    │
└───────────┴──────────┘
```

**Mode:** Both (HTTP by default, direct with `--direct`)

---

## `porta migrate` {#porta-migrate}

Run database migrations using node-pg-migrate.

**Mode:** Direct DB

### `porta migrate up`

```bash
porta migrate up
```

Applies all pending migrations.

### `porta migrate down`

```bash
porta migrate down [--count 1]
```

Rolls back the specified number of migrations (default: 1).

### `porta migrate status`

```bash
porta migrate status
```

Shows the current migration status — which migrations have been applied and which are pending.

---

## `porta seed` {#porta-seed}

Load development seed data.

**Mode:** Direct DB

```bash
porta seed run
```

::: warning
Only use `porta seed` in development environments. It creates sample organizations, users, and clients with known credentials.
:::

---

## `porta keys` {#porta-keys}

Manage ES256 signing keys.

**Mode:** HTTP (requires `porta login`)

### `porta keys list`

```bash
porta keys list
```

### `porta keys generate`

```bash
porta keys generate
```

Generates a new ES256 key pair.

### `porta keys rotate`

```bash
porta keys rotate
```

Generates a new key and schedules the old key for retirement.

---

## `porta config` {#porta-config}

Manage system configuration values.

**Mode:** HTTP (requires `porta login`)

### `porta config list`

```bash
porta config list
```

Shows all configuration entries. Sensitive values are masked.

### `porta config get`

```bash
porta config get --key access_token_ttl
```

### `porta config set`

```bash
porta config set --key access_token_ttl --value 7200
```

---

## `porta audit` {#porta-audit}

View the audit log.

**Mode:** HTTP (requires `porta login`)

### `porta audit list`

```bash
porta audit list \
  [--action "organization.created"] \
  [--entity-type organization] \
  [--entity-id <id>] \
  [--actor-id <id>] \
  [--from "2024-01-01"] \
  [--to "2024-01-31"] \
  [--page 1] \
  [--page-size 20]
```

| Flag | Description |
|------|-------------|
| `--action` | Filter by action type |
| `--entity-type` | Filter by entity type |
| `--entity-id` | Filter by entity ID |
| `--actor-id` | Filter by actor ID |
| `--from` | Start date (ISO 8601) |
| `--to` | End date (ISO 8601) |
| `--page` | Page number |
| `--page-size` | Items per page |
