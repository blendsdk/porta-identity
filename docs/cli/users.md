# CLI: Users

Manage users, role assignments, custom claim values, and 2FA via the `porta user` command.

**Mode:** HTTP (requires `porta login`)

## User CRUD

### `porta user create`

```bash
porta user create --org <id> --email alice@example.com \
  [--name "Alice Smith"] [--password "secure-password"]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--org` | ✅ | Organization ID |
| `--email` | ✅ | Email address |
| `--name` | | Display name. Split into OIDC `givenName`/`familyName` on the first space (e.g. `"Alice Smith"` → given `Alice`, family `Smith`; a single token sets only `givenName`). |
| `--password` | | Initial password (omit for a passwordless user) |

### `porta user invite`

```bash
porta user invite --org <id> --email bob@example.com [--name "Bob Jones"]
```

Sends an invitation email. The `--name` value is split into OIDC
`givenName`/`familyName` on the first space (same behavior as `create`).

### `porta user list`

```bash
porta user list --org <id> [--status active|inactive|suspended|locked] \
  [--search "alice"] [--page 1] [--page-size 20]
```

The `--status` choices are `active`, `inactive`, `suspended`, and `locked`
(matching the server `UserStatus`).

### `porta user show`

```bash
porta user show --org <id> <user-id>
```

The Name column is derived from the user's `givenName`/`familyName`
(joined with a space; an em-dash when both are empty).

### `porta user update`

```bash
porta user update --org <id> <user-id> [--name "Alice Johnson"] [--email new@example.com]
```

`--name` is split into `givenName`/`familyName` just like `create`.

---

## Status Management

```bash
porta user suspend     --org <id> <user-id>
porta user unsuspend   --org <id> <user-id>   # suspended → active
porta user deactivate  --org <id> <user-id>   # active → inactive
porta user reactivate  --org <id> <user-id>   # inactive → active
porta user lock        --org <id> <user-id>
porta user unlock      --org <id> <user-id>
```

The lifecycle statuses are `active`, `inactive`, `suspended`, and `locked`.
`unsuspend` returns a suspended user to active; `reactivate` returns a
deactivated (inactive) user to active.

### `porta user set-password`

```bash
porta user set-password --org <id> <user-id> --password "new-password"
```


---

## User Roles

Assign and manage RBAC roles for a user.

### `porta user roles assign`

```bash
porta user roles assign --org-id <id> --user-id <id> --role-id <id>
```

### `porta user roles remove`

```bash
porta user roles remove --org-id <id> --user-id <id> --role-id <id>
```

### `porta user roles list`

```bash
porta user roles list --org-id <id> --user-id <id>
```

Shows all roles assigned to the user, grouped by application.

---

## User Custom Claims

Set and manage custom claim values for a user.

### `porta user claims set`

```bash
porta user claims set --org-id <id> --user-id <id> \
  --claim-id <id> --value "Engineering"
```

### `porta user claims remove`

```bash
porta user claims remove --org-id <id> --user-id <id> --claim-id <id>
```

### `porta user claims list`

```bash
porta user claims list --org-id <id> --user-id <id>
```

---

## Two-Factor Authentication

Admin commands for managing a user's 2FA enrollment. By default, these commands use HTTP mode (authenticated via `porta login`). Use `--direct` to bypass HTTP and connect directly to the database (useful for emergency access when the server is down).

**Permission required:** `admin:user:2fa` (for disable, reset, and recovery code operations)

### `porta user 2fa status`

```bash
# HTTP mode (default — requires porta login)
porta user 2fa status --org-id <id> --user-id <id>

# Direct mode (connects directly to database)
porta user 2fa status --user-id <id> --direct
```

Shows whether 2FA is enabled, the active method (`email` or `totp`), TOTP configuration status, and remaining recovery code count.

| Flag | Required | Description |
|------|----------|-------------|
| `--org-id` | HTTP mode | Organization ID (not needed in direct mode) |
| `--user-id` | ✅ | User ID |
| `--direct` | | Use direct database connection instead of HTTP |
| `--json` | | Output as JSON |

### `porta user 2fa disable`

```bash
# HTTP mode
porta user 2fa disable --org-id <id> --user-id <id>

# Direct mode
porta user 2fa disable --user-id <id> --direct
```

Force-disables 2FA for the user. Prompts for confirmation (use `--force` to skip). Protected: cannot disable the super-admin user's 2FA.

| Flag | Required | Description |
|------|----------|-------------|
| `--org-id` | HTTP mode | Organization ID |
| `--user-id` | ✅ | User ID |
| `--direct` | | Use direct database connection |
| `--force` | | Skip confirmation prompt |

### `porta user 2fa reset`

```bash
# HTTP mode
porta user 2fa reset --org-id <id> --user-id <id>

# Direct mode
porta user 2fa reset --user-id <id> --direct
```

Resets 2FA by disabling and clearing all enrollment data, forcing the user to re-enroll on next login. Prompts for confirmation. Protected: cannot reset the super-admin user's 2FA.

| Flag | Required | Description |
|------|----------|-------------|
| `--org-id` | HTTP mode | Organization ID |
| `--user-id` | ✅ | User ID |
| `--direct` | | Use direct database connection |
| `--force` | | Skip confirmation prompt |

---

## GDPR Compliance

Commands for GDPR data portability (Article 20) and right to erasure (Article 17).

### `porta user export`

```bash
porta user export --org-id <id> --user-id <id>
```

Exports all personal data for a user as a JSON document. The export includes profile data, organization membership, role assignments, custom claim values, audit log entries, 2FA enrollment status, and active OIDC sessions.

Use `--json` to pipe the output to a file:

```bash
porta user export --org-id <id> --user-id <id> --json > user-data.json
```

### `porta user purge`

```bash
porta user purge --org-id <id> --user-id <id>
```

Permanently anonymizes and deletes a user's personal data. This operation:

1. Anonymizes the user record (replaces PII with anonymized placeholders)
2. Deletes all associated data (roles, claims, tokens, 2FA, audit metadata)
3. Executes in a single database transaction

Prompts for confirmation before executing. Use `--force` to skip the confirmation prompt.

::: danger Irreversible
Data purge cannot be undone. Super-admin users cannot be purged as a safety measure.
:::
