# Domain Commands: org, app, client, user

> **Document**: 05-domain-commands.md
> **Parent**: [Index](00-index.md)

## Overview

Domain commands provide CRUD and lifecycle management for all business entities: organizations, applications (with modules, roles, permissions, claims), clients (with secrets), and users (with roles, claims, 2FA). These commands are the primary administrative interface for managing the Porta OIDC provider.

Each command group delegates to the corresponding service module. Commands are split into separate files when nested subcommand groups would push a single file beyond 500 lines.

## File Structure & Splitting Strategy

Several command groups have nested subcommands that would make a single file too large. These are split into separate files:

| Command Group | File(s) | Reason |
| --- | --- | --- |
| `org` | `org.ts` (8 subcommands) | ~300 lines — single file OK |
| `app` | `app.ts` (5) + `app-module.ts` (4) + `app-role.ts` (7) + `app-permission.ts` (4) + `app-claim.ts` (4) | 24 total subcommands would be ~700+ lines |
| `client` | `client.ts` (5) + `client-secret.ts` (3) | 8 total subcommands, secret has special display |
| `user` | `user.ts` (12) + `user-role.ts` (3) + `user-claim.ts` (3) | 18 total subcommands would be ~600+ lines |

Split files export their command group, and the parent file imports and registers them as nested commands.

---

## Organization Commands (`src/cli/commands/org.ts`)

```
porta org create --name "Acme Corp" [--slug acme-corp] [--locale en]
porta org list [--status active|suspended|archived] [--page 1] [--page-size 20]
porta org show <id-or-slug>
porta org update <id-or-slug> --name "New Name" [--default-locale fr]
porta org suspend <id-or-slug>
porta org activate <id-or-slug>
porta org archive <id-or-slug>
porta org branding <id-or-slug> --logo-url "..." [--primary-color "#..."]
```

**Subcommands:**

| Subcommand | Description | Service Function | Destructive? |
| --- | --- | --- | --- |
| `create` | Create organization | `createOrganization()` | No |
| `list` | List organizations | `listOrganizations()` | No |
| `show <id-or-slug>` | Show org details | `getOrganizationById()` / `getOrganizationBySlug()` | No |
| `update <id-or-slug>` | Update org fields | `updateOrganization()` | No |
| `suspend <id-or-slug>` | Suspend organization | `suspendOrganization()` | Yes — confirm |
| `activate <id-or-slug>` | Activate organization | `activateOrganization()` | No |
| `archive <id-or-slug>` | Archive (soft-delete) | `archiveOrganization()` | Yes — confirm |
| `branding <id-or-slug>` | Update branding | `updateOrganizationBranding()` | No |

**ID vs Slug resolution:** The `<id-or-slug>` positional argument is tested as UUID first (via regex). If it matches UUID format, use `getOrganizationById()`. Otherwise, use `getOrganizationBySlug()`. This pattern is reused across all entity commands.

**Table format for `list`:**
```
 ID          Name                Slug              Status    Created
 ──────────────────────────────────────────────────────────────────────
 a1b2c3d4    Acme Corporation    acme-corp         active    2026-04-08
```

**Table format for `show`:**
```
 Field            Value
 ────────────────────────────────
 ID               a1b2c3d4-...
 Name             Acme Corporation
 Slug             acme-corp
 Status           active
 Default Locale   en
 Created          2026-04-08
 Updated          2026-04-09
```

---

## Application Commands

### Core (`src/cli/commands/app.ts`)

```
porta app create --name "My App" --org <org-id-or-slug>
porta app list [--org <slug>] [--status active|archived]
porta app show <id-or-slug>
porta app update <id-or-slug> --name "New Name"
porta app archive <id-or-slug>
```

**Subcommands:**

| Subcommand | Description | Service Function | Destructive? |
| --- | --- | --- | --- |
| `create` | Create application | `createApplication()` | No |
| `list` | List applications | `listApplications()` | No |
| `show <id-or-slug>` | Show app details | `getApplicationById()` / `getApplicationBySlug()` | No |
| `update <id-or-slug>` | Update app fields | `updateApplication()` | No |
| `archive <id-or-slug>` | Archive application | `archiveApplication()` | Yes — confirm |

The `app.ts` file also registers the nested subcommand groups: `module`, `role`, `permission`, `claim`.

### Module Subcommands (`src/cli/commands/app-module.ts`)

```
porta app module create <app-id-or-slug> --name "Users Module" --slug users
porta app module list <app-id-or-slug>
porta app module update <module-id> --name "New Name"
porta app module deactivate <module-id>
```

**Subcommands:**

| Subcommand | Description | Service Function | Destructive? |
| --- | --- | --- | --- |
| `create <app>` | Create module | `createModule()` | No |
| `list <app>` | List modules | `listModules()` | No |
| `update <module-id>` | Update module | `updateModule()` | No |
| `deactivate <module-id>` | Deactivate module | `deactivateModule()` | Yes — confirm |

### Role Subcommands (`src/cli/commands/app-role.ts`)

