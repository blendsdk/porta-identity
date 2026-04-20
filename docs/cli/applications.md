# CLI: Applications

Manage applications, modules, roles, permissions, and claim definitions via the `porta app` command.

**Mode:** HTTP (requires `porta login`)

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

### `porta app archive`

```bash
porta app archive --id <app-id>
```

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

RBAC roles scoped to an application.

### `porta app role create`

```bash
porta app role create --app-id <id> --name "Sales Manager" [--description "Full sales access"]
```

### `porta app role list`

```bash
porta app role list --app-id <id>
```

### `porta app role show`

```bash
porta app role show --app-id <id> --role-id <id>
```

### `porta app role update`

```bash
porta app role update --app-id <id> --role-id <id> [--name "New Name"]
```

### `porta app role archive`

```bash
porta app role archive --app-id <id> --role-id <id>
```

### `porta app role assign-perm`

```bash
porta app role assign-perm --app-id <id> --role-id <id> --permission-id <id>
```

### `porta app role remove-perm`

```bash
porta app role remove-perm --app-id <id> --role-id <id> --permission-id <id>
```

---

## Permissions

Permissions scoped to an application.

### `porta app permission create`

```bash
porta app permission create --app-id <id> --name "deals:write" [--description "Create and edit deals"]
```

### `porta app permission list`

```bash
porta app permission list --app-id <id>
```

### `porta app permission show`

```bash
porta app permission show --app-id <id> --permission-id <id>
```

### `porta app permission archive`

```bash
porta app permission archive --app-id <id> --permission-id <id>
```

---

## Custom Claim Definitions

Claim definitions scoped to an application. See also [CLI: Users](/cli/users) for setting user claim values.

### `porta app claim create`

```bash
porta app claim create --app-id <id> --name "department" --type string \
  [--description "Employee department"]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--app-id` | ✅ | Application ID |
| `--name` | ✅ | Claim name |
| `--type` | ✅ | `string`, `number`, `boolean`, or `json` |
| `--description` | | Description |

### `porta app claim list`

```bash
porta app claim list --app-id <id>
```

### `porta app claim show`

```bash
porta app claim show --app-id <id> --claim-id <id>
```

### `porta app claim archive`

```bash
porta app claim archive --app-id <id> --claim-id <id>
```
