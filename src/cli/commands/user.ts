/**
 * CLI user management commands.
 *
 * Provides CRUD, status lifecycle, password management, and email
 * verification for users. Nested subcommand groups handle role
 * assignments, custom claims, and 2FA (stub).
 *
 * Usage:
 *   porta user create --org <org-id> --email "john@example.com" [--given-name "John"]
 *   porta user invite <id-or-email> --org <org-id>
 *   porta user list --org <org-id> [--status active|...] [--search <query>]
 *   porta user show <id-or-email> [--org <org-id>]
 *   porta user update <id> --given-name "John"
 *   porta user deactivate <id>
 *   porta user reactivate <id>
 *   porta user suspend <id>
 *   porta user lock <id> --reason "Suspicious activity"
 *   porta user unlock <id>
 *   porta user set-password <id>
 *   porta user verify-email <id>
 *   porta user roles <subcommand> ...
 *   porta user claims <subcommand> ...
 *   porta user 2fa <subcommand> ...
 *
 * @module cli/commands/user
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import type { User } from '../../users/types.js';
import { withBootstrap } from '../bootstrap.js';
import { withErrorHandling } from '../error-handler.js';
import {
  printTable,
  success,
  warn,
  outputResult,
  truncateId,
  formatDate,
  printTotal,
} from '../output.js';
import { confirm } from '../prompt.js';
import { userRoleCommand } from './user-role.js';
import { userClaimCommand } from './user-claim.js';
import * as readline from 'readline';

// ---------------------------------------------------------------------------
// Argument type extensions
// ---------------------------------------------------------------------------

interface UserCreateArgs extends GlobalOptions {
  org: string;
  email: string;
  'given-name'?: string;
  'family-name'?: string;
  password?: string;
  'no-notify': boolean;
  passwordless: boolean;
}

interface UserListArgs extends GlobalOptions {
  org: string;
  status?: string;
  search?: string;
  page: number;
  'page-size': number;
}

interface UserIdOrEmailArgs extends GlobalOptions {
  'id-or-email': string;
  org?: string;
}

interface UserIdArgs extends GlobalOptions {
  id: string;
}

interface UserUpdateArgs extends UserIdArgs {
  'given-name'?: string;
  'family-name'?: string;
  email?: string;
}

interface UserLockArgs extends UserIdArgs {
  reason: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** UUID format regex — used to distinguish UUIDs from emails */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Check whether a value looks like a UUID */
function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/** Check whether a value looks like an email address */
function isEmail(value: string): boolean {
  return value.includes('@');
}

/**
 * Resolve a user by ID or email.
 * UUIDs → getUserById, emails → getUserByEmail (requires orgId).
 */
async function resolveUser(idOrEmail: string, orgId?: string): Promise<User | null> {
  const { getUserById, getUserByEmail, UserNotFoundError } = await import(
    '../../users/index.js'
  );

  if (isUuid(idOrEmail)) {
    return getUserById(idOrEmail);
  }

  if (isEmail(idOrEmail)) {
    if (!orgId) {
      throw new UserNotFoundError(
        'Organization (--org) is required when looking up by email',
      );
    }
    return getUserByEmail(orgId, idOrEmail);
  }

  // Neither UUID nor email — treat as invalid identifier
  throw new UserNotFoundError(idOrEmail);
}

/**
 * Prompt for a password with hidden input.
 * Returns the entered password string.
 *
 * @param message - Prompt message to display
 * @returns The entered password
 */
