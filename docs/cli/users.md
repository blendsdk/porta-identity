# CLI: Users

Manage users, role assignments, custom claim values, and 2FA via the `porta user` command.

**Mode:** HTTP (requires `porta login`)

## User CRUD

### `porta user create`

```bash
porta user create --org <id> --email alice@example.com \
  [--name "Alice Smith"] [--password "secure-password"]
```

| Flag         | Required | Description                                                                                                                                                             |
| ------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--org`      | ✅       | Organization ID                                                                                                                                                         |
| `--email`    | ✅       | Email address                                                                                                                                                           |
| `--name`     |          | Display name. Split into OIDC `givenName`/`familyName` on the first space (e.g. `"Alice Smith"` → given `Alice`, family `Smith`; a single token sets only `givenName`). |
| `--password` |          | Initial password (omit for a passwordless user)                                                                                                                         |

### `porta user invite`

```bash
porta user invite --org <id> --email bob@example.com [--name "Bob Jones"]
```

Sends an invitation email. The `--name` value is split into OIDC
`givenName`/`familyName` on the first space (same behavior as `create`).

### `porta user list`

```bash
porta user list --org <id> [--status active|inactive|locked] \
  [--search "alice"] [--page 1] [--page-size 20]
```

The `--status` choices are `active`, `inactive`, and `locked`
(matching the server `UserStatus`).

### `porta user show`

```bash
porta user show --org <id> <user-id>
```

The Name column is derived from the user's `givenName`/`familyName`
(joined with a space; an em-dash when both are empty).

### `porta user update`

```bash
porta user update --org <id> <user-id> [--name "Alice Johnson"]
```

`--name` is split into `givenName`/`familyName` just like `create`.

---

## Status Management

```bash
porta user deactivate  --org <id> <user-id>   # active → inactive
porta user activate    --org <id> <user-id>   # inactive → active
```

Administrators manage only the `active` and `inactive` lifecycle states. The
server may temporarily report `locked` after failed login attempts and restores
the account automatically after the configured cooldown.

### `porta user set-password`

```bash
porta user set-password --org <id> <user-id> --password "new-password"
```

### `porta user history`

```bash
porta user history --org <id> <user-id>
```

Returns the current first-page history envelope.

## Interactive Admin UI

After `porta admin` authenticates and an organization is selected, open the Users menu to browse,
search, filter, create, or invite users. Enter on a user row opens its detail view. Available profile,
credential, history, lifecycle, and Delete actions are shown only when the verified identity has the
corresponding permission. The detail view also offers **Roles** when the administrator can read
roles. That modal lists direct assignments across applications and allows assignments and removals
only when the corresponding capability is available. Import and export are not part of this screen.

---

## User Roles

Assign and manage a user's direct RBAC role assignments within one organization. The role itself
belongs to an application, so use `porta app role list <app-id>` to find its ID.

### `porta user roles assign`

```bash
porta user roles assign --org <org-id> <user-id> --role <role-id>
```

### `porta user roles remove`

```bash
porta user roles remove --org <org-id> <user-id> --role <role-id>
```

### `porta user roles list`

```bash
porta user roles list --org <org-id> <user-id>
```

The list shows the role ID, name, slug, and creation date. Removing a role can invalidate the
current admin session; authenticate again when the command reports that reauthentication is
required.

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

| Flag        | Required  | Description                                    |
| ----------- | --------- | ---------------------------------------------- |
| `--org-id`  | HTTP mode | Organization ID (not needed in direct mode)    |
| `--user-id` | ✅        | User ID                                        |
| `--direct`  |           | Use direct database connection instead of HTTP |
| `--json`    |           | Output as JSON                                 |

### `porta user 2fa disable`

```bash
# HTTP mode
porta user 2fa disable --org-id <id> --user-id <id>

# Direct mode
porta user 2fa disable --user-id <id> --direct
```

Force-disables 2FA for the user. Prompts for confirmation (use `--force` to skip). Protected: cannot disable the super-admin user's 2FA.

| Flag        | Required  | Description                    |
| ----------- | --------- | ------------------------------ |
| `--org-id`  | HTTP mode | Organization ID                |
| `--user-id` | ✅        | User ID                        |
| `--direct`  |           | Use direct database connection |
| `--force`   |           | Skip confirmation prompt       |

### `porta user 2fa reset`

```bash
# HTTP mode
porta user 2fa reset --org-id <id> --user-id <id>

# Direct mode
porta user 2fa reset --user-id <id> --direct
```

Resets 2FA by disabling and clearing all enrollment data, forcing the user to re-enroll on next login. Prompts for confirmation. Protected: cannot reset the super-admin user's 2FA.

| Flag        | Required  | Description                    |
| ----------- | --------- | ------------------------------ |
| `--org-id`  | HTTP mode | Organization ID                |
| `--user-id` | ✅        | User ID                        |
| `--direct`  |           | Use direct database connection |
| `--force`   |           | Skip confirmation prompt       |

---

## Data Export and Deletion

Commands for data portability and physical user deletion.

### `porta user export`

```bash
porta user export --org-id <id> --user-id <id>
```

Exports all personal data for a user as a JSON document. The export includes profile data, organization membership, role assignments, custom claim values, audit log entries, 2FA enrollment status, and active OIDC sessions.

Use `--json` to pipe the output to a file:

```bash
porta user export --org-id <id> --user-id <id> --json > user-data.json
```

### `porta user delete`

```bash
porta user delete <org-id> <user-id>
```

Permanently deletes the user and owned identity and security data. This includes role assignments,
claim values, credentials, recovery data, and server-backed sessions. Audit history is retained
separately under the configured audit policy and can still identify the deleted user.

The CLI always asks whether to keep or delete the named user. There is no record-deletion
`--force` option.

::: danger Irreversible
Deletion cannot be undone. A control-plane user cannot be deleted when that would leave no other
active user with the exact built-in `porta-super-admin` role.
:::
