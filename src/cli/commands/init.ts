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
 *   2. Granular admin permissions (42 resource:action permissions)
 *   3. Five admin roles with permission sets (super-admin, org-admin, etc.)
 *   4. "Porta Admin CLI" public client (Auth Code + PKCE)
 *   5. "Porta Admin GUI" confidential client (Auth Code + secret)
 *   6. First admin user (interactive prompts or flags)
 *   7. Super-admin role assigned to the user
 *   8. Super-admin user ID stored in system_config
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
import {
  ALL_ADMIN_PERMISSIONS,
  ADMIN_ROLE_DEFINITIONS,
  ALL_ADMIN_ROLES,
} from '../../lib/admin-permissions.js';
import { SUPER_ADMIN_USER_ID_KEY } from '../../lib/super-admin-protection.js';

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
 * Build a human-readable permission name from a resource:action slug.
 * Capitalizes the resource and action parts for display.
 *
 * @example
 * buildPermissionName('org:create') → 'Organization Create'
 * buildPermissionName('session:revoke') → 'Session Revoke'
 *
 * @param slug - Permission slug in resource:action format
 * @returns Human-readable permission name
 */
function buildPermissionName(slug: string): string {
  const [resource, action] = slug.split(':');
  const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
  return `${capitalize(resource)} ${capitalize(action)}`;
}

/**
 * Build a description for a permission from its slug.
 *
 * @param slug - Permission slug in resource:action format
 * @returns Permission description
 */
