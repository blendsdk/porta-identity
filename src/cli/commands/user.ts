/**
 * CLI user management commands.
 *
 * Provides CRUD, status lifecycle, password management, and email
 * verification for users. All operations use authenticated HTTP
 * requests against the Admin API.
 *
 * The user API is org-scoped (`/api/admin/organizations/:orgId/users`),
 * so --org is required for all subcommands.
 *
 * Nested subcommand groups handle role assignments, custom claims,
 * and 2FA (migrated separately in Phase 4.3).
 *
 * Usage:
 *   porta user create --org <org-id> --email "john@example.com" [--given-name "John"]
 *   porta user invite <id-or-email> --org <org-id>
 *   porta user list --org <org-id> [--status active|...] [--search <query>]
 *   porta user show <id-or-email> --org <org-id>
 *   porta user update <id> --org <org-id> --given-name "John"
 *   porta user deactivate <id> --org <org-id>
 *   porta user reactivate <id> --org <org-id>
 *   porta user suspend <id> --org <org-id>
 *   porta user lock <id> --org <org-id> --reason "Suspicious activity"
 *   porta user unlock <id> --org <org-id>
 *   porta user set-password <id> --org <org-id>
 *   porta user verify-email <id> --org <org-id>
 *   porta user roles <subcommand> ...
 *   porta user claims <subcommand> ...
 *   porta user 2fa <subcommand> ...
 *
 * @module cli/commands/user
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../index.js';
import type { AdminHttpClient } from '../http-client.js';

import { withHttpClient } from '../bootstrap.js';
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
import { userTwoFaCommand } from './user-2fa.js';
import * as readline from 'readline';

// ---------------------------------------------------------------------------
// API response types (JSON-serialized shapes from the Admin API)
// ---------------------------------------------------------------------------

/** User data as returned by the Admin API (dates are ISO strings) */
interface UserData {
  id: string;
  organizationId: string;
  email: string;
  emailVerified: boolean;
  givenName: string | null;
  familyName: string | null;
  status: string;
  hasPassword: boolean;
  loginCount: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Wrapped single-entity response: { data: UserData } */
interface UserResponse {
  data: UserData;
}

/** Paginated list response: { data: UserData[], total, page, pageSize } */
interface UserListResponse {
  data: UserData[];
  total: number;
  page: number;
  pageSize: number;
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

/** Base URL path for user endpoints under an organization */
function userBasePath(orgId: string): string {
  return `/api/admin/organizations/${orgId}/users`;
}

/**
 * Resolve a user by ID or email via the Admin API.
 *
 * UUID → GET /api/admin/organizations/:orgId/users/:userId
 * Email → GET /api/admin/organizations/:orgId/users?search=<email>&pageSize=10
 *         then find exact email match in results
 *
 * @param client - Authenticated HTTP client
 * @param orgId - Organization UUID (required for all user lookups)
 * @param idOrEmail - User UUID or email address
 * @returns User data from the API
 * @throws HttpNotFoundError if the user doesn't exist
 */
async function resolveUser(
  client: AdminHttpClient,
  orgId: string,
  idOrEmail: string,
): Promise<UserData> {
  if (isUuid(idOrEmail)) {
    // Direct lookup by UUID
    const resp = await client.get<UserResponse>(
      `${userBasePath(orgId)}/${idOrEmail}`,
    );
    return resp.data.data;
  }

  if (isEmail(idOrEmail)) {
    // Search by email — list endpoint with search filter
    const resp = await client.get<UserListResponse>(
      userBasePath(orgId),
      { search: idOrEmail, pageSize: '10' },
    );
    // Find exact email match (search may do partial matching)
    const user = resp.data.data.find(
      (u) => u.email.toLowerCase() === idOrEmail.toLowerCase(),
    );
    if (!user) {
      // Import the HTTP error to throw a consistent 404
      const { HttpNotFoundError } = await import('../http-client.js');
      throw new HttpNotFoundError(`User not found: ${idOrEmail}`);
    }
    return user;
  }

  // Neither UUID nor email — treat as invalid identifier
  const { HttpNotFoundError } = await import('../http-client.js');
  throw new HttpNotFoundError(`Invalid user identifier: ${idOrEmail}`);
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
  org: string;
}

interface UserIdArgs extends GlobalOptions {
  id: string;
  org: string;
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
            await withHttpClient(args, async (client) => {
              const resp = await client.post<UserResponse>(userBasePath(args.org), {
                email: args.email,
                givenName: args['given-name'],
                familyName: args['family-name'],
                password: args.passwordless ? undefined : args.password,
              });
              const user = resp.data.data;

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
            .option('org', { type: 'string', demandOption: true, description: 'Organization UUID' }),
        async (argv) => {
          const args = argv as unknown as UserIdOrEmailArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const user = await resolveUser(client, args.org, args['id-or-email']);

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
            await withHttpClient(args, async (client) => {
              const params: Record<string, string> = {
                page: String(args.page),
                pageSize: String(args['page-size']),
              };
              if (args.status) params.status = args.status;
              if (args.search) params.search = args.search;

              const resp = await client.get<UserListResponse>(
                userBasePath(args.org),
                params,
              );
              const result = resp.data;

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
            .option('org', { type: 'string', demandOption: true, description: 'Organization UUID' }),
        async (argv) => {
          const args = argv as unknown as UserIdOrEmailArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const user = await resolveUser(client, args.org, args['id-or-email']);

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
            .option('org', { type: 'string', demandOption: true, description: 'Organization UUID' })
            .option('given-name', { type: 'string', description: 'New first name' })
            .option('family-name', { type: 'string', description: 'New last name' })
            .option('email', { type: 'string', description: 'New email address' }),
        async (argv) => {
          const args = argv as unknown as UserUpdateArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const resp = await client.put<UserResponse>(
                `${userBasePath(args.org)}/${args.id}`,
                {
                  givenName: args['given-name'],
                  familyName: args['family-name'],
                  email: args.email,
                },
              );
              const updated = resp.data.data;

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
        (y) =>
          y
            .positional('id', { type: 'string', demandOption: true, description: 'User UUID' })
            .option('org', { type: 'string', demandOption: true, description: 'Organization UUID' }),
        async (argv) => {
          const args = argv as unknown as UserIdArgs;
          await withErrorHandling(async () => {
            if (args['dry-run']) { warn(`[DRY RUN] Would deactivate user ${args.id}`); return; }
            const confirmed = await confirm(`Deactivate user ${args.id}?`, args.force);
            if (!confirmed) { warn('Operation cancelled'); return; }
            await withHttpClient(args, async (client) => {
              await client.post(`${userBasePath(args.org)}/${args.id}/deactivate`);
              success(`User deactivated: ${args.id}`);
            });
          }, args.verbose);
        },
      )

      // ── reactivate ──────────────────────────────────────────────────
      .command<UserIdArgs>(
        'reactivate <id>',
        'Reactivate an inactive user',
        (y) =>
          y
            .positional('id', { type: 'string', demandOption: true, description: 'User UUID' })
            .option('org', { type: 'string', demandOption: true, description: 'Organization UUID' }),
        async (argv) => {
          const args = argv as unknown as UserIdArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              await client.post(`${userBasePath(args.org)}/${args.id}/reactivate`);
              success(`User reactivated: ${args.id}`);
            });
          }, args.verbose);
        },
      )

      // ── suspend ─────────────────────────────────────────────────────
      .command<UserIdArgs>(
        'suspend <id>',
        'Suspend a user',
        (y) =>
          y
            .positional('id', { type: 'string', demandOption: true, description: 'User UUID' })
            .option('org', { type: 'string', demandOption: true, description: 'Organization UUID' }),
        async (argv) => {
          const args = argv as unknown as UserIdArgs;
          await withErrorHandling(async () => {
            if (args['dry-run']) { warn(`[DRY RUN] Would suspend user ${args.id}`); return; }
            const confirmed = await confirm(`Suspend user ${args.id}?`, args.force);
            if (!confirmed) { warn('Operation cancelled'); return; }
            await withHttpClient(args, async (client) => {
              await client.post(`${userBasePath(args.org)}/${args.id}/suspend`);
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
            .option('org', { type: 'string', demandOption: true, description: 'Organization UUID' })
            .option('reason', { type: 'string', demandOption: true, description: 'Lock reason' }),
        async (argv) => {
          const args = argv as unknown as UserLockArgs;
          await withErrorHandling(async () => {
            if (args['dry-run']) { warn(`[DRY RUN] Would lock user ${args.id}`); return; }
            const confirmed = await confirm(`Lock user ${args.id}?`, args.force);
            if (!confirmed) { warn('Operation cancelled'); return; }
            await withHttpClient(args, async (client) => {
              await client.post(`${userBasePath(args.org)}/${args.id}/lock`, {
                reason: args.reason,
              });
              success(`User locked: ${args.id}`);
            });
          }, args.verbose);
        },
      )

      // ── unlock ──────────────────────────────────────────────────────
      .command<UserIdArgs>(
        'unlock <id>',
        'Unlock a locked user account',
        (y) =>
          y
            .positional('id', { type: 'string', demandOption: true, description: 'User UUID' })
            .option('org', { type: 'string', demandOption: true, description: 'Organization UUID' }),
        async (argv) => {
          const args = argv as unknown as UserIdArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              await client.post(`${userBasePath(args.org)}/${args.id}/unlock`);
              success(`User unlocked: ${args.id}`);
            });
          }, args.verbose);
        },
      )

      // ── set-password ────────────────────────────────────────────────
      .command<UserIdArgs>(
        'set-password <id>',
        'Set user password (interactive hidden prompt)',
        (y) =>
          y
            .positional('id', { type: 'string', demandOption: true, description: 'User UUID' })
            .option('org', { type: 'string', demandOption: true, description: 'Organization UUID' }),
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

            await withHttpClient(args, async (client) => {
              await client.post(`${userBasePath(args.org)}/${args.id}/password`, {
                password,
              });
              success(`Password set for user ${args.id}`);
            });
          }, args.verbose);
        },
      )

