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

| Flag       | Description                                      |
| ---------- | ------------------------------------------------ |
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

This command adds another active signing key.
It does so without retiring existing active keys.

### `porta keys rotate`

```bash
porta keys rotate
```

Retires every active signing key and creates one new active key.

After either successful command, restart every running Porta instance. After restarting, run
`porta keys list` and verify the committed active signing key before returning the deployment to
normal operation.

---

## `porta config` {#porta-config}

Manage the closed 18-key deployment-global operational catalog. Keys cannot be created or deleted.
Bootstrap settings, infrastructure and secrets remain external; they are not masked config entries.
See the [catalog](../guide/environment.md#editable-global-configuration) for native types, units,
inclusive bounds and application modes.

**Mode:** HTTP (requires `porta login`)

### `porta config list`

```bash
porta config list
```

Shows every catalog entry with its native value, type, unit, allowed bounds/choices, application mode
and update time. Requires `admin:config:read`.

### `porta config get`

```bash
porta config get access_token_ttl
```

### `porta config set`

```bash
porta config set access_token_ttl 7200
porta config set magic_link_ttl 1200
porta config set default_locale en
```

`get` also displays the entry description. `set <key> <value>` first fetches authoritative metadata,
then parses a base-ten safe integer within inclusive bounds or an exact supported string. It sends
a native JSON scalar, never a quoted number. Currently the only locale choice is `en`. Blank values,
fractions, scientific notation and unsupported choices are rejected without sending an update.
Because of the metadata read, conventional CLI `set` needs both `admin:config:read` and
`admin:config:update`.

Use the global `--json` flag for machine-readable output: list returns an entry array, get one entry,
and set the complete `{ data: ConfigEntry, restartRequired: boolean }` result. Human output says
**Restart every Porta server instance** only when a confirmed startup-setting update requires it.
API failures retain the safe `config_value_invalid`, `config_entry_not_found` and
`config_store_unavailable` categories; no automatic mutation retry is performed.

After successful commit the local runtime cache is cleared immediately. Other healthy instances
observe runtime changes on their next read within the existing 60-second cache lifetime. The five
provider-startup lifetimes require restarting every server instance; Porta does not restart them
automatically. Existing artifact and counter expiries are not rewritten.

The embedded `porta admin` application also offers **System Configuration…**, a four-tab full-page
editor with one Save/Cancel footer and one atomic changed-key batch. The conventional CLI keeps
`list`, `get` and `set`; batch updates are available through the API/SDK and embedded editor.

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

| Flag            | Description           |
| --------------- | --------------------- |
| `--action`      | Filter by action type |
| `--entity-type` | Filter by entity type |
| `--entity-id`   | Filter by entity ID   |
| `--actor-id`    | Filter by actor ID    |
| `--from`        | Start date (ISO 8601) |
| `--to`          | End date (ISO 8601)   |
| `--page`        | Page number           |
| `--page-size`   | Items per page        |

### `porta audit cleanup`

```bash
porta audit cleanup
```

Deletes audit log entries older than the configured retention period. The retention period is controlled by the `audit_retention_days` system configuration key (set via `porta config set`).

```bash
# Set retention to 365 days, then clean up
porta config set audit_retention_days 365
porta audit cleanup
```

**Output:**

```
✅ Deleted 1,542 audit entries older than 365 days (cutoff: 2025-04-21)
```

::: warning
Audit cleanup is irreversible. Ensure your retention period meets compliance requirements before running this command. Consider scheduling regular cleanup via cron or a Kubernetes CronJob.
:::