export async function promptPassword(message: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<string>((resolve) => {
    // Mute output to hide password characters
    const originalWrite = process.stdout.write.bind(process.stdout);
    let muted = false;

    process.stdout.write = ((chunk: string | Uint8Array) => {
      if (muted && typeof chunk === 'string' && !chunk.includes(message)) {
        return true;
      }
      return originalWrite(chunk);
    }) as typeof process.stdout.write;

    muted = true;
    rl.question(message, (answer: string) => {
      muted = false;
      process.stdout.write = originalWrite;
      console.log(''); // newline after hidden input
      rl.close();
      resolve(answer);
    });
  });
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/** The user command module — registered at the top level of the CLI */
export const userCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'user',
  describe: 'Manage users',
  builder: (yargs) => {
    return yargs
      // ── create ──────────────────────────────────────────────────────
      .command<UserCreateArgs>(
        'create',
        'Create a new user',
        (y) =>
          y
            .option('org', { type: 'string', demandOption: true, description: 'Organization UUID' })
            .option('email', { type: 'string', demandOption: true, description: 'User email address' })
            .option('given-name', { type: 'string', description: 'First name' })
            .option('family-name', { type: 'string', description: 'Last name' })
            .option('password', { type: 'string', description: 'Initial password (omit for passwordless)' })
            .option('no-notify', { type: 'boolean', default: false, description: 'Skip sending invitation email' })
            .option('passwordless', { type: 'boolean', default: false, description: 'Create passwordless user' }),
        async (argv) => {
          const args = argv as unknown as UserCreateArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { createUser } = await import('../../users/index.js');
              const user = await createUser({
                organizationId: args.org,
                email: args.email,
                givenName: args['given-name'],
                familyName: args['family-name'],
                password: args.passwordless ? undefined : args.password,
              });

              outputResult(
                args.json,
                () => {
                  success(`User created: ${user.email}`);
                  printTable(
                    ['Field', 'Value'],
                    [
                      ['ID', user.id],
                      ['Email', user.email],
                      ['Name', [user.givenName, user.familyName].filter(Boolean).join(' ') || '—'],
                      ['Status', user.status],
                      ['Has Password', String(user.hasPassword)],
                      ['Created', formatDate(user.createdAt)],
                    ],
                  );
                  if (!args['no-notify']) {
                    warn('Invitation email sending is not yet wired in CLI mode');
                  }
                },
                user,
              );
            });
          }, args.verbose);
        },
      )

      // ── invite ──────────────────────────────────────────────────────
      .command<UserIdOrEmailArgs>(
        'invite <id-or-email>',
        'Send or re-send invitation email',
        (y) =>
          y
            .positional('id-or-email', { type: 'string', demandOption: true, description: 'User UUID or email' })
            .option('org', { type: 'string', description: 'Organization UUID (required for email lookup)' }),
        async (argv) => {
          const args = argv as unknown as UserIdOrEmailArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { UserNotFoundError } = await import('../../users/index.js');
              const user = await resolveUser(args['id-or-email'], args.org);
              if (!user) throw new UserNotFoundError(args['id-or-email']);

              // Invitation email sending stub — auth module integration
              warn('Invitation email sending is not yet wired in CLI mode');
              success(`Would send invitation to: ${user.email} (${truncateId(user.id)})`);
            });
          }, args.verbose);
        },
      )

      // ── list ────────────────────────────────────────────────────────
      .command<UserListArgs>(
        'list',
        'List users in an organization',
        (y) =>
          y
            .option('org', { type: 'string', demandOption: true, description: 'Organization UUID' })
            .option('status', {
              type: 'string',
              choices: ['active', 'inactive', 'suspended', 'locked'],
              description: 'Filter by status',
            })
            .option('search', { type: 'string', description: 'Search by name or email' })
            .option('page', { type: 'number', default: 1, description: 'Page number' })
            .option('page-size', { type: 'number', default: 20, description: 'Items per page' }),
        async (argv) => {
          const args = argv as unknown as UserListArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { listUsersByOrganization } = await import('../../users/index.js');
              const result = await listUsersByOrganization({
                organizationId: args.org,
                page: args.page,
                pageSize: args['page-size'],
                status: args.status as 'active' | 'inactive' | 'suspended' | 'locked' | undefined,
                search: args.search,
              });

              if (result.data.length === 0) {
                warn('No users found');
                return;
              }

              outputResult(
                args.json,
                () => {
                  printTable(
                    ['ID', 'Email', 'Name', 'Status', 'Created'],
                    result.data.map((u) => [
                      truncateId(u.id),
                      u.email,
                      [u.givenName, u.familyName].filter(Boolean).join(' ') || '—',
                      u.status,
                      formatDate(u.createdAt),
                    ]),
                  );
                  printTotal('users', result.total);
                },
                { data: result.data, total: result.total, page: result.page, pageSize: result.pageSize },
              );
            });
          }, args.verbose);
        },
      )

      // ── show ────────────────────────────────────────────────────────
      .command<UserIdOrEmailArgs>(
        'show <id-or-email>',
        'Show user details',
        (y) =>
          y
            .positional('id-or-email', { type: 'string', demandOption: true, description: 'User UUID or email' })
            .option('org', { type: 'string', description: 'Organization UUID (required for email lookup)' }),
        async (argv) => {
          const args = argv as unknown as UserIdOrEmailArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { UserNotFoundError } = await import('../../users/index.js');
              const user = await resolveUser(args['id-or-email'], args.org);
              if (!user) throw new UserNotFoundError(args['id-or-email']);

              outputResult(
                args.json,
                () => {
                  printTable(
                    ['Field', 'Value'],
                    [
                      ['ID', user.id],
                      ['Email', user.email],
                      ['Email Verified', String(user.emailVerified)],
                      ['Given Name', user.givenName ?? '—'],
                      ['Family Name', user.familyName ?? '—'],
                      ['Status', user.status],
                      ['Has Password', String(user.hasPassword)],
                      ['Login Count', String(user.loginCount)],
                      ['Last Login', user.lastLoginAt ? formatDate(user.lastLoginAt) : '—'],
                      ['Created', formatDate(user.createdAt)],
                      ['Updated', formatDate(user.updatedAt)],
                    ],
                  );
                },
                user,
              );
            });
          }, args.verbose);
        },
      )

      // ── update ──────────────────────────────────────────────────────
      .command<UserUpdateArgs>(
        'update <id>',
        'Update user profile',
        (y) =>
          y
            .positional('id', { type: 'string', demandOption: true, description: 'User UUID' })
            .option('given-name', { type: 'string', description: 'New first name' })
            .option('family-name', { type: 'string', description: 'New last name' })
            .option('email', { type: 'string', description: 'New email address' }),
        async (argv) => {
          const args = argv as unknown as UserUpdateArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { updateUser } = await import('../../users/index.js');
              const updated = await updateUser(args.id, {
                givenName: args['given-name'],
                familyName: args['family-name'],
                email: args.email,
              });

              outputResult(
                args.json,
                () => { success(`User updated: ${updated.email}`); },
                updated,
              );
            });
          }, args.verbose);
        },
      )

      // ── deactivate ──────────────────────────────────────────────────
      .command<UserIdArgs>(
        'deactivate <id>',
        'Deactivate a user',
        (y) => y.positional('id', { type: 'string', demandOption: true, description: 'User UUID' }),
        async (argv) => {
          const args = argv as unknown as UserIdArgs;
          await withErrorHandling(async () => {
            if (args['dry-run']) { warn(`[DRY RUN] Would deactivate user ${args.id}`); return; }
            const confirmed = await confirm(`Deactivate user ${args.id}?`, args.force);
            if (!confirmed) { warn('Operation cancelled'); return; }
            await withBootstrap(args, async () => {
              const { deactivateUser } = await import('../../users/index.js');
              await deactivateUser(args.id);
              success(`User deactivated: ${args.id}`);
            });
          }, args.verbose);
        },
      )

      // ── reactivate ──────────────────────────────────────────────────
      .command<UserIdArgs>(
        'reactivate <id>',
        'Reactivate an inactive user',
        (y) => y.positional('id', { type: 'string', demandOption: true, description: 'User UUID' }),
        async (argv) => {
          const args = argv as unknown as UserIdArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { reactivateUser } = await import('../../users/index.js');
              await reactivateUser(args.id);
              success(`User reactivated: ${args.id}`);
            });
          }, args.verbose);
        },
      )

      // ── suspend ─────────────────────────────────────────────────────
      .command<UserIdArgs>(
        'suspend <id>',
        'Suspend a user',
        (y) => y.positional('id', { type: 'string', demandOption: true, description: 'User UUID' }),
        async (argv) => {
          const args = argv as unknown as UserIdArgs;
          await withErrorHandling(async () => {
            if (args['dry-run']) { warn(`[DRY RUN] Would suspend user ${args.id}`); return; }
            const confirmed = await confirm(`Suspend user ${args.id}?`, args.force);
            if (!confirmed) { warn('Operation cancelled'); return; }
            await withBootstrap(args, async () => {
              const { suspendUser } = await import('../../users/index.js');
              await suspendUser(args.id);
              success(`User suspended: ${args.id}`);
            });
          }, args.verbose);
        },
      )

      // ── lock ────────────────────────────────────────────────────────
      .command<UserLockArgs>(
        'lock <id>',
        'Lock a user account',
        (y) =>
          y
            .positional('id', { type: 'string', demandOption: true, description: 'User UUID' })
            .option('reason', { type: 'string', demandOption: true, description: 'Lock reason' }),
        async (argv) => {
          const args = argv as unknown as UserLockArgs;
          await withErrorHandling(async () => {
            if (args['dry-run']) { warn(`[DRY RUN] Would lock user ${args.id}`); return; }
            const confirmed = await confirm(`Lock user ${args.id}?`, args.force);
            if (!confirmed) { warn('Operation cancelled'); return; }
            await withBootstrap(args, async () => {
              const { lockUser } = await import('../../users/index.js');
              await lockUser(args.id, args.reason);
              success(`User locked: ${args.id}`);
            });
          }, args.verbose);
        },
      )

      // ── unlock ──────────────────────────────────────────────────────
      .command<UserIdArgs>(
        'unlock <id>',
        'Unlock a locked user account',
        (y) => y.positional('id', { type: 'string', demandOption: true, description: 'User UUID' }),
        async (argv) => {
          const args = argv as unknown as UserIdArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { unlockUser } = await import('../../users/index.js');
              await unlockUser(args.id);
              success(`User unlocked: ${args.id}`);
            });
          }, args.verbose);
        },
      )

      // ── set-password ────────────────────────────────────────────────
      .command<UserIdArgs>(
        'set-password <id>',
        'Set user password (interactive hidden prompt)',
        (y) => y.positional('id', { type: 'string', demandOption: true, description: 'User UUID' }),
        async (argv) => {
          const args = argv as unknown as UserIdArgs;
          await withErrorHandling(async () => {
            const confirmed = await confirm(`Set password for user ${args.id}?`, args.force);
            if (!confirmed) { warn('Operation cancelled'); return; }

            // Prompt for password with hidden input
            const password = await promptPassword('New password: ');
            if (!password) {
              warn('No password entered, operation cancelled');
              return;
            }

            await withBootstrap(args, async () => {
              const { setUserPassword } = await import('../../users/index.js');
              await setUserPassword(args.id, password);
              success(`Password set for user ${args.id}`);
            });
          }, args.verbose);
        },
      )

      // ── verify-email ────────────────────────────────────────────────
      .command<UserIdArgs>(
        'verify-email <id>',
        'Mark user email as verified',
        (y) => y.positional('id', { type: 'string', demandOption: true, description: 'User UUID' }),
        async (argv) => {
          const args = argv as unknown as UserIdArgs;
          await withErrorHandling(async () => {
            await withBootstrap(args, async () => {
              const { markEmailVerified } = await import('../../users/index.js');
              await markEmailVerified(args.id);
              success(`Email verified for user ${args.id}`);
            });
          }, args.verbose);
        },
      )

      // ── 2FA stubs (RD-12 not implemented) ───────────────────────────
      .command(twoFaCommand)

      // ── nested subcommand groups ────────────────────────────────────
      .command(userRoleCommand)
      .command(userClaimCommand)
      .demandCommand(1, 'Specify a user subcommand: create, invite, list, show, update, deactivate, reactivate, suspend, lock, unlock, set-password, verify-email, roles, claims, 2fa');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};

// ---------------------------------------------------------------------------
// 2FA stub commands (RD-12 not yet implemented)
// ---------------------------------------------------------------------------

/** The user 2fa subcommand group — stubs that return "not yet implemented" */
const twoFaCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: '2fa',
  describe: '2FA management (not yet implemented)',
  builder: (yargs) => {
    return yargs
      .command(
        'status <id>',
        'Check 2FA status',
        (y) => y.positional('id', { type: 'string', demandOption: true, description: 'User UUID or email' }),
        async () => {
          warn('⚠️  2FA management is not yet implemented. It will be available after RD-12 is complete.');
        },
      )
      .command(
        'disable <id>',
        'Disable 2FA',
        (y) => y.positional('id', { type: 'string', demandOption: true, description: 'User UUID or email' }),
        async () => {
          warn('⚠️  2FA management is not yet implemented. It will be available after RD-12 is complete.');
        },
      )
      .command(
        'reset <id>',
        'Reset 2FA',
        (y) => y.positional('id', { type: 'string', demandOption: true, description: 'User UUID or email' }),
        async () => {
          warn('⚠️  2FA management is not yet implemented. It will be available after RD-12 is complete.');
        },
      )
      .demandCommand(1, 'Specify a 2fa subcommand: status, disable, reset');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
