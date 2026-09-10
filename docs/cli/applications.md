# CLI: Applications

Manage applications, modules, roles, permissions, and claim definitions via the `porta app` command.

**Mode:** HTTP (requires `porta login`)

Applications are deployment-global product definitions. They are shared across organizations;
organization-specific OIDC registrations belong under Clients instead.

## Interactive Admin UI

Run `porta admin`, authenticate, and open **Applications**. No organization selection is required.
The workspace lists every application, opens application details, and supports application creation,
editing, deletion, and module creation, editing, deactivation, and deletion according to the
administrator's permissions. Creation, editing, and deletion dialogs show a quiet scope notice
when the change can affect clients in multiple organizations.

## Application CRUD

### `porta app create`

```bash
porta app create --name "ERP System" [--description "Enterprise resource planning"]
```

### `porta app list`

```bash
porta app list [--status active] [--search "erp"]
```

### `porta app show`

```bash
porta app show --id <app-id>
```

### `porta app update`

```bash
porta app update --id <app-id> [--name "New Name"] [--description "Updated description"]
```

### `porta app delete`

```bash
porta app delete <id-or-slug>
```

Permanently deletes the deployment-global application, including its modules, clients, roles,
permissions, claim definitions, and dependent security data. The CLI always asks whether to keep
or delete the named application.

---

## Application Modules

Logical groupings within an application (e.g., CRM, Invoicing, HR).

### `porta app module add`

```bash
porta app module add --app-id <id> --name "Invoicing" [--description "Invoice management"]
```

### `porta app module list`

```bash
porta app module list --app-id <id>
```

### `porta app module remove`

```bash
porta app module remove --app-id <id> --module-id <id>
```

---

## Roles

RBAC roles are scoped to one application. A role can only contain permissions from that same
application. Role and permission identifiers are positional arguments; role metadata remains in
named options.

### `porta app role create`

```bash
porta app role create <app-id> --name "Sales Manager" [--slug sales-manager] \
  [--description "Full sales access"]
```

### `porta app role list`

```bash
porta app role list <app-id>
```

### `porta app role show`

```bash
porta app role show <app-id> <role-id>
```

### `porta app role update`

```bash
porta app role update <app-id> <role-id> [--name "New Name"] [--description "New description"]
```

### `porta app role delete`

```bash
porta app role delete <app-id> <role-id>
```

### `porta app role assign-perm`

```bash
porta app role assign-perm <app-id> <role-id> <permission-id>
```

### `porta app role remove-perm`

```bash
porta app role remove-perm <app-id> <role-id> <permission-id>
```

Deleting a role asks for confirmation, then permanently deletes its user assignments and
permission links. Removing a permission from a role or deleting a role can invalidate the current
admin session; authenticate again when the command reports that reauthentication is required.

---

## Permissions

Permissions are scoped to one application. Their slugs are the values external applications
receive in tokens for the corresponding OIDC client application.

### `porta app permission create`

```bash
porta app permission create <app-id> --name "Edit deals" --slug deals:write \
  [--description "Create and edit deals"]
```

### `porta app permission list`

```bash
porta app permission list <app-id>
```

### `porta app permission show`

```bash
porta app permission show <app-id> <permission-id>
```

### `porta app permission update`

```bash
porta app permission update <app-id> <permission-id> [--name "New name"] \
  [--description "New description"]
```

### `porta app permission delete`

```bash
porta app permission delete <app-id> <permission-id>
```

Deleting a permission asks for confirmation, then permanently deletes its role links. The command
reports when the current admin must authenticate again.

---

## Custom Claim Definitions

Claim definitions scoped to an application. See also [CLI: Users](/cli/users) for setting user claim values.

### `porta app claim create`

```bash
porta app claim create --app-id <id> --name "department" --type string \
  [--description "Employee department"]
```

| Flag            | Required | Description                              |
| --------------- | -------- | ---------------------------------------- |
| `--app-id`      | ✅       | Application ID                           |
| `--name`        | ✅       | Claim name                               |
| `--type`        | ✅       | `string`, `number`, `boolean`, or `json` |
| `--description` |          | Description                              |

### `porta app claim list`

```bash
porta app claim list --app-id <id>
```

### `porta app claim show`

```bash
porta app claim show --app-id <id> --claim-id <id>
```

### `porta app claim delete`

```bash
porta app claim delete <app-id> <claim-id>
```

All record-deletion commands require a Keep/Delete-name confirmation. They do not accept a
record-deletion `--force` bypass.

## Modules

### `porta app module delete`

```bash
porta app module delete <app-id> <module-id>
```

Permanently deletes the module and its permissions and dependent links after confirmation.
