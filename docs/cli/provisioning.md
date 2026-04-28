# Declarative Provisioning

The `porta provision` command creates organizations, applications, clients, roles, permissions, custom claims, and role-permission mappings from a single YAML or JSON file. It is the fastest way to set up a complete Porta environment from scratch or to replicate a known configuration across environments.

## Quick Start

```bash
# Preview what will be created (no changes)
porta provision -f my-setup.yaml --dry-run

# Apply the configuration
porta provision -f my-setup.yaml

# Apply with merge mode (skip existing, add new)
porta provision --file my-setup.yaml --mode merge

# JSON output for scripting
porta provision --file my-setup.yaml --json
```

## Docker Usage

When running Porta via Docker, use the CLI wrapper script or stdin piping
to pass provisioning files from the host to the container.

### With the CLI Wrapper (Recommended)

The `porta` wrapper script automatically detects host files and pipes them
to the container:

```bash
# Install the wrapper (one-time)
curl -fsSL https://raw.githubusercontent.com/blendsdk/porta-identity/main/docker/porta.sh \
  -o porta && chmod +x porta

# Use normally — host files work transparently
./porta provision -f setup.yaml --dry-run
./porta provision -f setup.yaml
./porta provision -f setup.yaml --mode overwrite
```

### Without the Wrapper

Pipe the file via stdin using shell redirection:

```bash
docker exec porta-app porta provision -f /dev/stdin < setup.yaml
docker exec porta-app porta provision -f /dev/stdin --dry-run < setup.yaml
```

> **Note:** The file path passed to `-f` is resolved inside the container.
> Host paths like `./setup.yaml` won't work with `docker exec` directly — use
> the wrapper or stdin piping instead.

## File Format

Provisioning files use a nested, human-readable structure. The file describes organizations at the top level, with applications, clients, roles, permissions, and claims nested inside.

### Minimum Required Fields

```yaml
version: "1.0"

organizations:
  - name: My Organization
```

That's it. The slug will be auto-generated from the name (`my-organization`), and all optional fields use sensible defaults.

### Full Structure

```yaml
version: "1.0"                      # Required — file format version

config:                              # Optional — system configuration overrides
  access_token_ttl: "3600"
  refresh_token_ttl: "86400"
  session_ttl: "43200"

organizations:
  - name: Acme Corp                  # Required
    slug: acme                       # Optional — auto-generated from name
    default_locale: en               # Optional — defaults to "en"
    default_login_methods:           # Optional — defaults to [password, magic_link]
      - password
      - magic_link

    applications:
      - name: Customer Portal        # Required
        slug: customer-portal        # Optional — auto-generated from name
        description: Main app        # Optional

        clients:
          - client_name: Web App
            client_type: confidential
            application_type: web
            grant_types:
              - authorization_code
              - refresh_token
            redirect_uris:
              - https://portal.acme.com/callback
            response_types:
              - code
            scope: openid profile email

        permissions:
          - name: Read Customers
            slug: read-customers
          - name: Write Customers
            slug: write-customers
          - name: Delete Customers
            slug: delete-customers

        roles:
          - name: Admin
            slug: admin
            description: Full access to all resources
            permissions:             # Inline permission assignment
              - read-customers
              - write-customers
              - delete-customers
          - name: Viewer
            slug: viewer
            description: Read-only access
            permissions:
              - read-customers

        claim_definitions:
          - name: Department
            slug: department
            claim_type: string
            description: User department
          - name: Employee ID
            slug: employee-id
            claim_type: number
```

## Field Reference

### Top Level

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | Yes | File format version (must be `"1.0"`) |
| `config` | object | No | System configuration key-value overrides |
| `organizations` | array | Yes | One or more organizations to provision |

### Organization

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name |
| `slug` | string | No | URL-friendly identifier (auto-generated from name if omitted) |
| `default_locale` | string | No | Default locale code (e.g., `en`, `fr`) |
| `default_login_methods` | string[] | No | Default login methods: `password`, `magic_link` |
| `applications` | array | No | Nested applications for this organization |

### Application

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name |
| `slug` | string | No | URL-friendly identifier |
| `description` | string | No | Application description |
| `clients` | array | No | OIDC clients for this application |
| `roles` | array | No | RBAC roles |
| `permissions` | array | No | RBAC permissions |
| `claim_definitions` | array | No | Custom claim definitions |

