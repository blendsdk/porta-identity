# CLI: Organizations

Manage tenant organizations via the `porta org` command.

**Mode:** HTTP (requires `porta login`)

## `porta org create`

```bash
porta org create --name "Acme Corp" [--locale en] [--login-methods password,magic_link]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--name` | ✅ | Organization name |
| `--locale` | | Default locale (e.g., `en`) |
| `--login-methods` | | Comma-separated login methods |

## `porta org list`

```bash
porta org list [--status active] [--search "acme"] [--page 1] [--page-size 20]
```

| Flag | Description |
|------|-------------|
| `--status` | Filter by status |
| `--search` | Search by name or slug |
| `--page` | Page number |
| `--page-size` | Items per page |

## `porta org show`

```bash
porta org show <id-or-slug>
```

## `porta org update`

```bash
porta org update <id-or-slug> [--name "New Name"] [--default-locale en] [--login-methods password,magic_link]
```

## `porta org suspend`

```bash
porta org suspend <id-or-slug>
```

Suspends the organization. All authentication requests will be rejected until reactivated.

## `porta org activate`

```bash
porta org activate <id-or-slug>
```

Reactivates a suspended organization.

## `porta org delete`

```bash
porta org delete <id-or-slug>
```

Permanently deletes the organization and its owned users, clients, and security data. The CLI
always asks whether to keep or delete the named organization. There is no record-deletion
`--force` option.

::: danger Irreversible
Deletion cannot be undone. The super-admin organization cannot be deleted.
:::

## `porta org branding`

```bash
# Update branding
porta org branding <id-or-slug> \
  --primary-color "#0078d4" \
  --company-name "Acme Corp" \
  --custom-css "body { font-family: sans-serif; }"
```

| Flag | Description |
|------|-------------|
| `--primary-color` | Primary accent color (hex) |
| `--company-name` | Display name on login pages |
| `--custom-css` | Custom CSS for login pages |

The conventional `porta org branding` command updates text branding. Use the embedded Admin UI,
Admin API, or TypeScript SDK to manage fallback image URLs and uploaded logo/favicon assets.

## Embedded Admin UI

Start the terminal Admin UI with `yarn admin` in the repository playground, or with
`porta admin --server <issuer-url>` from an installed CLI. Select an organization, then choose
**Organizations → Manage current organization…**.

The maximized workspace has three tabs:

- **Overview** edits the organization name and default locale. It also activates or suspends the
  selected organization. The super-admin organization cannot be suspended.
- **Authentication** selects one or both organization-default login methods and the password-login
  2FA policy. Clients configured to inherit login methods use this selection.
- **Branding** edits company name, primary color, and external fallback URLs. It also adds, replaces,
  or removes stored logo and favicon assets. Custom CSS remains available through the conventional
  CLI and API, but is not exposed here.

Changes save directly from their owning tab. A tab reports unchanged, saving, saved, failed, or
reloaded-after-failure state. Asset changes are immediate after file selection or confirmation.
The workspace discards late results if the selected organization or authenticated session changes.
