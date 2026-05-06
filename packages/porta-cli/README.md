# @portaidentity/cli

The official command-line interface for the [Porta Identity Platform](https://github.com/blendsdk/porta-identity) — manage organizations, applications, clients, users, RBAC, and more from your terminal.

## Features

- **26 command modules** — Full admin coverage: orgs, apps, clients, users, roles, permissions, claims, secrets, sessions, audit, and more
- **OIDC authentication** — Secure login via Authorization Code + PKCE (opens your browser, no passwords stored)
- **Declarative provisioning** — Set up entire environments from a single YAML/JSON file
- **Built on `@portaidentity/sdk`** — Type-safe API calls with automatic error handling
- **JSON output mode** — Machine-readable output for scripting and CI/CD (`--json`)
- **Shell completions** — Tab completion for Bash, Zsh, and Fish
- **Doctor diagnostics** — Built-in connectivity and configuration troubleshooting
- **Docker-friendly** — Headless/manual login mode auto-detected in containers

## Installation

```bash
# Install globally
npm install -g @portaidentity/cli

# Or use npx (no install)
npx @portaidentity/cli <command>

# Verify installation
porta version
```

## Quick Start

```bash
# 1. Log in to your Porta server (opens browser for OIDC login)
porta login --server https://your-porta-server.example.com

# 2. Check your identity
porta whoami

# 3. List organizations
porta org list

# 4. Create a user
porta user create <org-id> --email alice@example.com --given-name Alice --family-name Smith

# 5. Check server health
porta health --server https://your-porta-server.example.com
```

## Global Options

Every command supports these flags:

| Flag | Description | Default |
|------|-------------|---------|
| `--server` | Porta server URL | `https://porta.local:3443` |
| `--json` | Output as JSON (for scripting / CI) | `false` |
| `--force` | Skip confirmation prompts | `false` |
| `--insecure` | Disable TLS certificate verification | `false` |

## Command Reference

### Authentication

| Command | Description |
|---------|-------------|
| `porta login` | Authenticate via OIDC (Auth Code + PKCE) — opens browser |
| `porta logout` | Clear stored credentials |
| `porta whoami` | Display current identity (no network call) |

### Organizations

| Command | Description |
|---------|-------------|
| `porta org list` | List all organizations |
| `porta org create` | Create a new organization |
| `porta org show <id>` | Show organization details |
| `porta org update <id>` | Update organization properties |
| `porta org activate <id>` | Activate an organization |
| `porta org suspend <id>` | Suspend an organization |
| `porta org archive <id>` | Archive an organization |
| `porta org destroy <slug>` | Permanently delete an organization and all child entities |

### Applications

| Command | Description |
|---------|-------------|
| `porta app list` | List applications |
| `porta app create` | Create a new application |
| `porta app show <id>` | Show application details |
| `porta app update <id>` | Update application properties |
| `porta app activate <id>` | Activate an application |
| `porta app suspend <id>` | Suspend an application |
| `porta app archive <id>` | Archive an application |

**Nested: Roles** (`porta app role ...`)

| Command | Description |
|---------|-------------|
| `porta app role create <app-id>` | Create a role |
| `porta app role list <app-id>` | List roles |
| `porta app role show <app-id> <role-id>` | Show role details |
| `porta app role update <app-id> <role-id>` | Update a role |
| `porta app role archive <app-id> <role-id>` | Archive a role |
| `porta app role assign-perm <app-id> <role-id> <perm-id>` | Assign permission to role |
| `porta app role remove-perm <app-id> <role-id> <perm-id>` | Remove permission from role |

**Nested: Permissions** (`porta app permission ...`)

| Command | Description |
|---------|-------------|
| `porta app permission create <app-id>` | Create a permission |
| `porta app permission list <app-id>` | List permissions |
| `porta app permission show <app-id> <perm-id>` | Show permission details |
| `porta app permission archive <app-id> <perm-id>` | Archive a permission |

**Nested: Claims** (`porta app claim ...`)

| Command | Description |
|---------|-------------|
| `porta app claim create <app-id>` | Create a claim definition |
| `porta app claim list <app-id>` | List claim definitions |
| `porta app claim show <app-id> <claim-id>` | Show claim details |
| `porta app claim update <app-id> <claim-id>` | Update a claim definition |
| `porta app claim archive <app-id> <claim-id>` | Archive a claim definition |

**Nested: Modules** (`porta app module ...`)

| Command | Description |
|---------|-------------|
| `porta app module list <app-id>` | List application modules |
| `porta app module enable <app-id>` | Enable a module |
| `porta app module disable <app-id>` | Disable a module |

### Clients

| Command | Description |
|---------|-------------|
| `porta client list` | List clients |
| `porta client create` | Create a new client |
| `porta client show <id>` | Show client details |
| `porta client update <id>` | Update client properties |
| `porta client activate <id>` | Activate a client |
| `porta client suspend <id>` | Suspend a client |
| `porta client archive <id>` | Archive a client |

**Nested: Secrets** (`porta client secret ...`)

| Command | Description |
|---------|-------------|
| `porta client secret create <client-id>` | Generate a new client secret |
| `porta client secret list <client-id>` | List client secrets |
| `porta client secret revoke <client-id> <secret-id>` | Revoke a client secret |

### Users

| Command | Description |
|---------|-------------|
| `porta user list <org-id>` | List users in an organization |
| `porta user create <org-id>` | Create a new user |
| `porta user show <org-id> <user-id>` | Show user details |
| `porta user update <org-id> <user-id>` | Update user properties |
| `porta user invite <org-id>` | Send a user invitation |
| `porta user activate <org-id> <user-id>` | Activate a user |
| `porta user suspend <org-id> <user-id>` | Suspend a user |
| `porta user archive <org-id> <user-id>` | Archive a user |

**Nested: Roles** (`porta user role ...`)

| Command | Description |
|---------|-------------|
| `porta user role list <org-id> <user-id>` | List user's role assignments |
| `porta user role assign <org-id> <user-id> <role-id>` | Assign a role to a user |
| `porta user role remove <org-id> <user-id> <role-id>` | Remove a role from a user |

**Nested: Claims** (`porta user claim ...`)

| Command | Description |
|---------|-------------|
| `porta user claim list <org-id> <user-id>` | List user's claim values |
| `porta user claim set <org-id> <user-id>` | Set a claim value |
| `porta user claim remove <org-id> <user-id> <claim-id>` | Remove a claim value |

### Infrastructure

| Command | Description |
|---------|-------------|
| `porta config list` | List system configuration |
| `porta config get <key>` | Get a configuration value |
| `porta config set <key> <value>` | Set a configuration value |
| `porta keys list` | List signing keys |
| `porta keys generate` | Generate a new signing key |
| `porta keys rotate` | Rotate the active signing key |
| `porta audit list` | View audit logs (with filters) |
| `porta sessions list` | List active sessions |
| `porta sessions revoke <session-id>` | Revoke a session |
| `porta stats` | Display dashboard statistics |
| `porta health` | Check server connectivity (no auth required) |
| `porta bulk <action>` | Bulk status operations on orgs/users |
| `porta exports <entity-type>` | Export data as CSV or JSON |

### Provisioning

| Command | Description |
|---------|-------------|
| `porta provision --file <path>` | Apply a declarative YAML/JSON environment file |

Supports `--mode merge|overwrite`, `--dry-run`, and `--json` flags.

### Utilities

| Command | Description |
|---------|-------------|
| `porta version` | Show CLI and SDK versions |
| `porta doctor` | Run diagnostic checks (connectivity, auth, server compatibility) |
| `porta completion` | Generate shell completion scripts (Bash, Zsh, Fish) |

## Authentication

The CLI authenticates using **OIDC Authorization Code + PKCE** — the same secure flow used by SPAs:

1. `porta login` opens your default browser to the Porta login page
2. You authenticate (password, magic link, or 2FA)
3. The CLI receives the authorization code via a temporary localhost callback
4. Tokens are exchanged and stored at `~/.porta/credentials.json` (file permissions `0600`)

**In Docker or headless environments**, the CLI auto-detects containerization and switches to manual mode — it prints the authorization URL for you to open and paste the callback URL back.

```bash
# Standard login (opens browser)
porta login --server https://porta.example.com

# Explicit headless mode
porta login --server https://porta.example.com --no-browser
```

## Declarative Provisioning

Set up entire environments from a single YAML file:

```yaml
# provision.yaml
organizations:
  - name: Acme Corp
    slug: acme
    status: active
    applications:
      - name: Web Portal
        slug: web-portal
        clients:
          - name: web-app
            grant_types: [authorization_code]
            redirect_uris: [https://app.acme.com/callback]
        roles:
          - name: Admin
            permissions: [read, write, delete]
          - name: Viewer
            permissions: [read]
    users:
      - email: admin@acme.com
        given_name: Admin
        family_name: User
        roles: [Admin]
```

```bash
# Preview changes without applying
porta provision --file provision.yaml --dry-run

# Apply with merge mode (default)
porta provision --file provision.yaml

# Full overwrite mode
porta provision --file provision.yaml --mode overwrite
```

## JSON Output

All commands support `--json` for machine-readable output, making it easy to integrate with scripts and CI pipelines:

```bash
# Pipe to jq
porta org list --json | jq '.[].slug'

# Use in scripts
ORG_ID=$(porta org show my-org --json | jq -r '.id')
porta user list "$ORG_ID" --json
```

## Shell Completions

```bash
# Bash
porta completion >> ~/.bashrc

# Zsh
porta completion >> ~/.zshrc

# Fish
porta completion > ~/.config/fish/completions/porta.fish
```

## Documentation

📖 **Full documentation:** [blendsdk.github.io/porta-identity](https://blendsdk.github.io/porta-identity/)

- [CLI Overview](https://blendsdk.github.io/porta-identity/cli/overview) — Architecture, installation, and authentication
- [CLI Commands Reference](https://blendsdk.github.io/porta-identity/cli/organizations) — Detailed command documentation
- [Provisioning Guide](https://blendsdk.github.io/porta-identity/cli/provisioning) — Declarative environment setup
- [Bootstrap Guide](https://blendsdk.github.io/porta-identity/cli/bootstrap) — Initial server setup with `porta init`

## Related Packages

| Package | Description |
|---------|-------------|
| [`@portaidentity/sdk`](https://www.npmjs.com/package/@portaidentity/sdk) | TypeScript SDK for the Porta Admin API |
| [`porta`](https://github.com/blendsdk/porta-identity) | Porta Identity Platform (OIDC server) |

## Requirements

- **Node.js** ≥ 22.0.0
- A running **Porta** server to connect to

## License

MIT — See [LICENSE](../../LICENSE) for details.
