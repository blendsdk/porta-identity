/**
 * CLI init command — bootstrap Porta admin infrastructure.
 *
 * Solves the chicken-and-egg problem: you need an OIDC client to authenticate
 * the CLI, but you need the CLI to create clients. `porta init` is a one-time,
 * direct-DB bootstrap command that creates everything needed for subsequent
 * OIDC-based authentication.
 *
 * Created entities:
 *   1. "Porta Admin" application (slug: porta-admin)
 *   2. Eight admin permissions (admin:*:manage)
 *   3. "porta-admin" role with all permissions assigned
 *   4. "Porta Admin CLI" public client (Auth Code + PKCE)
 *   5. First admin user (interactive prompts or flags)
 *   6. Admin role assigned to the user
 *
 * Prerequisites:
 *   - Database migrations have been run (`porta migrate up`)
 *   - Super-admin organization exists (created by migration 011_seed.sql)
 *
 * Usage:
 *   porta init                            # Interactive — prompts for user details
 *   porta init --email admin@example.com  # Non-interactive with flags
 *     --given-name Admin --family-name User --password 'Secret123!'
 *   porta init --force                    # Skip "already initialized" check
 *
 * @module cli/commands/init
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import { withBootstrap } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import { success, warn } from '../output.js';
import { confirm, promptInput, promptPassword } from '../prompt.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Admin permissions covering all admin API domains.
 * Each follows the module:resource:action slug format required by the RBAC
 * permission validator. These are created in the "Porta Admin" application
 * and assigned to the "porta-admin" role.
 */
