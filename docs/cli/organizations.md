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
porta org show --id <org-id>
```

## `porta org update`

```bash
porta org update --id <org-id> [--name "New Name"] [--locale en] [--default-login-methods password,magic_link]
```

## `porta org suspend`

```bash
porta org suspend --id <org-id>
```

Suspends the organization. All authentication requests will be rejected until reactivated.

## `porta org activate`

```bash
porta org activate --id <org-id>
```

Reactivates a suspended organization.

## `porta org archive`

```bash
porta org archive --id <org-id>
```

::: danger
Archiving is **permanent** and cannot be undone. The CLI will prompt for confirmation unless `--force` is used.
:::

## `porta org branding`

```bash
# View branding
porta org branding --id <org-id>

# Update branding
porta org branding --id <org-id> \
  --logo-url "https://example.com/logo.png" \
  --primary-color "#0078d4" \
  --company-name "Acme Corp"
```

| Flag | Description |
|------|-------------|
| `--logo-url` | Logo URL |
| `--favicon-url` | Favicon URL |
| `--primary-color` | Primary accent color (hex) |
| `--company-name` | Display name on login pages |
| `--custom-css` | Custom CSS for login pages |