### Client

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `client_name` | string | Yes | Human-readable name |
| `client_type` | string | Yes | `confidential` or `public` |
| `application_type` | string | No | `web` or `native` |
| `grant_types` | string[] | No | OAuth grant types |
| `redirect_uris` | string[] | No | Allowed redirect URIs |
| `response_types` | string[] | No | OAuth response types |
| `scope` | string | No | Space-separated scope string |
| `login_methods` | string[] | No | Per-client login method override (null = inherit from org) |

### Role

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name |
| `slug` | string | No | URL-friendly identifier |
| `description` | string | No | Role description |
| `permissions` | string[] | No | Permission slugs to assign (creates role-permission mappings) |

### Permission

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name |
| `slug` | string | Yes | URL-friendly identifier |
| `description` | string | No | Permission description |

### Claim Definition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name |
| `slug` | string | Yes | URL-friendly identifier |
| `claim_type` | string | Yes | Value type: `string`, `number`, `boolean`, `json` |
| `description` | string | No | Claim description |

### Config

The `config` section accepts key-value pairs that map to Porta's system configuration. Values are strings, numbers, or booleans:

```yaml
config:
  access_token_ttl: "3600"       # Token TTL in seconds
  refresh_token_ttl: "86400"
  session_ttl: "43200"
```

Only existing configuration keys are updated. Unknown keys are ignored for safety.

## Import Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `merge` (default) | Skip existing entities, create new ones | Safe for re-running, incremental setup |
| `overwrite` | Replace existing entities, create new ones | Reset to a known state |

```bash
# Merge mode (default) — safe to re-run
porta provision --file setup.yaml --mode merge

# Overwrite mode — replaces existing
porta provision --file setup.yaml --mode overwrite
```

## Role-Permission Mappings

When roles include a `permissions` array, the provision command automatically creates role-permission mappings after the main import:

```yaml
roles:
  - name: Admin
    slug: admin
    permissions:           # These permission slugs must match
      - read               # permission slugs defined in the same
      - write              # application (or already existing)
```

This is equivalent to manually running:
```bash
porta app role assign-perm --app-id <app> --role admin --permission read
porta app role assign-perm --app-id <app> --role admin --permission write
```

## How It Works

1. **Parse** — Reads the YAML/JSON file and validates against the schema
2. **Transform** — Converts the nested structure to a flat import manifest
3. **Import** — Sends the manifest to the Admin API import endpoint
4. **Post-Import** — Creates role-permission mappings and applies config overrides
5. **Report** — Displays a summary of created/skipped/failed entities

```
┌─────────────────┐
│  YAML/JSON File  │
└────────┬────────┘
         ↓
┌─────────────────┐
│ Schema Validation│  ← Zod validates structure
└────────┬────────┘
         ↓
┌─────────────────┐
│   Transform to   │  ← Nested → Flat manifest
│  Import Manifest │    (adds org_slug/app_slug refs)
└────────┬────────┘
         ↓
┌─────────────────┐
│ POST /api/admin/ │  ← Standard import API
│  import          │
└────────┬────────┘
         ↓
┌─────────────────┐
│  Post-Import     │  ← Role-perm mappings + config
└────────┬────────┘
         ↓
┌─────────────────┐
│  Result Summary  │
└─────────────────┘
```

## Dry Run

Use `--dry-run` to preview what would be created without making any changes:

```bash
porta provision --file setup.yaml --dry-run
```

Output shows the parsed manifest summary and validation results.

## JSON Output

For scripting and CI/CD integration:

```bash
porta provision --file setup.yaml --json
```

Returns structured JSON with import results.

## File Formats

The command supports both YAML and JSON:

| Extension | Format |
|-----------|--------|
| `.yaml` | YAML |
| `.yml` | YAML |
| `.json` | JSON |

## Tips

- **Start simple** — Begin with just organizations and applications, then add roles/permissions later
- **Use slugs** — Explicitly set slugs for predictable identifiers (important for CI/CD)
- **Merge mode is safe** — You can re-run the same file and it will skip existing entities
- **Validate first** — Always use `--dry-run` before applying to a production environment
- **Version control** — Keep your provisioning files in git alongside your application code
- **Environment variants** — Create separate files for dev, staging, and production

## Related

- [CLI Overview](/cli/overview) — Full CLI command reference
- [Organizations](/cli/organizations) — Organization management commands
- [Import/Export](/api/imports) — Raw import API reference
