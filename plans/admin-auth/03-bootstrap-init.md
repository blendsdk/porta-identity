# Bootstrap Init: Admin API Authentication

> **Document**: 03-bootstrap-init.md
> **Parent**: [Index](00-index.md)

## Overview

The `porta init` command solves the chicken-and-egg problem: you need an OIDC client to authenticate the CLI, but you need the CLI to create clients. `porta init` is a one-time, direct-DB bootstrap command that creates everything needed for subsequent OIDC-based authentication.

## Architecture

### Current Architecture

The super-admin organization (`porta-admin`) is created by `migrations/011_seed.sql`, but it has:
- ✅ Organization record (`is_super_admin = true`)
- ✅ System config values (16 TTL/policy settings)
- ❌ No admin application
- ❌ No admin CLI client
- ❌ No admin user
- ❌ No admin roles or permissions

### Proposed: `porta init` Creates Everything

```
porta init
  ├── Verify: super-admin org exists (from migration seed)
  ├── Safety guard: refuse if admin app already exists
  ├── Create: "Porta Admin" application (in super-admin org)
  ├── Create: Admin permissions (8 permission definitions)
  ├── Create: "porta-admin" role (with all permissions assigned)
  ├── Create: "porta-admin-cli" public client (Auth Code + PKCE)
  ├── Prompt: admin user email, given name, family name, password
  ├── Create: admin user (in super-admin org)
  ├── Activate: admin user (status → active)
  ├── Assign: porta-admin role to admin user
  └── Print: success summary with next steps
```

## Implementation Details

### Safety Guard

`porta init` must be idempotent-safe. It checks whether an admin application already exists:

```typescript
// Pseudo-code for safety guard
const superAdminOrg = await findSuperAdminOrganization();
if (!superAdminOrg) {
  error('Super-admin organization not found. Run "porta migrate up" first.');
  process.exit(1);
}

const existingApp = await getApplicationBySlug('porta-admin');
if (existingApp && !argv.force) {
  error('System already initialized. Use --force to re-initialize.');
  process.exit(1);
}
```

With `--force`, re-initialization is allowed (with confirmation prompt). This is useful for development but should not be used in production.

### Admin Application

```typescript
const adminApp = await createApplication({
  name: 'Porta Admin',
  slug: 'porta-admin',        // Auto-generated if not provided, but we want a known slug
  organizationId: superAdminOrg.id,
  description: 'Porta administration application — manages the admin API and CLI authentication',
});
```

### Admin Permissions

Eight permissions covering all admin API domains:

```typescript
const ADMIN_PERMISSIONS = [
  { slug: 'admin:organizations:manage', name: 'Manage Organizations', description: 'Create, update, suspend, archive organizations' },
  { slug: 'admin:applications:manage', name: 'Manage Applications', description: 'Create, update, archive applications and modules' },
  { slug: 'admin:clients:manage', name: 'Manage Clients', description: 'Create, update, revoke clients and secrets' },
  { slug: 'admin:users:manage', name: 'Manage Users', description: 'Create, update, suspend, lock, deactivate users' },
  { slug: 'admin:roles:manage', name: 'Manage Roles', description: 'Create, update, archive roles and assign permissions' },
  { slug: 'admin:permissions:manage', name: 'Manage Permissions', description: 'Create, update, archive permissions' },
  { slug: 'admin:claims:manage', name: 'Manage Claims', description: 'Create, update claim definitions and user values' },
  { slug: 'admin:system:manage', name: 'Manage System', description: 'System config, audit log, signing keys, migrations' },
];
```

### Admin Role

```typescript
const adminRole = await createRole({
  applicationId: adminApp.id,
  name: 'Porta Administrator',
  slug: 'porta-admin',
  description: 'Full administrative access to all Porta admin API endpoints',
});

// Assign all admin permissions to the role
const permissionIds = createdPermissions.map(p => p.id);
await assignPermissionsToRole(adminRole.id, permissionIds);
```

### Admin CLI Client

A public client configured for Auth Code + PKCE with localhost redirect URIs:

```typescript
const { client: adminClient } = await createClient({
  organizationId: superAdminOrg.id,
  applicationId: adminApp.id,
  clientName: 'Porta Admin CLI',
  clientType: 'public',                    // CLI can't store secrets
  applicationType: 'native',               // Native app (CLI)
  redirectUris: [
    'http://127.0.0.1:0/callback',         // Dynamic port — 0 means "any available port"
    'http://localhost:0/callback',          // Fallback for localhost
  ],
  postLogoutRedirectUris: [],
  grantTypes: ['authorization_code', 'refresh_token'],
  scope: 'openid profile email offline_access',
  requirePkce: true,
});
```