const ADMIN_PERMISSIONS = [
  {
    slug: 'admin:organizations:manage',
    name: 'Manage Organizations',
    description: 'Create, update, suspend, archive organizations',
  },
  {
    slug: 'admin:applications:manage',
    name: 'Manage Applications',
    description: 'Create, update, archive applications and modules',
  },
  {
    slug: 'admin:clients:manage',
    name: 'Manage Clients',
    description: 'Create, update, revoke clients and secrets',
  },
  {
    slug: 'admin:users:manage',
    name: 'Manage Users',
    description: 'Create, update, suspend, lock, deactivate users',
  },
  {
    slug: 'admin:roles:manage',
    name: 'Manage Roles',
    description: 'Create, update, archive roles and assign permissions',
  },
  {
    slug: 'admin:permissions:manage',
    name: 'Manage Permissions',
    description: 'Create, update, archive permissions',
  },
  {
    slug: 'admin:claims:manage',
    name: 'Manage Claims',
    description: 'Create, update claim definitions and user values',
  },
  {
    slug: 'admin:system:manage',
    name: 'Manage System',
    description: 'System config, audit log, signing keys, migrations',
  },
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options specific to the init command (extends global CLI options) */
interface InitOptions extends GlobalOptions {
  email?: string;
  'given-name'?: string;
  'family-name'?: string;
  password?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pad a string to a fixed width for aligned box output.
 * Truncates with ellipsis if the string exceeds the target length.
 *
 * @param str - The string to pad
 * @param length - Target width in characters
 * @returns Padded or truncated string
 */
function padRight(str: string, length: number): string {
  if (str.length > length) {
    return str.substring(0, length - 1) + '…';
  }
  return str + ' '.repeat(length - str.length);
}

/**
 * Collect admin user details from interactive prompts or CLI flags.
 *
 * When all four flags (--email, --given-name, --family-name, --password)
 * are provided, prompts are skipped entirely (non-interactive mode).
 * Otherwise, missing fields are collected via interactive prompts.
 * Password input uses hidden echo for security.
 *
 * @param argv - Parsed CLI options
 * @returns Object with email, givenName, familyName, password
 * @throws Error if required fields are empty or passwords don't match
 */
async function collectAdminUserDetails(argv: InitOptions): Promise<{
  email: string;
  givenName: string;
  familyName: string;
  password: string;
}> {
  // Collect each field from flags or prompts
  const email = argv.email ?? (await promptInput('Admin email: '));
  const givenName = argv['given-name'] ?? (await promptInput('First name: '));
  const familyName = argv['family-name'] ?? (await promptInput('Last name: '));

  let password: string;
  if (argv.password) {
    // Password provided via flag — use directly (non-interactive mode)
    password = argv.password;
  } else {
    // Interactive password entry with confirmation
    password = await promptPassword('Password: ');
    const confirmPw = await promptPassword('Confirm password: ');
    if (password !== confirmPw) {
      throw new Error('Passwords do not match');
    }
  }

  // Validate all required fields are present
  if (!email || !givenName || !familyName || !password) {
    throw new Error(
      'All fields are required: email, given-name, family-name, password',
    );
  }

  return { email, givenName, familyName, password };
}

/**
 * Print the success summary box after initialization completes.
 *
 * Displays all created entities and next-step instructions in an
 * aligned bordered box format.
 */
function printSuccessBox(
  orgName: string,
  orgSlug: string,
  appSlug: string,
  clientId: string,
  adminEmail: string,
  roleSlug: string,
  permissionCount: number,
): void {
  const w = 43; // Content width inside the box
  console.log('');
  console.log(
    '╔══════════════════════════════════════════════════════════════╗',
  );
  console.log(
    '║                    Porta Initialized                        ║',
  );
  console.log(
    '╠══════════════════════════════════════════════════════════════╣',
  );
  console.log(`║  Organization:  ${padRight(`${orgName} (${orgSlug})`, w)}║`);
  console.log(
    `║  Application:   ${padRight(`Porta Admin (${appSlug})`, w)}║`,
  );
  console.log(`║  Client ID:     ${padRight(clientId, w)}║`);
  console.log(`║  Admin User:    ${padRight(adminEmail, w)}║`);
  console.log(
    `║  Admin Role:    ${padRight(`${roleSlug} (${permissionCount} permissions)`, w)}║`,
  );
  console.log(
    '╠══════════════════════════════════════════════════════════════╣',
  );
  console.log(
    '║  Next steps:                                                ║',
  );
  console.log(
    '║  1. Start the server:  yarn dev                             ║',
  );
  console.log(
    '║  2. Authenticate:      porta login                          ║',
  );
  console.log(
    '║  3. Verify:            porta whoami                         ║',
  );
  console.log(
    '╚══════════════════════════════════════════════════════════════╝',
  );
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/**
 * The init command module — registered at the top level of the CLI.
 *
 * Bootstraps all admin infrastructure entities in a single direct-DB
 * operation. This is the only way to create the initial admin setup
 * since the admin API requires authentication that doesn't exist yet.
 */
export const initCommand: CommandModule<GlobalOptions, InitOptions> = {
  command: 'init',
  describe:
    'Initialize Porta — create admin application, client, and first admin user',
  builder: (yargs) =>
    yargs
      .option('email', {
        type: 'string',
        describe: 'Admin user email address',
      })
      .option('given-name', {
        type: 'string',
        describe: 'Admin user first name',
      })
      .option('family-name', {
        type: 'string',
        describe: 'Admin user last name',
      })
      .option('password', {
        type: 'string',
        describe: 'Admin user password (must meet NIST SP 800-63B requirements)',
      }),

  handler: async (argv) => {
    await withErrorHandling(async () => {
      await withBootstrap(argv, async () => {
        // Dynamic imports — loaded after bootstrap connects DB + Redis.
        // This ensures config is parsed with any CLI flag overrides.
        const { findSuperAdminOrganization } = await import(
          '../../organizations/repository.js'
        );
        const { getApplicationBySlug, createApplication } = await import(
          '../../applications/index.js'
        );
        const { createClient } = await import('../../clients/index.js');
        const {
          createUser,
          reactivateUser,
          markEmailVerified,
        } = await import('../../users/index.js');
        const {
          createRole,
          createPermission,
          assignPermissionsToRole,
          assignRolesToUser,
        } = await import('../../rbac/index.js');
        const { ensureSigningKeys } = await import(
          '../../lib/signing-keys.js'
        );

        console.log('Initializing Porta...\n');

        // -----------------------------------------------------------------
        // Step 1: Verify super-admin org exists (created by migration seed)
        // -----------------------------------------------------------------
        const superAdminOrg = await findSuperAdminOrganization();
        if (!superAdminOrg) {
          throw new Error(
            'Super-admin organization not found. Run "porta migrate up" first.',
          );
        }

        // -----------------------------------------------------------------
        // Step 2: Safety guard — refuse if already initialized
        // -----------------------------------------------------------------
        const existingApp = await getApplicationBySlug('porta-admin');
        if (existingApp && !argv.force) {
          throw new Error(
            'System already initialized. Use --force to re-initialize.',
          );
        }
        if (existingApp && argv.force) {
          // Re-initialization with --force: confirm the destructive action.
          // Full re-init (drop + recreate) is not yet supported — advise
          // the user to reset the database instead.
          const confirmed = await confirm(
            'Re-initialization is not yet supported. Reset the database and re-run migrations instead. Cancel?',
            false,
          );
          if (confirmed) {
            warn('Init cancelled — reset the database first.');
          } else {
            warn('Init cancelled.');
          }
          return;
        }

        // -----------------------------------------------------------------
        // Step 3: Ensure signing keys exist in the database
        // -----------------------------------------------------------------
        await ensureSigningKeys();
        console.log('  ✅ Signing keys verified');

        // -----------------------------------------------------------------
        // Step 4: Create the admin application
        // -----------------------------------------------------------------
        const adminApp = await createApplication({
          name: 'Porta Admin',
          slug: 'porta-admin',
          description:
            'Porta administration application — manages the admin API and CLI authentication',
        });
        console.log(
          `  ✅ Application created: ${adminApp.name} (${adminApp.slug})`,
        );

        // -----------------------------------------------------------------
        // Step 5: Create admin permissions (8 covering all API domains)
        // -----------------------------------------------------------------
        const createdPermissions = [];
        for (const permDef of ADMIN_PERMISSIONS) {
          const permission = await createPermission({
            applicationId: adminApp.id,
            slug: permDef.slug,
            name: permDef.name,
            description: permDef.description,
          });
          createdPermissions.push(permission);
        }
        console.log(
          `  ✅ ${createdPermissions.length} permissions created`,
        );

        // -----------------------------------------------------------------
        // Step 6: Create the admin role
        // -----------------------------------------------------------------
        const adminRole = await createRole({
          applicationId: adminApp.id,
          name: 'Porta Administrator',
          slug: 'porta-admin',
          description:
            'Full administrative access to all Porta admin API endpoints',
        });
        console.log(
          `  ✅ Role created: ${adminRole.name} (${adminRole.slug})`,
        );

        // -----------------------------------------------------------------
        // Step 7: Assign all permissions to the admin role
        // -----------------------------------------------------------------
        await assignPermissionsToRole(
          adminRole.id,
          createdPermissions.map((p) => p.id),
        );
        console.log(
          `  ✅ ${createdPermissions.length} permissions assigned to role`,
        );

        // -----------------------------------------------------------------
        // Step 8: Create the admin CLI client (public, Auth Code + PKCE)
        // -----------------------------------------------------------------
        // The client is public (no secret) because CLI tools cannot safely
        // store secrets. PKCE provides security for the authorization code
        // exchange. The redirect URIs use loopback addresses — per RFC 8252
        // §7.3, node-oidc-provider allows flexible port matching for native
        // app clients using loopback redirect URIs.
        const { client: adminClient } = await createClient({
          organizationId: superAdminOrg.id,
          applicationId: adminApp.id,
          clientName: 'Porta Admin CLI',
          clientType: 'public',
          applicationType: 'native',
          redirectUris: [
            'http://127.0.0.1/callback',
            'http://localhost/callback',
          ],
          postLogoutRedirectUris: [],
          grantTypes: ['authorization_code', 'refresh_token'],
          scope: 'openid profile email offline_access',
          requirePkce: true,
        });
        console.log(
          `  ✅ Client created: ${adminClient.clientName} (${adminClient.clientId})`,
        );

        // -----------------------------------------------------------------
        // Step 9: Collect admin user details (interactive or from flags)
        // -----------------------------------------------------------------
        const userDetails = await collectAdminUserDetails(argv);

        // -----------------------------------------------------------------
        // Step 10: Create the admin user in the super-admin organization
        // -----------------------------------------------------------------
        const adminUser = await createUser({
          organizationId: superAdminOrg.id,
          email: userDetails.email,
          givenName: userDetails.givenName,
          familyName: userDetails.familyName,
          password: userDetails.password,
        });
        console.log(`  ✅ User created: ${adminUser.email}`);

        // -----------------------------------------------------------------
        // Step 11: Activate user (if not already active)
        // -----------------------------------------------------------------
        if (adminUser.status !== 'active') {
          await reactivateUser(adminUser.id);
        }
        console.log('  ✅ User activated');

        // -----------------------------------------------------------------
        // Step 12: Mark email as verified (admin doesn't need email flow)
        // -----------------------------------------------------------------
        await markEmailVerified(adminUser.id);
        console.log('  ✅ Email marked as verified');

        // -----------------------------------------------------------------
        // Step 13: Assign admin role to the new user
        // -----------------------------------------------------------------
        await assignRolesToUser(adminUser.id, [adminRole.id]);
        console.log(`  ✅ Role "${adminRole.slug}" assigned to user`);

        // -----------------------------------------------------------------
        // Step 14: Print the success summary
        // -----------------------------------------------------------------
        printSuccessBox(
          superAdminOrg.name,
          superAdminOrg.slug,
          adminApp.slug,
          adminClient.clientId,
          userDetails.email,
          adminRole.slug,
          createdPermissions.length,
        );

        success('Porta initialization complete!');
      });
    }, argv.verbose);
  },
};
