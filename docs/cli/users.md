# CLI: Users

Manage users, role assignments, custom claim values, and 2FA via the `porta user` command.

**Mode:** HTTP (requires `porta login`)

## User CRUD

### `porta user create`

```bash
porta user create --org-id <id> --email alice@example.com \
  [--given-name Alice] [--family-name Smith] [--password "secure-password"]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--org-id` | ✅ | Organization ID |
| `--email` | ✅ | Email address |
| `--given-name` | | First name |
| `--family-name` | | Last name |
| `--nickname` | | Nickname |
| `--password` | | Initial password |
| `--phone-number` | | Phone number |
| `--locale` | | User locale |

### `porta user invite`

```bash
porta user invite --org-id <id> --email bob@example.com \
  [--given-name Bob] [--family-name Jones]
```

Creates the user with `invited` status and sends an invitation email.

### `porta user list`

```bash
porta user list --org-id <id> [--status active] [--search "alice"] [--page 1]
```

### `porta user show`

```bash
porta user show --org-id <id> --user-id <id>
```

### `porta user update`

```bash
porta user update --org-id <id> --user-id <id> \
  [--given-name "Alice"] [--family-name "Johnson"] [--locale en]
```

---

## Status Management

```bash
porta user suspend  --org-id <id> --user-id <id>
porta user activate --org-id <id> --user-id <id>
porta user lock     --org-id <id> --user-id <id>
porta user unlock   --org-id <id> --user-id <id>
porta user archive  --org-id <id> --user-id <id>
```

### `porta user set-password`

```bash
porta user set-password --org-id <id> --user-id <id> --password "new-password"
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

Admin commands for managing a user's 2FA enrollment.

### `porta user 2fa status`

```bash
porta user 2fa status --org-id <id> --user-id <id>
```

Shows whether 2FA is enabled, the method (TOTP/email), and enrollment date.

### `porta user 2fa disable`

```bash
porta user 2fa disable --org-id <id> --user-id <id>
```

Force-disables 2FA for the user. Prompts for confirmation.

### `porta user 2fa reset`

```bash
porta user 2fa reset --org-id <id> --user-id <id>
```

Resets 2FA, forcing the user to re-enroll on next login. Prompts for confirmation.

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
