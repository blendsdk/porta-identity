# CLI Overview

The `porta` CLI is the admin tool for managing your Porta identity platform from the command line. It is distributed as a **standalone npm package** that connects to a running Porta server via the Admin API.

## Architecture

The Porta CLI has two components:

| Component | Package | Purpose |
|-----------|---------|---------|
| **Standalone CLI** | `@portaidentity/cli` | Full admin tool — 20+ commands, installs via npm |
| **Server CLI** | Built into `porta` server | Infrastructure-only — init, migrate, seed, health |

The standalone CLI uses the **`@portaidentity/sdk`** under the hood, authenticating via OIDC (Auth Code + PKCE) to the Porta server's Admin API. The server CLI uses direct database access for bootstrapping operations.

## Installation

### Standalone CLI (Recommended)

Install the standalone CLI globally to manage any Porta server:

```bash
# Install globally
npm install -g @portaidentity/cli

# Or use npx
npx @portaidentity/cli <command>

# Verify installation
porta version
```

### Server CLI (Docker / Development)

The server image includes infrastructure-only commands. In Docker:

```bash
# Via docker exec
docker exec -it porta-app porta init
docker exec -it porta-app porta migrate up

# Via the porta.sh wrapper script
./porta init
./porta migrate up
```

In development:

```bash
yarn porta init
yarn porta migrate up
```

## Authentication

The standalone CLI authenticates using OIDC Authorization Code flow with PKCE:

```bash
# Login (opens browser for authentication)
porta login

# Login with explicit server URL
porta login --server https://porta.example.com:3443

# Check current identity
porta whoami

# Logout
porta logout
```

Credentials are stored at `~/.porta/credentials.json` with `0600` permissions.

## Global Options

Every standalone CLI command supports these global flags:

| Flag | Description |
|------|-------------|
| `--server <url>` | Porta server URL (or set `PORTA_SERVER` env var) |
| `--json` | Output results as JSON instead of formatted tables |
| `--verbose` | Enable verbose/debug logging |
| `--force` | Skip confirmation prompts |
| `--insecure` | Allow self-signed TLS certificates |

Server CLI commands support:

| Flag | Description |
|------|-------------|
| `--database-url` | Override `DATABASE_URL` |
| `--redis-url` | Override `REDIS_URL` |

## Command Reference

### Standalone CLI (`@portaidentity/cli`)

| Command | Description |
|---------|-------------|
| `porta login` | Authenticate via OIDC (browser-based) |
| `porta logout` | Clear stored credentials |
| `porta whoami` | Display current identity |
| `porta version` | Show CLI, SDK, and server version info |
| `porta org` | Manage organizations (CRUD, status, branding, destroy) |
| `porta app` | Manage applications, modules, roles, permissions, claims |
| `porta client` | Manage OIDC clients and secrets |
| `porta user` | Manage users (CRUD, status, password, roles, claims, 2FA) |
| `porta keys` | Manage ES256 signing keys |
| `porta config` | Manage system configuration |
| `porta audit` | View audit log entries |
| `porta health` | Check server health (via API) |
| `porta provision` | Declarative environment setup from YAML/JSON |

### Server CLI (Infrastructure Only)

These commands are available inside the Porta Docker container or development environment:

| Command | Description |
|---------|-------------|
| `porta init` | Bootstrap admin infrastructure (direct-DB) |
| `porta migrate` | Run database migrations (up/down/status) |
| `porta seed` | Load development seed data |
| `porta health` | Check DB + Redis connectivity (direct) |
| `porta user 2fa` | Admin 2FA status/disable/reset (direct-DB) |

## Detailed Documentation

- [Bootstrap & Authentication](./bootstrap.md) — `porta init`, `porta login`, `porta logout`
- [Organizations](./organizations.md) — `porta org` subcommands
- [Applications](./applications.md) — `porta app` and nested subcommands
- [Clients](./clients.md) — `porta client` and secret management
- [Users](./users.md) — `porta user` with status, password, roles, claims, 2FA
- [Infrastructure](./infrastructure.md) — `porta migrate`, `porta seed`, `porta health`
- [Provisioning](./provisioning.md) — `porta provision` declarative setup