**Note on redirect URIs:** The OIDC provider needs to accept localhost redirects with any port. The CLI starts a temporary HTTP server on a random available port. The redirect URI validation must support `http://127.0.0.1:<any-port>/callback`. This may require adjusting the client redirect URI validation to support port wildcards or registering a range. Implementation will determine the best approach — options include:
1. Register `http://127.0.0.1/callback` and configure the provider to allow port variation for localhost
2. Use a fixed port (e.g., `19876`) to avoid the wildcard issue
3. Register multiple specific ports as fallbacks

### Admin User

Interactive prompts collect user details:

```typescript
// Prompt for admin user details
const email = await promptRequired('Admin email: ');
const givenName = await promptRequired('First name: ');
const familyName = await promptRequired('Last name: ');
const password = await promptPassword('Password: ');       // Hidden input
const confirmPw = await promptPassword('Confirm password: ');

if (password !== confirmPw) {
  error('Passwords do not match.');
  process.exit(1);
}

// Create the user
const user = await createUser({
  organizationId: superAdminOrg.id,
  email,
  givenName,
  familyName,
  password,
});

// Activate the user (users are created in 'inactive' status)
await reactivateUser(user.id);

// Mark email as verified (admin user should not need email verification)
await markEmailVerified(user.id);

// Assign the admin role
await assignRolesToUser(user.id, [adminRole.id]);
```

### Non-Interactive Mode

For CI/scripted environments, support flags:

```bash
porta init \
  --email admin@example.com \
  --given-name Admin \
  --family-name User \
  --password 'SecurePassword123!' \
  --force
```

When all required flags are provided, skip interactive prompts.

### Success Output

```
╔══════════════════════════════════════════════════════════════╗
║                    Porta Initialized                        ║
╠══════════════════════════════════════════════════════════════╣
║  Organization:  Porta Admin (porta-admin)                   ║
║  Application:   Porta Admin (porta-admin)                   ║
║  Client ID:     porta-admin-cli-xxxxxxxxxxxx                ║
║  Admin User:    admin@example.com                           ║
║  Admin Role:    porta-admin (8 permissions)                 ║
╠══════════════════════════════════════════════════════════════╣
║  Next steps:                                                ║
║  1. Start the server:  yarn dev                             ║
║  2. Authenticate:      porta login                          ║
║  3. Verify:            porta whoami                         ║
╚══════════════════════════════════════════════════════════════╝
```

## Integration Points

### With `migrations/011_seed.sql`

The SQL seed creates the super-admin organization and system config. `porta init` depends on this existing:

```
migrations/011_seed.sql  →  super-admin org + system config
porta init               →  admin app + client + role + permissions + user
```

### With Signing Keys

`porta init` should ensure signing keys exist. If none are found, it should bootstrap them (similar to what the server does at startup):

```typescript
const { loadSigningKeys, bootstrapSigningKeys } = await import('../../lib/signing-keys.js');
const keys = await loadSigningKeys();
if (keys.length === 0) {
  await bootstrapSigningKeys();
  console.log('  ✅ ES256 signing keys generated');
}
```

### With CLI Bootstrap

`porta init` uses `withBootstrap()` (direct-DB mode) since it must work without a running server:

```typescript
export const initCommand: CommandModule<GlobalOptions, InitOptions> = {
  command: 'init',
  describe: 'Initialize Porta — create admin application, client, and first admin user',
  builder: (yargs) => yargs
    .option('email', { type: 'string', describe: 'Admin user email' })
    .option('given-name', { type: 'string', describe: 'Admin user first name' })
    .option('family-name', { type: 'string', describe: 'Admin user last name' })
    .option('password', { type: 'string', describe: 'Admin user password' }),
  handler: async (argv) => {
    await withErrorHandling(async () => {
      await withBootstrap(argv, async () => {
        // ... init logic
      });
    }, argv.verbose);
  },
};
```

## Error Handling

| Error Case | Handling Strategy |
|-----------|------------------|
| Super-admin org not found | Exit with "Run `porta migrate up` first" message |
| Admin app already exists (no --force) | Exit with "System already initialized. Use --force to re-initialize." |
| Email already taken | Exit with "User with this email already exists in the admin org" |
| Password doesn't meet NIST requirements | Exit with password policy error from the user service |
| DB connection failed | Standard CLI bootstrap error handling |
| Redis connection failed | Standard CLI bootstrap error handling |

## Testing Requirements

- Unit tests for init command logic (mocked service calls)
- Integration test: full init flow on a clean database
- Integration test: init refuses when already initialized
- Integration test: init with `--force` re-initializes
- Integration test: non-interactive mode with all flags
- Verification that all created entities (app, client, role, permissions, user) are correct
