/**
 * CLI user management commands.
 *
 * Provides CRUD, status lifecycle, password management, and nested
 * role/claim subcommands for users within an organization.
 * All operations are org-scoped (require --org flag).
 *
 * Usage:
 *   porta user create --org <id> --email <email> [--name "..."] [--password "..."]
 *   porta user invite --org <id> --email <email> [--name "..."]
 *   porta user list --org <id> [--status active|invited|...] [--search "..."]
 *   porta user show --org <id> <user-id>
 *   porta user update --org <id> <user-id> [--name "..."] [--email "..."]
 *   porta user suspend/reactivate/lock/unlock/deactivate --org <id> <user-id>
 *   porta user set-password --org <id> <user-id> --password "..."
 *   porta user history --org <id> <user-id>
 *   porta user roles <subcommand> ...
 *   porta user claims <subcommand> ...
 *
 * @module commands/user
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';

import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import { printTable, printJson, success, warn, info, formatDate } from '../output.js';
import { confirm } from '../prompt.js';
import { userRolesCommand } from './user-role.js';
import { userClaimsCommand } from './user-claim.js';

// ---------------------------------------------------------------------------
// Argument type extensions
// ---------------------------------------------------------------------------

interface OrgScopedArgs extends GlobalOptions {
  org: string;
}

interface UserCreateArgs extends OrgScopedArgs {
  email: string;
  name?: string;
  password?: string;
}

interface UserInviteArgs extends OrgScopedArgs {
  email: string;
  name?: string;
}

interface UserListArgs extends OrgScopedArgs {
  status?: string;
  search?: string;
  page: number;
  'page-size': number;
}

interface UserIdArgs extends OrgScopedArgs {
  'user-id': string;
}

interface UserUpdateArgs extends UserIdArgs {
  name?: string;
  email?: string;
}

interface SetPasswordArgs extends UserIdArgs {
  password: string;
}

// ---------------------------------------------------------------------------
// Shared option builder for --org
// ---------------------------------------------------------------------------

function withOrgOption<T>(y: import('yargs').Argv<T>) {
  return y.option('org', {
    type: 'string' as const,
    demandOption: true,
    description: 'Organization UUID',
  });
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

/** The user command module — registered at the top level of the CLI */
export const userCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'user',
  describe: 'Manage users within an organization',
  builder: (yargs) => {
    return (
      yargs
        // ── create ──────────────────────────────────────────────────────
        .command<UserCreateArgs>(
          'create',
          'Create a new user',
          (y) =>
            withOrgOption(y)
              .option('email', {
                type: 'string',
                demandOption: true,
                description: 'User email address',
              })
              .option('name', {
                type: 'string',
                description: 'User display name',
              })
              .option('password', {
                type: 'string',
                description: 'Initial password (optional — passwordless if omitted)',
              }),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              const user = await sdkClient.users.create({
                organizationId: argv.org,
                email: argv.email,
                name: argv.name,
                password: argv.password,
              });

              if (argv.json) {
                printJson(user);
              } else {
                success(`User created: ${user.email}`);
                printTable(
                  ['Field', 'Value'],
                  [
                    ['ID', user.id],
                    ['Email', user.email],
                    ['Name', user.name ?? '—'],
                    ['Status', user.status],
                    ['Created', formatDate(user.createdAt)],
                  ],
                );
              }
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        // ── invite ──────────────────────────────────────────────────────
        .command<UserInviteArgs>(
          'invite',
          'Invite a user via email',
          (y) =>
            withOrgOption(y)
              .option('email', {
                type: 'string',
                demandOption: true,
                description: 'Email address to invite',
              })
              .option('name', {
                type: 'string',
                description: 'Invitee display name',
              }),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              const user = await sdkClient.users.invite({
                organizationId: argv.org,
                email: argv.email,
                name: argv.name,
              });

              if (argv.json) {
                printJson(user);
              } else {
                success(`Invitation sent to ${user.email}`);
              }
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        // ── list ────────────────────────────────────────────────────────
        .command<UserListArgs>(
          'list',
          'List users in an organization',
          (y) =>
            withOrgOption(y)
              .option('status', {
                type: 'string',
                choices: ['active', 'invited', 'suspended', 'locked', 'deactivated'],
                description: 'Filter by status',
              })
              .option('search', {
                type: 'string',
                description: 'Search by email or name',
              })
              .option('page', {
                type: 'number',
                default: 1,
                description: 'Page number',
              })
              .option('page-size', {
                type: 'number',
                default: 20,
                description: 'Items per page',
              }),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              const result = await sdkClient.users.list(argv.org, {
                page: argv.page,
                pageSize: argv['page-size'],
                ...(argv.status && {
                  status: argv.status as
                    | 'active'
                    | 'invited'
                    | 'suspended'
                    | 'locked'
                    | 'deactivated',
                }),
                ...(argv.search && { search: argv.search }),
              });

              if (result.data.length === 0) {
                warn('No users found');
                return;
              }

              if (argv.json) {
                printJson(result);
              } else {
                printTable(
                  ['ID', 'Email', 'Name', 'Status', 'Last Login', 'Created'],
                  result.data.map((u) => [
                    u.id,
                    u.email,
                    u.name ?? '—',
                    u.status,
                    u.lastLoginAt ? formatDate(u.lastLoginAt) : '—',
                    formatDate(u.createdAt),
                  ]),
                );
                info(`Total: ${result.total} users`);
              }
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        // ── show ────────────────────────────────────────────────────────
        .command<UserIdArgs>(
          'show <user-id>',
          'Show user details',
          (y) =>
            withOrgOption(
              y.positional('user-id', {
                type: 'string',
                demandOption: true,
                description: 'User UUID',
              }),
            ),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              const { data: u } = await sdkClient.users.get(argv.org, argv['user-id']);

              if (argv.json) {
                printJson(u);
              } else {
                printTable(
                  ['Field', 'Value'],
                  [
                    ['ID', u.id],
                    ['Email', u.email],
                    ['Name', u.name ?? '—'],
                    ['Status', u.status],
                    ['Email Verified', u.emailVerified ? 'Yes' : 'No'],
                    ['Has Password', u.hasPassword ? 'Yes' : 'No'],
                    ['Failed Logins', String(u.failedLoginCount)],
                    ['Last Login', u.lastLoginAt ? formatDate(u.lastLoginAt) : '—'],
                    ['Locked At', u.lockedAt ? formatDate(u.lockedAt) : '—'],
                    ['Created', formatDate(u.createdAt)],
                    ['Updated', formatDate(u.updatedAt)],
                  ],
                );
              }
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        // ── update ──────────────────────────────────────────────────────
        .command<UserUpdateArgs>(
          'update <user-id>',
          'Update user fields',
          (y) =>
            withOrgOption(
              y.positional('user-id', {
                type: 'string',
                demandOption: true,
                description: 'User UUID',
              }),
            )
              .option('name', {
                type: 'string',
                description: 'New display name',
              })
              .option('email', {
                type: 'string',
                description: 'New email address',
              }),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              const { etag } = await sdkClient.users.get(argv.org, argv['user-id']);

              const updated = await sdkClient.users.update(
                argv.org,
                argv['user-id'],
                {
                  name: argv.name,
                  email: argv.email,
                },
                etag ?? undefined,
              );

              if (argv.json) {
                printJson(updated);
              } else {
                success(`User updated: ${updated.email}`);
              }
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        // ── status lifecycle commands ───────────────────────────────────
        .command<UserIdArgs>(
          'suspend <user-id>',
          'Suspend a user',
          (y) =>
            withOrgOption(
              y.positional('user-id', {
                type: 'string',
                demandOption: true,
                description: 'User UUID',
              }),
            ),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              await sdkClient.users.suspend(argv.org, argv['user-id']);
              success(`User suspended: ${argv['user-id']}`);
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        .command<UserIdArgs>(
          'reactivate <user-id>',
          'Reactivate a suspended user',
          (y) =>
            withOrgOption(
              y.positional('user-id', {
                type: 'string',
                demandOption: true,
                description: 'User UUID',
              }),
            ),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              await sdkClient.users.reactivate(argv.org, argv['user-id']);
              success(`User reactivated: ${argv['user-id']}`);
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        .command<UserIdArgs>(
          'lock <user-id>',
          'Lock a user account',
          (y) =>
            withOrgOption(
              y.positional('user-id', {
                type: 'string',
                demandOption: true,
                description: 'User UUID',
              }),
            ),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              await sdkClient.users.lock(argv.org, argv['user-id']);
              success(`User locked: ${argv['user-id']}`);
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        .command<UserIdArgs>(
          'unlock <user-id>',
          'Unlock a locked user account',
          (y) =>
            withOrgOption(
              y.positional('user-id', {
                type: 'string',
                demandOption: true,
                description: 'User UUID',
              }),
            ),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              await sdkClient.users.unlock(argv.org, argv['user-id']);
              success(`User unlocked: ${argv['user-id']}`);
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        .command<UserIdArgs>(
          'deactivate <user-id>',
          'Deactivate a user (permanent)',
          (y) =>
            withOrgOption(
              y.positional('user-id', {
                type: 'string',
                demandOption: true,
                description: 'User UUID',
              }),
            ),
          async (argv) => {
            try {
              if (!argv.force) {
                const confirmed = await confirm(
                  `Deactivate user ${argv['user-id']}? This action is permanent.`,
                );
                if (!confirmed) {
                  warn('Operation cancelled');
                  return;
                }
              }

              const sdkClient = createClient(argv);
              await sdkClient.users.deactivate(argv.org, argv['user-id']);
              success(`User deactivated: ${argv['user-id']}`);
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        // ── set-password ────────────────────────────────────────────────
        .command<SetPasswordArgs>(
          'set-password <user-id>',
          'Set or reset a user password',
          (y) =>
            withOrgOption(
              y.positional('user-id', {
                type: 'string',
                demandOption: true,
                description: 'User UUID',
              }),
            ).option('password', {
              type: 'string',
              demandOption: true,
              description: 'New password',
            }),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              await sdkClient.users.setPassword(argv.org, argv['user-id'], {
                password: argv.password,
              });
              success(`Password set for user: ${argv['user-id']}`);
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        // ── history ─────────────────────────────────────────────────────
        .command<UserIdArgs>(
          'history <user-id>',
          'Show user change history',
          (y) =>
            withOrgOption(
              y.positional('user-id', {
                type: 'string',
                demandOption: true,
                description: 'User UUID',
              }),
            ),
          async (argv) => {
            try {
              const sdkClient = createClient(argv);
              const history = await sdkClient.users.getHistory(argv.org, argv['user-id']);

              if (history.length === 0) {
                warn('No history entries found');
                return;
              }

              if (argv.json) {
                printJson(history);
              } else {
                printTable(
                  ['Date', 'Action', 'Actor', 'Changes'],
                  history.map((h) => [
                    formatDate(h.createdAt),
                    h.action,
                    h.performedBy ?? '—',
                    h.changes ? JSON.stringify(h.changes) : '—',
                  ]),
                );
              }
            } catch (err) {
              handleError(err, argv.verbose);
            }
          },
        )

        // ── nested subcommand groups ────────────────────────────────────
        .command(userRolesCommand)
        .command(userClaimsCommand)
        .demandCommand(
          1,
          'Specify a user subcommand: create, invite, list, show, update, suspend, reactivate, lock, unlock, deactivate, set-password, history, roles, claims',
        )
    );
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