```
porta app role create <app-id-or-slug> --name "Admin" --description "Administrator"
porta app role list <app-id-or-slug>
porta app role show <role-id>
porta app role update <role-id> --name "New Name"
porta app role delete <role-id>
porta app role assign-permissions <role-id> --permission-ids <id1>,<id2>
porta app role remove-permissions <role-id> --permission-ids <id1>,<id2>
```

**Subcommands:**

| Subcommand | Description | Service Function | Destructive? |
| --- | --- | --- | --- |
| `create <app>` | Create role | `createRole()` | No |
| `list <app>` | List roles | `listRoles()` | No |
| `show <role-id>` | Show role with permissions | `getRoleById()` | No |
| `update <role-id>` | Update role | `updateRole()` | No |
| `delete <role-id>` | Delete role | `deleteRole()` | Yes — confirm |
| `assign-permissions <role-id>` | Assign permissions to role | `assignPermissionsToRole()` | No |
| `remove-permissions <role-id>` | Remove permissions from role | `removePermissionsFromRole()` | Yes — confirm |

### Permission Subcommands (`src/cli/commands/app-permission.ts`)

```
porta app permission create <app-id-or-slug> --name "users:read" --description "Read users"
porta app permission list <app-id-or-slug>
porta app permission update <permission-id> --description "New description"
porta app permission delete <permission-id>
```

**Subcommands:**

| Subcommand | Description | Service Function | Destructive? |
| --- | --- | --- | --- |
| `create <app>` | Create permission | `createPermission()` | No |
| `list <app>` | List permissions | `listPermissions()` | No |
| `update <permission-id>` | Update permission | `updatePermission()` | No |
| `delete <permission-id>` | Delete permission | `deletePermission()` | Yes — confirm |

### Custom Claim Definition Subcommands (`src/cli/commands/app-claim.ts`)

```
porta app claim create <app-id-or-slug> --name "department" --type string --description "User department"
porta app claim list <app-id-or-slug>
porta app claim update <claim-id> --description "Updated description"
porta app claim delete <claim-id>
```

**Subcommands:**

| Subcommand | Description | Service Function | Destructive? |
| --- | --- | --- | --- |
| `create <app>` | Define custom claim | `createClaimDefinition()` | No |
| `list <app>` | List claim definitions | `listClaimDefinitions()` | No |
| `update <claim-id>` | Update claim definition | `updateClaimDefinition()` | No |
| `delete <claim-id>` | Delete claim definition | `deleteClaimDefinition()` | Yes — confirm |

---

## Client Commands

### Core (`src/cli/commands/client.ts`)

```
porta client create --app <app-id-or-slug> --type confidential --redirect-uris "https://..." [--name "My Client"]
porta client list [--org <slug>] [--app <slug>]
porta client show <client-id>
porta client update <client-id> --name "New Name" [--redirect-uris "..."]
porta client revoke <client-id>
```

**Subcommands:**

| Subcommand | Description | Service Function | Destructive? |
| --- | --- | --- | --- |
| `create` | Create client | `createClient()` | No |
| `list` | List clients | `listClients()` | No |
| `show <client-id>` | Show client details | `getClientById()` | No |
| `update <client-id>` | Update client | `updateClient()` | No |
| `revoke <client-id>` | Revoke client | `revokeClient()` | Yes — confirm |

The `client.ts` file also registers the `secret` nested subcommand group.

**Note:** On `create` for confidential clients, the response includes the initial client secret which must be displayed with the one-time-show warning box (see RD-09 spec).

### Secret Subcommands (`src/cli/commands/client-secret.ts`)

```
porta client secret generate <client-id> --label "production"
porta client secret list <client-id>
porta client secret revoke <secret-id>
```

**Subcommands:**

| Subcommand | Description | Service Function | Destructive? |
| --- | --- | --- | --- |
| `generate <client-id>` | Generate new secret | `generateClientSecret()` | No |
| `list <client-id>` | List secrets (no plaintext) | `listClientSecrets()` | No |
| `revoke <secret-id>` | Revoke a secret | `revokeClientSecret()` | Yes — confirm |