function buildPermissionDescription(slug: string): string {
  const [resource, action] = slug.split(':');
  return `Permission to ${action} ${resource} resources`;
}

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
  cliClientId: string,
  guiClientId: string,
  guiClientSecret: string,
  adminEmail: string,
  roleSlug: string,
  roleCount: number,
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
  console.log(`║  CLI Client ID: ${padRight(cliClientId, w)}║`);
  console.log(`║  GUI Client ID: ${padRight(guiClientId, w)}║`);
  console.log(`║  GUI Secret:    ${padRight(guiClientSecret, w)}║`);
  console.log(`║  Admin User:    ${padRight(adminEmail, w)}║`);
  console.log(
    `║  Admin Role:    ${padRight(`${roleSlug} (${permissionCount} permissions)`, w)}║`,
  );
  console.log(
    `║  Admin Roles:   ${padRight(`${roleCount} roles seeded`, w)}║`,
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
    '║  3. Configure admin GUI with the GUI client creds           ║',
  );
  console.log(
    '║  4. Start admin GUI:   PORTA_SERVICE=admin                  ║',
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
        const { createClient, generateSecret } = await import(
          '../../clients/index.js'
        );
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
        const { getPool } = await import('../../lib/database.js');

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
        // Step 5: Create granular admin permissions (resource:action format)
        // -----------------------------------------------------------------
        // Each permission maps to a specific admin API operation.
        // Permission slugs come from the centralized admin-permissions module.
        const permissionIdMap = new Map<string, string>(); // slug → permission ID
        for (const permSlug of ALL_ADMIN_PERMISSIONS) {
          const permission = await createPermission({
            applicationId: adminApp.id,
            slug: permSlug,
            name: buildPermissionName(permSlug),
            description: buildPermissionDescription(permSlug),
          });
          permissionIdMap.set(permSlug, permission.id);
        }
        console.log(
          `  ✅ ${permissionIdMap.size} granular permissions created`,
        );

        // -----------------------------------------------------------------
        // Step 6: Create all 5 admin roles and assign permissions
        // -----------------------------------------------------------------
        // Each role gets a specific set of permissions as defined in
        // ADMIN_ROLE_DEFINITIONS. The super-admin role gets all permissions.
        const createdRoles = new Map<string, string>(); // slug → role ID
        for (const roleDef of ALL_ADMIN_ROLES) {
          const role = await createRole({
            applicationId: adminApp.id,
            name: roleDef.name,
            slug: roleDef.slug,
            description: roleDef.description,
          });
          createdRoles.set(roleDef.slug, role.id);

          // Resolve permission IDs for this role's permission set
          const rolePermissionIds = roleDef.permissions
            .map((permSlug) => permissionIdMap.get(permSlug))
            .filter((id): id is string => id !== undefined);

          if (rolePermissionIds.length > 0) {
            await assignPermissionsToRole(role.id, rolePermissionIds);
          }

          console.log(
            `  ✅ Role: ${role.name} (${role.slug}) — ${rolePermissionIds.length} permissions`,
          );
        }

        // -----------------------------------------------------------------
        // Step 7: Create the admin CLI client (public, Auth Code + PKCE)
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
        // Step 7b: Create the admin GUI client (confidential, Auth Code)
        // -----------------------------------------------------------------
        // The admin GUI is a server-rendered BFF (Backend-for-Frontend) that
        // can safely store a client secret. It uses magic_link as the login
        // method for passwordless admin authentication.
        const { client: adminGuiClient } = await createClient({
          organizationId: superAdminOrg.id,
          applicationId: adminApp.id,
          clientName: 'Porta Admin GUI',
          clientType: 'confidential',
          applicationType: 'web',
          redirectUris: ['http://localhost:4002/auth/callback'],
          postLogoutRedirectUris: ['http://localhost:4002'],
          grantTypes: ['authorization_code', 'refresh_token'],
          scope: 'openid profile email offline_access',
          requirePkce: false,
          tokenEndpointAuthMethod: 'client_secret_post',
          loginMethods: ['magic_link'],
        });

        // Generate and store a secret for the GUI client
        const guiSecretResult = await generateSecret(
          adminGuiClient.id,
          { label: 'Initial secret (porta init)' },
        );
        console.log(
          `  ✅ Client created: ${adminGuiClient.clientName} (${adminGuiClient.clientId})`,
        );
        console.log(
          `     ⚠️  GUI Client Secret: ${guiSecretResult.plaintext}`,
        );
        warn('     Save this secret — it cannot be retrieved later!');

        // -----------------------------------------------------------------
        // Step 8: Collect admin user details (interactive or from flags)
        // -----------------------------------------------------------------
        const userDetails = await collectAdminUserDetails(argv);

        // -----------------------------------------------------------------
        // Step 9: Create the admin user in the super-admin organization
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
        // Step 10: Activate user (if not already active)
        // -----------------------------------------------------------------
        if (adminUser.status !== 'active') {
          await reactivateUser(adminUser.id);
        }
        console.log('  ✅ User activated');

        // -----------------------------------------------------------------
        // Step 11: Mark email as verified (admin doesn't need email flow)
        // -----------------------------------------------------------------
        await markEmailVerified(adminUser.id);
        console.log('  ✅ Email marked as verified');

        // -----------------------------------------------------------------
        // Step 12: Assign super-admin role to the new user
        // -----------------------------------------------------------------
        const superAdminRoleId = createdRoles.get(
          ADMIN_ROLE_DEFINITIONS.SUPER_ADMIN.slug,
        );
        if (!superAdminRoleId) {
          throw new Error('Super-admin role was not created — init is broken');
        }
        await assignRolesToUser(adminUser.id, [superAdminRoleId]);
        console.log(
          `  ✅ Role "${ADMIN_ROLE_DEFINITIONS.SUPER_ADMIN.slug}" assigned to user`,
        );

        // -----------------------------------------------------------------
        // Step 13: Store super-admin user ID in system_config
        // -----------------------------------------------------------------
        // This enables the super-admin protection module to identify
        // the bootstrap user and prevent destructive operations on them.
        const pool = getPool();
        await pool.query(
          `INSERT INTO system_config (key, value, value_type, description, is_sensitive)
           VALUES ($1, to_jsonb($2::text), 'string', $3, FALSE)
           ON CONFLICT (key) DO UPDATE SET value = to_jsonb($2::text), updated_at = NOW()`,
          [
            SUPER_ADMIN_USER_ID_KEY,
            adminUser.id,
            'User ID of the super-admin user created during porta init',
          ],
        );
        console.log('  ✅ Super-admin user ID stored in system config');

        // -----------------------------------------------------------------
        // Step 14: Print the success summary
        // -----------------------------------------------------------------
        printSuccessBox(
          superAdminOrg.name,
          superAdminOrg.slug,
          adminApp.slug,
          adminClient.clientId,
          adminGuiClient.clientId,
          guiSecretResult.plaintext,
          userDetails.email,
          ADMIN_ROLE_DEFINITIONS.SUPER_ADMIN.slug,
          createdRoles.size,
          permissionIdMap.size,
        );

        success('Porta initialization complete!');
      });
    }, argv.verbose);
  },
};
