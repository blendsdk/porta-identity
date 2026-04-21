# CLI Overview

The `porta` CLI is an admin tool for managing your Porta identity platform from the command line. It supports 14 top-level commands covering everything from initial bootstrap to day-to-day user management.

## Installation

The CLI is included with Porta. In a development environment:

```bash
# Run via yarn
yarn porta <command>

# Or via npx after building
npx porta <command>
```

In production, the CLI can be invoked directly if Porta is installed globally or via the `bin` entry:

```bash
porta <command>
```

## Global Options

Every command supports these global flags:

| Flag | Description |
|------|-------------|
| `--json` | Output results as JSON instead of formatted tables |
| `--verbose` | Enable verbose/debug logging |
| `--force` | Skip confirmation prompts |
| `--dry-run` | Show what would happen without making changes |
| `--database-url` | Override `DATABASE_URL` for direct-DB commands |
| `--redis-url` | Override `REDIS_URL` for direct-DB commands |

## Command Reference

| Command | Mode | Description |
|---------|------|-------------|
| [`porta init`](/cli/bootstrap#porta-init) | Direct DB | Bootstrap admin infrastructure |
| [`porta login`](/cli/bootstrap#porta-login) | HTTP | Authenticate via OIDC (auto-detects Docker) |
| [`porta logout`](/cli/bootstrap#porta-logout) | HTTP | Clear stored credentials |
| [`porta whoami`](/cli/bootstrap#porta-whoami) | HTTP | Display current identity |
| [`porta health`](/cli/infrastructure#porta-health) | Both | Check DB + Redis connectivity |
| [`porta migrate`](/cli/infrastructure#porta-migrate) | Direct DB | Run database migrations |
| [`porta seed`](/cli/infrastructure#porta-seed) | Direct DB | Load development seed data |
| [`porta keys`](/cli/infrastructure#porta-keys) | HTTP | Manage signing keys |
| [`porta config`](/cli/infrastructure#porta-config) | HTTP | Manage system configuration |
| [`porta audit`](/cli/infrastructure#porta-audit) | HTTP | View and manage audit logs (list, cleanup) |
| [`porta org`](/cli/organizations) | HTTP | Manage organizations |
| [`porta app`](/cli/applications) | HTTP | Manage applications, modules, roles, permissions, claims |
| [`porta client`](/cli/clients) | HTTP | Manage OIDC clients and secrets |
| [`porta user`](/cli/users) | HTTP | Manage users, roles, claims, 2FA, GDPR export/purge |

## Dual-Mode Architecture

The CLI operates in two modes depending on the command:

### Direct DB Mode

Commands like `init`, `migrate`, and `seed` connect directly to PostgreSQL and Redis. These are used for initial setup and infrastructure operations that must work before the HTTP server is running.

```bash
# These connect directly to the database
porta init
porta migrate up
porta seed run
```

### HTTP Mode

All other commands communicate with the Porta server via the Admin API. They require authentication (via `porta login`) and use Bearer token authorization. When running inside Docker or headless environments, `porta login` automatically uses a manual paste-URL mode — see [porta login](/cli/bootstrap#porta-login) for details.

```bash
# These use the Admin API
porta org list
porta user create --org-id <id> --email alice@example.com
porta client list
```

## Output Formats

By default, the CLI displays results as formatted tables:

```
┌──────────────────────────────────────┬────────────┬──────────┐
│ ID                                   │ Name       │ Status   │
├──────────────────────────────────────┼────────────┼──────────┤
│ 550e8400-e29b-41d4-a716-44665544...  │ Acme Corp  │ active   │
│ 6ba7b810-9dad-11d1-80b4-00c04fd4...  │ Globex     │ active   │
└──────────────────────────────────────┴────────────┴──────────┘
```

Use `--json` for machine-readable output:

```bash
porta org list --json
```

```json
[
  { "id": "550e8400-...", "name": "Acme Corp", "status": "active" },
  { "id": "6ba7b810-...", "name": "Globex", "status": "active" }
]
```

## Credential Storage

After `porta login`, credentials are stored at `~/.porta/credentials.json` with `0600` file permissions (readable only by the current user). The CLI automatically refreshes expired access tokens using the stored refresh token.