**Secret display (one-time):**
When generating a secret, display it in a prominent box with a warning:
```
⚠️  IMPORTANT: Copy this secret now. It will not be shown again!

┌─────────────────────────────────────────────────────────────────┐
│ Secret: YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5QUJD │
│ Label:  production                                              │
│ ID:     f3a4b5c6-...                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## User Commands

### Core (`src/cli/commands/user.ts`)

```
porta user create --org <org-id-or-slug> --email "john@example.com" --given-name "John" --family-name "Doe"
porta user create --org <org-id-or-slug> --email "john@example.com" --no-notify
porta user create --org <org-id-or-slug> --email "john@example.com" --passwordless
porta user invite <id-or-email>
porta user list [--org <slug>] [--status active|suspended|...] [--search <query>]
porta user show <id-or-email>
porta user update <id> --given-name "John" [--family-name "Doe"]
porta user deactivate <id>
porta user reactivate <id>
porta user suspend <id>
porta user lock <id>
porta user unlock <id>
porta user set-password <id>
porta user verify-email <id>
```

**Subcommands:**

| Subcommand | Description | Service Function | Destructive? |
| --- | --- | --- | --- |
| `create` | Create user (sends invite by default) | `createUser()` + `sendInvitationEmail()` | No |
| `invite <id-or-email>` | (Re-)send invitation email | `sendInvitationEmail()` | No |
| `list` | List users | `listUsers()` | No |
| `show <id-or-email>` | Show user details | `getUserById()` / `getUserByEmail()` | No |
| `update <id>` | Update user profile | `updateUser()` | No |
| `deactivate <id>` | Deactivate user | `deactivateUser()` | Yes — confirm |
| `reactivate <id>` | Reactivate user | `reactivateUser()` | No |
| `suspend <id>` | Suspend user | `suspendUser()` | Yes — confirm |
| `lock <id>` | Lock user account | `lockUser()` | Yes — confirm |
| `unlock <id>` | Unlock user account | `unlockUser()` | No |
| `set-password <id>` | Set user password | `setPassword()` | Yes — confirm |
| `verify-email <id>` | Mark email as verified | `verifyEmail()` | No |

**Email vs ID resolution:** Similar to org's id-or-slug, detect if argument looks like UUID → `getUserById()`, else if contains `@` → `getUserByEmail()`.

**`create` behavior:**
- Default: create user + send invitation email
- `--no-notify`: create user, skip email
- `--passwordless`: create user + send welcome/magic-link email instead of invitation

**`set-password`:** Prompts for the new password interactively (hidden input). Does not accept password as a CLI argument for security reasons.

### User Role Subcommands (`src/cli/commands/user-role.ts`)

```
porta user roles assign <user-id> --role-ids <id1>,<id2> --org <org-id>
porta user roles remove <user-id> --role-ids <id1>,<id2> --org <org-id>
porta user roles list <user-id> [--org <org-id>]
```

**Subcommands:**

| Subcommand | Description | Service Function | Destructive? |
| --- | --- | --- | --- |
| `assign <user-id>` | Assign roles to user | `assignRolesToUser()` | No |
| `remove <user-id>` | Remove roles from user | `removeRolesFromUser()` | Yes — confirm |
| `list <user-id>` | List user's roles | `listUserRoles()` | No |

### User Claim Subcommands (`src/cli/commands/user-claim.ts`)

```
porta user claims set <user-id> --claim-id <claim-def-id> --value "Engineering"
porta user claims get <user-id> [--app <app-id>]
porta user claims delete <user-id> --claim-id <claim-def-id>
```

**Subcommands:**

| Subcommand | Description | Service Function | Destructive? |
| --- | --- | --- | --- |
| `set <user-id>` | Set claim value | `setUserClaimValue()` | No |
| `get <user-id>` | Get claim values | `getUserClaimValues()` | No |
| `delete <user-id>` | Delete claim value | `deleteUserClaimValue()` | Yes — confirm |

### User 2FA Subcommands (Stub — RD-12 not implemented)

```
porta user 2fa status <id-or-email>
porta user 2fa disable <id-or-email>
porta user 2fa reset <id-or-email>
```

All three commands will return:
```
⚠️  2FA management is not yet implemented. It will be available after RD-12 is complete.
```

These are registered as valid commands so that `--help` shows them and the CLI structure is ready for RD-12.

---

## Common Patterns

### ID-or-Slug Resolution

```typescript
/**
 * Resolve an entity identifier that could be a UUID or a slug.
 * UUIDs have the format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}
```

### Destructive Operation Flow

```typescript
// Common pattern for destructive operations
const confirmed = await confirm(
  `This will archive organization "${org.name}" (${org.slug}). Are you sure?`,
  argv.force,
);
if (!confirmed) {
  console.log('Operation cancelled.');
  return;
}
if (argv['dry-run']) {
  warn(`[DRY RUN] Would archive organization "${org.name}" (${org.slug})`);
  return;
}
await archiveOrganization(org.id);
success(`Organization archived: ${org.name} (${org.slug})`);
```

### Paginated List Pattern

```typescript
// Common pattern for list commands with pagination
const result = await listEntities({
  page: argv.page,
  pageSize: argv['page-size'],
  status: argv.status,
  // other filters
});

outputResult(argv.json, () => {
  printTable(['ID', 'Name', 'Status', 'Created'], result.items.map(item => [
    truncateId(item.id),
    item.name,
    item.status,
    formatDate(item.createdAt),
  ]));
  printTotal('items', result.total);
}, { data: result.items, total: result.total, page: argv.page, pageSize: argv['page-size'] });
```

## Testing Requirements

Each domain command group needs tests for:
- All CRUD subcommands with table and JSON output
- ID-or-slug resolution (UUID vs slug/email)
- Destructive operation confirmation flow
- `--force` bypass for confirmations
- `--dry-run` preview mode
- Error handling (not found, validation errors)
- Argument validation (missing required args)
- Special behaviors (user create with invite email, client secret one-time display)
- 2FA stub commands return expected message