      // ── verify-email ────────────────────────────────────────────────
      .command<UserIdArgs>(
        'verify-email <id>',
        'Mark user email as verified',
        (y) =>
          y
            .positional('id', { type: 'string', demandOption: true, description: 'User UUID' })
            .option('org', { type: 'string', demandOption: true, description: 'Organization UUID' }),
        async (argv) => {
          const args = argv as unknown as UserIdArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              await client.post(`${userBasePath(args.org)}/${args.id}/verify-email`);
              success(`Email verified for user ${args.id}`);
            });
          }, args.verbose);
        },
      )

      // ── GDPR export (Article 20) ───────────────────────────────────
      .command<UserIdArgs>(
        'export <id>',
        'Export all user data (GDPR Article 20)',
        (y) =>
          y
            .positional('id', { type: 'string', demandOption: true, description: 'User UUID' })
            .option('org', { type: 'string', demandOption: true, description: 'Organization UUID' }),
        async (argv) => {
          const args = argv as unknown as UserIdArgs;
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              const { data } = await client.get<{ data: Record<string, unknown> }>(
                `${userBasePath(args.org)}/${args.id}/export`,
              );
              // Export always outputs JSON (structured data document)
              outputResult(true, () => {}, data.data);
            });
          }, args.verbose);
        },
      )

      // ── GDPR purge (Article 17) ────────────────────────────────────
      .command<UserIdArgs & { confirm: boolean }>(
        'purge <id>',
        'Irreversibly purge all user data (GDPR Article 17)',
        (y) =>
          y
            .positional('id', { type: 'string', demandOption: true, description: 'User UUID' })
            .option('org', { type: 'string', demandOption: true, description: 'Organization UUID' })
            .option('confirm', { type: 'boolean', default: false, description: 'Skip confirmation prompt' }),
        async (argv) => {
          const args = argv as unknown as UserIdArgs & { confirm: boolean };
          await withErrorHandling(async () => {
            await withHttpClient(args, async (client) => {
              // Require explicit confirmation — this is irreversible
              if (!args.confirm) {
                const yes = await confirm(
                  'This will PERMANENTLY delete all data for this user. This action is IRREVERSIBLE. Continue?',
                );
                if (!yes) {
                  warn('Purge cancelled');
                  return;
                }
              }

              const { data } = await client.post<{ data: Record<string, unknown> }>(
                `${userBasePath(args.org)}/${args.id}/purge`,
                { confirmPurge: true },
              );
              success(`User ${args.id} purged successfully`);
              outputResult(args.json, () => {
                const result = data.data as {
                  anonymizedEmail: string;
                  deletedRoles: number;
                  deletedClaims: number;
                  deletedOidcPayloads: number;
                  anonymizedAuditEntries: number;
                };
                printTable(
                  ['Field', 'Value'],
                  [
                    ['Anonymized email', result.anonymizedEmail],
                    ['Roles deleted', String(result.deletedRoles)],
                    ['Claims deleted', String(result.deletedClaims)],
                    ['OIDC sessions deleted', String(result.deletedOidcPayloads)],
                    ['Audit entries anonymized', String(result.anonymizedAuditEntries)],
                  ],
                );
              }, data.data);
            });
          }, args.verbose);
        },
      )

      // ── 2FA management (RD-12) ──────────────────────────────────────
      // Migrated to HTTP in Phase 4.3
      .command(userTwoFaCommand)

      // ── nested subcommand groups ────────────────────────────────────
      // Migrated to HTTP in Phase 4.3
      .command(userRoleCommand)
      .command(userClaimCommand)
      .demandCommand(1, 'Specify a user subcommand: create, invite, list, show, update, deactivate, reactivate, suspend, lock, unlock, set-password, verify-email, export, purge, roles, claims, 2fa');
  },
  handler: () => {
    // No-op — subcommands handle execution
  },
};
