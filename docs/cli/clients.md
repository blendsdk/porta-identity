# CLI: Clients

Manage OIDC clients and client secrets via the `porta client` command.

**Mode:** HTTP (requires `porta login`)

OIDC clients belong to one organization and reference one deployment-global application. In
`porta admin`, select the organization first, then open **OIDC Clients**. Switching organizations
closes the prior client workspace so client data is never carried into the new context.

The interactive workspace uses a DataGrid for the selected organization's clients. Client details
provide Basic, Redirects, Protocol, Login, and Secrets actions plus activation, deactivation, and
permanent revocation. Configuration dialogs keep the client name as a normal one-line field and
reload authoritative server state after saving.

## Client CRUD

### `porta client create`

```bash
porta client create \
  --name "ERP Web App" \
  --org-id <org-id> \
  --app-id <app-id> \
  --type public \
  --redirect-uris "https://erp.example.com/callback" \
  [--scope "openid profile email roles"] \
  [--cors-origins "https://erp.example.com"]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--name` | ✅ | Client display name |
| `--org-id` | ✅ | Organization ID |
| `--app-id` | ✅ | Application ID |
| `--type` | ✅ | `public` or `confidential` |
| `--redirect-uris` | ✅ | Comma-separated redirect URIs |
| `--application-type` | | `web`, `native`, or `spa` (default: `web`) |
| `--scope` | | Space-separated scopes |
| `--cors-origins` | | Comma-separated CORS origins |
| `--login-methods` | | Override org default login methods |

### `porta client list`

```bash
porta client list [--org-id <id>] [--status active] [--search "erp"]
```

### `porta client show`

```bash
porta client show --id <client-id>
```

Shows full client details including `effectiveLoginMethods`.

### `porta client update`

```bash
porta client update --id <client-id> \
  [--name "New Name"] \
  [--redirect-uris "https://new.example.com/callback"] \
  [--scope "openid profile email"]
```

### `porta client revoke`

```bash
porta client revoke --id <client-id>
```

::: warning
Revoking a client immediately invalidates all tokens and prevents new authentication flows.
:::

### `porta client activate` / `porta client deactivate`

```bash
porta client activate --id <client-id>
porta client deactivate --id <client-id>
```

---

## Client Secrets

Manage secrets for confidential clients. Supports multiple active secrets for zero-downtime rotation.

At most 10 active, unexpired secrets are allowed for one client. Revoke an old secret before
generating another when that limit is reached. An upgrade stops safely if existing data already has
more than 10; revoke excess secrets with the previous Porta version, then retry the upgrade.

Clients retained from versions that stored only legacy Argon2 secret hashes must generate one
modern secret before legacy overlap authentication can transition. During the overlap, a valid
active legacy credential may be canonicalized to the modern value; expired, revoked, or invalid
credentials are never canonicalized.

### `porta client secret generate`

```bash
porta client secret generate --client-id <id> [--label "production-2024"]
```

::: danger
The plaintext secret is displayed **only once**. Copy and store it securely.
:::

### `porta client secret list`

```bash
porta client secret list --client-id <id>
```

Shows secret metadata (ID, label, creation date) without plaintext values.

The Admin UI follows the same rule: generated plaintext appears in one transient dialog and is
discarded when that dialog closes. Later views show metadata only.

### `porta client secret revoke`

```bash
porta client secret revoke --client-id <id> --secret-id <id>
```

---

## Login Methods

Manage per-client login method overrides.

### `porta client login-methods get`

```bash
porta client login-methods get --client-id <id>
```

Shows the effective login methods (client override or inherited from org).

### `porta client login-methods set`

```bash
porta client login-methods set --client-id <id> --methods password
porta client login-methods set --client-id <id> --methods password,magic_link
```

### `porta client login-methods clear`

```bash
porta client login-methods clear --client-id <id>
```

Removes the client-specific override, causing the client to inherit login methods from its organization.
