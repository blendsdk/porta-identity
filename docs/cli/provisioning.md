# Declarative Provisioning

The `porta provision` command creates organizations, applications, clients, roles, permissions, custom claims, role-permission mappings, users, application modules, and branding configurations from a single YAML or JSON file. It is the fastest way to set up a complete Porta environment from scratch or to replicate a known configuration across environments.

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
| `allow_passwords` | boolean | No | Enable password provisioning (default: `false`). See [Password Provisioning](#password-provisioning). |
| `organizations` | array | Yes | One or more organizations to provision |

### Organization

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name |
| `slug` | string | No | URL-friendly identifier (auto-generated from name if omitted) |
| `default_locale` | string | No | Default locale code (e.g., `en`, `fr`) |
| `default_login_methods` | string[] | No | Default login methods: `password`, `magic_link` |
| `two_factor_policy` | string | No | 2FA policy: `optional`, `required_email`, `required_totp`, `required_any` |
| `branding` | object | No | Organization branding configuration. See [Branding](#branding). |
| `applications` | array | No | Nested applications for this organization |
| `users` | array | No | Users to create in this organization. See [User](#user). |

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
| `modules` | array | No | Application modules. See [Module](#module). |

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
| `post_logout_redirect_uris` | string[] | No | Allowed post-logout redirect URIs |
| `allowed_origins` | string[] | No | CORS allowed origins |
| `require_pkce` | boolean | No | Require PKCE (default: `true`). Setting to `false` emits a security warning. |
| `token_endpoint_auth_method` | string | No | Auth method: `client_secret_basic`, `client_secret_post`, `none` |
| `secret` | object | No | Secret configuration for confidential clients. See [Secret Config](#secret-config). |

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

### User

Users can be nested under organizations. Roles and claim values reference applications by slug.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | User email address |
| `given_name` | string | No | First name |
| `family_name` | string | No | Last name |
| `locale` | string | No | Locale code (e.g., `en`) |
| `status` | string | No | `active` or `inactive` (default: `active`) |
| `email_verified` | boolean | No | Whether email is verified (default: `false`) |
| `password` | string | No | Initial password (requires `allow_passwords: true`). See [Password Provisioning](#password-provisioning). |
| `roles` | array | No | Role assignments: `[{ app: "app-slug", role: "role-slug" }]` |
| `claims` | array | No | Claim values: `[{ app: "app-slug", claim: "claim-slug", value: ... }]` |

### Module

Application modules represent sub-components of an application.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name |
| `slug` | string | Yes | URL-friendly identifier |
| `description` | string | No | Module description |
| `status` | string | No | `active` or `inactive` (default: `active`) |

### Branding

Organization branding customization.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `primary_color` | string | No | CSS color value (e.g., `#1a73e8`) |
| `company_name` | string | No | Display name for login pages |
| `custom_css` | string | No | Custom CSS for login templates |
| `logo_url` | string | No | URL to organization logo |
| `favicon_url` | string | No | URL to favicon |

### Secret Config

Optional secret configuration for confidential clients. Only allowed on `confidential` client types.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | string | No | Human-readable label for the secret |
| `expires_at` | string | No | ISO 8601 expiry date (e.g., `2027-01-01T00:00:00Z`) |
| `expires_in` | string | No | Duration until expiry: `90d`, `6m`, `1y`, `24h` |

> **Note:** `expires_at` and `expires_in` are mutually exclusive — set one or neither.

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

## Password Provisioning

By default, provisioning files **cannot include passwords**. This is a deliberate security decision — production environments should use invitation flows or magic links instead.

For **development and testing only**, you can enable password provisioning:

```yaml
version: "1.0"
allow_passwords: true              # ⚠ Development/testing only!

organizations:
  - name: Dev Org
    slug: dev
    users:
      - email: admin@dev.example.com
        given_name: Admin
        password: "SecureP@ss123!"   # NIST SP 800-63B validated
        email_verified: true
        roles:
          - app: my-app
            role: admin
```

**Security notes:**
- Passwords are validated against NIST SP 800-63B requirements (minimum 8 characters, no common patterns)
- Passwords are hashed client-side with **Argon2id** before HTTP transport — plaintext never touches the wire or server
- The `allow_passwords` flag is intentionally separate from the user data to make the security trade-off explicit
- If a `password` field is present without `allow_passwords: true`, the command fails with a clear error

## How It Works

1. **Parse** — Reads the YAML/JSON file and validates against the schema
2. **Transform** — Converts the nested structure to a flat import manifest (includes client-side password hashing if applicable)
3. **Import** — Sends the manifest to the Admin API import endpoint, which processes entities in 12 dependency-ordered phases within a single transaction
4. **Report** — Displays a summary of created/skipped/updated/failed entities and client credentials

**Import engine processing order (single transaction):**

| Phase | Entity Type | Dependencies |
|-------|-------------|-------------|
| 1 | Organizations (+branding, 2FA policy) | None |
| 2 | Applications | Organizations |
| 3 | Clients + secrets | Organizations, Applications |
| 4 | Roles | Applications |
| 5 | Permissions | Applications |
| 6 | Claim definitions | Applications |
| 7 | Role-permission mappings | Roles, Permissions |
| 8 | Application modules | Applications |
| 9 | Users | Organizations |
| 10 | User-role assignments | Users, Roles |
| 11 | User claim values | Users, Claim definitions |
| 12 | System config overrides | None |

All phases execute within a single PostgreSQL transaction. Any error triggers a full ROLLBACK — no partial state.

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
